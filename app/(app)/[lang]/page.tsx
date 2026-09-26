import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { CapabilityNotice, EmptyState } from "@/components/ui/empty-state";
import { ProgressBar, ProgressRing, StatTile } from "@/components/ui/progress";
import { loadLanguageContext } from "@/lib/db/context";
import { getUserStats, refreshDueCount } from "@/lib/db/learner";
import { getWeeklySummary, listTracksWithProgress } from "@/lib/db/progress";
import {
  composeTodaySession,
  minutesForMode,
  recommendNext,
} from "@/lib/learning/session";
import { listLessons, pickNextLesson, startingLevel } from "@/lib/db/lessons";
import { listMissionCompletions } from "@/lib/db/missions";
import { listConfusionPatterns } from "@/lib/db/confusions";
import { ConfusionSummaryCard } from "@/components/learning/dna-panel";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";
import {
  LEARNING_MODES,
  LEARNING_MODE_META,
  MOTIVATION_LABELS,
  type LearningMode,
  type Motivation,
} from "@/lib/types";
import { ModeSwitcher } from "./mode-switcher";
import { LearningPulse, SpeechWave, type PulseItem } from "@/components/learning/learning-pulse";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  return { title: `${lang.toUpperCase()} dashboard` };
}

/** Narrow an arbitrary query value to a mode the composer understands. */
function parseMode(value: string | string[] | undefined): LearningMode {
  const candidate = typeof value === "string" ? value : "";
  return (LEARNING_MODES as readonly string[]).includes(candidate)
    ? (candidate as LearningMode)
    : "study";
}

function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatMinutes(totalSeconds: number): string | null {
  if (totalSeconds <= 0) return null;
  const minutes = Math.round(totalSeconds / 60);
  return minutes < 1 ? "<1" : String(minutes);
}

/**
 * The dashboard.
 *
 * Its only job is to answer "what do I do right now" in about two seconds:
 * greeting, how long today will take, how many cards are waiting, and one
 * primary action. Everything else is secondary and deliberately below/right.
 *
 * Every number here is read from the database. Where a metric has no evidence
 * yet, the tile says "Not yet" rather than showing a zero that implies a
 * measurement was made.
 */
export default async function DashboardPage({
  params,
  searchParams,
}: PageProps<"/[lang]">) {
  const { lang } = await params;
  const query = await searchParams;
  const mode = parseMode(query.mode);
  const { profile } = await requireProfile();
  const { language, learner } = await loadLanguageContext(lang);
  const client = await getServerClient();

  // Authoritative due count, then the composed session, then the secondary
  // panels. Sequential because the session depends on the due count.
  await refreshDueCount(client, null);
  const stats = await getUserStats(client, language.code);

  const [weekly, tracks, lessons, completions, patterns] = await Promise.all([
    getWeeklySummary(client, language.code, 7),
    listTracksWithProgress(client, language.code),
    listLessons(client, language.code),
    listMissionCompletions(client, language.code),
    listConfusionPatterns(client, language.code, { limit: 3 }),
  ]);

  const next = pickNextLesson(
    lessons,
    completions,
    startingLevel(learner.cefr_level, learner.cefr_goal),
  );
  const nextLesson = next?.lesson ?? null;

  // The next mission is resolved first so the session can state its real length.
  // The composer used to assume eight minutes for every lesson, which is a
  // duration no authored mission had claimed.
  const session = await composeTodaySession(client, learner, mode, {
    lessonMinutes: nextLesson?.estimatedMinutes ?? null,
  });

  const recommendation = recommendNext(learner, stats, weekly);

  const displayName =
    profile.display_name?.trim() || profile.native_language || "there";
  const greeting = greetingFor(new Date());

  // The single next action. Reviews always win, because a missed review costs
  // real retention; new material can wait a day, forgetting cannot.
  const nextAction =
    session.items.find((item) => item.kind === "review" && item.href) ??
    session.items.find((item) => Boolean(item.href));

  // What one tap should do. A due review always wins over new material, because
  // a missed review costs real retention while a new lesson can wait a day.
  const startHref =
    nextAction?.href ??
    (nextLesson
      ? `/${language.code}/lesson/${nextLesson.missionId}`
      : `/${language.code}/path`);
  const startLabel = nextAction
    ? "Start today's session"
    : nextLesson
      ? `Start: ${nextLesson.title}`
      : "Open the learning path";

  const currentMode = LEARNING_MODE_META[mode];

  /*
   * One length per mode, from the same function that composes the session. The
   * chips used to read hardcoded constants (`study: 30`) while the session used
   * the learner's own budget, so a twenty-minute learner was shown "Study 30m".
   */
  const modeMinutes = Object.fromEntries(
    LEARNING_MODES.map((entry) => [entry, minutesForMode(entry, learner.daily_minutes)]),
  ) as Record<LearningMode, number | null>;
  const goalProgress =
    session.goalMinutes > 0 ? Math.min(1, session.totalMinutes / session.goalMinutes) : 0;

  const hasAnyActivity = Boolean(stats && stats.total_reviews > 0);
  const primaryTrack = tracks[0];

  /** The pulse strip: one band, real values, em dash where nothing is measured. */
  const pulse: PulseItem[] = [
    {
      label: "Streak",
      value: stats && stats.streak_current > 0 ? stats.streak_current : null,
      icon: "flame",
      hint: stats?.streak_current ? "days in a row" : "start today",
    },
    {
      label: "Words",
      value: stats && stats.words_learned > 0 ? stats.words_learned : null,
      icon: "plus",
      hint: "in your bank",
    },
    {
      label: "Sentences",
      value: stats && stats.sentences_mastered > 0 ? stats.sentences_mastered : null,
      icon: "book",
      hint: "mastered",
    },
    {
      label: "Reviews",
      value: stats && stats.total_reviews > 0 ? stats.total_reviews : null,
      icon: "cards",
      hint: "all time",
      trend: weekly && weekly.reviews > 0 ? Math.min(1, weekly.reviews / 50) : null,
    },
    {
      label: "Listening",
      value: stats && stats.listening_seconds > 0 ? formatMinutes(stats.listening_seconds) : null,
      icon: "volume",
      hint: "minutes",
    },
    {
      label: "Speaking",
      value: stats && stats.speaking_seconds > 0 ? formatMinutes(stats.speaking_seconds) : null,
      icon: "speak",
      hint: "minutes",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* ---- Greeting ------------------------------------------------------ */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-primary sm:text-3xl">
            {greeting}, {displayName}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-secondary">
            <span className="font-medium text-primary">{language.name_native}</span>
            <span aria-hidden="true" className="text-muted">·</span>
            <span>
              {learner.cefr_level ? `${learner.cefr_level} → ${learner.cefr_goal}` : "Level not set"}
            </span>
            <span aria-hidden="true" className="text-muted">·</span>
            <span>{learner.daily_minutes} min a day</span>
          </p>
        </div>
        {stats?.streak_current ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-raised px-3 py-1.5 text-xs font-medium text-secondary">
            <Icon name="flame" size={13} />
            {stats.streak_current}-day streak
          </span>
        ) : null}
      </header>

      {/* ---- Today's learning: the hero composition ------------------------ */}
      <section
        aria-labelledby="today-heading"
        className="relative overflow-hidden rounded-[var(--radius-section)] bg-[var(--tint-mint)] px-5 py-7 sm:px-10 sm:py-10"
      >
        {/* The one piece of visual language on the page: a speech shape, tied to
            what the product is about rather than being abstract decoration. */}
        <SpeechWave
          bars={34}
          className="pointer-events-none absolute inset-x-6 bottom-6 h-10 text-accent sm:inset-x-10"
        />

        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-12">
          <ProgressRing
            value={goalProgress}
            primary={session.totalMinutes > 0 ? `${session.totalMinutes}` : "—"}
            secondary={
              session.totalMinutes > 0 ? `of ${session.goalMinutes} min` : "nothing queued"
            }
            label={`Daily goal: ${session.totalMinutes} of ${session.goalMinutes} minutes planned`}
          />

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
              Today&apos;s {language.name_en}
            </p>
            <h2
              id="today-heading"
              className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-primary sm:text-3xl"
            >
              {nextLesson ? nextLesson.title : "Your session is ready"}
            </h2>

            {/* Three real measures, laid out as a line rather than three cards. */}
            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <dt className="text-xs text-muted">Reviews due</dt>
                <dd className="text-lg font-semibold tabular-nums text-primary">
                  {session.items.filter((item) => item.kind === "review").length}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Planned</dt>
                <dd className="text-lg font-semibold tabular-nums text-primary">
                  {session.totalMinutes > 0 ? `${session.totalMinutes} min` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Lessons ready</dt>
                <dd className="text-lg font-semibold tabular-nums text-primary">
                  {session.lessonsAvailable > 0 ? session.lessonsAvailable : "—"}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink href={startHref} size="lg" className="sm:px-7">
                {startLabel}
                <Icon name="arrowRight" size={16} />
              </ButtonLink>
              <div className="sm:min-w-0">
                <ModeSwitcher
                  languageCode={language.code}
                  active={mode}
                  minutes={modeMinutes}
                />
              </div>
            </div>

            {session.items.length === 0 ? (
              <p className="mt-4 text-sm text-secondary">
                No cards are due and no lessons are published for this language yet.
                Choose another language or bring in your own text.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ---- Pulse strip, replacing the six stat boxes --------------------- */}
      <section aria-labelledby="pulse-heading">
        <h2 id="pulse-heading" className="sr-only">
          Your learning at a glance
        </h2>
        <LearningPulse items={pulse} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---- Recommendation + weekly ------------------------------------ */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="What to focus on"
              description="Based only on work you have actually completed."
            />
            {recommendation ? (
              <div className="mt-4">
                <p className="text-sm text-primary">{recommendation.text}</p>
                {recommendation.href && recommendation.cta ? (
                  <div className="mt-4">
                    <ButtonLink href={recommendation.href} variant="secondary" size="sm">
                      {recommendation.cta}
                    </ButtonLink>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-secondary">
                Complete a session to see what to focus on next.
              </p>
            )}
          </Card>

          {patterns.length > 0 ? (
            <ConfusionSummaryCard patterns={patterns} languageCode={language.code} />
          ) : null}

          <Card>
            <CardHeader
              title="This week"
              description={
                weekly ? `${weekly.from} to ${weekly.to}` : "The last seven days"
              }
            />
            {weekly ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Study days" value={weekly.active_days} />
                <StatTile label="Reviews" value={weekly.reviews} />
                <StatTile
                  label="Recall"
                  value={
                    weekly.reviews > 0
                      ? `${Math.round((weekly.reviews_correct / weekly.reviews) * 100)}%`
                      : null
                  }
                />
                <StatTile label="New items" value={weekly.new_items} />
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState
                  title="No activity yet this week"
                  description="Your weekly numbers appear here once you complete a review session."
                />
              </div>
            )}
          </Card>

          {/* ---- Path snapshot ------------------------------------------- */}
          <Card>
            <CardHeader
              title="Your learning path"
              description={
                primaryTrack
                  ? "Where you are in the guided journey."
                  : "Tracks appear once content is published for this language."
              }
              action={
                <Link
                  href={`/${language.code}/path`}
                  className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent hover:underline"
                >
                  View all
                </Link>
              }
            />
            {primaryTrack ? (
              <div className="mt-4">
                <ProgressBar
                  value={
                    primaryTrack.completed_units !== null && primaryTrack.total_units > 0
                      ? primaryTrack.completed_units / primaryTrack.total_units
                      : 0
                  }
                  label={primaryTrack.title}
                  valueLabel={
                    primaryTrack.completed_units === null
                      ? `${primaryTrack.total_units} units`
                      : `${primaryTrack.completed_units} of ${primaryTrack.total_units} units`
                  }
                  size="md"
                />
                <p className="mt-2 text-xs text-muted">
                  {lessons.length > 0
                    ? `${completions.size} of ${lessons.length} lessons complete.`
                    : "No lessons published in this track yet."}
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <CapabilityNotice
                  title="No published tracks yet"
                  description={`The guided path for ${language.name_en} has not been authored yet. Reviews, the word bank and content capture all work in the meantime.`}
                />
              </div>
            )}
          </Card>
        </div>

        {/* ---- Sidebar --------------------------------------------------- */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Your plan" />
            <dl className="mt-4 flex flex-col gap-3 text-sm">
              <PlanRow label="Level" value={learner.cefr_level ?? "Not placed yet"} />
              <PlanRow label="Goal" value={learner.cefr_goal ?? "Not set"} />
              <PlanRow label="Daily time" value={`${learner.daily_minutes} minutes`} />
              <PlanRow
                label="Why"
                value={
                  learner.motivation.length > 0
                    ? learner.motivation
                        .map((m) => MOTIVATION_LABELS[m as Motivation] ?? m)
                        .join(", ")
                    : "Not set"
                }
              />
            </dl>
            <div className="mt-4">
              <Link
                href={`/${language.code}/settings`}
                className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent hover:underline"
              >
                Adjust your plan
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="This session"
              description={`Composed for ${currentMode.label.toLowerCase()}${
                modeMinutes[mode] ? ` · a ${modeMinutes[mode]} minute budget` : ""
              }.`}
            />
            <dl className="mt-4 flex flex-col gap-3 text-sm">
              <PlanRow label="Mode" value={currentMode.label} />
              <PlanRow
                label="Planned"
                value={
                  session.totalMinutes > 0
                    ? `${session.totalMinutes} minutes`
                    : "No fixed budget"
                }
              />
              <PlanRow
                label="Lessons available"
                value={
                  session.lessonsAvailable > 0
                    ? String(session.lessonsAvailable)
                    : "None published yet"
                }
              />
            </dl>
            <p className="mt-3 text-xs text-muted">{currentMode.description}.</p>
          </Card>

          {!hasAnyActivity ? (
            <CapabilityNotice
              title="No progress data yet"
              description="Your streak, recall and skill breakdown stay empty until you complete your first review. Nothing here is estimated or filled in."
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PlanRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-primary">{value}</dd>
    </div>
  );
}
