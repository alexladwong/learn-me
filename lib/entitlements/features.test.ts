/**
 * Unit tests for the entitlement catalogue and gate arithmetic.
 *
 * Run:  npm test
 *
 * Two properties matter most, and both are about not being hostile:
 *   - a free learner is never blocked from the core loop
 *   - a prompt never claims a value the data does not support
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FEATURES,
  FEATURE_RULES,
  PREMIUM_BENEFITS,
  describeGate,
  describePlan,
  evaluateGate,
  evaluateGates,
  isFeature,
  type Entitlement,
} from "./features.ts";

function entitlement(over: Partial<Entitlement> & { feature: Entitlement["feature"] }): Entitlement {
  return { limit: null, used: 0, source: "free", periodEnd: null, ...over };
}

describe("the catalogue", () => {
  it("covers every declared feature", () => {
    for (const feature of FEATURES) {
      assert.ok(FEATURE_RULES[feature], `${feature} has no rule`);
      assert.equal(FEATURE_RULES[feature].feature, feature);
    }
  });

  it("keeps the core loop free", () => {
    // One language, unlimited review and lessons. If any of these ever becomes
    // zero, the free tier has stopped being usable and the product has become
    // the thing the brief rules out.
    assert.ok((FEATURE_RULES.active_languages.freeLimit ?? 0) >= 1);
  });

  it("meters only what costs money per use", () => {
    for (const feature of ["ai_translation", "ai_conversation"] as const) {
      assert.equal(FEATURE_RULES[feature].metered, true, `${feature} should be metered`);
      assert.ok((FEATURE_RULES[feature].freeLimit ?? 0) > 0, `${feature} should have a free taste`);
    }
  });

  it("does not sell a capability that does not exist", () => {
    // No speech provider is connected, so pronunciation is limited to zero and
    // reported as unavailable rather than sold and then failing.
    assert.equal(FEATURE_RULES.pronunciation_scoring.freeLimit, 0);
    assert.equal(FEATURE_RULES.offline_lessons.freeLimit, 0);
  });

  it("gives every limited period a reset, and every unlimited one none", () => {
    for (const feature of FEATURES) {
      const rule = FEATURE_RULES[feature];
      if (rule.freeLimit === null) continue;
      assert.ok(["month", "never"].includes(rule.period));
    }
  });

  it("uses feature keys the database also knows", () => {
    // The SQL catalogue in the enforcement migration mirrors this list. A
    // mismatch would produce a row the client silently ignores.
    const expected = [
      "active_languages",
      "ai_translation",
      "ai_conversation",
      "pronunciation_scoring",
      "content_capture",
      "advanced_analytics",
      "offline_lessons",
    ];
    assert.deepEqual([...FEATURES].sort(), [...expected].sort());
  });
});

describe("isFeature", () => {
  it("accepts known keys and rejects unknown ones", () => {
    assert.equal(isFeature("ai_conversation"), true);
    assert.equal(isFeature("unlimited_everything"), false);
    assert.equal(isFeature(""), false);
  });
});

describe("evaluateGate", () => {
  it("allows a free learner their allowance", () => {
    const decision = evaluateGate("ai_conversation", undefined);
    assert.equal(decision.allowed, true);
    assert.equal(decision.limit, 5);
    assert.equal(decision.remaining, 5);
  });

  it("blocks once the allowance is spent", () => {
    const decision = evaluateGate(
      "ai_conversation",
      entitlement({ feature: "ai_conversation", limit: 5, used: 5 }),
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.remaining, 0);
  });

  it("flags the last one, so the UI can warn instead of surprise", () => {
    const decision = evaluateGate(
      "ai_conversation",
      entitlement({ feature: "ai_conversation", limit: 5, used: 4 }),
    );
    assert.equal(decision.allowed, true);
    assert.equal(decision.isLast, true);
  });

  it("never reports a negative remainder even if usage overshot", () => {
    const decision = evaluateGate(
      "ai_conversation",
      entitlement({ feature: "ai_conversation", limit: 5, used: 9 }),
    );
    assert.equal(decision.remaining, 0);
  });

  it("treats an unlimited allowance as always allowed with no remainder", () => {
    const decision = evaluateGate(
      "ai_translation",
      entitlement({ feature: "ai_translation", limit: null, used: 100_000, source: "subscription" }),
    );
    assert.equal(decision.allowed, true);
    assert.equal(decision.limit, null);
    // `null`, not Infinity: the UI needs an honest "no limit" to render.
    assert.equal(decision.remaining, null);
  });

  it("uses the catalogue limit for a zero-allowance feature", () => {
    const decision = evaluateGate("pronunciation_scoring", undefined);
    assert.equal(decision.allowed, false);
    assert.equal(decision.limit, 0);
  });
});

describe("evaluateGates", () => {
  it("returns a decision for every feature", () => {
    const gates = evaluateGates([]);
    assert.equal(gates.size, FEATURES.length);
    for (const feature of FEATURES) {
      assert.ok(gates.has(feature), `${feature} missing`);
    }
  });

  it("lets a stored entitlement override the free allowance", () => {
    const gates = evaluateGates([
      entitlement({ feature: "ai_conversation", limit: 100, used: 10, source: "subscription" }),
    ]);
    assert.equal(gates.get("ai_conversation")?.limit, 100);
    assert.equal(gates.get("ai_conversation")?.remaining, 90);
  });
});

describe("describeGate", () => {
  const decision = evaluateGate(
    "ai_conversation",
    entitlement({ feature: "ai_conversation", limit: 5, used: 5 }),
  );

  it("leads with a measured outcome when one exists", () => {
    const prompt = describeGate({
      decision,
      usedThisPeriod: 5,
      outcome: { newItems: 41, reviewAccuracy: 0.87 },
    });
    assert.match(prompt.headline ?? "", /5 AI conversations/);
    assert.match(prompt.headline ?? "", /41 new expressions/);
  });

  it("says nothing rather than inventing a compliment when there is no outcome", () => {
    const prompt = describeGate({ decision, usedThisPeriod: 5, outcome: null });
    assert.match(prompt.headline ?? "", /5 AI conversations/);
    assert.ok(!/learned/.test(prompt.headline ?? ""), "claimed learning with no data");
  });

  it("returns no headline at all when the feature was never used", () => {
    const prompt = describeGate({ decision, usedThisPeriod: 0, outcome: null });
    assert.equal(prompt.headline, null);
  });

  it("names the concrete limit in the body", () => {
    const prompt = describeGate({ decision, usedThisPeriod: 5 });
    assert.match(prompt.body, /Premium removes that limit/);
  });

  it("does not upsell an unlimited plan", () => {
    const unlimited = evaluateGate(
      "ai_translation",
      entitlement({ feature: "ai_translation", limit: null, source: "subscription" }),
    );
    const prompt = describeGate({ decision: unlimited, usedThisPeriod: 10 });
    assert.match(prompt.body, /unlimited/);
    assert.ok(!/Premium removes/.test(prompt.body));
  });

  it("uses the singular for one use", () => {
    const one = evaluateGate(
      "ai_conversation",
      entitlement({ feature: "ai_conversation", limit: 5, used: 1 }),
    );
    const prompt = describeGate({ decision: one, usedThisPeriod: 1 });
    assert.match(prompt.headline ?? "", /1 AI conversation\b/);
  });

  it("always lists the premium benefits", () => {
    const prompt = describeGate({ decision, usedThisPeriod: 5 });
    assert.equal(prompt.benefits.length, PREMIUM_BENEFITS.length);
  });
});

describe("describePlan", () => {
  it("reports Free with remaining allowances", () => {
    const plan = describePlan([entitlement({ feature: "ai_conversation", limit: 5, used: 2 })]);
    assert.equal(plan.name, "Free");
    assert.equal(plan.isPremium, false);
    assert.ok(plan.lines.some((line) => /3 of 5 left/.test(line)));
  });

  it("reports Premium for a subscription", () => {
    const plan = describePlan([
      entitlement({ feature: "ai_conversation", limit: null, source: "subscription" }),
    ]);
    assert.equal(plan.name, "Premium");
    assert.equal(plan.isPremium, true);
  });

  it("reports Premium for a granted entitlement", () => {
    const plan = describePlan([
      entitlement({ feature: "ai_conversation", limit: null, source: "grant" }),
    ]);
    assert.equal(plan.isPremium, true);
  });

  it("does not treat a trial as premium", () => {
    // A trial must expire back to Free, so it is not the same as a subscription.
    const plan = describePlan([
      entitlement({ feature: "ai_conversation", limit: 50, source: "trial" }),
    ]);
    assert.equal(plan.isPremium, false);
  });

  it("describes an unavailable feature honestly", () => {
    const plan = describePlan([]);
    assert.ok(
      plan.lines.some((line) => /Pronunciation scoring: Not available yet/.test(line)),
      `unexpected lines: ${plan.lines.join(" | ")}`,
    );
  });
});
