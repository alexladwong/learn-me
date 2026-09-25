/**
 * FSRS-5 spaced-repetition scheduler.
 *
 * Pure functions only: no database, no clock, no randomness. Given a card's
 * current memory state, a rating, and how long it has been, it returns the next
 * state and the interval. That purity is deliberate — this is the one piece of
 * the product where a subtle error silently damages every learner's retention,
 * so it must be testable in isolation and reviewable line by line.
 *
 * The database owns *when* the schedule is applied (`apply_review`), the
 * append-only event log, and the rollups. This module owns *what the next
 * interval is*.
 *
 * Model: FSRS-5. Difficulty D ∈ [1, 10] is how hard the item is for this learner;
 * stability S is the number of days at which retrievability decays to 90%.
 * Retrievability R(t, S) = (1 + FACTOR·t/S)^DECAY, and the scheduled interval is
 * the inverse of that at the target retention — so the scheduler's own estimate
 * of recall and the interval it schedules can never disagree.
 *
 * The 19 weights are the published defaults. They are parameters, not magic
 * numbers, and per-learner optimisation is a later feature that will change
 * nothing outside this file.
 */

/** Rating buttons, in the order they are presented. */
export const RATINGS = ["again", "hard", "good", "easy"] as const;
export type Rating = (typeof RATINGS)[number];

/** Rating as FSRS's 1..4 grade. */
const GRADE: Record<Rating, 1 | 2 | 3 | 4> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

/** FSRS card phases. Mirrors the `review_states.state` check constraint. */
export const CARD_STATES = ["new", "learning", "review", "relearning"] as const;
export type CardState = (typeof CARD_STATES)[number];

/**
 * FSRS-5 default parameters, named so the formulas below read as the model
 * rather than as array indexing.
 */
export const DEFAULT_WEIGHTS = [
  0.40255, // w0  initial stability, Again
  1.18385, // w1  initial stability, Hard
  3.173, // w2  initial stability, Good
  15.69105, // w3  initial stability, Easy
  7.1949, // w4  initial difficulty baseline
  0.5345, // w5  initial difficulty sensitivity to grade
  1.4604, // w6  difficulty change rate per review
  0.0046, // w7  difficulty mean-reversion strength
  1.54575, // w8  stability growth scale
  0.1192, // w9  stability growth shape (power of S)
  1.01925, // w10 stability growth sensitivity to retrievability
  1.9395, // w11 post-lapse stability scale
  0.11, // w12 post-lapse difficulty exponent
  0.29605, // w13 post-lapse stability exponent
  2.2698, // w14 post-lapse retrievability sensitivity
  0.2315, // w15 Hard penalty on successful recall
  2.9898, // w16 Easy bonus on successful recall
  0.51655, // w17 same-day stability scale
  0.6621, // w18 same-day stability grade offset
] as const;

const W = {
  sAgain: 0,
  sHard: 1,
  sGood: 2,
  sEasy: 3,
  dBase: 4,
  dGrade: 5,
  dDelta: 6,
  dMeanRevert: 7,
  growthScale: 8,
  growthShape: 9,
  growthRetrievability: 10,
  lapseScale: 11,
  lapseDifficulty: 12,
  lapseStability: 13,
  lapseRetrievability: 14,
  hardPenalty: 15,
  easyBonus: 16,
  shortTermScale: 17,
  shortTermGrade: 18,
} as const;

export const DECAY = -0.5;
/** 19/81, so that interval = S exactly when the target retention is 0.9. */
export const FACTOR = 19 / 81;

/** Target probability of recall at the scheduled interval. */
export const DEFAULT_TARGET_RETENTION = 0.9;

/** A learning step, in days: ten minutes. */
const RELEARNING_STEP_DAYS = 10 / (60 * 24);

/**
 * Fixed intervals for a same-day repeat.
 *
 * FSRS-5 schedules same-day reviews from a fixed table rather than from
 * stability. Using a stability-derived interval here is the classic way to
 * produce the bug where a card answered "again" twice in one sitting disappears
 * for a week — the exact failure this table exists to prevent.
 */
const SAME_DAY_MINUTES: Record<Rating, number> = {
  again: 0,
  hard: 5,
  good: 10,
  easy: 24 * 60,
};

export type SchedulerConfig = {
  weights: readonly number[];
  targetRetention: number;
  /** Hard ceiling on any interval, in days. */
  maximumIntervalDays: number;
};

export const DEFAULT_CONFIG: SchedulerConfig = {
  weights: DEFAULT_WEIGHTS,
  targetRetention: DEFAULT_TARGET_RETENTION,
  maximumIntervalDays: 36500,
};

/** The memory state this scheduler reads and produces. */
export type MemoryState = {
  state: CardState;
  /** Days until recall decays to `targetRetention`. */
  stability: number;
  /** 1 (easy) .. 10 (hard), intrinsic to this learner and item. */
  difficulty: number;
  /** Consecutive successful reviews. */
  streakCorrect: number;
  /** Total reviews so far, including failures. */
  reps: number;
};

export type ScheduleResult = {
  state: CardState;
  stability: number;
  difficulty: number;
  intervalDays: number;
  streakCorrect: number;
  reps: number;
  /** Derived 0..1 for the "mastered" rollup; not an FSRS parameter. */
  mastery: number;
};

export function initialState(): MemoryState {
  return { state: "new", stability: 0, difficulty: 0, streakCorrect: 0, reps: 0 };
}

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

/** Probability of recall after `elapsedDays` given stability `stability`. */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  if (elapsedDays <= 0) return 1;
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

/**
 * The interval at which recall probability falls to `targetRetention`.
 * Inverted from `retrievability`.
 */
export function intervalForRetention(
  stability: number,
  config: SchedulerConfig = DEFAULT_CONFIG,
): number {
  if (stability <= 0) return 0;
  return (stability / FACTOR) * (Math.pow(config.targetRetention, 1 / DECAY) - 1);
}

/** Initial stability for a brand-new card. */
export function initialStability(
  rating: Rating,
  weights: readonly number[] = DEFAULT_WEIGHTS,
): number {
  const grade = GRADE[rating];
  const scale =
    grade === 1
      ? weights[W.sAgain]
      : grade === 2
        ? weights[W.sHard]
        : grade === 3
          ? weights[W.sGood]
          : // Easy starts from Good and adds the Good->Easy step, so the ordering
            // of the four initial stabilities is guaranteed.
            weights[W.sGood] + (weights[W.sEasy] - weights[W.sGood]);
  return Math.max(0.1, scale);
}

/** Initial difficulty for a brand-new card. */
export function initialDifficulty(
  rating: Rating,
  weights: readonly number[] = DEFAULT_WEIGHTS,
): number {
  return clamp(
    weights[W.dBase] - Math.exp(weights[W.dGrade] * (GRADE[rating] - 1)) + 1,
    1,
    10,
  );
}

/**
 * Difficulty after a review.
 *
 * Mean-reverted towards the difficulty the current grade implies, which is what
 * stops one accidental "again" from marking an item hard forever.
 */
function nextDifficulty(
  current: number,
  rating: Rating,
  weights: readonly number[],
): number {
  const grade = GRADE[rating];
  const delta = -weights[W.dDelta] * (grade - 3);
  const damped = current + delta * ((10 - current) / 9);
  const target = initialDifficulty(rating, weights);
  return clamp(
    weights[W.dMeanRevert] * target +
      (1 - weights[W.dMeanRevert]) * damped,
    1,
    10,
  );
}

/** Stability after a successful recall. */
function stabilityOnSuccess(
  difficulty: number,
  stability: number,
  recall: number,
  rating: Rating,
  weights: readonly number[],
): number {
  const hardPenalty = rating === "hard" ? weights[W.hardPenalty] : 1;
  const easyBonus = rating === "easy" ? weights[W.easyBonus] : 1;

  const growth =
    Math.exp(weights[W.growthScale]) *
    (11 - difficulty) *
    Math.pow(stability, -weights[W.growthShape]) *
    (Math.exp((1 - recall) * weights[W.growthRetrievability]) - 1) *
    hardPenalty *
    easyBonus;

  return stability * (1 + growth);
}

/** Stability after forgetting. Can never exceed the previous stability. */
function stabilityOnLapse(
  difficulty: number,
  stability: number,
  recall: number,
  weights: readonly number[],
): number {
  const next =
    weights[W.lapseScale] *
    Math.pow(difficulty, -weights[W.lapseDifficulty]) *
    (Math.pow(stability + 1, weights[W.lapseStability]) - 1) *
    Math.exp((1 - recall) * weights[W.lapseRetrievability]);

  return clamp(Math.min(next, stability), 0, 36500);
}

/**
 * Same-day review handling.
 *
 * Without this, several "again" presses in one sitting would each schedule a
 * multi-day interval, which is how a learner loses a card for a week after
 * getting it wrong twice in five minutes.
 */
function shortTermStability(
  stability: number,
  rating: Rating,
  weights: readonly number[],
): number {
  const grade = GRADE[rating];
  const increase =
    Math.exp(weights[W.shortTermScale] * (grade - 3 + weights[W.shortTermGrade])) *
    Math.pow(stability, -weights[W.shortTermGrade]);
  return clamp(stability * increase, 0.01, 36500);
}

/**
 * Compute the next memory state and interval for a review.
 *
 * @param current     the card's state *before* this review
 * @param rating      Again | Hard | Good | Easy
 * @param elapsedDays days since the last review (0 for a brand-new card, or for
 *                    a same-day repeat)
 */
export function schedule(
  current: MemoryState,
  rating: Rating,
  elapsedDays: number,
  config: SchedulerConfig = DEFAULT_CONFIG,
): ScheduleResult {
  const w = config.weights;
  const reps = current.reps + 1;
  const passed = rating !== "again";

  // ---- Brand-new card -----------------------------------------------------
  if (current.state === "new" || current.stability <= 0) {
    return finish({
      state: passed ? "review" : "learning",
      stability: initialStability(rating, w),
      difficulty: initialDifficulty(rating, w),
      streakCorrect: passed ? 1 : 0,
      reps,
      config,
    });
  }

  // ---- Same-day review ----------------------------------------------------
  if (elapsedDays <= 0) {
    const shortTerm = finish({
      state: passed ? current.state : "relearning",
      stability: shortTermStability(current.stability, rating, w),
      difficulty: nextDifficulty(current.difficulty, rating, w),
      streakCorrect: passed ? current.streakCorrect + 1 : 0,
      reps,
      config,
    });

    // FSRS-5 takes the same-day interval from a fixed table, not from stability.
    return {
      ...shortTerm,
      intervalDays: SAME_DAY_MINUTES[rating] / (60 * 24),
    };
  }

  const recall = retrievability(elapsedDays, current.stability);
  const difficulty = nextDifficulty(current.difficulty, rating, w);

  if (passed) {
    return finish({
      state: "review",
      stability: stabilityOnSuccess(
        difficulty,
        current.stability,
        recall,
        rating,
        w,
      ),
      difficulty,
      streakCorrect: current.streakCorrect + 1,
      reps,
      config,
    });
  }

  return finish({
    state: "relearning",
    stability: stabilityOnLapse(difficulty, current.stability, recall, w),
    difficulty,
    streakCorrect: 0,
    reps,
    config,
  });
}

/**
 * Turn a post-review state into a concrete interval.
 *
 * Cards that have not graduated get short, same-session steps; graduated cards
 * never come back sooner than a day, because an interval shorter than that is
 * what the learning steps are for.
 */
function finish(args: {
  state: CardState;
  stability: number;
  difficulty: number;
  streakCorrect: number;
  reps: number;
  config: SchedulerConfig;
}): ScheduleResult {
  const { state, stability, difficulty, streakCorrect, reps, config } = args;

  let intervalDays: number;

  if (state === "learning" || (state === "relearning" && streakCorrect === 0)) {
    intervalDays = RELEARNING_STEP_DAYS;
  } else if (state === "relearning") {
    intervalDays = 1;
  } else {
    intervalDays = clamp(
      intervalForRetention(stability, config),
      1,
      config.maximumIntervalDays,
    );
  }

  return {
    state,
    stability: clamp(stability, 0, config.maximumIntervalDays),
    difficulty: clamp(difficulty, 1, 10),
    intervalDays,
    streakCorrect,
    reps,
    mastery: masteryFrom(stability),
  };
}

/**
 * A derived 0..1 "how well known" value for the dashboard rollups.
 *
 * Deliberately not an FSRS parameter: stability is unbounded and meaningless as
 * a percentage. Mastery saturates around a 90-day stability, so it moves early
 * on — when the movement is motivating — and stops flickering near the top.
 */
export function masteryFrom(stability: number): number {
  if (stability <= 0) return 0;
  return clamp(1 - Math.exp(-stability / 90), 0, 1);
}

/**
 * The due instant for a result, relative to a given moment.
 *
 * Intervals of a day or more are rounded to whole days. Without rounding,
 * `3.172999999999999 * 86_400_000` truncates to `274147199` ms, so a "3 day"
 * interval produces a due time one millisecond before the third day — the kind
 * of off-by-one that makes a reviewer distrust the scheduler. Sub-day learning
 * steps keep their exact minute-level value, because that precision is the
 * whole point of a learning step.
 */
export function dueAt(from: Date, result: ScheduleResult): Date {
  const days =
    result.intervalDays >= 1
      ? Math.round(result.intervalDays)
      : result.intervalDays;
  return new Date(from.getTime() + days * MS_PER_DAY);
}

/** Milliseconds in a day. Exact, so interval arithmetic does not lose precision. */
export const MS_PER_DAY = 86_400_000;

/** True when a card has graduated to multi-day intervals. */
export function isGraduated(result: ScheduleResult): boolean {
  return result.state === "review" && result.intervalDays >= 1;
}
