/**
 * The daily study budget.
 *
 * Onboarding asks "how much time can you study each day?" and until now the
 * answer influenced only a label. The review session was a hardcoded 30 cards
 * whatever the learner chose, so a five-minute learner was handed a session that
 * takes roughly twenty-five minutes — which is not a smaller session, it is an
 * abandoned one.
 *
 * This module turns the answer into the number of things a session contains. It
 * is the bridge between the promise ("10 minutes a day") and what the app
 * actually asks for.
 *
 * Pure functions only: no database, no clock. The cost figures are estimates and
 * are named as such, because a budget derived from a guess must at least be a
 * *stated* guess.
 */

/** A learner's chosen daily time, in minutes. */
export const BUDGET_CHOICES = [5, 10, 20, 30, 60] as const;

/**
 * How long one review card takes, averaged across the four ratings.
 *
 * Measured from the shape of the exercise rather than from real timing data,
 * which this build does not collect: a short recognition card is a few seconds,
 * a typed recall takes longer, and the answer panel is read either way. Twelve
 * seconds is the working estimate, and it is deliberately visible here so it can
 * be corrected once real latency data exists — `practice_events.latency_ms` is
 * already recorded for exactly that.
 */
export const SECONDS_PER_REVIEW_CARD = 12;

/**
 * How long a new item takes to *learn*, as distinct from review.
 *
 * A first exposure includes reading the item, the grammar note, the word
 * breakdown and one or two attempts, so it costs several times a review.
 */
export const SECONDS_PER_NEW_ITEM = 45;

/** Fixed overhead for opening the app, reading the summary and switching tasks. */
const SESSION_OVERHEAD_SECONDS = 30;

/**
 * A session never becomes unbounded.
 *
 * Set high enough that it is a safety net rather than a policy: a 60-minute
 * budget produces ~149 cards, well under this. An earlier value of 60 flattened
 * the difference between a 30- and a 60-minute learner — both hit the cap and
 * received the same session — which would have quietly defeated the point of
 * having a budget at all.
 */
export const MAX_SESSION_CARDS = 200;

export type DailyBudget = {
  /** The learner's chosen time. */
  minutes: number;
  /** Cards a review session should contain. */
  sessionCards: number;
  /** New vocabulary a session may introduce. */
  newItems: number;
  /**
   * Cards needed to consume the whole budget, for the dashboard's estimate.
   * Equal to `sessionCards`; kept named for what the UI means by it.
   */
  estimatedCards: number;
};

/**
 * Build the budget for a learner.
 *
 * Splits the time rather than spending it all on reviews. A budget spent
 * entirely on review never introduces anything new, which is comfortable and
 * teaches nothing; a budget spent entirely on new items produces the illusion of
 * progress and no retention. The split is deliberately review-heavy, because
 * forgetting is the faster process.
 */
export function budgetFor(dailyMinutes: number): DailyBudget {
  const minutes = clampMinutes(dailyMinutes);
  const usableSeconds = Math.max(0, minutes * 60 - SESSION_OVERHEAD_SECONDS);

  // Two thirds to review, one third to new material. Rounded down so a session
  // never overruns the budget it was built from.
  const reviewSeconds = Math.floor(usableSeconds * (2 / 3));
  const newSeconds = usableSeconds - reviewSeconds;

  const sessionCards = clamp(
    Math.floor(reviewSeconds / SECONDS_PER_REVIEW_CARD),
    minutes <= 5 ? 5 : 3,
    MAX_SESSION_CARDS,
  );

  // Even a five-minute learner gets one new item: a session that only ever
  // reviews is a session that stops feeling like progress.
  const newItems = clamp(Math.floor(newSeconds / SECONDS_PER_NEW_ITEM), 1, 12);

  return {
    minutes,
    sessionCards,
    newItems,
    estimatedCards: sessionCards,
  };
}

/** How many cards fit in a given number of minutes, ignoring the split. */
export function cardsForMinutes(minutes: number): number {
  const seconds = Math.max(0, minutes * 60 - SESSION_OVERHEAD_SECONDS);
  return clamp(
    Math.floor(seconds / SECONDS_PER_REVIEW_CARD),
    1,
    MAX_SESSION_CARDS,
  );
}

/** The estimated time a set of cards will take, in minutes. */
export function estimateReviewMinutes(cards: number): number {
  if (cards <= 0) return 0;
  return Math.max(
    1,
    Math.round((cards * SECONDS_PER_REVIEW_CARD + SESSION_OVERHEAD_SECONDS) / 60),
  );
}

/**
 * Whether a session of this size is worth starting.
 *
 * Distinguishes "nothing is due" from "one card is due", because the copy
 * differs and the second is not worth opening the app for.
 */
export function describeSessionSize(
  dueCards: number,
  budget: DailyBudget,
): {
  /** Cards the session will actually contain. */
  cards: number;
  /** True when fewer cards are due than the budget allows. */
  limitedByDueCards: boolean;
  message: string;
} {
  const cards = Math.min(dueCards, budget.sessionCards);

  if (dueCards === 0) {
    return {
      cards: 0,
      limitedByDueCards: false,
      message: `Nothing is due. Your ${budget.minutes}-minute session has no reviews to spend itself on.`,
    };
  }

  if (dueCards <= budget.sessionCards) {
    return {
      cards: dueCards,
      limitedByDueCards: true,
      message: `${dueCards} card${dueCards === 1 ? "" : "s"} due — fewer than your ${budget.minutes}-minute budget covers, so this will be a short session.`,
    };
  }

  return {
    cards,
    limitedByDueCards: false,
    message: `${cards} of ${dueCards} due cards, sized to your ${budget.minutes}-minute budget.`,
  };
}

function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return clamp(Math.round(value), 5, 120);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
