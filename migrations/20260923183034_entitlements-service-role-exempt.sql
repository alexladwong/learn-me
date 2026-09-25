-- ============================================================================
-- Let the service role change a plan; keep blocking learners
-- ============================================================================
-- The immutability trigger from the previous migration was correct for a
-- learner and wrong for fulfilment: the service role also needs to set
-- `quota_limit` and `source` after a verified payment, and the trigger was
-- refusing it.
--
-- The exemption is expressed as a role check rather than by loosening the rule.
-- A learner's requests arrive as `authenticated` or `anon`, which PostgREST
-- cannot elevate — the role is derived from the JWT, not from a header — so
-- `project_admin` is reachable only by admin tooling and the service key. The
-- guard therefore still holds for every request that arrives from the browser.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_entitlements_guard_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- Entitlement fulfilment runs as the service role after a verified payment
  -- webhook. Nothing reachable from the browser runs as this role.
  IF current_user IN ('project_admin', 'service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF NEW.quota_limit IS DISTINCT FROM OLD.quota_limit THEN
    RAISE EXCEPTION 'entitlements.quota_limit is server-maintained'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'entitlements.source is server-maintained'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'entitlements.user_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_entitlements_guard_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_expected integer;
BEGIN
  IF current_user IN ('project_admin', 'service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

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

  IF NEW.source = 'free'::text AND NEW.quota_limit IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'entitlements.quota_limit must be the free allowance for a self-created row'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
