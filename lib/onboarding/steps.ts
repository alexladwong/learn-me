/**
 * Onboarding step definitions.
 *
 * Kept out of the Server Actions module because a `"use server"` file may only
 * export async functions, and the wizard's step list is needed by Server
 * Components too.
 *
 * The copy here is deliberately conversational. Onboarding is six questions, and
 * the difference between "configuration" and "discovery" is almost entirely in
 * whether each question explains why it is being asked. Every subtitle below
 * does that in one line, so a learner can feel the plan taking shape rather than
 * filling in a form.
 */

export const ONBOARDING_STEPS = [1, 2, 3, 4, 5, 6] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const FIRST_STEP: OnboardingStep = 1;
export const LAST_STEP: OnboardingStep = 6;

/** Total number of steps, for the "Step 3 of 6" indicator. */
export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;

export function parseStep(raw: string | undefined): OnboardingStep {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return FIRST_STEP;
  if (parsed < FIRST_STEP || parsed > LAST_STEP) return FIRST_STEP;
  return parsed as OnboardingStep;
}

export function onboardingPath(languageCode: string, step: OnboardingStep): string {
  return `/${languageCode}/onboarding?step=${step}`;
}

export const STEP_TITLES: Record<OnboardingStep, { title: string; subtitle: string }> = {
  1: {
    title: "What do you want to speak?",
    subtitle:
      "Everything in your plan follows from this. You can add more languages later.",
  },
  2: {
    title: "What feels most like home?",
    subtitle:
      "Your first language — used for translations and for explaining grammar in words you already have.",
  },
  3: {
    title: "Why are you learning it?",
    subtitle:
      "We will bring the vocabulary and situations you actually need to the front.",
  },
  4: {
    title: "Where are you starting from?",
    subtitle:
      "Be honest rather than ambitious — starting too high makes the first week frustrating, and you can move up whenever you like.",
  },
  5: {
    title: "How much time do you really have?",
    subtitle:
      "A realistic daily target beats an ambitious one you cannot keep. Small and steady is what builds recall.",
  },
  6: {
    title: "What would you like to get better at?",
    subtitle:
      "Your practice is weighted towards these. You can change them at any time.",
  },
};

/** A short name per step, so the progress indicator says more than a number. */
export const STEP_SHORT_LABELS: Record<OnboardingStep, string> = {
  1: "Language",
  2: "First language",
  3: "Your reason",
  4: "Starting point",
  5: "Daily time",
  6: "Focus",
};
