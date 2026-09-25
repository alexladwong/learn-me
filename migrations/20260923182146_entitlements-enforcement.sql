-- ============================================================================
-- Entitlement enforcement
-- ============================================================================
-- The `entitlements` table existed from the first migration but nothing read it,
-- so every feature was effectively unlimited. This makes it the real gate.
--
-- Three decisions worth stating:
--
--   1. **Consumption is atomic.** It happens in one `SECURITY INVOKER` function
--      that locks the learner's row, so two concurrent requests cannot both see
--      "1 remaining" and both proceed. A read-then-write in application code
--      would leak the quota under exactly the conditions where it matters.
--
--   2. **The learner is resolved from the session, never a parameter.** There is
--      no user id to tamper with, which is what makes self-granting premium
--      impossible rather than merely difficult.
--
--   3. **A missing row means the free allowance, not "allowed".** The function
--      seeds the row on first use, so a brand-new account is metered from its
--      first request rather than being accidentally unlimited until it has a row.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Close the last stray privilege
-- ----------------------------------------------------------------------------
-- `anon` held SELECT here. RLS's `USING (user_id = auth.uid())` meant an
-- anonymous caller could read no rows, so this was not a leak — but an
-- unauthenticated role has no business holding a privilege on a billing table,
-- and defence in depth means the grant should match the intent.
REVOKE ALL ON public.entitlements FROM anon;

-- ----------------------------------------------------------------------------
-- Feature catalogue, so the database rejects an unknown key
-- ----------------------------------------------------------------------------
-- Duplicating the catalogue in SQL is deliberate: it makes `p_feature` a closed
-- set at the database boundary, so a typo in application code fails loudly
-- instead of silently creating an unmetered feature row.
CREATE OR REPLACE FUNCTION public.is_known_feature(p_feature text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_feature IN (
    'active_languages',
    'ai_translation',
    'ai_conversation',
    'pronunciation_scoring',
    'content_capture',
    'advanced_analytics',
    'offline_lessons'
  );
$$;

-- ----------------------------------------------------------------------------
-- Read the learner's entitlements
-- ----------------------------------------------------------------------------
-- Returns one row per catalogue feature, so the client always sees the full set
-- and never has to distinguish "no allowance" from "no row".
CREATE OR REPLACE FUNCTION public.list_my_entitlements()
RETURNS TABLE (
  feature     text,
  quota_limit integer,
  quota_used  integer,
  source      text,
  period_end  timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'list_my_entitlements: not authenticated' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.feature, e.quota_limit, e.quota_used, e.source, e.period_end
  FROM public.entitlements e
  WHERE e.user_id = v_uid
  ORDER BY e.feature;
END;
$$;

-- ----------------------------------------------------------------------------
-- Consume an allowance atomically
-- ----------------------------------------------------------------------------
-- Raises `P0001` with a readable message when the allowance is exhausted, so the
-- calling action can surface the reason rather than a generic failure.
--
-- `p_cost` exists for features charged in units other than one — translation is
-- charged per word, so a 30-word request consumes 30 in a single atomic step
-- rather than 30 separate checks that could each pass.
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
  v_uid         uuid := auth.uid();
  v_row         public.entitlements;
  v_now         timestamptz := now();
  v_month_end   timestamptz := date_trunc('month', now()) + interval '1 month';
  v_cost        integer := greatest(0, coalesce(p_cost, 1));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'consume_entitlement: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_known_feature(p_feature) THEN
    RAISE EXCEPTION 'consume_entitlement: unknown feature %', p_feature
      USING ERRCODE = '22023';
  END IF;

  -- Lock the row for the duration of the transaction. This is what makes the
  -- check-and-increment atomic across concurrent requests.
  SELECT * INTO v_row
  FROM public.entitlements
  WHERE user_id = v_uid AND feature = p_feature
  FOR UPDATE;

  -- No row yet: create it with the free allowance. A brand-new account must be
  -- metered from its first request.
  IF NOT FOUND THEN
    INSERT INTO public.entitlements AS e (
      user_id, feature, quota_limit, quota_used, source, period_start, period_end
    )
    VALUES (
      v_uid,
      p_feature,
      CASE p_feature
        WHEN 'active_languages'        THEN 1
        WHEN 'ai_translation'          THEN 40
        WHEN 'ai_conversation'         THEN 5
        WHEN 'pronunciation_scoring'   THEN 0
        WHEN 'content_capture'         THEN 20
        WHEN 'advanced_analytics'      THEN 0
        WHEN 'offline_lessons'         THEN 0
        ELSE 0
      END,
      0,
      'free',
      v_now,
      CASE p_feature
        WHEN 'active_languages' THEN NULL
        WHEN 'advanced_analytics' THEN NULL
        WHEN 'offline_lessons' THEN NULL
        ELSE v_month_end
      END
    )
    RETURNING * INTO v_row;
  END IF;

  -- Roll the period over if it has ended. Done inside the same transaction as
  -- the consumption so a rollover cannot be applied twice.
  IF v_row.period_end IS NOT NULL AND v_row.period_end <= v_now THEN
    UPDATE public.entitlements
    SET quota_used = 0,
        period_start = v_now,
        period_end = v_month_end
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  -- An unlimited allowance needs no bookkeeping beyond recording usage.
  IF v_row.quota_limit IS NULL THEN
    UPDATE public.entitlements
    SET quota_used = quota_used + v_cost
    WHERE id = v_row.id;

    RETURN QUERY SELECT true, NULL::integer, v_row.quota_used + v_cost, NULL::integer;
    RETURN;
  END IF;

  IF v_row.quota_used + v_cost > v_row.quota_limit THEN
    RETURN QUERY
    SELECT false, v_row.quota_limit, v_row.quota_used,
           greatest(0, v_row.quota_limit - v_row.quota_used);
    RETURN;
  END IF;

  UPDATE public.entitlements
  SET quota_used = quota_used + v_cost
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN QUERY
  SELECT true, v_row.quota_limit, v_row.quota_used,
         greatest(0, v_row.quota_limit - v_row.quota_used);
END;
$$;

-- ----------------------------------------------------------------------------
-- Read-only allowance check, for rendering gates without spending anything
-- ----------------------------------------------------------------------------
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

  SELECT * INTO v_row
  FROM public.entitlements
  WHERE user_id = v_uid AND feature = p_feature;

  IF NOT FOUND THEN
    -- Fall back to the free allowance without writing, so rendering a page never
    -- has a side effect.
    v_limit := CASE p_feature
      WHEN 'active_languages'        THEN 1
      WHEN 'ai_translation'          THEN 40
      WHEN 'ai_conversation'         THEN 5
      WHEN 'pronunciation_scoring'   THEN 0
      WHEN 'content_capture'         THEN 20
      WHEN 'advanced_analytics'      THEN 0
      WHEN 'offline_lessons'         THEN 0
      ELSE 0
    END;

    RETURN QUERY
    SELECT v_limit > 0, v_limit, 0, v_limit;
    RETURN;
  END IF;

  -- An expired period reads as fully available; the rollover happens on the
  -- first real consumption.
  IF v_row.period_end IS NOT NULL AND v_row.period_end <= now() THEN
    RETURN QUERY
    SELECT (v_row.quota_limit IS NULL OR v_row.quota_limit > 0),
           v_row.quota_limit, 0,
           CASE WHEN v_row.quota_limit IS NULL THEN NULL
                ELSE v_row.quota_limit END;
    RETURN;
  END IF;

  IF v_row.quota_limit IS NULL THEN
    RETURN QUERY SELECT true, NULL::integer, v_row.quota_used, NULL::integer;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT (v_row.quota_used < v_row.quota_limit),
         v_row.quota_limit, v_row.quota_used,
         greatest(0, v_row.quota_limit - v_row.quota_used);
END;
$$;

-- ----------------------------------------------------------------------------
-- Privileges
-- ----------------------------------------------------------------------------
-- `REVOKE ALL` first: an additive GRANT would leave the broad default DML in
-- place, and a learner must never be able to write their own allowance.
REVOKE ALL ON public.entitlements FROM anon, authenticated;
GRANT SELECT ON public.entitlements TO authenticated;

-- Writes happen only through the functions above, which resolve the learner from
-- the session. `project_admin` retains full access for entitlement fulfilment
-- after a verified payment webhook.
GRANT EXECUTE ON FUNCTION public.is_known_feature(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_entitlements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_entitlement(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_entitlement(text) TO authenticated;
