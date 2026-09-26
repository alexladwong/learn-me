import type { InsForgeClient } from "@insforge/sdk";
import { countPublishedMissions, getWeeklySummary } from "@/lib/db/progress";
import { getUserStats } from "@/lib/db/learner";
import type {
  LearnerLanguage,
  LearningMode,
  TodaySession,
  TodaySessionItem,
  WeeklySummary,
} from "@/lib/types";

import { budgetFor, estimateReviewMinutes } from "@/lib/learning/budget";

/**
 * Compose the answer to "what should I learn next?".
 *
 * This is the single entry point the dashboard calls. Everything the learner
 * sees as "today" comes from here, so there is exactly one place that decides
 * priority — not one per screen.
 *
 * The composition rules, in priority order:
 *   1. Overdue reviews — always first, because forgetting curve time is real.
 *   2. A guided lesson — only if published content actually exists.
 *   3. Listening practice — only if the language has audio items configured.
 *   4. Speaking practice — only if speaking is a stated priority and the
 *      language supports a microphone path.
 *   5. Content exploration — the "learn from anything" escape hatch.
 *
 * Every rule degrades to "not available" rather than to an invented number. A
 * session with no available items is a legitimate result, and the caller renders
 * it as an honest empty state.
 */
export async function composeTodaySession(
  client: InsForgeClient,
  language: LearnerLanguage,
  mode: LearningMode,
  options: ComposeOptions = {},
): Promise<TodaySession> {
  const languageCode = language.language_code;
  const lessonMinutes = options.lessonMinutes ?? null;

  const [stats, missionsAvailable] = await Promise.all([
    getUserStats(client, languageCode),
    countPublishedMissions(client, languageCode),
  ]);

  const reviewsDue = stats?.review_cards_due ?? 0;
  const goalMinutes = minutesForMode(mode, language.daily_minutes);

  const items: TodaySessionItem[] = [];

  // 1. Reviews are never optional and are never displaced by other modes: a
  //    missed review is the one thing that actively costs the learner progress.
  //    The count is capped by the budget, so the estimate reflects the session
  //    the learner will actually be given rather than the size of their backlog.
  if (reviewsDue > 0) {
    const budget = budgetFor(language.daily_minutes);
    const plannedCards = Math.min(reviewsDue, budget.sessionCards);
    const reviewMinutes = estimateReviewMinutes(plannedCards);

    items.push({
      kind: "review",
      label:
        plannedCards < reviewsDue
          ? `${plannedCards} of ${reviewsDue} cards due (your budget)`
          : `${reviewsDue} card${reviewsDue === 1 ? "" : "s"} due for review`,
      // A pure review session has no fixed budget: finishing the queue is the
      // goal, so its cost is reported rather than capped.
      minutes: mode === "review" ? reviewMinutes : Math.min(reviewMinutes, goalMinutes),
      href: `/${languageCode}/review`,
    });
  }

  const timeAfterReviews = items.reduce((sum, item) => sum + item.minutes, 0);
  const remainingAfterReviews = Math.max(0, goalMinutes - timeAfterReviews);

  /*
   * 2. Guided lesson — the spine of a Study session, and a short one in Quick.
   *
   * Its cost is the mission's own `estimated_minutes`, passed in by the caller
   * that already resolved which mission is next. This used to be a module
   * constant of eight minutes, which put a duration on the dashboard that no
   * authored lesson had claimed — the number was ours, not the curriculum's. When
   * the next mission has not stated a length, the lesson contributes no minutes
   * and says so rather than borrowing one.
   */
  const wantsLesson = mode === "study" || mode === "quick";
  if (wantsLesson && missionsAvailable > 0 && remainingAfterReviews > 0 && lessonMinutes !== null) {
    items.push({
      kind: "lesson",
      label: mode === "quick" ? "One short lesson" : "Guided lesson",
      minutes: Math.min(lessonMinutes, remainingAfterReviews),
      href: `/${languageCode}/path`,
    });
  } else if (wantsLesson && (missionsAvailable === 0 || lessonMinutes === null)) {
    // Named, with zero minutes: the session shows the intent and the honest
    // reason it cannot be filled.
    items.push({
      kind: "lesson",
      label:
        missionsAvailable === 0 ? "Guided lesson" : "Guided lesson — length not stated",
      minutes: 0,
    });
  }

  // 3. Listening — Commute is audio-first by definition.
  const wantsListening =
    mode === "commute" || (mode === "study" && language.preferred_modes.includes("commute"));
  if (wantsListening && missionsAvailable > 0) {
    items.push({
      kind: "listening",
      label: "Listening practice",
      minutes: 0,
      href: `/${languageCode}/path`,
    });
  }

  // 4. Speaking — forced when the learner named it a priority, otherwise an
  //    explicit Speak session is the only trigger.
  const speakingIsPriority = language.skill_priorities.includes("speaking");
  if (mode === "speak" || (speakingIsPriority && mode === "study")) {
    items.push({
      kind: "speaking",
      label: "Speaking practice",
      minutes: 0,
      href: `/${languageCode}/speak`,
    });
  }

  // 5. Content exploration — always available, because it does not depend on
  //    authored curriculum existing.
  if (mode === "explore") {
    items.push({
      kind: "content",
      label: "Learn from text you bring in",
      minutes: 0,
      href: `/${languageCode}/capture`,
    });
  }

  const totalMinutes = items.reduce((sum, item) => sum + item.minutes, 0);

  return {
    languageCode,
    goalMinutes,
    reviewsDue,
    lessonsAvailable: missionsAvailable,
    mode,
    items,
    totalMinutes,
  };
}

/**
 * What the composed session needs from its caller.
 *
 * `lessonMinutes` is the one input the composer cannot get on its own without a
 * second query, and it is the input that keeps the session's stated length
 * honest: the length of a lesson is authored content (`missions.estimated_minutes`),
 * not a constant this module may invent.
 */
export type ComposeOptions = {
  /** `missions.estimated_minutes` for the mission the learner would be given. */
  lessonMinutes?: number | null;
};

/**
 * The time budget a mode implies.
 *
 * A mode is a different *amount* of the same material, not a different system —
 * which is why this is a lookup rather than a separate composer per mode.
 * `study` uses the learner's own daily budget; `review` has no fixed budget
 * because finishing the queue is the goal.
 */
export function minutesForMode(mode: LearningMode, dailyMinutes: number): number {
  switch (mode) {
    case "quick":
      return 5;
    case "commute":
      return 15;
    case "speak":
      return 10;
    case "study":
      return dailyMinutes;
    case "review":
    case "explore":
      return 0;
  }
}

/**
 * The learner's budget, for callers that need the same numbers the composer used.
 *
 * Exported so the dashboard can describe a session without recomputing the split
 * and risking a second, subtly different answer.
 */
export { budgetFor };

export type Recommendation = {
  /** Short, specific, and grounded in a number the learner can verify. */
  text: string;
  /** Where acting on it goes. */
  href: string | null;
  cta: string | null;
};

/**
 * Recommend the next thing to work on, using only real data.
 *
 * Ordering matters: a concrete, actionable observation beats generic advice, and
 * generic advice beats nothing. When there is genuinely not enough evidence, the
 * function returns `null` so the UI shows an honest "complete a session to see
 * recommendations" state rather than inventing guidance.
 *
 * Skill *levels* are deliberately not compared here. Comparing skills
 * ("your reading is ahead of your speaking") requires enough evidence per skill
 * to be meaningful, which is the Language DNA model — computing it from a
 * handful of events would produce confident-sounding nonsense.
 */
export function recommendNext(
  language: LearnerLanguage,
  stats: { total_reviews: number; listening_seconds: number; speaking_seconds: number } | null,
  weekly: WeeklySummary | null,
): Recommendation | null {
  const code = language.language_code;

  if (!stats || stats.total_reviews === 0) {
    return {
      text: "Complete your first session and this area will show what to focus on next, based on your own answers.",
      href: `/${code}/path`,
      cta: "Start learning",
    };
  }

  // A named priority with no recorded practice is the most actionable gap.
  const priority = language.skill_priorities[0];
  if (priority === "speaking" && stats.speaking_seconds === 0) {
    return {
      text: `You named speaking as a priority and have logged ${stats.total_reviews} reviews but no speaking practice yet.`,
      href: `/${code}/speak`,
      cta: "Practise speaking",
    };
  }
  if (priority === "listening" && stats.listening_seconds === 0) {
    return {
      text: "You named listening as a priority and have not logged any listening minutes yet.",
      href: `/${code}/path`,
      cta: "Start a listening session",
    };
  }

  if (weekly && weekly.reviews > 0) {
    const accuracy = Math.round((weekly.reviews_correct / weekly.reviews) * 100);
    if (accuracy < 75) {
      return {
        text: `Your recall was ${accuracy}% across ${weekly.reviews} reviews this week. Repeating the cards you missed is the fastest way to lift that.`,
        href: `/${code}/review`,
        cta: "Review missed cards",
      };
    }
    return {
      text: `${weekly.reviews} reviews at ${accuracy}% recall this week. Your next gain is new material rather than more review.`,
      href: `/${code}/path`,
      cta: "Continue your path",
    };
  }

  return {
    text: `You have completed ${stats.total_reviews} reviews so far. Keep going to build up enough data for personalised recommendations.`,
    href: `/${code}/review`,
    cta: "Review due cards",
  };
}

/** Re-exported so the dashboard fetches weekly activity through one module. */
export { getWeeklySummary };
