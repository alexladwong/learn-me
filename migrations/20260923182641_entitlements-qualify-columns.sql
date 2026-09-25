-- ============================================================================
-- Qualify column references in the metering functions
-- ============================================================================
-- `consume_entitlement` and `check_entitlement` declare output column names
-- (`quota_used`, `quota_limit`, `remaining`) via RETURNS TABLE. Inside a
-- PL/pgSQL body those become variables, so an unqualified `quota_used` is
-- ambiguous between the OUT parameter and the table column — and PostgreSQL
-- raises "column reference is ambiguous" at runtime rather than at creation.
--
-- Every reference to a column is therefore written `entitlements.quota_used`,
-- and every reference to an OUT parameter is left bare. This is the reason the
-- functions create successfully and then fail on first use.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.consume_entitlement(
  p_feature text,
  p_cost    integer DEFAULT 1
)
RETURNS TABLE (
  allowed     boolean,
  quota_limit integer,
  quota_used  integer,
  remaining   integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_row       public.entitlements;
  v_now       timestamptz := now();
  v_month_end timestamptz := date_trunc('month', now()) + interval '1 month';
  v_cost      integer := greatest(0, coalesce(p_cost, 1));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'consume_entitlement: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_known_feature(p_feature) THEN
    RAISE EXCEPTION 'consume_entitlement: unknown feature %', p_feature
      USING ERRCODE = '22023';
  END IF;

  -- `entitlements.*` is qualified because `v_row` is a row type of the same
  -- relation; the column list keeps the OUT parameters unambiguous.
  SELECT e.* INTO v_row
  FROM public.entitlements e
  WHERE e.user_id = v_uid AND e.feature = p_feature
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.entitlements (
      user_id, feature, quota_limit, quota_used, source, period_start, period_end
    )
    VALUES (
      v_uid,
      p_feature,
      CASE p_feature
        WHEN 'active_languages'      THEN 1
        WHEN 'ai_translation'        THEN 40
        WHEN 'ai_conversation'       THEN 5
        WHEN 'pronunciation_scoring' THEN 0
        WHEN 'content_capture'       THEN 20
        WHEN 'advanced_analytics'    THEN 0
        WHEN 'offline_lessons'       THEN 0
        ELSE 0
      END,
      0,
      'free'::text,
      v_now,
      CASE p_feature
        WHEN 'active_languages'   THEN NULL
        WHEN 'advanced_analytics' THEN NULL
        WHEN 'offline_lessons'    THEN NULL
        ELSE v_month_end
      END
    )
    RETURNING * INTO v_row;
  END IF;

  IF v_row.period_end IS NOT NULL AND v_row.period_end <= v_now THEN
    UPDATE public.entitlements e
    SET quota_used = 0,
        period_start = v_now,
        period_end = v_month_end
    WHERE e.id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  IF v_row.quota_limit IS NULL THEN
    UPDATE public.entitlements e
    SET quota_used = e.quota_used + v_cost
    WHERE e.id = v_row.id;

    allowed     := true;
    quota_limit := NULL;
    quota_used  := v_row.quota_used + v_cost;
    remaining   := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_row.quota_used + v_cost > v_row.quota_limit THEN
    allowed     := false;
    quota_limit := v_row.quota_limit;
    quota_used  := v_row.quota_used;
    remaining   := greatest(0, v_row.quota_limit - v_row.quota_used);
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.entitlements e
  SET quota_used = e.quota_used + v_cost
  WHERE e.id = v_row.id
  RETURNING * INTO v_row;

  allowed     := true;
  quota_limit := v_row.quota_limit;
  quota_used  := v_row.quota_used;
  remaining   := greatest(0, v_row.quota_limit - v_row.quota_used);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_entitlement(p_feature text)
RETURNS TABLE (
  allowed     boolean,
  quota_limit integer,
  quota_used  integer,
  remaining   integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_row   public.entitlements;
  v_limit integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'check_entitlement: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_known_feature(p_feature) THEN
    RAISE EXCEPTION 'check_entitlement: unknown feature %', p_feature
      USING ERRCODE = '22023';
  END IF;

  SELECT e.* INTO v_row
  FROM public.entitlements e
  WHERE e.user_id = v_uid AND e.feature = p_feature;

  IF NOT FOUND THEN
    v_limit := CASE p_feature
      WHEN 'active_languages'      THEN 1
      WHEN 'ai_translation'        THEN 40
      WHEN 'ai_conversation'       THEN 5
      WHEN 'pronunciation_scoring' THEN 0
      WHEN 'content_capture'       THEN 20
      WHEN 'advanced_analytics'    THEN 0
      WHEN 'offline_lessons'       THEN 0
      ELSE 0
    END;

    allowed     := v_limit > 0;
    quota_limit := v_limit;
    quota_used  := 0;
    remaining   := v_limit;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_row.period_end IS NOT NULL AND v_row.period_end <= now() THEN
    allowed     := (v_row.quota_limit IS NULL OR v_row.quota_limit > 0);
    quota_limit := v_row.quota_limit;
    quota_used  := 0;
    remaining   := v_row.quota_limit;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_row.quota_limit IS NULL THEN
    allowed     := true;
    quota_limit := NULL;
    quota_used  := v_row.quota_used;
    remaining   := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  allowed     := v_row.quota_used < v_row.quota_limit;
  quota_limit := v_row.quota_limit;
  quota_used  := v_row.quota_used;
  remaining   := greatest(0, v_row.quota_limit - v_row.quota_used);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_entitlement(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_entitlement(text) TO authenticated;
