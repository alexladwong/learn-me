import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/progress";
import { ConfusionPanel, LanguageDnaPanel } from "@/components/learning/dna-panel";
import { loadLanguageContext } from "@/lib/db/context";
import { getUserStats } from "@/lib/db/learner";
import { listConfusionPatterns } from "@/lib/db/confusions";
import { computeLanguageDna } from "@/lib/db/dna";
import { getWeeklySummary, listDailyActivity } from "@/lib/db/progress";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Progress" };

/**
 * Progress intelligence.
 *
 * The analytics surface uses the dark "instrument" token set so data reads as
 * instrumentation rather than content, while the learning surfaces stay on
 * paper — one product, two registers.
 *
 * Every figure is measured. Skill bars in particular are not rendered from an
 * estimate: the Language DNA model needs enough evidence per skill to be
 * meaningful, and showing a confident percentage built on a handful of answers
 * would make this screen untrustworthy the first time a learner checked it
 * against reality.
 */
export default async function ProgressPage({ params }: PageProps<"/[lang]/progress">) {
  const { lang } = await params;
  await requireProfile();
  const { language, learner } = await loadLanguageContext(lang);
  const client = await getServerClient();

  const [stats, weekly, activity, dna, patterns] = await Promise.all([
    getUserStats(client, language.code),
    getWeeklySummary(client, language.code, 7),
    listDailyActivity(client, language.code, 30),
    computeLanguageDna(client, language.code),
    listConfusionPatterns(client, language.code),
  ]);

  const hasActivity = Boolean(stats && stats.total_reviews > 0);
  const retention =
    stats && stats.total_reviews > 0
      ? stats.total_correct / stats.total_reviews
      : null;

  const peakMinutes = activity.reduce((max, day) => Math.max(max, day.minutes), 0);

  return (
    <div className="instrument -mx-4 -mt-5 min-h-dvh bg-surface px-4 pb-8 pt-5 text-primary sm:-mx-6 sm:px-6 lg:-mx-8 lg:-mt-8 lg:px-8 lg:pt-8">
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">
            Progress
          </h1>
          <p className="mt-1 text-sm text-secondary">
            Your {language.name_en} history, measured rather than estimated.
          </p>
        </header>

        {!hasActivity ? (
          <EmptyState
            icon={<Icon name="chart" size={20} />}
            title="Complete your first review to see progress"
            description="Every figure on this page comes from your own answers. Until there is at least one, there is nothing honest to show — so it stays empty."
            tone="sunken"
          />
        ) : null}

        {/* ---- Lifetime ------------------------------------------------- */}
        <section aria-labelledby="lifetime-heading" className="flex flex-col gap-3">
          <h2 id="lifetime-heading" className="text-sm font-semibold text-primary">
            All time
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Reviews" value={stats ? stats.total_reviews : null} />
            <StatTile
              label="Retention"
              value={retention === null ? null : `${Math.round(retention * 100)}%`}
            />
            <StatTile label="Words learned" value={stats ? stats.words_learned : null} />
            <StatTile
              label="Sentences"
              value={stats ? stats.sentences_mastered : null}
            />
            <StatTile
              label="Listening"
              value={
                stats && stats.listening_seconds > 0
                  ? `${Math.round(stats.listening_seconds / 60)}m`
                  : null
              }
            />
            <StatTile
              label="Speaking"
              value={
                stats && stats.speaking_seconds > 0
                  ? `${Math.round(stats.speaking_seconds / 60)}m`
                  : null
              }
            />
          </div>
        </section>

        {/* ---- Week ----------------------------------------------------- */}
        <section aria-labelledby="week-heading" className="flex flex-col gap-3">
          <h2 id="week-heading" className="text-sm font-semibold text-primary">
            Last 7 days
          </h2>
          {weekly ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Study days" value={weekly.active_days} hint="of 7" />
              <StatTile label="Reviews" value={weekly.reviews} />
              <StatTile label="New items" value={weekly.new_items} />
              <StatTile
                label="Recall"
                value={
                  weekly.reviews > 0
                    ? `${Math.round((weekly.reviews_correct / weekly.reviews) * 100)}%`
                    : null
                }
              />
            </div>
          ) : (
            <p className="text-sm text-secondary">
              No activity recorded in the last seven days.
            </p>
          )}
        </section>

        {/* ---- 30-day activity ------------------------------------------ */}
        <section aria-labelledby="activity-heading" className="flex flex-col gap-3">
          <h2 id="activity-heading" className="text-sm font-semibold text-primary">
            Last 30 days
          </h2>
          <Card>
            {activity.length === 0 ? (
              <p className="text-sm text-secondary">
                No study days recorded yet.
              </p>
            ) : (
              <>
                <ul className="flex items-end gap-1" aria-hidden="true">
                  {activity.map((day) => {
                    const height =
                      peakMinutes > 0
                        ? Math.max(4, Math.round((day.minutes / peakMinutes) * 72))
                        : 4;
                    return (
                      <li
                        key={day.date}
                        className="flex-1 rounded-t-[3px] bg-accent"
                        style={{ height }}
                      />
                    );
                  })}
                </ul>
                {/* The chart is decorative; this list is the accessible form. */}
                <ul className="mt-3 max-h-40 overflow-y-auto text-xs text-secondary">
                  {activity
                    .filter((day) => day.reviews > 0)
                    .reverse()
                    .map((day) => (
                      <li key={day.date} className="flex justify-between gap-3 py-0.5">
                        <span>{day.date}</span>
                        <span className="tabular-nums">
                          {day.reviews} reviews · {day.minutes} min
                        </span>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </Card>
        </section>

        {/* ---- Confusions ------------------------------------------------ */}
        <section aria-labelledby="confusions-heading" className="flex flex-col gap-3">
          <h2 id="confusions-heading" className="text-sm font-semibold text-primary">
            Repeated mistakes
          </h2>
          <ConfusionPanel patterns={patterns} />
        </section>

        {/* ---- Language DNA -------------------------------------------- */}
        <section aria-labelledby="dna-heading" className="flex flex-col gap-3">
          <div>
            <h2 id="dna-heading" className="text-sm font-semibold text-primary">
              Language DNA
            </h2>
            <p className="mt-1 text-sm text-secondary">
              Skill strength derived from your own activity. Where there is not
              enough evidence to say anything, we say that instead of guessing.
            </p>
          </div>

          <LanguageDnaPanel dna={dna} />

          <p className="text-xs text-muted">
            {dna.totalEvidence} observation
            {dna.totalEvidence === 1 ? "" : "s"} across all skills. Speaking and
            pronunciation stay unmeasured until those exercises produce a real
            signal.
          </p>
        </section>

        {/* ---- Plan ------------------------------------------------------ */}
        <section aria-labelledby="plan-heading" className="flex flex-col gap-3">
          <h2 id="plan-heading" className="text-sm font-semibold text-primary">
            Your plan
          </h2>
          <Card>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted">Level</dt>
                <dd className="mt-0.5 font-medium text-primary">
                  {learner.cefr_level ?? "Not placed"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Goal</dt>
                <dd className="mt-0.5 font-medium text-primary">{learner.cefr_goal}</dd>
              </div>
              <div>
                <dt className="text-muted">Daily time</dt>
                <dd className="mt-0.5 font-medium text-primary">
                  {learner.daily_minutes} min
                </dd>
              </div>
              <div>
                <dt className="text-muted">Streak</dt>
                <dd className="mt-0.5 font-medium text-primary">
                  {stats?.streak_current ?? 0} days
                </dd>
              </div>
            </dl>
          </Card>
        </section>
      </div>
    </div>
  );
}
