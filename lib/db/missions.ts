import type { InsForgeClient } from "@insforge/sdk";
import { dbError, parsers } from "@/lib/db/parse";

const { isRecord, optionalNumber, optionalString } = parsers;

/** A mission the learner has finished at least once. */
export type MissionCompletion = {
  missionId: string;
  languageCode: string;
  completions: number;
  accuracy: number | null;
  itemsEnrolled: number;
  firstCompletedAt: string;
  lastCompletedAt: string;
};

const COMPLETION_COLUMNS =
  "mission_id,language_code,completions,accuracy,items_enrolled," +
  "first_completed_at,last_completed_at";

function parseCompletion(row: unknown): MissionCompletion | null {
  if (!isRecord(row)) return null;
  const missionId = optionalString(row, "mission_id");
  if (!missionId) return null;

  return {
    missionId,
    languageCode: optionalString(row, "language_code") ?? "",
    completions: optionalNumber(row, "completions") || 1,
    accuracy:
      typeof row.accuracy === "number" && Number.isFinite(row.accuracy)
        ? row.accuracy
        : null,
    itemsEnrolled: optionalNumber(row, "items_enrolled"),
    firstCompletedAt: optionalString(row, "first_completed_at") ?? "",
    lastCompletedAt: optionalString(row, "last_completed_at") ?? "",
  };
}

/**
 * Every mission this learner has completed for a language.
 *
 * Returns a map keyed by mission id so the path can answer "is this done?" in
 * constant time per mission rather than searching an array.
 */
export async function listMissionCompletions(
  client: InsForgeClient,
  languageCode: string,
): Promise<Map<string, MissionCompletion>> {
  const { data, error } = await client.database
    .from("mission_completions")
    .select(COMPLETION_COLUMNS)
    .eq("language_code", languageCode)
    .order("last_completed_at", { ascending: false })
    .limit(1000);

  if (error) throw dbError("mission_completions", error);
  if (!Array.isArray(data)) return new Map();

  const map = new Map<string, MissionCompletion>();
  for (const row of data) {
    const completion = parseCompletion(row);
    if (completion) map.set(completion.missionId, completion);
  }
  return map;
}

/** The learner's most recently completed mission, for "continue where you left off". */
export function mostRecentCompletion(
  completions: Map<string, MissionCompletion>,
): MissionCompletion | null {
  let latest: MissionCompletion | null = null;
  for (const completion of completions.values()) {
    if (!latest || completion.lastCompletedAt > latest.lastCompletedAt) {
      latest = completion;
    }
  }
  return latest;
}

/**
 * Per-unit completion counts, derived from mission completions.
 *
 * `unitProgress` reads this rather than counting rows itself, so the number on a
 * track card and the state of each mission inside it cannot disagree.
 */
export async function countCompletionsByUnit(
  client: InsForgeClient,
  languageCode: string,
): Promise<Map<string, number>> {
  const { data, error } = await client.database
    .from("mission_completions")
    .select("mission_id,missions!inner(unit_id)")
    .eq("language_code", languageCode)
    .limit(2000);

  if (error) throw dbError("mission_completions", error);
  if (!Array.isArray(data)) return new Map();

  const counts = new Map<string, number>();
  for (const row of data) {
    if (!isRecord(row)) continue;
    const mission = row.missions;
    if (!isRecord(mission)) continue;
    const unitId = optionalString(mission, "unit_id");
    if (!unitId) continue;
    counts.set(unitId, (counts.get(unitId) ?? 0) + 1);
  }

  return counts;
}

/** Parse the row returned by `record_mission_completion`. */
export function parseRecordedCompletion(data: unknown): MissionCompletion {
  const completion = parseCompletion(data);
  if (!completion) {
    throw new Error("record_mission_completion returned no row");
  }
  return completion;
}
