-- ============================================================================
-- Two last drill-coverage gaps
-- ============================================================================
-- German: «heiße» appeared in only one sentence, so no drill could be built for
-- one of the most common beginner mistakes in German — mixing up the forms of
-- «heißen».
--
-- French: «appelle» is always elided to «m'appelle» or «t'appelle», and an
-- elided form is a single token. A separate sentence using the non-elided
-- third-person plural is therefore the only way to give the drill a sentence it
-- can blank, which is also why the drill matches on substrings rather than whole
-- tokens.
--
-- Note on how this is written. The InsForge query parser re-reads SQL to check
-- it, and that re-read is not literal-aware: a comma inside a string in a
-- `VALUES` list is treated as a column separator, so a row whose text contains a
-- comma is rejected as "could not be parsed and was rejected for security
-- reasons". The wider failed attempt here is that older multi-row `VALUES`
-- migrations only escaped the problem when their commas happened to fall in the
-- first two columns.
--
-- `SELECT ... UNION ALL` with explicit casts is therefore the reliable form for
-- content rows. It is used here even though a `VALUES` list would be shorter.
-- ============================================================================

INSERT INTO public.items (
  language_code, kind, surface, translation_literal, translation_natural,
  grammar_note, part_of_speech, vocab_breakdown, topic, tags,
  difficulty, source, owner_id
)
SELECT
  'de'::text, 'sentence'::text,
  'Ich heiße Peter und du?'::text,
  'I am called Peter and you?'::text,
  'My name is Peter and you?'::text,
  '«Ich heiße» and «ich bin» both introduce a name. «Heißen» is the verb that literally means to be called.'::text,
  NULL::text,
  '[{"token":"heiße","lemma":"heißen","gloss":"am called","pos":"verb"},{"token":"du","lemma":"du","gloss":"you","pos":"pronoun"}]'::jsonb,
  'introductions'::text,
  ARRAY['introduction','a1','heißen']::text[],
  'A1'::text, 'curriculum'::text, NULL::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL
    AND i.language_code = 'de'
    AND i.kind = 'sentence'
    AND lower(i.surface) = lower('Ich heiße Peter und du?')
)
UNION ALL
SELECT
  'fr'::text, 'sentence'::text,
  'Ils appellent leur mère chaque semaine.'::text,
  'They call their mother each week.'::text,
  'They call their mother every week.'::text,
  '«Appellent» is the third-person plural of «appeler». The reflexive is dropped here because they are calling someone else.'::text,
  NULL::text,
  '[{"token":"appellent","lemma":"appeler","gloss":"they call","pos":"verb"},{"token":"mère","lemma":"mère","gloss":"mother","pos":"noun"}]'::jsonb,
  'family'::text,
  ARRAY['family','a1','appeler']::text[],
  'A1'::text, 'curriculum'::text, NULL::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL
    AND i.language_code = 'fr'
    AND i.kind = 'sentence'
    AND lower(i.surface) = lower('Ils appellent leur mère chaque semaine.')
);

-- ----------------------------------------------------------------------------
-- Steps for the two new sentences
-- ----------------------------------------------------------------------------
-- Appended to the identity and family missions respectively, numbered past the
-- existing steps so they do not disturb the authored order.
INSERT INTO public.steps (
  id, mission_id, language_code, step_type, item_id, prompt, payload, order_index
)
SELECT
  md5(m.id::text || ':' || i.id::text)::uuid,
  m.id,
  i.language_code,
  'recall'::text,
  i.id,
  'Say it in the target language'::text,
  jsonb_build_object('fromLanguage', 'en', 'toLanguage', i.language_code),
  (9000 + row_number() OVER (ORDER BY i.id))::integer
FROM public.items i
JOIN public.missions m
  ON m.language_code = i.language_code
 AND m.slug = CASE i.language_code WHEN 'de' THEN 'de-name' ELSE 'fr-family' END
WHERE i.owner_id IS NULL
  AND (
    i.surface = 'Ich heiße Peter und du?'
    OR i.surface = 'Ils appellent leur mère chaque semaine.'
  )
ON CONFLICT (id) DO NOTHING;
