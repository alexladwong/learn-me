import type { InsForgeClient } from "@insforge/sdk";
import { dbError, parsers } from "@/lib/db/parse";

const {
  isRecord,
  requireString,
  optionalString,
  optionalBoolean,
  optionalNumber,
  stringArray,
  enumValue,
} = parsers;

/**
 * The learner's personal banks.
 *
 * The sentence bank and word bank are one table with two presentations — the
 * same decision the schema made for `items`. A "word bank" and a "sentence bank"
 * that stored the same content twice would diverge the moment a learner moved an
 * item between them.
 */

export type BankEntry = {
  savedItemId: string;
  itemId: string;
  kind: "word" | "phrase" | "sentence" | "grammar_point";
  surface: string;
  translationLiteral: string | null;
  translationNatural: string;
  grammarNote: string | null;
  partOfSpeech: string | null;
  ipa: string | null;
  topic: string | null;
  tags: string[];
  audioNormalUrl: string | null;
  audioSlowUrl: string | null;
  personalNote: string | null;
  isFavorite: boolean;
  savedFrom: string;
  savedAt: string;
  /** Memory state, or null when the item is saved but not yet in review. */
  memory: {
    state: string;
    stability: number;
    difficulty: number;
    reps: number;
    dueAt: string;
    lastRating: string | null;
  } | null;
};

const ITEM_KINDS = ["word", "phrase", "sentence", "grammar_point"] as const;

const BANK_COLUMNS = [
  "id",
  "saved_from",
  "saved_at",
  "personal_note",
  "is_favorite",
  "items!inner(id,kind,surface,translation_literal,translation_natural,grammar_note,part_of_speech,ipa,topic,tags,audio_normal_url,audio_slow_url,retired_at)",
].join(",");

function parseBankEntry(row: unknown): BankEntry | null {
  if (!isRecord(row)) return null;
  const item = row.items;
  if (!isRecord(item)) return null;
  if (item.retired_at) return null;

  const itemId = optionalString(item, "id");
  if (!itemId) return null;

  const memory = parseMemory(row.review_states);

  return {
    savedItemId: requireString(row, "saved_items", "id"),
    itemId,
    kind: enumValue(item, "items", "kind", ITEM_KINDS, "word"),
    surface: requireString(item, "items", "surface"),
    translationLiteral: optionalString(item, "translation_literal"),
    translationNatural: requireString(item, "items", "translation_natural"),
    grammarNote: optionalString(item, "grammar_note"),
    partOfSpeech: optionalString(item, "part_of_speech"),
    ipa: optionalString(item, "ipa"),
    topic: optionalString(item, "topic"),
    tags: stringArray(item, "tags"),
    audioNormalUrl: optionalString(item, "audio_normal_url"),
    audioSlowUrl: optionalString(item, "audio_slow_url"),
    personalNote: optionalString(row, "personal_note"),
    isFavorite: optionalBoolean(row, "is_favorite"),
    savedFrom: optionalString(row, "saved_from") ?? "manual",
    savedAt: optionalString(row, "saved_at") ?? new Date(0).toISOString(),
    memory,
  };
}

/**
 * Build a bank entry's memory state from a `review_states` row.
 *
 * The row is fetched by an explicit second query (see `listBankEntries`); the
 * one-element-array case is tolerated because PostgREST returns a to-one embed
 * that way, and this shape is easy to reintroduce by accident.
 */
function parseMemory(value: unknown): BankEntry["memory"] {
  const row = Array.isArray(value) ? value[0] : value;
  if (!isRecord(row)) return null;

  const state = optionalString(row, "state");
  if (!state) return null;

  return {
    state,
    stability: optionalNumber(row, "stability"),
    difficulty: optionalNumber(row, "difficulty"),
    reps: optionalNumber(row, "reps"),
    dueAt: optionalString(row, "due_at") ?? new Date(0).toISOString(),
    lastRating: optionalString(row, "last_rating"),
  };
}

export type BankFilter = {
  kind?: "word" | "sentence" | "all";
  search?: string;
  favoritesOnly?: boolean;
  /** Keyset pagination cursor: only entries saved strictly before this ISO time. */
  before?: string;
  limit?: number;
};

/**
 * The bank, newest first, keyset-paginated.
 *
 * `range`/`offset` pagination would re-scan on every page; a `saved_at < cursor`
 * filter keeps each page's cost constant as the bank grows.
 */
export async function listBankEntries(
  client: InsForgeClient,
  languageCode: string,
  filter: BankFilter = {},
): Promise<BankEntry[]> {
  const { kind = "all", search, favoritesOnly, before, limit = 30 } = filter;

  let query = client.database
    .from("saved_items")
    .select(BANK_COLUMNS)
    .eq("language_code", languageCode)
    .is("archived_at", null)
    .order("saved_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (kind !== "all") {
    // Filtering on an embedded table's column is a PostgREST inner-join filter;
    // the `!inner` above makes it exclusive rather than merely projected.
    query = query.eq("items.kind", kind);
  }
  if (favoritesOnly) query = query.eq("is_favorite", true);
  if (before) query = query.lt("saved_at", before);
  /**
   * Search over the target text and its translation — the two ways a learner
   * looks for something they saved.
   *
   * Pluralised as `or=(...)` this crashed every non-empty search with a 500.
   * InsForge's query parser rejects `or()` when the column belongs to a joined
   * table: `items.surface.ilike.%hola%` fails with "failed to parse logic tree",
   * and so does every escaping variant — quoted, starred, or without wildcards.
   * A single-column `.ilike("items.surface", …)` on the same embed works, so the
   * limitation is `or()` specifically, not the join.
   *
   * So the two columns are searched separately and merged by id. The alternative
   * — dropping one column — would silently stop finding translations, which is
   * the more common thing to search for.
   */
  const trimmedSearch = search?.trim().replace(/[%_]/g, "") ?? "";
  if (trimmedSearch) {
    const term = `%${trimmedSearch}%`;
    const columns = ["items.surface", "items.translation_natural"];

    const results = await Promise.all(
      columns.map((column) =>
        client.database
          .from("saved_items")
          .select(BANK_COLUMNS)
          // `!inner` makes the join exclusive, so filtering a joined column
          // filters the parent rows rather than merely projecting them.
          .eq("language_code", languageCode)
          .is("archived_at", null)
          .ilike(column, term)
          .order("saved_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(Math.min(Math.max(limit, 1), 100)),
      ),
    );

    const failure = results.find((result) => result.error);
    if (failure?.error) throw dbError("saved_items", failure.error);

    // Merge by row id: an item matching both columns must appear once.
    const byId = new Map<string, unknown>();
    for (const result of results) {
      for (const row of Array.isArray(result.data) ? result.data : []) {
        if (isRecord(row) && typeof row.id === "string") byId.set(row.id, row);
      }
    }

    const merged = [...byId.values()]
      .map((row) => parseBankEntry(row))
      .filter((entry): entry is BankEntry => entry !== null)
      .sort((a, b) => (a.savedAt === b.savedAt ? (a.savedItemId < b.savedItemId ? 1 : -1) : a.savedAt < b.savedAt ? 1 : -1));

    return attachMemory(client, merged);
  }

  const { data, error } = await query;
  if (error) throw dbError("saved_items", error);
  if (!Array.isArray(data)) throw new Error("saved_items: expected an array");

  // Memory state is fetched separately rather than embedded. PostgREST can only
  // embed a related table when a foreign key joins the two, and there is none
  // between `saved_items` and `review_states` — the card is keyed on
  // (user_id, item_id) while the bank row is keyed on the item alone, so no
  // constraint exists to resolve. Asking for the embed makes the entire query
  // fail with "could not find a relationship", which took the bank screen down
  // for every learner who had saved anything.
  //
  // RLS already scopes `review_states` to the signed-in learner, so filtering by
  // item id cannot surface another learner's card.
  const entries = data.flatMap((row: unknown): BankEntry[] => {
    const entry = parseBankEntry(row);
    return entry ? [entry] : [];
  });

  return attachMemory(client, entries);
}

/**
 * Join each bank entry to its memory state.
 *
 * Shared by the plain list and the search path so the two cannot disagree about
 * what a saved word's schedule is.
 */
async function attachMemory(
  client: InsForgeClient,
  entries: BankEntry[],
): Promise<BankEntry[]> {
  const itemIds = entries.map((entry) => entry.itemId);
  if (itemIds.length === 0) return entries;

  const { data: cards, error: cardError } = await client.database
    .from("review_states")
    .select("item_id,state,stability,difficulty,reps,due_at,last_rating")
    .in("item_id", itemIds);

  // A missing schedule is not a failure: an item can be saved without being
  // enrolled, and the UI renders that as "not in review yet".
  if (cardError) {
    console.error("[bank] review_states lookup failed", cardError);
    return entries;
  }

  const memoryByItem = new Map<string, BankEntry["memory"]>();
  for (const card of Array.isArray(cards) ? cards : []) {
    if (!isRecord(card)) continue;
    const itemId = optionalString(card, "item_id");
    if (!itemId) continue;
    memoryByItem.set(itemId, parseMemory(card));
  }

  return entries.map((entry) => ({
    ...entry,
    memory: memoryByItem.get(entry.itemId) ?? null,
  }));
}

/** Counts for the bank header and the kind filter. */
export async function getBankCounts(
  client: InsForgeClient,
  languageCode: string,
): Promise<{ total: number; words: number; sentences: number; favorites: number }> {
  const { data, error } = await client.database
    .from("saved_items")
    .select("is_favorite,items!inner(kind)")
    .eq("language_code", languageCode)
    .is("archived_at", null)
    .limit(5000);

  if (error) throw dbError("saved_items", error);
  if (!Array.isArray(data)) {
    return { total: 0, words: 0, sentences: 0, favorites: 0 };
  }

  const counts = { total: 0, words: 0, sentences: 0, favorites: 0 };

  for (const row of data) {
    if (!isRecord(row)) continue;
    counts.total += 1;
    if (optionalBoolean(row, "is_favorite")) counts.favorites += 1;

    const item = row.items;
    const kind = isRecord(item) ? optionalString(item, "kind") : null;
    if (kind === "word") counts.words += 1;
    if (kind === "sentence" || kind === "phrase") counts.sentences += 1;
  }

  return counts;
}

/** The set of item ids already saved, so the UI can disable a duplicate save. */
export async function listSavedItemIds(
  client: InsForgeClient,
  languageCode: string,
): Promise<Set<string>> {
  const { data, error } = await client.database
    .from("saved_items")
    .select("item_id")
    .eq("language_code", languageCode)
    .limit(5000);

  if (error) throw dbError("saved_items", error);
  if (!Array.isArray(data)) return new Set();

  return new Set(
    data.flatMap((row: unknown) =>
      isRecord(row) && typeof row.item_id === "string" ? [row.item_id] : [],
    ),
  );
}

export type SaveResult = { saved: number; alreadyPresent: number };

/**
 * Save items to the bank and enrol them in spaced repetition.
 *
 * Saving is what puts a card into the queue — nothing enters review implicitly,
 * so what a learner reviews is always their own choice.
 *
 * Both writes are upserts, which makes the operation idempotent: saving the same
 * sentence twice cannot create a duplicate bank entry or reset a schedule that
 * already has history. Existing review rows are deliberately left untouched via
 * `ignoreDuplicates`, so re-saving never undoes learning.
 */
export async function saveItemsToBank(
  client: InsForgeClient,
  userId: string,
  languageCode: string,
  itemIds: string[],
  savedFrom: string,
): Promise<SaveResult> {
  const unique = [...new Set(itemIds)].filter(Boolean);
  if (unique.length === 0) return { saved: 0, alreadyPresent: 0 };

  const { data: existing, error: existingError } = await client.database
    .from("saved_items")
    .select("item_id")
    .eq("language_code", languageCode)
    .in("item_id", unique);

  if (existingError) throw dbError("saved_items", existingError);

  const already = new Set(
    (Array.isArray(existing) ? existing : []).flatMap((row: unknown) =>
      isRecord(row) && typeof row.item_id === "string" ? [row.item_id] : [],
    ),
  );

  const now = new Date().toISOString();

  const { error: bankError } = await client.database
    .from("saved_items")
    .upsert(
      unique.map((itemId) => ({
        user_id: userId,
        item_id: itemId,
        language_code: languageCode,
        saved_from: savedFrom,
        saved_at: now,
      })),
      { onConflict: "user_id,item_id", ignoreDuplicates: true },
    );

  if (bankError) throw dbError("saved_items.upsert", bankError);

  // Enrol into review. `ignoreDuplicates` matters here: a card that already has
  // a schedule must keep it.
  const { error: reviewError } = await client.database
    .from("review_states")
    .upsert(
      unique.map((itemId) => ({
        user_id: userId,
        item_id: itemId,
        language_code: languageCode,
        state: "new",
      })),
      { onConflict: "user_id,item_id", ignoreDuplicates: true },
    );

  if (reviewError) throw dbError("review_states.upsert", reviewError);

  return {
    saved: unique.filter((id) => !already.has(id)).length,
    alreadyPresent: already.size,
  };
}

/** Remove items from the learner's bank and queue. */
export async function removeItemsFromBank(
  client: InsForgeClient,
  languageCode: string,
  itemIds: string[],
): Promise<number> {
  const unique = [...new Set(itemIds)].filter(Boolean);
  if (unique.length === 0) return 0;

  const { error: reviewError } = await client.database
    .from("review_states")
    .delete()
    .eq("language_code", languageCode)
    .in("item_id", unique);

  if (reviewError) throw dbError("review_states.delete", reviewError);

  const { error: bankError, count } = await client.database
    .from("saved_items")
    .delete({ count: "exact" })
    .eq("language_code", languageCode)
    .in("item_id", unique);

  if (bankError) throw dbError("saved_items.delete", bankError);

  return count ?? unique.length;
}

/** Toggle the favourite flag on one saved entry. */
export async function setFavorite(
  client: InsForgeClient,
  savedItemId: string,
  isFavorite: boolean,
): Promise<void> {
  const { error } = await client.database
    .from("saved_items")
    .update({ is_favorite: isFavorite })
    .eq("id", savedItemId);

  if (error) throw dbError("saved_items.update", error);
}
