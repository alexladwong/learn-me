import type { InsForgeClient } from "@insforge/sdk";
import { dbError, parsers } from "@/lib/db/parse";
import type { CefrLevel } from "@/lib/types";
import type {
  ConversationCorrection,
  ConversationReport,
  LearnerTurn,
} from "@/lib/tutor/report";
import { CEFR_LEVELS } from "@/lib/types";

const {
  isRecord,
  requireString,
  optionalString,
  optionalNumber,
  enumValue,
  nullableEnum,
} = parsers;

/**
 * Persistence for the AI tutor.
 *
 * The conversation store is provider-independent: it records what was said and
 * what the tutor judged, and it is written to work identically whether the turns
 * came from a model or, in this build, not at all.
 */

export const CONVERSATION_STATUSES = [
  "active",
  "completed",
  "abandoned",
  "failed",
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export type Conversation = {
  id: string;
  languageCode: string;
  scenarioId: string;
  cefrLevel: CefrLevel | null;
  status: ConversationStatus;
  turnCount: number;
  speakingSeconds: number | null;
  startedAt: string;
  endedAt: string | null;
};

export type ConversationTurn = {
  id: number;
  turnIndex: number;
  role: "tutor" | "learner" | "system";
  content: string;
  corrections: ConversationCorrection[];
  isCorrect: boolean | null;
  createdAt: string;
};

const CONVERSATION_COLUMNS =
  "id,language_code,scenario_id,cefr_level,status,turn_count," +
  "speaking_seconds,started_at,ended_at";

const TURN_COLUMNS = "id,turn_index,role,content,corrections,is_correct,created_at";

const ROLES = ["tutor", "learner", "system"] as const;

const CORRECTION_KINDS = [
  "grammar",
  "vocabulary",
  "word_order",
  "register",
  "spelling",
  "pronunciation",
  "other",
] as const;

function parseConversation(row: unknown): Conversation | null {
  if (!isRecord(row)) return null;
  const id = optionalString(row, "id");
  if (!id) return null;

  return {
    id,
    languageCode: requireString(row, "conversations", "language_code"),
    scenarioId: requireString(row, "conversations", "scenario_id"),
    cefrLevel: nullableEnum<CefrLevel>(row, "cefr_level", CEFR_LEVELS),
    status: enumValue(row, "conversations", "status", CONVERSATION_STATUSES, "active"),
    turnCount: optionalNumber(row, "turn_count"),
    speakingSeconds:
      typeof row.speaking_seconds === "number" ? row.speaking_seconds : null,
    startedAt: optionalString(row, "started_at") ?? new Date(0).toISOString(),
    endedAt: optionalString(row, "ended_at"),
  };
}

/**
 * Parse the corrections attached to a turn.
 *
 * Anything malformed is dropped rather than trusted, because this jsonb came from
 * a model: an entry missing a correction is not a correction, and rendering one
 * would show the learner a blank fix.
 */
export function parseCorrections(value: unknown): ConversationCorrection[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): ConversationCorrection[] => {
    if (!isRecord(entry)) return [];
    const original = optionalString(entry, "original");
    const correction = optionalString(entry, "correction");
    if (!original || !correction) return [];

    const kind = optionalString(entry, "kind") ?? "other";

    return [
      {
        kind: (CORRECTION_KINDS as readonly string[]).includes(kind)
          ? (kind as ConversationCorrection["kind"])
          : "other",
        original,
        correction,
        explanation: optionalString(entry, "explanation"),
      },
    ];
  });
}

function parseTurn(row: unknown): ConversationTurn | null {
  if (!isRecord(row)) return null;
  const id = optionalNumber(row, "id");
  const content = optionalString(row, "content");
  if (!id || content === null) return null;

  return {
    id,
    turnIndex: optionalNumber(row, "turn_index"),
    role: enumValue(row, "conversation_turns", "role", ROLES, "system"),
    content,
    corrections: parseCorrections(row.corrections),
    isCorrect: typeof row.is_correct === "boolean" ? row.is_correct : null,
    createdAt: optionalString(row, "created_at") ?? new Date(0).toISOString(),
  };
}

/** Start a conversation. */
export async function createConversation(
  client: InsForgeClient,
  userId: string,
  input: {
    languageCode: string;
    scenarioId: string;
    cefrLevel: CefrLevel | null;
  },
): Promise<string> {
  const { data, error } = await client.database
    .from("conversations")
    .insert([
      {
        user_id: userId,
        language_code: input.languageCode,
        scenario_id: input.scenarioId,
        cefr_level: input.cefrLevel,
        status: "active",
      },
    ])
    .select("id");

  if (error) throw dbError("conversations.insert", error);

  const id = Array.isArray(data) ? data[0]?.id : undefined;
  if (typeof id !== "string") {
    throw new Error("conversations: insert returned no id");
  }
  return id;
}

/** Append one turn. `turn_index` is assigned from the current count. */
export async function appendTurn(
  client: InsForgeClient,
  userId: string,
  input: {
    conversationId: string;
    role: "tutor" | "learner" | "system";
    content: string;
    corrections?: ConversationCorrection[];
    isCorrect?: boolean | null;
    audioKey?: string | null;
    audioUrl?: string | null;
  },
): Promise<ConversationTurn> {
  // Read the current highest index rather than trusting a client-supplied one:
  // the unique constraint on (conversation_id, turn_index) would otherwise turn a
  // race into a failed message.
  const { data: latest, error: readError } = await client.database
    .from("conversation_turns")
    .select("turn_index")
    .eq("conversation_id", input.conversationId)
    .order("turn_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) throw dbError("conversation_turns.select", readError);

  const nextIndex =
    (isRecord(latest) ? optionalNumber(latest, "turn_index") : -1) + 1;

  const { data, error } = await client.database
    .from("conversation_turns")
    .insert([
      {
        conversation_id: input.conversationId,
        user_id: userId,
        turn_index: nextIndex,
        role: input.role,
        content: input.content,
        corrections: input.corrections ?? [],
        is_correct: input.isCorrect ?? null,
        audio_key: input.audioKey ?? null,
        audio_url: input.audioUrl ?? null,
      },
    ])
    .select(TURN_COLUMNS);

  if (error) throw dbError("conversation_turns.insert", error);

  const row = Array.isArray(data) ? data[0] : undefined;
  const parsed = parseTurn(row);
  if (!parsed) throw new Error("conversation_turns: insert returned no row");
  return parsed;
}

/** One conversation, or null when it is not this learner's. */
export async function getConversation(
  client: InsForgeClient,
  conversationId: string,
): Promise<Conversation | null> {
  const { data, error } = await client.database
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", conversationId)
    .limit(1)
    .maybeSingle();

  if (error) throw dbError("conversations", error);
  return data ? parseConversation(data) : null;
}

export async function listTurns(
  client: InsForgeClient,
  conversationId: string,
  limit = 200,
): Promise<ConversationTurn[]> {
  const { data, error } = await client.database
    .from("conversation_turns")
    .select(TURN_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("turn_index", { ascending: true })
    .limit(limit);

  if (error) throw dbError("conversation_turns", error);
  if (!Array.isArray(data)) return [];

  return data.flatMap((row: unknown): ConversationTurn[] => {
    const turn = parseTurn(row);
    return turn ? [turn] : [];
  });
}

/** The learner's recent conversations, newest first. */
export async function listConversations(
  client: InsForgeClient,
  languageCode: string,
  limit = 10,
): Promise<Conversation[]> {
  const { data, error } = await client.database
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("language_code", languageCode)
    .order("started_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (error) throw dbError("conversations", error);
  if (!Array.isArray(data)) return [];

  return data.flatMap((row: unknown): Conversation[] => {
    const conversation = parseConversation(row);
    return conversation ? [conversation] : [];
  });
}

/**
 * Run a learner's turns through the report builder's input shape.
 *
 * Only `learner` turns are returned, because the metrics measure the learner and
 * including the tutor's own fluent sentences would inflate every figure.
 */
export function learnerTurns(turns: readonly ConversationTurn[]): LearnerTurn[] {
  return turns
    .filter((turn) => turn.role === "learner")
    .map((turn) => ({ index: turn.turnIndex, content: turn.content }));
}

/** Mark a conversation finished. Only `status` and `ended_at` are writable. */
export async function endConversation(
  client: InsForgeClient,
  conversationId: string,
  status: Extract<ConversationStatus, "completed" | "abandoned">,
): Promise<void> {
  const { error } = await client.database
    .from("conversations")
    .update({ status, ended_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (error) throw dbError("conversations.update", error);
}

/** Persist a finished report. */
export async function saveReport(
  client: InsForgeClient,
  userId: string,
  input: {
    conversationId: string;
    languageCode: string;
    report: ConversationReport;
  },
): Promise<void> {
  const { report } = input;

  const { error } = await client.database
    .from("conversation_reports")
    .upsert(
      [
        {
          conversation_id: input.conversationId,
          user_id: userId,
          language_code: input.languageCode,
          grammar_score: report.judged?.grammarScore ?? null,
          vocabulary_score: report.judged?.vocabularyScore ?? null,
          // Measured production stands in for fluency only when there is enough
          // material for it to mean something; otherwise it is left null.
          fluency_score: report.measured.productionScore,
          pronunciation_score: null,
          grammar_samples: report.judged?.grammarSamples ?? 0,
          vocabulary_samples: report.judged?.vocabularySamples ?? 0,
          fluency_samples: report.measured.utterances,
          mistakes: report.mistakes,
          new_words: report.newWords,
          grammar_patterns: report.judged?.grammarPatterns ?? [],
          summary: report.judged?.summary ?? null,
          model: report.judged?.model ?? null,
        },
      ],
      { onConflict: "conversation_id" },
    );

  if (error) throw dbError("conversation_reports.upsert", error);
}
