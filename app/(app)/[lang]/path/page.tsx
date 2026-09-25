import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Badge, CapabilityNotice, EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress";
import { loadLanguageContext } from "@/lib/db/context";
import { listLessons, pickNextLesson, startingLevel } from "@/lib/db/lessons";
import { listMissionCompletions, mostRecentCompletion } from "@/lib/db/missions";
import { listTracksWithProgress } from "@/lib/db/progress";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Learning path" };

/**
 * The guided path.
 *
 * Everything on this page is derived: track progress from `mission_completions`,
 * unit grouping from the authored order indexes, and "up next" from the first
 * mission the learner has not finished. There is no stored "current lesson"
 * pointer to fall out of sync with reality.
 */
export default async function PathPage({ params }: PageProps<"/[lang]/path">) {
  const { lang } = await params;
  await requireProfile();
  const { language, learner } = await loadLanguageContext(lang);
  const client = await getServerClient();

  const [tracks, lessons, completions] = await Promise.all([
    listTracksWithProgress(client, language.code),
    listLessons(client, language.code),
    listMissionCompletions(client, language.code),
  ]);

  // The learner's own level decides where "next" starts, so someone who placed at
  // A2 is not sent back through A1 Foundations.
  const startLevel = startingLevel(learner.cefr_level, learner.cefr_goal);
  const next = pickNextLesson(lessons, completions, startLevel);
  const nextLesson = next?.lesson ?? null;
  const lastCompleted = mostRecentCompletion(completions);

  // Group lessons into their units, preserving the server's ordering.
  const units = new Map<string, { title: string; lessons: typeof lessons }>();
  for (const lesson of lessons) {
    const key = lesson.unitSlug || lesson.unitTitle || "unit";
    const existing = units.get(key);
    if (existing) existing.lessons.push(lesson);
    else units.set(key, { title: lesson.unitTitle || "Unit", lessons: [lesson] });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">
            {language.name_en} path
          </h1>
          <p className="mt-1 text-sm text-secondary">
            {lessons.length > 0
              ? `${completions.size} of ${lessons.length} lessons complete · starting at ${startLevel}`
              : "Structured lessons appear here once content is published."}
          </p>
        </div>
        {lastCompleted ? (
          <Badge tone="success">
            Last finished{" "}
            {new Date(lastCompleted.lastCompletedAt).toLocaleDateString("en", {
              day: "numeric",
              month: "short",
            })}
          </Badge>
        ) : null}
      </header>

      {/* The single most important element: what to do next. */}
      {nextLesson ? (
        <Card tone="raised">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-accent">
                {completions.size === 0
                  ? "Start here"
                  : next?.isRevision
                    ? "Revision below your level"
                    : "Up next"}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-primary">
                {nextLesson.title}
              </h2>
              <p className="mt-0.5 text-sm text-secondary">
                {nextLesson.unitTitle}
                {nextLesson.description ? ` · ${nextLesson.description}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted">
                {nextLesson.stepCount} steps · {nextLesson.itemCount} items · about{" "}
                {nextLesson.estimatedMinutes} minutes
              </p>
              {next?.isRevision ? (
                <p className="mt-2 text-xs text-secondary">
                  You have finished everything published at {startLevel} and above,
                  so this is {nextLesson.cefrLevel} material you have not completed
                  yet. Nothing at a higher level exists for this language yet.
                </p>
              ) : null}
            </div>
            <ButtonLink
              href={`/${language.code}/lesson/${nextLesson.missionId}`}
              size="lg"
              className="shrink-0"
            >
              Start lesson
              <Icon name="arrowRight" size={18} />
            </ButtonLink>
          </div>
        </Card>
      ) : lessons.length > 0 ? (
        <Card>
          <CardHeader
            title="Every published lesson is complete"
            description="Reviews will keep these alive. More content for this language is the next thing to add."
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href={`/${language.code}/review`} variant="secondary" size="sm">
              Go to review
            </ButtonLink>
            <ButtonLink href={`/${language.code}/bank`} variant="secondary" size="sm">
              Open your bank
            </ButtonLink>
          </div>
        </Card>
      ) : null}

      {tracks.length > 0 ? (
        <section aria-labelledby="tracks-heading" className="flex flex-col gap-3">
          <h2 id="tracks-heading" className="text-sm font-semibold text-primary">
            Tracks
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {tracks.map((track) => {
              const known = track.completed_units ?? 0;
              const value = track.total_units > 0 ? known / track.total_units : 0;

              return (
                <li key={track.id}>
                  <Card className="h-full">
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-subtle text-accent"
                      >
                        <Icon name="compass" size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-primary">
                            {track.title}
                          </h3>
                          {track.cefr_band ? (
                            <Badge tone="muted">{track.cefr_band}</Badge>
                          ) : null}
                        </div>
                        <div className="mt-3">
                          <ProgressBar
                            value={value}
                            label="Units completed"
                            valueLabel={`${known} of ${track.total_units}`}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {lessons.length === 0 ? (
        <EmptyState
          icon={<Icon name="learn" size={20} />}
          title="No published lessons yet"
          description={`The guided path for ${language.name_en} has not been authored. Spaced repetition, the word bank and the sentence bank all work in the meantime once you have items.`}
          tone="sunken"
        />
      ) : (
        <section aria-labelledby="lessons-heading" className="flex flex-col gap-5">
          <h2 id="lessons-heading" className="text-sm font-semibold text-primary">
            Lessons
          </h2>

          {[...units.entries()].map(([key, unit]) => {
            const completedInUnit = unit.lessons.filter((lesson) =>
              completions.has(lesson.missionId),
            ).length;

            return (
              <div key={key} className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-medium text-primary">{unit.title}</h3>
                  <span className="text-xs tabular-nums text-muted">
                    {completedInUnit} of {unit.lessons.length} done
                  </span>
                </div>

                <ol className="flex flex-col gap-2">
                  {unit.lessons.map((lesson) => {
                    const completion = completions.get(lesson.missionId);
                    const isNext = nextLesson?.missionId === lesson.missionId;

                    return (
                      <li key={lesson.missionId}>
                        <Link
                          href={`/${language.code}/lesson/${lesson.missionId}`}
                          className="flex min-h-[64px] items-center gap-3 rounded-[var(--radius)] border border-line bg-surface-raised px-4 py-3 transition-colors hover:border-[var(--border-strong)] hover:bg-surface-hover"
                        >
                          <span
                            aria-hidden="true"
                            className={
                              completion
                                ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"
                                : isNext
                                  ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
                                  : "flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-muted"
                            }
                          >
                            <Icon name={completion ? "check" : "learn"} size={16} />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-primary">
                              {lesson.title}
                            </span>
                            <span className="block text-xs text-muted">
                              {lesson.cefrLevel ? `${lesson.cefrLevel} · ` : ""}
                              {lesson.stepCount} steps · {lesson.itemCount} items ·{" "}
                              {lesson.estimatedMinutes} min
                              {completion && completion.completions > 1
                                ? ` · done ${completion.completions}×`
                                : ""}
                            </span>
                          </span>

                          {completion ? (
                            <span className="shrink-0 text-xs font-medium text-success">
                              {completion.accuracy !== null
                                ? `${Math.round(completion.accuracy * 100)}%`
                                : "Done"}
                            </span>
                          ) : isNext ? (
                            <Badge tone="accent">Next</Badge>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </section>
      )}

      <CapabilityNotice
        title="Reading and listening practice without audio"
        description="Listening steps currently show the written form and say so, because no text-to-speech provider has generated audio yet. Real audio, the AI tutor and pronunciation scoring are the next milestones."
      />
    </div>
  );
}
