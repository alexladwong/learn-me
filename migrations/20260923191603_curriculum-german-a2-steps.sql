-- ============================================================================
-- German A2: mission steps
-- ============================================================================
-- Turns the A2 items into playable exercises, using the same teaching sequence as
-- every other unit: see it, recognise it, produce it, hear it, say it.
--
-- Which items a mission covers is derived from the unit's slug, so the mapping
-- lives in one place. Step ids are `md5(mission:item)`, so re-running produces
-- the same rows rather than a second, equivalent set.
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
    WHEN 'recall'    THEN 'Say it in German'
    WHEN 'listen'    THEN 'Listen and choose the meaning'
    WHEN 'arrange'   THEN 'Put the words in order'
    WHEN 'speak'     THEN 'Say it out loud'
    ELSE 'Say it in German'
  END;
$$;

INSERT INTO public.steps (
  id, mission_id, language_code, step_type, item_id, prompt, payload, order_index
)
SELECT
  md5(m.id::text || ':' || i.id::text)::uuid,
  m.id,
  'de',
  pg_temp.step_kind_for(ranked.position::integer, ranked.total::integer),
  i.id,
  pg_temp.step_prompt_for(
    pg_temp.step_kind_for(ranked.position::integer, ranked.total::integer)
  ),
  jsonb_build_object(
    'fromLanguage',
    CASE
      WHEN pg_temp.step_kind_for(ranked.position::integer, ranked.total::integer)
        IN ('recall', 'translate') THEN 'en'
      ELSE 'de'
    END,
    'toLanguage',
    CASE
      WHEN pg_temp.step_kind_for(ranked.position::integer, ranked.total::integer)
        IN ('recall', 'translate') THEN 'de'
      ELSE 'en'
    END
  ),
  (ranked.position * 10)::integer
FROM (
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
    ON i.language_code = 'de'
   AND i.owner_id IS NULL
   AND i.retired_at IS NULL
   AND i.difficulty = 'A2'
   AND (
     (u.slug = 'vergangenheit' AND i.tags && ARRAY['past','vergangenheit','daily','work'])
     OR (u.slug = 'reisen'     AND i.tags && ARRAY['travel','problems','polite'])
     OR (u.slug = 'gesundheit' AND i.tags && ARRAY['health','symptoms','pharmacy'])
   )
  WHERE t.language_code = 'de' AND t.slug = 'alltag'
) ranked
JOIN public.missions m ON m.id = ranked.mission_id
JOIN public.items i ON i.id = ranked.item_id
ON CONFLICT (id) DO NOTHING;
