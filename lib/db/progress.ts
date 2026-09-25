import type { InsForgeClient } from "@insforge/sdk";
import { dbError, parsers } from "@/lib/db/parse";
import { listMissionCompletions } from "@/lib/db/missions";
import {
  CEFR_LEVELS,
  type CefrLevel,
  type TrackWithProgress,
  type WeeklySummary,
} from "@/lib/types";

const { isRecord, requireString, optionalString, nullableEnum } = parsers;

/**
 * Published tracks for a language, with real unit counts and real progress.
 *
 * `completed_units` is derived from `mission_completions`, not stored: a unit
 * counts as complete when every published mission inside it has been finished at
 * least once. Counting it here means the figure on a track card and the state of
 * each mission on the path are computed from the same source and cannot drift.
 */
export async function listTracksWithProgress(
  client: InsForgeClient,
  languageCode: string,
): Promise<TrackWithProgress[]> {
  const { data, error } = await client.database
    .from("tracks")
    .select(
      "id,slug,title,description,icon,cefr_band,order_index," +
        "units(id,missions(id))",
    )
    .eq("language_code", languageCode)
    .eq("is_published", true)
    .order("order_index", { ascending: true })
    .limit(50);

  if (error) throw dbError("tracks", error);
  if (!Array.isArray(data)) throw new Error("tracks: expected an array");

  const completions = await listMissionCompletions(client, languageCode);

  return data.map((row: unknown): TrackWithProgress => {
    if (!isRecord(row)) throw new Error("tracks: expected an object row");

    const units = Array.isArray(row.units) ? row.units : [];

    let completedUnits = 0;
    for (const unit of units) {
      if (!isRecord(unit)) continue;
      const missions = Array.isArray(unit.missions) ? unit.missions : [];
      const missionIds = missions.flatMap((mission: unknown) =>
        isRecord(mission) && typeof mission.id === "string" ? [mission.id] : [],
      );
      // An empty unit is not "complete"; it is unauthored, and claiming 100%
      // for it would reward missing content.
      if (missionIds.length > 0 && missionIds.every((id) => completions.has(id))) {
        completedUnits += 1;
      }
    }

    return {
      id: requireString(row, "tracks", "id"),
      slug: requireString(row, "tracks", "slug"),
      title: requireString(row, "tracks", "title"),
      description: optionalString(row, "description"),
      icon: optionalString(row, "icon") ?? "compass",
      cefr_band: nullableEnum<CefrLevel>(row, "cefr_band", CEFR_LEVELS),
      order_index: typeof row.order_index === "number" ? row.order_index : 0,
      total_units: units.length,
      completed_units: completedUnits,
    };
  });
}

/** Count of published missions for a language — what the learner can start today. */
export async function countPublishedMissions(
  client: InsForgeClient,
  languageCode: string,
): Promise<number> {
  const { count, error } = await client.database
    .from("missions")
    .select("id", { count: "exact", head: true })
    .eq("language_code", languageCode)
    .eq("is_published", true);

  if (error) throw dbError("missions.count", error);
  return count ?? 0;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Aggregate the learner's real activity over a window.
 *
 * Reads `daily_activity` (the per-day rollup written by the review trigger)
 * rather than scanning `review_events`, so a weekly report is a bounded read of
 * at most seven rows per language instead of every event ever recorded.
 *
 * Returns `null` when there is no activity at all in the window — the caller
 * renders an empty state instead of a chart of zeros.
 */
export async function getWeeklySummary(
  client: InsForgeClient,
  languageCode: string,
  days = 7,
): Promise<WeeklySummary | null> {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  const { data, error } = await client.database
    .from("daily_activity")
    .select(
      "activity_date,minutes,reviews,reviews_correct,new_items,listening_seconds,speaking_seconds",
    )
    .eq("language_code", languageCode)
    .gte("activity_date", toIsoDate(from))
    .lte("activity_date", toIsoDate(to))
    .order("activity_date", { ascending: false })
    .limit(days);

  if (error) throw dbError("daily_activity", error);
  if (!Array.isArray(data) || data.length === 0) return null;

  const summary: WeeklySummary = {
    from: toIsoDate(from),
    to: toIsoDate(to),
    active_days: 0,
    reviews: 0,
    reviews_correct: 0,
    new_items: 0,
    listening_seconds: 0,
    speaking_seconds: 0,
  };

  for (const row of data) {
    if (!isRecord(row)) continue;
    const reviews = typeof row.reviews === "number" ? row.reviews : 0;
    if (reviews > 0) summary.active_days += 1;
    summary.reviews += reviews;
    summary.reviews_correct +=
      typeof row.reviews_correct === "number" ? row.reviews_correct : 0;
    summary.new_items += typeof row.new_items === "number" ? row.new_items : 0;
    summary.listening_seconds +=
      typeof row.listening_seconds === "number" ? row.listening_seconds : 0;
    summary.speaking_seconds +=
      typeof row.speaking_seconds === "number" ? row.speaking_seconds : 0;
  }

  return summary;
}

/**
 * Daily study minutes for the streak heatmap.
 *
 * Bounded to the requested window so the dashboard never pulls a learner's
 * entire history to draw a 30-day chart.
 */
export async function listDailyActivity(
  client: InsForgeClient,
  languageCode: string,
  days = 30,
): Promise<Array<{ date: string; minutes: number; reviews: number }>> {
  const from = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);

  const { data, error } = await client.database
    .from("daily_activity")
    .select("activity_date,minutes,reviews")
    .eq("language_code", languageCode)
    .gte("activity_date", toIsoDate(from))
    .order("activity_date", { ascending: true })
    .limit(days);

  if (error) throw dbError("daily_activity", error);
  if (!Array.isArray(data)) return [];

  return data.flatMap((row: unknown) => {
    if (!isRecord(row)) return [];
    const date = optionalString(row, "activity_date");
    if (!date) return [];
    return [
      {
        date,
        minutes: typeof row.minutes === "number" ? row.minutes : 0,
        reviews: typeof row.reviews === "number" ? row.reviews : 0,
      },
    ];
  });
}
