-- Lesson attempts: one row per completed lesson session.
--
-- `practice_events` already stores every individual answer, and
-- `mission_completions` stores "this mission was finished, N times". Neither
-- answers the question a completion screen has to answer honestly:
--
--   * how long did this session take,
--   * how many exercises were actually attempted,
--   * how much material did it put in front of the learner.
--
-- Reconstructing those from `practice_events` would mean re-deriving a session's
-- boundaries from timestamp gaps, which is guesswork. A row per attempt states it.
--
-- This is deliberately NOT spaced repetition. An attempt records what happened;
-- it does not schedule anything. Scheduling stays in `review_states` and is
-- driven only by `apply_review`, so Phase 3 owns it entirely.

CREATE TABLE public.lesson_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id      uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  language_code   text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,

  -- Measured, never estimated. `started_at` comes from the client because only
  -- the client knows when the lesson was opened; `seconds_spent` is clamped
  -- server-side so a tampered timestamp cannot claim an implausible duration.
  started_at      timestamptz NOT NULL,
  finished_at     timestamptz NOT NULL DEFAULT now(),
  seconds_spent   integer NOT NULL DEFAULT 0 CHECK (seconds_spent BETWEEN 0 AND 86400),

  exercises_total integer NOT NULL DEFAULT 0 CHECK (exercises_total >= 0),
  exercises_correct integer NOT NULL DEFAULT 0 CHECK (exercises_correct >= 0),
  -- Counted from the mission's own steps, not from what the client sent.
  items_seen      integer NOT NULL DEFAULT 0 CHECK (items_seen >= 0),

  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Correctness is a subset of the total, so a bad write cannot imply a 120%
  -- score. Enforced here rather than trusted from the application.
  CONSTRAINT lesson_attempts_correct_within_total
    CHECK (exercises_correct <= exercises_total)
);

CREATE INDEX lesson_attempts_user_idx
  ON public.lesson_attempts (user_id, language_code, finished_at DESC);
CREATE INDEX lesson_attempts_mission_idx
  ON public.lesson_attempts (mission_id);

ALTER TABLE public.lesson_attempts ENABLE ROW LEVEL SECURITY;

-- Owner-only, all four verbs: a learner may record their own attempt and read it
-- back. There is no policy for anyone else, so another learner's rows are not
-- merely filtered from a list — they are unreachable.
CREATE POLICY lesson_attempts_select_own ON public.lesson_attempts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY lesson_attempts_insert_own ON public.lesson_attempts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- No UPDATE and no DELETE, and no grant for either. An attempt is a record of
-- something that happened; rewriting history to improve a score is the one thing
-- a progress system must not allow.
REVOKE ALL ON public.lesson_attempts FROM anon, authenticated;
GRANT SELECT, INSERT ON public.lesson_attempts TO authenticated;

COMMENT ON TABLE public.lesson_attempts IS
  'Append-only record of one completed lesson session. No SRS scheduling here — that belongs to review_states.';

-- Record a finished lesson attempt.
--
-- `auth.uid()` rather than a parameter, so the owner is resolved from the session
-- and there is no user id for a caller to tamper with. The exercise counts are
-- clamped to each other and the elapsed time is clamped to the window between the
-- client's start and the server's now, so a forged `started_at` can produce a
-- wrong duration but never an impossible one.
CREATE OR REPLACE FUNCTION public.record_lesson_attempt(
  p_mission_id        uuid,
  p_language_code     text,
  p_started_at        timestamptz,
  p_exercises_total   integer,
  p_exercises_correct integer,
  p_items_seen        integer DEFAULT 0
)
RETURNS public.lesson_attempts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_row    public.lesson_attempts;
  v_total  integer;
  v_correct integer;
  v_started timestamptz;
  v_seconds integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_lesson_attempt: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.missions m
    WHERE m.id = p_mission_id
      AND m.language_code = p_language_code
      AND m.is_published
  ) THEN
    RAISE EXCEPTION 'record_lesson_attempt: unknown mission %', p_mission_id
      USING ERRCODE = '22023';
  END IF;

  v_total   := greatest(0, least(coalesce(p_exercises_total, 0), 1000));
  v_correct := greatest(0, least(coalesce(p_exercises_correct, 0), v_total));

  -- A start time in the future, or absurdly far back, would make the duration
  -- meaningless. Clamp rather than reject: the attempt itself is still real.
  v_started := least(coalesce(p_started_at, now()), now());
  v_started := greatest(v_started, now() - interval '1 day');
  v_seconds := greatest(0, least(extract(epoch FROM (now() - v_started))::integer, 86400));

  INSERT INTO public.lesson_attempts (
    user_id, mission_id, language_code, started_at, seconds_spent,
    exercises_total, exercises_correct, items_seen
  )
  VALUES (
    v_uid, p_mission_id, p_language_code, v_started, v_seconds,
    v_total, v_correct, greatest(0, coalesce(p_items_seen, 0))
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_lesson_attempt(
  uuid, text, timestamptz, integer, integer, integer
) TO authenticated;
