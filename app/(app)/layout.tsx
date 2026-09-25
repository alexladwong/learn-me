import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { BottomNav, SidebarNav } from "@/components/layout/nav";
import { SignOutForm } from "@/components/layout/sign-out-form";
import { listLearnerLanguages } from "@/lib/db/learner";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";

/**
 * The authenticated application shell.
 *
 * Layout responsibilities:
 *   1. Require a session (the redirect lives in `proxy.ts` too, but this is the
 *      authoritative check for rendering).
 *   2. Provide navigation. Every nav destination is scoped to a language, so a
 *      learner who has not chosen one yet is sent to language selection — the
 *      one place that makes sense without a language.
 *
 * Desktop gets a persistent sidebar, mobile a bottom bar — both driven by the
 * single `NAV_ITEMS` definition so they cannot drift apart.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, profile } = await requireProfile();

  const client = await getServerClient();
  const learnerLanguages = await listLearnerLanguages(client);

  // Nothing to navigate to yet, whether onboarding is unfinished or every
  // language was deactivated. Language selection handles both.
  if (learnerLanguages.length === 0) redirect("/languages");

  const primary = learnerLanguages.find((l) => l.is_primary) ?? learnerLanguages[0];
  const displayName =
    profile.display_name?.trim() || user.email?.split("@")[0] || "there";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      {/* Skip link: the first tab stop, so keyboard users are not forced through
          the whole sidebar on every navigation. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius)] focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-on-accent"
      >
        Skip to content
      </a>

      <aside className="hidden border-r border-line bg-surface-raised lg:flex lg:flex-col lg:gap-6 lg:p-4">
        <Link
          href={`/${primary.language_code}`}
          className="flex items-center gap-2 px-2 py-1 text-sm font-semibold tracking-tight"
        >
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-accent text-on-accent">
            <Icon name="globe" size={18} />
          </span>
          {APP_NAME}
        </Link>

        <SidebarNav
          lang={primary.language_code}
          languageName={primary.language.name_en}
          languageFlag={primary.language.flag_emoji}
        />

        <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
          <div className="flex items-center gap-3 px-3 py-1">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold uppercase text-accent"
            >
              {displayName.slice(0, 2)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-primary">
                {displayName}
              </span>
              <span className="block truncate text-xs text-muted">{user.email}</span>
            </span>
          </div>
          <SignOutForm />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Compact mobile header. The bottom bar carries navigation, so this
            holds identity and account actions only. */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <Link
            href={`/${primary.language_code}`}
            className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-accent text-on-accent">
              <Icon name="globe" size={16} />
            </span>
            <span className="truncate">
              {primary.language.flag_emoji ? `${primary.language.flag_emoji} ` : ""}
              {displayName}
            </span>
          </Link>
          <div className="shrink-0">
            <SignOutForm />
          </div>
        </header>

        <main
          id="main"
          className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8"
        >
          {children}
        </main>
      </div>

      <BottomNav lang={primary.language_code} />
    </div>
  );
}
