import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Badge,
  CapabilityNotice,
  EmptyState,
} from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress";
import { loadLanguageContext } from "@/lib/db/context";
import { listLessons, pickNextLesson, startingLevel } from "@/lib/db/lessons";
import {
  listMissionCompletions,
  mostRecentCompletion,
} from "@/lib/db/missions";
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
 *
 * The composition is a route rather than a list. Before this pass the page was a
 * document outline — "Tracks", "Lessons", then bare headings and a stack of
 * full-width rows — which answered "what exists" but never "where am I". A
 * learner opens this page to find out one thing: what comes next. So the answer
 * to that is the largest object on the screen, and everything the learner has
 * already done is drawn as a single connected spine underneath it, with real
 * progress on it and a milestone at each unit.
 *
 * Nothing here is decorative. The spine is drawn only because units really are
 * ordered; a node is filled only because that mission has a completion row; a
 * milestone is marked complete only when every lesson in its unit is.
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
    else
      units.set(key, { title: lesson.unitTitle || "Unit", lessons: [lesson] });
  }

  const unitList = [...units.entries()];
  const done = completions.size;
  const total = lessons.length;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            {language.name_en}
          </p>
          <h1 className="mt-2 text-[1.75rem] font-semibold leading-tight tracking-tight text-primary sm:text-4xl">
            Your path
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-secondary">
            {total > 0
              ? `${done} of ${total} lessons complete, ordered from ${startLevel} upward. Each unit builds on the one before it.`
              : "Structured lessons appear here once content is published for this language."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:w-64 sm:items-end">
          {total > 0 ? (
            <div className="w-full">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-medium text-muted">
                  Route complete
                </span>
                <span className="text-xs tabular-nums text-secondary">
                  {done} / {total}
                </span>
              </div>
              <ProgressBar
                className="mt-2"
                hideLabel
                value={done / total}
                label={`${done} of ${total} lessons complete`}
              />
            </div>
          ) : null}
          {lastCompleted ? (
            <Badge tone="success">
              Last finished{" "}
              {new Date(lastCompleted.lastCompletedAt).toLocaleDateString(
                "en",
                {
                  day: "numeric",
                  month: "short",
                },
              )}
            </Badge>
          ) : null}
        </div>
      </header>

      {/* The single most important element: what to do next. */}
      {nextLesson ? (
        <section
          aria-labelledby="next-heading"
          className="rounded-[var(--radius-section)] bg-[var(--tint-mint)] p-5 sm:p-8"
        >
          <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                {done === 0
                  ? "Start here"
                  : next?.isRevision
                    ? "Revision below your level"
                    : "Up next"}
              </p>
              <h2
                id="next-heading"
                className="text-target mt-2.5 font-semibold leading-tight tracking-tight text-primary"
              >
                {nextLesson.title}
              </h2>
              <p className="mt-1.5 text-sm font-medium text-secondary">
                {nextLesson.unitTitle}
              </p>
              {nextLesson.description ? (
                <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-secondary">
                  {nextLesson.description}
                </p>
              ) : null}
              <p className="mt-3 text-xs text-muted">
                {nextLesson.stepCount} steps · {nextLesson.itemCount} items
                {/* The length is stated only when the mission states one. */}
                {nextLesson.estimatedMinutes !== null
                  ? ` · about ${nextLesson.estimatedMinutes} minutes`
                  : ""}
              </p>
              {next?.isRevision ? (
                <p className="mt-3 max-w-xl text-xs leading-relaxed text-secondary">
                  You have finished everything published at {startLevel} and
                  above, so this is {nextLesson.cefrLevel} material you have not
                  completed yet. Nothing at a higher level exists for this
                  language yet.
                </p>
              ) : null}
            </div>

            <ButtonLink
              href={`/${language.code}/lesson/${nextLesson.missionId}`}
              size="lg"
              className="w-full shrink-0 justify-center lg:w-auto"
            >
              Start lesson
              <Icon name="arrowRight" size={18} />
            </ButtonLink>
          </div>
        </section>
      ) : total > 0 ? (
        <section className="rounded-[var(--radius-section)] bg-[var(--tint-mint)] p-5 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight text-primary sm:text-2xl">
            Every published lesson is complete
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-secondary">
            Reviews will keep these alive. More content for this language is the
            next thing to add.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href={`/${language.code}/review`} size="lg">
              Go to review
            </ButtonLink>
            <ButtonLink
              href={`/${language.code}/bank`}
              variant="secondary"
              size="lg"
            >
              Open your bank
            </ButtonLink>
          </div>
        </section>
      ) : null}

      {/* Levels: what the whole route adds up to, on a quieter surface than the
          next lesson, because it is context rather than a decision. */}
      {tracks.length > 0 ? (
        <section
          aria-labelledby="tracks-heading"
          className="rounded-[var(--radius-section)] bg-[var(--tint-mist)] p-5 sm:p-7"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="tracks-heading"
              className="text-sm font-semibold text-primary"
            >
              Levels you are working through
            </h2>
            <span className="text-xs text-muted">
              {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
            </span>
          </div>

          <ul className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {tracks.map((track) => {
              const known = track.completed_units ?? 0;
              const value =
                track.total_units > 0 ? known / track.total_units : 0;

              return (
                <li key={track.id}>
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="flex size-7 shrink-0 items-center justify-center rounded-[0.5rem] bg-surface-raised text-accent"
                    >
                      <Icon name="compass" size={15} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">
                      {track.title}
                    </span>
                    {track.cefr_band ? (
                      <span className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 text-[11px] font-medium tabular-nums text-secondary">
                        {track.cefr_band}
                      </span>
                    ) : null}
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {known} of {track.total_units} units
                    </span>
                  </div>
                  <ProgressBar
                    className="mt-3"
                    hideLabel
                    value={value}
                    label={`${track.title}: ${known} of ${track.total_units} units completed`}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {total === 0 ? (
        <EmptyState
          icon={<Icon name="learn" size={20} />}
          title="No published lessons yet"
          description={`The guided path for ${language.name_en} has not been authored. Spaced repetition, the word bank and the sentence bank all work in the meantime once you have items.`}
          tone="sunken"
        />
      ) : (
        <section
          aria-labelledby="route-heading"
          className="flex flex-col gap-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="route-heading"
              className="text-lg font-semibold tracking-tight text-primary"
            >
              The route
            </h2>
            <span className="text-xs tabular-nums text-muted">
              {unitList.length} {unitList.length === 1 ? "unit" : "units"} ·{" "}
              {done} of {total} done
            </span>
          </div>

          {/*
            The spine. One continuous line behind every unit and lesson, so the
            order the curriculum was authored in is visible rather than implied.
            `aria-hidden`: it carries no information a screen reader needs.
          */}
          <ol className="relative flex flex-col gap-9">
            <span
              aria-hidden="true"
              className="absolute bottom-6 left-4 top-6 w-px bg-line-strong"
            />

            {unitList.map(([key, unit]) => {
              const completedInUnit = unit.lessons.filter((lesson) =>
                completions.has(lesson.missionId),
              ).length;
              const unitComplete = completedInUnit === unit.lessons.length;

              return (
                <li key={key} className="relative">
                  <div className="flex items-center gap-4">
                    <span
                      aria-hidden="true"
                      className={
                        unitComplete
                          ? "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-[0.625rem] bg-accent text-on-accent"
                          : "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-[0.625rem] border border-line bg-surface-raised text-accent"
                      }
                    >
                      <Icon
                        name={unitComplete ? "check" : "compass"}
                        size={16}
                      />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <h3 className="text-base font-semibold tracking-tight text-primary">
                        {unit.title}
                      </h3>
                      <span className="text-xs tabular-nums text-muted">
                        {completedInUnit} of {unit.lessons.length} done
                      </span>
                    </div>
                  </div>

                  <ol className="mt-4 flex flex-col gap-3">
                    {unit.lessons.map((lesson) => {
                      const completion = completions.get(lesson.missionId);
                      const isNext = nextLesson?.missionId === lesson.missionId;

                      return (
                        <li
                          key={lesson.missionId}
                          /*
                           * The node is the row's first child rather than an
                           * absolutely positioned mark. Both put it on the
                           * spine, but only this one cannot drift: the unit
                           * node above is laid out the same way, so the two
                           * stay on one vertical line by construction.
                           */
                          className="flex items-center gap-4"
                        >
                          <span
                            aria-hidden="true"
                            className={
                              completion
                                ? "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"
                                : isNext
                                  ? "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
                                  : "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-raised text-muted"
                            }
                          >
                            <Icon
                              name={completion ? "check" : "learn"}
                              size={15}
                            />
                          </span>

                          <Link
                            href={`/${language.code}/lesson/${lesson.missionId}`}
                            aria-current={isNext ? "step" : undefined}
                            className={
                              isNext
                                ? "flex min-h-[64px] min-w-0 flex-1 items-center gap-4 rounded-[var(--radius-xl)] border border-accent bg-accent-subtle px-5 py-3.5 transition-colors"
                                : "flex min-h-[64px] min-w-0 flex-1 items-center gap-4 rounded-[var(--radius-xl)] border border-line bg-surface-raised px-5 py-3.5 transition-colors hover:border-[var(--border-strong)] hover:bg-surface-hover"
                            }
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-primary">
                                {lesson.title}
                              </span>
                              <span className="block text-xs text-muted">
                                {lesson.cefrLevel
                                  ? `${lesson.cefrLevel} · `
                                  : ""}
                                {lesson.stepCount} steps · {lesson.itemCount} items
                                {lesson.estimatedMinutes !== null
                                  ? ` · ${lesson.estimatedMinutes} min`
                                  : ""}
                                {completion && completion.completions > 1
                                  ? ` · done ${completion.completions}×`
                                  : ""}
                              </span>
                            </span>

                            {completion ? (
                              <span className="shrink-0 text-xs font-medium tabular-nums text-success">
                                {completion.accuracy !== null
                                  ? `${Math.round(completion.accuracy * 100)}%`
                                  : "Done"}
                              </span>
                            ) : isNext ? (
                              <Badge tone="accent">Next</Badge>
                            ) : (
                              <Icon
                                name="arrowRight"
                                size={16}
                                className="shrink-0 text-muted"
                              />
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <CapabilityNotice
        title="Reading and listening practice without audio"
        description="Listening steps currently show the written form and say so, because no text-to-speech provider has generated audio yet. Real audio, the AI tutor and pronunciation scoring are the next milestones."
      />
    </div>
  );
}
