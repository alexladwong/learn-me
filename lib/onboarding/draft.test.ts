/**
 * The onboarding draft merge.
 *
 * Run:  npm test
 *
 * Why this matters: onboarding answers used to live only in the browser, because
 * each step is a Server Action plus a `redirect()` that remounts the wizard. A
 * render that happened before the client rehydrated produced a form with no
 * `motivation` inputs at all, so the final submit correctly reported a missing
 * reason while the learner watched five selected reasons disappear.
 *
 * The merge is what makes a server draft safe. The rule under test is that a step
 * writes only the fields it owns and never erases the rest — a step that owns one
 * field must not null out the others, or the draft would be as fragile as the
 * browser storage it replaced.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeDraft, type OnboardingDraft } from "./draft.ts";

describe("mergeDraft", () => {
  it("adds a new field without touching the others", () => {
    const current: OnboardingDraft = { language: "fr", motivation: ["travel", "work"] };
    const merged = mergeDraft(current, { nativeLanguage: "en" });
    assert.deepEqual(merged, {
      language: "fr",
      motivation: ["travel", "work"],
      nativeLanguage: "en",
    });
  });

  it("never erases a stored field when a later step omits it", () => {
    // The exact regression: step 4 owns level and goal, and must not drop the
    // reasons step 3 stored.
    const current: OnboardingDraft = {
      language: "fr",
      motivation: ["travel", "work", "university", "business", "relationships"],
    };
    const merged = mergeDraft(current, { level: "unsure", goal: "C1" });
    assert.equal(merged.motivation?.length, 5);
    assert.equal(merged.level, "unsure");
    assert.equal(merged.goal, "C1");
  });

  it("replaces a field the step does own", () => {
    // Changing your mind must work: step 3 re-run with a different set wins.
    const current: OnboardingDraft = { motivation: ["travel"] };
    const merged = mergeDraft(current, { motivation: ["work", "culture"] });
    assert.deepEqual(merged.motivation, ["work", "culture"]);
  });

  it("replaces with an empty array when that is the learner's intent", () => {
    // Clearing every reason is a real state, not an omission — the caller only
    // sends `motivation` on the step that owns it.
    const merged = mergeDraft({ motivation: ["travel"] }, { motivation: [] });
    assert.deepEqual(merged.motivation, []);
  });

  it("ignores undefined so an absent field cannot overwrite", () => {
    const current: OnboardingDraft = { nativeLanguage: "en", level: "A2" };
    const merged = mergeDraft(current, { level: undefined, goal: "B1" });
    assert.equal(merged.level, "A2", "undefined must not clobber a stored value");
    assert.equal(merged.goal, "B1");
  });

  it("ignores null for the same reason", () => {
    const merged = mergeDraft({ nativeLanguage: "en" }, { nativeLanguage: null } as unknown as OnboardingDraft);
    assert.equal(merged.nativeLanguage, "en");
  });

  it("builds the full draft across steps in order", () => {
    let draft: OnboardingDraft = {};
    draft = mergeDraft(draft, { language: "fr" });
    draft = mergeDraft(draft, { nativeLanguage: "en" });
    draft = mergeDraft(draft, { motivation: ["travel", "work"] });
    draft = mergeDraft(draft, { level: "unsure", goal: "C1" });
    draft = mergeDraft(draft, { dailyMinutes: 5 });
    draft = mergeDraft(draft, { skills: ["vocabulary", "listening"], displayName: "Kintu Alex", timezone: "Africa/Kampala" });

    assert.deepEqual(draft, {
      language: "fr",
      nativeLanguage: "en",
      motivation: ["travel", "work"],
      level: "unsure",
      goal: "C1",
      dailyMinutes: 5,
      skills: ["vocabulary", "listening"],
      displayName: "Kintu Alex",
      timezone: "Africa/Kampala",
    });
  });

  it("does not mutate the draft it is given", () => {
    const current: OnboardingDraft = { language: "fr" };
    mergeDraft(current, { level: "A1" });
    assert.deepEqual(current, { language: "fr" }, "callers must not see their object change");
  });

  it("treats a missing draft as empty", () => {
    assert.deepEqual(mergeDraft({}, { language: "de" }), { language: "de" });
  });
});
