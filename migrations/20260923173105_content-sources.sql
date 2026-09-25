-- ============================================================================
-- Learn From Content
-- ============================================================================
-- Turns text the learner already has — an article, a message, their own notes —
-- into a shortlist of words and phrases they can choose to keep.
--
-- Two design decisions worth stating:
--
--   1. Nothing enters the bank automatically. Detection produces *candidates*;
--      only an explicit learner choice materialises an `items` row. That is why
--      these are separate tables rather than rows pre-inserted into `items`.
--
--   2. Detection is deterministic and runs in the application, not through an
--      LLM. Measured vocabulary extraction needs to be reproducible and free;
--      the model is reserved for enrichment (a translation and a gloss for a word
--      the learner has already chosen). So the feature works completely with no
--      AI provider configured, and simply does not claim to translate.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Sources: the text the learner brought in
-- ----------------------------------------------------------------------------
CREATE TABLE public.content_sources (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language_code     text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  -- `text` is implemented. The others are modelled but rejected by the server
  -- with a clear message rather than silently accepted, so the UI can show a
  -- capability as unavailable instead of pretending.
  source_kind       text NOT NULL DEFAULT 'text'
                      CHECK (source_kind IN ('text', 'url', 'youtube', 'image', 'document')),
  title             text,
  -- The raw text. Capped so a pasted novel cannot bloat the table; the cap is
  -- enforced in the application with a readable error, not here with a 500.
  raw_text          text NOT NULL,
  char_count        integer NOT NULL DEFAULT 0 CHECK (char_count >= 0),
  -- Counts from the last analysis, denormalised for a cheap list read.
  token_count       integer NOT NULL DEFAULT 0 CHECK (token_count >= 0),
  candidate_count   integer NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  known_count       integer NOT NULL DEFAULT 0 CHECK (known_count >= 0),
  analyzed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- The source list is always "this learner's, newest first".
CREATE INDEX content_sources_user_idx
  ON public.content_sources (user_id, language_code, created_at DESC);

CREATE TRIGGER content_sources_touch_updated_at
  BEFORE UPDATE ON public.content_sources
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Candidates: one detected word or phrase, with what the learner decided
-- ----------------------------------------------------------------------------
CREATE TABLE public.content_candidates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         uuid NOT NULL REFERENCES public.content_sources(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language_code     text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  -- As it appeared, normalised for comparison but preserving accents.
  surface           text NOT NULL,
  -- Case-folded, unaccented form used for matching against known vocabulary.
  surface_key       text NOT NULL,
  lemma             text,
  kind              text NOT NULL DEFAULT 'word' CHECK (kind IN ('word', 'phrase')),
  part_of_speech    text,
  -- How many times it appeared in the source. The strongest available signal for
  -- "worth learning for this text".
  occurrences       integer NOT NULL DEFAULT 1 CHECK (occurrences > 0),
  -- The sentence it first appeared in, so the learner sees it in context.
  context_sentence  text,
  -- 0..1 ranking score, computed deterministically at analysis time.
  score             double precision NOT NULL DEFAULT 0 CHECK (score >= 0),
  -- Filled only by enrichment. Null means "not translated yet", never "".
  translation       text,
  gloss             text,
  translation_source text CHECK (translation_source IN ('ai', 'learner', 'dictionary')),
  enrichment_state  text NOT NULL DEFAULT 'pending'
                      CHECK (enrichment_state IN ('pending', 'enriched', 'unavailable', 'failed')),
  -- Set once the learner keeps it and an `items` row exists.
  saved_item_id     uuid REFERENCES public.items(id) ON DELETE SET NULL,
  saved_at          timestamptz,
  -- Dismissed candidates stay as rows so the same word is not offered again from
  -- the same source.
  dismissed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- One row per surface per source: re-analysing a source updates rather than
  -- appending duplicates.
  UNIQUE (source_id, surface_key)
);

CREATE INDEX content_candidates_source_idx
  ON public.content_candidates (source_id, score DESC, occurrences DESC);
-- The dedupe lookup: "has this learner already got this word?"
CREATE INDEX content_candidates_user_key_idx
  ON public.content_candidates (user_id, language_code, surface_key);
-- Candidates still awaiting a decision, for the review-later list.
CREATE INDEX content_candidates_open_idx
  ON public.content_candidates (user_id, language_code, created_at DESC)
  WHERE saved_at IS NULL AND dismissed_at IS NULL;

CREATE TRIGGER content_candidates_touch_updated_at
  BEFORE UPDATE ON public.content_candidates
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.content_sources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_candidates ENABLE ROW LEVEL SECURITY;

-- Bring-your-own-content is private. A pasted WhatsApp message must never be
-- readable by anyone else, and there is no sharing feature that would justify a
-- policy to the contrary.
CREATE POLICY content_sources_all_own ON public.content_sources
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY content_candidates_all_own ON public.content_candidates
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ----------------------------------------------------------------------------
-- Privileges
-- ----------------------------------------------------------------------------
-- REVOKE first: an additive grant would leave InsForge's broad default DML in
-- place, and `anon` must have no access to learner-supplied text at all.
REVOKE ALL ON public.content_sources, public.content_candidates FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_candidates TO authenticated;

-- ----------------------------------------------------------------------------
-- Promote a candidate into real vocabulary
-- ----------------------------------------------------------------------------
-- Runs in one transaction: create the `items` row, save it to the bank, enrol it
-- in review, and link the candidate to what it became.
--
-- Doing this as one function means "keep this word" cannot half-succeed — a
-- bank entry with no review row, or a candidate marked saved with no item, are
-- both states the UI cannot represent honestly.
--
-- Idempotent: keeping the same candidate twice returns the existing item instead
-- of creating a second one.
CREATE OR REPLACE FUNCTION public.keep_content_candidate(
  p_candidate_id uuid,
  p_translation  text,
  p_gloss        text DEFAULT NULL,
  p_translation_source text DEFAULT 'learner'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_candidate public.content_candidates;
  v_item_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'keep_content_candidate: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_candidate
  FROM public.content_candidates
  WHERE id = p_candidate_id AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'keep_content_candidate: candidate % not found', p_candidate_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Already kept: return what it became rather than making a duplicate.
  IF v_candidate.saved_item_id IS NOT NULL THEN
    RETURN v_candidate.saved_item_id;
  END IF;

  IF p_translation IS NULL OR btrim(p_translation) = '' THEN
    RAISE EXCEPTION 'keep_content_candidate: a translation is required'
      USING ERRCODE = '22023';
  END IF;

  -- Reuse an existing captured item with the same text, so keeping the same word
  -- from two different sources shares one card and one schedule.
  SELECT id INTO v_item_id
  FROM public.items
  WHERE owner_id = v_uid
    AND language_code = v_candidate.language_code
    AND kind = v_candidate.kind
    AND lower(surface) = lower(v_candidate.surface)
    AND lower(translation_natural) = lower(btrim(p_translation))
  LIMIT 1;

  IF v_item_id IS NULL THEN
    INSERT INTO public.items (
      language_code, kind, lemma, surface, translation_natural,
      grammar_note, part_of_speech, tags, topic, source, owner_id
    )
    VALUES (
      v_candidate.language_code,
      v_candidate.kind,
      v_candidate.lemma,
      v_candidate.surface,
      btrim(p_translation),
      p_gloss,
      v_candidate.part_of_speech,
      ARRAY['from-content'],
      'captured',
      'user_capture',
      v_uid
    )
    RETURNING id INTO v_item_id;
  END IF;

  INSERT INTO public.saved_items (user_id, item_id, language_code, saved_from)
  VALUES (v_uid, v_item_id, v_candidate.language_code, 'content:' || v_candidate.source_id::text)
  ON CONFLICT (user_id, item_id) DO NOTHING;

  INSERT INTO public.review_states (user_id, item_id, language_code, state)
  VALUES (v_uid, v_item_id, v_candidate.language_code, 'new')
  ON CONFLICT (user_id, item_id) DO NOTHING;

  UPDATE public.content_candidates
  SET saved_item_id = v_item_id,
      saved_at = now(),
      translation = btrim(p_translation),
      gloss = COALESCE(p_gloss, gloss),
      translation_source = p_translation_source,
      enrichment_state = 'enriched'
  WHERE id = p_candidate_id;

  RETURN v_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.keep_content_candidate(
  uuid, text, text, text
) TO authenticated;
