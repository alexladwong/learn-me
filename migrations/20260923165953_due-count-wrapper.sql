-- ============================================================================
-- Zero-argument due-count refresh
-- ============================================================================
-- The earlier two-argument overload takes a user id, which means a caller could
-- in principle pass someone else's (the `auth.uid()` check rejects it, but a
-- parameter that must never be user-supplied is better removed than defended).
--
-- This wrapper resolves the learner from the session and refreshes every active
-- language, which is exactly what the dashboard needs. It is the form the app
-- calls; the two-argument version remains as the internal primitive.
-- ============================================================================

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

  -- Ensure a stats row exists for every active language before counting, so the
  -- dashboard reads a row rather than creating one lazily.
  INSERT INTO public.user_stats (user_id, language_code)
  SELECT v_uid, ll.language_code
  FROM public.learner_languages ll
  WHERE ll.user_id = v_uid AND ll.is_active
  ON CONFLICT (user_id, language_code) DO NOTHING;

  FOR v_lang IN
    SELECT language_code
    FROM public.learner_languages
    WHERE user_id = v_uid AND is_active
    ORDER BY is_primary DESC, started_at ASC
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

GRANT EXECUTE ON FUNCTION public.refresh_review_cards_due() TO authenticated;
