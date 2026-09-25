/**
 * The onboarding wizard's answer shape, defaults and validation.
 *
 * Kept out of the component and out of the hook so it can be unit tested:
 * `lib/` is where this project's tests live, because Node's built-in test
 * runner cannot resolve the `@/` path alias.
 *
 * Nothing here imports React — this is data and rules, not a hook.
 */

import {
  CEFR_LEVELS,
  DAILY_MINUTES_OPTIONS,
  MOTIVATIONS,
  SKILLS,
} from "../types.ts";
import { userFacingMessage } from "../errors.ts";

export type OnboardingAnswers = {
  language: string;
  nativeLanguage: string;
  motivation: string[];
  level: string;
  goal: string;
  dailyMinutes: string;
  skills: string[];
  displayName: string;
  timezone: string;
};

export const ONBOARDING_STORAGE_KEY = "learn-me:onboarding:v1";

/**
 * The shape the form starts from.
 *
 * Defaults match what the controls used to declare with `defaultChecked`, so the
 * wizard opens on the same answers it always did.
 */
export function initialAnswers(languageCode: string, nativeLanguage: string | null): OnboardingAnswers {
  return {
    language: languageCode,
    nativeLanguage: nativeLanguage ?? "en",
    motivation: [],
    level: "A1",
    goal: "A2",
    dailyMinutes: "10",
    skills: ["speaking", "listening"],
    displayName: "",
    timezone: "",
  };
}

/**
 * Keep only values the current wizard would accept.
 *
 * Storage is editable by anyone with a console and may hold a shape from an
 * older build. A stale value must not be able to put the form into a state the
 * server rejects, so every field is checked against the same option lists the
 * controls render. Exported for test: this is the only thing standing between a
 * tampered `sessionStorage` and an unsubmittable wizard.
 */
export function sanitise(value: unknown, fallback: OnboardingAnswers): OnboardingAnswers {
  if (typeof value !== "object" || value === null) return fallback;
  const raw = value as Record<string, unknown>;

  const stringList = (input: unknown, allowed: readonly string[]): string[] =>
    Array.isArray(input)
      ? input.filter((entry): entry is string => typeof entry === "string" && allowed.includes(entry))
      : [];

  const oneOf = (input: unknown, allowed: readonly string[], otherwise: string): string =>
    typeof input === "string" && allowed.includes(input) ? input : otherwise;

  const dailyMinutes = oneOf(
    typeof raw.dailyMinutes === "string" ? raw.dailyMinutes : undefined,
    DAILY_MINUTES_OPTIONS.map(String),
    fallback.dailyMinutes,
  );

  return {
    language: typeof raw.language === "string" && raw.language ? raw.language : fallback.language,
    nativeLanguage:
      typeof raw.nativeLanguage === "string" && raw.nativeLanguage
        ? raw.nativeLanguage
        : fallback.nativeLanguage,
    motivation: stringList(raw.motivation, MOTIVATIONS),
    level: raw.level === "unsure" ? "unsure" : oneOf(raw.level, CEFR_LEVELS, fallback.level),
    goal: oneOf(raw.goal, CEFR_LEVELS, fallback.goal),
    dailyMinutes,
    skills: stringList(raw.skills, SKILLS),
    displayName: typeof raw.displayName === "string" ? raw.displayName : "",
    timezone: typeof raw.timezone === "string" ? raw.timezone : "",
  };
}

/**
 * The level choices shown to a learner, and what each one stores.
 *
 * The UI deliberately avoids CEFR jargon: "Complete beginner" and "I know a few
 * words" are answers a person can give about themselves, while "A2" is an
 * assessment framework. The CEFR code is still what reaches the database, shown
 * as a small secondary note rather than as the label.
 *
 * `unsure` maps to `null` — "place me as I go" — which the schema already
 * supports and which is materially different from claiming A1.
 */
export const LEVEL_CHOICES = [
  {
    value: "unsure",
    label: "Complete beginner",
    description: "I am starting from nothing.",
    note: null,
  },
  {
    value: "A1",
    label: "I know a few words",
    description: "Greetings, numbers, simple phrases.",
    note: "A1",
  },
  {
    value: "A2",
    label: "I can have basic conversations",
    description: "Everyday topics, present and past.",
    note: "A2",
  },
  {
    value: "B1",
    label: "Intermediate",
    description: "I can hold a conversation and be understood.",
    note: "B1",
  },
  {
    value: "B2",
    label: "Advanced",
    description: "I am comfortable on most subjects.",
    note: "B2",
  },
] as const;

/** How far a learner wants to get. Plain language first, CEFR second. */
export const GOAL_CHOICES = [
  { value: "A2", label: "Get by on a trip", description: "Order, ask, understand the reply." },
  { value: "B1", label: "Hold a real conversation", description: "Everyday life without translating in your head." },
  { value: "B2", label: "Work or study in it", description: "Comfortable across most subjects." },
  { value: "C1", label: "Near-native fluency", description: "Nuance, idiom and fast speech." },
] as const;

/**
 * Which validation message to show when a whole-form submit fails.
 *
 * The bug this fixes is subtle and was reported from a screenshot: the final
 * step reported "Choose at least one reason" while asking about *skills*. The
 * cause was returning Zod's `issues[0]`, which is ordered by the schema's field
 * order — and `motivation` is declared before `skills`. A learner who had
 * skipped the reason question and was looking at the skill screen was therefore
 * told about a different step, on a screen that does not ask for it.
 *
 * Two rules, in order:
 *   1. If a field on the *current* step failed, say so. It is what the learner is
 *      looking at.
 *   2. Otherwise point at the earliest step with a problem, because that is what
 *      actually blocks the plan.
 *
 * Pure and exported so the ordering can be tested without a server.
 */
export function firstProblemForStep(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
  stepFields: Record<number, ReadonlyArray<string>>,
  currentStep: number,
  stepOrder: ReadonlyArray<number>,
  fallback = "Check your answers before continuing",
): string | null {
  const ownFields = stepFields[currentStep] ?? [];
  const own = issues.find((issue) => ownFields.includes(String(issue.path[0])));
  if (own) return userFacingMessage(own.message, fallback);

  for (const stepNumber of [...stepOrder].sort((a, b) => a - b)) {
    const fields = stepFields[stepNumber] ?? [];
    const match = issues.find((issue) => fields.includes(String(issue.path[0])));
    if (match) return userFacingMessage(match.message, fallback);
  }

  // No issues at all is a distinct outcome from "issues we cannot describe", and
  // the caller renders its own copy for it. Only messages that exist are guarded.
  if (issues.length === 0) return null;

  // Even the last resort goes through the guard: text generated by the library
  // rather than written by a person must never be shown, so the caller's fallback
  // wins over a message aimed at a developer.
  return userFacingMessage(issues[0]?.message, fallback);
}
