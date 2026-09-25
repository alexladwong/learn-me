import type { InsForgeClient } from "@insforge/sdk";
import { dbError, parsers } from "@/lib/db/parse";
import {
  evaluateGate,
  evaluateGates,
  isFeature,
  type Entitlement,
  type EntitlementSource,
  type Feature,
  type GateDecision,
} from "@/lib/entitlements/features";

const { isRecord, optionalNumber, optionalString } = parsers;

/**
 * Entitlement reads and atomic consumption.
 *
 * The gate catalogue and the arithmetic live in `lib/entitlements/features.ts`
 * and are unit-tested. This module only moves data: it reads the learner's rows
 * and calls the database function that spends an allowance.
 */

const SOURCES: readonly EntitlementSource[] = [
  "free",
  "trial",
  "subscription",
  "grant",
];

function parseEntitlement(row: unknown): Entitlement | null {
  if (!isRecord(row)) return null;

  const feature = optionalString(row, "feature");
  // A row for a feature this build does not know is skipped rather than thrown
  // on: the database can legitimately be ahead of the client during a rollout.
  if (!feature || !isFeature(feature)) return null;

  const rawLimit = row.limit ?? row.quota_limit;
  const source = optionalString(row, "source");

  return {
    feature,
    // `null` is unlimited. A missing column is treated as unlimited too, since
    // NULL is how the schema expresses it.
    limit:
      rawLimit === null || rawLimit === undefined
        ? null
        : typeof rawLimit === "number"
          ? rawLimit
          : null,
    used: optionalNumber(row, "used") || optionalNumber(row, "quota_used"),
    source:
      source && (SOURCES as readonly string[]).includes(source)
        ? (source as EntitlementSource)
        : "free",
    periodEnd: optionalString(row, "period_end"),
  };
}

/**
 * The learner's entitlements, one per catalogue feature.
 *
 * `list_my_entitlements` returns only rows that exist, so a brand-new account
 * gets an empty list — which `evaluateGates` correctly reads as the free
 * allowance rather than as unlimited.
 */
export async function loadEntitlements(
  client: InsForgeClient,
): Promise<Entitlement[]> {
  const { data, error } = await client.database.rpc("list_my_entitlements");

  if (error) {
    // A missing function means the migration has not been applied; degrading to
    // the free allowance is safer than granting everything.
    console.error("[entitlements] list_my_entitlements failed", error);
    return [];
  }

  if (!Array.isArray(data)) return [];

  const entitlements = data.flatMap((row: unknown): Entitlement[] => {
    const parsed = parseEntitlement(row);
    return parsed ? [parsed] : [];
  });

  // A row exists per feature only once the learner has touched it. Filling the
  // gaps from the catalogue means the UI always renders a complete plan.
  const present = new Set(entitlements.map((entry) => entry.feature));
  const gates = evaluateGates(entitlements);

  const filled: Entitlement[] = [...entitlements];
  for (const [feature, decision] of gates) {
    if (present.has(feature)) continue;
    filled.push({
      feature,
      limit: decision.limit,
      used: 0,
      source: "free",
      periodEnd: null,
    });
  }

  return filled;
}

/** Read one learner's decision for one feature, without spending anything. */
export async function checkFeature(
  client: InsForgeClient,
  feature: Feature,
): Promise<GateDecision> {
  const { data, error } = await client.database.rpc("check_entitlement", {
    p_feature: feature,
  });

  if (error) {
    console.error("[entitlements] check_entitlement failed", error);
    // Fail closed to the free allowance rather than open.
    return evaluateGate(feature, undefined);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!isRecord(row)) return evaluateGate(feature, undefined);

  const limitValue = row.quota_limit;
  const limit =
    limitValue === null || limitValue === undefined
      ? null
      : typeof limitValue === "number"
        ? limitValue
        : null;

  return evaluateGate(feature, {
    feature,
    limit,
    used: optionalNumber(row, "quota_used"),
    source: "free",
    periodEnd: null,
  });
}

export type ConsumeResult =
  | { ok: true; decision: GateDecision }
  | { ok: false; reason: "exhausted"; decision: GateDecision };

/**
 * Spend an allowance.
 *
 * Delegates to `consume_entitlement`, which locks the learner's row for the
 * duration of the transaction. Doing the check in application code and then
 * writing would let two concurrent requests both see the last unit and both
 * proceed — the classic quota leak, and the reason this is not a read-then-write.
 */
export async function consumeFeature(
  client: InsForgeClient,
  feature: Feature,
  cost = 1,
): Promise<ConsumeResult> {
  const { data, error } = await client.database.rpc("consume_entitlement", {
    p_feature: feature,
    p_cost: cost,
  });

  if (error) {
    console.error("[entitlements] consume_entitlement failed", error);
    // A failed check must not silently allow the action: the caller reports it.
    throw dbError("consume_entitlement", error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!isRecord(row)) {
    throw new Error("consume_entitlement returned no decision");
  }

  const limitValue = row.quota_limit;
  const limit =
    limitValue === null || limitValue === undefined
      ? null
      : typeof limitValue === "number"
        ? limitValue
        : null;

  const used = optionalNumber(row, "quota_used");

  const decision: GateDecision = {
    feature,
    label: "",
    allowed: row.allowed === true,
    limit,
    used,
    remaining:
      row.remaining === null || row.remaining === undefined
        ? null
        : optionalNumber(row, "remaining"),
    isLast:
      row.remaining !== null &&
      row.remaining !== undefined &&
      optionalNumber(row, "remaining") === 1,
  };

  return decision.allowed
    ? { ok: true, decision }
    : { ok: false, reason: "exhausted", decision };
}
