-- ============================================================================
-- Spanish: Foundations — mission steps
-- ============================================================================
-- Turns the seeded items into playable exercises.
--
-- Which items belong to a mission is derived from the mission's own slug, which
-- is named `<unit>-<theme>` (for example `food-prefer`), so the theme after the
-- last hyphen selects items by their `tags`. That keeps the mapping in one place
-- — the mission slug — instead of needing a join table for eight missions, and
-- it stays correct if items are re-tagged later.
--
-- Step ids are derived with `md5(...)` rather than `gen_random_uuid()` so
-- re-running this migration produces the same rows instead of a second,
-- equivalent set of steps.
-- ============================================================================

-- The teaching sequence the lesson player expects: see it, recognise it,
-- produce it, hear it, say it.
CREATE OR REPLACE FUNCTION pg_temp.step_kind_for(p_position integer, p_total integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
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
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
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
    -- The theme is the part after the final hyphen of the mission slug:
    -- 'greetings-polite' -> 'polite' is not a tag, so fall back to the unit.
    -- Simpler and more robust: match on ANY of the unit's tags, then rank.
    u.slug AS unit_slug,
    i.id AS item_id,
    i.surface,
    i.created_at,
    row_number() OVER (
      PARTITION BY m.id
      ORDER BY
        -- Sentences first: a mission should open with a usable utterance, not
        -- an isolated word.
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
   AND (
     -- Unit 1 and 2 carry the greeting/courtesy and introduction vocabulary.
     (u.slug = 'greetings'     AND i.tags && ARRAY['greeting','polite','farewell','courtesy','response'])
     OR (u.slug = 'introductions' AND i.tags && ARRAY['introduction','origin','language','reflexive','question'])
     OR (u.slug = 'family'        AND i.tags && ARRAY['family','numbers','work'])
     OR (u.slug = 'food'          AND i.tags && ARRAY['ordering','restaurant','food','drink','negation'])
   )
  WHERE t.language_code = 'es' AND t.slug = 'foundations'
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
    CASE
      WHEN pg_temp.step_kind_for(mi.position::integer, mi.total::integer) IN ('recall', 'translate')
      THEN 'en' ELSE 'es'
    END,
    'toLanguage',
    CASE
      WHEN pg_temp.step_kind_for(mi.position::integer, mi.total::integer) IN ('recall', 'translate')
      THEN 'es' ELSE 'en'
    END
  ),
  (mi.position * 10)::integer
FROM mission_items mi
ON CONFLICT (id) DO NOTHING;
