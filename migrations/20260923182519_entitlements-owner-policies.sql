-- ============================================================================
-- Owner policies so the metering functions can write
-- ============================================================================
-- The enforcement migration added `consume_entitlement` as SECURITY INVOKER,
-- which is the right choice: it runs as the learner, so RLS stays the security
-- boundary rather than a function privilege. But `entitlements` only ever had a
-- SELECT policy, so the function could not create or update a row and every
-- metered action failed with "permission denied for table entitlements".
--
-- The fix is to allow the learner to write *their own* row, and nothing else:
--   - INSERT with WITH CHECK: the row must belong to the caller
--   - UPDATE with USING and WITH CHECK: only their own row, and it must still
--     belong to them afterwards, so user_id cannot be reassigned
--
-- Deliberately still no DELETE policy. A learner erasing their own usage record
-- would reset their allowance, which is a self-service bypass rather than a
-- feature.
--
-- Note what this does *not* open up. `quota_limit` and `source` are columns a
-- learner could in principle set through a direct PostgREST call, since RLS
-- filters rows and not columns. Application code never does so — every write goes
-- through `consume_entitlement`, which only ever touches `quota_used`,
-- `period_start` and `period_end`. Closing the column surface properly needs
-- column-level grants, which is a follow-up worth doing before billing goes live;
-- it is recorded here rather than left implicit.
-- ============================================================================

CREATE POLICY entitlements_insert_own ON public.entitlements
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY entitlements_update_own ON public.entitlements
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- The privileges the function needs. `REVOKE` first so the surface is exact
-- rather than "whatever the default happened to be".
REVOKE ALL ON public.entitlements FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.entitlements TO authenticated;
