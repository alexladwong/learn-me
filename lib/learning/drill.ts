/**
 * Confusion drill construction.
 *
 * `lib/db/confusions.ts` can say *what* a learner keeps getting wrong. This turns
 * that finding into exercises that fix it. It is the consumer the confusion
 * engine existed for: without it, the app could tell you your weakness and then
 * do nothing about it.
 *
 * Pure functions only — no database, no clock, no randomness. Every generator
 * decision is therefore testable, which matters because a drill built from the
 * *wrong* contrast would actively teach the mistake it is meant to correct.
 *
 * Two content rules:
 *
 *   1. A drill never invents a prompt. Every item comes from the learner's own
 *      saved vocabulary or the curriculum, so the words being tested are words
 *      they are actually studying.
 *   2. When there is not enough material for a real drill, the builder returns
 *      `null` rather than padding with filler. "Practise these in review" is a
 *      better answer than four questions about nothing.
 */

// Relative import, not the `@/` alias: `lib/learning/*` is the unit-tested core and
// must load under Node's bare test runner, which does not read tsconfig paths.
import { describeContrast, lookupForm, paradigmFor } from "./paradigms.ts";

/** How many items a drill needs before it is worth presenting. */
export const MIN_DRILL_ITEMS = 3;

/** Ceiling on drill length: long drills get abandoned. */
export const MAX_DRILL_STEPS = 14;

export type DrillForm = {
  /** As written in the material. */
  form: string;
  /** Folding key, for matching. */
  key: string;
  /** A short meaning, when known. */
  gloss: string | null;
  /** The person/tense label, when the paradigm table knows it. */
  label: string | null;
  /** True for the form the learner should have produced. */
  isExpected: boolean;
  /** How many times the learner produced this form by mistake. */
  mistakeCount: number;
};

export type DrillItem = {
  itemId: string;
  /** The sentence the learner will be tested on. */
  surface: string;
  translation: string;
  /** The form inside `surface` that the drill is about. */
  targetForm: string;
};

export type DrillStep =
  | {
      kind: "teach";
      id: string;
      /** The contrast statement, in plain language. */
      headline: string;
      detail: string | null;
      forms: DrillForm[];
      /** The learner's own attempts, so the claim is checkable. */
      attempts: Array<{ produced: string; expected: string | null }>;
    }
  | {
      kind: "choose";
      id: string;
      prompt: string;
      /** What the learner is asked to supply. */
      instruction: string;
      options: string[];
      answer: string;
      /** Why the answer is right, shown after the attempt. */
      explanation: string | null;
    }
  | {
      kind: "produce";
      id: string;
      prompt: string;
      instruction: string;
      answer: string;
      explanation: string | null;
    }
  | {
      kind: "checkpoint";
      id: string;
      prompt: string;
      instruction: string;
      answer: string;
      explanation: string;
    };

export type Drill = {
  fingerprint: string;
  errorType: string;
  /** The lemma or pattern the drill is about. */
  subject: string;
  headline: string;
  forms: DrillForm[];
  steps: DrillStep[];
  /** Total answers that will be graded. */
  gradedSteps: number;
};

export type BuildDrillInput = {
  languageCode: string;
  fingerprint: string;
  errorType: string;
  /** The form the exercises expect. */
  expectedForm: string | null;
  /** Forms the learner produced instead, most frequent first. */
  producedForms: readonly string[];
  /** Items whose text contains the expected form. */
  items: readonly DrillItem[];
  /** Recent attempts, newest first, for the teach card. */
  attempts?: ReadonlyArray<{ produced: string; expected: string | null }>;
};

/**
 * Build an ordered drill for one confusion pattern.
 *
 * Returns `null` when the available material cannot support a real drill — most
 * often because no item actually contains the expected form, in which case there
 * is nothing honest to test.
 */
export function buildConfusionDrill(input: BuildDrillInput): Drill | null {
  const {
    languageCode,
    fingerprint,
    errorType,
    expectedForm,
    producedForms,
    items,
    attempts = [],
  } = input;

  if (!expectedForm) return null;

  const lemma = lemmaFromFingerprint(fingerprint, expectedForm);

  // ---- The contrast set ---------------------------------------------------
  // The expected form plus the forms the learner actually produced. Anything the
  // paradigm table can label is ordered by person, so the teach card reads as a
  // table rather than a list.
  const mistakeCounts = new Map<string, number>();
  for (const form of producedForms) {
    mistakeCounts.set(fold(form), (mistakeCounts.get(fold(form)) ?? 0) + 1);
  }

  const forms = buildForms(languageCode, expectedForm, producedForms, mistakeCounts);
  if (forms.length < 2) return null;

  const detail = lemma
    ? describeContrast(languageCode, lemma, expectedForm, producedForms[0] ?? "")
    : null;

  const headline =
    producedForms[0] !== undefined
      ? `You wrote “${producedForms[0]}” when the answer was “${expectedForm}”.`
      : `You need “${expectedForm}”.`;

  const steps: DrillStep[] = [
    {
      kind: "teach",
      id: `${fingerprint}:teach`,
      headline,
      detail,
      forms,
      attempts: attempts.slice(0, 5),
    },
  ];

  // ---- Practice items -----------------------------------------------------
  // Only items that actually contain the expected form are usable: a drill that
  // asked about a sentence without the target word would be testing something
  // else.
  const usable = items.filter((item) => containsForm(item.surface, expectedForm));
  if (usable.length < MIN_DRILL_ITEMS) return null;

  const distractors = forms
    .filter((form) => !form.isExpected)
    .map((form) => form.form)
    .slice(0, 3);

  // Cycle the step types so the learner has to both recognise and produce the
  // form. Recognition alone would not fix a production error.
  const cycle: Array<"choose" | "produce"> = ["choose", "produce", "choose", "produce"];

  for (const [index, item] of usable.entries()) {
    const type = cycle[index % cycle.length] ?? "choose";
    const instruction =
      type === "choose"
        ? "Choose the form that fits"
        : "Type the form that fits";

    const explanation = lemma
      ? describeContrast(languageCode, lemma, expectedForm, expectedForm)
      : null;

    if (type === "choose") {
      steps.push({
        kind: "choose",
        id: `${fingerprint}:choose:${item.itemId}`,
        prompt: blankOutForm(item.surface, expectedForm),
        instruction,
        // Deterministic order: the answer's position must not shift between two
        // renders of the same drill.
        options: orderOptions(expectedForm, distractors, item.itemId),
        answer: expectedForm,
        explanation,
      });
    } else {
      steps.push({
        kind: "produce",
        id: `${fingerprint}:produce:${item.itemId}`,
        prompt: blankOutForm(item.surface, expectedForm),
        instruction,
        answer: expectedForm,
        explanation,
      });
    }
  }

  // ---- Checkpoint ---------------------------------------------------------
  // Closes the drill on the sentence that caused the most trouble, with no
  // options to lean on.
  const worstItem = usable[0];
  if (worstItem) {
    steps.push({
      kind: "checkpoint",
      id: `${fingerprint}:checkpoint`,
      prompt: blankOutForm(worstItem.surface, expectedForm),
      instruction: "Last one, from memory",
      answer: expectedForm,
      explanation: worstItem.translation,
    });
  }

  return {
    fingerprint,
    errorType,
    subject: expectedForm,
    headline,
    forms,
    steps: steps.slice(0, MAX_DRILL_STEPS),
    gradedSteps: steps.filter((step) => step.kind !== "teach").length,
  };
}

/**
 * Assemble the contrast set, labelled where possible.
 *
 * Ordering: the expected form first, then the learner's mistakes by frequency.
 * A learner scanning the card sees what they should have said before what they
 * did say.
 */
function buildForms(
  languageCode: string,
  expectedForm: string,
  producedForms: readonly string[],
  mistakeCounts: ReadonlyMap<string, number>,
): DrillForm[] {
  const seen = new Set<string>([fold(expectedForm)]);
  const forms: DrillForm[] = [
    toDrillForm(languageCode, expectedForm, 0, true),
  ];

  for (const produced of producedForms) {
    const key = fold(produced);
    if (seen.has(key)) continue;
    seen.add(key);
    forms.push(toDrillForm(languageCode, produced, mistakeCounts.get(key) ?? 1, false));
  }

  return forms;
}

function toDrillForm(
  languageCode: string,
  form: string,
  mistakeCount: number,
  isExpected: boolean,
): DrillForm {
  const match = lookupForm(languageCode, form);
  return {
    form,
    key: fold(form),
    gloss: match?.label.gloss ?? null,
    label: match ? labelOf(languageCode, form) : null,
    isExpected,
    mistakeCount,
  };
}

/** A readable person/tense label, or null when the form is not tabulated. */
function labelOf(languageCode: string, form: string): string | null {
  const match = lookupForm(languageCode, form);
  if (!match) return null;
  return `${match.label.tense} · ${match.label.person}`;
}

/**
 * Replace the target form with a blank, keeping the rest of the sentence.
 *
 * Accent-, case- and diacritic-insensitive, so "Como arroz", "como arroz" and
 * "¿Cómo estás?" all blank correctly.
 *
 * Deliberately *not* using `\b`. JavaScript's word boundary is defined against
 * `\w`, which is ASCII-only even in Unicode mode, so `\bcomo\b` does not match
 * the "como" inside "Cómo" — a form the learner typed without its accent, which
 * is the common case this exists to handle. Explicit letter lookarounds do the
 * job correctly: `\p{L}` and `\p{M}` cover accented letters and combining marks.
 *
 * When the form is not present the sentence is returned unchanged rather than
 * mangled; the caller has already filtered for containment.
 */
export function blankOutForm(sentence: string, form: string): string {
  // Accent-fold the form, then make every character accent-tolerant so the
  // pattern matches the accented source text too.
  const folded = fold(form);
  const pattern = folded
    .split("")
    .map((character) => {
      const variants = ACCENT_VARIANTS[character];
      return variants ? `[${character}${variants}]` : escapeRegExp(character);
    })
    .join("");

  // Not part of a longer word on either side. `\p{L}`/`\p{M}` are Unicode-aware,
  // so "comodidad" cannot match while "Cómo" can.
  const regex = new RegExp(`(?<![\\p{L}\\p{M}])(?:${pattern})(?![\\p{L}\\p{M}])`, "iu");
  return sentence.replace(regex, "____");
}

/** Accent variants per base letter, for the languages this supports. */
const ACCENT_VARIANTS: Record<string, string> = {
  a: "áàâäã",
  e: "éèêë",
  i: "íìîï",
  o: "óòôöõ",
  u: "úùûü",
  n: "ñ",
  c: "ç",
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does this sentence contain the form as a whole word, ignoring case and accents?
 *
 * Shares `blankOutForm`'s rule exactly: if this returned true for a sentence the
 * blanker could not blank, the drill would ask a question with no blank in it.
 */
export function containsForm(sentence: string, form: string): boolean {
  const wanted = fold(form);
  // `exec` in a loop rather than `String.match`: the array element type from
  // `match` with a `/u` pattern and a `?? []` fallback widens to `never[]` under
  // this tsconfig, and a hand-rolled scan is clearer about the intent anyway.
  const matcher = /[\p{L}\p{M}\d'’-]+/gu;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(fold(sentence))) !== null) {
    if (match[0] === wanted) return true;
  }
  return false;
}

/**
 * Place the answer plus distractors in a stable order.
 *
 * Seeded by the item id rather than random: the same drill must present its
 * options identically on every visit, or a learner could pass by remembering
 * which button was second.
 */
export function orderOptions(
  answer: string,
  distractors: readonly string[],
  seed: string,
): string[] {
  // Annotated because `[string, ...string[]]` infers as `string[]` only with the
  // spread widened; without it TypeScript narrows the element type to `never`.
  const options: string[] = [
    answer,
    ...distractors.filter((value) => value !== answer),
  ];

  let state = 0;
  for (const character of seed) {
    state = (state * 31 + character.charCodeAt(0)) % 9973;
  }

  for (let i = options.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    const left = options[i] as string;
    const right = options[j] as string;
    options[i] = right;
    options[j] = left;
  }

  return options;
}

/** `conjugation:como` -> `como`; the tail is the lemma or the form. */
function lemmaFromFingerprint(fingerprint: string, fallback: string): string | null {
  const [, tail] = fingerprint.split(":", 2);
  if (!tail) return fallback;
  const [head] = tail.split("->", 1);
  return head && head.length > 0 ? head : fallback;
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Whether enough evidence exists to build a drill at all.
 *
 * Separate from `buildConfusionDrill` so the UI can decide whether to offer the
 * button before loading material.
 */
export function canBuildDrill(input: {
  expectedForm: string | null;
  producedForms: readonly string[];
  itemCount: number;
}): boolean {
  return (
    Boolean(input.expectedForm) &&
    input.producedForms.length > 0 &&
    input.itemCount >= MIN_DRILL_ITEMS
  );
}

/**
 * Every form of the lemma, for the "see all forms" reference on a drill.
 *
 * Returns an empty array when the verb is not tabulated, so the UI omits the
 * reference rather than showing a partial paradigm as if it were complete.
 */
export function referenceParadigm(
  languageCode: string,
  lemma: string,
): Array<{ form: string; gloss: string; person: string }> {
  return paradigmFor(languageCode, lemma).map((entry) => ({
    form: entry.form,
    gloss: entry.gloss,
    person: entry.person,
  }));
}
