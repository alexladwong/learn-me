import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { BottomNav, SidebarNav } from "@/components/layout/nav";
import { PageTransition } from "@/components/layout/page-transition";
import { NavToggle } from "@/components/layout/nav-state";
import { AccountMenu } from "@/components/layout/account-menu";
import { SignOutForm } from "@/components/layout/sign-out-form";
import {
  LanguageSwitcher,
  type SwitcherLanguage,
} from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { listLearnerLanguages } from "@/lib/db/learner";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";

/**
 * The authenticated application shell.
 *
 * Recomposed around width. The previous shell spent 260px on a persistent link
 * column and put the learner's language in a sidebar footer — which is why the
 * product read as an admin system with content squeezed beside it.
 *
 * Now:
 *   - a **compact rail** (~84px) holds navigation,
 *   - a **top utility bar** holds the things a learner actually changes mid-task:
 *     which language they are in, appearance, and their account,
 *   - content gets the remaining width.
 *
 * The language switcher moving to the top bar is the specific fix for "language
 * context should not consume a sidebar region": it is a contextual choice about
 * the current screen, so it belongs next to the screen's title, not in the
 * navigation.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, profile } = await requireProfile();

  const client = await getServerClient();
  const learnerLanguages = await listLearnerLanguages(client);

  // Nothing to navigate to yet, whether onboarding is unfinished or every
  // language was deactivated. Language selection handles both.
  if (learnerLanguages.length === 0) redirect("/languages");

  const primary = learnerLanguages.find((l) => l.is_primary) ?? learnerLanguages[0];
  const displayName = profile.display_name?.trim() || user.email?.split("@")[0] || "there";

  /*
   * Everything the switcher needs, built here so the client component never
   * reads the database. `is_primary` travels with it only as the fallback for
   * paths that carry no language; the URL stays the source of truth for which
   * language is displayed.
   */
  const switcherLanguages: SwitcherLanguage[] = learnerLanguages.map((entry) => ({
    code: entry.language_code,
    name: entry.language.name_en,
    nativeName: entry.language.name_native,
    flag: entry.language.flag_emoji,
    level: entry.cefr_level,
    isPrimary: entry.is_primary,
  }));
  const knownLanguages = learnerLanguages.map((entry) => entry.language_code);

  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[var(--nav-width)_minmax(0,1fr)]">
      {/* Skip link: the first tab stop, so keyboard users are not forced through
          the rail on every navigation. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius)] focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-on-accent"
      >
        Skip to content
      </a>

      {/* ---- Rail (desktop) ------------------------------------------------ */}
      <aside
        id="app-rail"
        className="sticky top-0 hidden h-dvh overflow-hidden border-r border-line bg-surface-raised transition-[width] duration-200 lg:flex lg:flex-col"
      >
        <SidebarNav
          lang={primary.language_code}
          knownLanguages={knownLanguages}
          languageName={primary.language.name_en}
        />

        <div className="rail-footer mt-auto flex flex-col items-center gap-3 border-t border-line px-2 py-4">
          <Link
            href={`/${primary.language_code}/settings`}
            title={`${displayName} — account settings`}
            aria-label="Account settings"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold uppercase text-accent transition-colors hover:bg-accent-subtle"
          >
            {displayName.slice(0, 2)}
          </Link>
          <SignOutForm />
          <NavToggle />
        </div>
      </aside>

      {/* The column width animates with the rail, so the content slides
            rather than jumping. */}
      <div className="flex min-w-0 flex-col transition-[padding] duration-200">
        {/* ---- Top utility bar --------------------------------------------- */}
        <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
          <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
            {/* Mobile identity. The wordmark is the first thing to go at 320px:
                the switcher beside it is a control, this is a label. */}
            <Link
              href={`/${primary.language_code}`}
              className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-semibold tracking-tight lg:hidden"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] bg-accent text-on-accent">
                <Icon name="globe" size={15} />
              </span>
              <span className="hidden truncate sm:inline">{APP_NAME}</span>
            </Link>

            {/* Language context: a dropdown that switches in place, not a link
                through a picker page that unmounts the whole shell. */}
            <LanguageSwitcher languages={switcherLanguages} className="min-w-0" />

            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <Link
                href={`/${primary.language_code}/settings`}
                aria-label="Settings"
                title="Settings"
                className="flex size-9 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-surface-hover hover:text-primary"
              >
                <Icon name="settings" size={17} />
              </Link>
              {/*
                The account menu, on every screen size.

                This was a decorative span showing two initials, and sign out was
                reachable only in the desktop rail's footer — which is `hidden`
                below `lg`, so a phone had no way out at all. Same trigger, now a
                real control.
              */}
              <AccountMenu
                name={displayName}
                email={user.email ?? "Signed in"}
                lang={primary.language_code}
                initials={displayName.slice(0, 2)}
              />
            </div>
          </div>
        </header>

        <main
          id="main"
          className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7"
        >
          {/* Replays a short enter animation per route; see the component for
              why it does not remount the page. */}
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <BottomNav lang={primary.language_code} knownLanguages={knownLanguages} />
    </div>
  );
}
