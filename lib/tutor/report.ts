/**
 * Conversation reports.
 *
 * The brief asks for a report with grammar, vocabulary, fluency and
 * pronunciation percentages, the mistakes to review, and the new words. Most of
 * that requires a model to judge, and this build has no provider — so the report
 * distinguishes carefully between the two kinds of number:
 *
 *   - **Measured** from the learner's own turns: how much they produced, how
 *     varied their vocabulary was, whether they reused the phrases the scenario
 *     offered. These are facts about text and are computed here, with the sample
 *     size attached.
 *
 *   - **Judged** by a tutor: whether a sentence was grammatical, what a word
 *     means, how a correction should be phrased. These are `null` without a
 *     provider, and the report says which evidence is missing rather than
 *     showing a neutral 0.5 that would read as "you are average".
 *
 * That split is the whole design. A report is the artefact a learner judges the
 * product by, and a made-up number here poisons everything else on screen.
 *
 * Pure functions: no database, no network, so the arithmetic is testable.
 */

import type { CefrLevel } from "@/lib/types";

export type LearnerTurn = {
  index: number;
  content: string;
  /** Milliseconds the learner took, when recorded. Null when unknown. */
  latencyMs?: number | null;
};

export type ConversationCorrection = {
  kind:
    | "grammar"
    | "vocabulary"
    | "word_order"
    | "register"
    | "spelling"
    | "pronunciation"
    | "other";
  original: string;
  correction: string;
  explanation: string | null;
};

export type MeasuredMetrics = {
  /** Learner utterances that contained at least one word. */
  utterances: number;
  totalWords: number;
  /** Mean words per utterance, or null when nothing was said. */
  meanWordsPerUtterance: number | null;
  /** Longest single utterance, in words. */
  longestUtterance: number;
  /** Distinct content words divided by total content words, 0..1. */
  vocabularyVariety: number | null;
  /** Distinct content words. The count behind `vocabularyVariety`. */
  distinctContentWords: number;
  /** How many of the scenario's suggested phrases the learner actually used. */
  usefulPhrasesUsed: string[];
  /** Phrases offered but not used — a fair target for next time. */
  usefulPhrasesMissed: string[];
  /**
   * 0..1 measure of how much the learner produced relative to what their level
   * can manage. Null when there were no utterances to measure.
   *
   * This is deliberately *not* called fluency. It counts length, not ease, and
   * calls itself what it is: `productionScore`.
   */
  productionScore: number | null;
};

/**
 * Words that carry no meaning for a variety measure.
 *
 * English function words. The learner's target language is not known here, so
 * this measure is a rough proxy — which is acceptable because it is reported as
 * `vocabularyVariety` with its sample size, not as "vocabulary: 86%".
 */
const FUNCTION_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at", "by",
  "for", "with", "from", "is", "are", "was", "were", "be", "been", "am", "i",
  "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their", "this", "that", "not", "no", "so",
]);

/** Target words per utterance for a level, used only for `productionScore`. */
const TARGET_WORDS_PER_UTTERANCE: Record<CefrLevel, number> = {
  A1: 4,
  A2: 7,
  B1: 11,
  B2: 15,
  C1: 19,
  C2: 23,
};

function words(text: string): string[] {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .match(/[\p{L}\p{M}\d'’-]+/gu) ?? []
  );
}

function contentWords(text: string): string[] {
  return words(text).filter(
    (word) => word.length > 2 && !FUNCTION_WORDS.has(word),
  );
}

/**
 * Measure what the learner actually produced.
 *
 * Every figure is derived from their text, and the sample size travels with each
 * one. `usefulPhrasesUsed` compares against the scenario's own suggestions, which
 * makes it a real signal: a learner who was offered "I would like…" and never
 * used it has a concrete thing to practise.
 */
export function measureLearnerOutput(
  turns: readonly LearnerTurn[],
  options: { level: CefrLevel; usefulPhrases?: readonly string[] },
): MeasuredMetrics {
  const usable = turns.filter((turn) => words(turn.content).length > 0);

  if (usable.length === 0) {
    return {
      utterances: 0,
      totalWords: 0,
      meanWordsPerUtterance: null,
      longestUtterance: 0,
      vocabularyVariety: null,
      distinctContentWords: 0,
      usefulPhrasesUsed: [],
      usefulPhrasesMissed: [...(options.usefulPhrases ?? [])],
      productionScore: null,
    };
  }

  const lengths = usable.map((turn) => words(turn.content).length);
  const totalWords = lengths.reduce((sum, length) => sum + length, 0);
  const mean = totalWords / usable.length;

  const allContent = usable.flatMap((turn) => contentWords(turn.content));
  const distinct = new Set(allContent);

  // Variety is defined only once there is enough text for it to mean something.
  // Below ~20 content words the figure swings wildly with one repeated word.
  const vocabularyVariety =
    allContent.length >= 20 ? distinct.size / allContent.length : null;

  const phrases = options.usefulPhrases ?? [];
  const combined = usable.map((turn) => turn.content.toLowerCase()).join(" \n ");

  const used: string[] = [];
  const missed: string[] = [];
  for (const phrase of phrases) {
    // Compare on the leading words of the phrase, so "I would like…" matches
    // however the learner finished it.
    const stem = words(phrase).slice(0, 3).join(" ");
    if (stem && combined.includes(stem)) used.push(phrase);
    else missed.push(phrase);
  }

  const target = TARGET_WORDS_PER_UTTERANCE[options.level];
  const productionScore = clamp01(mean / Math.max(1, target));

  return {
    utterances: usable.length,
    totalWords,
    meanWordsPerUtterance: round(mean, 1),
    longestUtterance: Math.max(...lengths),
    vocabularyVariety:
      vocabularyVariety === null ? null : round(vocabularyVariety, 3),
    distinctContentWords: distinct.size,
    usefulPhrasesUsed: used,
    usefulPhrasesMissed: missed,
    productionScore: round(productionScore, 3),
  };
}

export type ReportInput = {
  level: CefrLevel;
  learnerTurns: readonly LearnerTurn[];
  usefulPhrases?: readonly string[];
  /** Judged by the tutor. Absent without a provider, and reported as such. */
  judged?: {
    grammarScore: number | null;
    vocabularyScore: number | null;
    grammarSamples: number;
    vocabularySamples: number;
    corrections: readonly ConversationCorrection[];
    newWords: readonly { surface: string; translation: string | null; context: string | null }[];
    grammarPatterns: readonly { pattern: string; example: string }[];
    summary: string | null;
    model: string | null;
  } | null;
};

export type ConversationReport = {
  /** Measured figures, always present. */
  measured: MeasuredMetrics;
  /** Judged figures, or null with a reason when no provider ran. */
  judged: ReportInput["judged"];
  /** True when the report contains no judged scores. */
  measuredOnly: boolean;
  /** What a provider would add, for the UI to state plainly. */
  missingEvidence: string[];
  /** Headline sentences the report can honestly make. */
  highlights: string[];
  /** Corrections, deduplicated by what was corrected. */
  mistakes: ConversationCorrection[];
  /** New words worth keeping, deduplicated. */
  newWords: { surface: string; translation: string | null; context: string | null }[];
};

/**
 * Assemble the report.
 *
 * The `missingEvidence` list is built from what is actually absent rather than
 * being a fixed disclaimer: if a provider ran and scored grammar but not
 * pronunciation, only pronunciation is listed as missing.
 */
export function buildReport(input: ReportInput): ConversationReport {
  const measured = measureLearnerOutput(input.learnerTurns, {
    level: input.level,
    usefulPhrases: input.usefulPhrases,
  });

  const judged = input.judged ?? null;
  const missingEvidence: string[] = [];

  if (!judged) {
    missingEvidence.push(
      "Grammar and vocabulary were not scored: no AI provider is configured, so nothing could judge the sentences.",
    );
    missingEvidence.push(
      "Pronunciation was not scored: no speech-analysis provider is connected.",
    );
  } else {
    if (judged.grammarScore === null) {
      missingEvidence.push(
        `Grammar was not scored — only ${judged.grammarSamples} sentences were judged, which is too few to state a figure.`,
      );
    }
    if (judged.vocabularyScore === null) {
      missingEvidence.push(
        `Vocabulary was not scored — only ${judged.vocabularySamples} utterances were judged.`,
      );
    }
    missingEvidence.push(
      "Pronunciation was not scored: no speech-analysis provider is connected.",
    );
  }

  return {
    measured,
    judged,
    measuredOnly: judged === null,
    missingEvidence,
    highlights: buildHighlights(measured, input.level),
    mistakes: dedupeCorrections(judged?.corrections ?? []),
    newWords: dedupeNewWords(judged?.newWords ?? []),
  };
}

/**
 * Sentences the report can honestly state.
 *
 * Each is built from a measured figure. When there is nothing worth saying, the
 * list is empty and the UI shows the measurements without commentary — better
 * than filler praise, which is the thing that makes this kind of screen
 * meaningless.
 */
function buildHighlights(measured: MeasuredMetrics, level: CefrLevel): string[] {
  const highlights: string[] = [];

  if (measured.utterances === 0) return highlights;

  highlights.push(
    `You said ${measured.utterances} thing${measured.utterances === 1 ? "" : "s"}, ${measured.totalWords} words in total.`,
  );

  if (measured.meanWordsPerUtterance !== null) {
    const target = TARGET_WORDS_PER_UTTERANCE[level];
    if (measured.meanWordsPerUtterance >= target) {
      highlights.push(
        `Your average answer was ${measured.meanWordsPerUtterance} words — at or above the ${target} expected at ${level}.`,
      );
    } else {
      highlights.push(
        `Your average answer was ${measured.meanWordsPerUtterance} words. Stretching towards ${target} would be a fair goal at ${level}.`,
      );
    }
  }

  if (measured.usefulPhrasesUsed.length > 0) {
    highlights.push(
      `You used ${measured.usefulPhrasesUsed.length} of the suggested phrases, including “${measured.usefulPhrasesUsed[0]}”.`,
    );
  }

  if (measured.vocabularyVariety !== null && measured.vocabularyVariety < 0.6) {
    highlights.push(
      `You reused vocabulary a lot — ${measured.distinctContentWords} different words across ${measured.totalWords} words.`,
    );
  }

  return highlights;
}

/**
 * One correction per distinct mistake.
 *
 * A learner who makes the same error four times should see it once, or the report
 * reads as a list of failures rather than a short list of things to fix.
 */
export function dedupeCorrections(
  corrections: readonly ConversationCorrection[],
): ConversationCorrection[] {
  const seen = new Map<string, ConversationCorrection>();

  for (const correction of corrections) {
    const key = `${correction.kind}:${correction.original.toLowerCase()}->${correction.correction.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, correction);
  }

  return [...seen.values()];
}

export function dedupeNewWords(
  wordsList: readonly { surface: string; translation: string | null; context: string | null }[],
): { surface: string; translation: string | null; context: string | null }[] {
  const seen = new Map<string, { surface: string; translation: string | null; context: string | null }>();

  for (const entry of wordsList) {
    const key = entry.surface.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.set(key, entry);
  }

  return [...seen.values()];
}

/**
 * Whether a report is worth showing a score for.
 *
 * A single utterance can produce a production score of 1.0, which would look like
 * a perfect session. Reports with too little material for a percentage say so
 * instead of showing one.
 */
export const MIN_UTTERANCES_FOR_SCORE = 3;

export function hasEnoughForScore(measured: MeasuredMetrics): boolean {
  return measured.utterances >= MIN_UTTERANCES_FOR_SCORE;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
