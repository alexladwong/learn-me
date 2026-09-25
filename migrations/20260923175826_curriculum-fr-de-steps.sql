-- ============================================================================
-- French and German: mission steps
-- ============================================================================
-- Turns the seeded items into playable exercises, using the same teaching
-- sequence as Spanish: see it, recognise it, produce it, hear it, say it.
--
-- Which items a mission covers is derived from the unit's slug, so the mapping
-- lives in one place and stays correct if items are re-tagged later.
--
-- Step ids are derived with `md5(...)` rather than `gen_random_uuid()`, so
-- re-running produces the same rows instead of a second, equivalent set.
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
    WHEN 'recall'    THEN 'Say it in the target language'
    WHEN 'listen'    THEN 'Listen and choose the meaning'
    WHEN 'arrange'   THEN 'Put the words in order'
    WHEN 'speak'     THEN 'Say it out loud'
    ELSE 'Say it in the target language'
  END;
$$;

WITH mission_items AS (
  SELECT
    m.id AS mission_id,
    m.language_code,
    i.id AS item_id,
    row_number() OVER (
      PARTITION BY m.id
      ORDER BY
        -- Sentences first: a mission should open with something usable.
        CASE i.kind WHEN 'sentence' THEN 0 WHEN 'phrase' THEN 1 ELSE 2 END,
        i.created_at,
        i.surface
    ) AS position,
    count(*) OVER (PARTITION BY m.id) AS total
  FROM public.missions m
  JOIN public.units u ON u.id = m.unit_id
  JOIN public.tracks t ON t.id = u.track_id
  JOIN public.items i
    ON i.language_code = m.language_code
   AND i.owner_id IS NULL
   AND i.retired_at IS NULL
   AND (
     (m.language_code = 'fr' AND (
       (u.slug = 'premiers-mots'   AND i.tags && ARRAY['greeting','polite','farewell','courtesy','request','aller'])
       OR (u.slug = 'se-presenter' AND i.tags && ARRAY['introduction','origin','language','reflexive','appeler','être','venir','parler','avoir'])
       OR (u.slug = 'la-famille'   AND i.tags && ARRAY['family','numbers','work','habiter'])
       OR (u.slug = 'manger-boire' AND i.tags && ARRAY['ordering','restaurant','food','drink','negation','manger','boire','vouloir'])
     ))
     OR (m.language_code = 'de' AND (
       (u.slug = 'erste-woerter'    AND i.tags && ARRAY['greeting','polite','farewell','courtesy','request','gehen'])
       OR (u.slug = 'sich-vorstellen' AND i.tags && ARRAY['introduction','origin','language','heißen','sein','kommen','sprechen','haben'])
       OR (u.slug = 'die-familie'   AND i.tags && ARRAY['family','numbers','work','wohnen'])
       OR (u.slug = 'essen-trinken' AND i.tags && ARRAY['ordering','restaurant','food','drink','negation','essen','trinken','mögen'])
     ))
   )
  WHERE t.slug = 'foundations' AND m.language_code IN ('fr', 'de')
)
INSERT INTO public.steps (
  id, mission_id, language_code, step_type, item_id, prompt, payload, order_index
)
SELECT
  md5(mi.mission_id::text || ':' || mi.item_id::text)::uuid,
  mi.mission_id,
  mi.language_code,
  pg_temp.step_kind_for(mi.position::integer, mi.total::integer),
  mi.item_id,
  pg_temp.step_prompt_for(pg_temp.step_kind_for(mi.position::integer, mi.total::integer)),
  jsonb_build_object(
    'fromLanguage',
    CASE WHEN pg_temp.step_kind_for(mi.position::integer, mi.total::integer) IN ('recall', 'translate')
      THEN 'en' ELSE mi.language_code END,
    'toLanguage',
    CASE WHEN pg_temp.step_kind_for(mi.position::integer, mi.total::integer) IN ('recall', 'translate')
      THEN mi.language_code ELSE 'en' END
  ),
  (mi.position * 10)::integer
FROM mission_items mi
ON CONFLICT (id) DO NOTHING;
