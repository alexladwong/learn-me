-- ============================================================================
-- Mission completions
-- ============================================================================
-- Lesson progress needs to be recorded somewhere durable, and nowhere in the
-- schema owned that fact. Inferring it from `saved_items.saved_from` would work
-- only by accident: saving an item is a separate learner decision from finishing
-- a lesson, and the two would drift apart the first time someone saved a word
-- mid-lesson and then abandoned it.
--
-- This table is the honest record. It is append-mostly: a learner can restart a
-- lesson, which updates `last_completed_at` and increments `completions`, but the
-- first completion is never overwritten — that is what the path's "completed"
-- state and any future "when did you learn this" feature depend on.
-- ============================================================================

CREATE TABLE public.mission_completions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id        uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  language_code     text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  /** How many times the learner has worked through it. */
  completions       integer NOT NULL DEFAULT 1 CHECK (completions > 0),
  /** Correct answers / total graded answers, 0..1. Null when nothing was graded. */
  accuracy          double precision CHECK (accuracy IS NULL OR accuracy BETWEEN 0 AND 1),
  /** Items from this mission that entered the review queue as a result. */
  items_enrolled    integer NOT NULL DEFAULT 0 CHECK (items_enrolled >= 0),
  first_completed_at timestamptz NOT NULL DEFAULT now(),
  last_completed_at  timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mission_id)
);

-- The path renders "7 of 12 units completed", which is driven by this table.
CREATE INDEX mission_completions_user_idx
  ON public.mission_completions (user_id, language_code, last_completed_at DESC);
CREATE INDEX mission_completions_mission_idx
  ON public.mission_completions (mission_id);

CREATE TRIGGER mission_completions_touch_updated_at
  BEFORE UPDATE ON public.mission_completions
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.mission_completions ENABLE ROW LEVEL SECURITY;

-- Progress is private to the learner. There is no sharing model in the product
-- yet, so there is no policy that would let anyone else read it.
CREATE POLICY mission_completions_select_own ON public.mission_completions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY mission_completions_insert_own ON public.mission_completions
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY mission_completions_update_own ON public.mission_completions
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Deliberately no DELETE policy: a learner should not be able to erase the
-- record that they completed a lesson, because the path's progression and any
-- future review of "what have I covered" depends on it. Restarting a lesson is
-- an UPDATE, which is allowed.

-- ----------------------------------------------------------------------------
-- Privileges
-- ----------------------------------------------------------------------------
-- `REVOKE ALL` first: an additive GRANT would leave the broad default DML that
-- InsForge applies to new public tables, and DELETE must genuinely be absent.
REVOKE ALL ON public.mission_completions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.mission_completions TO authenticated;

-- ----------------------------------------------------------------------------
-- Record a completion
-- ----------------------------------------------------------------------------
-- One call handles both the first completion and a repeat, so the application
-- never has to read-then-write and race itself. Resolving the learner from
-- `auth.uid()` means there is no user id parameter to tamper with.
CREATE OR REPLACE FUNCTION public.record_mission_completion(
  p_mission_id     uuid,
  p_language_code  text,
  p_accuracy       double precision DEFAULT NULL,
  p_items_enrolled integer DEFAULT 0
)
RETURNS public.mission_completions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.mission_completions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_mission_completion: not authenticated' USING ERRCODE = '42501';
  END IF;

  -- The mission must be a real, published mission for this language, so a
  -- hand-crafted call cannot record progress against arbitrary content.
  IF NOT EXISTS (
    SELECT 1 FROM public.missions m
    WHERE m.id = p_mission_id
      AND m.language_code = p_language_code
      AND m.is_published
  ) THEN
    RAISE EXCEPTION 'record_mission_completion: unknown mission %', p_mission_id
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.mission_completions AS mc (
    user_id, mission_id, language_code, accuracy, items_enrolled
  )
  VALUES (
    v_uid, p_mission_id, p_language_code,
    CASE WHEN p_accuracy IS NULL THEN NULL ELSE least(1, greatest(0, p_accuracy)) END,
    greatest(0, p_items_enrolled)
  )
  ON CONFLICT (user_id, mission_id) DO UPDATE SET
    completions       = mc.completions + 1,
    last_completed_at = now(),
    -- Keep the most recent accuracy, but never overwrite a real value with null.
    accuracy          = COALESCE(EXCLUDED.accuracy, mc.accuracy),
    items_enrolled    = greatest(mc.items_enrolled, EXCLUDED.items_enrolled)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_mission_completion(
  uuid, text, double precision, integer
) TO authenticated;
