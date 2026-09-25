import type { InsForgeClient } from "@insforge/sdk";
import { parsers, dbError } from "@/lib/db/parse";
import type { Language, TextDirection } from "@/lib/types";

const { isRecord, requireString, optionalString, optionalBoolean, enumValue } = parsers;

/** Columns named explicitly: never `select('*')` on a list read. */
const LANGUAGE_COLUMNS =
  "code,name_en,name_native,flag_emoji,direction,script,supports_cefr," +
  "supports_audio,supports_asr,supports_pronunciation,is_available,sort_order," +
  "greeting_native,greeting_english";

const DIRECTIONS = ["ltr", "rtl"] as const;

function parseLanguage(row: unknown): Language {
  if (!isRecord(row)) {
    throw new Error("languages: expected an object row");
  }

  return {
    code: requireString(row, "languages", "code"),
    name_en: requireString(row, "languages", "name_en"),
    name_native: requireString(row, "languages", "name_native"),
    flag_emoji: optionalString(row, "flag_emoji"),
    greeting_native: optionalString(row, "greeting_native"),
    greeting_english: optionalString(row, "greeting_english"),
    direction: enumValue<TextDirection>(
      row,
      "languages",
      "direction",
      DIRECTIONS,
      "ltr",
    ),
    script: optionalString(row, "script"),
    supports_cefr: optionalBoolean(row, "supports_cefr", true),
    supports_audio: optionalBoolean(row, "supports_audio"),
    supports_asr: optionalBoolean(row, "supports_asr"),
    supports_pronunciation: optionalBoolean(row, "supports_pronunciation"),
    is_available: optionalBoolean(row, "is_available"),
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 100,
  };
}

/**
 * The full catalogue, split by whether a guided path actually exists.
 *
 * Learner-facing language pickers read this: available languages can be
 * started, and the remaining catalogue is shown as "coming soon" rather than
 * hidden — so the platform's reach is visible and honest.
 */
export async function listLanguages(
  client: InsForgeClient,
): Promise<{ all: Language[]; available: Language[]; upcoming: Language[] }> {
  const { data, error } = await client.database
    .from("languages")
    .select(LANGUAGE_COLUMNS)
    .order("sort_order", { ascending: true })
    .limit(100);

  if (error) throw dbError("languages", error);
  if (!Array.isArray(data)) throw new Error("languages: expected an array");

  const all = data.map(parseLanguage);

  return {
    // `all` includes languages that exist only as someone's first language and
    // are not taught here, so the onboarding step that asks for a first language
    // can offer them without them appearing as a learning target.
    all,
    available: all.filter((l) => l.is_available),
    upcoming: all.filter((l) => !l.is_available),
  };
}

export async function getLanguage(
  client: InsForgeClient,
  code: string,
): Promise<Language | null> {
  const { data, error } = await client.database
    .from("languages")
    .select(LANGUAGE_COLUMNS)
    .eq("code", code)
    .limit(1)
    .maybeSingle();

  if (error) throw dbError("languages", error);
  if (!data) return null;

  return parseLanguage(data);
}

/**
 * Validate a language code coming from a URL or form before using it as a
 * query parameter, so an unknown code produces a 404 rather than an empty page.
 */
export async function findAvailableLanguage(
  client: InsForgeClient,
  code: string,
): Promise<Language | null> {
  const language = await getLanguage(client, code);
  if (!language || !language.is_available) return null;
  return language;
}
