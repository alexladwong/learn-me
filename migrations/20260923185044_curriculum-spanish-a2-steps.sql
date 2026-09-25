-- ============================================================================
-- Spanish A2: mission steps
-- ============================================================================
-- Same generator as the A1 units. Which items a mission covers is derived from
-- the unit's slug, so the mapping stays in one place and survives re-tagging.
--
-- Step ids are `md5(mission:item)`, so re-running produces the same rows rather
-- than a second, equivalent set.
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
   AND i.difficulty = 'A2'
   AND (
     (u.slug = 'narration'      AND i.tags && ARRAY['past','narration','daily','family','work'])
     OR (u.slug = 'travel'      AND i.tags && ARRAY['travel','problems','polite'])
     OR (u.slug = 'health'      AND i.tags && ARRAY['health','symptoms','pharmacy'])
   )
  WHERE t.language_code = 'es' AND t.slug = 'everyday-life'
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
