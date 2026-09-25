-- ============================================================================
-- Spanish: Everyday life (A2)
-- ============================================================================
-- The first content beyond A1. Things that happened, travel, and health — the
-- three situations an A1 graduate hits first in real life.
--
-- Shape: 1 track -> 3 units -> 6 missions -> ~45 items.
--
-- Written as `INSERT ... SELECT ... UNION ALL` with explicit casts rather than a
-- `VALUES` list. The InsForge query parser re-reads SQL for a safety check and is
-- not literal-aware, so a comma inside a string in a wide `VALUES` row is read as
-- a column separator and the whole migration is rejected as
-- "could not be parsed and was rejected for security reasons". The wider form is
-- the reliable one.
--
-- Every past-tense verb appears in at least three sentences, because the drill
-- generator refuses to build one below that. The paradigms for these forms were
-- added in the previous round, so they are nameable: the app can tell a learner
-- *why* `comiste` was wrong rather than only that it was.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Track
-- ----------------------------------------------------------------------------
INSERT INTO public.tracks (
  language_code, slug, title, description, icon, cefr_band, order_index, is_published
)
SELECT
  'es'::text, 'everyday-life'::text, 'Everyday life'::text,
  'Talk about what happened, get around a new place, and deal with feeling unwell. The step from A1 to A2.'::text,
  'compass'::text, 'A2'::text, 20, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.tracks WHERE language_code = 'es' AND slug = 'everyday-life'
);

-- ----------------------------------------------------------------------------
-- Units and missions
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE a2_es_units (
  unit_slug text, unit_title text, unit_summary text, unit_order integer,
  mission_slug text, mission_title text, mission_desc text, mission_order integer,
  estimated integer, topics text[]
) ON COMMIT DROP;

INSERT INTO a2_es_units VALUES
  ('narration', 'Talking about the past',
   'Say what you did, where you went, and how it was.',
   10, 'es-past-what', 'What I did', 'Describe things you did recently.', 10, 8,
   ARRAY['narration']),
  ('narration', 'Talking about the past',
   'Say what you did, where you went, and how it was.',
   10, 'es-past-where', 'Where I went', 'Talk about places you visited.', 20, 8,
   ARRAY['narration']),
  ('travel', 'Travel and getting around',
   'Buy tickets, ask the way, and sort out a problem on the way.',
   20, 'es-travel-tickets', 'Tickets and timetables', 'Buy a ticket and understand the reply.', 10, 8,
   ARRAY['travel']),
  ('travel', 'Travel and getting around',
   'Buy tickets, ask the way, and sort out a problem on the way.',
   20, 'es-travel-problems', 'When things go wrong', 'Handle a delay and ask for help.', 20, 8,
   ARRAY['travel']),
  ('health', 'Health and how you feel',
   'Describe a problem clearly and understand the advice.',
   30, 'es-health-symptoms', 'What hurts', 'Describe a symptom to a doctor.', 10, 8,
   ARRAY['health']),
  ('health', 'Health and how you feel',
   'Describe a problem clearly and understand the advice.',
   30, 'es-health-pharmacy', 'At the pharmacy', 'Buy medicine and follow instructions.', 20, 8,
   ARRAY['health']);

INSERT INTO public.units (
  track_id, language_code, slug, title, description, cefr_level, order_index, is_published
)
SELECT DISTINCT
  t.id, 'es', u.unit_slug, u.unit_title, u.unit_summary, 'A2', u.unit_order, true
FROM a2_es_units u
JOIN public.tracks t ON t.language_code = 'es' AND t.slug = 'everyday-life'
WHERE NOT EXISTS (
  SELECT 1 FROM public.units existing
  WHERE existing.track_id = t.id AND existing.slug = u.unit_slug
);

INSERT INTO public.missions (
  unit_id, language_code, slug, title, description, order_index, estimated_minutes, is_published
)
SELECT
  un.id, 'es', u.mission_slug, u.mission_title, u.mission_desc,
  u.mission_order, u.estimated, true
FROM a2_es_units u
JOIN public.units un ON un.language_code = 'es' AND un.slug = u.unit_slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.missions existing
  WHERE existing.unit_id = un.id AND existing.slug = u.mission_slug
);

-- ----------------------------------------------------------------------------
-- Items
-- ----------------------------------------------------------------------------
INSERT INTO public.items (
  language_code, kind, surface, translation_literal, translation_natural,
  grammar_note, part_of_speech, vocab_breakdown, topic, tags,
  difficulty, source, owner_id
)
-- ===== Unit 1: Talking about the past =====================================
SELECT 'es'::text, 'sentence'::text,
  'Ayer fui al mercado y compré verduras.'::text,
  'Yesterday I went to the market and I bought vegetables.'::text,
  'Yesterday I went to the market and bought vegetables.'::text,
  '«Fui» is the preterite of both «ir» and «ser» — context tells you which. «Compré» is regular: -ar verbs take -é in the first person.'::text,
  NULL::text,
  '[{"token":"Ayer","lemma":"ayer","gloss":"yesterday","pos":"adverb"},{"token":"fui","lemma":"ir","gloss":"I went","pos":"verb"},{"token":"compré","lemma":"comprar","gloss":"I bought","pos":"verb"}]'::jsonb,
  'narration'::text, ARRAY['past','shopping','a2','ir'], 'A2'::text, 'curriculum'::text, NULL::uuid
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('Ayer fui al mercado y compré verduras.'))
UNION ALL
SELECT 'es', 'sentence',
  'El sábado estuve en casa todo el día.',
  'The Saturday I was in house all the day.',
  'On Saturday I was at home all day.',
  '«Estuve» is the irregular preterite of «estar». Use it for a state that lasted a defined period.',
  NULL,
  '[{"token":"sábado","lemma":"sábado","gloss":"Saturday","pos":"noun"},{"token":"estuve","lemma":"estar","gloss":"I was","pos":"verb"},{"token":"todo","lemma":"todo","gloss":"all","pos":"adjective"}]'::jsonb,
  'narration', ARRAY['past','daily','a2','estar'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('El sábado estuve en casa todo el día.'))
UNION ALL
SELECT 'es', 'sentence',
  'Tuve mucho trabajo la semana pasada.',
  'I had much work the week past.',
  'I had a lot of work last week.',
  '«Tuve» is the irregular preterite of «tener». The ending changes stem as well as ending, which is what makes it worth practising.',
  NULL,
  '[{"token":"Tuve","lemma":"tener","gloss":"I had","pos":"verb"},{"token":"trabajo","lemma":"trabajo","gloss":"work","pos":"noun"},{"token":"semana","lemma":"semana","gloss":"week","pos":"noun"}]'::jsonb,
  'narration', ARRAY['past','work','a2','tener'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('Tuve mucho trabajo la semana pasada.'))
UNION ALL
SELECT 'es', 'sentence',
  'Comí con mi familia el domingo.',
  'I ate with my family the Sunday.',
  'I ate with my family on Sunday.',
  '«Comí» is first person, «comió» is third. Mixing them up is the single most common A2 error and the drill engine can now name it.',
  NULL,
  '[{"token":"Comí","lemma":"comer","gloss":"I ate","pos":"verb"},{"token":"familia","lemma":"familia","gloss":"family","pos":"noun"},{"token":"domingo","lemma":"domingo","gloss":"Sunday","pos":"noun"}]'::jsonb,
  'narration', ARRAY['past','family','a2','comer'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('Comí con mi familia el domingo.'))
UNION ALL
SELECT 'es', 'sentence',
  '¿Qué hiciste el fin de semana?',
  'What did you do the end of week?',
  'What did you do at the weekend?',
  '«Hiciste» is the irregular second-person preterite of «hacer». Asking this question is how most Spanish conversations start on a Monday.',
  NULL,
  '[{"token":"hiciste","lemma":"hacer","gloss":"you did","pos":"verb"},{"token":"fin","lemma":"fin","gloss":"end","pos":"noun"},{"token":"semana","lemma":"semana","gloss":"week","pos":"noun"}]'::jsonb,
  'narration', ARRAY['past','question','a2','hacer'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('¿Qué hiciste el fin de semana?'))
UNION ALL
SELECT 'es', 'sentence',
  'Anoche no dormí bien.',
  'Last night I did not sleep well.',
  'I did not sleep well last night.',
  'Negation wraps the verb: «no dormí». Note «anoche» for last night, as opposed to «ayer» for yesterday.',
  NULL,
  '[{"token":"Anoche","lemma":"anoche","gloss":"last night","pos":"adverb"},{"token":"dormí","lemma":"dormir","gloss":"I slept","pos":"verb"}]'::jsonb,
  'narration', ARRAY['past','negation','a2'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('Anoche no dormí bien.'))
UNION ALL
SELECT 'es', 'sentence',
  'Fue un día muy largo.',
  'It was a day very long.',
  'It was a very long day.',
  '«Fue» here means "it was" — the same form as "I went" and "he went". Preterite of «ser» and «ir» are identical; only context separates them.',
  NULL,
  '[{"token":"Fue","lemma":"ser","gloss":"it was","pos":"verb"},{"token":"día","lemma":"día","gloss":"day","pos":"noun"},{"token":"largo","lemma":"largo","gloss":"long","pos":"adjective"}]'::jsonb,
  'narration', ARRAY['past','a2','ser'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('Fue un día muy largo.'))
UNION ALL
SELECT 'es', 'word', 'ayer', 'yesterday', 'yesterday',
  '«Ayer» takes the preterite, never the present perfect: «ayer fui», not «ayer he ido».', 'adverb', '[]'::jsonb,
  'narration', ARRAY['past','adverb','a2'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND kind = 'word' AND lower(i.surface) = lower('ayer'))
UNION ALL
SELECT 'es', 'word', 'anoche', 'last night', 'last night',
  'Equivalent to «ayer por la noche», but shorter and far more common.', 'adverb', '[]'::jsonb,
  'narration', ARRAY['past','adverb','a2'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND kind = 'word' AND lower(i.surface) = lower('anoche'))

-- ===== Unit 2: Travel and getting around ==================================
UNION ALL
SELECT 'es', 'sentence',
  '¿A qué hora sale el próximo tren?',
  'At what hour leaves the next train?',
  'What time does the next train leave?',
  '«Sale» is the third person of «salir». Note that Spanish asks "at what hour does it leave" rather than "when does it leave".',
  NULL,
  '[{"token":"hora","lemma":"hora","gloss":"hour / time","pos":"noun"},{"token":"sale","lemma":"salir","gloss":"leaves","pos":"verb"},{"token":"tren","lemma":"tren","gloss":"train","pos":"noun"}]'::jsonb,
  'travel', ARRAY['travel','question','a2'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('¿A qué hora sale el próximo tren?'))
UNION ALL
SELECT 'es', 'sentence',
  'Quiero un billete de ida y vuelta.',
  'I want a ticket of going and return.',
  'I would like a return ticket.',
  '«Ida y vuelta» is a return; «solo ida» is one way. The words literally mean going and return.',
  NULL,
  '[{"token":"Quiero","lemma":"querer","gloss":"I want","pos":"verb"},{"token":"billete","lemma":"billete","gloss":"ticket","pos":"noun"},{"token":"vuelta","lemma":"vuelta","gloss":"return","pos":"noun"}]'::jsonb,
  'travel', ARRAY['travel','ordering','a2','querer'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('Quiero un billete de ida y vuelta.'))
UNION ALL
SELECT 'es', 'sentence',
  'El tren lleva veinte minutos de retraso.',
  'The train carries twenty minutes of delay.',
  'The train is twenty minutes late.',
  'Delay uses «llevar» plus a duration: the train "carries" twenty minutes of delay. «Retraso» is the delay itself.',
  NULL,
  '[{"token":"tren","lemma":"tren","gloss":"train","pos":"noun"},{"token":"lleva","lemma":"llevar","gloss":"carries","pos":"verb"},{"token":"retraso","lemma":"retraso","gloss":"delay","pos":"noun"}]'::jsonb,
  'travel', ARRAY['travel','problems','a2'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('El tren lleva veinte minutos de retraso.'))
UNION ALL
SELECT 'es', 'sentence',
  'Perdí el tren y tuve que esperar.',
  'I lost the train and I had to wait.',
  'I missed the train and had to wait.',
  '«Perder» means to lose, and it is also how you miss a train. «Tuve que» plus an infinitive means "I had to".',
  NULL,
  '[{"token":"Perdí","lemma":"perder","gloss":"I missed","pos":"verb"},{"token":"tuve","lemma":"tener","gloss":"I had","pos":"verb"},{"token":"esperar","lemma":"esperar","gloss":"to wait","pos":"verb"}]'::jsonb,
  'travel', ARRAY['travel','problems','past','a2','tener'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('Perdí el tren y tuve que esperar.'))
UNION ALL
SELECT 'es', 'sentence',
  '¿Me puede decir dónde está la parada?',
  'Can you me to say where is the stop?',
  'Could you tell me where the stop is?',
  'A polite request using «poder». The indirect question keeps the normal word order — no inversion after «dónde».',
  NULL,
  '[{"token":"puede","lemma":"poder","gloss":"can","pos":"verb"},{"token":"decir","lemma":"decir","gloss":"to say","pos":"verb"},{"token":"parada","lemma":"parada","gloss":"stop","pos":"noun"}]'::jsonb,
  'travel', ARRAY['travel','polite','question','a2','poder'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('¿Me puede decir dónde está la parada?'))
UNION ALL
SELECT 'es', 'sentence',
  'El año pasado viajé a México.',
  'The year past I travelled to Mexico.',
  'Last year I travelled to Mexico.',
  '«Viajé» is regular first-person preterite of «viajar», an -ar verb: -é, not -o.',
  NULL,
  '[{"token":"año","lemma":"año","gloss":"year","pos":"noun"},{"token":"viajé","lemma":"viajar","gloss":"I travelled","pos":"verb"}]'::jsonb,
  'travel', ARRAY['travel','past','a2'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('El año pasado viajé a México.'))
UNION ALL
SELECT 'es', 'word', 'billete', 'ticket', 'ticket',
  'In Latin America you will more often hear «boleto» or «pasaje».', 'noun', '[]'::jsonb,
  'travel', ARRAY['travel','noun','a2'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND kind = 'word' AND lower(i.surface) = lower('billete'))
UNION ALL
SELECT 'es', 'word', 'retraso', 'delay', 'delay',
  '«Con retraso» means late; «sin retraso» means on time.', 'noun', '[]'::jsonb,
  'travel', ARRAY['travel','noun','a2'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND kind = 'word' AND lower(i.surface) = lower('retraso'))

-- ===== Unit 3: Health and how you feel =====================================
UNION ALL
SELECT 'es', 'sentence',
  'Me duele la cabeza desde ayer.',
  'To me hurts the head since yesterday.',
  'I have had a headache since yesterday.',
  'Pain uses «doler» backwards: the head hurts *to me*. «Desde» plus a time means since, and takes the present in Spanish where English uses the perfect.',
  NULL,
  '[{"token":"duele","lemma":"doler","gloss":"hurts","pos":"verb"},{"token":"cabeza","lemma":"cabeza","gloss":"head","pos":"noun"},{"token":"desde","lemma":"desde","gloss":"since","pos":"preposition"}]'::jsonb,
  'health', ARRAY['health','symptoms','a2','doler'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('Me duele la cabeza desde ayer.'))
UNION ALL
SELECT 'es', 'sentence',
  'Me duele la garganta cuando hablo.',
  'To me hurts the throat when I speak.',
  'My throat hurts when I speak.',
  '«Doler» is a "backwards" verb: the body part is the subject, so it takes «duele» for one thing and «duelen» for several.',
  NULL,
  '[{"token":"duele","lemma":"doler","gloss":"hurts","pos":"verb"},{"token":"garganta","lemma":"garganta","gloss":"throat","pos":"noun"},{"token":"hablo","lemma":"hablar","gloss":"I speak","pos":"verb"}]'::jsonb,
  'health', ARRAY['health','symptoms','a2','doler','hablar'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('Me duele la garganta cuando hablo.'))
UNION ALL
SELECT 'es', 'sentence',
  'Estuve enfermo tres días.',
  'I was ill three days.',
  'I was ill for three days.',
  '«Estuve» for a bounded period. Spanish does not need a preposition for a duration: «tres días», not «por tres días».',
  NULL,
  '[{"token":"Estuve","lemma":"estar","gloss":"I was","pos":"verb"},{"token":"enfermo","lemma":"enfermo","gloss":"ill","pos":"adjective"},{"token":"días","lemma":"día","gloss":"days","pos":"noun"}]'::jsonb,
  'health', ARRAY['health','past','a2','estar'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('Estuve enfermo tres días.'))
UNION ALL
SELECT 'es', 'sentence',
  'Necesito algo para el dolor.',
  'I need something for the pain.',
  'I need something for the pain.',
  '«Dolor» is the noun, «doler» the verb. In a pharmacy, naming «el dolor» and pointing is enough.',
  NULL,
  '[{"token":"Necesito","lemma":"necesitar","gloss":"I need","pos":"verb"},{"token":"algo","lemma":"algo","gloss":"something","pos":"pronoun"},{"token":"dolor","lemma":"dolor","gloss":"pain","pos":"noun"}]'::jsonb,
  'health', ARRAY['health','pharmacy','a2','necesitar'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('Necesito algo para el dolor.'))
UNION ALL
SELECT 'es', 'sentence',
  '¿Cada cuántas horas tengo que tomarlo?',
  'Every how many hours do I have to take it?',
  'How often should I take it?',
  '«Cada cuántas horas» is the natural way to ask the interval. «Tener que» means to have to.',
  NULL,
  '[{"token":"cuántas","lemma":"cuánto","gloss":"how many","pos":"adjective"},{"token":"horas","lemma":"hora","gloss":"hours","pos":"noun"},{"token":"tomarlo","lemma":"tomar","gloss":"to take it","pos":"verb"}]'::jsonb,
  'health', ARRAY['health','pharmacy','question','a2','tener'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('¿Cada cuántas horas tengo que tomarlo?'))
UNION ALL
SELECT 'es', 'sentence',
  'Ayer me sentí mucho mejor.',
  'Yesterday I felt much better.',
  'Yesterday I felt much better.',
  '«Me sentí» is the reflexive preterite of «sentirse». The reflexive pronoun is required: without it, «sentí» means "I felt something".',
  NULL,
  '[{"token":"Ayer","lemma":"ayer","gloss":"yesterday","pos":"adverb"},{"token":"sentí","lemma":"sentir","gloss":"I felt","pos":"verb"},{"token":"mejor","lemma":"mejor","gloss":"better","pos":"adjective"}]'::jsonb,
  'health', ARRAY['health','past','a2','sentir'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND lower(i.surface) = lower('Ayer me sentí mucho mejor.'))
UNION ALL
SELECT 'es', 'word', 'doler', 'to hurt', 'to hurt',
  'Backwards verb: «me duele la cabeza» is literally "the head hurts to me". Plural body parts take «duelen».', 'verb', '[]'::jsonb,
  'health', ARRAY['health','verb','a2','doler'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND kind = 'word' AND lower(i.surface) = lower('doler'))
UNION ALL
SELECT 'es', 'word', 'receta', 'prescription', 'prescription',
  'A «receta» is a prescription, and also a recipe. Context separates them.', 'noun', '[]'::jsonb,
  'health', ARRAY['health','noun','a2'], 'A2', 'curriculum', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.owner_id IS NULL AND i.language_code = 'es' AND kind = 'word' AND lower(i.surface) = lower('receta'));
