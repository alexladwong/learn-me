import type { InsForgeClient } from "@insforge/sdk";
import { dbError, parsers } from "@/lib/db/parse";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/types";

const {
  isRecord,
  requireString,
  optionalString,
  optionalNumber,
  stringArray,
  enumValue,
  nullableEnum,
} = parsers;

/**
 * The lesson player's data layer.
 *
 * A lesson is a mission: an ordered list of steps, each pointing at one item.
 * The player walks them in order, which is why `steps.order_index` is read
 * explicitly rather than relying on insertion order.
 */

export const STEP_TYPES = [
  "teach",
  "recognise",
  "recall",
  "listen",
  "speak",
  "match",
  "arrange",
  "translate",
  "checkpoint",
] as const;
export type StepType = (typeof STEP_TYPES)[number];

export type LessonItem = {
  id: string;
  kind: "word" | "phrase" | "sentence" | "grammar_point";
  surface: string;
  translationLiteral: string | null;
  translationNatural: string;
  grammarNote: string | null;
  partOfSpeech: string | null;
  ipa: string | null;
  tags: string[];
  vocabBreakdown: Array<{ token: string; gloss: string; pos?: string }>;
  audioNormalUrl: string | null;
  audioSlowUrl: string | null;
};

export type LessonStep = {
  id: string;
  stepType: StepType;
  prompt: string | null;
  item: LessonItem;
};

export type Lesson = {
  missionId: string;
  missionSlug: string;
  title: string;
  description: string | null;
  unitTitle: string;
  trackTitle: string;
  estimatedMinutes: number;
  steps: LessonStep[];
};

export type LessonSummary = {
  missionId: string;
  slug: string;
  title: string;
  description: string | null;
  unitTitle: string;
  unitSlug: string;
  /** The CEFR level this lesson is authored for, or null when unbanded. */
  cefrLevel: CefrLevel | null;
  estimatedMinutes: number;
  stepCount: number;
  /** Items this mission teaches, so the path can show what is inside. */
  itemCount: number;
};

/** Ranking for ordering, so A1 sorts before A2 before B1. */
export function levelRank(level: CefrLevel | null): number {
  if (!level) return 99;
  const index = (CEFR_LEVELS as readonly string[]).indexOf(level);
  return index === -1 ? 99 : index;
}

/** Every level from A1 up to and including `upTo`. */
export function levelsUpTo(upTo: CefrLevel | null): CefrLevel[] {
  if (!upTo) return [...CEFR_LEVELS];
  const limit = levelRank(upTo);
  return CEFR_LEVELS.filter((_, index) => index <= limit);
}

const ITEM_KINDS = ["word", "phrase", "sentence", "grammar_point"] as const;

function parseVocabBreakdown(value: unknown): LessonItem["vocabBreakdown"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const token = typeof entry.token === "string" ? entry.token : null;
    const gloss = typeof entry.gloss === "string" ? entry.gloss : null;
    if (!token || !gloss) return [];
    return [{ token, gloss, ...(typeof entry.pos === "string" ? { pos: entry.pos } : {}) }];
  });
}

function parseItem(row: unknown): LessonItem | null {
  if (!isRecord(row)) return null;
  const id = optionalString(row, "id");
  if (!id) return null;

  return {
    id,
    kind: enumValue(row, "items", "kind", ITEM_KINDS, "word"),
    surface: requireString(row, "items", "surface"),
    translationLiteral: optionalString(row, "translation_literal"),
    translationNatural: requireString(row, "items", "translation_natural"),
    grammarNote: optionalString(row, "grammar_note"),
    partOfSpeech: optionalString(row, "part_of_speech"),
    ipa: optionalString(row, "ipa"),
    tags: stringArray(row, "tags"),
    vocabBreakdown: parseVocabBreakdown(row.vocab_breakdown),
    audioNormalUrl: optionalString(row, "audio_normal_url"),
    audioSlowUrl: optionalString(row, "audio_slow_url"),
  };
}

const ITEM_COLUMNS =
  "id,kind,surface,translation_literal,translation_natural,grammar_note," +
  "part_of_speech,ipa,tags,vocab_breakdown,audio_normal_url,audio_slow_url";

/**
 * Published missions for a language, ordered the way the path presents them.
 *
 * A `head: true` count would be cheaper, but the path shows step counts per
 * mission, so the nested select is the honest way to get them without a second
 * round trip per mission.
 */
export async function listLessons(
  client: InsForgeClient,
  languageCode: string,
): Promise<LessonSummary[]> {
  const { data, error } = await client.database
    .from("missions")
    .select(
      `id,slug,title,description,order_index,estimated_minutes,
       units!inner(slug,title,order_index,cefr_level,tracks!inner(title,slug,language_code,is_published,cefr_band)),
       steps(id,item_id)`,
    )
    .eq("language_code", languageCode)
    .eq("is_published", true)
    .order("order_index", { ascending: true })
    .limit(200);

  if (error) throw dbError("missions", error);
  if (!Array.isArray(data)) throw new Error("missions: expected an array");

  const lessons = data.flatMap(
    (row: unknown): Array<LessonSummary & { unitOrder: number; missionOrder: number }> => {
      if (!isRecord(row)) return [];
      const unit = row.units;
      if (!isRecord(unit)) return [];
      const track = unit.tracks;
      if (!isRecord(track)) return [];
      // The embedded track must itself be published; the mission flag alone is
      // not enough to guarantee the learner can reach it.
      if (track.is_published === false) return [];
      if (
        typeof track.language_code === "string" &&
        track.language_code !== languageCode
      ) {
        return [];
      }

      const steps = Array.isArray(row.steps) ? row.steps : [];
      const itemIds = new Set(
        steps.flatMap((step: unknown) =>
          isRecord(step) && typeof step.item_id === "string" ? [step.item_id] : [],
        ),
      );

      return [
        {
          missionId: requireString(row, "missions", "id"),
          slug: requireString(row, "missions", "slug"),
          title: requireString(row, "missions", "title"),
          description: optionalString(row, "description"),
          unitTitle: optionalString(unit, "title") ?? "",
          unitSlug: optionalString(unit, "slug") ?? "",
          // The unit's level, falling back to the track's band. A unit inside a
          // banded track usually states its own level, but not always.
          cefrLevel:
            nullableEnum<CefrLevel>(unit, "cefr_level", CEFR_LEVELS) ??
            nullableEnum<CefrLevel>(track, "cefr_band", CEFR_LEVELS),
          estimatedMinutes: optionalNumber(row, "estimated_minutes") || 8,
          stepCount: steps.length,
          itemCount: itemIds.size,
          // Carried only for ordering; stripped before returning.
          unitOrder: optionalNumber(unit, "order_index"),
          missionOrder: optionalNumber(row, "order_index"),
        },
      ];
    },
  );

  // The path order is level, then unit, then mission.
  //
  // The level term is what makes the path a progression rather than a list.
  // Tracks are authored independently and each restarts its `order_index` at 10,
  // so across two tracks a pure order-index sort interleaves A2 lessons into A1 —
  // and a learner finishing an A2 lesson would be sent back to A1.
  return lessons
    .sort(
      (a, b) =>
        levelRank(a.cefrLevel) - levelRank(b.cefrLevel) ||
        a.unitOrder - b.unitOrder ||
        a.missionOrder - b.missionOrder,
    )
    .map(
      ({
        unitOrder: _unitOrder,
        missionOrder: _missionOrder,
        ...lesson
      }) => lesson,
    );
}

/** A single mission with its ordered steps and the item each step teaches. */
export async function getLesson(
  client: InsForgeClient,
  languageCode: string,
  missionId: string,
): Promise<Lesson | null> {
  const { data, error } = await client.database
    .from("missions")
    .select(
      `id,slug,title,description,estimated_minutes,language_code,
       units!inner(title,tracks!inner(title,language_code)),
       steps(id,step_type,prompt,order_index,items(${ITEM_COLUMNS}))`,
    )
    .eq("id", missionId)
    .eq("is_published", true)
    .eq("language_code", languageCode)
    .limit(1)
    .maybeSingle();

  if (error) throw dbError("missions", error);
  if (!data || !isRecord(data)) return null;

  const unit = data.units;
  if (!isRecord(unit)) return null;
  const track = unit.tracks;
  if (!isRecord(track)) return null;

  const rawSteps = Array.isArray(data.steps) ? data.steps : [];

  // `order_index` is carried through the mapping and sorted on explicitly:
  // PostgREST does not guarantee the order of an embedded select, and the
  // teaching sequence is a property of the lesson, not of the response.
  const steps: LessonStep[] = rawSteps
    .flatMap((step: unknown): Array<{ order: number; step: LessonStep }> => {
      if (!isRecord(step)) return [];
      const item = parseItem(step.items);
      // A step with no item cannot be presented; dropping it is better than
      // rendering an empty exercise.
      if (!item) return [];
      return [
        {
          order: optionalNumber(step, "order_index"),
          step: {
            id: requireString(step, "steps", "id"),
            stepType: enumValue(step, "steps", "step_type", STEP_TYPES, "teach"),
            prompt: optionalString(step, "prompt"),
            item,
          },
        },
      ];
    })
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.step);

  return {
    missionId: requireString(data, "missions", "id"),
    missionSlug: requireString(data, "missions", "slug"),
    title: requireString(data, "missions", "title"),
    description: optionalString(data, "description"),
    unitTitle: optionalString(unit, "title") ?? "",
    trackTitle: optionalString(track, "title") ?? "",
    estimatedMinutes: optionalNumber(data, "estimated_minutes") || 8,
    steps,
  };
}

/** Item ids a mission teaches, used to enrol them into review on completion. */
export async function listMissionItemIds(
  client: InsForgeClient,
  missionId: string,
): Promise<string[]> {
  const { data, error } = await client.database
    .from("steps")
    .select("item_id,order_index")
    .eq("mission_id", missionId)
    .order("order_index", { ascending: true })
    .limit(500);

  if (error) throw dbError("steps", error);
  if (!Array.isArray(data)) return [];

  const ids = data.flatMap((row: unknown) =>
    isRecord(row) && typeof row.item_id === "string" ? [row.item_id] : [],
  );

  return [...new Set(ids)];
}

/**
 * The next mission a learner should work through.
 *
 * `completed` takes anything with a `has` method, so both a `Set<string>` of ids
 * and the `Map<string, MissionCompletion>` the completions query returns can be
 * passed without the caller reshaping one into the other.
 *
 * `fromLevel` is the level the learner placed at. Without it, someone who chose
 * "A2" at onboarding would be started on A1 Foundations, and — worse — someone
 * halfway through A2 would be sent *back* to A1, because the first incomplete
 * lesson in path order is an A1 one.
 *
 * Lessons below the learner's level stay in the path as revision; they are just
 * not what the app proposes as next.
 */
export type NextLesson = {
  lesson: LessonSummary;
  /**
   * True when there is nothing left at or above the learner's level, and this is
   * revision from below it.
   *
   * Surfaced rather than hidden: a learner who has finished everything at their
   * level should be told that, and offered the lower-band material as revision —
   * not quietly handed an A1 lesson as though it were the natural next step.
   */
  isRevision: boolean;
};

export function pickNextLesson(
  lessons: readonly LessonSummary[],
  completed: { has(key: string): boolean },
  fromLevel: CefrLevel | null = null,
): NextLesson | null {
  const floor = fromLevel === null ? -1 : levelRank(fromLevel);

  const atOrAbove = lessons.find(
    (lesson) =>
      !completed.has(lesson.missionId) && levelRank(lesson.cefrLevel) >= floor,
  );
  if (atOrAbove) return { lesson: atOrAbove, isRevision: false };

  // Everything at or above their level is done. Fall back to any revision left
  // below it, so a learner with gaps still has something to work through rather
  // than an empty path — labelled as revision so the app does not imply they have
  // gone backwards.
  const below = lessons.find((lesson) => !completed.has(lesson.missionId));
  return below ? { lesson: below, isRevision: true } : null;
}

/**
 * The learner's starting level for content selection.
 *
 * Their placed level, or one band below their goal when they skipped placement.
 * A learner who said "I am not sure yet" is treated as a beginner, which is the
 * safe default: starting too easy is recoverable, starting too hard is
 * discouraging.
 */
export function startingLevel(
  placedLevel: CefrLevel | null,
  goalLevel: CefrLevel | null,
): CefrLevel {
  if (placedLevel) return placedLevel;
  if (goalLevel) {
    const index = levelRank(goalLevel);
    return (CEFR_LEVELS[Math.max(0, index - 1)] ?? "A1") as CefrLevel;
  }
  return "A1";
}
