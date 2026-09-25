import type { Metadata } from "next";
import { ReviewSession } from "./review-session";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { StatTile } from "@/components/ui/progress";
import { loadLanguageContext } from "@/lib/db/context";
import { getUserStats, refreshDueCount } from "@/lib/db/learner";
import { getReviewQueueStats, listDueCards } from "@/lib/db/reviews";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";
import { formatDue } from "@/lib/learning/answer";
import { budgetFor, describeSessionSize } from "@/lib/learning/budget";

export const metadata: Metadata = { title: "Review" };

/**
 * Spaced repetition.
 *
 * Every number here comes from the database: `refreshDueCount` recomputes the
 * due total from `review_states.due_at`, and the queue itself is a real ordered
 * query. Nothing about the schedule is decided in the browser.
 */
export default async function ReviewPage({ params }: PageProps<"/[lang]/review">) {
  const { lang } = await params;
  await requireProfile();
  const { language, learner } = await loadLanguageContext(lang);
  const client = await getServerClient();

  await refreshDueCount(client, null);

  // The session is sized from the learner's own daily budget. A five-minute
  // learner handed thirty cards would not do a shorter session — they would
  // abandon a longer one, which breaks the promise onboarding collected.
  const budget = budgetFor(learner.daily_minutes);

  const [stats, queueStats, cards] = await Promise.all([
    getUserStats(client, language.code),
    getReviewQueueStats(client, language.code),
    listDueCards(client, language.code, budget.sessionCards),
  ]);

  const sessionSize = describeSessionSize(queueStats.due, budget);

  const retention =
    stats && stats.total_reviews > 0
      ? `${Math.round((stats.total_correct / stats.total_reviews) * 100)}%`
      : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Review</h1>
          <p className="mt-1 text-sm text-secondary">
            {cards.length > 0
              ? sessionSize.message
              : "Cards are scheduled by the spacing engine and appear here when they come due."}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Due now"
          value={queueStats.due}
          hint={queueStats.due > budget.sessionCards ? `budget fits ${budget.sessionCards}` : undefined}
          icon={<Icon name="cards" size={14} />}
        />
        <StatTile label="In learning" value={queueStats.learning} hint="short steps" />
        <StatTile label="Graduated" value={queueStats.graduated} hint="day or longer" />
        <StatTile label="All-time recall" value={retention} />
      </div>

      {queueStats.total === 0 ? (
        <Card>
          <CardHeader
            title="Your queue is empty"
            description={`No ${language.name_en} items have been added to spaced repetition yet.`}
          />
          <div className="mt-4 rounded-[var(--radius)] border border-line bg-surface-sunken px-4 py-4">
            <p className="text-sm text-secondary">
              Items enter the queue when you save them from the sentence bank or the
              word bank. Nothing is added automatically, so what you review is
              always your own choice.
            </p>
          </div>
        </Card>
      ) : (
        <ReviewSession
          languageCode={language.code}
          languageName={language.name_en}
          initialCards={cards}
          nextDueAt={queueStats.nextDueAt}
        />
      )}

      {queueStats.total > 0 ? (
        <Card>
          <CardHeader title="How scheduling works" />
          <ul className="mt-3 flex flex-col gap-2 text-sm text-secondary">
            <li>
              Each rating updates that card&apos;s difficulty and stability, and the
              next interval is derived from those two numbers.
            </li>
            <li>
              Intervals are computed on the server, so the schedule is identical on
              every device.
            </li>
            <li>
              Every review is appended to your history, which cannot be edited —
              the whole schedule can be rebuilt from it.
            </li>
            {queueStats.nextDueAt ? (
              <li>
                Nothing due right now? Your next card is scheduled{" "}
                {formatDue(queueStats.nextDueAt)}.
              </li>
            ) : null}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
