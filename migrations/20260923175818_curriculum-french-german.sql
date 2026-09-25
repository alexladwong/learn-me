-- ============================================================================
-- French and German: Foundations (A1)
-- ============================================================================
-- Both languages were flagged `is_available = true` in the catalogue with no
-- content behind the flag, which meant a learner could select French and land on
-- empty screens. An available language must have something to learn, so this
-- adds a real A1 curriculum for each.
--
-- Shape mirrors Spanish: 1 track -> 4 units -> 8 missions per language, with the
-- same pedagogical progression (greet, introduce, family and daily life, food).
--
-- One deliberate constraint shaped the item counts. The confusion-drill generator
-- needs at least three sentences containing a form before it will build a drill
-- for it — that is what makes a drill practice rather than a demo. So every
-- first-person verb below appears in three or more sentences.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- French
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE seed_fr (
  kind text, surface text, translation_literal text, translation_natural text,
  grammar_note text, part_of_speech text, vocab_breakdown jsonb,
  topic text, tags text[]
) ON COMMIT DROP;

INSERT INTO seed_fr VALUES
  -- ===== Unit 1: Premiers mots =============================================
  ('sentence', 'Bonjour, comment allez-vous ?', 'Good day, how go you?', 'Hello, how are you?',
   '«Vous» is the polite form. With a friend you would say «comment vas-tu ?» or simply «ça va ?».',
   NULL, '[{"token":"Bonjour","lemma":"bonjour","gloss":"hello","pos":"interjection"},{"token":"comment","lemma":"comment","gloss":"how","pos":"adverb"},{"token":"allez","lemma":"aller","gloss":"you go","pos":"verb"}]'::jsonb,
   'greetings', ARRAY['greeting','formal','a1','aller']),

  ('sentence', 'Salut, ça va ?', 'Hi, it goes?', 'Hi, how''s it going?',
   '«Ça va ?» is the everyday greeting. The answer is «ça va, merci» or «ça va bien».',
   NULL, '[{"token":"Salut","lemma":"salut","gloss":"hi","pos":"interjection"},{"token":"ça","lemma":"ça","gloss":"it","pos":"pronoun"},{"token":"va","lemma":"aller","gloss":"goes","pos":"verb"}]'::jsonb,
   'greetings', ARRAY['greeting','informal','a1','aller']),

  ('sentence', 'Je vais bien, merci. Et vous ?', 'I go well, thanks. And you?', 'I''m well, thanks. And you?',
   'State is expressed with «aller», not «être»: «je vais bien» literally means I go well.',
   NULL, '[{"token":"Je","lemma":"je","gloss":"I","pos":"pronoun"},{"token":"vais","lemma":"aller","gloss":"go","pos":"verb"},{"token":"bien","lemma":"bien","gloss":"well","pos":"adverb"},{"token":"merci","lemma":"merci","gloss":"thank you","pos":"noun"}]'::jsonb,
   'greetings', ARRAY['greeting','response','a1','aller']),

  ('sentence', 'Enchanté de vous rencontrer.', 'Delighted of you to meet.', 'Pleased to meet you.',
   'A woman writes «enchantée» with a second e. The pronunciation is identical, so only writing shows it.',
   NULL, '[{"token":"Enchanté","lemma":"enchanté","gloss":"delighted","pos":"adjective"},{"token":"rencontrer","lemma":"rencontrer","gloss":"to meet","pos":"verb"}]'::jsonb,
   'greetings', ARRAY['introduction','polite','a1']),

  ('sentence', 'Au revoir, à bientôt !', 'To the seeing again, to soon!', 'Goodbye, see you soon!',
   '«Au revoir» works anywhere. «À bientôt» means see you soon, «à demain» means see you tomorrow.',
   NULL, '[{"token":"revoir","lemma":"revoir","gloss":"to see again","pos":"verb"},{"token":"bientôt","lemma":"bientôt","gloss":"soon","pos":"adverb"}]'::jsonb,
   'greetings', ARRAY['farewell','a1']),

  ('sentence', 'Excusez-moi, pouvez-vous m''aider ?', 'Excuse me, can you me to help?', 'Excuse me, could you help me?',
   '«Pouvez-vous» inverts the verb and pronoun to form a polite question; the hyphen is required.',
   NULL, '[{"token":"Excusez","lemma":"excuser","gloss":"excuse","pos":"verb"},{"token":"pouvez","lemma":"pouvoir","gloss":"can","pos":"verb"},{"token":"aider","lemma":"aider","gloss":"to help","pos":"verb"}]'::jsonb,
   'greetings', ARRAY['polite','request','a1','pouvoir']),

  ('word', 'merci', 'thanks', 'thank you',
   'Reply with «de rien» or «je vous en prie» — the second is more formal.', 'noun', '[]'::jsonb,
   'greetings', ARRAY['courtesy','a1']),

  ('word', 'bonjour', 'hello', 'hello',
   'Used until roughly six in the evening, then «bonsoir».', 'noun', '[]'::jsonb,
   'greetings', ARRAY['greeting','noun','a1']),

  -- ===== Unit 2: Se présenter ==============================================
  ('sentence', 'Je m''appelle Marie. Et toi ?', 'I me call Marie. And you?', 'My name is Marie. And you?',
   '«S''appeler» is reflexive: je m''appelle, tu t''appelles, il s''appelle. The apostrophe replaces the e in «me».',
   NULL, '[{"token":"appelle","lemma":"appeler","gloss":"call","pos":"verb"},{"token":"toi","lemma":"toi","gloss":"you","pos":"pronoun"}]'::jsonb,
   'introductions', ARRAY['introduction','reflexive','a1','appeler']),

  ('sentence', 'Je suis de Paris.', 'I am from Paris.', 'I''m from Paris.',
   'Origin takes «être» plus «de». «Je viens de Paris» is equally common and slightly warmer.',
   NULL, '[{"token":"suis","lemma":"être","gloss":"am","pos":"verb"},{"token":"de","lemma":"de","gloss":"from","pos":"preposition"}]'::jsonb,
   'introductions', ARRAY['origin','a1','être']),

  ('sentence', 'D''où venez-vous ?', 'From where come you?', 'Where are you from?',
   '«Venir» means to come, so this asks where you come from — the standard way to ask origin.',
   NULL, '[{"token":"venez","lemma":"venir","gloss":"come","pos":"verb"},{"token":"vous","lemma":"vous","gloss":"you","pos":"pronoun"}]'::jsonb,
   'introductions', ARRAY['question','origin','a1','venir']),

  ('sentence', 'Je parle un peu français.', 'I speak a little French.', 'I speak a little French.',
   '«Un peu de» before a noun, but «un peu» alone after a verb: «je parle un peu».',
   NULL, '[{"token":"parle","lemma":"parler","gloss":"speak","pos":"verb"},{"token":"peu","lemma":"peu","gloss":"little","pos":"adverb"},{"token":"français","lemma":"français","gloss":"French","pos":"noun"}]'::jsonb,
   'introductions', ARRAY['language','a1','parler']),

  ('sentence', 'J''ai vingt ans.', 'I have twenty years.', 'I''m twenty years old.',
   'Age uses «avoir», not «être»: you *have* years in French.',
   NULL, '[{"token":"ai","lemma":"avoir","gloss":"have","pos":"verb"},{"token":"vingt","lemma":"vingt","gloss":"twenty","pos":"number"},{"token":"ans","lemma":"an","gloss":"years","pos":"noun"}]'::jsonb,
   'introductions', ARRAY['numbers','a1','avoir']),

  ('sentence', 'Voici mon ami Paul.', 'Here is my friend Paul.', 'This is my friend Paul.',
   '«Voici» presents someone or something; «voilà» points at something further away or just arriving.',
   NULL, '[{"token":"Voici","lemma":"voici","gloss":"here is","pos":"preposition"},{"token":"ami","lemma":"ami","gloss":"friend","pos":"noun"}]'::jsonb,
   'introductions', ARRAY['introduction','a1']),

  ('word', 's''appeler', 'to call oneself', 'to be called',
   'Reflexive. Drop «se» and conjugate: je m''appelle, tu t''appelles, nous nous appelons.', 'verb',
   '[]'::jsonb, 'introductions', ARRAY['verb','reflexive','a1','appeler']),

  ('word', 'ami', 'friend', 'friend',
   'A female friend is «amie»; the pronunciation changes, unlike «enchanté».', 'noun', '[]'::jsonb,
   'introductions', ARRAY['noun','people','a1']),

  -- ===== Unit 3: La famille ================================================
  ('sentence', 'J''ai deux frères.', 'I have two brothers.', 'I have two brothers.',
   '«Frère» is brother, «sœur» is sister. The plural «frères» can mean brothers or siblings together.',
   NULL, '[{"token":"ai","lemma":"avoir","gloss":"have","pos":"verb"},{"token":"deux","lemma":"deux","gloss":"two","pos":"number"},{"token":"frères","lemma":"frère","gloss":"brothers","pos":"noun"}]'::jsonb,
   'family', ARRAY['family','numbers','a1','avoir']),

  ('sentence', 'J''ai une sœur aînée.', 'I have a sister elder.', 'I have an older sister.',
   '«Aîné» means older, «cadet» younger. Adjectives of family relation follow the noun.',
   NULL, '[{"token":"ai","lemma":"avoir","gloss":"have","pos":"verb"},{"token":"sœur","lemma":"sœur","gloss":"sister","pos":"noun"},{"token":"aînée","lemma":"aîné","gloss":"elder","pos":"adjective"}]'::jsonb,
   'family', ARRAY['family','a1','avoir']),

  ('sentence', 'Ma mère s''appelle Claire.', 'My mother herself calls Claire.', 'My mother''s name is Claire.',
   'Possessives agree with the noun, not the owner: «ma mère» but «mon père».',
   NULL, '[{"token":"mère","lemma":"mère","gloss":"mother","pos":"noun"},{"token":"appelle","lemma":"appeler","gloss":"calls","pos":"verb"}]'::jsonb,
   'family', ARRAY['family','reflexive','a1','appeler']),

  ('sentence', 'Mon père travaille à l''hôpital.', 'My father works at the hospital.', 'My father works at the hospital.',
   '«À l''» before a vowel sound: «à l''hôpital», not «à le hôpital».',
   NULL, '[{"token":"père","lemma":"père","gloss":"father","pos":"noun"},{"token":"travaille","lemma":"travailler","gloss":"works","pos":"verb"},{"token":"hôpital","lemma":"hôpital","gloss":"hospital","pos":"noun"}]'::jsonb,
   'family', ARRAY['family','work','a1','travailler']),

  ('sentence', 'Vous avez des enfants ?', 'You have some children?', 'Do you have children?',
   'A yes/no question can be made by intonation alone, or formally by inversion: «avez-vous des enfants ?».',
   NULL, '[{"token":"avez","lemma":"avoir","gloss":"have","pos":"verb"},{"token":"enfants","lemma":"enfant","gloss":"children","pos":"noun"}]'::jsonb,
   'family', ARRAY['family','question','a1','avoir']),

  ('sentence', 'Nous habitons à Lyon.', 'We live at Lyon.', 'We live in Lyon.',
   '«Habiter à» for a city, «habiter en» for a country with a feminine name: «en France».',
   NULL, '[{"token":"habitons","lemma":"habiter","gloss":"live","pos":"verb"},{"token":"Lyon","lemma":"Lyon","gloss":"Lyon","pos":"noun"}]'::jsonb,
   'family', ARRAY['home','a1','habiter']),

  ('word', 'frère', 'brother', 'brother',
   'The plural «frères» often means brothers and sisters together.', 'noun', '[]'::jsonb,
   'family', ARRAY['family','noun','a1']),

  ('word', 'mère', 'mother', 'mother',
   '«Maman» is the affectionate everyday word; «mère» is neutral or formal.', 'noun', '[]'::jsonb,
   'family', ARRAY['family','noun','a1']),

  -- ===== Unit 4: Manger et boire ===========================================
  ('sentence', 'Je voudrais un café, s''il vous plaît.', 'I would like a coffee, if it you pleases.', 'I''d like a coffee, please.',
   '«Je voudrais» is the polite form of «je veux». Ordering with «je veux» sounds blunt.',
   NULL, '[{"token":"voudrais","lemma":"vouloir","gloss":"would like","pos":"verb"},{"token":"café","lemma":"café","gloss":"coffee","pos":"noun"},{"token":"plaît","lemma":"plaire","gloss":"pleases","pos":"verb"}]'::jsonb,
   'food', ARRAY['ordering','polite','a1','vouloir']),

  ('sentence', 'Je mange du pain le matin.', 'I eat of the bread the morning.', 'I eat bread in the morning.',
   '«Du» is the partitive article for an unspecified amount: some bread. It is required with food.',
   NULL, '[{"token":"mange","lemma":"manger","gloss":"eat","pos":"verb"},{"token":"pain","lemma":"pain","gloss":"bread","pos":"noun"},{"token":"matin","lemma":"matin","gloss":"morning","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','a1','manger']),

  ('sentence', 'Je mange avec ma famille le dimanche.', 'I eat with my family the Sunday.', 'I eat with my family on Sundays.',
   '«Le dimanche» with the definite article means every Sunday, not a specific one.',
   NULL, '[{"token":"mange","lemma":"manger","gloss":"eat","pos":"verb"},{"token":"famille","lemma":"famille","gloss":"family","pos":"noun"},{"token":"dimanche","lemma":"dimanche","gloss":"Sunday","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','family','a1','manger']),

  ('sentence', 'Je bois de l''eau avec le repas.', 'I drink of the water with the meal.', 'I drink water with meals.',
   '«De l''» is the partitive before a vowel: «de l''eau». Before a consonant it is «du» or «de la».',
   NULL, '[{"token":"bois","lemma":"boire","gloss":"drink","pos":"verb"},{"token":"eau","lemma":"eau","gloss":"water","pos":"noun"},{"token":"repas","lemma":"repas","gloss":"meal","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','drink','a1','boire']),

  ('sentence', 'Je bois du thé le soir.', 'I drink of the tea the evening.', 'I drink tea in the evening.',
   'French uses the definite article where English omits it: «le soir» means in the evening, habitually.',
   NULL, '[{"token":"bois","lemma":"boire","gloss":"drink","pos":"verb"},{"token":"thé","lemma":"thé","gloss":"tea","pos":"noun"},{"token":"soir","lemma":"soir","gloss":"evening","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','drink','a1','boire']),

  ('sentence', 'L''addition, s''il vous plaît.', 'The bill, if it you pleases.', 'The bill, please.',
   'In a restaurant you ask for «l''addition». In a bar it is also «l''addition».',
   NULL, '[{"token":"addition","lemma":"addition","gloss":"bill","pos":"noun"},{"token":"plaît","lemma":"plaire","gloss":"pleases","pos":"verb"}]'::jsonb,
   'food', ARRAY['restaurant','a1']),

  ('sentence', 'Je ne bois pas d''alcool.', 'I not drink not of alcohol.', 'I don''t drink alcohol.',
   'Negation wraps the verb: «ne ... pas». In speech the «ne» is often dropped: «je bois pas d''alcool».',
   NULL, '[{"token":"bois","lemma":"boire","gloss":"drink","pos":"verb"},{"token":"alcool","lemma":"alcool","gloss":"alcohol","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','negation','a1','boire']),

  ('sentence', 'Je vais au marché aujourd''hui.', 'I go to the market today.', 'I''m going to the market today.',
   '«Au» is «à» + «le». «Je vais» followed by an infinitive forms the near future: «je vais manger».',
   NULL, '[{"token":"vais","lemma":"aller","gloss":"go","pos":"verb"},{"token":"marché","lemma":"marché","gloss":"market","pos":"noun"},{"token":"aujourd''hui","lemma":"aujourd''hui","gloss":"today","pos":"adverb"}]'::jsonb,
   'food', ARRAY['shopping','a1','aller']),

  ('word', 'manger', 'to eat', 'to eat',
   'Regular -er verb: je mange, tu manges, il mange, nous mangeons. Note the extra e before o.', 'verb',
   '[]'::jsonb, 'food', ARRAY['verb','a1','manger']),

  ('word', 'eau', 'water', 'water',
   'Feminine: «l''eau». The plural is rare but is «les eaux».', 'noun', '[]'::jsonb,
   'food', ARRAY['drink','noun','a1']),

  ('word', 'vouloir', 'to want', 'to want',
   'Irregular: je veux, tu veux, il veut, nous voulons. The polite conditional is «je voudrais».', 'verb',
   '[]'::jsonb, 'food', ARRAY['verb','irregular','a1','vouloir']),

  ('word', 'toujours', 'always', 'always',
   'The opposite is «jamais», which needs «ne»: «je ne bois jamais de café».', 'adverb', '[]'::jsonb,
   'food', ARRAY['adverb','a1']);

-- ----------------------------------------------------------------------------
-- German
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE seed_de (
  kind text, surface text, translation_literal text, translation_natural text,
  grammar_note text, part_of_speech text, vocab_breakdown jsonb,
  topic text, tags text[]
) ON COMMIT DROP;

INSERT INTO seed_de VALUES
  -- ===== Unit 1: Erste Wörter ==============================================
  ('sentence', 'Guten Morgen, wie geht es Ihnen?', 'Good morning, how goes it you?', 'Good morning, how are you?',
   '«Ihnen» is the polite dative form. With a friend: «wie geht es dir?».',
   NULL, '[{"token":"Guten","lemma":"gut","gloss":"good","pos":"adjective"},{"token":"Morgen","lemma":"Morgen","gloss":"morning","pos":"noun"},{"token":"geht","lemma":"gehen","gloss":"goes","pos":"verb"},{"token":"Ihnen","lemma":"Ihnen","gloss":"you (polite)","pos":"pronoun"}]'::jsonb,
   'greetings', ARRAY['greeting','formal','a1','gehen']),

  ('sentence', 'Hallo, wie geht''s?', 'Hello, how goes it?', 'Hi, how''s it going?',
   '«Geht''s» is the spoken contraction of «geht es». The answer is «gut, danke».',
   NULL, '[{"token":"Hallo","lemma":"hallo","gloss":"hello","pos":"interjection"},{"token":"geht","lemma":"gehen","gloss":"goes","pos":"verb"}]'::jsonb,
   'greetings', ARRAY['greeting','informal','a1','gehen']),

  ('sentence', 'Mir geht es gut, danke. Und Ihnen?', 'To me goes it good, thanks. And you?', 'I''m well, thanks. And you?',
   'German says the state happens *to* you: «mir geht es gut», literally it goes well to me.',
   NULL, '[{"token":"Mir","lemma":"mir","gloss":"to me","pos":"pronoun"},{"token":"geht","lemma":"gehen","gloss":"goes","pos":"verb"},{"token":"gut","lemma":"gut","gloss":"good","pos":"adjective"},{"token":"danke","lemma":"danke","gloss":"thanks","pos":"interjection"}]'::jsonb,
   'greetings', ARRAY['greeting','response','a1','gehen']),

  ('sentence', 'Freut mich, Sie kennenzulernen.', 'Pleases me, you to know.', 'Pleased to meet you.',
   'The separable verb «kennenlernen» keeps its prefix attached in the infinitive with «zu» in the middle: «kennenzulernen».',
   NULL, '[{"token":"Freut","lemma":"freuen","gloss":"pleases","pos":"verb"},{"token":"mich","lemma":"mich","gloss":"me","pos":"pronoun"},{"token":"kennenlernen","lemma":"kennenlernen","gloss":"to get to know","pos":"verb"}]'::jsonb,
   'greetings', ARRAY['introduction','polite','a1']),

  ('sentence', 'Auf Wiedersehen, bis bald!', 'On seeing again, until soon!', 'Goodbye, see you soon!',
   '«Auf Wiedersehen» is formal; «tschüss» is the everyday goodbye. «Bis morgen» means see you tomorrow.',
   NULL, '[{"token":"Wiedersehen","lemma":"Wiedersehen","gloss":"seeing again","pos":"noun"},{"token":"bald","lemma":"bald","gloss":"soon","pos":"adverb"}]'::jsonb,
   'greetings', ARRAY['farewell','a1']),

  ('sentence', 'Entschuldigung, können Sie mir helfen?', 'Excuse, can you me help?', 'Excuse me, could you help me?',
   '«Können» is a modal verb, so the main verb «helfen» goes to the end of the sentence.',
   NULL, '[{"token":"Entschuldigung","lemma":"Entschuldigung","gloss":"excuse me","pos":"noun"},{"token":"können","lemma":"können","gloss":"can","pos":"verb"},{"token":"helfen","lemma":"helfen","gloss":"to help","pos":"verb"}]'::jsonb,
   'greetings', ARRAY['polite','request','a1','können']),

  ('word', 'danke', 'thanks', 'thank you',
   'Reply with «bitte» — which also means please and you''re welcome.', 'interjection', '[]'::jsonb,
   'greetings', ARRAY['courtesy','a1']),

  ('word', 'guten Tag', 'good day', 'good day',
   'The neutral daytime greeting. «Guten Morgen» before noon, «Guten Abend» in the evening.', 'phrase',
   '[]'::jsonb, 'greetings', ARRAY['greeting','phrase','a1']),

  -- ===== Unit 2: Sich vorstellen ===========================================
  ('sentence', 'Ich heiße Anna. Und du?', 'I am called Anna. And you?', 'My name is Anna. And you?',
   '«Heißen» means to be called. «Ich bin Anna» is equally natural and slightly more common in speech.',
   NULL, '[{"token":"heiße","lemma":"heißen","gloss":"am called","pos":"verb"},{"token":"du","lemma":"du","gloss":"you","pos":"pronoun"}]'::jsonb,
   'introductions', ARRAY['introduction','a1','heißen']),

  ('sentence', 'Ich komme aus Uganda.', 'I come out of Uganda.', 'I come from Uganda.',
   '«Aus» for a country or city of origin. «Ich bin aus Uganda» works too.',
   NULL, '[{"token":"komme","lemma":"kommen","gloss":"come","pos":"verb"},{"token":"aus","lemma":"aus","gloss":"from","pos":"preposition"}]'::jsonb,
   'introductions', ARRAY['origin','a1','kommen']),

  ('sentence', 'Woher kommen Sie?', 'From where come you?', 'Where are you from?',
   '«Woher» asks about origin specifically. «Wo» alone asks where someone is right now.',
   NULL, '[{"token":"Woher","lemma":"woher","gloss":"from where","pos":"adverb"},{"token":"kommen","lemma":"kommen","gloss":"come","pos":"verb"}]'::jsonb,
   'introductions', ARRAY['question','origin','a1','kommen']),

  ('sentence', 'Ich spreche ein wenig Deutsch.', 'I speak a little German.', 'I speak a little German.',
   '«Ein wenig» and «ein bisschen» both mean a little. The second is more common in speech.',
   NULL, '[{"token":"spreche","lemma":"sprechen","gloss":"speak","pos":"verb"},{"token":"wenig","lemma":"wenig","gloss":"little","pos":"adverb"},{"token":"Deutsch","lemma":"Deutsch","gloss":"German","pos":"noun"}]'::jsonb,
   'introductions', ARRAY['language','a1','sprechen']),

  ('sentence', 'Ich bin dreißig Jahre alt.', 'I am thirty years old.', 'I am thirty years old.',
   'Unlike French and Spanish, German uses «sein» for age, and «alt» comes at the end.',
   NULL, '[{"token":"bin","lemma":"sein","gloss":"am","pos":"verb"},{"token":"dreißig","lemma":"dreißig","gloss":"thirty","pos":"number"},{"token":"Jahre","lemma":"Jahr","gloss":"years","pos":"noun"},{"token":"alt","lemma":"alt","gloss":"old","pos":"adjective"}]'::jsonb,
   'introductions', ARRAY['numbers','a1','sein']),

  ('sentence', 'Das ist mein Freund Paul.', 'That is my friend Paul.', 'This is my friend Paul.',
   '«Freund» can mean a friend or a boyfriend depending on context; «ein Freund von mir» removes the doubt.',
   NULL, '[{"token":"Das","lemma":"das","gloss":"that","pos":"pronoun"},{"token":"ist","lemma":"sein","gloss":"is","pos":"verb"},{"token":"Freund","lemma":"Freund","gloss":"friend","pos":"noun"}]'::jsonb,
   'introductions', ARRAY['introduction','a1','sein']),

  ('word', 'heißen', 'to be called', 'to be called',
   'Irregular: ich heiße, du heißt, er heißt. The ß becomes ss in Switzerland.', 'verb', '[]'::jsonb,
   'introductions', ARRAY['verb','irregular','a1','heißen']),

  ('word', 'Freund', 'friend', 'friend',
   'A female friend is «Freundin». Without context «mein Freund» can mean my boyfriend.', 'noun',
   '[]'::jsonb, 'introductions', ARRAY['noun','people','a1']),

  -- ===== Unit 3: Die Familie ===============================================
  ('sentence', 'Ich habe zwei Brüder.', 'I have two brothers.', 'I have two brothers.',
   '«Habe» is the first person of «haben». The plural of «Bruder» is «Brüder» with an umlaut.',
   NULL, '[{"token":"habe","lemma":"haben","gloss":"have","pos":"verb"},{"token":"zwei","lemma":"zwei","gloss":"two","pos":"number"},{"token":"Brüder","lemma":"Bruder","gloss":"brothers","pos":"noun"}]'::jsonb,
   'family', ARRAY['family','numbers','a1','haben']),

  ('sentence', 'Ich habe eine ältere Schwester.', 'I have an older sister.', 'I have an older sister.',
   'The comparative adjective «älter» takes an ending before a noun: «eine ältere Schwester».',
   NULL, '[{"token":"habe","lemma":"haben","gloss":"have","pos":"verb"},{"token":"ältere","lemma":"alt","gloss":"older","pos":"adjective"},{"token":"Schwester","lemma":"Schwester","gloss":"sister","pos":"noun"}]'::jsonb,
   'family', ARRAY['family','a1','haben']),

  ('sentence', 'Meine Mutter heißt Klara.', 'My mother is called Klara.', 'My mother''s name is Klara.',
   '«Meine» for feminine nouns, «mein» for masculine: «meine Mutter», «mein Vater».',
   NULL, '[{"token":"Mutter","lemma":"Mutter","gloss":"mother","pos":"noun"},{"token":"heißt","lemma":"heißen","gloss":"is called","pos":"verb"}]'::jsonb,
   'family', ARRAY['family','a1','heißen']),

  ('sentence', 'Mein Vater arbeitet im Krankenhaus.', 'My father works in the hospital.', 'My father works at the hospital.',
   '«Im» is «in» + «dem», the contracted dative. «Im Krankenhaus» is the standard phrase.',
   NULL, '[{"token":"Vater","lemma":"Vater","gloss":"father","pos":"noun"},{"token":"arbeitet","lemma":"arbeiten","gloss":"works","pos":"verb"},{"token":"Krankenhaus","lemma":"Krankenhaus","gloss":"hospital","pos":"noun"}]'::jsonb,
   'family', ARRAY['family','work','a1','arbeiten']),

  ('sentence', 'Haben Sie Kinder?', 'Have you children?', 'Do you have children?',
   'Formal questions invert the verb and «Sie», and «Sie» is always capitalised.',
   NULL, '[{"token":"Haben","lemma":"haben","gloss":"have","pos":"verb"},{"token":"Kinder","lemma":"Kind","gloss":"children","pos":"noun"}]'::jsonb,
   'family', ARRAY['family','question','a1','haben']),

  ('sentence', 'Wir wohnen in Berlin.', 'We live in Berlin.', 'We live in Berlin.',
   '«Wohnen in» for a city or country. «Wir wohnen» is the first person plural of «wohnen».',
   NULL, '[{"token":"wohnen","lemma":"wohnen","gloss":"live","pos":"verb"},{"token":"Berlin","lemma":"Berlin","gloss":"Berlin","pos":"noun"}]'::jsonb,
   'family', ARRAY['home','a1','wohnen']),

  ('word', 'Bruder', 'brother', 'brother',
   'Plural «Brüder» with an umlaut. «Geschwister» means siblings of any gender.', 'noun', '[]'::jsonb,
   'family', ARRAY['family','noun','a1']),

  ('word', 'Mutter', 'mother', 'mother',
   '«Mama» or «Mutti» are the affectionate everyday words.', 'noun', '[]'::jsonb,
   'family', ARRAY['family','noun','a1']),

  -- ===== Unit 4: Essen und Trinken =========================================
  ('sentence', 'Ich möchte einen Kaffee, bitte.', 'I would like a coffee, please.', 'I''d like a coffee, please.',
   '«Ich möchte» is the polite form of «ich will». «Möchte» takes the accusative: «einen Kaffee».',
   NULL, '[{"token":"möchte","lemma":"mögen","gloss":"would like","pos":"verb"},{"token":"einen","lemma":"ein","gloss":"a","pos":"article"},{"token":"Kaffee","lemma":"Kaffee","gloss":"coffee","pos":"noun"},{"token":"bitte","lemma":"bitte","gloss":"please","pos":"interjection"}]'::jsonb,
   'food', ARRAY['ordering','polite','a1','mögen']),

  ('sentence', 'Ich esse Brot zum Frühstück.', 'I eat bread to the breakfast.', 'I eat bread for breakfast.',
   '«Zum» is «zu» + «dem». «Zum Frühstück» is the standard phrase for at breakfast.',
   NULL, '[{"token":"esse","lemma":"essen","gloss":"eat","pos":"verb"},{"token":"Brot","lemma":"Brot","gloss":"bread","pos":"noun"},{"token":"Frühstück","lemma":"Frühstück","gloss":"breakfast","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','a1','essen']),

  ('sentence', 'Ich esse gern Fisch.', 'I eat gladly fish.', 'I like eating fish.',
   '«Gern» after a verb means to like doing it. It is how German expresses liking an activity.',
   NULL, '[{"token":"esse","lemma":"essen","gloss":"eat","pos":"verb"},{"token":"gern","lemma":"gern","gloss":"gladly","pos":"adverb"},{"token":"Fisch","lemma":"Fisch","gloss":"fish","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','a1','essen']),

  ('sentence', 'Ich trinke Wasser zum Essen.', 'I drink water to the meal.', 'I drink water with meals.',
   '«Zum Essen» — at the meal. «Trinken» is regular: ich trinke, du trinkst, er trinkt.',
   NULL, '[{"token":"trinke","lemma":"trinken","gloss":"drink","pos":"verb"},{"token":"Wasser","lemma":"Wasser","gloss":"water","pos":"noun"},{"token":"Essen","lemma":"Essen","gloss":"meal","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','drink','a1','trinken']),

  ('sentence', 'Ich trinke Kaffee am Morgen.', 'I drink coffee at the morning.', 'I drink coffee in the morning.',
   '«Am» is «an» + «dem», used for times of day: «am Morgen», «am Abend».',
   NULL, '[{"token":"trinke","lemma":"trinken","gloss":"drink","pos":"verb"},{"token":"Kaffee","lemma":"Kaffee","gloss":"coffee","pos":"noun"},{"token":"Morgen","lemma":"Morgen","gloss":"morning","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','drink','a1','trinken']),

  ('sentence', 'Die Rechnung, bitte.', 'The bill, please.', 'The bill, please.',
   '«Die Rechnung» is the bill. «Zahlen, bitte» — I would like to pay — also works.',
   NULL, '[{"token":"Rechnung","lemma":"Rechnung","gloss":"bill","pos":"noun"},{"token":"bitte","lemma":"bitte","gloss":"please","pos":"interjection"}]'::jsonb,
   'food', ARRAY['restaurant','a1']),

  ('sentence', 'Ich trinke keinen Alkohol.', 'I drink no alcohol.', 'I don''t drink alcohol.',
   '«Kein» negates a noun with an indefinite article: «keinen Alkohol», not «nicht Alkohol».',
   NULL, '[{"token":"trinke","lemma":"trinken","gloss":"drink","pos":"verb"},{"token":"keinen","lemma":"kein","gloss":"no","pos":"article"},{"token":"Alkohol","lemma":"Alkohol","gloss":"alcohol","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','negation','a1','trinken']),

  ('sentence', 'Ich gehe heute zum Markt.', 'I go today to the market.', 'I''m going to the market today.',
   '«Zum» again: «zum Markt». Time expressions like «heute» sit before the place.',
   NULL, '[{"token":"gehe","lemma":"gehen","gloss":"go","pos":"verb"},{"token":"heute","lemma":"heute","gloss":"today","pos":"adverb"},{"token":"Markt","lemma":"Markt","gloss":"market","pos":"noun"}]'::jsonb,
   'food', ARRAY['shopping','a1','gehen']),

  ('word', 'essen', 'to eat', 'to eat',
   'Irregular: ich esse, du isst, er isst, wir essen. Note the vowel change in du and er.', 'verb',
   '[]'::jsonb, 'food', ARRAY['verb','irregular','a1','essen']),

  ('word', 'Wasser', 'water', 'water',
   'Neuter and uncountable: «das Wasser», with no plural in everyday use.', 'noun', '[]'::jsonb,
   'food', ARRAY['drink','noun','a1']),

  ('word', 'mögen', 'to like', 'to like',
   'The polite «ich möchte» — I would like — is the form used for ordering anything.', 'verb',
   '[]'::jsonb, 'food', ARRAY['verb','irregular','a1','mögen']),

  ('word', 'immer', 'always', 'always',
   'The opposite is «nie» or «niemals». «Immer» goes before the adjective it modifies.', 'adverb',
   '[]'::jsonb, 'food', ARRAY['adverb','a1']);

-- ----------------------------------------------------------------------------
-- Tracks, units, missions and items — generated from the two seed tables
-- ----------------------------------------------------------------------------
INSERT INTO public.tracks (
  language_code, slug, title, description, icon, cefr_band, order_index, is_published
)
SELECT code, 'foundations', 'Foundations',
  'Greet people, introduce yourself, talk about your family and order food. The complete A1 starting point.',
  'compass', 'A1', 10, true
FROM (VALUES ('fr'), ('de')) AS t(code)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tracks existing
  WHERE existing.language_code = t.code AND existing.slug = 'foundations'
);

CREATE TEMP TABLE seed_frde_missions (
  language_code text, unit_slug text, unit_title text, unit_summary text, unit_order integer,
  mission_slug text, mission_title text, mission_desc text, mission_order integer,
  estimated integer, topics text[]
) ON COMMIT DROP;

INSERT INTO seed_frde_missions VALUES
  ('fr', 'premiers-mots', 'Premiers mots', 'Say hello, ask how someone is and be polite.',
   10, 'fr-hello', 'Bonjour et ça va', 'Greet someone and ask how they are.', 10, 7, ARRAY['greetings']),
  ('fr', 'premiers-mots', 'Premiers mots', 'Say hello, ask how someone is and be polite.',
   10, 'fr-polite', 'S''il vous plaît, merci', 'Ask for help politely and say goodbye.', 20, 6, ARRAY['greetings']),
  ('fr', 'se-presenter', 'Se présenter', 'Give your name, say where you are from and introduce people.',
   20, 'fr-name', 'Je m''appelle', 'Introduce yourself and ask the same.', 10, 7, ARRAY['introductions']),
  ('fr', 'se-presenter', 'Se présenter', 'Give your name, say where you are from and introduce people.',
   20, 'fr-others', 'Voici mon ami', 'Introduce a friend and say what you speak.', 20, 6, ARRAY['introductions']),
  ('fr', 'la-famille', 'La famille', 'Talk about your family and what they do.',
   30, 'fr-family', 'Ma famille', 'Say who is in your family.', 10, 7, ARRAY['family']),
  ('fr', 'la-famille', 'La famille', 'Talk about your family and what they do.',
   30, 'fr-work', 'Le travail', 'Ask about children and talk about work.', 20, 6, ARRAY['family']),
  ('fr', 'manger-boire', 'Manger et boire', 'Order food and drink, and say what you like.',
   40, 'fr-ordering', 'Au café', 'Order a drink and ask for the bill.', 10, 7, ARRAY['food']),
  ('fr', 'manger-boire', 'Manger et boire', 'Order food and drink, and say what you like.',
   40, 'fr-prefer', 'Ce que je mange', 'Talk about what you eat and drink.', 20, 6, ARRAY['food']),

  ('de', 'erste-woerter', 'Erste Wörter', 'Say hello, ask how someone is and be polite.',
   10, 'de-hello', 'Hallo und wie geht''s', 'Greet someone and ask how they are.', 10, 7, ARRAY['greetings']),
  ('de', 'erste-woerter', 'Erste Wörter', 'Say hello, ask how someone is and be polite.',
   10, 'de-polite', 'Bitte und danke', 'Ask for help politely and say goodbye.', 20, 6, ARRAY['greetings']),
  ('de', 'sich-vorstellen', 'Sich vorstellen', 'Give your name, say where you are from and introduce people.',
   20, 'de-name', 'Ich heiße', 'Introduce yourself and ask the same.', 10, 7, ARRAY['introductions']),
  ('de', 'sich-vorstellen', 'Sich vorstellen', 'Give your name, say where you are from and introduce people.',
   20, 'de-others', 'Das ist mein Freund', 'Introduce a friend and say what you speak.', 20, 6, ARRAY['introductions']),
  ('de', 'die-familie', 'Die Familie', 'Talk about your family and what they do.',
   30, 'de-family', 'Meine Familie', 'Say who is in your family.', 10, 7, ARRAY['family']),
  ('de', 'die-familie', 'Die Familie', 'Talk about your family and what they do.',
   30, 'de-work', 'Die Arbeit', 'Ask about children and talk about work.', 20, 6, ARRAY['family']),
  ('de', 'essen-trinken', 'Essen und Trinken', 'Order food and drink, and say what you like.',
   40, 'de-ordering', 'Im Café', 'Order a drink and ask for the bill.', 10, 7, ARRAY['food']),
  ('de', 'essen-trinken', 'Essen und Trinken', 'Order food and drink, and say what you like.',
   40, 'de-prefer', 'Was ich esse', 'Talk about what you eat and drink.', 20, 6, ARRAY['food']);

INSERT INTO public.units (
  track_id, language_code, slug, title, description, cefr_level, order_index, is_published
)
SELECT DISTINCT
  t.id, m.language_code, m.unit_slug, m.unit_title, m.unit_summary, 'A1', m.unit_order, true
FROM seed_frde_missions m
JOIN public.tracks t ON t.language_code = m.language_code AND t.slug = 'foundations'
WHERE NOT EXISTS (
  SELECT 1 FROM public.units u WHERE u.track_id = t.id AND u.slug = m.unit_slug
);

INSERT INTO public.missions (
  unit_id, language_code, slug, title, description, order_index, estimated_minutes, is_published
)
SELECT
  u.id, m.language_code, m.mission_slug, m.mission_title, m.mission_desc,
  m.mission_order, m.estimated, true
FROM seed_frde_missions m
JOIN public.units u ON u.language_code = m.language_code AND u.slug = m.unit_slug
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
  'fr', s.kind, s.surface, s.translation_literal, s.translation_natural,
  s.grammar_note, s.part_of_speech, COALESCE(s.vocab_breakdown, '[]'::jsonb),
  s.topic, s.tags, 'A1', 'curriculum', NULL
FROM seed_fr s
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL AND i.language_code = 'fr' AND i.kind = s.kind
    AND lower(i.surface) = lower(s.surface)
    AND lower(i.translation_natural) = lower(s.translation_natural)
);

INSERT INTO public.items (
  language_code, kind, surface, translation_literal, translation_natural,
  grammar_note, part_of_speech, vocab_breakdown, topic, tags,
  difficulty, source, owner_id
)
SELECT
  'de', s.kind, s.surface, s.translation_literal, s.translation_natural,
  s.grammar_note, s.part_of_speech, COALESCE(s.vocab_breakdown, '[]'::jsonb),
  s.topic, s.tags, 'A1', 'curriculum', NULL
FROM seed_de s
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL AND i.language_code = 'de' AND i.kind = s.kind
    AND lower(i.surface) = lower(s.surface)
    AND lower(i.translation_natural) = lower(s.translation_natural)
);
