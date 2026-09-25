/**
 * The onboarding validation contract.
 *
 * This lives in `lib/` rather than inside the `"use server"` actions module for
 * two reasons. A `"use server"` file may only export async functions, so the
 * schema could not be exported for testing; and that module imports
 * `next/navigation`, which Node's bare test runner cannot resolve — so any test
 * importing it fails to load at all.
 *
 * Keeping the schema here means the exact rules that gate a learner's plan can be
 * tested directly, including the messages they read when a step is incomplete.
 */

import { z } from "zod";

// Relative imports: Node's bare test runner cannot resolve the `@/` alias, and
// these modules are covered by unit tests.
import { CEFR_LEVELS, DAILY_MINUTES_OPTIONS, MOTIVATIONS, SKILLS } from "../types.ts";
import type { OnboardingStep } from "./steps.ts";

/**
 * Canonical field names, end to end.
 *
 * There is exactly one name per concept, and this is the mapping. It was traced
 * because a cross-wiring bug hid in it: Step 1 had TWO sources of truth for the
 * target language — a `languageChoice` radio group and a hidden `language` field
 * bound to the URL — so choosing a different language submitted the wrong one.
 *
 * | concept           | form field       | schema key       | database column     |
 * |-------------------|------------------|------------------|---------------------|
 * | target language   | `language`       | `language`       | `language_code`     |
 * | native language   | `nativeLanguage` | `nativeLanguage` | `native_language`   |
 * | learning reasons  | `motivation`     | `motivation`     | `motivation`        |
 * | current level     | `level`          | `level`          | `cefr_level`        |
 * | goal              | `goal`           | `goal`           | `cefr_goal`         |
 * | daily minutes     | `dailyMinutes`   | `dailyMinutes`   | `daily_minutes`     |
 * | priority skills   | `skills`         | `skills`         | `skill_priorities`  |
 * | display name      | `displayName`    | (profile field)  | `display_name`      |
 * | timezone          | `timezone`       | (profile field)  | `timezone`          |
 *
 * `motivation` and `skills` are the two arrays, and they are distinct fields with
 * distinct messages. Step 6 owns `skills` only; it must never report a problem
 * with `motivation`.
 */

const cefrSchema = z.enum(CEFR_LEVELS);

export const onboardingSchema = z.object({
  // Every field carries an authored message. Without one, Zod emits text like
  // "Too small: expected string to have >=2 characters", which is written for a
  // stack trace and was reaching the screen.
  language: z.string().trim().min(2, "Choose the language you want to learn").max(8),
  nativeLanguage: z
    .string()
    .trim()
    .min(2, "Choose your first language")
    .max(8, "Choose your first language"),
  motivation: z.array(z.enum(MOTIVATIONS)).min(1, "Choose at least one reason"),
  // "I am not sure yet" is a legitimate answer and is stored as null.
  level: z.union([cefrSchema, z.literal("unsure")], {
    message: "Choose where you are starting from",
  }),
  goal: cefrSchema, // Has a default, so it is never the blocking field.
  dailyMinutes: z.coerce
    .number()
    .int()
    .refine(
      (n) => (DAILY_MINUTES_OPTIONS as readonly number[]).includes(n),
      "Choose one of the offered study times",
    ),
  // The message names the field the learner is actually looking at, so it can
  // never be mistaken for the reason question on the step before.
  skills: z
    .array(z.enum(SKILLS))
    .min(1, "Choose at least one area you'd like to improve"),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;

/**
 * Fields each step owns, so "Continue" validates only that step. An unanswered
 * later step must never block progress through an earlier one.
 */
export const STEP_FIELDS: Record<OnboardingStep, Array<keyof OnboardingValues>> = {
  1: [],
  2: ["nativeLanguage"],
  3: ["motivation"],
  4: ["level", "goal"],
  5: ["dailyMinutes"],
  6: ["skills"],
};
