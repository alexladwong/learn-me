import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * A large rounded section container.
 *
 * This is the composition device the whole public page is built from. The
 * reference design works because it treats the page as a poster — a handful of
 * oversized, softly rounded panels of alternating tint, each holding its own
 * content — rather than a stack of small components on one continuous background.
 *
 * So sections are **containers with their own surface**, not transparent bands:
 * a big radius, generous padding that scales with the viewport, and a tint that
 * alternates. That is what creates rhythm down the page without dividers.
 *
 * `bleed` exists for the rare section that should run edge to edge (a closing
 * statement), while everything else stays inside the page's max width so the
 * composition keeps a consistent spine.
 */

const TONES = {
  plain: "bg-surface",
  /** Pale mint — the primary feature colour, used most. */
  mint: "bg-surface-raised",
  cream: "bg-[var(--tint-cream)]",
  warm: "bg-[var(--tint-warm)]",
  deep: "bg-tint-deep text-tint-deep-text",
  /** Faintly mint-tinted, for a quieter panel than `mint`. */
  mist: "bg-[var(--tint-mist)]",
} as const;

export function Section({
  children,
  tone = "plain",
  id,
  className,
  /** Skip the container's own surface — for sections that provide their own. */
  bare = false,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
  id?: string;
  className?: string;
  bare?: boolean;
}) {
  return (
    <section id={id} className={cx("px-4 py-3 sm:px-6 sm:py-4", className)}>
      <div
        className={cx(
          "mx-auto w-full max-w-6xl",
          !bare && "rounded-section px-5 py-14 sm:px-10 sm:py-20",
          !bare && TONES[tone],
        )}
      >






        {/* Pin It */}


        
        <div className="mx-auto w-full max-w-4xl">{children}</div>
      </div>
    </section>
  );
}

/** A small eyebrow label. Used sparingly — the brief asks for fewer all-caps lines. */
export function Eyebrow({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "soft" }) {
  return (
    <span
      className={cx(
        "text-xs font-semibold tracking-[0.08em] uppercase",
        tone === "accent" ? "text-accent" : "text-tint-deep-text-soft",
      )}
    >
      {children}
    </span>
  );
}

/** Section heading plus optional supporting line, with consistent rhythm. */
export function SectionHeading({
  eyebrow,
  title,
  children,
  align = "left",
  inverse = false,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  align?: "left" | "center";
  inverse?: boolean;
}) {
  return (
    <div className={cx("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? <Eyebrow tone={inverse ? "soft" : "accent"}>{eyebrow}</Eyebrow> : null}
      <h2
        className={cx(
          "mt-3 text-3xl font-semibold leading-[1.12] tracking-[-0.02em] sm:text-4xl",
          inverse ? "text-tint-deep-text" : "text-primary",
        )}
      >
        {title}
      </h2>
      {children ? (
        <p
          className={cx(
            "mt-4 text-base leading-relaxed",
            inverse ? "text-tint-deep-text-soft" : "text-secondary",
          )}
        >
          {children}
        </p>
      ) : null}
    </div>
  );
}
