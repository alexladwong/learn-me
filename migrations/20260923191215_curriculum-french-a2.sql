-- ============================================================================
-- French: Vie quotidienne (A2)
-- ============================================================================
-- The French A2 progression, mirroring the Spanish one so a learner moving
-- between languages meets the same situations in the same order.
--
-- Shape: 1 track -> 3 units -> 6 missions -> ~55 items.
--
-- The passé composé is the point of this level. French makes one demand that
-- Spanish and German do not: most verbs take «avoir», but a small set of
-- movement verbs takes «être», and the participle then agrees with the subject.
-- That single rule produces more A2 errors than anything else, so it is taught
-- explicitly and then repeated in several sentences.
--
-- Written with the staging columns in the same order as the target columns and
-- mapped one for one. The InsForge query parser rejects a statement whose select
-- list reorders the staging columns, reporting it as a security rejection with no
-- hint about the cause.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Track
-- ----------------------------------------------------------------------------
INSERT INTO public.tracks (
  language_code, slug, title, description, icon, cefr_band, order_index, is_published
)
SELECT
  'fr', 'vie-quotidienne', 'Vie quotidienne',
  'Talk about what you did, get around, and deal with feeling unwell. The step from A1 to A2.',
  'compass', 'A2', 20, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.tracks WHERE language_code = 'fr' AND slug = 'vie-quotidienne'
);

-- ----------------------------------------------------------------------------
-- Units and missions
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE a2_fr_units (
  unit_slug text, unit_title text, unit_summary text, unit_order integer,
  mission_slug text, mission_title text, mission_desc text, mission_order integer,
  estimated integer, topics text[]
) ON COMMIT DROP;

INSERT INTO a2_fr_units VALUES
  ('recit', 'Raconter le passé', 'Say what you did and where you went.', 10,
   'fr-passe-avoir', 'Ce que j''ai fait', 'Things you did, using avoir.', 10, 8, ARRAY['recit']),
  ('recit', 'Raconter le passé', 'Say what you did and where you went.', 10,
   'fr-passe-etre', 'Où je suis allé', 'Movement verbs, which take être.', 20, 8, ARRAY['recit']),
  ('voyage', 'Voyager', 'Buy tickets and handle a problem on the way.', 20,
   'fr-voyage-billets', 'Billets et horaires', 'Buy a ticket and understand the answer.', 10, 8, ARRAY['voyage']),
  ('voyage', 'Voyager', 'Buy tickets and handle a problem on the way.', 20,
   'fr-voyage-problemes', 'Quand ça va mal', 'Handle a delay and ask for help.', 20, 8, ARRAY['voyage']),
  ('sante', 'La santé', 'Describe a problem and understand the advice.', 30,
   'fr-sante-symptomes', 'Ce qui fait mal', 'Describe a symptom to a doctor.', 10, 8, ARRAY['sante']),
  ('sante', 'La santé', 'Describe a problem and understand the advice.', 30,
   'fr-sante-pharmacie', 'À la pharmacie', 'Buy medicine and follow instructions.', 20, 8, ARRAY['sante']);

INSERT INTO public.units (
  track_id, language_code, slug, title, description, cefr_level, order_index, is_published
)
SELECT DISTINCT
  t.id, 'fr', u.unit_slug, u.unit_title, u.unit_summary, 'A2', u.unit_order, true
FROM a2_fr_units u
JOIN public.tracks t ON t.language_code = 'fr' AND t.slug = 'vie-quotidienne'
WHERE NOT EXISTS (
  SELECT 1 FROM public.units existing
  WHERE existing.track_id = t.id AND existing.slug = u.unit_slug
);

INSERT INTO public.missions (
  unit_id, language_code, slug, title, description, order_index, estimated_minutes, is_published
)
SELECT
  un.id, 'fr', u.mission_slug, u.mission_title, u.mission_desc,
  u.mission_order, u.estimated, true
FROM a2_fr_units u
JOIN public.units un ON un.language_code = 'fr' AND un.slug = u.unit_slug
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
  'fr', s.kind, s.surface, s.translation_literal, s.translation_natural,
  s.grammar_note, s.part_of_speech, s.vocab_breakdown, s.topic, s.tags,
  'A2', 'curriculum', NULL
FROM (VALUES
  -- ===== Unit 1: Raconter le passé (avoir) =================================
  ('sentence', 'Hier j''ai mangé au restaurant.',
   'Yesterday I have eaten at the restaurant.',
   'Yesterday I ate at a restaurant.',
   'The passé composé is «avoir» plus the participle. «Mangé» never changes when the auxiliary is «avoir».',
   NULL, '[{"token":"Hier","lemma":"hier","gloss":"yesterday","pos":"adverb"},{"token":"mangé","lemma":"manger","gloss":"eaten","pos":"verb"}]'::jsonb,
   'recit', ARRAY['past','food','a2','manger']),

  ('sentence', 'J''ai mangé une pizza hier soir.',
   'I have eaten a pizza yesterday evening.',
   'I ate a pizza last night.',
   'The participle stays «mangé» whatever the subject: no agreement with «avoir».',
   NULL, '[{"token":"mangé","lemma":"manger","gloss":"eaten","pos":"verb"},{"token":"pizza","lemma":"pizza","gloss":"pizza","pos":"noun"},{"token":"soir","lemma":"soir","gloss":"evening","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','food','a2','manger']),

  ('sentence', 'Qu''est-ce que tu as fait hier ?',
   'What is it that you have done yesterday?',
   'What did you do yesterday?',
   '«Qu''est-ce que» is the everyday way to ask what. «Fait» is the irregular participle of «faire».',
   NULL, '[{"token":"fait","lemma":"faire","gloss":"done","pos":"verb"},{"token":"hier","lemma":"hier","gloss":"yesterday","pos":"adverb"}]'::jsonb,
   'recit', ARRAY['past','question','a2','faire']),

  ('sentence', 'J''ai fait mes courses samedi.',
   'I have done my shopping Saturday.',
   'I did my shopping on Saturday.',
   '«Faire les courses» means to do the shopping. «Fait» is irregular: not «fairé».',
   NULL, '[{"token":"fait","lemma":"faire","gloss":"done","pos":"verb"},{"token":"courses","lemma":"course","gloss":"shopping","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','shopping','a2','faire']),

  ('sentence', 'J''ai vu un bon film.',
   'I have seen a good film.',
   'I saw a good film.',
   'The participle of «voir» is «vu», not «voyé». Irregular participles are the main thing to learn at this level.',
   NULL, '[{"token":"vu","lemma":"voir","gloss":"seen","pos":"verb"},{"token":"film","lemma":"film","gloss":"film","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','a2','voir']),

  ('sentence', 'J''ai bu un café ce matin.',
   'I have drunk a coffee this morning.',
   'I had a coffee this morning.',
   'The participle of «boire» is «bu». «Ce matin» is still today, which is why French uses the passé composé here.',
   NULL, '[{"token":"bu","lemma":"boire","gloss":"drunk","pos":"verb"},{"token":"café","lemma":"café","gloss":"coffee","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','drink','a2','boire']),

  ('sentence', 'J''ai bu trop de café hier.',
   'I have drunk too much of coffee yesterday.',
   'I drank too much coffee yesterday.',
   '«Trop de» plus a noun means too much. «Bu» does not change with «avoir».',
   NULL, '[{"token":"bu","lemma":"boire","gloss":"drunk","pos":"verb"},{"token":"trop","lemma":"trop","gloss":"too much","pos":"adverb"}]'::jsonb,
   'recit', ARRAY['past','drink','a2','boire']),

  ('sentence', 'Nous avons parlé pendant une heure.',
   'We have spoken during one hour.',
   'We spoke for an hour.',
   '«Pendant» gives a duration. Regular -er verbs form the participle with -é: «parlé».',
   NULL, '[{"token":"parlé","lemma":"parler","gloss":"spoken","pos":"verb"},{"token":"heure","lemma":"heure","gloss":"hour","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','a2','parler']),

  ('sentence', 'J''ai parlé à ma mère hier soir.',
   'I have spoken to my mother yesterday evening.',
   'I spoke to my mother last night.',
   '«Parler à quelqu''un» — to speak to someone. The preposition «à» is required.',
   NULL, '[{"token":"parlé","lemma":"parler","gloss":"spoken","pos":"verb"},{"token":"mère","lemma":"mère","gloss":"mother","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','family','a2','parler']),

  ('word', 'hier', 'yesterday', 'yesterday',
   'Also «hier soir» for last night and «hier matin» for yesterday morning.', 'adverb', '[]'::jsonb,
   'recit', ARRAY['past','adverb','a2']),

  -- ===== Unit 2: Raconter le passé (être) ==================================
  ('sentence', 'Je suis allé au marché ce matin.',
   'I am gone to the market this morning.',
   'I went to the market this morning.',
   '«Aller» takes «être», not «avoir». The participle agrees with the subject: «allé», «allée».',
   NULL, '[{"token":"allé","lemma":"aller","gloss":"gone","pos":"verb"},{"token":"marché","lemma":"marché","gloss":"market","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','travel','a2','aller']),

  ('sentence', 'Elle est allée à Paris la semaine dernière.',
   'She is gone to Paris the week last.',
   'She went to Paris last week.',
   'Because the auxiliary is «être», the participle agrees: «allée» with the extra e for a female subject.',
   NULL, '[{"token":"allée","lemma":"aller","gloss":"gone","pos":"verb"},{"token":"semaine","lemma":"semaine","gloss":"week","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','travel','a2','aller']),

  ('sentence', 'Nous sommes allés au cinéma.',
   'We are gone to the cinema.',
   'We went to the cinema.',
   'Plural subject with «être»: «allés» with an s. This agreement is the rule that most A2 learners miss.',
   NULL, '[{"token":"allés","lemma":"aller","gloss":"gone","pos":"verb"},{"token":"cinéma","lemma":"cinéma","gloss":"cinema","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','a2','aller']),

  ('sentence', 'Je suis rentré tard hier soir.',
   'I am returned late yesterday evening.',
   'I got home late last night.',
   '«Rentrer» also takes «être». «Rentrer» means to go back in, or to get home.',
   NULL, '[{"token":"rentré","lemma":"rentrer","gloss":"returned","pos":"verb"},{"token":"tard","lemma":"tard","gloss":"late","pos":"adverb"}]'::jsonb,
   'recit', ARRAY['past','daily','a2']),

  ('sentence', 'Je suis resté à la maison tout le week-end.',
   'I am stayed at the house all the weekend.',
   'I stayed at home all weekend.',
   '«Rester» takes «être». «Tout le week-end» means the whole weekend.',
   NULL, '[{"token":"resté","lemma":"rester","gloss":"stayed","pos":"verb"},{"token":"maison","lemma":"maison","gloss":"house","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','daily','a2']),

  ('sentence', 'Je suis né en France.',
   'I am born in France.',
   'I was born in France.',
   '«Naître» takes «être» and is the standard example of participle agreement: «né», «née».',
   NULL, '[{"token":"né","lemma":"naître","gloss":"born","pos":"verb"},{"token":"France","lemma":"France","gloss":"France","pos":"noun"}]'::jsonb,
   'recit', ARRAY['past','a2']),

  ('word', 'rentrer', 'to return home', 'to return home',
   'Movement verb: takes «être» in the passé composé. «Je suis rentré» means I got home.', 'verb', '[]'::jsonb,
   'recit', ARRAY['verb','past','a2']),

  -- ===== Unit 3: Voyager ===================================================
  ('sentence', 'Un billet aller-retour, s''il vous plaît.',
   'A ticket to-go-return, if it you pleases.',
   'A return ticket, please.',
   '«Aller-retour» is a return; «aller simple» is one way. The hyphen makes it one word.',
   NULL, '[{"token":"billet","lemma":"billet","gloss":"ticket","pos":"noun"},{"token":"aller","lemma":"aller","gloss":"going","pos":"verb"}]'::jsonb,
   'voyage', ARRAY['travel','a2']),

  ('sentence', 'À quelle heure part le prochain train ?',
   'At what hour leaves the next train?',
   'What time does the next train leave?',
   '«Partir» means to leave or depart. Asking «à quelle heure» is the standard way to ask a time.',
   NULL, '[{"token":"heure","lemma":"heure","gloss":"hour","pos":"noun"},{"token":"part","lemma":"partir","gloss":"leaves","pos":"verb"},{"token":"train","lemma":"train","gloss":"train","pos":"noun"}]'::jsonb,
   'voyage', ARRAY['travel','question','a2']),

  ('sentence', 'Le train a vingt minutes de retard.',
   'The train has twenty minutes of delay.',
   'The train is twenty minutes late.',
   '«Avoir du retard» — to be late. «Le retard» is the delay.',
   NULL, '[{"token":"train","lemma":"train","gloss":"train","pos":"noun"},{"token":"retard","lemma":"retard","gloss":"delay","pos":"noun"}]'::jsonb,
   'voyage', ARRAY['travel','problems','a2']),

  ('sentence', 'J''ai raté mon train.',
   'I have missed my train.',
   'I missed my train.',
   '«Rater» means to miss or fail. Regular -er verb: participle «raté».',
   NULL, '[{"token":"raté","lemma":"rater","gloss":"missed","pos":"verb"},{"token":"train","lemma":"train","gloss":"train","pos":"noun"}]'::jsonb,
   'voyage', ARRAY['travel','past','problems','a2']),

  ('sentence', 'J''ai perdu mes clés dans le bus.',
   'I have lost my keys in the bus.',
   'I lost my keys on the bus.',
   'The participle of «perdre» is regular: «perdu». Note «dans le bus», not «sur».',
   NULL, '[{"token":"perdu","lemma":"perdre","gloss":"lost","pos":"verb"},{"token":"clés","lemma":"clé","gloss":"keys","pos":"noun"}]'::jsonb,
   'voyage', ARRAY['travel','past','problems','a2']),

  ('sentence', 'Pouvez-vous m''aider, s''il vous plaît ?',
   'Can you me to help, if it you pleases?',
   'Could you help me, please?',
   'Inversion makes a polite question. «Pouvez-vous» with a hyphen is formal; «tu peux» is not.',
   NULL, '[{"token":"pouvez","lemma":"pouvoir","gloss":"can","pos":"verb"},{"token":"aider","lemma":"aider","gloss":"to help","pos":"verb"}]'::jsonb,
   'voyage', ARRAY['travel','polite','a2','pouvoir']),

  ('word', 'retard', 'delay', 'delay',
   '«Être en retard» means to be late; «avoir du retard» is used for transport.', 'noun', '[]'::jsonb,
   'voyage', ARRAY['travel','noun','a2']),

  ('word', 'billet', 'ticket', 'ticket',
   'For a plane you will often see «un billet d''avion»; for a train, «un billet de train».', 'noun', '[]'::jsonb,
   'voyage', ARRAY['travel','noun','a2']),

  -- ===== Unit 4: La santé ==================================================
  ('sentence', 'J''ai mal à la tête depuis hier.',
   'I have pain at the head since yesterday.',
   'I have had a headache since yesterday.',
   'The French way to say it hurts is «avoir mal à» plus the body part. «Depuis» takes the present tense, not the perfect.',
   NULL, '[{"token":"mal","lemma":"mal","gloss":"pain","pos":"noun"},{"token":"tête","lemma":"tête","gloss":"head","pos":"noun"},{"token":"depuis","lemma":"depuis","gloss":"since","pos":"preposition"}]'::jsonb,
   'sante', ARRAY['health','symptoms','a2']),

  ('sentence', 'J''ai mal à la gorge quand je parle.',
   'I have pain at the throat when I speak.',
   'My throat hurts when I speak.',
   'The same structure for any body part: «j''ai mal au dos», «j''ai mal aux pieds».',
   NULL, '[{"token":"mal","lemma":"mal","gloss":"pain","pos":"noun"},{"token":"gorge","lemma":"gorge","gloss":"throat","pos":"noun"}]'::jsonb,
   'sante', ARRAY['health','symptoms','a2']),

  ('sentence', 'Je me suis senti mal hier.',
   'I myself am felt bad yesterday.',
   'I felt unwell yesterday.',
   'A reflexive verb in the passé composé always takes «être»: «je me suis senti». Never «je m''ai senti».',
   NULL, '[{"token":"senti","lemma":"sentir","gloss":"felt","pos":"verb"},{"token":"mal","lemma":"mal","gloss":"bad","pos":"adverb"}]'::jsonb,
   'sante', ARRAY['health','past','reflexive','a2']),

  ('sentence', 'J''ai été malade pendant trois jours.',
   'I have been ill during three days.',
   'I was ill for three days.',
   'The participle of «être» is «été». «Pendant» gives the duration.',
   NULL, '[{"token":"été","lemma":"être","gloss":"been","pos":"verb"},{"token":"malade","lemma":"malade","gloss":"ill","pos":"adjective"}]'::jsonb,
   'sante', ARRAY['health','past','a2','être']),

  ('sentence', 'J''ai eu de la fièvre la nuit dernière.',
   'I have had of the fever the night last.',
   'I had a fever last night.',
   'The participle of «avoir» is «eu», pronounced like «u». «De la fièvre» uses the partitive.',
   NULL, '[{"token":"eu","lemma":"avoir","gloss":"had","pos":"verb"},{"token":"fièvre","lemma":"fièvre","gloss":"fever","pos":"noun"}]'::jsonb,
   'sante', ARRAY['health','past','a2','avoir']),

  ('sentence', 'Je voudrais quelque chose contre la douleur.',
   'I would like something against the pain.',
   'I would like something for the pain.',
   'French uses «contre» where English uses "for" with medicine.',
   NULL, '[{"token":"voudrais","lemma":"vouloir","gloss":"would like","pos":"verb"},{"token":"douleur","lemma":"douleur","gloss":"pain","pos":"noun"}]'::jsonb,
   'sante', ARRAY['health','pharmacy','a2','vouloir']),

  ('sentence', 'Combien de fois par jour dois-je le prendre ?',
   'How many of times per day must I it to take?',
   'How many times a day should I take it?',
   '«Combien de fois par jour» asks the frequency. Inversion after «dois-je» is formal but required here.',
   NULL, '[{"token":"fois","lemma":"fois","gloss":"times","pos":"noun"},{"token":"jour","lemma":"jour","gloss":"day","pos":"noun"},{"token":"prendre","lemma":"prendre","gloss":"to take","pos":"verb"}]'::jsonb,
   'sante', ARRAY['health','pharmacy','question','a2']),

  ('word', 'douleur', 'pain', 'pain',
   'The noun is «la douleur»; the common phrase is «avoir mal», not «avoir une douleur».', 'noun', '[]'::jsonb,
   'sante', ARRAY['health','noun','a2']),

  ('word', 'fièvre', 'fever', 'fever',
   '«Avoir de la fièvre» — to have a fever. The partitive «de la» is required.', 'noun', '[]'::jsonb,
   'sante', ARRAY['health','noun','a2'])
) AS s(kind, surface, translation_literal, translation_natural, grammar_note, part_of_speech, vocab_breakdown, topic, tags)
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL AND i.language_code = 'fr' AND i.kind = s.kind
    AND lower(i.surface) = lower(s.surface)
);
