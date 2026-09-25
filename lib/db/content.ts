import type { InsForgeClient } from "@insforge/sdk";
import { dbError, parsers } from "@/lib/db/parse";
import type { ExtractedCandidate } from "@/lib/learning/extract";
import { foldKey } from "@/lib/learning/extract";

const {
  isRecord,
  requireString,
  optionalString,
  optionalNumber,
  enumValue,
} = parsers;

/**
 * Persistence for Learn From Content.
 *
 * Three concerns kept together because they share one lifecycle: a source is
 * pasted, analysed into candidates, and some candidates are promoted into real
 * vocabulary. Splitting them across modules would mean three places to change
 * whenever that lifecycle moves.
 */

export const SOURCE_KINDS = ["text", "url", "youtube", "image", "document"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export type ContentSource = {
  id: string;
  languageCode: string;
  sourceKind: SourceKind;
  title: string | null;
  charCount: number;
  tokenCount: number;
  candidateCount: number;
  knownCount: number;
  analyzedAt: string | null;
  createdAt: string;
  /** Raw text, only populated when explicitly requested (it can be large). */
  rawText?: string;
};

export type ContentCandidate = {
  id: string;
  sourceId: string;
  surface: string;
  surfaceKey: string;
  kind: "word" | "phrase";
  partOfSpeech: string | null;
  occurrences: number;
  contextSentence: string | null;
  score: number;
  translation: string | null;
  gloss: string | null;
  translationSource: string | null;
  enrichmentState: "pending" | "enriched" | "unavailable" | "failed";
  savedItemId: string | null;
  savedAt: string | null;
  dismissedAt: string | null;
};

const SOURCE_COLUMNS =
  "id,language_code,source_kind,title,char_count,token_count,candidate_count," +
  "known_count,analyzed_at,created_at";

const CANDIDATE_COLUMNS =
  "id,source_id,surface,surface_key,kind,part_of_speech,occurrences," +
  "context_sentence,score,translation,gloss,translation_source,enrichment_state," +
  "saved_item_id,saved_at,dismissed_at";

function parseSource(row: unknown, includeRaw = false): ContentSource {
  if (!isRecord(row)) throw new Error("content_sources: expected an object row");

  return {
    id: requireString(row, "content_sources", "id"),
    languageCode: requireString(row, "content_sources", "language_code"),
    sourceKind: enumValue(row, "content_sources", "source_kind", SOURCE_KINDS, "text"),
    title: optionalString(row, "title"),
    charCount: optionalNumber(row, "char_count"),
    tokenCount: optionalNumber(row, "token_count"),
    candidateCount: optionalNumber(row, "candidate_count"),
    knownCount: optionalNumber(row, "known_count"),
    analyzedAt: optionalString(row, "analyzed_at"),
    createdAt: optionalString(row, "created_at") ?? new Date(0).toISOString(),
    ...(includeRaw && typeof row.raw_text === "string" ? { rawText: row.raw_text } : {}),
  };
}

function parseCandidate(row: unknown): ContentCandidate | null {
  if (!isRecord(row)) return null;
  const id = optionalString(row, "id");
  if (!id) return null;

  return {
    id,
    sourceId: requireString(row, "content_candidates", "source_id"),
    surface: requireString(row, "content_candidates", "surface"),
    surfaceKey: requireString(row, "content_candidates", "surface_key"),
    kind: row.kind === "phrase" ? "phrase" : "word",
    partOfSpeech: optionalString(row, "part_of_speech"),
    occurrences: optionalNumber(row, "occurrences") || 1,
    contextSentence: optionalString(row, "context_sentence"),
    score: optionalNumber(row, "score"),
    translation: optionalString(row, "translation"),
    gloss: optionalString(row, "gloss"),
    translationSource: optionalString(row, "translation_source"),
    enrichmentState: enumValue(
      row,
      "content_candidates",
      "enrichment_state",
      ["pending", "enriched", "unavailable", "failed"] as const,
      "pending",
    ),
    savedItemId: optionalString(row, "saved_item_id"),
    savedAt: optionalString(row, "saved_at"),
    dismissedAt: optionalString(row, "dismissed_at"),
  };
}

/** Create a source row before analysis, so storage never depends on it succeeding. */
export async function createSource(
  client: InsForgeClient,
  userId: string,
  input: {
    languageCode: string;
    sourceKind: SourceKind;
    title: string | null;
    rawText: string;
  },
): Promise<string> {
  const { data, error } = await client.database
    .from("content_sources")
    .insert([
      {
        user_id: userId,
        language_code: input.languageCode,
        source_kind: input.sourceKind,
        title: input.title,
        raw_text: input.rawText,
        char_count: input.rawText.length,
      },
    ])
    .select("id");

  if (error) throw dbError("content_sources.insert", error);

  const id = Array.isArray(data) ? data[0]?.id : undefined;
  if (typeof id !== "string") {
    throw new Error("content_sources: insert returned no id");
  }
  return id;
}

/**
 * Replace a source's candidates with a fresh analysis.
 *
 * Undecided candidates are deleted and re-inserted, so re-analysing after
 * changing the text cannot leave stale suggestions behind. Candidates the
 * learner already acted on are preserved and simply not re-offered — losing a
 * record of "kept this" or "dismissed this" would mean the same word is offered
 * again, which is the behaviour that makes this feature annoying.
 *
 * `knownKeys` are excluded before insert: offering a word the learner has
 * already learned is worse than offering nothing.
 */
/**
 * Reconcile a source's candidates with a fresh analysis.
 *
 * This used to delete every undecided row and insert the freshly extracted set.
 * That is the obvious implementation of "replace", and it is wrong: `ON DELETE
 * CASCADE` aside, the candidate `id` is what the keep action posts back, and the
 * results screen holds those ids. Deleting and re-inserting mints new ids, so
 * every re-analysis silently orphaned the analysis the learner was looking at —
 * keeping a word then failed with "that word is no longer in this analysis",
 * which is true but reads as though the learner did something wrong.
 *
 * Re-analysing is not something a learner asks for directly, but it happens for
 * ordinary reasons: a second tab, a back-navigation, a retried request. Making
 * it stable costs one extra read and removes a whole class of confusing dead end.
 *
 * Identity is `(source_id, surface_key)` — there is a unique constraint on it —
 * so a candidate that is still extracted keeps its row, its id and any
 * enrichment that was already paid for. Only rows that genuinely disappeared
 * from the text are removed.
 */
export async function replaceCandidates(
  client: InsForgeClient,
  source: { id: string; languageCode: string },
  userId: string,
  extracted: readonly ExtractedCandidate[],
  knownKeys: ReadonlySet<string>,
): Promise<{ inserted: number; alreadyDecided: number; removed: number }> {
  // Decisions the learner already made are never touched: a kept or dismissed
  // word must not come back just because the text was analysed again.
  const { data: open, error: openError } = await client.database
    .from("content_candidates")
    .select("id,surface_key,saved_at,dismissed_at")
    .eq("source_id", source.id)
    .limit(2000);

  if (openError) throw dbError("content_candidates.select", openError);

  const rows = Array.isArray(open) ? open.filter(isRecord) : [];
  const decidedKeys = new Set(
    rows
      .filter((row) => row.saved_at !== null || row.dismissed_at !== null)
      .flatMap((row) => (typeof row.surface_key === "string" ? [row.surface_key] : [])),
  );
  const openKeys = new Set(
    rows.flatMap((row) => (typeof row.surface_key === "string" ? [row.surface_key] : [])),
  );

  const fresh = extracted.filter(
    (candidate) =>
      !knownKeys.has(candidate.surfaceKey) && !decidedKeys.has(candidate.surfaceKey),
  );
  const freshKeys = new Set(fresh.map((candidate) => candidate.surfaceKey));

  // Rows that are no longer extracted, and were never decided.
  const stale = rows.filter(
    (row) =>
      row.saved_at === null &&
      row.dismissed_at === null &&
      typeof row.surface_key === "string" &&
      !freshKeys.has(row.surface_key),
  );

  if (stale.length > 0) {
    const { error } = await client.database
      .from("content_candidates")
      .delete()
      .in(
        "id",
        stale.flatMap((row) => (typeof row.id === "string" ? [row.id] : [])),
      );
    if (error) throw dbError("content_candidates.delete", error);
  }

  if (fresh.length > 0) {
    // Upsert on the unique key: existing rows keep their identity, and the
    // signals that legitimately change with the text (counts, context, score)
    // are refreshed.
    const { error } = await client.database.from("content_candidates").upsert(
      fresh.map((candidate) => ({
        source_id: source.id,
        user_id: userId,
        language_code: source.languageCode,
        surface: candidate.surface,
        surface_key: candidate.surfaceKey,
        kind: candidate.kind,
        occurrences: candidate.occurrences,
        context_sentence: candidate.contextSentence,
        score: candidate.score,
      })),
      { onConflict: "source_id,surface_key" },
    );

    if (error) throw dbError("content_candidates.upsert", error);
  }

  const inserted = fresh.filter((candidate) => !openKeys.has(candidate.surfaceKey)).length;

  return { inserted, alreadyDecided: decidedKeys.size, removed: stale.length };
}

/**
 * Record the outcome of an analysis.
 *
 * `knownCount` is stored so the results screen can say "12 of 30 words were
 * already familiar" — a claim the learner can verify against their own bank,
 * rather than an opaque count.
 */
export async function markSourceAnalyzed(
  client: InsForgeClient,
  sourceId: string,
  counts: { tokenCount: number; candidateCount: number; knownCount: number },
): Promise<void> {
  const { error } = await client.database
    .from("content_sources")
    .update({
      token_count: counts.tokenCount,
      candidate_count: counts.candidateCount,
      known_count: counts.knownCount,
      analyzed_at: new Date().toISOString(),
    })
    .eq("id", sourceId);

  if (error) throw dbError("content_sources.update", error);
}

/** One source with its own fields plus raw text, for the analysis screen. */
export async function getSource(
  client: InsForgeClient,
  sourceId: string,
): Promise<(ContentSource & { rawText: string }) | null> {
  const { data, error } = await client.database
    .from("content_sources")
    .select(`${SOURCE_COLUMNS},raw_text`)
    .eq("id", sourceId)
    .limit(1)
    .maybeSingle();

  if (error) throw dbError("content_sources", error);
  if (!data || !isRecord(data)) return null;

  const source = parseSource(data, true);
  return { ...source, rawText: source.rawText ?? "" };
}

/**
 * The learner's sources, newest first.
 *
 * Bounded and columns-named: `raw_text` is deliberately excluded, because a list
 * view that downloads every pasted article is the query shape that burns an
 * egress allowance for no benefit.
 */
export async function listSources(
  client: InsForgeClient,
  languageCode: string,
  limit = 20,
): Promise<ContentSource[]> {
  const { data, error } = await client.database
    .from("content_sources")
    .select(SOURCE_COLUMNS)
    .eq("language_code", languageCode)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (error) throw dbError("content_sources", error);
  if (!Array.isArray(data)) return [];

  return data.flatMap((row: unknown): ContentSource[] => {
    try {
      return [parseSource(row)];
    } catch {
      return [];
    }
  });
}

/** Candidates for one source, undecided first, then by score. */
export async function listCandidates(
  client: InsForgeClient,
  sourceId: string,
  options: { includeDecided?: boolean } = {},
): Promise<ContentCandidate[]> {
  let query = client.database
    .from("content_candidates")
    .select(CANDIDATE_COLUMNS)
    .eq("source_id", sourceId)
    .order("score", { ascending: false })
    .order("occurrences", { ascending: false })
    .order("surface_key", { ascending: true })
    .limit(200);

  if (!options.includeDecided) {
    query = query.is("saved_at", null).is("dismissed_at", null);
  }

  const { data, error } = await query;
  if (error) throw dbError("content_candidates", error);
  if (!Array.isArray(data)) return [];

  return data.flatMap((row: unknown): ContentCandidate[] => {
    const candidate = parseCandidate(row);
    return candidate ? [candidate] : [];
  });
}

/**
 * Every surface key the learner already has, for both curriculum items and their
 * own captures.
 *
 * Used to suppress suggestions. It reads `saved_items` joined to `items` rather
 * than `items` alone, because curriculum content the learner has never saved is
 * legitimately new to them.
 */
export async function listKnownSurfaceKeys(
  client: InsForgeClient,
  languageCode: string,
): Promise<Set<string>> {
  const { data, error } = await client.database
    .from("saved_items")
    .select("items!inner(surface,translation_natural)")
    .eq("language_code", languageCode)
    .limit(5000);

  if (error) throw dbError("saved_items", error);
  if (!Array.isArray(data)) return new Set();

  const keys = new Set<string>();
  for (const row of data) {
    if (!isRecord(row)) continue;
    const item = row.items;
    if (!isRecord(item)) continue;
    const surface = optionalString(item, "surface");
    if (surface) keys.add(foldKey(surface));
    const translation = optionalString(item, "translation_natural");
    if (translation) keys.add(foldKey(translation));
  }
  return keys;
}

/** Dismiss candidates so they are not offered again from this source. */
export async function dismissCandidates(
  client: InsForgeClient,
  candidateIds: readonly string[],
): Promise<number> {
  const ids = [...new Set(candidateIds)].filter(Boolean);
  if (ids.length === 0) return 0;

  const { error } = await client.database
    .from("content_candidates")
    .update({ dismissed_at: new Date().toISOString() })
    .in("id", ids);

  if (error) throw dbError("content_candidates.dismiss", error);
  return ids.length;
}

export type KeepCandidateInput = {
  candidateId: string;
  translation: string;
  gloss?: string | null;
  translationSource?: "ai" | "learner" | "dictionary";
};

export type KeepResult =
  | { ok: true; itemId: string }
  | { ok: false; error: string };

/**
 * Promote a candidate into real vocabulary.
 *
 * Delegates to `keep_content_candidate` in the database so all four writes —
 * item, bank entry, review enrolment, and the candidate's own link — happen in
 * one transaction. A partial success here would show a word as kept with no card
 * to review, which the UI has no honest way to represent.
 */
export async function keepCandidate(
  client: InsForgeClient,
  input: KeepCandidateInput,
): Promise<KeepResult> {
  const { data, error } = await client.database.rpc("keep_content_candidate", {
    p_candidate_id: input.candidateId,
    p_translation: input.translation,
    p_gloss: input.gloss ?? null,
    p_translation_source: input.translationSource ?? "learner",
  });

  if (error) {
    // A missing translation is the one failure worth reporting verbatim: it is
    // the learner's own input, not an internal error.
    if (/translation is required/i.test(error.message ?? "")) {
      return { ok: false, error: "Enter a translation before keeping this word." };
    }
    if (/not found/i.test(error.message ?? "")) {
      return { ok: false, error: "That word is no longer in this analysis." };
    }
    console.error("[content] keep_content_candidate failed", error);
    return { ok: false, error: "Could not save that word. Please try again." };
  }

  if (typeof data !== "string") {
    return { ok: false, error: "The database returned an unexpected result." };
  }
  return { ok: true, itemId: data };
}

/** Store enrichment results so a second view does not re-translate. */
export async function recordEnrichment(
  client: InsForgeClient,
  updates: ReadonlyArray<{
    candidateId: string;
    translation: string | null;
    gloss: string | null;
    state: "enriched" | "unavailable" | "failed";
    source: "ai" | null;
  }>,
): Promise<void> {
  for (const update of updates) {
    const { error } = await client.database
      .from("content_candidates")
      .update({
        translation: update.translation,
        gloss: update.gloss,
        enrichment_state: update.state,
        translation_source: update.source,
      })
      .eq("id", update.candidateId);

    if (error) {
      // Enrichment is best effort and must never fail the surrounding flow.
      console.error("[content] recording enrichment failed", error);
    }
  }
}
