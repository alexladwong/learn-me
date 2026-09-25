-- Add English to the catalogue as a *first language*, not a learning target.
--
-- `profiles.native_language` is `REFERENCES public.languages(code)`, but the
-- catalogue was seeded with target languages only — English was missing. The
-- onboarding wizard worked around that by injecting an English option into its
-- own `<select>` at render time, which meant the database rejected the value the
-- wizard itself defaulted to:
--
--     insert or update on table "profiles" violates foreign key constraint
--     "profiles_native_language_fkey"
--
-- The learner saw that as a generic "could not save your plan" on the last step
-- of onboarding, after answering six steps of questions. It happened to anyone
-- who did not change the default first language, which is most people.
--
-- The workaround was in the wrong layer. `languages` is already the app's single
-- reference table for languages and already distinguishes "in the catalogue"
-- from "has a playable guided path" via `is_available`, so a language that can be
-- someone's first language but is not taught belongs here with
-- `is_available = false` — exactly like the ten upcoming targets.
--
-- `supports_*` are left false: they describe teaching capability (TTS, ASR,
-- pronunciation scoring), and this application does not teach English. Nothing
-- reads them for a native language, but a false claim would be a false claim.

INSERT INTO public.languages (
  code, name_en, name_native, flag_emoji, direction, script,
  supports_cefr, supports_audio, supports_asr, supports_pronunciation,
  is_available, sort_order
)
VALUES
  ('en', 'English', 'English', '🇬🇧', 'ltr', 'Latin', false, false, false, false, false, 5)
ON CONFLICT (code) DO NOTHING;
