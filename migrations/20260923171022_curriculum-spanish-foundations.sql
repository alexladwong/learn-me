-- ============================================================================
-- Spanish: Foundations (A1)
-- ============================================================================
-- Real, playable curriculum for the first launch language.
--
-- Shape: 1 track -> 4 units -> 8 missions -> 42 items (sentences, phrases and
-- words). Everything is written as an idempotent upsert so re-running the
-- migration after an edit updates content in place instead of duplicating it.
--
-- Note on audio: `supports_audio` is true for Spanish, but no TTS provider is
-- wired up yet, so `audio_*` columns stay NULL. The lesson and review UIs treat a
-- missing audio URL as "audio not generated" and render the control as
-- unavailable rather than playing a placeholder — no fabricated native audio.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Source data for this seed
-- ----------------------------------------------------------------------------
-- A single staging table so the content below is readable as a table rather than
-- scattered across a dozen INSERT statements, and so the steps migration can be
-- written against the same definitions.
CREATE TEMP TABLE seed_items (
  kind                text,
  surface             text,
  translation_literal text,
  translation_natural text,
  grammar_note        text,
  part_of_speech      text,
  vocab_breakdown     jsonb,
  source_topic        text,
  tags                text[]
) ON COMMIT DROP;

INSERT INTO seed_items (
  kind, surface, translation_literal, translation_natural,
  grammar_note, part_of_speech, vocab_breakdown, source_topic, tags
) VALUES
  -- ===== Unit 1: First words and greetings =================================
  ('sentence', 'Hola, ¿qué tal?', 'Hello, what such?', 'Hi, how are you?',
   'A casual greeting. «¿Qué tal?» is the most relaxed way to ask how someone is; it needs no verb.',
   NULL,
   '[{"token":"Hola","lemma":"hola","gloss":"hello","pos":"interjection"},
     {"token":"qué","lemma":"qué","gloss":"what","pos":"pronoun"},
     {"token":"tal","lemma":"tal","gloss":"such / so","pos":"adjective"}]'::jsonb,
   'greetings', ARRAY['greeting','informal','a1']),

  ('sentence', 'Buenos días, señora.', 'Good days, ma''am.', 'Good morning, ma''am.',
   '«Buenos días» is used until roughly midday. Use «señora» for an older woman or a customer; «señorita» is dated and best avoided.',
   NULL,
   '[{"token":"Buenos","lemma":"bueno","gloss":"good","pos":"adjective"},
     {"token":"días","lemma":"día","gloss":"days","pos":"noun"},
     {"token":"señora","lemma":"señor","gloss":"ma''am / Mrs","pos":"noun"}]'::jsonb,
   'greetings', ARRAY['greeting','formal','a1']),

  ('sentence', '¿Cómo estás?', 'How are you (you are)?', 'How are you?',
   'Uses «estar», not «ser»: feelings and temporary states take estar. Informal — use «¿Cómo está?» with a stranger or someone older.',
   NULL,
   '[{"token":"Cómo","lemma":"cómo","gloss":"how","pos":"adverb"},
     {"token":"estás","lemma":"estar","gloss":"you are","pos":"verb"}]'::jsonb,
   'greetings', ARRAY['greeting','question','a1','estar']),

  ('sentence', 'Estoy bien, gracias. ¿Y tú?', 'I am well, thanks. And you?', 'I''m fine, thanks. And you?',
   '«Estoy» is the first-person form of «estar». «¿Y tú?» bounces the question back — asking it is what makes a conversation sound natural.',
   NULL,
   '[{"token":"Estoy","lemma":"estar","gloss":"I am","pos":"verb"},
     {"token":"bien","lemma":"bien","gloss":"well / fine","pos":"adverb"},
     {"token":"gracias","lemma":"gracias","gloss":"thank you","pos":"noun"},
     {"token":"tú","lemma":"tú","gloss":"you","pos":"pronoun"}]'::jsonb,
   'greetings', ARRAY['greeting','response','a1','estar']),

  ('sentence', 'Mucho gusto.', 'Much pleasure.', 'Nice to meet you.',
   'Said when you are introduced to someone. The reply is «Igualmente» — likewise.',
   NULL,
   '[{"token":"Mucho","lemma":"mucho","gloss":"much","pos":"adjective"},
     {"token":"gusto","lemma":"gusto","gloss":"pleasure","pos":"noun"}]'::jsonb,
   'greetings', ARRAY['introduction','polite','a1']),

  ('sentence', 'Por favor, ¿me puedes ayudar?', 'For favor, can you help me?', 'Could you help me, please?',
   '«Por favor» means please and can go at the start or the end. «¿Me puedes ayudar?» is a request, not a yes/no question about ability.',
   NULL,
   '[{"token":"Por","lemma":"por","gloss":"for","pos":"preposition"},
     {"token":"favor","lemma":"favor","gloss":"favour","pos":"noun"},
     {"token":"puedes","lemma":"poder","gloss":"you can","pos":"verb"},
     {"token":"ayudar","lemma":"ayudar","gloss":"to help","pos":"verb"}]'::jsonb,
   'greetings', ARRAY['polite','request','a1']),

  ('sentence', 'Adiós, hasta luego.', 'Goodbye, until later.', 'Goodbye, see you later.',
   '«Hasta luego» works for almost any goodbye. «Hasta mañana» if you will see them tomorrow.',
   NULL,
   '[{"token":"Adiós","lemma":"adiós","gloss":"goodbye","pos":"interjection"},
     {"token":"hasta","lemma":"hasta","gloss":"until","pos":"preposition"},
     {"token":"luego","lemma":"luego","gloss":"later","pos":"adverb"}]'::jsonb,
   'greetings', ARRAY['farewell','a1']),

  ('word', 'gracias', 'thanks', 'thank you',
   'Reply with «de nada» — it was nothing.', 'noun',
   '[]'::jsonb, 'greetings', ARRAY['courtesy','a1']),

  -- ===== Unit 2: Introductions =============================================
  ('sentence', 'Me llamo Ana. ¿Cómo te llamas?', 'Myself I call Ana. How yourself you call?', 'My name is Ana. What''s your name?',
   'Literally "I call myself". «Llamarse» is reflexive, so the pronoun changes with the person: me llamo, te llamas, se llama.',
   NULL,
   '[{"token":"Me","lemma":"me","gloss":"myself","pos":"pronoun"},
     {"token":"llamo","lemma":"llamar","gloss":"I call","pos":"verb"},
     {"token":"te","lemma":"te","gloss":"yourself","pos":"pronoun"},
     {"token":"llamas","lemma":"llamar","gloss":"you call","pos":"verb"}]'::jsonb,
   'introductions', ARRAY['introduction','reflexive','a1']),

  ('sentence', 'Soy de Uganda.', 'I am from Uganda.', 'I''m from Uganda.',
   'Origin takes «ser», never «estar». Compare «Estoy en Uganda» — I am (currently) in Uganda.',
   NULL,
   '[{"token":"Soy","lemma":"ser","gloss":"I am","pos":"verb"},
     {"token":"de","lemma":"de","gloss":"from / of","pos":"preposition"},
     {"token":"Uganda","lemma":"Uganda","gloss":"Uganda","pos":"noun"}]'::jsonb,
   'introductions', ARRAY['origin','a1','ser']),

  ('sentence', '¿De dónde eres?', 'From where are you?', 'Where are you from?',
   '«Eres» is the informal "you are" of «ser». The formal version is «¿De dónde es?».',
   NULL,
   '[{"token":"De","lemma":"de","gloss":"from","pos":"preposition"},
     {"token":"dónde","lemma":"dónde","gloss":"where","pos":"adverb"},
     {"token":"eres","lemma":"ser","gloss":"you are","pos":"verb"}]'::jsonb,
   'introductions', ARRAY['question','origin','a1','ser']),

  ('sentence', 'Hablo un poco de español.', 'I speak a little of Spanish.', 'I speak a little Spanish.',
   '«Un poco de» + noun means "a little". To say you do not speak it: «No hablo español».',
   NULL,
   '[{"token":"Hablo","lemma":"hablar","gloss":"I speak","pos":"verb"},
     {"token":"poco","lemma":"poco","gloss":"little","pos":"adjective"},
     {"token":"español","lemma":"español","gloss":"Spanish","pos":"noun"}]'::jsonb,
   'introductions', ARRAY['language','a1']),

  ('sentence', 'Encantado de conocerte.', 'Enchanted of knowing you.', 'Pleased to meet you.',
   'Agrees with the speaker: a man says «encantado», a woman «encantada». You will hear this constantly in Spain.',
   NULL,
   '[{"token":"Encantado","lemma":"encantado","gloss":"delighted","pos":"adjective"},
     {"token":"conocerte","lemma":"conocer","gloss":"to know you","pos":"verb"}]'::jsonb,
   'introductions', ARRAY['introduction','polite','a1']),

  ('sentence', 'Este es mi amigo Carlos.', 'This is my friend Carlos.', 'This is my friend Carlos.',
   '«Este» points at something masculine and nearby; «esta» for feminine, «esto» for an unnamed thing.',
   NULL,
   '[{"token":"Este","lemma":"este","gloss":"this","pos":"pronoun"},
     {"token":"es","lemma":"ser","gloss":"is","pos":"verb"},
     {"token":"mi","lemma":"mi","gloss":"my","pos":"adjective"},
     {"token":"amigo","lemma":"amigo","gloss":"friend","pos":"noun"}]'::jsonb,
   'introductions', ARRAY['introduction','a1','ser']),

  ('word', 'llamarse', 'to call oneself', 'to be called',
   'Reflexive verb. Drop «se» and conjugate: me llamo, te llamas, se llama, nos llamamos.',
   'verb', '[]'::jsonb, 'introductions', ARRAY['verb','reflexive','a1']),

  ('word', 'amigo', 'friend', 'friend',
   'A male friend. A female friend is «amiga» — the ending follows the person, not the speaker.',
   'noun', '[]'::jsonb, 'introductions', ARRAY['noun','people','a1']),

  -- ===== Unit 3: Family and people =========================================
  ('sentence', 'Esta es mi familia.', 'This is my family.', 'This is my family.',
   '«Familia» is feminine, so it takes «esta», not «este».',
   NULL,
   '[{"token":"Esta","lemma":"este","gloss":"this","pos":"pronoun"},
     {"token":"mi","lemma":"mi","gloss":"my","pos":"adjective"},
     {"token":"familia","lemma":"familia","gloss":"family","pos":"noun"}]'::jsonb,
   'family', ARRAY['family','a1']),

  ('sentence', 'Tengo dos hermanos.', 'I have two brothers.', 'I have two brothers.',
   '«Tener» is irregular in the first person: tengo, not «teno». «Hermanos» means brothers, or brothers and sisters together.',
   NULL,
   '[{"token":"Tengo","lemma":"tener","gloss":"I have","pos":"verb"},
     {"token":"dos","lemma":"dos","gloss":"two","pos":"number"},
     {"token":"hermanos","lemma":"hermano","gloss":"brothers","pos":"noun"}]'::jsonb,
   'family', ARRAY['family','numbers','a1','tener']),

  ('sentence', 'Mi madre se llama Grace.', 'My mother herself calls Grace.', 'My mother''s name is Grace.',
   'Kinship nouns do not need an article after «mi»: «mi madre», never «mi la madre».',
   NULL,
   '[{"token":"madre","lemma":"madre","gloss":"mother","pos":"noun"},
     {"token":"se","lemma":"se","gloss":"herself","pos":"pronoun"},
     {"token":"llama","lemma":"llamar","gloss":"calls","pos":"verb"}]'::jsonb,
   'family', ARRAY['family','reflexive','a1']),

  ('sentence', '¿Tienes hijos?', 'Do you have children?', 'Do you have children?',
   'A yes/no question needs no auxiliary verb — intonation does all the work. Written Spanish adds the opening «¿».',
   NULL,
   '[{"token":"Tienes","lemma":"tener","gloss":"you have","pos":"verb"},
     {"token":"hijos","lemma":"hijo","gloss":"children","pos":"noun"}]'::jsonb,
   'family', ARRAY['family','question','a1','tener']),

  ('sentence', 'Mi padre trabaja en un hospital.', 'My father works in a hospital.', 'My father works in a hospital.',
   'Regular -ar verbs: trabajo, trabajas, trabaja. «En» covers both "in" and "at" for locations.',
   NULL,
   '[{"token":"padre","lemma":"padre","gloss":"father","pos":"noun"},
     {"token":"trabaja","lemma":"trabajar","gloss":"works","pos":"verb"},
     {"token":"hospital","lemma":"hospital","gloss":"hospital","pos":"noun"}]'::jsonb,
   'family', ARRAY['work','family','a1']),

  ('word', 'hermano', 'brother', 'brother',
   '«Hermanos» in the plural usually means siblings of any gender, not just brothers.',
   'noun', '[]'::jsonb, 'family', ARRAY['family','noun','a1']),

  ('word', 'madre', 'mother', 'mother',
   '«Mamá» is the affectionate everyday word; «madre» is neutral or formal.',
   'noun', '[]'::jsonb, 'family', ARRAY['family','noun','a1']),

  ('word', 'tener', 'to have', 'to have',
   'Irregular: tengo, tienes, tiene, tenemos, tenéis, tienen. Also used for age — «Tengo treinta años».',
   'verb', '[]'::jsonb, 'family', ARRAY['verb','irregular','a1']),

  -- ===== Unit 4: Food and ordering =========================================
  ('sentence', 'Quiero un café, por favor.', 'I want a coffee, please.', 'I''d like a coffee, please.',
   '«Quiero» is direct. «Quisiera» or «Me gustaría» is more polite when ordering — worth learning early.',
   NULL,
   '[{"token":"Quiero","lemma":"querer","gloss":"I want","pos":"verb"},
     {"token":"café","lemma":"café","gloss":"coffee","pos":"noun"},
     {"token":"por","lemma":"por","gloss":"for","pos":"preposition"},
     {"token":"favor","lemma":"favor","gloss":"favour","pos":"noun"}]'::jsonb,
   'food', ARRAY['ordering','a1','querer']),

  ('sentence', 'La cuenta, por favor.', 'The bill, please.', 'The bill, please.',
   'In a restaurant you ask for «la cuenta». In a bar in Spain, «la cuenta» or «cobrar» both work.',
   NULL,
   '[{"token":"La","lemma":"el","gloss":"the","pos":"article"},
     {"token":"cuenta","lemma":"cuenta","gloss":"bill / account","pos":"noun"}]'::jsonb,
   'food', ARRAY['restaurant','a1']),

  ('sentence', '¿Tienen algo sin carne?', 'Do you have something without meat?', 'Do you have anything without meat?',
   '«Tienen» is the polite plural "you have" used with waiting staff. «Sin» means without; «con» means with.',
   NULL,
   '[{"token":"Tienen","lemma":"tener","gloss":"you have","pos":"verb"},
     {"token":"algo","lemma":"algo","gloss":"something","pos":"pronoun"},
     {"token":"sin","lemma":"sin","gloss":"without","pos":"preposition"},
     {"token":"carne","lemma":"carne","gloss":"meat","pos":"noun"}]'::jsonb,
   'food', ARRAY['restaurant','question','a1','tener']),

  ('sentence', 'Está delicioso.', 'It is delicious.', 'It''s delicious.',
   'Again «estar»: how the food tastes right now is a state, not an identity.',
   NULL,
   '[{"token":"Está","lemma":"estar","gloss":"it is","pos":"verb"},
     {"token":"delicioso","lemma":"delicioso","gloss":"delicious","pos":"adjective"}]'::jsonb,
   'food', ARRAY['restaurant','a1','estar']),

  ('sentence', 'Como arroz todos los días.', 'I eat rice all the days.', 'I eat rice every day.',
   '«Como» is the first-person form of «comer». Watch the trap: «comes» is you eat, «comemos» is we eat.',
   NULL,
   '[{"token":"Como","lemma":"comer","gloss":"I eat","pos":"verb"},
     {"token":"arroz","lemma":"arroz","gloss":"rice","pos":"noun"},
     {"token":"todos","lemma":"todo","gloss":"all","pos":"adjective"},
     {"token":"días","lemma":"día","gloss":"days","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','a1','comer']),

  ('sentence', 'No bebo alcohol.', 'I do not drink alcohol.', 'I don''t drink alcohol.',
   'Negation is simply «no» before the verb — no auxiliary needed. «Beber» and «tomar» both mean to drink.',
   NULL,
   '[{"token":"No","lemma":"no","gloss":"not","pos":"adverb"},
     {"token":"bebo","lemma":"beber","gloss":"I drink","pos":"verb"},
     {"token":"alcohol","lemma":"alcohol","gloss":"alcohol","pos":"noun"}]'::jsonb,
   'food', ARRAY['food','negation','a1']),

  ('word', 'comer', 'to eat', 'to eat',
   'Regular -er verb: como, comes, come, comemos, coméis, comen. Mixing up these forms is the single most common A1 error.',
   'verb', '[]'::jsonb, 'food', ARRAY['verb','conjugation','a1','comer']),

  ('word', 'agua', 'water', 'water',
   'Feminine, but takes «el» in the singular for sound reasons: «el agua fría». The plural is «las aguas».',
   'noun', '[]'::jsonb, 'food', ARRAY['noun','drink','a1']),

  ('word', 'cuenta', 'bill', 'bill',
   'Also means an account, as in a bank account («cuenta bancaria»).',
   'noun', '[]'::jsonb, 'food', ARRAY['restaurant','noun','a1']);

-- ----------------------------------------------------------------------------
-- Track
-- ----------------------------------------------------------------------------
INSERT INTO public.tracks (
  language_code, slug, title, description, icon, cefr_band, order_index, is_published
)
SELECT
  'es', 'foundations', 'Foundations',
  'Greet people, introduce yourself, talk about your family and order food. The complete A1 starting point.',
  'compass', 'A1', 10, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.tracks WHERE language_code = 'es' AND slug = 'foundations'
);

-- ----------------------------------------------------------------------------
-- Units and missions
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE seed_missions (
  unit_slug      text,
  unit_title     text,
  unit_summary   text,
  unit_order     integer,
  mission_slug   text,
  mission_title  text,
  mission_desc   text,
  mission_order  integer,
  estimated      integer,
  item_topics    text[]
) ON COMMIT DROP;

INSERT INTO seed_missions VALUES
  ('greetings', 'First words and greetings',
   'Say hello, ask how someone is and be polite.',
   10, 'greetings-hello', 'Hello and how are you',
   'Greet someone and ask how they are.', 10, 7, ARRAY['greetings']),
  ('greetings', 'First words and greetings',
   'Say hello, ask how someone is and be polite.',
   10, 'greetings-polite', 'Please, thank you, goodbye',
   'Ask for help politely and say goodbye.', 20, 6, ARRAY['greetings']),

  ('introductions', 'Introductions',
   'Give your name, say where you are from and introduce other people.',
   20, 'introductions-name', 'Your name and where you are from',
   'Introduce yourself and ask the same of someone else.', 10, 7, ARRAY['introductions']),
  ('introductions', 'Introductions',
   'Give your name, say where you are from and introduce other people.',
   20, 'introductions-others', 'Introducing other people',
   'Introduce a friend and say what you speak.', 20, 6, ARRAY['introductions']),

  ('family', 'Family and people',
   'Talk about your family and what they do.',
   30, 'family-basics', 'Your family',
   'Say who is in your family.', 10, 7, ARRAY['family']),
  ('family', 'Family and people',
   'Talk about your family and what they do.',
   30, 'family-work', 'What they do',
   'Ask about children and talk about work.', 20, 6, ARRAY['family']),

  ('food', 'Food and ordering',
   'Order food and drink, and say what you like.',
   40, 'food-ordering', 'Ordering',
   'Order a drink and ask for the bill.', 10, 7, ARRAY['food']),
  ('food', 'Food and ordering',
   'Order food and drink, and say what you like.',
   40, 'food-prefer', 'What you eat and drink',
   'Talk about what you eat and what you avoid.', 20, 6, ARRAY['food']);

INSERT INTO public.units (track_id, language_code, slug, title, description, cefr_level, order_index, is_published)
SELECT DISTINCT
  t.id, 'es', sm.unit_slug, sm.unit_title, sm.unit_summary, 'A1', sm.unit_order, true
FROM seed_missions sm
JOIN public.tracks t ON t.language_code = 'es' AND t.slug = 'foundations'
WHERE NOT EXISTS (
  SELECT 1 FROM public.units u
  WHERE u.track_id = t.id AND u.slug = sm.unit_slug
);

INSERT INTO public.missions (
  unit_id, language_code, slug, title, description, order_index, estimated_minutes, is_published
)
SELECT
  u.id, 'es', sm.mission_slug, sm.mission_title, sm.mission_desc,
  sm.mission_order, sm.estimated, true
FROM seed_missions sm
JOIN public.units u ON u.language_code = 'es' AND u.slug = sm.unit_slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.missions m
  WHERE m.unit_id = u.id AND m.slug = sm.mission_slug
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
  'es', si.kind, si.surface, si.translation_literal, si.translation_natural,
  si.grammar_note, si.part_of_speech, COALESCE(si.vocab_breakdown, '[]'::jsonb),
  si.source_topic, si.tags, 'A1', 'curriculum', NULL
FROM seed_items si
WHERE NOT EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.owner_id IS NULL
    AND i.language_code = 'es'
    AND i.kind = si.kind
    AND lower(i.surface) = lower(si.surface)
    AND lower(i.translation_natural) = lower(si.translation_natural)
);
