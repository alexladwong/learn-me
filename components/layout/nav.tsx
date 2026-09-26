"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { cx } from "@/lib/cx";
import { NAV_ITEMS } from "@/lib/constants";
import { languageFromPath } from "@/lib/routing/language-path";
import { useNavState } from "@/components/layout/nav-state";

function hrefFor(lang: string, segment: string): string {
  return segment ? `/${lang}/${segment}` : `/${lang}`;
}

/**
 * Marks the current section.
 *
 * "Home" is matched exactly (it owns the bare `/[lang]` path) so it does not
 * light up on every nested route; the rest match on their segment.
 */
function isActive(pathname: string, lang: string, segment: string, exact: boolean): boolean {
  const href = hrefFor(lang, segment);
  if (exact) return pathname === href || pathname === `${href}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Persistent desktop sidebar. Icons plus labels — never icon-only. */
/**
 * The desktop navigation rail.
 *
 * This replaced a 260px column of links, which was the single biggest reason the
 * product read as an admin console: it put a permanent list beside every screen
 * and squeezed the content that actually matters. The rail is ~84px, icons with
 * short labels, so learning content gets the width instead.
 *
 * Labels stay visible rather than appearing on hover. An icon rail whose labels
 * must be discovered is harder to use, not more premium, and it is unusable for
 * anyone who cannot hover.
 */
export function SidebarNav({
  lang,
  knownLanguages,
  languageName,
}: {
  /** The persisted active language, used only when the path has none. */
  lang: string;
  /** Every language this learner is enrolled in, so the path can be read. */
  knownLanguages: string[];
  languageName: string;
}) {
  const pathname = usePathname();

  /*
   * The language comes from the URL, not from `lang`.
   *
   * The rail's links have to point at the language being looked at. Using the
   * persisted primary meant that immediately after a switch — and for as long as
   * a learner browsed their second language — every link in the rail silently
   * sent them back to the first one.
   */
  const current = languageFromPath(pathname, knownLanguages, lang);
  const { state } = useNavState();
  const expanded = state === "expanded";

  return (
    <nav
      aria-label="Main"
      className={cx(
        "flex min-h-0 flex-1 flex-col gap-1 py-4",
        expanded ? "items-stretch px-3" : "items-center px-2",
      )}
    >
      <Link
        href={`/${current}`}
        aria-label={`Learn Me — ${languageName}`}
        title={languageName}
        className={cx(
          "press mb-3 flex shrink-0 items-center gap-2.5 rounded-[var(--radius)] bg-accent text-on-accent",
          expanded ? "h-10 px-2.5" : "size-10 justify-center",
        )}
      >
        <Icon name="globe" size={19} />
        {expanded ? <span className="truncate text-sm font-semibold">Learn Me</span> : null}
      </Link>

      {NAV_ITEMS.map((item) => {
        const exact = item.segment === "";
        const active = isActive(pathname, current, item.segment, exact);

        return (
          <Link
            key={item.key}
            href={hrefFor(current, item.segment)}
            title={item.label}
            aria-current={active ? "page" : undefined}
            className={cx(
              "press flex w-full items-center rounded-[var(--radius)] font-medium",
              expanded
                ? "gap-3 px-3 py-2.5 text-sm"
                : "flex-col gap-1 px-1 py-2.5 text-[11px] leading-none",
              active
                ? "bg-accent-subtle text-accent"
                : "text-muted hover:bg-surface-hover hover:text-primary",
            )}
          >
            <Icon name={item.icon as IconName} size={19} />
            <span className={expanded ? "truncate" : undefined}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Mobile bottom navigation.
 *
 * Fixed to the viewport with `env(safe-area-inset-bottom)` padding so it clears
 * the home indicator on iOS, and 56px tall to stay a comfortable target.
 */
export function BottomNav({
  lang,
  knownLanguages,
}: {
  lang: string;
  knownLanguages: string[];
}) {
  const pathname = usePathname();
  const current = languageFromPath(pathname, knownLanguages, lang);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-raised/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {NAV_ITEMS.map((item) => {
          const exact = item.segment === "";
          const active = isActive(pathname, current, item.segment, exact);

          return (
            <li key={item.key} className="flex-1">
              <Link
                href={hrefFor(current, item.segment)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "press flex h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                  active ? "text-accent" : "text-muted hover:text-secondary",
                )}
              >
                <Icon name={item.icon as IconName} size={19} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
