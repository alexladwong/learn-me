-- ============================================================================
-- AI tutor: conversations, turns and reports
-- ============================================================================
-- The tutor is the one feature whose substance depends on a model provider, and
-- this project has none — the InsForge organisation is on the free plan, so the
-- Model Gateway is unavailable.
--
-- That is precisely why the *data model* is worth building now rather than later.
-- The tables, the ownership rules and the scoring contract are provider-
-- independent: they describe what a conversation is, not who generates it. When a
-- provider is configured, the work that remains is one function that calls it.
--
-- Three decisions that shape the schema:
--
--   1. **A turn is stored, not a transcript blob.** `conversation_turns` rows make
--      "what did the learner actually produce" a query rather than a parse, which
--      is what `Practice My Mistakes` and the skill estimates both need.
--
--   2. **A report records coverage, not just a number.** Every skill score carries
--      a sample size, so the UI can refuse to show a percentage built on four
--      utterances — the same rule Language DNA follows.
--
--   3. **Mistakes are structured.** Each one names the correction and its type,
--      so it can become a drill or an SRS card rather than staying a sentence in
--      a report nobody re-reads.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Conversations
-- ----------------------------------------------------------------------------
CREATE TABLE public.conversations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language_code  text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  -- Which scenario the learner chose, and the level it was pitched at. Storing
  -- the level matters: a report read three months later should be interpretable
  -- against the level the learner had *then*.
  scenario_id    text NOT NULL,
  cefr_level     text CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'completed', 'abandoned', 'failed')),
  turn_count     integer NOT NULL DEFAULT 0 CHECK (turn_count >= 0),
  -- Seconds of learner speaking time, when audio is ever wired up. Null means
  -- "not measured", which is different from zero.
  speaking_seconds integer CHECK (speaking_seconds IS NULL OR speaking_seconds >= 0),
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- The conversation list is always "mine, newest first".
CREATE INDEX conversations_user_idx
  ON public.conversations (user_id, language_code, started_at DESC);

-- For resuming: at most a handful of active conversations should ever exist, but
-- finding them must not scan the history.
CREATE INDEX conversations_active_idx
  ON public.conversations (user_id, language_code, started_at DESC)
  WHERE status = 'active';

CREATE TRIGGER conversations_touch_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Turns
-- ----------------------------------------------------------------------------
CREATE TABLE public.conversation_turns (
  id              bigserial PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  turn_index      integer NOT NULL CHECK (turn_index >= 0),
  role            text NOT NULL CHECK (role IN ('tutor', 'learner', 'system')),
  content         text NOT NULL,
  -- Storage key and url for a recorded utterance. Null in this build: no audio
  -- provider is connected, and a null is honest where an empty string is not.
  audio_key       text,
  audio_url       text,
  -- Corrections the tutor attached to this turn, as a jsonb array of
  -- { kind, original, correction, explanation }. Kept on the turn so a mistake
  -- stays attached to the utterance that produced it.
  corrections     jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Null when the turn was not scored, which is the normal case in this build.
  is_correct      boolean,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, turn_index)
);

CREATE INDEX conversation_turns_conversation_idx
  ON public.conversation_turns (conversation_id, turn_index);
-- "Everything this learner has said", for reports and skill estimates.
CREATE INDEX conversation_turns_learner_idx
  ON public.conversation_turns (user_id, created_at DESC)
  WHERE role = 'learner';

-- Keep `conversations.turn_count` honest without trusting the client. The trigger
-- is the only writer, and a client cannot set the column directly because
-- `conversations` grants UPDATE on a narrow column list (see below).
CREATE OR REPLACE FUNCTION public.tg_conversation_turn_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.conversations
    SET turn_count = turn_count + 1
    WHERE id = NEW.conversation_id;
    RETURN NEW;
  END IF;

  UPDATE public.conversations
  SET turn_count = greatest(0, turn_count - 1)
  WHERE id = OLD.conversation_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER conversation_turns_count
  AFTER INSERT OR DELETE ON public.conversation_turns
  FOR EACH ROW EXECUTE FUNCTION public.tg_conversation_turn_count();

-- ----------------------------------------------------------------------------
-- Reports
-- ----------------------------------------------------------------------------
CREATE TABLE public.conversation_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language_code     text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  -- 0..1, each nullable. A skill with too little evidence is null rather than a
  -- neutral 0.5, so the UI can withhold it instead of inventing a score.
  grammar_score     double precision CHECK (grammar_score IS NULL OR grammar_score BETWEEN 0 AND 1),
  vocabulary_score  double precision CHECK (vocabulary_score IS NULL OR vocabulary_score BETWEEN 0 AND 1),
  fluency_score     double precision CHECK (fluency_score IS NULL OR fluency_score BETWEEN 0 AND 1),
  pronunciation_score double precision CHECK (pronunciation_score IS NULL OR pronunciation_score BETWEEN 0 AND 1),
  -- How many learner utterances each score was computed from. A percentage
  -- without this is a claim nobody can check.
  grammar_samples   integer NOT NULL DEFAULT 0 CHECK (grammar_samples >= 0),
  vocabulary_samples integer NOT NULL DEFAULT 0 CHECK (vocabulary_samples >= 0),
  fluency_samples   integer NOT NULL DEFAULT 0 CHECK (fluency_samples >= 0),
  -- [{ kind, original, correction, explanation }]
  mistakes          jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{ surface, translation, context }]
  new_words         jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{ pattern, example }]
  grammar_patterns  jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary           text,
  -- Which model produced it, so a report is attributable when models change.
  model             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX conversation_reports_user_idx
  ON public.conversation_reports (user_id, language_code, created_at DESC);

CREATE TRIGGER conversation_reports_touch_updated_at
  BEFORE UPDATE ON public.conversation_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.conversations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_turns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_reports  ENABLE ROW LEVEL SECURITY;

-- A conversation is as private as a pasted message. A learner practising a job
-- interview must not have it readable by anyone else.
CREATE POLICY conversations_all_own ON public.conversations
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY conversation_turns_all_own ON public.conversation_turns
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY conversation_reports_select_own ON public.conversation_reports
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Only the server writes a report, and only after a conversation ends: a learner
-- scoring their own conversation would make the number meaningless.
CREATE POLICY conversation_reports_insert_own ON public.conversation_reports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ----------------------------------------------------------------------------
-- Privileges
-- ----------------------------------------------------------------------------
-- Column-level UPDATE on `conversations`: a learner may end their own
-- conversation and record speaking time, but `turn_count` is trigger-maintained
-- and `status` transitions are the server's call. This mirrors the entitlements
-- lesson — RLS filters rows, not columns.
REVOKE ALL ON public.conversations FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.conversations TO authenticated;
GRANT UPDATE (status, ended_at, speaking_seconds) ON public.conversations TO authenticated;

REVOKE ALL ON public.conversation_turns FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.conversation_turns TO authenticated;

REVOKE ALL ON public.conversation_reports FROM anon, authenticated;
GRANT SELECT, INSERT ON public.conversation_reports TO authenticated;

-- Keep `turn_count` server-maintained even if a grant is widened later.
CREATE OR REPLACE FUNCTION public.tg_conversations_guard_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_user IN ('project_admin', 'service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF NEW.turn_count IS DISTINCT FROM OLD.turn_count THEN
    RAISE EXCEPTION 'conversations.turn_count is server-maintained'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'conversations.user_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER conversations_guard_count
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_conversations_guard_count();
