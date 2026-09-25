import type { InsForgeClient } from "@insforge/sdk";
import { dbError, parsers } from "@/lib/db/parse";
import { SKILLS, type Skill } from "@/lib/types";

const { isRecord, optionalNumber, optionalString } = parsers;

/**
 * Language DNA: skill estimates derived from real activity.
 *
 * Two rules make this honest, and both are structural rather than editorial:
 *
 *   1. **Every estimate carries a confidence**, computed from how much evidence
 *      exists. Below `MIN_CONFIDENCE` the UI is forbidden from showing the
 *      number at all — because "Speaking 55%" built on two answers is a lie that
 *      the learner will catch the first time they try to speak.
 *
 *   2. **Nothing is invented.** Where a skill has no signal in this build
 *      (pronunciation needs a speech provider; grammar needs graded answers at
 *      volume), the estimate is `insufficient` and says which evidence is
 *      missing rather than showing a neutral 50%.
 *
 * The comparison the product actually promises — "your reading is ahead of your
 * speaking" — is therefore computed from rank order over *confident* estimates
 * only, never from raw numbers.
 */

/** Below this, an estimate is not shown as a percentage. */
export const MIN_CONFIDENCE = 0.35;

/** Evidence needed before a skill is considered well measured. */
const EVIDENCE_FOR_FULL_CONFIDENCE = 25;

export type SkillEstimate = {
  skill: Skill;
  /** 0..1, or null when there is not enough evidence to state one. */
  score: number | null;
  /** 0..1. Always present, even when `score` is null. */
  confidence: number;
  /** Number of observations behind the estimate. */
  sampleSize: number;
  /** What produced it, so the claim is checkable. */
  basis: string;
  /** What is missing, when the estimate is withheld. */
  missing: string | null;
};

export type LanguageDna = {
  languageCode: string;
  estimates: SkillEstimate[];
  /** Skills with enough confidence to compare, weakest first. */
  confident: SkillEstimate[];
  /**
   * The headline sentence, when the data supports one. Null otherwise — a
   * comparison requires at least two confident skills with a real gap.
   */
  observation: string | null;
  /** Suggested focus, derived from the same ordering. */
  recommendation: { skill: Skill; href: string; cta: string } | null;
  totalEvidence: number;
};

const SKILL_MISSING: Record<Skill, string> = {
  vocabulary: "Save a few items from a lesson or from text you bring in.",
  listening: "Listening exercises need audio, which no provider has generated yet.",
  speaking: "Recorded speaking practice is not built yet, so there is nothing to measure.",
  grammar: "Complete more lessons; grammar needs graded answers to compare.",
  reading: "Answer more comprehension questions in lessons.",
  pronunciation: "Pronunciation scoring needs a speech-analysis provider, which is not connected.",
};

type Signal = { correct: number; total: number; basis: string };

/**
 * Compute the learner's Language DNA.
 *
 * Bounded reads only: a mastery histogram for vocabulary, a window of practice
 * events, and the stats rollup. Nothing here scans a learner's full history.
 */
export async function computeLanguageDna(
  client: InsForgeClient,
  languageCode: string,
): Promise<LanguageDna> {
  const [mastery, practice, stats] = await Promise.all([
    readVocabularyMastery(client, languageCode),
    readPracticeSignals(client, languageCode),
    readStats(client, languageCode),
  ]);

  const estimates: SkillEstimate[] = [];

  // ---- Vocabulary ---------------------------------------------------------
  estimates.push(
    estimate({
      skill: "vocabulary",
      score: mastery.total > 0 ? mastery.meanMastery : null,
      sampleSize: mastery.total,
      basis: `${mastery.total} saved item${mastery.total === 1 ? "" : "s"}`,
    }),
  );

  // ---- Reading: comprehension on written prompts --------------------------
  const reading = practice.reading;
  estimates.push(
    estimate({
      skill: "reading",
      score: reading.total >= 5 ? reading.correct / reading.total : null,
      sampleSize: reading.total,
      basis: reading.basis,
    }),
  );

  // ---- Listening ----------------------------------------------------------
  const listening = practice.listening;
  estimates.push(
    estimate({
      skill: "listening",
      // Withheld entirely when there is no audio: an answer to a "listening"
      // exercise that showed the written form measured reading, not listening.
      score:
        listening.total >= 5 && practice.audioAvailable
          ? listening.correct / listening.total
          : null,
      sampleSize: practice.audioAvailable ? listening.total : 0,
      basis: practice.audioAvailable
        ? listening.basis
        : "No audio has been generated yet, so listening has not been tested.",
      missingOverride: practice.audioAvailable ? null : SKILL_MISSING.listening,
    }),
  );

  // ---- Grammar: graded answers that targeted a specific form --------------
  const grammar = practice.grammar;
  estimates.push(
    estimate({
      skill: "grammar",
      // Grammar is only meaningful on attempts that had a right answer *about a
      // form* — a conjugation or agreement question, not free vocabulary.
      score: grammar.total >= 8 ? grammar.correct / grammar.total : null,
      sampleSize: grammar.total,
      basis: grammar.basis,
    }),
  );

  // ---- Speaking -----------------------------------------------------------
  // Deliberately null, always, in this build: `speaking_seconds` would only be
  // driven by untested self-reports, and no speech analysis exists to score it.
  estimates.push(
    estimate({
      skill: "speaking",
      score: null,
      sampleSize: 0,
      basis: "No scored speaking signal exists yet.",
      missingOverride: SKILL_MISSING.speaking,
    }),
  );

  // ---- Pronunciation ------------------------------------------------------
  estimates.push(
    estimate({
      skill: "pronunciation",
      score: null,
      sampleSize: 0,
      basis: SKILL_MISSING.pronunciation,
      missingOverride: SKILL_MISSING.pronunciation,
    }),
  );

  const confident = estimates
    .filter((item) => item.score !== null && item.confidence >= MIN_CONFIDENCE)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  const { observation, recommendation } = buildObservation(languageCode, confident, stats);

  return {
    languageCode,
    estimates,
    confident,
    observation,
    recommendation,
    totalEvidence: estimates.reduce((sum, item) => sum + item.sampleSize, 0),
  };
}

/**
 * Build a skill estimate, or withhold the number.
 *
 * Confidence grows with sample size but saturates: the difference between 25 and
 * 250 observations does not matter to a learner, while the difference between 3
 * and 25 does.
 */
function estimate(input: {
  skill: Skill;
  score: number | null;
  sampleSize: number;
  basis: string;
  missingOverride?: string | null;
}): SkillEstimate {
  const sampleConfidence = clamp01(input.sampleSize / EVIDENCE_FOR_FULL_CONFIDENCE);
  const hasSignal = input.score !== null && Number.isFinite(input.score);

  return {
    skill: input.skill,
    score: hasSignal ? clamp01(input.score as number) : null,
    confidence: hasSignal ? sampleConfidence : 0,
    sampleSize: input.sampleSize,
    basis: input.basis,
    missing: hasSignal
      ? null
      : (input.missingOverride ?? SKILL_MISSING[input.skill]),
  };
}

/**
 * The single sentence the product promises.
 *
 * Requires two confident skills separated by a real margin, so it never fires on
 * noise. When it does fire it names the gap and points at the weaker skill —
 * which is the whole point of measuring them separately.
 */
export function buildObservation(
  languageCode: string,
  confident: readonly SkillEstimate[],
  stats: { speakingSeconds: number; listeningSeconds: number },
): {
  observation: string | null;
  recommendation: LanguageDna["recommendation"];
} {
  if (confident.length < 2) {
    return { observation: null, recommendation: null };
  }

  const weakest = confident[0];
  const strongest = confident[confident.length - 1];
  if (!weakest || !strongest) return { observation: null, recommendation: null };

  const gap = (strongest.score ?? 0) - (weakest.score ?? 0);
  // A five-point gap is noise; fifteen is a pattern.
  if (gap < 0.15) {
    return {
      observation: `Your ${weakest.skill} and ${strongest.skill} are within ${Math.round(gap * 100)} points of each other, so no single area stands out.`,
      recommendation: null,
    };
  }

  const routes: Partial<Record<Skill, { href: string; cta: string }>> = {
    reading: { href: `/${languageCode}/review`, cta: "Practise recall" },
    vocabulary: { href: `/${languageCode}/review`, cta: "Review your cards" },
    grammar: { href: `/${languageCode}/path`, cta: "Do a grammar-heavy lesson" },
    listening: { href: `/${languageCode}/path`, cta: "Work through a lesson" },
    speaking: { href: `/${languageCode}/capture`, cta: "Add words you want to say" },
    pronunciation: { href: `/${languageCode}/path`, cta: "Work through a lesson" },
  };

  const route = routes[weakest.skill];

  const context =
    stats.speakingSeconds === 0 && weakest.skill !== "speaking"
      ? " You have not logged any speaking practice yet."
      : "";

  return {
    observation: `Your ${strongest.skill} is ${Math.round((strongest.score ?? 0) * 100)}% while your ${weakest.skill} is ${Math.round((weakest.score ?? 0) * 100)}%.${context}`,
    recommendation: route
      ? { skill: weakest.skill, href: route.href, cta: route.cta }
      : null,
  };
}

/** A mastery histogram, read as counts rather than as raw rows. */
async function readVocabularyMastery(
  client: InsForgeClient,
  languageCode: string,
): Promise<{ total: number; meanMastery: number }> {
  const { data, error } = await client.database
    .from("review_states")
    .select("mastery,state")
    .eq("language_code", languageCode)
    .limit(5000);

  if (error) throw dbError("review_states", error);
  if (!Array.isArray(data) || data.length === 0) {
    return { total: 0, meanMastery: 0 };
  }

  let sum = 0;
  let counted = 0;
  for (const row of data) {
    if (!isRecord(row)) continue;
    if (row.state === "suspended") continue;
    sum += optionalNumber(row, "mastery");
    counted += 1;
  }

  return { total: counted, meanMastery: counted > 0 ? sum / counted : 0 };
}

/**
 * Accuracy per skill, split by what each exercise actually measured.
 *
 * The split matters: a `listen` step answered while the written form was shown
 * is a reading answer, so it is filed under reading. Counting it as listening
 * would make the listening figure meaningless — the exact failure this whole
 * screen has to avoid.
 */
async function readPracticeSignals(
  client: InsForgeClient,
  languageCode: string,
): Promise<{
  reading: Signal;
  listening: Signal;
  grammar: Signal;
  audioAvailable: boolean;
}> {
  const { data, error } = await client.database
    .from("practice_events")
    .select("mode,is_correct,expected,produced")
    .eq("language_code", languageCode)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) throw dbError("practice_events", error);

  const reading: Signal = { correct: 0, total: 0, basis: "Comprehension answers on written prompts" };
  const listening: Signal = { correct: 0, total: 0, basis: "Answers to listening exercises" };
  const grammar: Signal = { correct: 0, total: 0, basis: "Graded answers that tested a specific form" };

  if (!Array.isArray(data)) {
    return { reading, listening, grammar, audioAvailable: false };
  }

  let audioAvailable = false;

  for (const row of data) {
    if (!isRecord(row)) continue;
    const mode = optionalString(row, "mode") ?? "";
    const isCorrect = row.is_correct === true;

    // `listen` only counts as listening when audio existed; the player records
    // the written-form fallback as `recognise`, so a `listen` row here means
    // audio was present for that item.
    if (mode === "listen") {
      audioAvailable = true;
      listening.total += 1;
      if (isCorrect) listening.correct += 1;
      continue;
    }

    if (["recognise", "translate", "match"].includes(mode)) {
      reading.total += 1;
      if (isCorrect) reading.correct += 1;
      continue;
    }

    if (mode === "recall" || mode === "arrange") {
      // Graded production with a known expected answer is the closest thing to
      // a grammar measurement available without a dedicated grammar exercise.
      if (optionalString(row, "expected")) {
        grammar.total += 1;
        if (isCorrect) grammar.correct += 1;
      }
      reading.total += 1;
      if (isCorrect) reading.correct += 1;
    }
  }

  if (listening.total === 0) {
    listening.basis = "No listening exercise has been answered with audio yet";
  }

  return { reading, listening, grammar, audioAvailable };
}

async function readStats(
  client: InsForgeClient,
  languageCode: string,
): Promise<{ speakingSeconds: number; listeningSeconds: number }> {
  const { data, error } = await client.database
    .from("user_stats")
    .select("speaking_seconds,listening_seconds")
    .eq("language_code", languageCode)
    .limit(1)
    .maybeSingle();

  if (error) throw dbError("user_stats", error);
  if (!data || !isRecord(data)) return { speakingSeconds: 0, listeningSeconds: 0 };

  return {
    speakingSeconds: optionalNumber(data, "speaking_seconds"),
    listeningSeconds: optionalNumber(data, "listening_seconds"),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Ordered list of every skill, so the UI renders a stable set of rows. */
export const DNA_SKILL_ORDER: readonly Skill[] = SKILLS;
