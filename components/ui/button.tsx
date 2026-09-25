import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors " +
  "disabled:pointer-events-none disabled:opacity-50 select-none " +
  // A link styled as a button inherits the same floor, so an inline action in a
  // card header is as easy to hit as a primary one.
  "min-h-[44px]";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary:
    "bg-surface-raised text-primary border border-line-strong hover:bg-surface-hover",
  ghost: "text-secondary hover:bg-surface-hover hover:text-primary",
  danger: "bg-danger text-on-accent hover:opacity-90",
};

/**
 * Every size meets the 44px touch-target minimum on a phone, and only relaxes to
 * a denser height from the `sm` breakpoint up where a pointer is likely.
 *
 * This is enforced here rather than left to call sites because measurement in
 * headless Chrome found twelve controls between 16 and 40 pixels tall in real
 * screens — the mode switcher, secondary card actions, and disclosure summaries.
 * A touch target below 44px is not merely tight on a phone; it is a mis-tap
 * waiting to happen, and this product is used one-handed on a bus.
 *
 * `sm` is still the dense variant. It is simply never dense on a phone.
 */
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-[44px] px-3 text-sm rounded-sm sm:min-h-0 sm:h-9",
  md: "min-h-[44px] px-4 text-sm rounded-[var(--radius)]",
  // Was `px-6 text-base rounded`, which at 48px tall and fully rounded read as a
  // toy button. A primary action should be unmistakable, not oversized.
  lg: "min-h-[48px] px-5 text-sm rounded-[var(--radius)]",
};

const widthFull = "w-full";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
};

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(base, variants[variant], sizes[size], fullWidth && widthFull, className)}
      {...props}
    >
      {children}
    </button>
  );
}

type ButtonLinkProps = CommonProps & {
  href: string;
  prefetch?: boolean;
  "aria-label"?: string;
};

/**
 * A link styled as a button. Kept separate from `Button` so a navigation action
 * stays a real anchor (middle-click, open-in-new-tab, and screen-reader
 * "link" semantics all keep working).
 */
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={cx(base, variants[variant], sizes[size], fullWidth && widthFull, className)}
      {...props}
    >
      {children}
    </Link>
  );
}
