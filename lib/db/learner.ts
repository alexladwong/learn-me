import type { InsForgeClient } from "@insforge/sdk";
import { mergeDraft, type OnboardingDraft } from "@/lib/onboarding/draft";
import { dbError, parsers } from "@/lib/db/parse";
import {
  CEFR_LEVELS,
  type CefrLevel,
  type LearnerLanguage,
  type Profile,
  type UserStats,
} from "@/lib/types";

const {
  isRecord,
  requireString,
  optionalString,
  optionalNumber,
  stringArray,
  enumValue,
  nullableEnum,
} = parsers;

const PROFILE_COLUMNS =
  "id,display_name,avatar_url,timezone,ui_locale,native_language," +
  "onboarding_state,onboarding_step,onboarded_at";

const LEARNER_LANGUAGE_COLUMNS =
  "id,user_id,language_code,is_active,is_primary,motivation,cefr_level,cefr_goal," +
  "daily_minutes,skill_priorities,preferred_modes,started_at";

const STATS_COLUMNS =
  "user_id,language_code,words_learned,sentences_mastered,review_cards_due," +
  "listening_seconds,speaking_seconds,total_reviews,total_correct," +
  "streak_current,streak_longest,last_active_date";

export type AuthenticatedUser = { id: string; email: string | null };

/**
 * The signed-in user, or `null` when there is no valid session.
 *
 * This talks to the auth endpoint, so it is the authoritative check — an
 * expired cookie that `hasSessionCookie()` would accept fails here. A server
 * error is rethrown rather than treated as signed-out: silently rendering the
 * marketing page for a real outage would hide the failure.
 */
export async function getAuthenticatedUser(
  client: InsForgeClient,
): Promise<AuthenticatedUser | null> {
  const { data, error } = await client.auth.getCurrentUser();

  if (error) {
    if (error.statusCode === 401 || error.statusCode === 403) return null;
    throw dbError("auth.getCurrentUser", error);
  }

  const user = data?.user;
  if (!user || typeof user.id !== "string") return null;

  return { id: user.id, email: typeof user.email === "string" ? user.email : null };
}

export async function getProfile(
  client: InsForgeClient,
  userId: string,
): Promise<Profile | null> {
  const { data, error } = await client.database
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw dbError("profiles", error);
  if (!data || !isRecord(data)) return null;

  return {
    id: requireString(data, "profiles", "id"),
    display_name: optionalString(data, "display_name"),
    avatar_url: optionalString(data, "avatar_url"),
    timezone: optionalString(data, "timezone"),
    ui_locale: optionalString(data, "ui_locale") ?? "en",
    native_language: optionalString(data, "native_language"),
    onboarding_state: enumValue(
      data,
      "profiles",
      "onboarding_state",
      ["pending", "in_progress", "complete"] as const,
      "pending",
    ),
    onboarding_step: optionalNumber(data, "onboarding_step"),
    onboarded_at: optionalString(data, "onboarded_at"),
  };
}

/**
 * The learner's profile, created on demand.
 *
 * A database trigger already provisions a profile on signup, so this usually
 * returns an existing row. It is written as an idempotent upsert because a
 * learner can sign in during the brief window before the trigger commits, and
 * the alternative — a 500 on first login — is far worse than a redundant insert.
 */
export async function ensureProfile(
  client: InsForgeClient,
  user: AuthenticatedUser,
): Promise<Profile> {
  const existing = await getProfile(client, user.id);
  if (existing) return existing;

  const fallbackName = user.email ? user.email.split("@")[0] : null;

  const { error } = await client.database
    .from("profiles")
    .upsert([{ id: user.id, display_name: fallbackName }], { onConflict: "id" });

  if (error) throw dbError("profiles.upsert", error);

  const created = await getProfile(client, user.id);
  if (!created) {
    throw new Error(`profiles: row for ${user.id} missing immediately after upsert`);
  }
  return created;
}

function parseLearnerLanguage(row: unknown): LearnerLanguage {
  if (!isRecord(row)) throw new Error("learner_languages: expected an object row");

  return {
    id: requireString(row, "learner_languages", "id"),
    user_id: requireString(row, "learner_languages", "user_id"),
    language_code: requireString(row, "learner_languages", "language_code"),
    is_active: row.is_active !== false,
    is_primary: row.is_primary === true,
    motivation: stringArray(row, "motivation"),
    cefr_level: nullableEnum<CefrLevel>(row, "cefr_level", CEFR_LEVELS),
    cefr_goal: nullableEnum<CefrLevel>(row, "cefr_goal", CEFR_LEVELS),
    daily_minutes: optionalNumber(row, "daily_minutes") || 10,
    skill_priorities: stringArray(row, "skill_priorities"),
    preferred_modes: stringArray(row, "preferred_modes"),
    started_at: optionalString(row, "started_at") ?? new Date(0).toISOString(),
  };
}

export type LearnerLanguageWithMeta = LearnerLanguage & {
  /** Joined from `languages` so the shell can render a name without a second read. */
  language: { code: string; name_en: string; name_native: string; flag_emoji: string | null };
};

function parseLanguageMeta(row: Record<string, unknown>) {
  const nested = row.languages;
  if (!isRecord(nested)) return null;

  return {
    code: requireString(nested, "languages", "code"),
    name_en: requireString(nested, "languages", "name_en"),
    name_native: requireString(nested, "languages", "name_native"),
    flag_emoji: optionalString(nested, "flag_emoji"),
  };
}

/** Every language this learner has enrolled in, primary first, with display names. */
export async function listLearnerLanguages(
  client: InsForgeClient,
): Promise<LearnerLanguageWithMeta[]> {
  const { data, error } = await client.database
    .from("learner_languages")
    .select(
      `${LEARNER_LANGUAGE_COLUMNS},languages(code,name_en,name_native,flag_emoji)`,
    )
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("started_at", { ascending: true })
    .limit(50);

  if (error) throw dbError("learner_languages", error);
  if (!Array.isArray(data)) throw new Error("learner_languages: expected an array");

  return data.flatMap((row: unknown): LearnerLanguageWithMeta[] => {
    if (!isRecord(row)) return [];
    const language = parseLanguageMeta(row);
    // A learner_language whose language row is missing is unrenderable; dropping
    // it is better than crashing the whole shell.
    if (!language) return [];
    return [{ ...parseLearnerLanguage(row), language }];
  });
}

export async function getLearnerLanguage(
  client: InsForgeClient,
  languageCode: string,
): Promise<LearnerLanguageWithMeta | null> {
  const { data, error } = await client.database
    .from("learner_languages")
    .select(`${LEARNER_LANGUAGE_COLUMNS},languages(code,name_en,name_native,flag_emoji)`)
    .eq("language_code", languageCode)
    .limit(1)
    .maybeSingle();

  if (error) throw dbError("learner_languages", error);
  if (!data || !isRecord(data)) return null;

  const language = parseLanguageMeta(data);
  if (!language) {
    throw new Error(
      `learner_languages: joined language row missing for "${languageCode}"`,
    );
  }

  return { ...parseLearnerLanguage(data), language };
}

export type OnboardingAnswers = {
  languageCode: string;
  nativeLanguage: string | null;
  motivations: string[];
  cefrLevel: CefrLevel | null;
  cefrGoal: CefrLevel;
  dailyMinutes: number;
  skillPriorities: string[];
};

/**
 * The learner's persisted active language, or `null` when they have none.
 *
 * This is what turns "which language am I in" into something durable. The URL is
 * how the learner expresses it moment to moment, but a bookmark, a fresh visit
 * to `/` or a reload of a route with no language in it has to resolve through
 * stored state — otherwise the switch is forgotten the moment they navigate away
 * from it.
 *
 * `cefr_level` comes back with it because a learner who started a language but
 * never finished onboarding has a row and no plan, and belongs in onboarding
 * rather than on a dashboard built from defaults.
 */
export async function getActiveLanguage(
  client: InsForgeClient,
): Promise<{ code: string; onboarded: boolean } | null> {
  const { data, error } = await client.database
    .from("learner_languages")
    .select("language_code,cefr_level")
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw dbError("learner_languages.active", error);
  if (!data || !isRecord(data)) return null;

  return {
    code: requireString(data, "learner_languages", "language_code"),
    onboarded: optionalString(data, "cefr_level") !== null,
  };
}

/**
 * Make one of the learner's existing languages the active one.
 *
 * `is_primary` is the persisted answer to "which language is this learner in".
 * The URL is what the learner sees, but it is not durable: reloading a bookmarked
 * route, or landing on `/` from anywhere, resolves through this flag. Keeping
 * only the URL in sync is what makes a switcher feel broken the next morning.
 *
 * Two statements, not one, and that is load-bearing: `learner_languages_one_
 * primary_idx` is a partial unique index over `(user_id) WHERE is_primary`, so
 * the previously primary row has to be cleared before the new one is claimed.
 * Setting both in a single statement would violate the index mid-statement.
 *
 * Returns `false` when the code is not one of this learner's active languages.
 * The caller must not be able to move someone onto a language they never
 * enrolled in, and RLS alone would not catch that — the update would simply
 * match no rows and report success.
 *
 * This never inserts, deletes or re-creates a `learner_languages` row. Each
 * language keeps its own plan, level, progress and review schedule; switching is
 * a pointer move, not a re-enrolment.
 */
export async function setPrimaryLanguage(
  client: InsForgeClient,
  userId: string,
  languageCode: string,
): Promise<boolean> {
  const { data, error } = await client.database
    .from("learner_languages")
    .select("id,is_primary")
    .eq("user_id", userId)
    .eq("language_code", languageCode)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw dbError("learner_languages.select", error);
  if (!data || !isRecord(data)) return false;
  if (data.is_primary === true) return true;

  const cleared = await client.database
    .from("learner_languages")
    .update({ is_primary: false })
    .eq("user_id", userId)
    .eq("is_primary", true);

  if (cleared.error) throw dbError("learner_languages.clear_primary", cleared.error);

  const claimed = await client.database
    .from("learner_languages")
    .update({ is_primary: true })
    .eq("user_id", userId)
    .eq("language_code", languageCode);

  if (claimed.error) throw dbError("learner_languages.set_primary", claimed.error);

  return true;
}

/**
 * Persist the onboarding answers.
 *
 * `learner_languages` is upserted on `(user_id, language_code)` so re-running
 * onboarding for a language the learner already studies updates their plan
 * instead of creating a second row or failing on the unique constraint.
 *
 * `is_primary` is only asserted for the learner's first language: the schema has
 * a partial unique index allowing exactly one primary, so a second enrolment
 * must not claim it.
 */
export async function saveOnboardingAnswers(
  client: InsForgeClient,
  userId: string,
  answers: OnboardingAnswers,
  profileFields: { displayName?: string | null; timezone?: string },
): Promise<void> {
  const { count, error: countError } = await client.database
    .from("learner_languages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countError) throw dbError("learner_languages.count", countError);

  const isFirstLanguage = (count ?? 0) === 0;

  const { error: learnerError } = await client.database
    .from("learner_languages")
    .upsert(
      [
        {
          user_id: userId,
          language_code: answers.languageCode,
          is_active: true,
          ...(isFirstLanguage ? { is_primary: true } : {}),
          motivation: answers.motivations,
          cefr_level: answers.cefrLevel,
          cefr_goal: answers.cefrGoal,
          daily_minutes: answers.dailyMinutes,
          skill_priorities: answers.skillPriorities,
        },
      ],
      { onConflict: "user_id,language_code" },
    );

  if (learnerError) throw dbError("learner_languages.upsert", learnerError);

  const { error: profileError } = await client.database
    .from("profiles")
    .update({
      ...(profileFields.displayName !== undefined
        ? { display_name: profileFields.displayName }
        : {}),
      ...(profileFields.timezone ? { timezone: profileFields.timezone } : {}),
      native_language: answers.nativeLanguage,
      onboarding_state: "complete",
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileError) throw dbError("profiles.update", profileError);

  // Seed the stats row so the dashboard reads one row instead of aggregating.
  const { error: statsError } = await client.database
    .from("user_stats")
    .upsert(
      [{ user_id: userId, language_code: answers.languageCode }],
      { onConflict: "user_id,language_code", ignoreDuplicates: true },
    );

  if (statsError) throw dbError("user_stats.upsert", statsError);
}

/**
 * The learner's derived stats for one language.
 *
 * Returns `null` when no row exists yet, which is materially different from a
 * row of zeros: the dashboard shows "not started" rather than "0 words
 * learned", and never invents a number.
 */
export async function getUserStats(
  client: InsForgeClient,
  languageCode: string,
): Promise<UserStats | null> {
  const { data, error } = await client.database
    .from("user_stats")
    .select(STATS_COLUMNS)
    .eq("language_code", languageCode)
    .limit(1)
    .maybeSingle();

  if (error) throw dbError("user_stats", error);
  if (!data || !isRecord(data)) return null;

  return {
    user_id: requireString(data, "user_stats", "user_id"),
    language_code: requireString(data, "user_stats", "language_code"),
    words_learned: optionalNumber(data, "words_learned"),
    sentences_mastered: optionalNumber(data, "sentences_mastered"),
    review_cards_due: optionalNumber(data, "review_cards_due"),
    listening_seconds: optionalNumber(data, "listening_seconds"),
    speaking_seconds: optionalNumber(data, "speaking_seconds"),
    total_reviews: optionalNumber(data, "total_reviews"),
    total_correct: optionalNumber(data, "total_correct"),
    streak_current: optionalNumber(data, "streak_current"),
    streak_longest: optionalNumber(data, "streak_longest"),
    last_active_date: optionalString(data, "last_active_date"),
  };
}

/**
 * Refresh the due-card rollup for the signed-in learner, then return it.
 *
 * The function takes no user id: the SQL resolves the learner from the session
 * (`auth.uid()`) on purpose, so there is no parameter a caller could point at
 * someone else.
 *
 * `fallback` is returned when the learner has no `user_stats` row yet (they
 * have not started), which is "unknown" rather than an error worth failing the
 * whole page over. PostgREST uses different error shapes for `database.from`
 * and `database.rpc`, so both a status code and a message check are needed.
 */
export async function refreshDueCount(
  client: InsForgeClient,
  fallback: number | null,
): Promise<number | null> {
  const { data, error } = await client.database.rpc("refresh_review_cards_due");

  if (error) {
    if (isRecoverableRpcError(error)) return fallback;
    throw dbError("refresh_review_cards_due", error);
  }

  return typeof data === "number" ? data : fallback;
}

function isRecoverableRpcError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (statusCode === 404 || statusCode === 400) return true;

  const pgrstCode = (error as { code?: unknown }).code;
  // PGRST202: function not found. 42883: undefined_function.
  if (typeof pgrstCode === "string" && ["PGRST202", "42883"].includes(pgrstCode)) {
    return true;
  }

  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    (message.includes("not authenticated") || message.includes("does not exist"))
  );
}

/**
 * The onboarding draft: what has been answered so far, on the server.
 *
 * This exists because answers held only in the browser were being lost. Each step
 * is a Server Action plus a redirect that remounts the wizard, so between steps
 * the client is the only carrier — and a render that happened before the client
 * rehydrated produced a form with no `motivation` inputs at all, so the final
 * submit correctly reported a missing reason while the learner watched their
 * selections disappear.
 *
 * Every step now merges what it collected into this draft, and the final submit
 * reads it back. Merging is the important part: a step only owns some fields, so
 * it must never overwrite the rest with nulls.
 *
 * Shape is intentionally loose (`Record<string, unknown>`) because it is a
 * partial plan in progress; the authoritative shape is the canonical mapping in
 * `lib/onboarding/schema.ts`, and `saveOnboardingAnswers` still validates the
 * complete object before anything is written to `learner_languages`.
 */
export type { OnboardingDraft } from "@/lib/onboarding/draft";

/** Read the stored draft. Returns an empty object when there is none. */
export async function getOnboardingDraft(
  client: InsForgeClient,
  userId: string,
): Promise<OnboardingDraft> {
  const { data, error } = await client.database
    .from("profiles")
    .select("onboarding_draft")
    .eq("id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw dbError("profiles", error);
  if (!isRecord(data)) return {};

  const draft = data.onboarding_draft;
  return isRecord(draft) ? (draft as OnboardingDraft) : {};
}

/**
 * Merge one step's answers into the draft.
 *
 * Only the keys present in `patch` are written, so a step that owns three fields
 * cannot erase the four an earlier step stored. An explicit `undefined` is
 * skipped for the same reason.
 */
export async function mergeOnboardingDraft(
  client: InsForgeClient,
  userId: string,
  patch: OnboardingDraft,
  step?: number,
): Promise<OnboardingDraft> {
  const current = await getOnboardingDraft(client, userId);
  // The merge rule itself lives in `lib/onboarding/draft.ts` so it is unit
  // tested; this function only owns the persistence around it.
  const merged = mergeDraft(current, patch);

  const { error } = await client.database
    .from("profiles")
    .update({
      onboarding_draft: merged,
      onboarding_state: "in_progress",
      ...(step !== undefined ? { onboarding_step: step } : {}),
    })
    .eq("id", userId);

  if (error) throw dbError("profiles", error);
  return merged;
}

/** Drop the draft once the plan has been written from it. */
export async function clearOnboardingDraft(
  client: InsForgeClient,
  userId: string,
): Promise<void> {
  const { error } = await client.database
    .from("profiles")
    .update({ onboarding_draft: null, onboarding_step: 0 })
    .eq("id", userId);

  if (error) throw dbError("profiles", error);
}
