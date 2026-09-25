/**
 * The feature catalogue and its free-tier limits.
 *
 * This is the single source of truth for what a learner may do. Every gate reads
 * from here, so a limit is changed in one place rather than discovered by
 * grepping for magic numbers.
 *
 * The product rule that shapes it: **the free tier genuinely works.** One active
 * language, the core path, real spaced repetition, the banks and progress are
 * free and always will be. What is metered is the work that costs money per use
 * — AI translation, AI conversation — plus conveniences like a second language.
 *
 * Nothing here decides *whether* to show an upgrade prompt. See
 * `describeGate` for why the prompt is data-driven rather than a component.
 *
 * Pure data and pure functions: no database, no network, so the limits can be
 * unit-tested.
 */

import type { LanguageDna } from "@/lib/db/dna";

/** Features that can be gated. Keys are stable and appear in the database. */
export const FEATURES = [
  "active_languages",
  "ai_translation",
  "ai_conversation",
  "pronunciation_scoring",
  "content_capture",
  "advanced_analytics",
  "offline_lessons",
] as const;

export type Feature = (typeof FEATURES)[number];

export type EntitlementSource = "free" | "trial" | "subscription" | "grant";

/** `null` means unlimited. */
export type FeatureRule = {
  feature: Feature;
  /** What the learner sees as the feature name. */
  label: string;
  /** Free-tier allowance, per period. `null` is unlimited. */
  freeLimit: number | null;
  /** Human description of the free allowance, for the settings screen. */
  freeDescription: string;
  /**
   * Whether this is a metered action that should be *consumed* (usage counted)
   * rather than merely *checked*.
   *
   * Languages are checked — a learner either has one active or not — while a
   * translation is consumed, because each one costs money.
   */
  metered: boolean;
  /** How often the allowance resets. */
  period: "month" | "never";
};

export const FEATURE_RULES: Record<Feature, FeatureRule> = {
  active_languages: {
    feature: "active_languages",
    label: "Active languages",
    freeLimit: 1,
    freeDescription: "One language at a time",
    metered: false,
    period: "never",
  },
  ai_translation: {
    feature: "ai_translation",
    label: "Automatic translation",
    freeLimit: 40,
    freeDescription: "40 translated words a month",
    metered: true,
    period: "month",
  },
  ai_conversation: {
    feature: "ai_conversation",
    label: "AI conversations",
    freeLimit: 5,
    freeDescription: "5 conversations a month",
    metered: true,
    period: "month",
  },
  pronunciation_scoring: {
    feature: "pronunciation_scoring",
    label: "Pronunciation scoring",
    // No provider is connected, so this is metered at zero and honestly
    // reported as unavailable rather than being sold and then failing.
    freeLimit: 0,
    freeDescription: "Not available yet",
    metered: true,
    period: "month",
  },
  content_capture: {
    feature: "content_capture",
    label: "Learn from content",
    freeLimit: 20,
    freeDescription: "20 pasted texts a month",
    metered: true,
    period: "month",
  },
  advanced_analytics: {
    feature: "advanced_analytics",
    label: "Advanced analytics",
    freeLimit: 0,
    freeDescription: "Basic progress only",
    metered: false,
    period: "never",
  },
  offline_lessons: {
    feature: "offline_lessons",
    label: "Offline lessons",
    freeLimit: 0,
    freeDescription: "Not available yet",
    metered: false,
    period: "never",
  },
};

export const PREMIUM_BENEFITS: Array<{ label: string; detail: string }> = [
  { label: "Unlimited languages", detail: "Study as many at once as you like" },
  { label: "Unlimited AI conversations", detail: "Practise speaking without a weekly ceiling" },
  { label: "Unlimited translation", detail: "Translate everything you paste in" },
  { label: "Advanced analytics", detail: "The full Language DNA breakdown and history" },
  { label: "Offline lessons", detail: "Keep studying without a connection" },
];

export type Entitlement = {
  feature: Feature;
  /** `null` is unlimited. */
  limit: number | null;
  used: number;
  source: EntitlementSource;
  periodEnd: string | null;
};

export type GateDecision = {
  feature: Feature;
  label: string;
  allowed: boolean;
  /** `null` is unlimited. */
  limit: number | null;
  used: number;
  remaining: number | null;
  /** True when this is the last one available. Used to warn rather than block. */
  isLast: boolean;
};

/** The decision for one feature, given what the learner currently holds. */
export function evaluateGate(
  feature: Feature,
  entitlement: Entitlement | undefined,
): GateDecision {
  const rule = FEATURE_RULES[feature];
  const limit = entitlement ? entitlement.limit : rule.freeLimit;
  const used = entitlement?.used ?? 0;

  // An unlimited allowance is always allowed, and `remaining` is null rather
  // than Infinity so the UI has an honest "no limit" value to render.
  if (limit === null) {
    return {
      feature,
      label: rule.label,
      allowed: true,
      limit: null,
      used,
      remaining: null,
      isLast: false,
    };
  }

  const remaining = Math.max(0, limit - used);

  return {
    feature,
    label: rule.label,
    allowed: remaining > 0,
    limit,
    used,
    remaining,
    isLast: remaining === 1,
  };
}

export function evaluateGates(
  entitlements: readonly Entitlement[],
): Map<Feature, GateDecision> {
  const byFeature = new Map(entitlements.map((entry) => [entry.feature, entry]));
  return new Map(
    FEATURES.map((feature) => [feature, evaluateGate(feature, byFeature.get(feature))]),
  );
}

/**
 * The payload for the upgrade prompt.
 *
 * Built as data rather than as a bespoke component, so the prompt can say
 * something specific about *this* learner's usage:
 *
 *   "You completed 5 AI conversations this week and learned 41 new expressions.
 *    Premium removes the conversation limit."
 *
 * That sentence is the whole point of the business model in the brief: make the
 * value obvious before asking for money. A generic "BUY PREMIUM!" banner is the
 * thing it explicitly rules out, so the copy is generated from measured usage —
 * and when there is nothing meaningful to say, `headline` is null and the UI
 * falls back to a plain statement rather than inventing a compliment.
 */
export type UpgradePrompt = {
  /** Pauses the upsell. A learner who declined should not be asked again today. */
  learnerHasSeenThisPeriod: boolean;
  featureLabel: string;
  /** Measured outcome, or null when there is not enough to say anything true. */
  headline: string | null;
  /** What premium removes. Always the concrete limit that was reached. */
  body: string;
  benefits: typeof PREMIUM_BENEFITS;
};

export function describeGate(input: {
  decision: GateDecision;
  /** How many of this feature the learner has used this period. */
  usedThisPeriod: number;
  /** A measured outcome to lead with, e.g. new expressions learned. */
  outcome?: { newItems: number; reviewAccuracy: number | null } | null;
  dna?: LanguageDna | null;
}): UpgradePrompt {
  const { decision, usedThisPeriod, outcome } = input;
  const rule = FEATURE_RULES[decision.feature];

  let headline: string | null = null;

  if (rule.metered && usedThisPeriod > 0) {
    const phrase =
      decision.feature === "ai_conversation"
        ? `You have had ${usedThisPeriod} AI conversation${usedThisPeriod === 1 ? "" : "s"}`
        : decision.feature === "ai_translation"
          ? `You translated ${usedThisPeriod} word${usedThisPeriod === 1 ? "" : "s"}`
          : decision.feature === "content_capture"
            ? `You brought in ${usedThisPeriod} text${usedThisPeriod === 1 ? "" : "s"}`
            : `You used ${rule.label.toLowerCase()} ${usedThisPeriod} time${usedThisPeriod === 1 ? "" : "s"}`;

    if (outcome && outcome.newItems > 0) {
      headline = `${phrase} and learned ${outcome.newItems} new expression${outcome.newItems === 1 ? "" : "s"}.`;
    } else {
      headline = `${phrase}.`;
    }
  }

  return {
    learnerHasSeenThisPeriod: false,
    featureLabel: rule.label,
    headline,
    body:
      decision.limit === null
        ? `${rule.label} is unlimited on your plan.`
        : `The free plan includes ${rule.freeDescription}. Premium removes that limit.`,
    benefits: PREMIUM_BENEFITS,
  };
}

/** The plan summary shown on the settings screen. */
export function describePlan(
  entitlements: readonly Entitlement[],
): { name: string; isPremium: boolean; lines: string[] } {
  const isPremium = entitlements.some(
    (entry) => entry.source === "subscription" || entry.source === "grant",
  );

  if (isPremium) {
    return {
      name: "Premium",
      isPremium: true,
      lines: PREMIUM_BENEFITS.map((benefit) => benefit.label),
    };
  }

  const gates = evaluateGates(entitlements);
  return {
    name: "Free",
    isPremium: false,
    lines: FEATURES.map((feature) => {
      const decision = gates.get(feature);
      const rule = FEATURE_RULES[feature];
      if (!decision) return rule.label;
      if (decision.limit === null) return `${rule.label}: unlimited`;
      if (decision.limit === 0) return `${rule.label}: ${rule.freeDescription}`;
      return `${rule.label}: ${decision.remaining} of ${decision.limit} left`;
    }),
  };
}

/**
 * Validate an unknown feature key coming from the database.
 *
 * A row for a feature this build does not know about is ignored rather than
 * throwing: the database can legitimately be ahead of the client during a
 * rollout, and one unknown key must not break the whole gate evaluation.
 */
export function isFeature(value: string): value is Feature {
  return (FEATURES as readonly string[]).includes(value);
}
