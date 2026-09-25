import type { InsForgeClient } from "@insforge/sdk";
import { dbError, parsers } from "@/lib/db/parse";
import type { CardState, MemoryState } from "@/lib/learning/fsrs";
import type { Rating } from "@/lib/learning/fsrs";
import { CARD_STATES, RATINGS } from "@/lib/learning/fsrs";

const {
  isRecord,
  requireString,
  optionalString,
  optionalNumber,
  stringArray,
  enumValue,
  nullableEnum,
} = parsers;

/** One card as the review session needs it: content + memory state + provenance. */
export type ReviewCard = {
  itemId: string;
  languageCode: string;
  kind: "word" | "phrase" | "sentence" | "grammar_point";
  surface: string;
  translationLiteral: string | null;
  translationNatural: string;
  grammarNote: string | null;
  partOfSpeech: string | null;
  ipa: string | null;
  difficulty: string | null;
  tags: string[];
  vocabBreakdown: Array<{ token: string; gloss: string; pos?: string }>;
  /** NULL until a text-to-speech provider has generated it. */
  audioNormalUrl: string | null;
  audioSlowUrl: string | null;
  /** The step mode this card was scheduled from, used for error attribution. */
  mode: string;
  memory: MemoryState;
  dueAt: string;
  lastReviewedAt: string | null;
  /** Join to the first mission that teaches this item, for "where you met it". */
  missionId: string | null;
  missionTitle: string | null;
};

const CARD_COLUMNS = [
  "due_at",
  "last_reviewed_at",
  "stability",
  "difficulty",
  "state",
  "streak_correct",
  "reps",
  "items!inner(id,language_code,kind,surface,translation_literal,translation_natural,grammar_note,part_of_speech,ipa,difficulty,tags,vocab_breakdown,audio_normal_url,audio_slow_url,retired_at)",
].join(",");

function parseVocabBreakdown(value: unknown): ReviewCard["vocabBreakdown"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const token = typeof entry.token === "string" ? entry.token : null;
    const gloss = typeof entry.gloss === "string" ? entry.gloss : null;
    if (!token || !gloss) return [];
    return [
      {
        token,
        gloss,
        ...(typeof entry.pos === "string" ? { pos: entry.pos } : {}),
      },
    ];
  });
}

const ITEM_KINDS = ["word", "phrase", "sentence", "grammar_point"] as const;

/**
 * Cards due for review, soonest first.
 *
 * Bounded by `limit` because an unbounded read of a learner's whole card table is
 * the query shape that exhausts an egress allowance. Oldest-due-first is the
 * correct pedagogical order: the card closest to being forgotten comes first.
 *
 * The `!inner` join on `items` is deliberate — it rejects rows whose item was
 * retired, and it makes the embedded object non-nullable in the response.
 */
export async function listDueCards(
  client: InsForgeClient,
  languageCode: string,
  limit = 30,
): Promise<ReviewCard[]> {
  const { data, error } = await client.database
    .from("review_states")
    .select(CARD_COLUMNS)
    .eq("language_code", languageCode)
    .neq("state", "suspended")
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .order("item_id", { ascending: true })
    .limit(limit);

  if (error) throw dbError("review_states", error);
  if (!Array.isArray(data)) throw new Error("review_states: expected an array");

  return data.flatMap((row: unknown): ReviewCard[] => {
    if (!isRecord(row)) return [];
    const item = row.items;
    if (!isRecord(item)) return [];
    if (item.retired_at) return [];

    const state = nullableEnum<CardState>(row, "state", CARD_STATES);
    // A suspended card cannot appear here, but a null state means the row is
    // malformed; skipping it is better than rendering an unschedulable card.
    if (!state) return [];

    return [
      {
        itemId: requireString(item, "items", "id"),
        languageCode: requireString(item, "items", "language_code"),
        kind: enumValue(item, "items", "kind", ITEM_KINDS, "word"),
        surface: requireString(item, "items", "surface"),
        translationLiteral: optionalString(item, "translation_literal"),
        translationNatural: requireString(item, "items", "translation_natural"),
        grammarNote: optionalString(item, "grammar_note"),
        partOfSpeech: optionalString(item, "part_of_speech"),
        ipa: optionalString(item, "ipa"),
        difficulty: optionalString(item, "difficulty"),
        tags: stringArray(item, "tags"),
        vocabBreakdown: parseVocabBreakdown(item.vocab_breakdown),
        audioNormalUrl: optionalString(item, "audio_normal_url"),
        audioSlowUrl: optionalString(item, "audio_slow_url"),
        mode: "review",
        memory: {
          state,
          stability: optionalNumber(row, "stability"),
          difficulty: optionalNumber(row, "difficulty"),
          streakCorrect: optionalNumber(row, "streak_correct"),
          reps: optionalNumber(row, "reps"),
        },
        dueAt: requireString(row, "review_states", "due_at"),
        lastReviewedAt: optionalString(row, "last_reviewed_at"),
        missionId: null,
        missionTitle: null,
      },
    ];
  });
}

/**
 * Cards already in the learner's queue for this language, due or not.
 *
 * Used to answer "do I already have this word?" before offering it for saving,
 * which is what prevents the word bank filling with duplicates.
 */
export async function listQueuedItemIds(
  client: InsForgeClient,
  languageCode: string,
): Promise<Set<string>> {
  const { data, error } = await client.database
    .from("review_states")
    .select("item_id")
    .eq("language_code", languageCode)
    .limit(2000);

  if (error) throw dbError("review_states", error);
  if (!Array.isArray(data)) return new Set();

  return new Set(
    data.flatMap((row: unknown) =>
      isRecord(row) && typeof row.item_id === "string" ? [row.item_id] : [],
    ),
  );
}

export type ReviewQueueStats = {
  due: number;
  learning: number;
  graduated: number;
  suspended: number;
  total: number;
  /** Earliest future due date, or null when nothing is scheduled ahead. */
  nextDueAt: string | null;
};

/**
 * A breakdown of the learner's queue for the review screen header.
 *
 * Returns counts the learner can verify against their own session, not an
 * estimated retention figure — retention needs a larger sample to mean anything.
 */
export async function getReviewQueueStats(
  client: InsForgeClient,
  languageCode: string,
): Promise<ReviewQueueStats> {
  const { data, error } = await client.database
    .from("review_states")
    .select("state,due_at")
    .eq("language_code", languageCode)
    .order("due_at", { ascending: true })
    .limit(5000);

  if (error) throw dbError("review_states", error);
  if (!Array.isArray(data)) {
    return { due: 0, learning: 0, graduated: 0, suspended: 0, total: 0, nextDueAt: null };
  }

  const now = Date.now();
  const stats: ReviewQueueStats = {
    due: 0,
    learning: 0,
    graduated: 0,
    suspended: 0,
    total: 0,
    nextDueAt: null,
  };

  for (const row of data) {
    if (!isRecord(row)) continue;
    stats.total += 1;

    const state = typeof row.state === "string" ? row.state : "";
    if (state === "suspended") {
      stats.suspended += 1;
      continue;
    }
    if (state === "learning" || state === "relearning") stats.learning += 1;
    if (state === "review") stats.graduated += 1;

    const dueAt = typeof row.due_at === "string" ? row.due_at : null;
    if (!dueAt) continue;

    if (new Date(dueAt).getTime() <= now) {
      stats.due += 1;
    } else if (stats.nextDueAt === null) {
      // Rows are ordered by due_at, so the first future one is the next up.
      stats.nextDueAt = dueAt;
    }
  }

  return stats;
}

export type ReviewOutcome = {
  itemId: string;
  rating: Rating;
  /** Memory state after the update, as returned by `apply_review`. */
  state: CardState;
  stability: number;
  difficulty: number;
  mastery: number;
  dueAt: string;
};

/** Parse the `review_states` row returned by the `apply_review` RPC. */
export function parseReviewOutcome(data: unknown, itemId: string, rating: Rating): ReviewOutcome {
  if (!isRecord(data)) {
    throw new Error("apply_review returned no row");
  }

  const state = nullableEnum<CardState>(data, "state", CARD_STATES);
  if (!state) {
    throw new Error(`apply_review returned an unknown state: ${String(data.state)}`);
  }
  if (!(RATINGS as readonly string[]).includes(rating)) {
    throw new Error(`unknown rating ${rating}`);
  }

  return {
    itemId,
    rating,
    state,
    stability: optionalNumber(data, "stability"),
    difficulty: optionalNumber(data, "difficulty"),
    mastery: optionalNumber(data, "mastery"),
    dueAt: requireString(data, "review_states", "due_at"),
  };
}
