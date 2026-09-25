-- ============================================================================
-- Give the third «voy» sentence a set of lesson steps
-- ============================================================================
-- The daily-routines migration added three `ir` sentences, but the steps
-- migration had already run against the earlier item set, so the newest sentence
-- landed in a mission's item list without steps of its own.
--
-- Small, deliberate follow-up rather than editing an applied migration: the
-- applied files are the record of what the database actually did.
-- ============================================================================

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
    WHEN 'recall'    THEN 'Say it in Spanish'
    WHEN 'listen'    THEN 'Listen and choose the meaning'
    WHEN 'arrange'   THEN 'Put the words in order'
    WHEN 'speak'     THEN 'Say it out loud'
    ELSE 'Say it in Spanish'
  END;
$$;

WITH target AS (
  SELECT
    m.id AS mission_id,
    i.id AS item_id,
    count(*) OVER () AS total,
    row_number() OVER (ORDER BY i.created_at, i.surface) AS position
  FROM public.missions m
  JOIN public.units u ON u.id = m.unit_id
  JOIN public.items i
    ON i.language_code = 'es'
   AND i.owner_id IS NULL
   AND i.retired_at IS NULL
   AND i.surface = 'Voy a la universidad cada día.'
  WHERE u.slug = 'daily' AND m.slug = 'daily-plans'
)
INSERT INTO public.steps (
  id, mission_id, language_code, step_type, item_id, prompt, payload, order_index
)
SELECT
  md5(t.mission_id::text || ':' || t.item_id::text)::uuid,
  t.mission_id,
  'es',
  pg_temp.step_kind_for(t.position::integer, t.total::integer),
  t.item_id,
  pg_temp.step_prompt_for(pg_temp.step_kind_for(t.position::integer, t.total::integer)),
  jsonb_build_object('fromLanguage', 'es', 'toLanguage', 'en'),
  -- Placed after the existing steps in that mission.
  (1000 + t.position * 10)::integer
FROM target t
ON CONFLICT (id) DO NOTHING;
