import type { InsForgeClient } from "@insforge/sdk";
import {
  consumeFeature,
  loadEntitlements,
} from "@/lib/db/entitlements";
import {
  describeGate,
  evaluateGate,
  type Feature,
  type GateDecision,
  type UpgradePrompt,
} from "@/lib/entitlements/features";
import type { LanguageDna } from "@/lib/db/dna";

/**
 * The gate every metered action passes through.
 *
 * One helper rather than a check at each call site, because a gate that is
 * re-implemented per feature drifts: one place forgets to consume, another
 * consumes without checking, and the allowance becomes advisory.
 *
 * The order is deliberate — **consume first, then do the work.** Checking and
 * then acting would let two concurrent requests both pass the check. Consuming
 * first means a request that fails afterwards has spent its allowance, which is
 * the safe direction: it can be refunded deliberately, whereas an over-granted
 * action cannot be un-taken.
 */

export type GatePass = {
  ok: true;
  decision: GateDecision;
  /** Human summary for the UI, e.g. "3 of 5 left this month". */
  summary: string;
};

export type GateBlock = {
  ok: false;
  reason: "exhausted" | "error";
  /** Message safe to show the learner. */
  error: string;
  decision: GateDecision | null;
  /** Present when the block is an allowance limit, not a fault. */
  prompt: UpgradePrompt | null;
};

export type GateOutcome = GatePass | GateBlock;

/**
 * Check and spend an allowance for one action.
 *
 * @param cost how many units this action costs. Translation is charged per word,
 *             so a 30-word request spends 30 atomically rather than making 30
 *             separate checks that could each pass and exceed the limit.
 */
export async function requireFeature(
  client: InsForgeClient,
  feature: Feature,
  options: { cost?: number; outcome?: { newItems: number; reviewAccuracy: number | null } | null; dna?: LanguageDna | null } = {},
): Promise<GateOutcome> {
  const { cost = 1, outcome = null, dna = null } = options;

  try {
    const result = await consumeFeature(client, feature, cost);

    if (result.ok) {
      return {
        ok: true,
        decision: result.decision,
        summary: summarise(result.decision),
      };
    }

    const entitlements = await loadEntitlements(client);
    const decision =
      result.decision ??
      evaluateGate(
        feature,
        entitlements.find((entry) => entry.feature === feature),
      );

    return {
      ok: false,
      reason: "exhausted",
      error: blockedMessage(decision),
      decision,
      prompt: describeGate({ decision, usedThisPeriod: decision.used, outcome, dna }),
    };
  } catch (error) {
    // A database fault must not silently permit the action. Failing closed costs
    // the learner one attempt; failing open costs the product its metering.
    console.error(`[entitlements] gate for "${feature}" failed`, error);
    return {
      ok: false,
      reason: "error",
      error: "Could not check your plan just now. Please try again.",
      decision: null,
      prompt: null,
    };
  }
}

/** Read-only: whether a feature is available, without spending anything. */
export async function featureAvailable(
  client: InsForgeClient,
  feature: Feature,
): Promise<GateDecision> {
  const entitlements = await loadEntitlements(client);
  return evaluateGate(
    feature,
    entitlements.find((entry) => entry.feature === feature),
  );
}

function summarise(decision: GateDecision): string {
  if (decision.limit === null) return "Unlimited on your plan";
  if (decision.limit === 0) return "Not available yet";
  return `${decision.remaining} of ${decision.limit} left this month`;
}

/**
 * What to tell a learner who has run out.
 *
 * Names the limit and the reset, because "you have reached your limit" without
 * saying what the limit is or when it returns is the kind of message that makes
 * a paywall feel arbitrary.
 */
function blockedMessage(decision: GateDecision): string {
  const label = decision.label || "That feature";

  if (decision.limit === 0) {
    return `${label} is not available on the free plan yet.`;
  }
  if (decision.limit === null) {
    return `${label} is unavailable right now.`;
  }

  return `You have used all ${decision.limit} of your free ${label.toLowerCase()} this month. They reset at the start of next month.`;
}
