"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { cx } from "@/lib/cx";
import { NAV_ITEMS } from "@/lib/constants";

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
export function SidebarNav({
  lang,
  languageName,
  languageFlag,
}: {
  lang: string;
  languageName: string;
  languageFlag: string | null;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const exact = item.segment === "";
        const active = isActive(pathname, lang, item.segment, exact);

        return (
          <Link
            key={item.key}
            href={hrefFor(lang, item.segment)}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex min-h-[44px] items-center gap-3 rounded-[var(--radius)] px-3 text-sm font-medium transition-colors",
              active
                ? "bg-accent-subtle text-accent"
                : "text-secondary hover:bg-surface-hover hover:text-primary",
            )}
          >
            <Icon name={item.icon as IconName} size={18} />
            {item.label}
          </Link>
        );
      })}

      <div className="mt-4 border-t border-line pt-4">
        <Link
          href="/languages"
          className="flex min-h-[44px] items-center gap-3 rounded-[var(--radius)] px-3 text-sm font-medium text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
        >
          <span aria-hidden="true" className="w-[18px] text-center">
            {languageFlag ?? "🌐"}
          </span>
          <span className="min-w-0 flex-1 truncate">{languageName}</span>
        </Link>
      </div>
    </nav>
  );
}

/**
 * Mobile bottom navigation.
 *
 * Fixed to the viewport with `env(safe-area-inset-bottom)` padding so it clears
 * the home indicator on iOS, and 56px tall to stay a comfortable target.
 */
export function BottomNav({ lang }: { lang: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {NAV_ITEMS.map((item) => {
          const exact = item.segment === "";
          const active = isActive(pathname, lang, item.segment, exact);

          return (
            <li key={item.key} className="flex-1">
              <Link
                href={hrefFor(lang, item.segment)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  active ? "text-accent" : "text-muted hover:text-secondary",
                )}
              >
                <Icon name={item.icon as IconName} size={20} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
