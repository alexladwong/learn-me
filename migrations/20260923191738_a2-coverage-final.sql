-- ============================================================================
-- A2 drill coverage: the last gaps
-- ============================================================================
-- Brings the remaining French and German forms to the three-sentence floor the
-- drill generator requires. One statement per language, each following the shape
-- that passes the query parser: staging columns in target order, mapped one for
-- one.
-- ============================================================================

INSERT INTO public.items (
  language_code, kind, surface, translation_literal, translation_natural,
  grammar_note, part_of_speech, vocab_breakdown, topic, tags,
  difficulty, source, owner_id
)
SELECT
  'fr', s.kind, s.surface, s.translation_literal, s.translation_natural,
  s.grammar_note, s.part_of_speech, s.vocab_breakdown, s.topic, s.tags,
  'A2', 'curriculum', NULL
FROM (VALUES
  ('sentence', 'Ils sont allés au restaurant ensemble.',
   'They are gone to the restaurant together.',
   'They went to the restaurant together.',
   'Plural with «être»: the participle agrees and takes an s, «allés».',
   NULL, '[{"token":"allés","lemma":"aller","gloss":"gone","pos":"verb"}]'::jsonb,
   'recit', ARRAY['past','travel','a2','aller']),
  ('sentence', 'Je suis rentré très tard.',
   'I am returned very late.',
   'I got home very late.',
   '«Rentrer» takes «être». No agreement is visible here because the subject is masculine singular.',
   NULL, '[{"token":"rentré","lemma":"rentrer","gloss":"returned","pos":"verb"}]'::jsonb,
   'recit', ARRAY['past','daily','a2']),
  ('sentence', 'Nous sommes restés deux heures.',
   'We are stayed two hours.',
   'We stayed for two hours.',
   'Plural with «être»: «restés». A duration needs no preposition in French either.',
   NULL, '[{"token":"restés","lemma":"rester","gloss":"stayed","pos":"verb"}]'::jsonb,
   'recit', ARRAY['past','daily','a2']),
  ('sentence', 'Je me suis senti fatigué après le voyage.',
   'I myself am felt tired after the journey.',
   'I felt tired after the journey.',
   'A reflexive verb always takes «être»: «je me suis senti», never «je m''ai senti».',
   NULL, '[{"token":"senti","lemma":"sentir","gloss":"felt","pos":"verb"}]'::jsonb,
   'sante', ARRAY['health','past','reflexive','a2']),
  ('sentence', 'J''ai perdu mon temps.',
   'I have lost my time.',
   'I wasted my time.',
   '«Perdre son temps» idiomatically means to waste time.',
   NULL, '[{"token":"perdu","lemma":"perdre","gloss":"lost","pos":"verb"}]'::jsonb,
   'recit', ARRAY['past','a2']),
  ('sentence', 'Nous avons raté le début du film.',
   'We have missed the beginning of the film.',
   'We missed the start of the film.',
   'Regular -er verb: the participle is «raté», unchanged with «avoir».',
   NULL, '[{"token":"raté","lemma":"rater","gloss":"missed","pos":"verb"}]'::jsonb,
   'recit', ARRAY['past','a2'])
) AS s(kind, surface, translation_literal, translation_natural, grammar_note, part_of_speech, vocab_breakdown, topic, tags)
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL AND i.language_code = 'fr' AND i.kind = s.kind
    AND lower(i.surface) = lower(s.surface)
);

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
  ('sentence', 'Ich bin um sechs Uhr aufgestanden.',
   'I am at six o clock up-stood.',
   'I got up at six.',
   'Separable verb: «auf|ge|standen». The time expression comes before it.',
   NULL, '[{"token":"aufgestanden","lemma":"aufstehen","gloss":"got up","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','daily','separable','a2']),
  ('sentence', 'Das Kind ist schnell eingeschlafen.',
   'The child is quickly in-slept.',
   'The child fell asleep quickly.',
   '«Einschlafen» takes «sein» — falling asleep is a change of state.',
   NULL, '[{"token":"eingeschlafen","lemma":"einschlafen","gloss":"fallen asleep","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','daily','separable','a2']),
  ('sentence', 'Sie hat den ganzen Tag gearbeitet.',
   'She has the whole day worked.',
   'She worked all day.',
   '«Gearbeitet» keeps its «ge-». «Den ganzen Tag» is the accusative of duration.',
   NULL, '[{"token":"gearbeitet","lemma":"arbeiten","gloss":"worked","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','work','a2','arbeiten']),
  ('sentence', 'Wir sind gestern zu Hause geblieben.',
   'We are yesterday at home stayed.',
   'We stayed at home yesterday.',
   '«Bleiben» takes «sein», for every subject.',
   NULL, '[{"token":"geblieben","lemma":"bleiben","gloss":"stayed","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','daily','a2']),
  ('sentence', 'Ich bin in Deutschland geboren.',
   'I am in Germany born.',
   'I was born in Germany.',
   'The same participle for any subject: «geboren» never changes.',
   NULL, '[{"token":"geboren","lemma":"gebären","gloss":"born","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','a2']),
  ('sentence', 'Ich habe keine Zeit gehabt.',
   'I have no time had.',
   'I had no time.',
   '«Keine» negates a noun, where «nicht» would negate the verb.',
   NULL, '[{"token":"gehabt","lemma":"haben","gloss":"had","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','negation','a2','haben']),
  ('sentence', 'Ich habe meine Hausaufgaben gemacht.',
   'I have my homework done.',
   'I did my homework.',
   '«Die Hausaufgaben» is plural in German, unlike English homework.',
   NULL, '[{"token":"gemacht","lemma":"machen","gloss":"done","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','study','a2','machen']),
  ('sentence', 'Ich habe meine Fahrkarte verloren.',
   'I have my ticket lost.',
   'I lost my ticket.',
   'Inseparable «ver-», so the participle is «verloren» with no «ge-».',
   NULL, '[{"token":"verloren","lemma":"verlieren","gloss":"lost","pos":"verb"}]'::jsonb,
   'reisen', ARRAY['travel','past','problems','a2']),
  ('sentence', 'Er hat den letzten Bus verpasst.',
   'He has the last bus missed.',
   'He missed the last bus.',
   '«Verpassen» for missing transport; «verlieren» for losing an object.',
   NULL, '[{"token":"verpasst","lemma":"verpassen","gloss":"missed","pos":"verb"}]'::jsonb,
   'reisen', ARRAY['travel','past','problems','a2']),
  ('sentence', 'Wir haben gestern eingekauft.',
   'We have yesterday in-bought.',
   'We did the shopping yesterday.',
   'Where the separable prefix and the «ge-» meet: «ein|ge|kauft».',
   NULL, '[{"token":"eingekauft","lemma":"einkaufen","gloss":"shopped","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','shopping','separable','a2']),
  ('sentence', 'Sie hat im Internet eingekauft.',
   'She has in the internet in-bought.',
   'She shopped online.',
   '«Im Internet» — on the internet, with the contracted «im».',
   NULL, '[{"token":"eingekauft","lemma":"einkaufen","gloss":"shopped","pos":"verb"}]'::jsonb,
   'vergangenheit', ARRAY['past','shopping','separable','a2'])
) AS s(kind, surface, translation_literal, translation_natural, grammar_note, part_of_speech, vocab_breakdown, topic, tags)
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL AND i.language_code = 'de' AND i.kind = s.kind
    AND lower(i.surface) = lower(s.surface)
);
