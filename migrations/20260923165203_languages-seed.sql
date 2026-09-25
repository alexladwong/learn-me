-- ============================================================================
-- Language catalogue
-- ============================================================================
-- Reference data only: no learner content, no fabricated audio.
--
-- `supports_*` flags are honest capability claims, not aspirations. The UI reads
-- them and shows a capability as unavailable when it is false, instead of
-- simulating a result. Only flip a flag once the provider is actually wired up
-- and verified end to end.
--
-- `is_available` means "this language has a playable guided path". The three
-- launch languages are available; the rest are visible in the catalogue so the
-- learner can see what is coming and express interest, but cannot be started.
--
-- To add a language to the launch set:
--   1. verify TTS audio quality for it,
--   2. author at least one published track,
--   3. flip is_available and the matching supports_* flags in a migration.
-- ============================================================================

INSERT INTO public.languages (
  code, name_en, name_native, flag_emoji, direction, script,
  supports_cefr, supports_audio, supports_asr, supports_pronunciation,
  is_available, sort_order
)
VALUES
  -- Launch set: strongest TTS/ASR coverage, full guided content.
  ('es', 'Spanish',    'Español',    '🇪🇸', 'ltr', 'Latin',   true,  true,  true,  true,  true,  10),
  ('fr', 'French',     'Français',   '🇫🇷', 'ltr', 'Latin',   true,  true,  true,  true,  true,  20),
  ('de', 'German',     'Deutsch',    '🇩🇪', 'ltr', 'Latin',   true,  true,  true,  true,  true,  30),

  -- Catalogue: architecture ready, content and provider verification pending.
  ('pt', 'Portuguese', 'Português',  '🇵🇹', 'ltr', 'Latin',   true,  true,  true,  true,  false, 40),
  ('it', 'Italian',    'Italiano',   '🇮🇹', 'ltr', 'Latin',   true,  true,  true,  true,  false, 50),
  ('nl', 'Dutch',      'Nederlands', '🇳🇱', 'ltr', 'Latin',   true,  true,  true,  true,  false, 60),
  ('ja', 'Japanese',   '日本語',      '🇯🇵', 'ltr', 'Japanese', true,  true,  true,  true,  false, 70),
  ('ko', 'Korean',     '한국어',      '🇰🇷', 'ltr', 'Hangul',   true,  true,  true,  true,  false, 80),
  ('zh', 'Mandarin',   '中文',        '🇨🇳', 'ltr', 'Han',      true,  true,  true,  true,  false, 90),
  ('id', 'Indonesian', 'Bahasa Indonesia', '🇮🇩', 'ltr', 'Latin', true, true, true, true, false, 100),
  ('sw', 'Swahili',    'Kiswahili',  '🇰🇪', 'ltr', 'Latin',    false, true,  false, false, false, 110),
  ('lg', 'Luganda',    'Luganda',    '🇺🇬', 'ltr', 'Latin',    false, false, false, false, false, 120),
  -- Arabic is right-to-left: the app must honour `direction` in its layout, not
  -- assume LTR with reversed strings.
  ('ar', 'Arabic',     'العربية',     '🇸🇦', 'rtl', 'Arabic',   true,  true,  true,  true,  false, 130)
ON CONFLICT (code) DO UPDATE SET
  name_en                = EXCLUDED.name_en,
  name_native            = EXCLUDED.name_native,
  flag_emoji             = EXCLUDED.flag_emoji,
  direction              = EXCLUDED.direction,
  script                 = EXCLUDED.script,
  supports_cefr          = EXCLUDED.supports_cefr,
  supports_audio         = EXCLUDED.supports_audio,
  supports_asr           = EXCLUDED.supports_asr,
  supports_pronunciation = EXCLUDED.supports_pronunciation,
  is_available           = EXCLUDED.is_available,
  sort_order             = EXCLUDED.sort_order;
