-- A friendly greeting per language, for language cards and the onboarding picker.
--
-- The language cards an be identified by their own name and script, not by a
-- flag: a flag names a country, and Spanish, Arabic and Swahili are each spoken
-- across many. `name_native` and `script` already existed; what was missing was a
-- short phrase that makes a language feel like something a person says rather
-- than a row in a catalogue.
--
-- Examples are real, ordinary greetings — the same thing a learner would say on
-- day one. `greeting_english` is the plain-English meaning, so the card can show
-- what the phrase actually means instead of leaving it unglossed.
--
-- These are content, not capability claims: adding a greeting does NOT make a
-- language learnable. `is_available` remains the single honest flag for "has a
-- playable guided path", and it is untouched here.

ALTER TABLE public.languages
  ADD COLUMN IF NOT EXISTS greeting_native text,
  ADD COLUMN IF NOT EXISTS greeting_english text;

COMMENT ON COLUMN public.languages.greeting_native IS
  'A short everyday greeting in the language, shown on selection cards.';
COMMENT ON COLUMN public.languages.greeting_english IS
  'Plain-English meaning of greeting_native.';

-- Launch set (learnable today).
UPDATE public.languages SET greeting_native = 'Hola, ¿cómo estás?',      greeting_english = 'Hi, how are you?'          WHERE code = 'es';
UPDATE public.languages SET greeting_native = 'Bonjour, comment ça va ?', greeting_english = 'Hello, how are you?'        WHERE code = 'fr';
UPDATE public.languages SET greeting_native = 'Hallo, wie geht es dir?',  greeting_english = 'Hello, how are you?'        WHERE code = 'de';

-- Catalogue: shown as "more languages coming". A greeting is honest here; a
-- learnable path would not be.
UPDATE public.languages SET greeting_native = 'Olá, como vai?',           greeting_english = 'Hello, how are you?'        WHERE code = 'pt';
UPDATE public.languages SET greeting_native = 'Ciao, come stai?',         greeting_english = 'Hi, how are you?'           WHERE code = 'it';
UPDATE public.languages SET greeting_native = 'Hallo, hoe gaat het?',     greeting_english = 'Hello, how are you?'        WHERE code = 'nl';
UPDATE public.languages SET greeting_native = 'こんにちは、お元気ですか？',  greeting_english = 'Hello, how are you?'       WHERE code = 'ja';
UPDATE public.languages SET greeting_native = '안녕하세요, 어떻게 지내세요?', greeting_english = 'Hello, how are you?'      WHERE code = 'ko';
UPDATE public.languages SET greeting_native = '你好，你好吗？',            greeting_english = 'Hello, how are you?'        WHERE code = 'zh';
UPDATE public.languages SET greeting_native = 'Halo, apa kabar?',         greeting_english = 'Hello, how are you?'        WHERE code = 'id';
UPDATE public.languages SET greeting_native = 'Habari, hujambo?',         greeting_english = 'Hello, how are you?'        WHERE code = 'sw';
UPDATE public.languages SET greeting_native = 'Oli otya?',                greeting_english = 'Hello, how are you?'        WHERE code = 'lg';
UPDATE public.languages SET greeting_native = 'مرحبا، كيف حالك؟',          greeting_english = 'Hello, how are you?'        WHERE code = 'ar';

-- English is a first-language option rather than a learning target, so it gets a
-- greeting for symmetry and nothing more.
UPDATE public.languages SET greeting_native = 'Hello, how are you?',      greeting_english = 'Hello, how are you?'        WHERE code = 'en';
