-- ============================================================================
-- German A2: drill coverage
-- ============================================================================
-- The Perfekt forms were introduced in one or two sentences each; the generator
-- needs three. German needs the repetition more than the other two languages,
-- because the level has two traps rather than one: choosing «haben» or «sein»,
-- and placing a separable prefix correctly.
--
-- Weighted towards the «sein» verbs and the separable ones, since those are what
-- a learner gets wrong after mastering «haben» plus a regular participle.
-- ============================================================================

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
  ('sentence', 'Ich habe gestern im Restaurant gegessen.',
   'I have yesterday in the restaurant eaten.',
   'I ate in a restaurant yesterday.',
   'Time expressions sit early in the clause; the participle still ends it.',
   NULL, '[{"token":"gegessen","lemma":"essen","gloss":"eaten","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','food','a2','essen']),

  ('sentence', 'Wir sind nach Hamburg gefahren.',
   'We are to Hamburg driven.',
   'We drove to Hamburg.',
   '«Fahren» takes «sein». Note «nach» for a city, with no article.',
   NULL, '[{"token":"gefahren","lemma":"fahren","gloss":"driven","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','travel','a2','fahren']),

  ('sentence', 'Ich habe einen guten Film gesehen.',
   'I have a good film seen.',
   'I saw a good film.',
   'The participle of «sehen» is «gesehen». The adjective takes an ending before the noun.',
   NULL, '[{"token":"gesehen","lemma":"sehen","gloss":"seen","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','a2','sehen']),

  ('sentence', 'Sie hat Tee getrunken.',
   'She has tea drunk.',
   'She drank tea.',
   'The participle never changes with «haben», whoever the subject is.',
   NULL, '[{"token":"getrunken","lemma":"trinken","gloss":"drunk","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','drink','a2','trinken']),

  ('sentence', 'Ich habe das gestern gemacht.',
   'I have that yesterday done.',
   'I did that yesterday.',
   '«Das» is the object; the participle «gemacht» closes the clause.',
   NULL, '[{"token":"gemacht","lemma":"machen","gloss":"done","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','a2','machen']),

  ('sentence', 'Ich habe gestern viel gearbeitet.',
   'I have yesterday much worked.',
   'I worked a lot yesterday.',
   '«Gearbeitet» keeps its «ge-» because the stem starts with a consonant.',
   NULL, '[{"token":"gearbeitet","lemma":"arbeiten","gloss":"worked","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','work','a2','arbeiten']),

  ('sentence', 'Wir sind zwei Wochen in Italien gewesen.',
   'We are two weeks in Italy been.',
   'We were in Italy for two weeks.',
   '«Gewesen» takes «sein». A duration needs no preposition in German.',
   NULL, '[{"token":"gewesen","lemma":"sein","gloss":"been","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','travel','a2','sein']),

  ('sentence', 'Er ist den ganzen Tag zu Hause geblieben.',
   'He is the whole day at home stayed.',
   'He stayed at home all day.',
   '«Bleiben» takes «sein»: staying is a state, not an action.',
   NULL, '[{"token":"geblieben","lemma":"bleiben","gloss":"stayed","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','daily','a2']),

  ('sentence', 'Ich bin heute früh aufgestanden.',
   'I am today early up-stood.',
   'I got up early today.',
   'A separable verb: the «ge-» sits between the prefix and the stem, «auf|ge|standen».',
   NULL, '[{"token":"aufgestanden","lemma":"aufstehen","gloss":"got up","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','daily','separable','a2']),

  ('sentence', 'Ich bin erst um Mitternacht eingeschlafen.',
   'I am only at midnight in-slept.',
   'I only fell asleep at midnight.',
   '«Erst» means not until. Another separable verb: «ein|ge|schlafen».',
   NULL, '[{"token":"eingeschlafen","lemma":"einschlafen","gloss":"fallen asleep","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','daily','separable','a2']),

  ('sentence', 'Meine Schwester ist in Kenya geboren.',
   'My sister is in Kenya born.',
   'My sister was born in Kenya.',
   '«Geboren» is already a participle form, so it takes no «ge-».',
   NULL, '[{"token":"geboren","lemma":"gebären","gloss":"born","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','family','a2']),

  ('sentence', 'Ich habe gestern Fieber gehabt.',
   'I have yesterday fever had.',
   'I had a fever yesterday.',
   'The participle of «haben» is «gehabt». No article with «Fieber».',
   NULL, '[{"token":"gehabt","lemma":"haben","gloss":"had","pos":"verb"}]'::jsonb,
   'gesundheit', ARRAY['health','past','a2','haben']),

  ('sentence', 'Ich habe meinen Bus verpasst.',
   'I have my bus missed.',
   'I missed my bus.',
   'Inseparable «ver-» means no «ge-»: «verpasst», not «geverpasst».',
   NULL, '[{"token":"verpasst","lemma":"verpassen","gloss":"missed","pos":"verb"}]'::jsonb,
   'reisen', ARRAY['travel','past','problems','a2']),

  ('sentence', 'Sie hat ihr Handy verloren.',
   'She has her phone lost.',
   'She lost her phone.',
   'Another inseparable prefix: the participle is «verloren».',
   NULL, '[{"token":"verloren","lemma":"verlieren","gloss":"lost","pos":"verb"}]'::jsonb,
   'reisen', ARRAY['travel','past','problems','a2']),

  ('sentence', 'Ich habe im Supermarkt eingekauft.',
   'I have in the supermarket in-bought.',
   'I did the shopping at the supermarket.',
   '«Einkaufen» is separable: «ein|ge|kauft». This is where the two rules meet.',
   NULL, '[{"token":"eingekauft","lemma":"einkaufen","gloss":"shopped","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','shopping','separable','a2'])
) AS s(kind, surface, translation_literal, translation_natural, grammar_note, part_of_speech, vocab_breakdown, topic, tags)
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL AND i.language_code = 'de' AND i.kind = s.kind
    AND lower(i.surface) = lower(s.surface)
);
