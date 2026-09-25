-- ============================================================================
-- French A2: drill coverage
-- ============================================================================
-- Each passé composé form was introduced in one or two sentences. The generator
-- needs three, and for French there is a second reason to repeat them: the
-- choice of auxiliary is the error this level is really about, so a verb met in
-- several sentences is a verb whose auxiliary gets learned.
--
-- Weighted towards the «être» verbs — «aller», «rentrer», «rester», «naître» —
-- because those are the ones a learner gets wrong after mastering «avoir».
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
  ('sentence', 'J''ai mangé trop vite ce matin.',
   'I have eaten too fast this morning.',
   'I ate too quickly this morning.',
   '«Trop vite» is too fast. The participle stays «mangé» with «avoir».',
   NULL, '[{"token":"mangé","lemma":"manger","gloss":"eaten","pos":"verb"}]'::jsonb,
   'recit', ARRAY['past','food','a2','manger']),

  ('sentence', 'Nous avons mangé ensemble hier.',
   'We have eaten together yesterday.',
   'We ate together yesterday.',
   'With «avoir» the participle never agrees, even with a plural subject: «mangé», not «mangés».',
   NULL, '[{"token":"mangé","lemma":"manger","gloss":"eaten","pos":"verb"},{"token":"ensemble","lemma":"ensemble","gloss":"together","pos":"adverb"}]'::jsonb,
   'recit', ARRAY['past','food','a2','manger']),

  ('sentence', 'J''ai fait la cuisine pour mes amis.',
   'I have done the cooking for my friends.',
   'I cooked for my friends.',
   '«Faire la cuisine» means to cook. The participle of «faire» is irregular: «fait».',
   NULL, '[{"token":"fait","lemma":"faire","gloss":"done","pos":"verb"},{"token":"cuisine","lemma":"cuisine","gloss":"cooking","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','food','a2','faire']),

  ('sentence', 'J''ai vu mes parents le week-end dernier.',
   'I have seen my parents the weekend last.',
   'I saw my parents last weekend.',
   'The participle of «voir» is «vu», never «voyé».',
   NULL, '[{"token":"vu","lemma":"voir","gloss":"seen","pos":"verb"},{"token":"parents","lemma":"parent","gloss":"parents","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','family','a2','voir']),

  ('sentence', 'Tu as vu le nouveau café ?',
   'You have seen the new café?',
   'Have you seen the new café?',
   'A question by intonation alone: no inversion needed in informal French.',
   NULL, '[{"token":"vu","lemma":"voir","gloss":"seen","pos":"verb"},{"token":"café","lemma":"café","gloss":"café","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','question','a2','voir']),

  ('sentence', 'J''ai parlé français toute la journée.',
   'I have spoken French all the day.',
   'I spoke French all day.',
   '«Toute la journée» means all day. Note the feminine form «toute» with «journée».',
   NULL, '[{"token":"parlé","lemma":"parler","gloss":"spoken","pos":"verb"},{"token":"français","lemma":"français","gloss":"French","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','language','a2','parler']),

  ('sentence', 'Elle est allée au marché.',
   'She is gone to the market.',
   'She went to the market.',
   '«Aller» takes «être», so the participle agrees with the female subject: «allée».',
   NULL, '[{"token":"allée","lemma":"aller","gloss":"gone","pos":"verb"},{"token":"marché","lemma":"marché","gloss":"market","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','travel','a2','aller']),

  ('sentence', 'Ils sont allés en vacances.',
   'They are gone on holiday.',
   'They went on holiday.',
   'Plural with «être»: «allés» with an s. This agreement is the rule A2 learners miss most.',
   NULL, '[{"token":"allés","lemma":"aller","gloss":"gone","pos":"verb"},{"token":"vacances","lemma":"vacances","gloss":"holiday","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','travel','a2','aller']),

  ('sentence', 'Je me suis senti mieux après le repos.',
   'I myself am felt better after the rest.',
   'I felt better after the rest.',
   'Reflexive verbs take «être» in the passé composé: «je me suis senti», never «je m''ai senti».',
   NULL, '[{"token":"senti","lemma":"sentir","gloss":"felt","pos":"verb"},{"token":"repos","lemma":"repos","gloss":"rest","pos":"noun"}]'::jsonb,
   'sante', ARRAY['health','past','reflexive','a2']),

  ('sentence', 'Elle a été très gentille avec moi.',
   'She has been very kind with me.',
   'She was very kind to me.',
   'The participle of «être» is «été». It never agrees when the auxiliary is «avoir».',
   NULL, '[{"token":"été","lemma":"être","gloss":"been","pos":"verb"},{"token":"gentille","lemma":"gentil","gloss":"kind","pos":"adjective"}]'::jsonb,
   'sante', ARRAY['past','a2','être']),

  ('sentence', 'Nous avons été en retard.',
   'We have been in delay.',
   'We were late.',
   '«Être en retard» means to be late. «Été» does not change with «avoir».',
   NULL, '[{"token":"été","lemma":"être","gloss":"been","pos":"verb"},{"token":"retard","lemma":"retard","gloss":"delay","pos":"noun"}]'::jsonb,
   'voyage', ARRAY['past','travel','a2','être']),

  ('sentence', 'J''ai perdu mon billet.',
   'I have lost my ticket.',
   'I lost my ticket.',
   'Regular -re verb: the participle of «perdre» is «perdu».',
   NULL, '[{"token":"perdu","lemma":"perdre","gloss":"lost","pos":"verb"},{"token":"billet","lemma":"billet","gloss":"ticket","pos":"noun"}]'::jsonb,
   'voyage', ARRAY['travel','past','problems','a2']),

  ('sentence', 'Il a raté son train de peu.',
   'He has missed his train by little.',
   'He only just missed his train.',
   '«De peu» means by a little, the margin by which something was missed.',
   NULL, '[{"token":"raté","lemma":"rater","gloss":"missed","pos":"verb"},{"token":"train","lemma":"train","gloss":"train","pos":"noun"}]'::jsonb,
   'voyage', ARRAY['travel','past','problems','a2']),

  ('sentence', 'Je suis rentré à minuit.',
   'I am returned at midnight.',
   'I got home at midnight.',
   '«Rentrer» takes «être». «À minuit» is at midnight, with no article.',
   NULL, '[{"token":"rentré","lemma":"rentrer","gloss":"returned","pos":"verb"},{"token":"minuit","lemma":"minuit","gloss":"midnight","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','daily','a2']),

  ('sentence', 'Elle est restée chez sa sœur.',
   'She is stayed at the house of her sister.',
   'She stayed at her sister''s place.',
   '«Rester» takes «être» and agrees: «restée». «Chez» means at someone''s home.',
   NULL, '[{"token":"restée","lemma":"rester","gloss":"stayed","pos":"verb"},{"token":"sœur","lemma":"sœur","gloss":"sister","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','family','a2'])
) AS s(kind, surface, translation_literal, translation_natural, grammar_note, part_of_speech, vocab_breakdown, topic, tags)
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL AND i.language_code = 'fr' AND i.kind = s.kind
    AND lower(i.surface) = lower(s.surface)
);
