import { cx } from "@/lib/cx";
import { ONBOARDING_STEP_COUNT, STEP_SHORT_LABELS, type OnboardingStep } from "@/lib/onboarding/steps";

/**
 * Where the learner is in onboarding.
 *
 * A thin line and a named step, rather than the previous row of small segments.
 * Segments show position but not progress; a line that fills shows both, and the
 * name of the current question is more use than a sixth dot. It stays restrained
 * — this is orientation, not a reward.
 *
 * `aria-current="step"` marks the active item so a screen reader announces
 * position rather than reading six anonymous list items.
 */
export function OnboardingProgress({ step }: { step: OnboardingStep }) {
  const percent = Math.round((step / ONBOARDING_STEP_COUNT) * 100);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          Step {step} of {ONBOARDING_STEP_COUNT}
        </p>
        <p className="text-xs text-muted">{STEP_SHORT_LABELS[step]}</p>
      </div>

      <div
        className="h-1 w-full overflow-hidden rounded-[var(--radius-sm)] bg-surface-sunken"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={ONBOARDING_STEP_COUNT}
        aria-valuenow={step}
        aria-label={`Step ${step} of ${ONBOARDING_STEP_COUNT}`}
      >
        <div
          className={cx("h-full rounded-[var(--radius-sm)] bg-accent transition-[width]")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
