-- ============================================================================
-- Tighten table privileges
-- ============================================================================
-- The first migration's `GRANT` statements were additive. InsForge grants broad
-- DML on new `public` tables to `anon` and `authenticated`, and an additive
-- GRANT does not remove an existing privilege — so `review_events` and
-- `practice_events` ended up updatable despite being designed as append-only
-- history.
--
-- This migration makes the intended operation surface true, in both directions:
-- revoke first, then grant exactly what each role should have. Verified by
-- `scripts/verify-backend.mjs`, which asserts that rewriting a review event is
-- rejected rather than silently succeeding.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Append-only learning history
-- ----------------------------------------------------------------------------
-- A learner may record what happened and read it back. Nothing may rewrite or
-- erase it — not the app, and not a compromised session. This is what makes the
-- memory model auditable: `user_stats` can always be rebuilt from these rows.
REVOKE ALL ON public.review_events FROM anon, authenticated;
GRANT SELECT, INSERT ON public.review_events TO authenticated;

REVOKE ALL ON public.practice_events FROM anon, authenticated;
GRANT SELECT, INSERT ON public.practice_events TO authenticated;

-- ----------------------------------------------------------------------------
-- Content: readable by everyone, never deletable, only owner-editable
-- ----------------------------------------------------------------------------
-- `anon` has no business writing content, and no role may delete an item because
-- review history references items forever (retire with `retired_at` instead).
REVOKE INSERT, UPDATE, DELETE ON public.items FROM anon;
REVOKE DELETE ON public.items FROM authenticated;
GRANT SELECT ON public.items TO anon, authenticated;
GRANT INSERT, UPDATE ON public.items TO authenticated;

-- ----------------------------------------------------------------------------
-- Curriculum stays read-only for clients
-- ----------------------------------------------------------------------------
-- Content is authored through migrations and admin tooling, never by a learner.
REVOKE INSERT, UPDATE, DELETE ON public.tracks, public.units, public.missions, public.steps
  FROM anon, authenticated;
GRANT SELECT ON public.tracks, public.units, public.missions, public.steps
  TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- Reference data
-- ----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.languages FROM anon, authenticated;
GRANT SELECT ON public.languages TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- Entitlements are granted, never self-assigned
-- ----------------------------------------------------------------------------
-- Otherwise a learner could grant themselves premium with one HTTP request.
-- Writes happen through the service role after a verified payment webhook.
REVOKE INSERT, UPDATE, DELETE ON public.entitlements FROM anon, authenticated;
GRANT SELECT ON public.entitlements TO authenticated;

-- ----------------------------------------------------------------------------
-- Profile: a learner owns their own row, and cannot create rows for others
-- ----------------------------------------------------------------------------
REVOKE DELETE ON public.profiles FROM anon, authenticated;
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- ----------------------------------------------------------------------------
-- Derived rollups
-- ----------------------------------------------------------------------------
-- `user_stats` and `daily_activity` are written by security-definer triggers and
-- by the refresh functions. Direct DELETE would let a learner erase their own
-- history of record, so it is withheld.
REVOKE DELETE ON public.user_stats, public.daily_activity FROM anon, authenticated;
REVOKE ALL ON public.user_stats, public.daily_activity FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.user_stats, public.daily_activity TO authenticated;

-- ----------------------------------------------------------------------------
-- Personal banks: a learner may delete their own saved item (it is their list),
-- but never an item from the shared content table.
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.saved_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_items TO authenticated;

REVOKE ALL ON public.confusion_pairs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.confusion_pairs TO authenticated;

REVOKE ALL ON public.learner_languages FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learner_languages TO authenticated;

REVOKE ALL ON public.review_states FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_states TO authenticated;
