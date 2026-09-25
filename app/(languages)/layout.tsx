import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";
import { Icon } from "@/components/ui/icon";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Your languages",
  description: `Choose what to learn next in ${APP_NAME}.`,
};

/**
 * Layout for language selection.
 *
 * This route deliberately sits **outside** `app/(app)/`, and that is the fix for
 * a redirect loop rather than a matter of taste. The app shell redirects a
 * learner with no languages to `/languages` — but `/languages` is the page that
 * lets them create one, so while it lived inside that shell the redirect applied
 * to it too and it redirected to itself forever:
 *
 *     /languages -> 307 -> /languages
 *
 * The learner saw a blank screen and the server logged a stream error on every
 * attempt. Onboarding is in its own group for exactly the same reason.
 *
 * The guard here is the session only. There is no navigation shell because a
 * learner at this point has no language to scope navigation to — every link in
 * that shell would point at a route that does not exist for them yet.
 */
export default async function LanguagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The authoritative check. `proxy.ts` also gates this route, but a redirect in
  // middleware is a convenience, not the boundary.
  await requireSession("/languages");

  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-3.5">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-primary"
          >
            <span className="flex size-7 items-center justify-center rounded-[var(--radius-sm)] bg-accent text-on-accent">
              <Icon name="globe" size={16} />
            </span>
            {APP_NAME}
          </Link>
        </div>
      </header>
      {/* The page itself only renders content — the shell owns width and padding,
          exactly as `app/(app)/layout.tsx` does, so moving the route changed no
          spacing. */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
