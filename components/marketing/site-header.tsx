import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { APP_NAME } from "@/lib/constants";

/**
 * The public site header.
 *
 * Fixed to the top and translucent, so a section tint scrolling underneath is
 * visible through it — that is what makes a long page feel like one continuous
 * surface rather than a stack of separate screens.
 *
 * Navigation lists only pages that exist. `Learn`, `Languages` and `How it works`
 * all resolve to real destinations; nothing here is a placeholder, because a nav
 * item that goes nowhere is worse than no nav item.
 */
export function SiteHeader() {
  const nav = [
    { href: "/#languages", label: "Languages" },
    { href: "/#how", label: "How it works" },
    { href: "/#product", label: "Product" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-5 py-3 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-primary"
        >
          <span className="flex size-8 items-center justify-center rounded-[var(--radius)] bg-accent text-on-accent">
            <Icon name="globe" size={17} />
          </span>
          {APP_NAME}
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[var(--radius)] px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink href="/sign-in" variant="ghost" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink href="/sign-up" size="sm">
            Start free
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
