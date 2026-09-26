import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * A frame that makes a product surface read as a real interface.
 *
 * The homepage shows what the product actually looks like rather than describing
 * it, so each preview needs to be immediately legible as an app screen: a title
 * bar, a soft border, and a lifted shadow so it sits above the section tint
 * instead of blending into it.
 *
 * `tone` lets one preview be the page's focal point (the dashboard, on a raised
 * surface) while the others stay on the sunken tone — varying card weight is most
 * of what stops a page of previews reading as a grid of identical boxes.
 */
export function PreviewFrame({
  title,
  children,
  tone = "raised",
  className,
}: {
  title: string;
  children: ReactNode;
  tone?: "raised" | "sunken" | "deep";
  className?: string;
}) {
  const surface =
    tone === "deep"
      ? "border-tint-deep-line bg-tint-deep text-tint-deep-text"
      : tone === "sunken"
        ? "border-line bg-surface-sunken"
        : "border-line bg-surface-raised";

  return (
    <div
      className={cx(
        "overflow-hidden rounded-[var(--radius-xl)] border shadow-[var(--shadow-float)]",
        surface,
        className,
      )}
    >
      <div
        className={cx(
          "flex items-center gap-2 border-b px-4 py-2.5",
          tone === "deep" ? "border-tint-deep-line" : "border-line",
        )}
      >
        <span aria-hidden="true" className="flex gap-1.5">
          <span
            className={cx(
              "size-2 rounded-full",
              tone === "deep" ? "bg-tint-deep-line" : "bg-line-strong",
            )}
          />
          <span
            className={cx(
              "size-2 rounded-full",
              tone === "deep" ? "bg-tint-deep-line" : "bg-line-strong",
            )}
          />
        </span>
        <p
          className={cx(
            "ml-1 truncate text-xs font-medium",
            tone === "deep" ? "text-tint-deep-text-soft" : "text-muted",
          )}
        >
          {title}
        </p>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

/** A labelled metric, for the previews and the dashboard's secondary blocks. */
export function Metric({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "accent";
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p
        className={cx(
          "mt-1 text-2xl font-semibold tabular-nums tracking-tight",
          tone === "accent" ? "text-accent" : "text-primary",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-secondary">{hint}</p> : null}
    </div>
  );
}

/** A thin measured bar. Used for progress that is a real fraction of a real total. */
export function MeterBar({
  value,
  label,
  tone = "accent",
}: {
  value: number;
  label: string;
  tone?: "accent" | "coral";
}) {
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium text-secondary">{label}</p>
        <p className="text-xs tabular-nums text-muted">{percent}%</p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-track">
        <div
          className={cx("h-full rounded-full", tone === "coral" ? "bg-coral" : "bg-accent")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
