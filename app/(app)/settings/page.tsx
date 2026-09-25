import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/empty-state";
import { listLearnerLanguages } from "@/lib/db/learner";
import { loadEntitlements } from "@/lib/db/entitlements";
import { describePlan } from "@/lib/entitlements/features";
import { PlanPanel } from "@/components/billing/plan-panel";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Account settings" };

/**
 * Account-level settings.
 *
 * Plan settings are per language, so this page is a hub rather than a second
 * copy of that form — duplicating it would create two places to change the same
 * values, which is how they drift out of sync.
 */
export default async function AccountSettingsPage() {
  const { user } = await requireProfile();
  const client = await getServerClient();
  const [enrolled, entitlements] = await Promise.all([
    listLearnerLanguages(client),
    loadEntitlements(client),
  ]);

  const plan = describePlan(entitlements);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          Account settings
        </h1>
        <p className="mt-1 text-sm text-secondary">
          Signed in as {user.email ?? "your account"}.
        </p>
      </header>

      <Card>
        <CardHeader
          title="Your languages"
          description="Each language has its own plan, level, streak and progress."
          action={
            <ButtonLink href="/languages?add=1" variant="secondary" size="sm">
              Add a language
            </ButtonLink>
          }
        />
        <ul className="mt-4 flex flex-col gap-2">
          {enrolled.map((learner) => (
            <li
              key={learner.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-line bg-surface-raised px-4 py-3"
            >
              <span className="flex items-center gap-2.5">
                <span aria-hidden="true" className="text-lg leading-none">
                  {learner.language.flag_emoji ?? "🌐"}
                </span>
                <span>
                  <span className="block text-sm font-medium text-primary">
                    {learner.language.name_en}
                  </span>
                  <span className="block text-xs text-muted">
                    {learner.daily_minutes} min a day ·{" "}
                    {learner.cefr_level ?? "not placed"}
                  </span>
                </span>
                {learner.is_primary ? <Badge tone="accent">Primary</Badge> : null}
              </span>
              <Link
                href={`/${learner.language_code}/settings`}
                className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent hover:underline"
              >
                Edit plan
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <PlanPanel
        planName={plan.name}
        isPremium={plan.isPremium}
        entitlements={entitlements}
      />

      <Card>
        <CardHeader
          title="Accessibility"
          description="What this build already does."
        />
        <ul className="mt-4 flex flex-col gap-2 text-sm text-secondary">
          <li>Full keyboard navigation, including a skip link on every app page.</li>
          <li>Visible focus outlines on every interactive element.</li>
          <li>Light and dark themes driven by your system preference.</li>
          <li>
            Reduced-motion preferences respected; no animation is required to
            understand any state.
          </li>
          <li>
            Progress and skill indicators always carry a text label — colour is
            never the only signal.
          </li>
        </ul>
      </Card>
    </div>
  );
}
