-- ============================================================================
-- French and German: drill coverage
-- ============================================================================
-- The confusion-drill generator builds exercises from sentences that contain the
-- form a learner keeps getting wrong, and refuses to build one below three such
-- sentences. That refusal is correct, but it means a curriculum only supports
-- drills for the verbs it repeats.
--
-- An audit of the French and German A1 units found most first-person verbs in
-- one or two sentences — `parle` and `voudrais` in French, `bin`, `gehe`,
-- `heiße` and `möchte` in German — so a drill could not be built for exactly the
-- beginner mistakes it exists to catch.
--
-- This adds sentences to bring every one of those verbs to three or more. The
-- content is chosen to be worth teaching on its own terms: each sentence uses the
-- verb in a different real situation, which is also what makes a form stick.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- French
-- ----------------------------------------------------------------------------
INSERT INTO public.items (
  language_code, kind, surface, translation_literal, translation_natural,
  grammar_note, part_of_speech, vocab_breakdown, topic, tags,
  difficulty, source, owner_id
)
SELECT
  'fr', s.kind, s.surface, s.translation_literal, s.translation_natural,
  s.grammar_note, s.part_of_speech, COALESCE(s.vocab_breakdown, '[]'::jsonb),
  s.topic, s.tags, 'A1', 'curriculum', NULL
FROM (VALUES
  -- parler: 1 -> 3
  ('sentence', 'Je parle français et anglais.', 'I speak French and English.', 'I speak French and English.',
   'Languages take no article after «parler»: «je parle français», never «je parle le français».',
   NULL, '[{"token":"parle","lemma":"parler","gloss":"speak","pos":"verb"},{"token":"français","lemma":"français","gloss":"French","pos":"noun"},{"token":"anglais","lemma":"anglais","gloss":"English","pos":"noun"}]'::jsonb,
   'introductions', ARRAY['language','a1','parler']),
  ('sentence', 'Je parle avec ma mère tous les jours.', 'I speak with my mother all the days.', 'I speak to my mother every day.',
   '«Tous les jours» means every day; the singular «tout le jour» would mean all day long.',
   NULL, '[{"token":"parle","lemma":"parler","gloss":"speak","pos":"verb"},{"token":"mère","lemma":"mère","gloss":"mother","pos":"noun"},{"token":"jours","lemma":"jour","gloss":"days","pos":"noun"}]'::jsonb,
   'family', ARRAY['family','a1','parler']),

  -- vouloir: 1 -> 3
  ('sentence', 'Je voudrais un thé, s''il vous plaît.', 'I would like a tea, if it you pleases.', 'I''d like a tea, please.',
   '«Je voudrais» is the conditional of «vouloir» and is the polite way to order anything.',
   NULL, '[{"token":"voudrais","lemma":"vouloir","gloss":"would like","pos":"verb"},{"token":"thé","lemma":"thé","gloss":"tea","pos":"noun"}]'::jsonb,
   'food', ARRAY['ordering','polite','a1','vouloir']),
  ('sentence', 'Je voudrais apprendre le français.', 'I would like to learn the French.', 'I''d like to learn French.',
   'A second verb stays in the infinitive: «je voudrais apprendre», never «je voudrais j''apprends».',
   NULL, '[{"token":"voudrais","lemma":"vouloir","gloss":"would like","pos":"verb"},{"token":"apprendre","lemma":"apprendre","gloss":"to learn","pos":"verb"}]'::jsonb,
   'introductions', ARRAY['language','goals','a1','vouloir']),

  -- aller: 2 -> 4
  ('sentence', 'Je vais à la boulangerie le matin.', 'I go to the bakery the morning.', 'I go to the bakery in the morning.',
   '«À la» for a feminine place; «au» for a masculine one, as in «au marché».',
   NULL, '[{"token":"vais","lemma":"aller","gloss":"go","pos":"verb"},{"token":"boulangerie","lemma":"boulangerie","gloss":"bakery","pos":"noun"},{"token":"matin","lemma":"matin","gloss":"morning","pos":"noun"}]'::jsonb,
   'food', ARRAY['shopping','a1','aller']),
  ('sentence', 'Je vais travailler maintenant.', 'I go to work now.', 'I''m going to work now.',
   '«Je vais» plus an infinitive is the near future: «je vais travailler» means I am going to work.',
   NULL, '[{"token":"vais","lemma":"aller","gloss":"go","pos":"verb"},{"token":"travailler","lemma":"travailler","gloss":"to work","pos":"verb"}]'::jsonb,
   'family', ARRAY['work','a1','aller']),

  -- appeler: 2 -> 3
  ('sentence', 'Comment tu t''appelles ?', 'How you yourself call?', 'What''s your name?',
   'Word order in an informal question can stay declarative; only the intonation rises.',
   NULL, '[{"token":"appelles","lemma":"appeler","gloss":"you call","pos":"verb"}]'::jsonb,
   'introductions', ARRAY['introduction','question','a1','appeler']),

  -- manger: 2 -> 4
  ('sentence', 'Je mange une pomme chaque jour.', 'I eat an apple each day.', 'I eat an apple every day.',
   '«Chaque jour» is singular and invariable; there is no «chaque jours».',
   NULL, '[{"token":"mange","lemma":"manger","gloss":"eat","pos":"verb"},{"token":"pomme","lemma":"pomme","gloss":"apple","pos":"noun"},{"token":"jour","lemma":"jour","gloss":"day","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','a1','manger']),
  ('sentence', 'Je mange au restaurant le vendredi.', 'I eat at the restaurant the Friday.', 'I eat at a restaurant on Fridays.',
   '«Le vendredi» with the definite article means every Friday, not this Friday.',
   NULL, '[{"token":"mange","lemma":"manger","gloss":"eat","pos":"verb"},{"token":"restaurant","lemma":"restaurant","gloss":"restaurant","pos":"noun"},{"token":"vendredi","lemma":"vendredi","gloss":"Friday","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','restaurant','a1','manger']),

  -- préparer, a new regular verb with three sentences so it is drillable too.
  ('sentence', 'Je prépare le dîner.', 'I prepare the dinner.', 'I''m making dinner.',
   'A regular -er verb: je prépare, tu prépares, il prépare, nous préparons.',
   NULL, '[{"token":"prépare","lemma":"préparer","gloss":"prepare","pos":"verb"},{"token":"dîner","lemma":"dîner","gloss":"dinner","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','a1','préparer']),
  ('sentence', 'Je prépare du café le matin.', 'I prepare of the coffee the morning.', 'I make coffee in the morning.',
   '«Du» is the partitive: an unspecified amount. It is required when talking about food or drink.',
   NULL, '[{"token":"prépare","lemma":"préparer","gloss":"prepare","pos":"verb"},{"token":"café","lemma":"café","gloss":"coffee","pos":"noun"},{"token":"matin","lemma":"matin","gloss":"morning","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','drink','a1','préparer']),
  ('sentence', 'Je prépare mes affaires.', 'I prepare my things.', 'I''m getting my things ready.',
   '«Mes» is the plural possessive: my things. It agrees with the noun, not the owner.',
   NULL, '[{"token":"prépare","lemma":"préparer","gloss":"prepare","pos":"verb"},{"token":"affaires","lemma":"affaire","gloss":"things","pos":"noun"}]'::jsonb,
   'family', ARRAY['daily','a1','préparer'])
) AS s(kind, surface, translation_literal, translation_natural, grammar_note, part_of_speech, vocab_breakdown, topic, tags)
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL AND i.language_code = 'fr' AND i.kind = s.kind
    AND lower(i.surface) = lower(s.surface)
    AND lower(i.translation_natural) = lower(s.translation_natural)
);

-- ----------------------------------------------------------------------------
-- German
-- ----------------------------------------------------------------------------
INSERT INTO public.items (
  language_code, kind, surface, translation_literal, translation_natural,
  grammar_note, part_of_speech, vocab_breakdown, topic, tags,
  difficulty, source, owner_id
)
SELECT
  'de', s.kind, s.surface, s.translation_literal, s.translation_natural,
  s.grammar_note, s.part_of_speech, COALESCE(s.vocab_breakdown, '[]'::jsonb),
  s.topic, s.tags, 'A1', 'curriculum', NULL
FROM (VALUES
  -- sein: 1 -> 3
  ('sentence', 'Ich bin Student.', 'I am student.', 'I am a student.',
   'Professions take no article in German: «Ich bin Student», not «Ich bin ein Student».',
   NULL, '[{"token":"bin","lemma":"sein","gloss":"am","pos":"verb"},{"token":"Student","lemma":"Student","gloss":"student","pos":"noun"}]'::jsonb,
   'introductions', ARRAY['work','a1','sein']),
  ('sentence', 'Ich bin müde heute.', 'I am tired today.', 'I am tired today.',
   'The adjective after «sein» takes no ending: «ich bin müde», never «ich bin müder».',
   NULL, '[{"token":"bin","lemma":"sein","gloss":"am","pos":"verb"},{"token":"müde","lemma":"müde","gloss":"tired","pos":"adjective"},{"token":"heute","lemma":"heute","gloss":"today","pos":"adverb"}]'::jsonb,
   'greetings', ARRAY['feelings','a1','sein']),

  -- heißen: 1 -> 3
  ('sentence', 'Wie heißen Sie?', 'How are called you?', 'What is your name?',
   'Formal inversion of «heißen». With a friend: «wie heißt du?».',
   NULL, '[{"token":"heißen","lemma":"heißen","gloss":"are called","pos":"verb"}]'::jsonb,
   'introductions', ARRAY['introduction','question','a1','heißen']),
  ('sentence', 'Er heißt Thomas.', 'He is called Thomas.', 'His name is Thomas.',
   'Third person singular of «heißen»: er heißt. The ß is a sharp s.',
   NULL, '[{"token":"heißt","lemma":"heißen","gloss":"is called","pos":"verb"},{"token":"Thomas","lemma":"Thomas","gloss":"Thomas","pos":"noun"}]'::jsonb,
   'introductions', ARRAY['introduction','a1','heißen']),

  -- gehen: 1 -> 3
  ('sentence', 'Ich gehe nach Hause.', 'I go to home.', 'I''m going home.',
   '«Nach Hause» means going home; «zu Hause» means being at home. The direction changes the phrase.',
   NULL, '[{"token":"gehe","lemma":"gehen","gloss":"go","pos":"verb"},{"token":"Hause","lemma":"Haus","gloss":"home","pos":"noun"}]'::jsonb,
   'greetings', ARRAY['daily','a1','gehen']),
  ('sentence', 'Ich gehe jeden Tag spazieren.', 'I go every day to stroll.', 'I go for a walk every day.',
   '«Spazieren gehen» is a fixed pair; the verb «gehen» comes second and the activity goes to the end.',
   NULL, '[{"token":"gehe","lemma":"gehen","gloss":"go","pos":"verb"},{"token":"jeden","lemma":"jeder","gloss":"every","pos":"adjective"},{"token":"Tag","lemma":"Tag","gloss":"day","pos":"noun"},{"token":"spazieren","lemma":"spazieren","gloss":"to stroll","pos":"verb"}]'::jsonb,
   'greetings', ARRAY['daily','a1','gehen']),

  -- mögen: 1 -> 3
  ('sentence', 'Ich möchte ein Wasser, bitte.', 'I would like a water, please.', 'I''d like a water, please.',
   '«Möchte» takes the accusative: «ein Wasser» is neuter so it does not change.',
   NULL, '[{"token":"möchte","lemma":"mögen","gloss":"would like","pos":"verb"},{"token":"Wasser","lemma":"Wasser","gloss":"water","pos":"noun"},{"token":"bitte","lemma":"bitte","gloss":"please","pos":"interjection"}]'::jsonb,
   'food', ARRAY['ordering','polite','a1','mögen']),
  ('sentence', 'Ich möchte Deutsch lernen.', 'I would like German to learn.', 'I''d like to learn German.',
   'With a modal verb the infinitive goes to the end: «Ich möchte Deutsch lernen».',
   NULL, '[{"token":"möchte","lemma":"mögen","gloss":"would like","pos":"verb"},{"token":"Deutsch","lemma":"Deutsch","gloss":"German","pos":"noun"},{"token":"lernen","lemma":"lernen","gloss":"to learn","pos":"verb"}]'::jsonb,
   'introductions', ARRAY['language','goals','a1','mögen']),

  -- essen: 2 -> 4
  ('sentence', 'Ich esse einen Apfel.', 'I eat an apple.', 'I eat an apple.',
   '«Apfel» is masculine, so the accusative of «ein» is «einen».',
   NULL, '[{"token":"esse","lemma":"essen","gloss":"eat","pos":"verb"},{"token":"einen","lemma":"ein","gloss":"a","pos":"article"},{"token":"Apfel","lemma":"Apfel","gloss":"apple","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','a1','essen']),
  ('sentence', 'Ich esse gern Gemüse.', 'I eat gladly vegetables.', 'I like eating vegetables.',
   '«Gern» after the verb expresses liking the activity. Its opposite is «nicht gern».',
   NULL, '[{"token":"esse","lemma":"essen","gloss":"eat","pos":"verb"},{"token":"gern","lemma":"gern","gloss":"gladly","pos":"adverb"},{"token":"Gemüse","lemma":"Gemüse","gloss":"vegetables","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','a1','essen']),

  -- haben: 2 -> 4
  ('sentence', 'Ich habe einen Bruder.', 'I have a brother.', 'I have a brother.',
   'The accusative again: «einen Bruder» because «Bruder» is masculine.',
   NULL, '[{"token":"habe","lemma":"haben","gloss":"have","pos":"verb"},{"token":"einen","lemma":"ein","gloss":"a","pos":"article"},{"token":"Bruder","lemma":"Bruder","gloss":"brother","pos":"noun"}]'::jsonb,
   'family', ARRAY['family','a1','haben']),
  ('sentence', 'Ich habe heute viel Arbeit.', 'I have today much work.', 'I have a lot of work today.',
   'Time expressions like «heute» come before the object: «Ich habe heute viel Arbeit».',
   NULL, '[{"token":"habe","lemma":"haben","gloss":"have","pos":"verb"},{"token":"heute","lemma":"heute","gloss":"today","pos":"adverb"},{"token":"Arbeit","lemma":"Arbeit","gloss":"work","pos":"noun"}]'::jsonb,
   'family', ARRAY['work','a1','haben']),

  -- arbeiten: a regular verb with three sentences so it is drillable.
  ('sentence', 'Ich arbeite in einem Büro.', 'I work in an office.', 'I work in an office.',
   '«In einem» is the dative: the office is where you are, not where you are going.',
   NULL, '[{"token":"arbeite","lemma":"arbeiten","gloss":"work","pos":"verb"},{"token":"Büro","lemma":"Büro","gloss":"office","pos":"noun"}]'::jsonb,
   'family', ARRAY['work','a1','arbeiten']),
  ('sentence', 'Ich arbeite jeden Tag.', 'I work every day.', 'I work every day.',
   '«Jeden Tag» is the accusative of time: it answers how often, with no preposition.',
   NULL, '[{"token":"arbeite","lemma":"arbeiten","gloss":"work","pos":"verb"},{"token":"jeden","lemma":"jeder","gloss":"every","pos":"adjective"},{"token":"Tag","lemma":"Tag","gloss":"day","pos":"noun"}]'::jsonb,
   'family', ARRAY['work','a1','arbeiten']),
  ('sentence', 'Ich arbeite gern mit Menschen.', 'I work gladly with people.', 'I like working with people.',
   '«Mit» always takes the dative, so «Menschen» stays as it is in the plural.',
   NULL, '[{"token":"arbeite","lemma":"arbeiten","gloss":"work","pos":"verb"},{"token":"gern","lemma":"gern","gloss":"gladly","pos":"adverb"},{"token":"Menschen","lemma":"Mensch","gloss":"people","pos":"noun"}]'::jsonb,
   'family', ARRAY['work','a1','arbeiten'])
) AS s(kind, surface, translation_literal, translation_natural, grammar_note, part_of_speech, vocab_breakdown, topic, tags)
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL AND i.language_code = 'de' AND i.kind = s.kind
    AND lower(i.surface) = lower(s.surface)
    AND lower(i.translation_natural) = lower(s.translation_natural)
);

-- ----------------------------------------------------------------------------
-- Steps for the newly added items
-- ----------------------------------------------------------------------------
-- The step generator is idempotent on `md5(mission:item)`, so the simplest
-- correct thing is to re-run it over the full item set. New items get steps;
-- existing ones keep the ids they already have.
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
    WHEN 'recall'    THEN 'Say it in the target language'
    WHEN 'listen'    THEN 'Listen and choose the meaning'
    WHEN 'arrange'   THEN 'Put the words in order'
    WHEN 'speak'     THEN 'Say it out loud'
    ELSE 'Say it in the target language'
  END;
$$;

WITH mission_items AS (
  SELECT
    m.id AS mission_id,
    m.language_code,
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
    ON i.language_code = m.language_code
   AND i.owner_id IS NULL
   AND i.retired_at IS NULL
   AND (
     (m.language_code = 'fr' AND (
       (u.slug = 'premiers-mots'   AND i.tags && ARRAY['greeting','polite','farewell','courtesy','request','aller'])
       OR (u.slug = 'se-presenter' AND i.tags && ARRAY['introduction','origin','language','reflexive','appeler','être','venir','parler','avoir','vouloir'])
       OR (u.slug = 'la-famille'   AND i.tags && ARRAY['family','numbers','work','habiter','préparer','aller'])
       OR (u.slug = 'manger-boire' AND i.tags && ARRAY['ordering','restaurant','food','drink','negation','manger','boire','vouloir','préparer'])
     ))
     OR (m.language_code = 'de' AND (
       (u.slug = 'erste-woerter'    AND i.tags && ARRAY['greeting','polite','farewell','courtesy','request','gehen','sein'])
       OR (u.slug = 'sich-vorstellen' AND i.tags && ARRAY['introduction','origin','language','heißen','sein','kommen','sprechen','haben','mögen'])
       OR (u.slug = 'die-familie'   AND i.tags && ARRAY['family','numbers','work','wohnen','arbeiten','haben'])
       OR (u.slug = 'essen-trinken' AND i.tags && ARRAY['ordering','restaurant','food','drink','negation','essen','trinken','mögen'])
     ))
   )
  WHERE t.slug = 'foundations' AND m.language_code IN ('fr', 'de')
)
INSERT INTO public.steps (
  id, mission_id, language_code, step_type, item_id, prompt, payload, order_index
)
SELECT
  md5(mi.mission_id::text || ':' || mi.item_id::text)::uuid,
  mi.mission_id,
  mi.language_code,
  pg_temp.step_kind_for(mi.position::integer, mi.total::integer),
  mi.item_id,
  pg_temp.step_prompt_for(pg_temp.step_kind_for(mi.position::integer, mi.total::integer)),
  jsonb_build_object(
    'fromLanguage',
    CASE WHEN pg_temp.step_kind_for(mi.position::integer, mi.total::integer) IN ('recall', 'translate')
      THEN 'en' ELSE mi.language_code END,
    'toLanguage',
    CASE WHEN pg_temp.step_kind_for(mi.position::integer, mi.total::integer) IN ('recall', 'translate')
      THEN mi.language_code ELSE 'en' END
  ),
  (mi.position * 10)::integer
FROM mission_items mi
ON CONFLICT (id) DO NOTHING;
