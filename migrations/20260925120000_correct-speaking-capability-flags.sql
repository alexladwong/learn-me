-- ============================================================================
-- Stop the catalogue claiming speech capabilities that do not exist
-- ============================================================================
-- `languages.supports_asr` and `languages.supports_pronunciation` were seeded as
-- `true` for every language in the launch set, with the comment "strongest
-- TTS/ASR coverage, full guided content". That was product *intent*, recorded in
-- a capability column — and `/[lang]/speak` read it as fact, telling learners
-- "Speech recognition: Connected for French" and "Pronunciation scoring:
-- Connected for French" when no speech recognition and no pronunciation scorer
-- exist anywhere in the codebase.
--
-- There is exactly one speech capability that is genuinely wired up: text to
-- speech, through the device's own engine (`lib/speech/browser-provider.ts`).
-- That is what `supports_audio` means, and it stays as authored — including
-- `false` for Luganda, where the engine had no voice.
--
-- These two flags go back to `false` everywhere. They flip to `true` per language
-- when a provider is actually connected for that language and the check is
-- verified; that is the only thing that may set them.
UPDATE public.languages
SET supports_asr = false,
    supports_pronunciation = false
WHERE supports_asr
   OR supports_pronunciation;

COMMENT ON COLUMN public.languages.supports_asr IS
  'True only when speech recognition is connected and verified for this language. Set by a migration after a provider is wired up — never as intent.';
COMMENT ON COLUMN public.languages.supports_pronunciation IS
  'True only when pronunciation scoring is connected and verified for this language. Set by a migration after a provider is wired up — never as intent.';
