-- ============================================================================
-- A2 steps backfill
-- ============================================================================
-- The drill-coverage migrations added sentences after the steps migrations had
-- already run, so those items had no exercises — present in the path's item count
-- but unreachable in a lesson.
--
-- This generates steps for any A2 item that has none, assigning each to a mission
-- by its tags. Idempotent on `md5(mission:item)`, so it is safe to re-run and safe
-- to leave in place as new content is added.
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

CREATE OR REPLACE FUNCTION pg_temp.step_prompt_for(p_kind text, p_language text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_kind
    WHEN 'teach'     THEN 'New: read it and listen'
    WHEN 'recognise' THEN 'What does this mean?'
    WHEN 'recall'    THEN 'Say it in ' || CASE p_language WHEN 'fr' THEN 'French' ELSE 'German' END
    WHEN 'listen'    THEN 'Listen and choose the meaning'
    WHEN 'arrange'   THEN 'Put the words in order'
    WHEN 'speak'     THEN 'Say it out loud'
    ELSE 'Say it in ' || CASE p_language WHEN 'fr' THEN 'French' ELSE 'German' END
  END;
$$;

INSERT INTO public.steps (
  id, mission_id, language_code, step_type, item_id, prompt, payload, order_index
)
SELECT
  md5(ranked.mission_id::text || ':' || ranked.item_id::text)::uuid,
  ranked.mission_id,
  ranked.language_code,
  pg_temp.step_kind_for(ranked.position::integer, ranked.total::integer),
  ranked.item_id,
  pg_temp.step_prompt_for(
    pg_temp.step_kind_for(ranked.position::integer, ranked.total::integer),
    ranked.language_code
  ),
  jsonb_build_object(
    'fromLanguage',
    CASE
      WHEN pg_temp.step_kind_for(ranked.position::integer, ranked.total::integer)
        IN ('recall', 'translate') THEN 'en'
      ELSE ranked.language_code
    END,
    'toLanguage',
    CASE
      WHEN pg_temp.step_kind_for(ranked.position::integer, ranked.total::integer)
        IN ('recall', 'translate') THEN ranked.language_code
      ELSE 'en'
    END
  ),
  (9000 + ranked.position * 10)::integer
FROM (
  SELECT
    i.id AS item_id,
    i.language_code,
    m.id AS mission_id,
    row_number() OVER (PARTITION BY m.id ORDER BY i.surface) AS position,
    count(*) OVER (PARTITION BY m.id) AS total
  FROM public.items i
  JOIN public.missions m
    ON m.language_code = i.language_code
   AND m.slug = CASE
     WHEN i.language_code = 'fr' AND i.tags && ARRAY['travel']  THEN 'fr-voyage-problemes'
     WHEN i.language_code = 'fr' AND i.tags && ARRAY['health']  THEN 'fr-sante-symptomes'
     WHEN i.language_code = 'fr'                                 THEN 'fr-passe-etre'
     WHEN i.language_code = 'de' AND i.tags && ARRAY['travel']  THEN 'de-reisen-probleme'
     WHEN i.language_code = 'de' AND i.tags && ARRAY['health']  THEN 'de-gesundheit-symptome'
     WHEN i.language_code = 'de'                                 THEN 'de-perfekt-sein'
     ELSE NULL
   END
  WHERE i.owner_id IS NULL
    AND i.language_code IN ('fr', 'de')
    AND i.difficulty = 'A2'
    AND i.retired_at IS NULL
    AND m.id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.steps s WHERE s.item_id = i.id)
) ranked
ON CONFLICT (id) DO NOTHING;
