import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

/**
 * The public site footer.
 *
 * Grouped columns rather than a single row of links, because a footer is where a
 * visitor checks whether a product is real: what it teaches, what it is, and how
 * to reach a person. Every link here resolves to a page that exists.
 *
 * **No newsletter form.** The product has no mailing list and no provider wired
 * up, so a signup box would collect addresses and drop them — worse than not
 * offering it. When there is something real to subscribe to, it can go here.
 *
 * The honesty note is deliberate and stays: it is the one claim on this page that
 * distinguishes the product from every other language app.
 */

const GROUPS = [
  {
    title: "Product",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/#product", label: "Lesson player" },
      { href: "/#product", label: "Smart review" },
      { href: "/#progress", label: "Progress" },
    ],
  },
  {
    title: "Languages",
    links: [
      { href: "/#languages", label: "Spanish" },
      { href: "/#languages", label: "French" },
      { href: "/#languages", label: "German" },
      { href: "/#languages", label: "All languages" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/sign-in", label: "Sign in" },
      { href: "/sign-up", label: "Create an account" },
      { href: "/languages", label: "Your languages" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="px-4 pb-4 sm:px-6 sm:pb-6">
      <div className="mx-auto w-full max-w-6xl rounded-[var(--radius-section)] bg-tint-mist px-5 py-14 sm:px-10 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div className="max-w-sm">
            <span className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
              <span className="flex size-8 items-center justify-center rounded-[var(--radius)] bg-accent text-on-accent">
                <Icon name="globe" size={17} />
              </span>
              {APP_NAME}
            </span>
            <p className="mt-4 text-sm leading-relaxed text-secondary">
              {APP_TAGLINE}
            </p>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Every figure in {APP_NAME} comes from your own answers. Where there is
              not enough evidence to state something, the product says so instead of
              inventing a number.
            </p>
          </div>

          {GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                {group.title}
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {group.links.map((link) => (
                  <li key={`${group.title}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-sm text-secondary transition-colors hover:text-accent"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {APP_NAME}
          </p>
          <p className="text-muted">
            Built for the languages people actually need to speak.
          </p>
        </div>
      </div>
    </footer>
  );
}
