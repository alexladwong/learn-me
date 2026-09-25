-- ============================================================================
-- Spanish: Daily routines (A1) — added to close a content gap
-- ============================================================================
-- Why this exists, specifically:
--
-- The confusion-drill generator builds exercises from sentences the learner is
-- already studying that contain the form they keep getting wrong. It needs at
-- least three such sentences before it will offer a drill, because a drill built
-- from one sentence is not practice.
--
-- An audit of the original curriculum found five first-person verbs — `como`,
-- `bebo`, `quiero`, `tengo`, `hablo` — each appearing in exactly **one**
-- sentence. That is enough to teach from and not enough to drill, so the
-- product's headline feature would have been unavailable for the exact mistakes
-- it is designed to catch.
--
-- This unit adds two more sentences per verb, spread across natural daily
-- contexts, which brings every one of them to the three-sentence floor. It is
-- pedagogically sensible on its own terms: a daily-routines unit is standard A1
-- content, and the repetition across contexts is what makes a form stick.
-- ============================================================================

CREATE TEMP TABLE seed_daily (
  kind                text,
  surface             text,
  translation_literal text,
  translation_natural text,
  grammar_note        text,
  part_of_speech      text,
  vocab_breakdown     jsonb,
  topic               text,
  tags                text[]
) ON COMMIT DROP;

INSERT INTO seed_daily (
  kind, surface, translation_literal, translation_natural,
  grammar_note, part_of_speech, vocab_breakdown, topic, tags
) VALUES
  -- ===== Unit 5: Daily routines ============================================
  -- comer, first person: "como" appears in three sentences after this migration.
  ('sentence', 'Como fruta por la mañana.', 'I eat fruit in the morning.', 'I eat fruit in the morning.',
   '«Como» is the first-person form of «comer». Watch the trap: «comes» is you eat, «comemos» is we eat.',
   NULL,
   '[{"token":"Como","lemma":"comer","gloss":"I eat","pos":"verb"},
     {"token":"fruta","lemma":"fruta","gloss":"fruit","pos":"noun"},
     {"token":"mañana","lemma":"mañana","gloss":"morning","pos":"noun"}]'::jsonb,
   'daily', ARRAY['daily','food','a1','comer']),

  ('sentence', 'Como con mi familia los domingos.', 'I eat with my family the Sundays.', 'I eat with my family on Sundays.',
   'Days of the week take «los» in the plural for a habit: «los domingos» means every Sunday.',
   NULL,
   '[{"token":"Como","lemma":"comer","gloss":"I eat","pos":"verb"},
     {"token":"familia","lemma":"familia","gloss":"family","pos":"noun"},
     {"token":"domingos","lemma":"domingo","gloss":"Sundays","pos":"noun"}]'::jsonb,
   'daily', ARRAY['daily','family','a1','comer']),

  -- beber, first person.
  ('sentence', 'Bebo agua con la comida.', 'I drink water with the meal.', 'I drink water with meals.',
   '«Beber» and «tomar» both mean to drink; «tomar» is more common in Latin America.',
   NULL,
   '[{"token":"Bebo","lemma":"beber","gloss":"I drink","pos":"verb"},
     {"token":"agua","lemma":"agua","gloss":"water","pos":"noun"},
     {"token":"comida","lemma":"comida","gloss":"meal / food","pos":"noun"}]'::jsonb,
   'daily', ARRAY['daily','drink','a1','beber']),

  ('sentence', 'Bebo café todas las mañanas.', 'I drink coffee all the mornings.', 'I drink coffee every morning.',
   '«Todas las mañanas» is the plural habit form; «toda la mañana» would mean all morning long.',
   NULL,
   '[{"token":"Bebo","lemma":"beber","gloss":"I drink","pos":"verb"},
     {"token":"café","lemma":"café","gloss":"coffee","pos":"noun"},
     {"token":"mañanas","lemma":"mañana","gloss":"mornings","pos":"noun"}]'::jsonb,
   'daily', ARRAY['daily','drink','a1','beber']),

  -- tener, first person.
  ('sentence', 'Tengo una hermana pequeña.', 'I have a sister small.', 'I have a younger sister.',
   'Adjectives usually follow the noun in Spanish: «hermana pequeña», not «pequeña hermana».',
   NULL,
   '[{"token":"Tengo","lemma":"tener","gloss":"I have","pos":"verb"},
     {"token":"hermana","lemma":"hermano","gloss":"sister","pos":"noun"},
     {"token":"pequeña","lemma":"pequeño","gloss":"small / young","pos":"adjective"}]'::jsonb,
   'daily', ARRAY['daily','family','a1','tener']),

  ('sentence', 'Tengo veinte años.', 'I have twenty years.', 'I am twenty years old.',
   'Age uses «tener», not «ser»: you *have* years in Spanish, you do not *be* them.',
   NULL,
   '[{"token":"Tengo","lemma":"tener","gloss":"I have","pos":"verb"},
     {"token":"veinte","lemma":"veinte","gloss":"twenty","pos":"number"},
     {"token":"años","lemma":"año","gloss":"years","pos":"noun"}]'::jsonb,
   'daily', ARRAY['daily','numbers','a1','tener']),

  -- querer, first person.
  ('sentence', 'Quiero aprender español.', 'I want to learn Spanish.', 'I want to learn Spanish.',
   'A second verb after «querer» stays in the infinitive: «quiero aprender», never «quiero aprendo».',
   NULL,
   '[{"token":"Quiero","lemma":"querer","gloss":"I want","pos":"verb"},
     {"token":"aprender","lemma":"aprender","gloss":"to learn","pos":"verb"},
     {"token":"español","lemma":"español","gloss":"Spanish","pos":"noun"}]'::jsonb,
   'daily', ARRAY['daily','goals','a1','querer']),

  ('sentence', 'Quiero ir al mercado hoy.', 'I want to go to the market today.', 'I want to go to the market today.',
   '«Al» is «a» + «el», and it is required: «ir al mercado», not «ir a el mercado».',
   NULL,
   '[{"token":"Quiero","lemma":"querer","gloss":"I want","pos":"verb"},
     {"token":"ir","lemma":"ir","gloss":"to go","pos":"verb"},
     {"token":"mercado","lemma":"mercado","gloss":"market","pos":"noun"},
     {"token":"hoy","lemma":"hoy","gloss":"today","pos":"adverb"}]'::jsonb,
   'daily', ARRAY['daily','shopping','a1','querer']),

  -- hablar, first person.
  ('sentence', 'Hablo con mi madre cada día.', 'I speak with my mother each day.', 'I speak to my mother every day.',
   '«Cada día» is singular and invariable; there is no «cada días».',
   NULL,
   '[{"token":"Hablo","lemma":"hablar","gloss":"I speak","pos":"verb"},
     {"token":"madre","lemma":"madre","gloss":"mother","pos":"noun"},
     {"token":"cada","lemma":"cada","gloss":"each / every","pos":"adjective"},
     {"token":"día","lemma":"día","gloss":"day","pos":"noun"}]'::jsonb,
   'daily', ARRAY['daily','family','a1','hablar']),

  ('sentence', 'Hablo español y un poco de inglés.', 'I speak Spanish and a little of English.', 'I speak Spanish and a little English.',
   '«Un poco de» plus a noun means "a little"; «un poco» alone is an adverb: «hablo un poco».',
   NULL,
   '[{"token":"Hablo","lemma":"hablar","gloss":"I speak","pos":"verb"},
     {"token":"español","lemma":"español","gloss":"Spanish","pos":"noun"},
     {"token":"inglés","lemma":"inglés","gloss":"English","pos":"noun"}]'::jsonb,
   'daily', ARRAY['daily','language','a1','hablar']),

  -- beber, first person, negative — the third sentence for this verb.
  ('sentence', 'No bebo café por la noche.', 'I do not drink coffee in the night.', 'I don''t drink coffee at night.',
   'Negation is «no» before the verb. «Por la noche» is at night; «de la noche» describes the night itself.',
   NULL,
   '[{"token":"No","lemma":"no","gloss":"not","pos":"adverb"},
     {"token":"bebo","lemma":"beber","gloss":"I drink","pos":"verb"},
     {"token":"café","lemma":"café","gloss":"coffee","pos":"noun"},
     {"token":"noche","lemma":"noche","gloss":"night","pos":"noun"}]'::jsonb,
   'daily', ARRAY['daily','drink','negation','a1','beber']),

  -- A verb the drill can also work with: ir, first person.
  ('sentence', 'Voy al trabajo en autobús.', 'I go to the work in bus.', 'I go to work by bus.',
   'The first-person form of «ir» is «voy», not «vo». Means of transport take «en».',
   NULL,
   '[{"token":"Voy","lemma":"ir","gloss":"I go","pos":"verb"},
     {"token":"trabajo","lemma":"trabajo","gloss":"work","pos":"noun"},
     {"token":"autobús","lemma":"autobús","gloss":"bus","pos":"noun"}]'::jsonb,
   'daily', ARRAY['daily','work','a1','ir']),

  ('sentence', 'Voy a casa ahora.', 'I go to home now.', 'I''m going home now.',
   '«Ir a» plus a place is the near future too: «voy a comer» means I am going to eat.',
   NULL,
   '[{"token":"Voy","lemma":"ir","gloss":"I go","pos":"verb"},
     {"token":"casa","lemma":"casa","gloss":"home / house","pos":"noun"},
     {"token":"ahora","lemma":"ahora","gloss":"now","pos":"adverb"}]'::jsonb,
   'daily', ARRAY['daily','a1','ir']),

  ('sentence', 'Voy a la universidad cada día.', 'I go to the university each day.', 'I go to university every day.',
   '«A la» for a feminine place, «al» for a masculine one: «voy a la universidad» but «voy al mercado».',
   NULL,
   '[{"token":"Voy","lemma":"ir","gloss":"I go","pos":"verb"},
     {"token":"universidad","lemma":"universidad","gloss":"university","pos":"noun"},
     {"token":"cada","lemma":"cada","gloss":"each","pos":"adjective"},
     {"token":"día","lemma":"día","gloss":"day","pos":"noun"}]'::jsonb,
   'daily', ARRAY['daily','university','a1','ir']),

  -- estar, first person — three sentences so the drill can use it.
  ('sentence', 'Estoy en casa.', 'I am in home.', 'I am at home.',
   'Location takes «estar», never «ser». Compare «Soy de casa» — I am from home.',
   NULL,
   '[{"token":"Estoy","lemma":"estar","gloss":"I am","pos":"verb"},
     {"token":"casa","lemma":"casa","gloss":"home","pos":"noun"}]'::jsonb,
   'daily', ARRAY['daily','a1','estar']),

  ('sentence', 'Estoy muy cansado hoy.', 'I am very tired today.', 'I am very tired today.',
   'Temporary states take «estar». «Soy cansado» would describe a permanently tiresome person.',
   NULL,
   '[{"token":"Estoy","lemma":"estar","gloss":"I am","pos":"verb"},
     {"token":"muy","lemma":"muy","gloss":"very","pos":"adverb"},
     {"token":"cansado","lemma":"cansado","gloss":"tired","pos":"adjective"},
     {"token":"hoy","lemma":"hoy","gloss":"today","pos":"adverb"}]'::jsonb,
   'daily', ARRAY['daily','feelings','a1','estar']),

  ('sentence', 'Estoy aprendiendo español.', 'I am learning Spanish.', 'I am learning Spanish.',
   '«Estar» plus the -ando/-iendo form is the present continuous: it is happening right now.',
   NULL,
   '[{"token":"Estoy","lemma":"estar","gloss":"I am","pos":"verb"},
     {"token":"aprendiendo","lemma":"aprender","gloss":"learning","pos":"verb"},
     {"token":"español","lemma":"español","gloss":"Spanish","pos":"noun"}]'::jsonb,
   'daily', ARRAY['daily','a1','estar']),

  -- A word for the bank, so the unit is not only sentences.
  ('word', 'rutina', 'routine', 'routine',
   '«La rutina diaria» is the daily routine — a very common phrase in A1 courses.',
   'noun', '[]'::jsonb, 'daily', ARRAY['daily','noun','a1']),

  ('word', 'desayuno', 'breakfast', 'breakfast',
   'The meal is «el desayuno»; the verb is «desayunar» — I have breakfast is «desayuno».',
   'noun', '[]'::jsonb, 'daily', ARRAY['daily','food','noun','a1']),

  ('word', 'siempre', 'always', 'always',
   'The opposite is «nunca». Both go before the verb or after it, but never between auxiliary and verb.',
   'adverb', '[]'::jsonb, 'daily', ARRAY['daily','adverb','a1']);

-- ----------------------------------------------------------------------------
-- Unit, missions and items
-- ----------------------------------------------------------------------------
INSERT INTO public.units (
  track_id, language_code, slug, title, description, cefr_level, order_index, is_published
)
SELECT
  t.id, 'es', 'daily', 'Daily routines',
  'Talk about your day: what you eat, drink, want and where you go.',
  'A1', 50, true
FROM public.tracks t
WHERE t.language_code = 'es' AND t.slug = 'foundations'
  AND NOT EXISTS (
    SELECT 1 FROM public.units u WHERE u.track_id = t.id AND u.slug = 'daily'
  );

CREATE TEMP TABLE seed_daily_missions (
  mission_slug  text,
  mission_title text,
  mission_desc  text,
  mission_order integer,
  estimated     integer
) ON COMMIT DROP;

INSERT INTO seed_daily_missions VALUES
  ('daily-food', 'Eating and drinking', 'Say what you eat and drink, and when.', 10, 7),
  ('daily-plans', 'Wants and plans', 'Say what you want and where you are going.', 20, 7);

INSERT INTO public.missions (
  unit_id, language_code, slug, title, description, order_index, estimated_minutes, is_published
)
SELECT
  u.id, 'es', m.mission_slug, m.mission_title, m.mission_desc, m.mission_order, m.estimated, true
FROM seed_daily_missions m
JOIN public.units u ON u.language_code = 'es' AND u.slug = 'daily'
WHERE NOT EXISTS (
  SELECT 1 FROM public.missions existing
  WHERE existing.unit_id = u.id AND existing.slug = m.mission_slug
);

INSERT INTO public.items (
  language_code, kind, surface, translation_literal, translation_natural,
  grammar_note, part_of_speech, vocab_breakdown, topic, tags,
  difficulty, source, owner_id
)
SELECT
  'es', sd.kind, sd.surface, sd.translation_literal, sd.translation_natural,
  sd.grammar_note, sd.part_of_speech, COALESCE(sd.vocab_breakdown, '[]'::jsonb),
  sd.topic, sd.tags, 'A1', 'curriculum', NULL
FROM seed_daily sd
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL
    AND i.language_code = 'es'
    AND i.kind = sd.kind
    AND lower(i.surface) = lower(sd.surface)
    AND lower(i.translation_natural) = lower(sd.translation_natural)
);

-- ----------------------------------------------------------------------------
-- Steps
-- ----------------------------------------------------------------------------
-- Same shape as the original steps migration: the unit's first mission takes
-- everything tagged `daily` that fits eating and drinking, the second takes the
-- rest. Ordering is sentences first, then isolated words, so a mission opens
-- with something usable.
CREATE OR REPLACE FUNCTION pg_temp.step_kind_for(p_position integer, p_total integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
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
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
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

WITH mission_items AS (
  SELECT
    m.id AS mission_id,
    i.id AS item_id,
    row_number() OVER (
      PARTITION BY m.id
      ORDER BY
        CASE i.kind WHEN 'sentence' THEN 0 WHEN 'phrase' THEN 1 ELSE 2 END,
        i.created_at,
        i.surface
    ) AS position,
    count(*) OVER (PARTITION BY m.id) AS total
  FROM public.missions m
  JOIN public.units u ON u.id = m.unit_id
  JOIN public.tracks t ON t.id = u.track_id
  JOIN public.items i
    ON i.language_code = 'es'
   AND i.owner_id IS NULL
   AND i.retired_at IS NULL
   AND i.topic = 'daily'
   AND (
     (m.slug = 'daily-food'
       AND i.tags && ARRAY['food','drink','comer','beber','desayuno'])
     OR (m.slug = 'daily-plans'
       AND i.tags && ARRAY['ir','estar','querer','tener','hablar','adverb'])
   )
  WHERE t.language_code = 'es' AND t.slug = 'foundations' AND u.slug = 'daily'
)
INSERT INTO public.steps (
  id, mission_id, language_code, step_type, item_id, prompt, payload, order_index
)
SELECT
  md5(mi.mission_id::text || ':' || mi.item_id::text)::uuid,
  mi.mission_id,
  'es',
  pg_temp.step_kind_for(mi.position::integer, mi.total::integer),
  mi.item_id,
  pg_temp.step_prompt_for(pg_temp.step_kind_for(mi.position::integer, mi.total::integer)),
  jsonb_build_object(
    'fromLanguage',
    CASE WHEN pg_temp.step_kind_for(mi.position::integer, mi.total::integer) IN ('recall', 'translate')
      THEN 'en' ELSE 'es' END,
    'toLanguage',
    CASE WHEN pg_temp.step_kind_for(mi.position::integer, mi.total::integer) IN ('recall', 'translate')
      THEN 'es' ELSE 'en' END
  ),
  (mi.position * 10)::integer
FROM mission_items mi
ON CONFLICT (id) DO NOTHING;
