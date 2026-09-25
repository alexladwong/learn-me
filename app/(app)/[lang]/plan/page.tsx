import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/empty-state";
import { loadLanguageContext } from "@/lib/db/context";
import { listLessons, pickNextLesson, startingLevel } from "@/lib/db/lessons";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";
import {
  MOTIVATION_LABELS,
  SKILL_LABELS,
  type Motivation,
  type Skill,
} from "@/lib/types";
import { LEVEL_CHOICES } from "@/lib/onboarding/answers";

export const metadata: Metadata = { title: "Your plan" };

/**
 * The plan onboarding produced.
 *
 * Onboarding used to end by dropping the learner on a dashboard with no
 * acknowledgement that six questions had just been answered. This is the
 * pay-off: it states back what was built — the level, the daily target, the
 * priorities, the reason — and names the exact first lesson.
 *
 * Everything here is read from the database rather than carried in a query
 * string, so refreshing or revisiting shows the same plan and cannot drift from
 * what was actually saved. If there is no plan yet, this route is not for this
 * learner and sends them to onboarding.
 */
export default async function PlanPage({ params }: PageProps<"/[lang]/plan">) {
  const { lang } = await params;
  await requireProfile();

  const { language, learnerOrNull } = await loadLanguageContext(lang, {
    requireEnrollment: false,
  });

  // No plan to summarise — this page is the end of onboarding, not a substitute
  // for it.
  if (!learnerOrNull) redirect(`/${lang}/onboarding`);

  const client = await getServerClient();
  const lessons = await listLessons(client, language.code);
  const next = pickNextLesson(
    lessons,
    new Set(),
    startingLevel(learnerOrNull.cefr_level, learnerOrNull.cefr_goal),
  );

  const levelChoice = LEVEL_CHOICES.find(
    (choice) => choice.value === (learnerOrNull.cefr_level ?? "unsure"),
  );

  const motivations = learnerOrNull.motivation as Motivation[];
  const skills = learnerOrNull.skill_priorities as Skill[];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          Your plan is ready
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
          Your {language.name_en} plan
        </h1>
        <p className="mt-3 text-base text-secondary">
          Built from your six answers. Nothing here is fixed — change any of it in
          settings and the plan follows.
        </p>
      </header>

      <Card tone="raised">
        <dl className="grid gap-5 sm:grid-cols-2">
          <Summary
            label="Language"
            value={language.name_native}
            note={language.name_en}
            dir={language.direction === "rtl" ? "rtl" : undefined}
          />
          <Summary
            label="Starting level"
            value={levelChoice?.label ?? "Complete beginner"}
            note={learnerOrNull.cefr_level ?? "Placed as you go"}
          />
          <Summary
            label="Daily target"
            value={`${learnerOrNull.daily_minutes} minutes`}
            note="Sized to what you said you can keep"
          />
          <Summary
            label="Aiming for"
            value={
              LEVEL_CHOICES.find((choice) => choice.value === learnerOrNull.cefr_goal)
                ?.label ??
              learnerOrNull.cefr_goal ??
              "Not set"
            }
            note={learnerOrNull.cefr_goal}
          />
        </dl>

        <div className="mt-6 flex flex-col gap-4 border-t border-line pt-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Your reason
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {motivations.length > 0 ? (
                motivations.map((motivation) => (
                  <Badge key={motivation} tone="muted">
                    {MOTIVATION_LABELS[motivation] ?? motivation}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-secondary">Not specified</span>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Your focus
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {skills.length > 0 ? (
                skills.map((skill) => (
                  <Badge key={skill} tone="accent">
                    {SKILL_LABELS[skill] ?? skill}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-secondary">Not specified</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {next ? (
        <Card>
          <CardHeader
            title="Start here"
            description={`The first lesson your plan points at — ${next.lesson.unitTitle}.`}
          />
          <div className="mt-4 flex flex-col gap-4">
            <div className="rounded-[var(--radius)] border border-line bg-surface-sunken p-4">
              <div className="flex flex-wrap items-center gap-2">
                {next.lesson.cefrLevel ? (
                  <Badge tone="muted">{next.lesson.cefrLevel}</Badge>
                ) : null}
                <span className="text-xs text-muted">
                  {next.lesson.stepCount} exercises · about{" "}
                  {next.lesson.estimatedMinutes} min
                </span>
              </div>
              <p className="mt-2 text-lg font-semibold tracking-tight text-primary">
                {next.lesson.title}
              </p>
              {next.lesson.description ? (
                <p className="mt-1 text-sm text-secondary">{next.lesson.description}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <ButtonLink
                href={`/${language.code}/lesson/${next.lesson.missionId}`}
                size="lg"
                fullWidth
              >
                Start my first lesson
                <Icon name="arrowRight" size={16} />
              </ButtonLink>
              <ButtonLink
                href={`/${language.code}/path`}
                variant="secondary"
                size="lg"
                fullWidth
              >
                See the whole path
              </ButtonLink>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="No lessons published yet"
            description={`There is no playable ${language.name_en} content at your level yet. Your plan is saved and will use it as soon as it exists.`}
          />
          <div className="mt-4">
            <ButtonLink href="/languages" variant="secondary" size="lg">
              Choose another language
            </ButtonLink>
          </div>
        </Card>
      )}

      <p className="text-center text-xs text-muted">
        You can review or change all of this in{" "}
        <Link href={`/${language.code}/settings`} className="font-medium text-accent hover:underline">
          settings
        </Link>
        .
      </p>
    </div>
  );
}

function Summary({
  label,
  value,
  note,
  dir,
}: {
  label: string;
  value: string;
  note?: string | null;
  dir?: "rtl";
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1">
        <span
          className="block text-lg font-semibold tracking-tight text-primary"
          dir={dir}
        >
          {value}
        </span>
        {note ? <span className="mt-0.5 block text-xs text-secondary">{note}</span> : null}
      </dd>
    </div>
  );
}
