import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** `raised` lifts off the page for the one primary card on a screen. */
  tone?: "default" | "raised" | "sunken";
  padded?: boolean;
};

const tones = {
  default: "bg-surface-raised border border-line",
  raised: "bg-surface-raised border border-line shadow-[var(--shadow-raised)]",
  sunken: "bg-surface-sunken border border-line",
} as const;

export function Card({
  tone = "default",
  padded = true,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cx(
        "rounded-[var(--radius-lg)]",
        tones[tone],
        padded && "p-5 sm:p-6",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-primary">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-secondary">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
