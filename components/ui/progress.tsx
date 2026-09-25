import { cx } from "@/lib/cx";

type ProgressBarProps = {
  /** 0..1. Clamped, so a bad caller can't render a broken bar. */
  value: number;
  label: string;
  /** Shown at the end of the row, e.g. "7 of 12 units". */
  valueLabel?: string;
  tone?: "accent" | "success" | "info";
  size?: "sm" | "md";
  /**
   * Render the bar without its visible label row.
   *
   * Used where the caller already shows the label above the bar (the Language DNA
   * rows). `label` is still required and still becomes the accessible name — the
   * bar is never unlabelled, only visually tightened.
   */
  hideLabel?: boolean;
  className?: string;
};

const tones = {
  accent: "bg-accent",
  success: "bg-success",
  info: "bg-info",
} as const;

const heights = { sm: "h-1.5", md: "h-2.5" } as const;

/**
 * A labelled progress bar.
 *
 * The label is required, not optional: a bar is a picture, and a bar without a
 * name tells a screen-reader user nothing. Colour is decorative — the same
 * information is always present as text.
 */
export function ProgressBar({
  value,
  label,
  valueLabel,
  tone = "accent",
  size = "sm",
  hideLabel = false,
  className,
}: ProgressBarProps) {
  const percent = Math.round(clamp01(value) * 100);

  return (
    <div className={className}>
      {hideLabel ? null : (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-primary">{label}</span>
          {valueLabel ? (
            <span className="shrink-0 text-xs tabular-nums text-muted">{valueLabel}</span>
          ) : null}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className={cx("w-full overflow-hidden rounded-full bg-surface-sunken", heights[size])}
      >
        <div
          className={cx("h-full rounded-full transition-[width]", tones[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
      {hideLabel && valueLabel ? (
        <p className="mt-1 text-xs tabular-nums text-muted">{valueLabel}</p>
      ) : null}
    </div>
  );
}

type ProgressRingProps = {
  value: number;
  /** Big centre text, e.g. "12" minutes remaining. */
  primary: string;
  /** Small caption under the centre text. */
  secondary?: string;
  label: string;
  size?: number;
};

/**
 * The daily-goal ring. Same information contract as `ProgressBar`: a required
 * `label` for assistive tech, and the numbers rendered as real text.
 */
export function ProgressRing({
  value,
  primary,
  secondary,
  label,
  size = 132,
}: ProgressRingProps) {
  const percent = Math.round(clamp01(value) * 100);
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-sunken)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          className="transition-[stroke-dasharray]"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-semibold tabular-nums text-primary">{primary}</span>
        {secondary ? (
          <span className="mt-0.5 px-4 text-xs text-secondary">{secondary}</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A single metric. `value === null` renders an explicit "no data yet" state
 * rather than a zero or an invented number.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number | null;
  hint?: string;
  icon?: React.ReactNode;
}) {
  const hasValue = value !== null && value !== undefined;

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface-raised px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon ? <span className="text-muted">{icon}</span> : null}
        <span className="truncate">{label}</span>
      </div>
      {hasValue ? (
        <p className="mt-1 text-xl font-semibold tabular-nums text-primary">{value}</p>
      ) : (
        <p className="mt-1 text-sm text-muted">Not yet</p>
      )}
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
