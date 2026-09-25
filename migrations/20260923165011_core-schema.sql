-- ============================================================================
-- learn-me — core schema
-- ============================================================================
-- Foundations for the core loop:
--   Onboarding -> Guided Path -> Lesson -> Sentence Practice -> SRS -> Progress
--
-- Design rules enforced here:
--   1. Languages are database-driven, never hardcoded in the app.
--   2. Words and sentences are ONE table (`items`) discriminated by `kind`,
--      so there is exactly one SRS engine and one confusion engine.
--   3. Events are append-only; every rollup is derived and rebuildable.
--   4. Every user-owned table is protected by RLS *and* explicit grants.
--   5. Curriculum content (owner_id IS NULL) is world-readable, never
--      world-writable.
-- ============================================================================

-- pgvector powers semantic dedupe and "related vocabulary" on items.
CREATE EXTENSION IF NOT EXISTS vector;

-- ----------------------------------------------------------------------------
-- Shared helpers
-- ----------------------------------------------------------------------------

-- Keep `updated_at` honest without trusting the client.
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Reference data: languages
-- ----------------------------------------------------------------------------
-- Written so a non-Latin, right-to-left, or audio-poor language is a data row
-- rather than a code change. Note `supports_*` / `supports_audio`: the UI must
-- present a capability as unavailable rather than simulate a result.
CREATE TABLE public.languages (
  code                    text PRIMARY KEY CHECK (code ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  name_en                 text NOT NULL,
  name_native             text NOT NULL,
  flag_emoji              text,
  direction               text NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr', 'rtl')),
  script                  text,
  supports_cefr           boolean NOT NULL DEFAULT true,
  supports_audio          boolean NOT NULL DEFAULT false,
  supports_asr            boolean NOT NULL DEFAULT false,
  supports_pronunciation  boolean NOT NULL DEFAULT false,
  is_available            boolean NOT NULL DEFAULT false,
  is_rtl                  boolean GENERATED ALWAYS AS (direction = 'rtl') STORED,
  sort_order              integer NOT NULL DEFAULT 100,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX languages_available_idx ON public.languages (is_available, sort_order);

CREATE TRIGGER languages_touch_updated_at
  BEFORE UPDATE ON public.languages
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Learner identity
-- ----------------------------------------------------------------------------
-- Mirrors auth.users. Created automatically by trigger so app code never races
-- the first page render after signup.
CREATE TABLE public.profiles (
  id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name      text,
  avatar_url        text,
  timezone          text,
  ui_locale         text NOT NULL DEFAULT 'en',
  native_language   text REFERENCES public.languages(code) ON DELETE SET NULL,
  onboarding_state  text NOT NULL DEFAULT 'pending'
                      CHECK (onboarding_state IN ('pending', 'in_progress', 'complete')),
  onboarding_step   integer NOT NULL DEFAULT 0,
  onboarded_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_onboarding_idx ON public.profiles (onboarding_state);

CREATE TRIGGER profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Auto-provision a profile for every new auth user.
CREATE OR REPLACE FUNCTION public.tg_create_profile_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.profile ->> 'name', ''),
      NULLIF(NEW.profile ->> 'full_name', ''),
      split_part(COALESCE(NEW.email, ''), '@', 1)
    ),
    NULLIF(NEW.profile ->> 'avatar_url', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_profile_for_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.tg_create_profile_for_new_user();

-- ----------------------------------------------------------------------------
-- The learner's relationship with a language
-- ----------------------------------------------------------------------------
-- Deliberately NOT on `profiles`: level, goal and daily budget are per-language.
-- A learner is B1 in Spanish and A1 in Japanese with two separate plans.
CREATE TABLE public.learner_languages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language_code     text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  is_active         boolean NOT NULL DEFAULT true,
  is_primary        boolean NOT NULL DEFAULT false,
  motivation        text[] NOT NULL DEFAULT '{}',
  -- Nullable because a learner may skip placement.
  cefr_level        text CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  cefr_goal         text CHECK (cefr_goal IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  daily_minutes     integer NOT NULL DEFAULT 10 CHECK (daily_minutes BETWEEN 5 AND 120),
  skill_priorities  text[] NOT NULL DEFAULT '{}',
  -- Learners pick a preferred way to study from day one.
  preferred_modes   text[] NOT NULL DEFAULT '{}',
  started_at        timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, language_code)
);

CREATE INDEX learner_languages_user_idx ON public.learner_languages (user_id, is_active);
-- At most one primary language per learner.
CREATE UNIQUE INDEX learner_languages_one_primary_idx
  ON public.learner_languages (user_id)
  WHERE is_primary;

CREATE TRIGGER learner_languages_touch_updated_at
  BEFORE UPDATE ON public.learner_languages
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Curriculum: track -> unit -> mission -> step, all referencing items
-- ----------------------------------------------------------------------------
CREATE TABLE public.tracks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  language_code text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  slug          text NOT NULL,
  title         text NOT NULL,
  description   text,
  icon          text NOT NULL DEFAULT 'compass',
  -- CEFR band the track is authored for, when the language supports CEFR.
  cefr_band     text CHECK (cefr_band IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  order_index   integer NOT NULL DEFAULT 0,
  is_published  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (language_code, slug)
);

CREATE INDEX tracks_language_order_idx
  ON public.tracks (language_code, is_published, order_index);

CREATE TRIGGER tracks_touch_updated_at
  BEFORE UPDATE ON public.tracks
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- A unit is the "island" a learner sees on the path.
CREATE TABLE public.units (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id      uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  language_code text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  slug          text NOT NULL,
  title         text NOT NULL,
  description   text,
  cefr_level    text CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  order_index   integer NOT NULL DEFAULT 0,
  is_published  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (track_id, slug)
);

CREATE INDEX units_track_order_idx ON public.units (track_id, is_published, order_index);
CREATE INDEX units_language_idx ON public.units (language_code);

CREATE TRIGGER units_touch_updated_at
  BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- A mission is one sitting: what the lesson player plays top to bottom.
CREATE TABLE public.missions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id           uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  language_code     text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  slug              text NOT NULL,
  title             text NOT NULL,
  description       text,
  order_index       integer NOT NULL DEFAULT 0,
  estimated_minutes integer NOT NULL DEFAULT 8 CHECK (estimated_minutes BETWEEN 1 AND 120),
  is_published      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, slug)
);

CREATE INDEX missions_unit_order_idx ON public.missions (unit_id, is_published, order_index);
CREATE INDEX missions_language_idx ON public.missions (language_code);

CREATE TRIGGER missions_touch_updated_at
  BEFORE UPDATE ON public.missions
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- The single content entity: words, phrases, sentences
-- ----------------------------------------------------------------------------
-- `kind` discriminates; everything downstream (SRS, confusion pairs, the
-- sentence bank, the word bank) operates on this one table.
CREATE TABLE public.items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  language_code       text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  kind                text NOT NULL DEFAULT 'word'
                        CHECK (kind IN ('word', 'phrase', 'sentence', 'grammar_point')),
  -- Dictionary form when it differs from the surface form shown.
  lemma               text,
  surface             text NOT NULL,
  translation_literal text,
  translation_natural text NOT NULL,
  grammar_note        text,
  -- [{ token, lemma, gloss, pos }]
  vocab_breakdown     jsonb NOT NULL DEFAULT '[]'::jsonb,
  part_of_speech      text,
  ipa                 text,
  difficulty          text CHECK (difficulty IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  tags                text[] NOT NULL DEFAULT '{}',
  topic               text,
  -- Store the storage KEY (for delete/re-sign) and the URL (for playback).
  audio_normal_key    text,
  audio_normal_url    text,
  audio_slow_key      text,
  audio_slow_url      text,
  phoneme_hint        text,
  source              text NOT NULL DEFAULT 'curriculum'
                        CHECK (source IN ('curriculum', 'user_capture', 'ai_generated')),
  -- NULL owner == shared curriculum content, readable by everyone.
  owner_id            uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Set when an item is retired; items are never deleted, review history
  -- points at them forever.
  retired_at          timestamptz,
  embedding           vector(1536),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Prevents the same phrase arriving twice from two capture sources.
-- Partial indexes keep curriculum and per-user content in separate namespaces.
CREATE UNIQUE INDEX items_curriculum_unique_idx
  ON public.items (language_code, kind, lower(surface), lower(translation_natural))
  WHERE owner_id IS NULL;
CREATE UNIQUE INDEX items_owned_unique_idx
  ON public.items (owner_id, language_code, kind, lower(surface), lower(translation_natural))
  WHERE owner_id IS NOT NULL;

CREATE INDEX items_language_kind_idx ON public.items (language_code, kind) WHERE retired_at IS NULL;
CREATE INDEX items_owner_idx ON public.items (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX items_tags_idx ON public.items USING gin (tags);

CREATE TRIGGER items_touch_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Guard: an item's owner and language are immutable.
CREATE OR REPLACE FUNCTION public.tg_items_guard_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'items.owner_id is immutable';
  END IF;
  IF NEW.language_code IS DISTINCT FROM OLD.language_code THEN
    RAISE EXCEPTION 'items.language_code is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_guard_immutable
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.tg_items_guard_immutable();

-- An exercise step inside a mission.
CREATE TABLE public.steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id    uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  language_code text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  step_type     text NOT NULL
                  CHECK (step_type IN (
                    'teach',      -- introduce the item
                    'recognise',  -- pick the meaning
                    'recall',     -- produce the target language (active recall)
                    'listen',     -- audio -> meaning
                    'speak',      -- microphone practice
                    'match',      -- pair items
                    'arrange',    -- build a sentence from tokens
                    'translate',  -- either direction
                    'checkpoint'  -- end-of-mission check
                  )),
  item_id       uuid REFERENCES public.items(id) ON DELETE CASCADE,
  prompt        text,
  -- Step-type specific payload validated by the server before insert.
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_index   integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX steps_mission_order_idx ON public.steps (mission_id, order_index);
CREATE INDEX steps_item_idx ON public.steps (item_id);

CREATE TRIGGER steps_touch_updated_at
  BEFORE UPDATE ON public.steps
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Spaced repetition memory
-- ----------------------------------------------------------------------------
-- One row per (learner, item). FSRS-5 state: `stability` and `difficulty` are
-- the algorithm's own parameters, not invented scores.
CREATE TABLE public.review_states (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id            uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  language_code      text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  state              text NOT NULL DEFAULT 'new'
                       CHECK (state IN ('new', 'learning', 'review', 'relearning', 'suspended')),
  -- FSRS: days until recall probability decays to the target retention.
  stability          double precision NOT NULL DEFAULT 0 CHECK (stability >= 0),
  -- FSRS: intrinsic difficulty of this item for this learner (1..10).
  difficulty         double precision NOT NULL DEFAULT 0 CHECK (difficulty BETWEEN 0 AND 10),
  due_at             timestamptz NOT NULL DEFAULT now(),
  first_learned_at   timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at   timestamptz,
  reps               integer NOT NULL DEFAULT 0 CHECK (reps >= 0),
  successful_reviews integer NOT NULL DEFAULT 0 CHECK (successful_reviews >= 0),
  lapses             integer NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  streak_correct     integer NOT NULL DEFAULT 0 CHECK (streak_correct >= 0),
  last_rating        text CHECK (last_rating IN ('again', 'hard', 'good', 'easy')),
  -- Denormalised for a cheap "mastered" count; rebuildable from review_events.
  mastery            double precision NOT NULL DEFAULT 0 CHECK (mastery BETWEEN 0 AND 1),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

-- The hot query: "what is due for this learner in this language, soonest first".
CREATE INDEX review_states_due_idx
  ON public.review_states (user_id, language_code, due_at)
  WHERE state <> 'suspended';
CREATE INDEX review_states_item_idx ON public.review_states (item_id);

CREATE TRIGGER review_states_touch_updated_at
  BEFORE UPDATE ON public.review_states
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Append-only history. Never UPDATEd or DELETEd by the app.
CREATE TABLE public.review_events (
  id                bigserial PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id           uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  language_code     text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  rating            text NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
  mode              text NOT NULL DEFAULT 'review',
  -- Scheduler snapshot, so history stays interpretable after a tuning change.
  state_before      text,
  stability_before  double precision,
  difficulty_before double precision,
  interval_days     double precision,
  elapsed_days      double precision,
  latency_ms        integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX review_events_user_created_idx
  ON public.review_events (user_id, created_at DESC);
CREATE INDEX review_events_user_item_idx
  ON public.review_events (user_id, item_id, created_at DESC);

-- Every answered exercise, right or wrong. This is the raw material for the
-- error-fingerprint / confusion-pair engine that makes the product different.
CREATE TABLE public.practice_events (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language_code text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  item_id       uuid REFERENCES public.items(id) ON DELETE SET NULL,
  mode          text NOT NULL
                  CHECK (mode IN ('teach', 'recognise', 'recall', 'listen', 'speak',
                                  'match', 'arrange', 'translate', 'checkpoint', 'conversation')),
  is_correct    boolean NOT NULL,
  expected      text,
  produced      text,
  error_type    text CHECK (error_type IS NULL OR error_type IN (
                  'conjugation', 'gender', 'word_order', 'vocabulary', 'tense',
                  'preposition', 'pronunciation', 'spelling', 'register', 'none')),
  -- Normalised pair key, e.g. 'conjugation:comer:1s:2s'. Indexed for grouping.
  fingerprint   text,
  latency_ms    integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  context       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX practice_events_user_created_idx
  ON public.practice_events (user_id, created_at DESC);
CREATE INDEX practice_events_fingerprint_idx
  ON public.practice_events (user_id, language_code, fingerprint, created_at DESC)
  WHERE fingerprint IS NOT NULL;
CREATE INDEX practice_events_incorrect_idx
  ON public.practice_events (user_id, language_code, created_at DESC)
  WHERE NOT is_correct;

-- Derived from practice_events. A pair with enough occurrences becomes an
-- auto-generated drill on the learner's path.
CREATE TABLE public.confusion_pairs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language_code text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  a_item_id     uuid REFERENCES public.items(id) ON DELETE CASCADE,
  b_item_id     uuid REFERENCES public.items(id) ON DELETE CASCADE,
  a_label       text NOT NULL,
  b_label       text NOT NULL,
  error_type    text NOT NULL,
  fingerprint   text NOT NULL,
  occurrences   integer NOT NULL DEFAULT 1 CHECK (occurrences > 0),
  mastery       double precision NOT NULL DEFAULT 0 CHECK (mastery BETWEEN 0 AND 1),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  dismissed_at  timestamptz,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fingerprint)
);

CREATE INDEX confusion_pairs_active_idx
  ON public.confusion_pairs (user_id, language_code, occurrences DESC)
  WHERE dismissed_at IS NULL AND resolved_at IS NULL;

CREATE TRIGGER confusion_pairs_touch_updated_at
  BEFORE UPDATE ON public.confusion_pairs
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- The learner's personal banks
-- ----------------------------------------------------------------------------
-- Saving an item to the sentence/word bank is also what enrols it in SRS.
CREATE TABLE public.saved_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  language_code text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  -- Where this came from: 'manual' | 'lesson' | 'content' | 'conversation' ...
  saved_from    text NOT NULL DEFAULT 'manual',
  -- The learner's own note, e.g. why it matters to them.
  personal_note text,
  is_favorite   boolean NOT NULL DEFAULT false,
  archived_at   timestamptz,
  saved_at      timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

-- Keyset-pagination index for the bank list (never offset-paginate a big table).
CREATE INDEX saved_items_bank_idx
  ON public.saved_items (user_id, language_code, saved_at DESC, id)
  WHERE archived_at IS NULL;
CREATE INDEX saved_items_favorite_idx
  ON public.saved_items (user_id, language_code)
  WHERE is_favorite AND archived_at IS NULL;

CREATE TRIGGER saved_items_touch_updated_at
  BEFORE UPDATE ON public.saved_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Rollups (derived, rebuildable — never the source of truth)
-- ----------------------------------------------------------------------------
CREATE TABLE public.user_stats (
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language_code      text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  words_learned      integer NOT NULL DEFAULT 0 CHECK (words_learned >= 0),
  sentences_mastered integer NOT NULL DEFAULT 0 CHECK (sentences_mastered >= 0),
  review_cards_due   integer NOT NULL DEFAULT 0 CHECK (review_cards_due >= 0),
  listening_seconds  integer NOT NULL DEFAULT 0 CHECK (listening_seconds >= 0),
  speaking_seconds   integer NOT NULL DEFAULT 0 CHECK (speaking_seconds >= 0),
  total_reviews      integer NOT NULL DEFAULT 0 CHECK (total_reviews >= 0),
  total_correct      integer NOT NULL DEFAULT 0 CHECK (total_correct >= 0),
  streak_current     integer NOT NULL DEFAULT 0 CHECK (streak_current >= 0),
  streak_longest     integer NOT NULL DEFAULT 0 CHECK (streak_longest >= 0),
  last_active_date   date,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, language_code)
);

CREATE INDEX user_stats_due_idx ON public.user_stats (user_id, review_cards_due DESC);

CREATE TRIGGER user_stats_touch_updated_at
  BEFORE UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- One row per learner per day. Powers streaks, the heatmap and weekly reports.
CREATE TABLE public.daily_activity (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language_code     text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  activity_date     date NOT NULL,
  minutes           integer NOT NULL DEFAULT 0 CHECK (minutes >= 0),
  reviews           integer NOT NULL DEFAULT 0 CHECK (reviews >= 0),
  reviews_correct   integer NOT NULL DEFAULT 0 CHECK (reviews_correct >= 0),
  new_items         integer NOT NULL DEFAULT 0 CHECK (new_items >= 0),
  listening_seconds integer NOT NULL DEFAULT 0 CHECK (listening_seconds >= 0),
  speaking_seconds  integer NOT NULL DEFAULT 0 CHECK (speaking_seconds >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, language_code, activity_date)
);

CREATE INDEX daily_activity_range_idx
  ON public.daily_activity (user_id, language_code, activity_date DESC);

CREATE TRIGGER daily_activity_touch_updated_at
  BEFORE UPDATE ON public.daily_activity
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Entitlements: the only source of truth for what a learner may do
-- ----------------------------------------------------------------------------
-- Feature gating reads this table server-side. Never infer premium from a
-- client flag.
CREATE TABLE public.entitlements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature      text NOT NULL,
  -- NULL limit == unlimited.
  quota_limit  integer CHECK (quota_limit IS NULL OR quota_limit >= 0),
  quota_used   integer NOT NULL DEFAULT 0 CHECK (quota_used >= 0),
  period_start timestamptz NOT NULL DEFAULT now(),
  period_end   timestamptz,
  source       text NOT NULL DEFAULT 'free'
                 CHECK (source IN ('free', 'trial', 'subscription', 'grant')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, feature)
);

CREATE INDEX entitlements_user_idx ON public.entitlements (user_id);

CREATE TRIGGER entitlements_touch_updated_at
  BEFORE UPDATE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Server-authoritative scheduling
-- ----------------------------------------------------------------------------
-- `apply_review` is the ONLY sanctioned way to move a card's schedule. Keeping
-- it in the database means the schedule cannot be corrupted by a client clock,
-- an offline replay, or a second device.
--
-- The FSRS-5 update rule itself lives in application code (pure + unit tested);
-- this function owns atomicity, the append-only event, and the rollups.
CREATE OR REPLACE FUNCTION public.apply_review(
  p_user_id        uuid,
  p_item_id        uuid,
  p_language_code  text,
  p_rating         text,
  p_next_due_at    timestamptz,
  p_stability      double precision,
  p_difficulty     double precision,
  p_state          text,
  p_mastery        double precision,
  p_interval_days  double precision DEFAULT NULL,
  p_elapsed_days   double precision DEFAULT NULL,
  p_latency_ms     integer DEFAULT NULL,
  p_mode           text DEFAULT 'review'
)
RETURNS public.review_states
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_prev    public.review_states;
  v_row     public.review_states;
  v_correct boolean;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'apply_review: user mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_rating NOT IN ('again', 'hard', 'good', 'easy') THEN
    RAISE EXCEPTION 'apply_review: invalid rating %', p_rating USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_prev
  FROM public.review_states
  WHERE user_id = p_user_id AND item_id = p_item_id
  FOR UPDATE;

  v_correct := p_rating <> 'again';

  INSERT INTO public.review_events (
    user_id, item_id, language_code, rating, mode,
    state_before, stability_before, difficulty_before,
    interval_days, elapsed_days, latency_ms
  )
  VALUES (
    p_user_id, p_item_id, p_language_code, p_rating, p_mode,
    v_prev.state, v_prev.stability, v_prev.difficulty,
    p_interval_days, p_elapsed_days, p_latency_ms
  );

  INSERT INTO public.review_states AS rs (
    user_id, item_id, language_code, state, stability, difficulty, due_at,
    last_reviewed_at, reps, successful_reviews, lapses, streak_correct,
    last_rating, mastery
  )
  VALUES (
    p_user_id, p_item_id, p_language_code,
    COALESCE(p_state, 'review'),
    COALESCE(p_stability, 0),
    COALESCE(p_difficulty, 0),
    COALESCE(p_next_due_at, now()),
    now(),
    1,
    CASE WHEN v_correct THEN 1 ELSE 0 END,
    CASE WHEN v_correct THEN 0 ELSE 1 END,
    CASE WHEN v_correct THEN 1 ELSE 0 END,
    p_rating,
    COALESCE(p_mastery, 0)
  )
  ON CONFLICT (user_id, item_id) DO UPDATE SET
    state              = EXCLUDED.state,
    stability          = EXCLUDED.stability,
    difficulty         = EXCLUDED.difficulty,
    due_at             = EXCLUDED.due_at,
    last_reviewed_at   = now(),
    reps               = rs.reps + 1,
    successful_reviews = rs.successful_reviews + CASE WHEN v_correct THEN 1 ELSE 0 END,
    lapses             = rs.lapses + CASE WHEN v_correct THEN 0 ELSE 1 END,
    streak_correct     = CASE WHEN v_correct THEN rs.streak_correct + 1 ELSE 0 END,
    last_rating        = EXCLUDED.last_rating,
    mastery            = EXCLUDED.mastery
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Refresh the due-card rollup for one learner/language. Called after a review
-- batch rather than after every single card, so a 20-card session is one write.
CREATE OR REPLACE FUNCTION public.refresh_review_cards_due(
  p_user_id       uuid,
  p_language_code text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_due integer;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'refresh_review_cards_due: user mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_due
  FROM public.review_states
  WHERE user_id = p_user_id
    AND language_code = p_language_code
    AND state <> 'suspended'
    AND due_at <= now();

  INSERT INTO public.user_stats AS us (user_id, language_code, review_cards_due)
  VALUES (p_user_id, p_language_code, v_due)
  ON CONFLICT (user_id, language_code) DO UPDATE
    SET review_cards_due = v_due;

  RETURN v_due;
END;
$$;

-- Convenience wrapper with no arguments: resolves the learner from the session
-- and refreshes every active language.
--
-- The zero-argument form matters because PostgREST exposes a function's
-- parameters as its call contract. With no parameter there is nothing to point
-- at another user, so a signed-in learner can refresh their own counts and
-- nobody else's.
CREATE OR REPLACE FUNCTION public.refresh_review_cards_due()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_primary text;
  v_total   integer := 0;
  v_lang    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'refresh_review_cards_due: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT language_code INTO v_primary
  FROM public.learner_languages
  WHERE user_id = v_uid AND is_active
  ORDER BY is_primary DESC, started_at ASC
  LIMIT 1;

  -- Ensure a stats row exists for every active language before counting.
  INSERT INTO public.user_stats (user_id, language_code)
  SELECT v_uid, ll.language_code
  FROM public.learner_languages ll
  WHERE ll.user_id = v_uid AND ll.is_active
  ON CONFLICT (user_id, language_code) DO NOTHING;

  FOR v_lang IN
    SELECT language_code FROM public.learner_languages
    WHERE user_id = v_uid AND is_active
  LOOP
    IF v_lang = v_primary THEN
      v_total := public.refresh_review_cards_due(v_uid, v_lang);
    ELSE
      PERFORM public.refresh_review_cards_due(v_uid, v_lang);
    END IF;
  END LOOP;

  RETURN v_total;
END;
$$;

-- Track a learner's active days so streaks are a read, not a recomputation.
CREATE OR REPLACE FUNCTION public.tg_touch_daily_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  INSERT INTO public.daily_activity AS da (user_id, language_code, activity_date, reviews)
  VALUES (NEW.user_id, NEW.language_code, v_today, 1)
  ON CONFLICT (user_id, language_code, activity_date) DO UPDATE
    SET reviews = da.reviews + 1,
        reviews_correct = da.reviews_correct + CASE WHEN NEW.rating <> 'again' THEN 1 ELSE 0 END;

  RETURN NEW;
END;
$$;

CREATE TRIGGER review_events_touch_daily_activity
  AFTER INSERT ON public.review_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_daily_activity();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.languages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steps             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_states     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confusion_pairs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_activity    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements      ENABLE ROW LEVEL SECURITY;

-- Reference data: read-only for everyone, writable only by admin tooling.
CREATE POLICY languages_read ON public.languages
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Curriculum content: readable by learners, writable only by admin tooling.
CREATE POLICY tracks_read ON public.tracks
  FOR SELECT TO anon, authenticated USING (is_published);
CREATE POLICY units_read ON public.units
  FOR SELECT TO anon, authenticated USING (is_published);
CREATE POLICY missions_read ON public.missions
  FOR SELECT TO anon, authenticated USING (is_published);
CREATE POLICY steps_read ON public.steps
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.missions m
    WHERE m.id = steps.mission_id AND m.is_published
  ));

-- Items: shared curriculum plus the learner's own captures. A learner must
-- never see another learner's captured content.
CREATE POLICY items_read_visible ON public.items
  FOR SELECT TO anon, authenticated
  USING (
    retired_at IS NULL
    AND (owner_id IS NULL OR owner_id = (SELECT auth.uid()))
  );
-- Learners may capture their own items...
CREATE POLICY items_insert_own ON public.items
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));
-- ...and edit only their own. Curriculum rows are untouchable from the app.
CREATE POLICY items_update_own ON public.items
  FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

-- Simple owner-scoped tables.
CREATE POLICY learner_languages_all_own ON public.learner_languages
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY review_states_all_own ON public.review_states
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY saved_items_all_own ON public.saved_items
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY user_stats_all_own ON public.user_stats
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY daily_activity_all_own ON public.daily_activity
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY entitlements_select_own ON public.entitlements
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY confusion_pairs_all_own ON public.confusion_pairs
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Append-only history: read + insert only. No UPDATE/DELETE policy exists, so
-- a rewritten history is impossible even if a grant is later widened.
CREATE POLICY review_events_select_own ON public.review_events
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY review_events_insert_own ON public.review_events
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY practice_events_select_own ON public.practice_events
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY practice_events_insert_own ON public.practice_events
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));

-- ----------------------------------------------------------------------------
-- Privileges
-- ----------------------------------------------------------------------------
-- Policies decide which rows; grants decide which operations. Both are needed.
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON public.languages, public.tracks, public.units, public.missions,
                public.steps, public.items
  TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learner_languages TO authenticated;
GRANT INSERT, UPDATE ON public.items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_states TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.confusion_pairs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_stats TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.daily_activity TO authenticated;
GRANT SELECT ON public.entitlements TO authenticated;

-- Append-only: explicitly withhold UPDATE and DELETE.
GRANT SELECT, INSERT ON public.review_events TO authenticated;
GRANT SELECT, INSERT ON public.practice_events TO authenticated;

-- Deliberately NO DELETE on items: content is retired, never removed, because
-- review history references it forever.
REVOKE DELETE ON public.items FROM anon, authenticated;

-- Server-authoritative scheduling, callable only by a signed-in learner.
GRANT EXECUTE ON FUNCTION public.apply_review(
  uuid, uuid, text, text, timestamptz, double precision, double precision,
  text, double precision, double precision, double precision, integer, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.refresh_review_cards_due(uuid, text) TO authenticated;

-- Storage buckets are managed with `npx -y @insforge/cli storage create-bucket`,
-- not raw inserts (the managed `storage.buckets` id has no client-writable
-- default). Required buckets:
--   item-audio     (public)  — TTS audio, generated once per item, cached forever
--   pronunciation  (private) — learner recordings
