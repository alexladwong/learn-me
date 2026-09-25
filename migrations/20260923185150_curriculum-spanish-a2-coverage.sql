-- ============================================================================
-- Spanish A2: drill coverage
-- ============================================================================
-- The A2 unit introduced each past-tense form, but in only one sentence apiece —
-- enough to teach a form and not enough to drill it, since the generator refuses
-- below three. An audit found `comí`, `fui`, `compré`, `perdí`, `viajé`,
-- `estuve` and `duele` all at one or two.
--
-- This adds sentences in real situations, which is also what makes a form stick:
-- the same conjugation met in three different contexts is learned; met once it is
-- only recognised.
--
-- Note on the shape. The staging columns below are in the *same order as the
-- target columns*, and the select maps them one for one. That is not stylistic:
-- the InsForge query parser rejects a statement as "could not be parsed and was
-- rejected for security reasons" when the select list reorders or re-expresses
-- the staging columns, and it gives no hint which construct is at fault. Copying
-- the shape of the coverage migrations that already applied is what gets this
-- through.
-- ============================================================================

INSERT INTO public.items (
  language_code, kind, surface, translation_literal, translation_natural,
  grammar_note, part_of_speech, vocab_breakdown, topic, tags,
  difficulty, source, owner_id
)
SELECT
  'es', s.kind, s.surface, s.translation_literal, s.translation_natural,
  s.grammar_note, s.part_of_speech, s.vocab_breakdown,
  s.topic, s.tags, 'A2', 'curriculum', NULL
FROM (VALUES
  ('sentence', 'Comí una pizza anoche con mis amigos.',
   'I ate a pizza last night with my friends.',
   'I ate a pizza last night with my friends.',
   'Anoche fixes the event in the past, so the preterite is required.',
   NULL, '[{"token":"Comí","lemma":"comer","gloss":"I ate","pos":"verb"}]'::jsonb,
   'narration', ARRAY['past','food','a2','comer']),

  ('sentence', 'Comí algo rápido porque tenía prisa.',
   'I ate something quick because I had hurry.',
   'I ate something quick because I was in a hurry.',
   'Tenía prisa is the imperfect, a background state, against the preterite comí for the event.',
   NULL, '[{"token":"Comí","lemma":"comer","gloss":"I ate","pos":"verb"}]'::jsonb,
   'narration', ARRAY['past','food','a2','comer']),

  ('sentence', 'Fui a la playa el verano pasado.',
   'I went to the beach the summer past.',
   'I went to the beach last summer.',
   'Fui is the preterite of ir here. The identical form for ser means the verb is only clear from context.',
   NULL, '[{"token":"Fui","lemma":"ir","gloss":"I went","pos":"verb"}]'::jsonb,
   'narration', ARRAY['past','travel','a2','ir']),

  ('sentence', 'Fui al médico porque me sentía mal.',
   'I went to the doctor because I felt bad.',
   'I went to the doctor because I felt unwell.',
   'The preterite fui for the completed trip, the imperfect sentía for how you were during it.',
   NULL, '[{"token":"Fui","lemma":"ir","gloss":"I went","pos":"verb"}]'::jsonb,
   'narration', ARRAY['past','health','a2','ir']),

  ('sentence', 'Estuve esperando media hora.',
   'I was waiting half hour.',
   'I was waiting for half an hour.',
   'Estar plus the -ando form describes an action in progress over a bounded period.',
   NULL, '[{"token":"Estuve","lemma":"estar","gloss":"I was","pos":"verb"}]'::jsonb,
   'narration', ARRAY['past','a2','estar']),

  ('sentence', 'Compré dos billetes para el concierto.',
   'I bought two tickets for the concert.',
   'I bought two tickets for the concert.',
   'Regular -ar preterite: compré with an accent on the final e, unlike the present compro.',
   NULL, '[{"token":"Compré","lemma":"comprar","gloss":"I bought","pos":"verb"}]'::jsonb,
   'narration', ARRAY['past','shopping','travel','a2']),

  ('sentence', 'Compré pan y leche de camino a casa.',
   'I bought bread and milk of way to home.',
   'I bought bread and milk on the way home.',
   'De camino a means on the way to.',
   NULL, '[{"token":"Compré","lemma":"comprar","gloss":"I bought","pos":"verb"}]'::jsonb,
   'narration', ARRAY['past','shopping','food','a2']),

  ('sentence', 'Perdí las llaves y no pude entrar.',
   'I lost the keys and I could not enter.',
   'I lost my keys and could not get in.',
   'Perdí is the regular -er preterite. No pude is the irregular preterite of poder.',
   NULL, '[{"token":"Perdí","lemma":"perder","gloss":"I lost","pos":"verb"}]'::jsonb,
   'narration', ARRAY['past','problems','a2']),

  ('sentence', 'Perdí el autobús por dos minutos.',
   'I missed the bus for two minutes.',
   'I missed the bus by two minutes.',
   'Por plus a quantity expresses the margin by which something was missed.',
   NULL, '[{"token":"Perdí","lemma":"perder","gloss":"I missed","pos":"verb"}]'::jsonb,
   'narration', ARRAY['past','travel','problems','a2']),

  ('sentence', 'Viajé solo por primera vez.',
   'I travelled alone for first time.',
   'I travelled alone for the first time.',
   'Solo agrees with the subject: viajé sola if the speaker is female.',
   NULL, '[{"token":"Viajé","lemma":"viajar","gloss":"I travelled","pos":"verb"}]'::jsonb,
   'narration', ARRAY['past','travel','a2']),

  ('sentence', 'Viajé en tren durante seis horas.',
   'I travelled in train during six hours.',
   'I travelled by train for six hours.',
   'En tren for the means, durante for how long. Spanish says en tren, not en el tren.',
   NULL, '[{"token":"Viajé","lemma":"viajar","gloss":"I travelled","pos":"verb"}]'::jsonb,
   'narration', ARRAY['past','travel','a2']),

  ('sentence', 'Me duelen los pies de tanto caminar.',
   'To me hurt the feet of so much walking.',
   'My feet hurt from so much walking.',
   'Plural body parts take duelen, not duele. The verb agrees with the thing that hurts.',
   NULL, '[{"token":"duelen","lemma":"doler","gloss":"hurt","pos":"verb"}]'::jsonb,
   'narration', ARRAY['health','symptoms','a2','doler']),

  ('sentence', 'Me duele el estómago desde esta mañana.',
   'To me hurts the stomach since this morning.',
   'My stomach has hurt since this morning.',
   'Desde esta mañana with the present tense, where English would use the perfect.',
   NULL, '[{"token":"duele","lemma":"doler","gloss":"hurts","pos":"verb"}]'::jsonb,
   'narration', ARRAY['health','symptoms','a2','doler']),

  ('sentence', 'Hice la compra y luego descansé.',
   'I did the shopping and then I rested.',
   'I did the shopping and then rested.',
   'Hice is the irregular first-person preterite of hacer.',
   NULL, '[{"token":"Hice","lemma":"hacer","gloss":"I did","pos":"verb"}]'::jsonb,
   'narration', ARRAY['past','daily','a2','hacer']),

  ('sentence', 'Hice todo lo que pude.',
   'I did all that I could.',
   'I did everything I could.',
   'Lo que means "what" or "that which" and links two clauses.',
   NULL, '[{"token":"Hice","lemma":"hacer","gloss":"I did","pos":"verb"}]'::jsonb,
   'narration', ARRAY['past','a2','hacer'])
) AS s(kind, surface, translation_literal, translation_natural, grammar_note, part_of_speech, vocab_breakdown, topic, tags)
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL AND i.language_code = 'es' AND i.kind = s.kind
    AND lower(i.surface) = lower(s.surface)
);

-- ----------------------------------------------------------------------------
-- Steps for the new sentences
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.step_kind_for(p_position integer, p_total integer)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_position = 1       THEN 'teach'
    WHEN p_position = 2       THEN 'recognise'
    WHEN p_position = p_total THEN 'speak'
    WHEN p_position % 4 = 0   THEN 'listen'
    WHEN p_position % 3 = 0   THEN 'arrange'
    ELSE 'recall'
  END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.step_prompt_for(p_kind text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_kind
    WHEN 'teach'     THEN 'New: read it and listen'
    WHEN 'recognise' THEN 'What does this mean?'
    WHEN 'recall'    THEN 'Say it in Spanish'
    WHEN 'listen'    THEN 'Listen and choose the meaning'
    WHEN 'arrange'   THEN 'Put the words in order'
    WHEN 'speak'     THEN 'Say it out loud'
    ELSE 'Say it in Spanish'
  END;
$$;

INSERT INTO public.steps (
  id, mission_id, language_code, step_type, item_id, prompt, payload, order_index
)
SELECT
  md5(m.id::text || ':' || i.id::text)::uuid,
  m.id,
  'es',
  pg_temp.step_kind_for((9000 + rank.position)::integer, (9000 + rank.position)::integer),
  i.id,
  pg_temp.step_prompt_for('recall'),
  jsonb_build_object('fromLanguage', 'en', 'toLanguage', 'es'),
  (9000 + rank.position)::integer
FROM (
  SELECT
    i.id,
    m.id AS mission_id,
    row_number() OVER (ORDER BY i.surface) AS position
  FROM public.items i
  JOIN public.missions m
    ON m.language_code = 'es'
   AND m.slug = CASE
     WHEN i.tags && ARRAY['travel'] THEN 'es-travel-problems'
     WHEN i.tags && ARRAY['health'] THEN 'es-health-symptoms'
     WHEN i.tags && ARRAY['hacer'] THEN 'es-past-what'
     ELSE 'es-past-where'
   END
  WHERE i.owner_id IS NULL
    AND i.language_code = 'es'
    AND i.difficulty = 'A2'
    AND i.surface IN (
      'Comí una pizza anoche con mis amigos.',
      'Comí algo rápido porque tenía prisa.',
      'Fui a la playa el verano pasado.',
      'Fui al médico porque me sentía mal.',
      'Estuve esperando media hora.',
      'Compré dos billetes para el concierto.',
      'Compré pan y leche de camino a casa.',
      'Perdí las llaves y no pude entrar.',
      'Perdí el autobús por dos minutos.',
      'Viajé solo por primera vez.',
      'Viajé en tren durante seis horas.',
      'Me duelen los pies de tanto caminar.',
      'Me duele el estómago desde esta mañana.',
      'Hice la compra y luego descansé.',
      'Hice todo lo que pude.'
    )
) rank
JOIN public.missions m ON m.id = rank.mission_id
JOIN public.items i ON i.id = rank.id
ON CONFLICT (id) DO NOTHING;
