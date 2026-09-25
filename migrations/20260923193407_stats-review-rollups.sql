-- Recompute the review rollups on `user_stats`, not just the due count.
--
-- `user_stats.total_reviews` / `total_correct` / `streak_current` were read by
-- the dashboard, the progress screen, the review header and the "next session"
-- recommendation engine, but nothing ever wrote them. `apply_review` updates
-- `review_states` and appends to `review_events`; the daily trigger maintains
-- `daily_activity`. The lifetime counters stayed at their DEFAULT 0 forever, so
-- a learner with a hundred reviews saw "Reviews 0", a 0% accuracy figure, and a
-- recommendation engine that believed they had never studied.
--
-- The fix belongs here rather than in `apply_review`, because:
--   * `apply_review` already does the minimum write per card — a per-card
--     aggregate would make a 60-card session 60 extra table scans,
--   * `refresh_review_cards_due` is already the batch rollup, called once after a
--     session by the review screen, and already owns `review_cards_due`,
--   * `review_events` is append-only and immutable, so deriving the totals from
--     it is always correct regardless of how many times this runs.
--
-- Everything here is recomputed from source on every call, so it is idempotent
-- and self-healing: a count that ever drifted is corrected the next time the
-- learner opens their review screen.

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
  v_due         integer;
  v_total       integer;
  v_correct     integer;
  v_streak      integer := 0;
  v_cursor      date;
  v_last_active date;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'refresh_review_cards_due: user mismatch' USING ERRCODE = '42501';
  END IF;

  -- ---- Due count ---------------------------------------------------------
  SELECT count(*) INTO v_due
  FROM public.review_states
  WHERE user_id = p_user_id
    AND language_code = p_language_code
    AND state <> 'suspended'
    AND due_at <= now();

  -- ---- Lifetime totals ---------------------------------------------------
  -- Counted from the append-only event log, which is the same source the daily
  -- rollup is built from, so the two can never disagree.
  SELECT count(*), count(*) FILTER (WHERE rating <> 'again')
  INTO v_total, v_correct
  FROM public.review_events
  WHERE user_id = p_user_id
    AND language_code = p_language_code;

  -- ---- Streak ------------------------------------------------------------
  -- Consecutive calendar days with at least one review, counted back from the
  -- most recent study day. A learner who has not studied *today* keeps the
  -- streak they earned yesterday: it lapses only once a full day passes with no
  -- activity, which is what "days in a row" means to the person reading it.
  --
  -- The `reviews > 0` predicate matches how `getWeeklySummary` counts an active
  -- day, so the header and the weekly card agree.
  SELECT max(activity_date) INTO v_last_active
  FROM public.daily_activity
  WHERE user_id = p_user_id
    AND language_code = p_language_code
    AND reviews > 0;

  IF v_last_active IS NOT NULL THEN
    v_cursor := v_last_active;

    IF v_cursor < (now() AT TIME ZONE 'UTC')::date - 1 THEN
      -- The streak already lapsed; a gap of a day or more ends it at the last
      -- day studied.
      v_streak := 0;
    ELSE
      LOOP
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM public.daily_activity
          WHERE user_id = p_user_id
            AND language_code = p_language_code
            AND activity_date = v_cursor
            AND reviews > 0
        );
        v_streak := v_streak + 1;
        v_cursor := v_cursor - 1;
      END LOOP;
    END IF;
  END IF;

  INSERT INTO public.user_stats AS us (
    user_id, language_code, review_cards_due, total_reviews, total_correct,
    streak_current, streak_longest, last_active_date
  )
  VALUES (
    p_user_id, p_language_code, v_due, v_total, v_correct,
    v_streak, v_streak, v_last_active
  )
  ON CONFLICT (user_id, language_code) DO UPDATE SET
    review_cards_due = v_due,
    total_reviews    = v_total,
    total_correct    = v_correct,
    streak_current   = v_streak,
    -- A past longest streak must never be lowered by a later gap, and the
    -- current streak is by definition a candidate for the longest.
    streak_longest   = greatest(us.streak_longest, v_streak),
    last_active_date = v_last_active;

  RETURN v_due;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_review_cards_due(uuid, text) TO authenticated;
