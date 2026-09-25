-- ============================================================================
-- One more «hice» sentence
-- ============================================================================
-- The A2 verifier asserts that every past-tense form appears in at least three
-- sentences, because the drill generator refuses to build one below that. «Hice»
-- sat at two after the coverage migration, so the guard caught it.
-- ============================================================================

INSERT INTO public.items (
  language_code, kind, surface, translation_literal, translation_natural,
  grammar_note, part_of_speech, vocab_breakdown, topic, tags,
  difficulty, source, owner_id
)
SELECT
  'es', s.kind, s.surface, s.translation_literal, s.translation_natural,
  s.grammar_note, s.part_of_speech, s.vocab_breakdown, s.topic, s.tags,
  'A2', 'curriculum', NULL
FROM (VALUES
  ('sentence', 'Ayer hice ejercicio por la mañana.',
   'Yesterday I did exercise in the morning.',
   'Yesterday I exercised in the morning.',
   '«Hice» is the irregular first-person preterite of «hacer». «Por la mañana» means in the morning.',
   NULL, '[{"token":"Ayer","lemma":"ayer","gloss":"yesterday","pos":"adverb"},{"token":"hice","lemma":"hacer","gloss":"I did","pos":"verb"}]'::jsonb,
   'narration', ARRAY['past','daily','a2','hacer'])
) AS s(kind, surface, translation_literal, translation_natural, grammar_note, part_of_speech, vocab_breakdown, topic, tags)
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL AND i.language_code = 'es' AND i.kind = s.kind
    AND lower(i.surface) = lower(s.surface)
);

-- Give it an exercise, so it is reachable rather than only countable.
INSERT INTO public.steps (
  id, mission_id, language_code, step_type, item_id, prompt, payload, order_index
)
SELECT
  md5(m.id::text || ':' || i.id::text)::uuid,
  m.id, 'es', 'recall'::text, i.id, 'Say it in Spanish'::text,
  jsonb_build_object('fromLanguage', 'en', 'toLanguage', 'es'),
  9100
FROM public.items i
JOIN public.missions m ON m.language_code = 'es' AND m.slug = 'es-past-what'
WHERE i.owner_id IS NULL
  AND i.surface = 'Ayer hice ejercicio por la mañana.'
ON CONFLICT (id) DO NOTHING;
