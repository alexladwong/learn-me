/**
 * Unit tests for the onboarding answers store.
 *
 * Run:  npm test
 *
 * The reason this module exists at all is worth stating: the wizard's answers
 * cannot live in plain `useState`. Each step is a Server Action followed by
 * `redirect()`, which makes Next refetch the route segment and remount the
 * wizard — so every answer was destroyed between steps and the plan was never
 * saved. These tests pin the part that has to be right for storing them to be
 * safe.
 *
 * `sessionStorage` is writable by anyone with a console and may hold a shape from
 * an older build. Rehydrating a value the server would reject produces a form
 * that cannot be submitted at all, so every field is checked against the same
 * option lists the controls render.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { firstProblemForStep, initialAnswers, sanitise } from "./answers.ts";
// The same schema the Server Action validates with, from the shared module.
import { onboardingSchema } from "./schema.ts";

const FALLBACK = initialAnswers("es", "en");

describe("initialAnswers", () => {
  it("defaults to the language being onboarded", () => {
    assert.equal(FALLBACK.language, "es");
  });

  it("uses the saved first language, and English when there is none", () => {
    assert.equal(initialAnswers("es", "de").nativeLanguage, "de");
    assert.equal(initialAnswers("es", null).nativeLanguage, "en");
  });

  it("starts with no motivation chosen but the two default skill priorities", () => {
    // Matches what the controls used to declare with `defaultChecked`, so the
    // wizard opens on the same answers it always did.
    assert.deepEqual(FALLBACK.motivation, []);
    assert.deepEqual([...FALLBACK.skills].sort(), ["listening", "speaking"]);
  });
});

describe("sanitise", () => {
  it("keeps a fully valid set of answers unchanged", () => {
    const good = {
      language: "fr",
      nativeLanguage: "en",
      motivation: ["travel", "work"],
      level: "A2",
      goal: "B1",
      dailyMinutes: "20",
      skills: ["speaking"],
      displayName: "Ana",
      timezone: "Europe/Madrid",
    };
    assert.deepEqual(sanitise(good, FALLBACK), good);
  });

  it("falls back entirely when the stored value is not an object", () => {
    for (const bad of [null, undefined, 42, "nope", true]) {
      assert.deepEqual(sanitise(bad, FALLBACK), FALLBACK, `should reject ${String(bad)}`);
    }
  });

  it("rejects a study time the form never offered", () => {
    assert.equal(sanitise({ dailyMinutes: "9999" }, FALLBACK).dailyMinutes, "10");
    assert.equal(sanitise({ dailyMinutes: "20" }, FALLBACK).dailyMinutes, "20");
    assert.equal(sanitise({ dailyMinutes: 20 }, FALLBACK).dailyMinutes, "10");
  });

  it("rejects a level or goal outside the CEFR scale", () => {
    assert.equal(sanitise({ level: "Z9" }, FALLBACK).level, "A1");
    assert.equal(sanitise({ goal: "Z9" }, FALLBACK).goal, "A2");
    assert.equal(sanitise({ level: "B1", goal: "C1" }, FALLBACK).level, "B1");
  });

  it("allows 'unsure' as a level, because the form does", () => {
    // A legitimate answer that the server stores as null.
    assert.equal(sanitise({ level: "unsure" }, FALLBACK).level, "unsure");
  });

  it("drops unknown options from the multi-select answers", () => {
    const result = sanitise(
      { motivation: ["travel", "invented"], skills: ["speaking", "telekinesis"] },
      FALLBACK,
    );
    assert.deepEqual(result.motivation, ["travel"]);
    assert.deepEqual(result.skills, ["speaking"]);
  });

  it("substitutes an empty list when a multi-select is not an array", () => {
    const result = sanitise({ motivation: "travel", skills: { speaking: true } }, FALLBACK);
    assert.deepEqual(result.motivation, []);
    assert.deepEqual(result.skills, []);
  });

  it("keeps free text as-is, but never invents it", () => {
    assert.equal(sanitise({ displayName: "Ana" }, FALLBACK).displayName, "Ana");
    assert.equal(sanitise({}, FALLBACK).displayName, "");
    assert.equal(sanitise({ displayName: 42 }, FALLBACK).displayName, "");
  });

  it("replaces an empty or non-string language with the fallback", () => {
    assert.equal(sanitise({ language: "" }, FALLBACK).language, "es");
    assert.equal(sanitise({ language: 7 }, FALLBACK).language, "es");
    assert.equal(sanitise({ language: "de" }, FALLBACK).language, "de");
  });

  it("is idempotent, so a rehydrate cannot drift", () => {
    const once = sanitise({ motivation: ["travel"], level: "B2" }, FALLBACK);
    assert.deepEqual(sanitise(once, FALLBACK), once);
  });
});

/**
 * The message a learner sees when the final submit fails.
 *
 * Reported from a screenshot: the skills screen said "Choose at least one
 * reason". The cause was returning the schema's first issue, and `motivation` is
 * declared before `skills` — so a learner who had skipped the reason question was
 * told about a different step.
 */
describe("firstProblemForStep", () => {
  // Mirrors the real STEP_FIELDS in the Server Action.
  const STEP_FIELDS: Record<number, readonly string[]> = {
    1: [],
    2: ["nativeLanguage"],
    3: ["motivation"],
    4: ["level", "goal"],
    5: ["dailyMinutes"],
    6: ["skills"],
  };
  const ORDER = [1, 2, 3, 4, 5, 6];

  const issue = (field: string, message: string) => ({ path: [field], message });

  it("reports the current step's own problem, whatever order Zod listed it in", () => {
    // Motivation is listed first because of schema order; the learner is on step
    // 6, so the skills message is the one they need.
    const issues = [
      issue("motivation", "Choose at least one reason"),
      issue("skills", "Choose at least one area you'd like to improve"),
    ];
    assert.equal(
      firstProblemForStep(issues, STEP_FIELDS, 6, ORDER),
      "Choose at least one area you'd like to improve",
    );
  });

  it("falls back to the earliest unanswered step when the current one is fine", () => {
    // Authored messages, as the real schema produces — the guard replaces
    // machine text, so a test using bare "Required" would be testing the guard
    // rather than the ordering this covers.
    const issues = [
      issue("dailyMinutes", "Choose one of the offered study times"),
      issue("nativeLanguage", "Choose your first language"),
    ];
    // Step 6 has no issue of its own, so the honest answer is step 2 — earlier
    // than the study-time problem, and earlier than the order Zod listed them.
    assert.equal(
      firstProblemForStep(issues, STEP_FIELDS, 6, ORDER),
      "Choose your first language",
    );
  });

  it("returns null when nothing failed", () => {
    assert.equal(firstProblemForStep([], STEP_FIELDS, 6, ORDER), null);
  });

  it("ignores an issue belonging to no known step rather than losing it", () => {
    // An unknown field still yields a message rather than silence.
    const issues = [issue("somethingElse", "Unexpected problem")];
    assert.equal(firstProblemForStep(issues, STEP_FIELDS, 6, ORDER), "Unexpected problem");
  });
});

/**
 * The reported bug, against the real schema.
 *
 * These use the schema the Server Action actually validates with, so the two
 * cannot drift apart: if someone reorders the fields or reworded the messages,
 * this fails rather than quietly reintroducing the wrong-step message.
 */
describe("onboarding validation, against the real schema", () => {
  const valid = {
    language: "es",
    nativeLanguage: "en",
    motivation: ["travel"],
    level: "A2",
    goal: "B1",
    dailyMinutes: 20,
    skills: ["speaking"],
  };

  const STEP_FIELDS: Record<number, readonly string[]> = {
    1: [], 2: ["nativeLanguage"], 3: ["motivation"],
    4: ["level", "goal"], 5: ["dailyMinutes"], 6: ["skills"],
  };

  it("accepts a complete plan", () => {
    assert.equal(onboardingSchema.safeParse(valid).success, true);
  });

  it("names the skill field when skills are empty on the last step", () => {
    const parsed = onboardingSchema.safeParse({ ...valid, skills: [] });
    assert.equal(parsed.success, false);
    if (parsed.success) return;
    const message = firstProblemForStep(parsed.error.issues, STEP_FIELDS, 6, [1, 2, 3, 4, 5, 6]);
    assert.match(message ?? "", /skill|improve/i);
    assert.doesNotMatch(message ?? "", /reason/i, "must not talk about the reason step");
  });

  it("still names the reason field when the learner is on that step", () => {
    const parsed = onboardingSchema.safeParse({ ...valid, motivation: [] });
    assert.equal(parsed.success, false);
    if (parsed.success) return;
    const message = firstProblemForStep(parsed.error.issues, STEP_FIELDS, 3, [1, 2, 3, 4, 5, 6]);
    assert.match(message ?? "", /reason/i);
  });

  it("rejects the empty native language the old picker submitted", () => {
    // The bug this replaced: the search box had a `name`, so an untouched picker
    // posted "" and the server refused it with "expected string to have >=2
    // characters".
    const parsed = onboardingSchema.safeParse({ ...valid, nativeLanguage: "" });
    assert.equal(parsed.success, false);
  });
});
