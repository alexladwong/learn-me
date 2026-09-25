-- A server-side onboarding draft.
--
-- Onboarding answers used to live only in the browser: each step is a Server
-- Action plus a `redirect()`, which remounts the wizard, so `sessionStorage` was
-- the only thing carrying answers forward. That made the final submit depend on
-- the client having rehydrated before the learner pressed the button.
--
-- It failed in exactly that window. Captured from a real render:
--
--   [/onboarding-payload] step=6
--     keys: [language, step, nativeLanguage, level, goal, dailyMinutes, skills,
--            displayName, timezone]
--     counts: { motivation: 0, skills: 5 }
--
-- `motivation` was absent from the form entirely — the client had not rehydrated
-- yet, so the reason checkboxes were never rendered as checked and nothing was
-- submitted. The wizard then correctly reported "Choose at least one reason",
-- and the learner's five selections were lost despite being visible a moment
-- earlier.
--
-- A draft on the profile fixes this at the root rather than in the UI: every step
-- persists what it collected, and the final submit merges what the browser sent
-- with what the server already holds. A refresh, a second device, a remount, or a
-- slow hydration can no longer destroy a plan.
--
-- `profiles` was chosen over a new table deliberately. It already owns
-- `onboarding_state` and `onboarding_step`, it is already one row per learner
-- with owner-only RLS, and adding a table would duplicate that lifecycle. The
-- column is dropped when onboarding completes, so no half-filled plan lingers.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_draft jsonb;

COMMENT ON COLUMN public.profiles.onboarding_draft IS
  'Answers collected so far during onboarding, merged per step. Cleared once the plan is written.';

-- The draft is plain learner-owned data, so the existing profiles policies
-- already cover it. RLS filters rows, not columns, so the column needs no policy
-- of its own — but it must not be readable through a broader grant either, which
-- is why it is not exposed by any view.
