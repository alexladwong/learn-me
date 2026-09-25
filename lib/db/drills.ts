import type { InsForgeClient } from "@insforge/sdk";
import { dbError, parsers } from "@/lib/db/parse";
import { listConfusionPatterns, type ConfusionPattern } from "@/lib/db/confusions";
import {
  buildConfusionDrill,
  canBuildDrill,
  containsForm,
  type Drill,
  type DrillItem,
} from "@/lib/learning/drill";

const { isRecord, optionalString } = parsers;

/**
 * Resolving a confusion pattern into drill material.
 *
 * The drill *builder* is pure and lives in `lib/learning/drill.ts`. This module
 * finds the real vocabulary to feed it: sentences the learner is actually
 * studying that contain the form they keep getting wrong.
 *
 * Reading from the learner's own bank rather than the whole curriculum is
 * deliberate. Being drilled on a sentence you have never chosen to learn is how
 * this feature would become homework.
 */

/** How many candidate items to look at before filtering. */
const ITEM_SCAN_LIMIT = 120;

/** Ceiling on items handed to the builder. */
const MAX_DRILL_ITEMS = 12;

export type DrillMaterial = {
  pattern: ConfusionPattern;
  /** Null when the available material cannot support a drill. */
  drill: Drill | null;
  /** Why the drill could not be built, when `drill` is null. */
  unavailableReason: string | null;
  /** Every tabulated form of the lemma, for the reference table. */
  paradigm: Array<{ form: string; gloss: string; person: string }>;
};

/**
 * Find the confusion pattern behind a fingerprint.
 *
 * Reuses `listConfusionPatterns` rather than querying `practice_events` again, so
 * the drill and the screen that advertised it can never disagree about how many
 * times the learner got it wrong.
 */
export async function findPattern(
  client: InsForgeClient,
  languageCode: string,
  fingerprint: string,
): Promise<ConfusionPattern | null> {
  const patterns = await listConfusionPatterns(client, languageCode, { limit: 50 });
  return patterns.find((pattern) => pattern.fingerprint === fingerprint) ?? null;
}

/**
 * Load everything needed to present a drill for one pattern.
 *
 * Returns a `drill: null` with a reason instead of padding with filler when the
 * material is insufficient — the UI then says "practise these in review", which
 * is true, rather than presenting four questions about nothing.
 */
export async function loadDrillMaterial(
  client: InsForgeClient,
  languageCode: string,
  fingerprint: string,
): Promise<DrillMaterial | null> {
  const pattern = await findPattern(client, languageCode, fingerprint);
  if (!pattern) return null;

  const expectedForm = pattern.expectedForm;

  if (!expectedForm) {
    return {
      pattern,
      drill: null,
      unavailableReason:
        "This pattern does not have a single correct form to practise against, so it stays in your normal review queue.",
      paradigm: [],
    };
  }

  const items = await findItemsContaining(client, languageCode, expectedForm);

  if (
    !canBuildDrill({
      expectedForm,
      producedForms: pattern.producedForms,
      itemCount: items.length,
    })
  ) {
    return {
      pattern,
      drill: null,
      unavailableReason:
        items.length < 3
          ? `A drill needs at least three sentences containing “${expectedForm}”. You have ${items.length}. Save a few more from a lesson or from text you bring in, and a drill will appear here.`
          : `There is nothing to contrast “${expectedForm}” against yet.`,
      paradigm: [],
    };
  }

  const drill = buildConfusionDrill({
    languageCode,
    fingerprint,
    errorType: pattern.errorType,
    expectedForm,
    producedForms: pattern.producedForms,
    items,
    attempts: pattern.examples.map((example) => ({
      produced: example.produced ?? "",
      expected: example.expected,
    })),
  });

  return {
    pattern,
    drill,
    unavailableReason: drill
      ? null
      : "This pattern cannot be turned into a drill yet.",
    paradigm: [],
  };
}

/**
 * Sentences from the learner's bank that contain the form as a whole word.
 *
 * The database does a bounded, case-insensitive substring `ilike` on the form as
 * written, and `containsForm` then applies the exact folded whole-word rule.
 * The two differ on accents on purpose: `ilike` is not accent-insensitive, so
 * searching the folded form finds nothing in accented text (see below). Doing
 * the precise match in SQL is not possible either — Postgres's `\y` boundary is
 * no better than JavaScript's `\b` here, and a regex per row would be slower
 * than filtering a bounded result.
 */
export async function findItemsContaining(
  client: InsForgeClient,
  languageCode: string,
  form: string,
): Promise<DrillItem[]> {
  const folded = fold(form);
  if (!folded) return [];

  // The net has to search the form *as written*, not its folded key. Folding is
  // for comparison — it strips accents, so `comí` folds to `comi`, and a `%comi%`
  // pattern matches none of the text a learner actually sees ("Comí con mi
  // familia"). The prefilter therefore returned nothing for every accented
  // form, which is most of Spanish and French, so no drill could ever be built
  // even when the pattern, the paradigm and the sentences were all present.
  //
  // Case-insensitivity is all this needs; `containsForm` below still applies the
  // real folding rule, so the coarse net only has to avoid false *negatives*.
  const needle = form.trim();
  if (!needle) return [];

  const { data, error } = await client.database
    .from("saved_items")
    .select("item_id,items!inner(surface,translation_natural,retired_at)")
    .eq("language_code", languageCode)
    .is("archived_at", null)
    .ilike("items.surface", `%${needle}%`)
    .limit(ITEM_SCAN_LIMIT);

  if (error) throw dbError("saved_items", error);
  if (!Array.isArray(data)) return [];

  const items: DrillItem[] = [];

  for (const row of data) {
    if (!isRecord(row)) continue;
    const item = row.items;
    if (!isRecord(item)) continue;
    if (item.retired_at) continue;

    const itemId = optionalString(row, "item_id");
    const surface = optionalString(item, "surface");
    const translation = optionalString(item, "translation_natural");
    if (!itemId || !surface || !translation) continue;

    // The exact rule, shared with the blanker so a sentence cannot pass this
    // filter and then fail to blank.
    if (!containsForm(surface, form)) continue;

    items.push({ itemId, surface, translation, targetForm: form });
  }

  // Deterministic order: shortest first, so the drill opens on the sentence a
  // learner is most likely to hold in their head.
  return items
    .sort(
      (a, b) =>
        a.surface.length - b.surface.length || a.itemId.localeCompare(b.itemId),
    )
    .slice(0, MAX_DRILL_ITEMS);
}

/**
 * Record a completed drill.
 *
 * Writes one `practice_event` per graded answer, which means a drill feeds the
 * same confusion engine that suggested it: getting the form right repeatedly
 * raises its accuracy, and the pattern stops being reported once the learner has
 * clearly stopped making the mistake.
 *
 * `mode` is `checkpoint` because `practice_events.mode` has a check constraint
 * and a drill is neither a lesson step nor a conversation.
 */
export async function recordDrillOutcome(
  client: InsForgeClient,
  userId: string,
  languageCode: string,
  input: {
    fingerprint: string;
    expectedForm: string;
    answers: ReadonlyArray<{ prompt: string; produced: string; isCorrect: boolean }>;
  },
): Promise<number> {
  if (input.answers.length === 0) return 0;

  const { error } = await client.database.from("practice_events").insert(
    input.answers.map((answer) => ({
      user_id: userId,
      language_code: languageCode,
      mode: "checkpoint",
      is_correct: answer.isCorrect,
      expected: input.expectedForm,
      produced: answer.produced.slice(0, 500),
      error_type: answer.isCorrect ? "none" : "conjugation",
      // Carrying the pattern forward is what lets the engine see the fix.
      fingerprint: answer.isCorrect ? null : input.fingerprint,
      context: { drill: true, prompt: answer.prompt.slice(0, 300) },
    })),
  );

  if (error) throw dbError("practice_events.insert", error);
  return input.answers.length;
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
