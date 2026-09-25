import type { InsForgeClient } from "@insforge/sdk";
import { dbError, parsers } from "@/lib/db/parse";
import { describeContrast, lookupForm } from "@/lib/learning/paradigms";

const { isRecord, optionalString } = parsers;

/**
 * The confusion engine's read side.
 *
 * `practice_events` records every wrong answer with a normalised fingerprint
 * (`lib/learning/fingerprint.ts`). This module turns those rows into something
 * the learner can act on: "you keep mixing up *como* and *comes*", with the real
 * examples that produced the claim.
 *
 * The threshold and the evidence display are the two things that make this
 * trustworthy rather than annoying:
 *
 *   - nothing is reported below `MIN_OCCURRENCES`, so a single slip never
 *     becomes "your weakness"
 *   - every claim carries the learner's own attempts, so they can check it
 *     against their memory instead of taking the app's word for it
 */

/** A pattern needs this many errors before it is worth mentioning. */
export const MIN_OCCURRENCES = 3;

/** Only errors this recent count. A fixed weakness should fade if fixed. */
const WINDOW_DAYS = 21;

/**
 * Consecutive correct answers *after* the last mistake that retire a pattern.
 *
 * Without this, a pattern would be reported forever: the historical errors stay
 * in the table, so a learner who fixed the mistake a month ago would keep being
 * told about it. Five in a row is a deliberate floor — enough that a lucky guess
 * does not count, few enough that the fix is acknowledged promptly.
 */
export const RESOLUTION_STREAK = 5;

export type ConfusionExample = {
  expected: string | null;
  produced: string | null;
  createdAt: string;
  mode: string;
};

export type ConfusionPattern = {
  fingerprint: string;
  errorType: string;
  lemma: string | null;
  occurrences: number;
  /** How many distinct days the errors span — repeated on one day is weaker. */
  distinctDays: number;
  lastSeenAt: string;
  /**
   * Correct answers on this pattern since the most recent mistake.
   *
   * The evidence that the learner has fixed it. `wasResolved` is true once this
   * reaches `RESOLUTION_STREAK`.
   */
  correctStreak: number;
  /** True when the learner has clearly stopped making this mistake. */
  wasResolved: boolean;
  examples: ConfusionExample[];
  /**
   * A plain-language explanation of the confusion, built from the paradigm
   * table. Null when the forms are not tabulated, in which case the UI states
   * the weaker but still true fact.
   */
  explanation: string | null;
  /** Distinct produced forms, newest first, so a drill can contrast them. */
  producedForms: string[];
  /** The form that keeps being expected. */
  expectedForm: string | null;
  /** Where the learner can practise this. */
  drillHref: string;
  /** The mission or text the errors came from, when recorded. */
  contextLabel: string | null;
};

const ERROR_TYPES = [
  "conjugation",
  "gender",
  "word_order",
  "vocabulary",
  "tense",
  "preposition",
  "pronunciation",
  "spelling",
  "register",
] as const;

function parseExample(row: unknown): ConfusionExample | null {
  if (!isRecord(row)) return null;
  const createdAt = optionalString(row, "created_at");
  if (!createdAt) return null;

  return {
    expected: optionalString(row, "expected"),
    produced: optionalString(row, "produced"),
    createdAt,
    mode: optionalString(row, "mode") ?? "recall",
  };
}

/**
 * Group the learner's recent errors into patterns worth acting on.
 *
 * Ordering is by evidence strength: more occurrences first, and among equal
 * counts the one spread over more days — because the same mistake on five
 * different days is a real gap, while five in one sitting may just have been a
 * bad session.
 */
export async function listConfusionPatterns(
  client: InsForgeClient,
  languageCode: string,
  options: { limit?: number; minOccurrences?: number } = {},
): Promise<ConfusionPattern[]> {
  const { limit = 5, minOccurrences = MIN_OCCURRENCES } = options;

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Bounded and columns-named: this runs on the dashboard, so it must not pull a
  // learner's whole error history to find five patterns.
  // Two bounded reads rather than one: a mistake is tagged with a fingerprint,
  // while a success deliberately has `fingerprint: null` (it is not an error).
  // The streak therefore has to be derived from correct answers whose expected
  // text matches the pattern's.
  const [errors, successes] = await Promise.all([
    client.database
      .from("practice_events")
      .select("fingerprint,error_type,expected,produced,mode,context,created_at")
      .eq("language_code", languageCode)
      .eq("is_correct", false)
      .not("fingerprint", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
    client.database
      .from("practice_events")
      .select("expected,created_at")
      .eq("language_code", languageCode)
      .eq("is_correct", true)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (errors.error) throw dbError("practice_events", errors.error);
  if (successes.error) throw dbError("practice_events", successes.error);

  const data = errors.data;
  if (!Array.isArray(data)) return [];

  type Bucket = {
    fingerprint: string;
    errorType: string;
    examples: ConfusionExample[];
    produced: Map<string, number>;
    expected: Map<string, number>;
    days: Set<string>;
    lastSeenAt: string;
    contexts: Map<string, number>;
  };

  const buckets = new Map<string, Bucket>();

  for (const row of data) {
    if (!isRecord(row)) continue;
    const fingerprint = optionalString(row, "fingerprint");
    if (!fingerprint) continue;

    const example = parseExample(row);
    if (!example) continue;

    let bucket = buckets.get(fingerprint);
    if (!bucket) {
      bucket = {
        fingerprint,
        errorType: optionalString(row, "error_type") ?? "vocabulary",
        examples: [],
        produced: new Map(),
        expected: new Map(),
        days: new Set(),
        lastSeenAt: example.createdAt,
        contexts: new Map(),
      };
      buckets.set(fingerprint, bucket);
    }

    // Cap stored examples per pattern: the UI shows a handful, and holding 200
    // strings per group would make this read heavy for no benefit.
    if (bucket.examples.length < 6) bucket.examples.push(example);

    if (example.produced) {
      bucket.produced.set(example.produced, (bucket.produced.get(example.produced) ?? 0) + 1);
    }
    if (example.expected) {
      bucket.expected.set(example.expected, (bucket.expected.get(example.expected) ?? 0) + 1);
    }

    bucket.days.add(example.createdAt.slice(0, 10));
    if (example.createdAt > bucket.lastSeenAt) bucket.lastSeenAt = example.createdAt;

    const context = row.context;
    if (isRecord(context)) {
      const missionId = optionalString(context, "missionId");
      if (missionId) {
        bucket.contexts.set(missionId, (bucket.contexts.get(missionId) ?? 0) + 1);
      }
    }
  }

  // Correct answers keyed by the form they tested, newest first.
  const correctByForm = new Map<string, string[]>();
  for (const row of Array.isArray(successes.data) ? successes.data : []) {
    if (!isRecord(row)) continue;
    const expected = optionalString(row, "expected");
    const createdAt = optionalString(row, "created_at");
    if (!expected || !createdAt) continue;
    const key = expected.toLowerCase();
    const list = correctByForm.get(key) ?? [];
    list.push(createdAt);
    correctByForm.set(key, list);
  }

  const patterns: ConfusionPattern[] = [];

  for (const bucket of buckets.values()) {
    const occurrences = [...bucket.produced.values()].reduce((sum, n) => sum + n, 0);
    if (occurrences < minOccurrences) continue;

    const expectedForm = mostCommon(bucket.expected);
    const producedForms = [...bucket.produced.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([form]) => form);

    const lemma = lemmaFrom(bucket.fingerprint, languageCode);
    const explanation =
      lemma && expectedForm && producedForms[0]
        ? describeContrast(languageCode, lemma, expectedForm, producedForms[0])
        : null;

    // Count correct answers on the expected form that came *after* the last
    // mistake. Anything before it is not evidence of a fix.
    const correctStreak = expectedForm
      ? (correctByForm.get(expectedForm.toLowerCase()) ?? []).filter(
          (createdAt) => createdAt > bucket.lastSeenAt,
        ).length
      : 0;

    patterns.push({
      fingerprint: bucket.fingerprint,
      errorType: normaliseErrorType(bucket.errorType),
      lemma,
      occurrences,
      distinctDays: bucket.days.size,
      lastSeenAt: bucket.lastSeenAt,
      correctStreak,
      wasResolved: correctStreak >= RESOLUTION_STREAK,
      examples: bucket.examples,
      explanation,
      producedForms,
      expectedForm,
      drillHref: `/${languageCode}/drill/${encodeURIComponent(bucket.fingerprint)}`,
      contextLabel: null,
    });
  }

  return patterns
    // A resolved pattern is no longer something the learner "keeps getting
    // wrong", so it is not reported. It stays in the data for history.
    .filter((pattern) => !pattern.wasResolved)
    .sort(
      (a, b) =>
        b.occurrences - a.occurrences ||
        b.distinctDays - a.distinctDays ||
        b.lastSeenAt.localeCompare(a.lastSeenAt),
    )
    .slice(0, limit);
}

function mostCommon(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * The lemma behind a fingerprint, resolved through the paradigm table.
 *
 * A conjugation fingerprint carries the *normalised form* the learner should have
 * produced — `comí` is stored as `conjugation:comi` — not the infinitive. Taking
 * the tail at face value therefore asks the paradigm table about a lemma called
 * "comi", which does not exist, so `describeContrast` returned null and every
 * conjugation pattern lost its explanation: the drill could state the two forms
 * but never say what the difference between them was.
 *
 * `lookupForm` maps a written form back to the lemma that owns it (`comi` ->
 * `comer`). It returns null for a form belonging to more than one lemma — `fui`
 * is both *ser* and *ir* — and in that case the tail is kept, because a null
 * lemma would only degrade the wording, never the correctness of the count.
 */
function lemmaFrom(fingerprint: string, languageCode: string): string | null {
  const [, tail] = fingerprint.split(":", 2);
  if (!tail) return null;
  // Vocabulary fingerprints carry "expected->produced"; only the head is useful.
  const [head] = tail.split("->", 1);
  if (!head) return null;

  return lookupForm(languageCode, head)?.lemma ?? head;
}

function normaliseErrorType(value: string): string {
  return (ERROR_TYPES as readonly string[]).includes(value) ? value : "vocabulary";
}

/** A one-line, plain-language statement of a pattern. */
export function describePattern(pattern: ConfusionPattern): string {
  const produced = pattern.producedForms[0];
  const expected = pattern.expectedForm;

  if (pattern.errorType === "conjugation" && expected && produced) {
    return `You wrote “${produced}” where the answer was “${expected}” ${pattern.occurrences} times.`;
  }
  if (pattern.errorType === "gender" && expected) {
    return `You keep getting the gender of “${expected}” wrong — ${pattern.occurrences} times.`;
  }
  if (pattern.errorType === "word_order") {
    return `Word order keeps slipping — ${pattern.occurrences} times, usually in longer sentences.`;
  }
  if (pattern.errorType === "preposition" && expected) {
    return `You reached for the wrong preposition instead of “${expected}” ${pattern.occurrences} times.`;
  }
  if (expected && produced) {
    return `You answered “${produced}” instead of “${expected}” ${pattern.occurrences} times.`;
  }
  return `${pattern.occurrences} repeated mistakes of the same kind.`;
}

/**
 * Label a single produced form for a drill, using the paradigm table.
 *
 * Returns null when the form is not tabulated, so the caller shows the raw text
 * rather than a made-up person and tense.
 */
export function labelProducedForm(
  languageCode: string,
  form: string,
): { gloss: string; person: string } | null {
  const match = lookupForm(languageCode, form);
  if (!match) return null;
  return { gloss: match.label.gloss, person: match.label.person };
}
