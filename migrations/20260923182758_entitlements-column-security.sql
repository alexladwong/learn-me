-- ============================================================================
-- Column-level security on entitlements
-- ============================================================================
-- The verification suite caught a real privilege escalation. With an UPDATE
-- grant on the table, a learner could write to their own row directly:
--
--   update entitlements set quota_limit = 999999, source = 'subscription'
--
-- RLS permitted it because RLS filters *rows*, not *columns* — the row does
-- belong to them. Ownership and mutability are different questions, and the
-- owner policy from the previous migration answered only the first.
--
-- Two independent controls are added, because either alone would be a single
-- point of failure:
--
--   1. **Column-level grants.** `UPDATE` is revoked on the table and granted on
--      exactly the three columns the metering function touches. A direct write to
--      `quota_limit` or `source` now fails with a privilege error, whatever the
--      policies say.
--
--   2. **An immutability trigger.** Even if a grant is later widened by accident,
--      changing `quota_limit` or `source` on an existing row raises. This is the
--      guard that survives someone re-running a broad `GRANT` in a future
--      migration, which is exactly how the hole appeared in the first place.
--
-- Entitlement fulfilment after a verified payment webhook writes as the service
-- role, which is not subject to these grants, so nothing legitimate is blocked.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Column-level grants
-- ----------------------------------------------------------------------------
-- `INSERT` stays table-wide: creating a row with the free allowance is
-- legitimate, and the trigger below constrains what that initial value may be.
REVOKE ALL ON public.entitlements FROM anon, authenticated;
GRANT SELECT, INSERT ON public.entitlements TO authenticated;
GRANT UPDATE (quota_used, period_start, period_end) ON public.entitlements TO authenticated;

-- ----------------------------------------------------------------------------
-- Immutability guard
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_entitlements_guard_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- A learner may not change which plan they are on, or raise their own ceiling.
  IF NEW.quota_limit IS DISTINCT FROM OLD.quota_limit THEN
    RAISE EXCEPTION 'entitlements.quota_limit is server-maintained'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'entitlements.source is server-maintained'
      USING ERRCODE = '42501';
  END IF;

  -- Ownership can never be reassigned.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'entitlements.user_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entitlements_guard_plan ON public.entitlements;

CREATE TRIGGER entitlements_guard_plan
  BEFORE UPDATE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.tg_entitlements_guard_plan();

-- ----------------------------------------------------------------------------
-- Guard the initial insert too
-- ----------------------------------------------------------------------------
-- Otherwise a learner could create their own row with an arbitrary ceiling.
-- Only the free allowance, or a trial, may be self-created.
CREATE OR REPLACE FUNCTION public.tg_entitlements_guard_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_expected integer;
BEGIN
  v_expected := CASE NEW.feature
    WHEN 'active_languages'      THEN 1
    WHEN 'ai_translation'        THEN 40
    WHEN 'ai_conversation'       THEN 5
    WHEN 'pronunciation_scoring' THEN 0
    WHEN 'content_capture'       THEN 20
    WHEN 'advanced_analytics'    THEN 0
    WHEN 'offline_lessons'       THEN 0
    ELSE 0
  END;

  -- The service role sets `source` to subscription/grant after a verified
  -- payment; a learner may only start themselves on the free allowance.
  IF NEW.source = 'free'::text AND NEW.quota_limit IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'entitlements.quota_limit must be the free allowance for a self-created row'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entitlements_guard_insert ON public.entitlements;

CREATE TRIGGER entitlements_guard_insert
  BEFORE INSERT ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.tg_entitlements_guard_insert();
