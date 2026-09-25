import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * The empty state is a first-class screen in this product, not a placeholder.
 * Because the app never invents progress data, "nothing here yet" is a common
 * and legitimate state — so it must explain what will appear and what to do.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "default",
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "default" | "sunken";
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-line px-6 py-10 text-center",
        tone === "sunken" && "bg-surface-sunken",
        className,
      )}
    >
      {icon ? (
        <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-surface-sunken text-muted">
          {icon}
        </span>
      ) : null}
      <p className="text-sm font-semibold text-primary">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * Marks a capability the platform does not have yet.
 *
 * Used wherever a feature would otherwise be faked — pronunciation scoring,
 * audio for a language with no configured provider, content extraction without
 * an AI provider. It is intentionally visible rather than hidden.
 */
export function CapabilityNotice({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-start gap-3 rounded-[var(--radius)] border border-line bg-surface-sunken px-4 py-3",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mt-1.5 size-2 shrink-0 rounded-full bg-warning"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">{title}</p>
        <p className="mt-0.5 text-sm text-secondary">{description}</p>
      </div>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "muted";
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface-sunken text-secondary",
    accent: "bg-accent-subtle text-accent",
    success: "bg-success-soft text-success",
    muted: "bg-surface-sunken text-muted",
  } as const;

  return (
    <span
      className={cx(
        // A soft rectangle rather than a pill: a pill badge is the single most
        // toy-like shape in an interface, and these carry real state.
        "inline-flex items-center rounded-[var(--radius-sm)] px-1.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
