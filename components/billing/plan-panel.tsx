import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress";
import {
  FEATURES,
  FEATURE_RULES,
  PREMIUM_BENEFITS,
  type Entitlement,
  type Feature,
} from "@/lib/entitlements/features";

/**
 * The plan surface.
 *
 * The brief is explicit that the app must not be "annoying just to force a
 * purchase", so this is written as a statement of what the learner currently has
 * rather than as an advertisement. The upgrade section is below the plan and
 * framed as information.
 *
 * Every number shown is the learner's own usage. Where a feature is not built
 * yet, it says so instead of listing it as a benefit they cannot use.
 */

export function PlanPanel({
  planName,
  isPremium,
  entitlements,
}: {
  planName: string;
  isPremium: boolean;
  entitlements: Entitlement[];
}) {
  const byFeature = new Map(entitlements.map((entry) => [entry.feature, entry]));

  return (
    <Card>
      <CardHeader
        title="Your plan"
        description={
          isPremium
            ? "Everything is unlimited on Premium."
            : "The free plan includes the whole learning path, spaced repetition and your banks."
        }
        action={<Badge tone={isPremium ? "success" : "neutral"}>{planName}</Badge>}
      />

      <ul className="mt-5 flex flex-col gap-4">
        {FEATURES.map((feature) => (
          <UsageRow
            key={feature}
            feature={feature}
            entitlement={byFeature.get(feature)}
          />
        ))}
      </ul>

      {isPremium ? null : (
        <div className="mt-6 rounded-[var(--radius)] border border-line bg-surface-sunken p-4">
          <h3 className="text-sm font-semibold text-primary">
            What Premium adds
          </h3>
          <ul className="mt-3 flex flex-col gap-2">
            {PREMIUM_BENEFITS.map((benefit) => (
              <li key={benefit.label} className="flex items-start gap-2.5 text-sm">
                <Icon
                  name="check"
                  size={15}
                  className="mt-0.5 shrink-0 text-success"
                />
                <span>
                  <span className="font-medium text-primary">{benefit.label}</span>
                  <span className="text-secondary"> — {benefit.detail}</span>
                </span>
              </li>
            ))}
          </ul>

          {/*
            No checkout button. Billing is not configured for this project, and a
            button that leads nowhere would be worse than an honest statement.
          */}
          <p className="mt-4 text-xs text-muted">
            Upgrading is not available in this build — no payment provider is
            configured yet. Nothing above is switched off in the meantime.
          </p>
        </div>
      )}
    </Card>
  );
}

function UsageRow({
  feature,
  entitlement,
}: {
  feature: Feature;
  entitlement: Entitlement | undefined;
}) {
  const rule = FEATURE_RULES[feature];
  const limit = entitlement ? entitlement.limit : rule.freeLimit;
  const used = entitlement?.used ?? 0;

  // A feature that does not exist yet is reported as such rather than shown as
  // a limit the learner has failed to reach.
  const notBuilt = limit === 0;

  const valueLabel = notBuilt
    ? "Not available yet"
    : limit === null
      ? "Unlimited"
      : `${Math.max(0, limit - used)} of ${limit} left`;

  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-primary">{rule.label}</span>
        <span
          className={
            notBuilt
              ? "text-xs text-muted"
              : limit !== null && limit - used <= 0
                ? "text-xs font-medium text-warning"
                : "text-xs tabular-nums text-muted"
          }
        >
          {valueLabel}
        </span>
      </div>

      {notBuilt ? (
        <p className="mt-1 text-xs text-muted">
          This build has no provider connected for it, so nothing is metered.
        </p>
      ) : (
        <div className="mt-1.5">
          <ProgressBar
            value={limit === null ? 0 : used / Math.max(1, limit)}
            label={rule.label}
            hideLabel
            tone={limit !== null && limit - used <= 0 ? "accent" : "info"}
            size="sm"
          />
        </div>
      )}
    </li>
  );
}

/**
 * The contextual upgrade prompt.
 *
 * Rendered *after* a learner has hit a limit and seen the value, never before.
 * It leads with a measured outcome rather than a sales line, because the brief's
 * rule is that the value should be obvious before money is mentioned:
 *
 *   "You have had 5 AI conversations and learned 41 new expressions."
 *
 * When there is nothing meaningful to say, the prompt says nothing and simply
 * states the limit — it never invents a compliment.
 */
export function UpgradeNotice({
  headline,
  body,
  featureLabel,
}: {
  headline: string | null;
  body: string;
  featureLabel: string;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface-sunken px-4 py-3">
      <p className="text-sm font-medium text-primary">
        {headline ?? `${featureLabel} limit reached`}
      </p>
      <p className="mt-1 text-sm text-secondary">{body}</p>
      <p className="mt-2 text-xs text-muted">
        Your allowances reset at the start of each month.
      </p>
    </div>
  );
}

/** A compact line for a dashboard or settings summary. */
export function PlanSummaryLine({
  planName,
  isPremium,
  remainingLabel,
  className,
}: {
  planName: string;
  isPremium: boolean;
  remainingLabel: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-sm text-secondary">
        <span className="font-medium text-primary">{planName} plan</span>
        {remainingLabel ? <span> · {remainingLabel}</span> : null}
      </p>
      {!isPremium ? (
        <ButtonLink href="/settings" variant="ghost" size="sm" className="mt-1 -ml-3">
          See what limits apply
        </ButtonLink>
      ) : null}
    </div>
  );
}
