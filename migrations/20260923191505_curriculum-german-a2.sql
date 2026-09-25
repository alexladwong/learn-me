-- ============================================================================
-- German: Alltag (A2)
-- ============================================================================
-- The German A2 progression, mirroring the Spanish and French ones so a learner
-- moving between languages meets the same situations in the same order.
--
-- Shape: 1 track -> 3 units -> 6 missions -> ~50 items.
--
-- The Perfekt is the point of this level, and German shares French's trap: most
-- verbs take «haben», but movement and change-of-state verbs take «sein». German
-- adds a second demand French does not — a separable prefix goes to the end
-- («Ich habe eingekauft»), and the participle itself is usually «ge-» plus the
-- stem. Both are taught explicitly and repeated.
--
-- Written with the staging columns in the same order as the target columns and
-- mapped one for one: the InsForge query parser rejects a statement whose select
-- list reorders the staging columns.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Track
-- ----------------------------------------------------------------------------
INSERT INTO public.tracks (
  language_code, slug, title, description, icon, cefr_band, order_index, is_published
)
SELECT
  'de', 'alltag', 'Alltag',
  'Talk about what you did, get around, and deal with feeling unwell. The step from A1 to A2.',
  'compass', 'A2', 20, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.tracks WHERE language_code = 'de' AND slug = 'alltag'
);

-- ----------------------------------------------------------------------------
-- Units and missions
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE a2_de_units (
  unit_slug text, unit_title text, unit_summary text, unit_order integer,
  mission_slug text, mission_title text, mission_desc text, mission_order integer,
  estimated integer, topics text[]
) ON COMMIT DROP;

INSERT INTO a2_de_units VALUES
  ('vergangenheit', 'Über die Vergangenheit', 'Say what you did and where you went.', 10,
   'de-perfekt-haben', 'Was ich gemacht habe', 'Things you did, using haben.', 10, 8, ARRAY['vergangenheit']),
  ('vergangenheit', 'Über die Vergangenheit', 'Say what you did and where you went.', 10,
   'de-perfekt-sein', 'Wohin ich gefahren bin', 'Movement verbs, which take sein.', 20, 8, ARRAY['vergangenheit']),
  ('reisen', 'Reisen', 'Buy tickets and handle a problem on the way.', 20,
   'de-reisen-tickets', 'Fahrkarten und Zeiten', 'Buy a ticket and understand the answer.', 10, 8, ARRAY['reisen']),
  ('reisen', 'Reisen', 'Buy tickets and handle a problem on the way.', 20,
   'de-reisen-probleme', 'Wenn etwas schiefgeht', 'Handle a delay and ask for help.', 20, 8, ARRAY['reisen']),
  ('gesundheit', 'Gesundheit', 'Describe a problem and understand the advice.', 30,
   'de-gesundheit-symptome', 'Was weh tut', 'Describe a symptom to a doctor.', 10, 8, ARRAY['gesundheit']),
  ('gesundheit', 'Gesundheit', 'Describe a problem and understand the advice.', 30,
   'de-gesundheit-apotheke', 'In der Apotheke', 'Buy medicine and follow instructions.', 20, 8, ARRAY['gesundheit']);

INSERT INTO public.units (
  track_id, language_code, slug, title, description, cefr_level, order_index, is_published
)
SELECT DISTINCT
  t.id, 'de', u.unit_slug, u.unit_title, u.unit_summary, 'A2', u.unit_order, true
FROM a2_de_units u
JOIN public.tracks t ON t.language_code = 'de' AND t.slug = 'alltag'
WHERE NOT EXISTS (
  SELECT 1 FROM public.units existing
  WHERE existing.track_id = t.id AND existing.slug = u.unit_slug
);

INSERT INTO public.missions (
  unit_id, language_code, slug, title, description, order_index, estimated_minutes, is_published
)
SELECT
  un.id, 'de', u.mission_slug, u.mission_title, u.mission_desc,
  u.mission_order, u.estimated, true
FROM a2_de_units u
JOIN public.units un ON un.language_code = 'de' AND un.slug = u.unit_slug
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
SELECT
  'de', s.kind, s.surface, s.translation_literal, s.translation_natural,
  s.grammar_note, s.part_of_speech, s.vocab_breakdown, s.topic, s.tags,
  'A2', 'curriculum', NULL
FROM (VALUES
  -- ===== Unit 1: Perfekt with haben ========================================
  ('sentence', 'Gestern habe ich Pizza gegessen.',
   'Yesterday have I pizza eaten.',
   'Yesterday I ate pizza.',
   'The Perfekt is «haben» plus the participle, and the participle goes to the end: «gegessen».',
   NULL, '[{"token":"Gestern","lemma":"gestern","gloss":"yesterday","pos":"adverb"},{"token":"gegessen","lemma":"essen","gloss":"eaten","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','food','a2','essen']),

  ('sentence', 'Ich habe zu schnell gegessen.',
   'I have too fast eaten.',
   'I ate too quickly.',
   '«Zu schnell» is too fast. The participle stays at the end of the clause.',
   NULL, '[{"token":"gegessen","lemma":"essen","gloss":"eaten","pos":"verb"},{"token":"schnell","lemma":"schnell","gloss":"fast","pos":"adverb"}]'::jsonb,
   'vergangenheit', ARRAY['past','food','a2','essen']),

  ('sentence', 'Wir haben zusammen gegessen.',
   'We have together eaten.',
   'We ate together.',
   'The participle never changes with «haben»: «gegessen» whatever the subject.',
   NULL, '[{"token":"gegessen","lemma":"essen","gloss":"eaten","pos":"verb"},{"token":"zusammen","lemma":"zusammen","gloss":"together","pos":"adverb"}]'::jsonb,
   'vergangenheit', ARRAY['past','food','a2','essen']),

  ('sentence', 'Ich habe einen Film gesehen.',
   'I have a film seen.',
   'I watched a film.',
   '«Sehen» is a strong verb: the participle is «gesehen», not «gegeht».',
   NULL, '[{"token":"gesehen","lemma":"sehen","gloss":"seen","pos":"verb"},{"token":"Film","lemma":"Film","gloss":"film","pos":"noun"}]'::jsonb,
   'vergangenheit', ARRAY['past','a2','sehen']),

  ('sentence', 'Hast du den Film gesehen?',
   'Have you the film seen?',
   'Have you seen the film?',
   'A yes/no question puts the verb first: «Hast du …». The participle still ends the clause.',
   NULL, '[{"token":"gesehen","lemma":"sehen","gloss":"seen","pos":"verb"},{"token":"Film","lemma":"Film","gloss":"film","pos":"noun"}]'::jsonb,
   'vergangenheit', ARRAY['past','question','a2','sehen']),

  ('sentence', 'Ich habe Kaffee getrunken.',
   'I have coffee drunk.',
   'I drank coffee.',
   'The participle of «trinken» is «getrunken». The «ge-» prefix marks a past participle.',
   NULL, '[{"token":"getrunken","lemma":"trinken","gloss":"drunk","pos":"verb"},{"token":"Kaffee","lemma":"Kaffee","gloss":"coffee","pos":"noun"}]'::jsonb,
   'vergangenheit', ARRAY['past','drink','a2','trinken']),

  ('sentence', 'Ich habe zu viel Kaffee getrunken.',
   'I have too much coffee drunk.',
   'I drank too much coffee.',
   '«Zu viel» is too much; «zu viele» with a plural countable noun.',
   NULL, '[{"token":"getrunken","lemma":"trinken","gloss":"drunk","pos":"verb"},{"token":"viel","lemma":"viel","gloss":"much","pos":"adjective"}]'::jsonb,
   'vergangenheit', ARRAY['past','drink','a2','trinken']),

  ('sentence', 'Was hast du am Wochenende gemacht?',
   'What have you at the weekend done?',
   'What did you do at the weekend?',
   '«Am Wochenende» takes «am» for a time period. «Gemacht» is the participle of «machen».',
   NULL, '[{"token":"gemacht","lemma":"machen","gloss":"done","pos":"verb"},{"token":"Wochenende","lemma":"Wochenende","gloss":"weekend","pos":"noun"}]'::jsonb,
   'vergangenheit', ARRAY['past','question','a2','machen']),

  ('sentence', 'Ich habe gearbeitet und dann geschlafen.',
   'I have worked and then slept.',
   'I worked and then slept.',
   'Two participles in one sentence. «Gearbeitet» keeps its «ge-» because the stem begins with a consonant.',
   NULL, '[{"token":"gearbeitet","lemma":"arbeiten","gloss":"worked","pos":"verb"},{"token":"geschlafen","lemma":"schlafen","gloss":"slept","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','work','a2','arbeiten']),

  ('word', 'gestern', 'yesterday', 'yesterday',
   '«Vorgestern» is the day before yesterday; «gestern Abend» is yesterday evening.', 'adverb', '[]'::jsonb,
   'vergangenheit', ARRAY['past','adverb','a2']),

  -- ===== Unit 2: Perfekt with sein =========================================
  ('sentence', 'Ich bin nach Berlin gefahren.',
   'I am to Berlin driven.',
   'I drove to Berlin.',
   '«Fahren» takes «sein», not «haben», because it involves movement from one place to another.',
   NULL, '[{"token":"gefahren","lemma":"fahren","gloss":"driven","pos":"verb"},{"token":"Berlin","lemma":"Berlin","gloss":"Berlin","pos":"noun"}]'::jsonb,
   'vergangenheit', ARRAY['past','travel','a2','fahren']),

  ('sentence', 'Wir sind mit dem Zug gefahren.',
   'We are with the train driven.',
   'We went by train.',
   '«Mit dem Zug» — by train, with the dative article «dem».',
   NULL, '[{"token":"gefahren","lemma":"fahren","gloss":"driven","pos":"verb"},{"token":"Zug","lemma":"Zug","gloss":"train","pos":"noun"}]'::jsonb,
   'vergangenheit', ARRAY['past','travel','a2','fahren']),

  ('sentence', 'Sie ist gestern gefahren.',
   'She is yesterday driven.',
   'She left yesterday.',
   'The same auxiliary for every subject with «sein»: «ich bin», «sie ist».',
   NULL, '[{"token":"gefahren","lemma":"fahren","gloss":"driven","pos":"verb"},{"token":"gestern","lemma":"gestern","gloss":"yesterday","pos":"adverb"}]'::jsonb,
   'vergangenheit', ARRAY['past','travel','a2','fahren']),

  ('sentence', 'Ich bin zu Hause geblieben.',
   'I am at home stayed.',
   'I stayed at home.',
   '«Bleiben» takes «sein»: it describes staying in one state rather than acting.',
   NULL, '[{"token":"geblieben","lemma":"bleiben","gloss":"stayed","pos":"verb"},{"token":"Hause","lemma":"Haus","gloss":"home","pos":"noun"}]'::jsonb,
   'vergangenheit', ARRAY['past','daily','a2']),

  ('sentence', 'Ich bin früh aufgestanden.',
   'I am early up-stood.',
   'I got up early.',
   'A separable verb: «aufstehen» splits, so the «ge-» goes between prefix and stem: «aufgestanden».',
   NULL, '[{"token":"aufgestanden","lemma":"aufstehen","gloss":"got up","pos":"verb"},{"token":"früh","lemma":"früh","gloss":"early","pos":"adverb"}]'::jsonb,
   'vergangenheit', ARRAY['past','daily','separable','a2']),

  ('sentence', 'Ich bin spät eingeschlafen.',
   'I am late in-slept.',
   'I fell asleep late.',
   'Another separable verb: «einschlafen» becomes «eingeschlafen».',
   NULL, '[{"token":"eingeschlafen","lemma":"einschlafen","gloss":"fallen asleep","pos":"verb"},{"token":"spät","lemma":"spät","gloss":"late","pos":"adverb"}]'::jsonb,
   'vergangenheit', ARRAY['past','daily','separable','a2']),

  ('sentence', 'Ich bin in Uganda geboren.',
   'I am in Uganda born.',
   'I was born in Uganda.',
   '«Geboren» never takes «ge-»: it is already a participle form. It always takes «sein».',
   NULL, '[{"token":"geboren","lemma":"gebären","gloss":"born","pos":"verb"},{"token":"Uganda","lemma":"Uganda","gloss":"Uganda","pos":"noun"}]'::jsonb,
   'vergangenheit', ARRAY['past','a2']),

  ('sentence', 'Ich bin gestern zu Hause gewesen.',
   'I am yesterday at home been.',
   'I was at home yesterday.',
   'The participle of «sein» is «gewesen». It takes «sein» as its own auxiliary.',
   NULL, '[{"token":"gewesen","lemma":"sein","gloss":"been","pos":"verb"},{"token":"gestern","lemma":"gestern","gloss":"yesterday","pos":"adverb"}]'::jsonb,
   'vergangenheit', ARRAY['past','a2','sein']),

  ('word', 'bleiben', 'to stay', 'to stay',
   'Takes «sein» in the Perfekt: «ich bin geblieben».', 'verb', '[]'::jsonb,
   'vergangenheit', ARRAY['verb','past','a2']),

  -- ===== Unit 3: Reisen ====================================================
  ('sentence', 'Eine Fahrkarte nach München, bitte.',
   'A ticket to Munich, please.',
   'A ticket to Munich, please.',
   '«Eine Fahrkarte» is a ticket for a train or bus. «Nach» takes a city with no article.',
   NULL, '[{"token":"Fahrkarte","lemma":"Fahrkarte","gloss":"ticket","pos":"noun"},{"token":"München","lemma":"München","gloss":"Munich","pos":"noun"}]'::jsonb,
   'reisen', ARRAY['travel','a2']),

  ('sentence', 'Wann fährt der nächste Zug?',
   'When drives the next train?',
   'When does the next train leave?',
   'German says the train «fährt» — drives — rather than leaves. «Wann» asks when.',
   NULL, '[{"token":"fährt","lemma":"fahren","gloss":"leaves","pos":"verb"},{"token":"Zug","lemma":"Zug","gloss":"train","pos":"noun"}]'::jsonb,
   'reisen', ARRAY['travel','question','a2','fahren']),

  ('sentence', 'Der Zug hat zwanzig Minuten Verspätung.',
   'The train has twenty minutes delay.',
   'The train is twenty minutes late.',
   '«Verspätung haben» — to be late. The delay is a noun, as in French but unlike English.',
   NULL, '[{"token":"Zug","lemma":"Zug","gloss":"train","pos":"noun"},{"token":"Verspätung","lemma":"Verspätung","gloss":"delay","pos":"noun"}]'::jsonb,
   'reisen', ARRAY['travel','problems','a2']),

  ('sentence', 'Ich habe meinen Zug verpasst.',
   'I have my train missed.',
   'I missed my train.',
   '«Verpassen» is to miss a train. Note the inseparable «ver-», so no «ge-» in the participle.',
   NULL, '[{"token":"verpasst","lemma":"verpassen","gloss":"missed","pos":"verb"},{"token":"Zug","lemma":"Zug","gloss":"train","pos":"noun"}]'::jsonb,
   'reisen', ARRAY['travel','past','problems','a2']),

  ('sentence', 'Ich habe meinen Schlüssel verloren.',
   'I have my key lost.',
   'I lost my key.',
   '«Verlieren» has an inseparable prefix, so the participle is «verloren» with no «ge-».',
   NULL, '[{"token":"verloren","lemma":"verlieren","gloss":"lost","pos":"verb"},{"token":"Schlüssel","lemma":"Schlüssel","gloss":"key","pos":"noun"}]'::jsonb,
   'reisen', ARRAY['travel','past','problems','a2']),

  ('sentence', 'Können Sie mir bitte helfen?',
   'Can you me please help?',
   'Could you help me, please?',
   'A modal verb sends the main verb to the end: «helfen» last.',
   NULL, '[{"token":"Können","lemma":"können","gloss":"can","pos":"verb"},{"token":"helfen","lemma":"helfen","gloss":"to help","pos":"verb"}]'::jsonb,
   'reisen', ARRAY['travel','polite','a2','können']),

  ('word', 'Verspätung', 'delay', 'delay',
   '«Verspätung haben» for transport; «zu spät kommen» for a person arriving late.', 'noun', '[]'::jsonb,
   'reisen', ARRAY['travel','noun','a2']),

  ('word', 'Fahrkarte', 'ticket', 'ticket',
   'For a flight it is «ein Flugticket»; for a train or bus, «eine Fahrkarte».', 'noun', '[]'::jsonb,
   'reisen', ARRAY['travel','noun','a2']),

  -- ===== Unit 4: Gesundheit ================================================
  ('sentence', 'Ich habe Kopfschmerzen seit gestern.',
   'I have head-pains since yesterday.',
   'I have had a headache since yesterday.',
   'German builds the word: «Kopf» plus «Schmerzen». «Seit» takes the present tense, as in French.',
   NULL, '[{"token":"Kopfschmerzen","lemma":"Kopfschmerz","gloss":"headache","pos":"noun"},{"token":"seit","lemma":"seit","gloss":"since","pos":"preposition"}]'::jsonb,
   'gesundheit', ARRAY['health','symptoms','a2']),

  ('sentence', 'Mein Hals tut weh, wenn ich spreche.',
   'My throat does pain, when I speak.',
   'My throat hurts when I speak.',
   '«Wehtun» splits: «tut weh» in the present. A subordinate clause with «wenn» sends the verb to the end.',
   NULL, '[{"token":"Hals","lemma":"Hals","gloss":"throat","pos":"noun"},{"token":"weh","lemma":"wehtun","gloss":"pain","pos":"adverb"}]'::jsonb,
   'gesundheit', ARRAY['health','symptoms','separable','a2']),

  ('sentence', 'Mir ist schlecht.',
   'To me is bad.',
   'I feel sick.',
   'German says it is bad *to me*, with the dative «mir». No subject pronoun «ich» is used.',
   NULL, '[{"token":"Mir","lemma":"mir","gloss":"to me","pos":"pronoun"},{"token":"schlecht","lemma":"schlecht","gloss":"bad","pos":"adjective"}]'::jsonb,
   'gesundheit', ARRAY['health','symptoms','a2']),

  ('sentence', 'Ich bin drei Tage krank gewesen.',
   'I am three days ill been.',
   'I was ill for three days.',
   'A duration needs no preposition: «drei Tage». «Gewesen» is the participle of «sein».',
   NULL, '[{"token":"krank","lemma":"krank","gloss":"ill","pos":"adjective"},{"token":"gewesen","lemma":"sein","gloss":"been","pos":"verb"}]'::jsonb,
   'gesundheit', ARRAY['health','past','a2','sein']),

  ('sentence', 'Ich habe Fieber gehabt.',
   'I have fever had.',
   'I had a fever.',
   'German uses no article with «Fieber»: «Ich habe Fieber», not «ein Fieber».',
   NULL, '[{"token":"Fieber","lemma":"Fieber","gloss":"fever","pos":"noun"},{"token":"gehabt","lemma":"haben","gloss":"had","pos":"verb"}]'::jsonb,
   'gesundheit', ARRAY['health','past','a2','haben']),

  ('sentence', 'Ich möchte etwas gegen die Schmerzen.',
   'I would like something against the pain.',
   'I would like something for the pain.',
   'German uses «gegen» where English uses "for" with medicine.',
   NULL, '[{"token":"möchte","lemma":"mögen","gloss":"would like","pos":"verb"},{"token":"Schmerzen","lemma":"Schmerz","gloss":"pain","pos":"noun"}]'::jsonb,
   'gesundheit', ARRAY['health','pharmacy','a2','mögen']),

  ('sentence', 'Wie oft am Tag soll ich es nehmen?',
   'How often at the day shall I it take?',
   'How often a day should I take it?',
   '«Wie oft am Tag» asks the frequency. The modal «soll» sends «nehmen» to the end.',
   NULL, '[{"token":"oft","lemma":"oft","gloss":"often","pos":"adverb"},{"token":"Tag","lemma":"Tag","gloss":"day","pos":"noun"},{"token":"nehmen","lemma":"nehmen","gloss":"to take","pos":"verb"}]'::jsonb,
   'gesundheit', ARRAY['health','pharmacy','question','a2']),

  ('word', 'Schmerzen', 'pain', 'pain',
   'Usually plural in German: «Ich habe Schmerzen». The singular «der Schmerz» is more clinical.', 'noun', '[]'::jsonb,
   'gesundheit', ARRAY['health','noun','a2']),

  ('word', 'krank', 'ill', 'ill',
   'The noun is «die Krankheit»; «krankschreiben» means to sign someone off work.', 'adjective', '[]'::jsonb,
   'gesundheit', ARRAY['health','adjective','a2'])
) AS s(kind, surface, translation_literal, translation_natural, grammar_note, part_of_speech, vocab_breakdown, topic, tags)
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL AND i.language_code = 'de' AND i.kind = s.kind
    AND lower(i.surface) = lower(s.surface)
);
