/**
 * Pure helpers for grading and presenting a review card.
 *
 * Kept out of the route folder so they live with the rest of the learning logic
 * and can be unit-tested without a DOM — the component around them is
 * presentation, these are the parts that can be *wrong*.
 */

/**
 * Case-, accent- and punctuation-insensitive comparison of a typed answer.
 *
 * Accents are ignored deliberately: on a phone keyboard, missing an accent is a
 * keyboard limitation far more often than it is a knowledge gap, and marking it
 * wrong would teach the learner to distrust the app. Accent *errors* are still
 * recorded for the pronunciation and spelling signals elsewhere.
 */
export function equalsLoose(a: string, b: string): boolean {
  return normaliseAnswer(a) === normaliseAnswer(b);
}

export function normaliseAnswer(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:"'()«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build multiple-choice options: the correct answer plus up to three
 * distractors drawn from the learner's own queue.
 *
 * The shuffle is seeded by the answer text rather than by `Math.random()`. Two
 * reasons: re-rendering must not reorder the buttons under the learner's cursor,
 * and a card should present its options in the same order every time it comes up
 * so that recognition is based on the content rather than on position.
 */
export function buildOptions(correct: string, pool: readonly string[]): string[] {
  const seen = new Set<string>([correct]);
  const distractors: string[] = [];

  for (const candidate of pool) {
    if (distractors.length >= 3) break;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    distractors.push(candidate);
  }

  const options = [correct, ...distractors];

  let seed = 0;
  for (const character of correct) {
    seed = (seed * 31 + character.charCodeAt(0)) % 9973;
  }

  for (let i = options.length - 1; i > 0; i -= 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    const left = options[i] as string;
    const right = options[j] as string;
    options[i] = right;
    options[j] = left;
  }

  return options;
}

/**
 * How a card should be answered.
 *
 * One or two words can be produced from memory by typing, which gives us a
 * machine-gradable answer and therefore real error data for the confusion
 * engine. A full sentence is a different skill: typing it mostly measures
 * typing, so it is presented for recognition and self-graded.
 */
export type AnswerMode = "recall" | "recognise";

export function answerModeFor(surface: string): AnswerMode {
  const words = surface.trim().split(/\s+/).filter(Boolean).length;
  return words <= 2 ? "recall" : "recognise";
}

/** Human-readable "when is this due" for a scheduled card. */
export function formatDue(iso: string, now: number = Date.now()): string {
  const dueMs = new Date(iso).getTime();
  if (!Number.isFinite(dueMs)) return "at an unknown time";

  const diffDays = (dueMs - now) / (24 * 60 * 60 * 1000);

  if (diffDays <= 0) return "now";
  if (diffDays < 1) {
    const minutes = Math.max(1, Math.round(diffDays * 24 * 60));
    return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  if (diffDays < 2) return "tomorrow";
  return `in ${Math.round(diffDays)} days`;
}
