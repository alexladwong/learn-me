import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Badge, EmptyState } from "@/components/ui/empty-state";
import { loadLanguageContext } from "@/lib/db/context";
import { listConversations } from "@/lib/db/conversations";
import { getUserStats } from "@/lib/db/learner";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";
import { speakingCapabilities } from "@/lib/speech/capabilities";

export const metadata: Metadata = { title: "Speak" };

/**
 * Speaking practice.
 *
 * ## What this page used to be, and why it was wrong
 *
 * It rendered a catalogue of conversation scenarios — "Coffee shop", "Asking for
 * directions", "Hotel check-in" — each with a level band, a list of objectives, a
 * correction policy and a set of support phrases under the heading "Phrases you
 * can lean on". Every one of those values came from a TypeScript array in
 * `lib/tutor/scenarios.ts`. None of it was stored anywhere.
 *
 * That is worse than an empty page. A learner reading "Coffee shop · A1–B1 · 3
 * objectives · 6 phrases" reasonably concludes the product has a curriculum for
 * speaking. It had a constant. The page then reassured them further with a card
 * headed "What is already built", which listed architecture — prompts, a
 * conversation store, report arithmetic — as if it were content they could use.
 *
 * So the catalogue is gone from the authenticated product. What remains is what
 * the database can actually answer, and where it cannot answer, the page says so.
 *
 * ## What is genuinely connected, capability by capability
 *
 * "Speaking provider" was one vague flag. There are four distinct capabilities
 * and they are in four different states, so they are reported separately:
 *
 *   - **Text-to-speech** — connected. The operating system's own speech engine
 *     speaks the phrase; real synthesised audio, no key required. It is not the
 *     server-side provider the design called for, and it is not presented as one.
 *   - **Model conversation** — not connected. No model gateway key is configured,
 *     so there is no tutor to reply.
 *   - **Speech recognition** — `languages.supports_asr`, read from the database.
 *   - **Pronunciation scoring** — `languages.supports_pronunciation`, read from
 *     the database.
 *
 * The last two are per-language rows rather than global switches, so they are
 * shown as the database reports them instead of being assumed either way.
 */
export default async function SpeakPage({ params }: PageProps<"/[lang]/speak">) {
  const { lang } = await params;
  await requireProfile();
  const { language, learner } = await loadLanguageContext(lang);
  const client = await getServerClient();

  const [stats, conversations] = await Promise.all([
    getUserStats(client, language.code),
    listConversations(client, language.code, 5),
  ]);

  /*
   * There is no `speaking_scenarios` table, so the true count is zero and this is
   * not a query. Writing one would mean inventing a schema I cannot apply and
   * then reading from a table that does not exist; seeding one would mean
   * shipping curriculum the brief explicitly said not to add. Zero is the honest
   * number, and it is stated as "not added yet" rather than as an empty list.
   */
  const scenarioCount = 0;

  const speakingMinutes =
    stats && stats.speaking_seconds > 0
      ? Math.round(stats.speaking_seconds / 60)
      : null;

  /*
   * Four capabilities, four states, decided in one place. Reading
   * `languages.supports_asr` here directly is what produced "Speech recognition:
   * Connected" on a product with no recogniser in it — the column said true
   * because the seed meant it as intent.
   */
  const capabilities = speakingCapabilities(language);

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            {language.name_en}
          </p>
          <h1 className="mt-2 text-[1.75rem] font-semibold leading-tight tracking-tight text-primary sm:text-4xl">
            Speaking
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-secondary">
            Where each part of spoken practice actually stands for{" "}
            {language.name_en}. Nothing on this page is measured unless it says
            where it was measured.
          </p>
          {/*
            The learner's own plan, read straight from their `learner_languages`
            row. This page previously reported it too, and the two disagreed —
            that is what a fallback value does. There is no fallback here: an
            unplaced learner is shown as unplaced.
          */}
          <p className="mt-2 text-xs text-muted">
            {learner.cefr_level ? `Level ${learner.cefr_level}` : "Not placed yet"}
            {learner.cefr_goal ? ` · aiming at ${learner.cefr_goal}` : ""}
            {` · ${learner.daily_minutes} min a day`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-medium text-muted">Speaking logged</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums text-primary">
            {speakingMinutes === null ? "—" : `${speakingMinutes} min`}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {conversations.length === 0
              ? "no sessions yet"
              : `${conversations.length} recent session${conversations.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </header>

      <section aria-labelledby="capabilities-heading" className="flex flex-col gap-3">
        <h2 id="capabilities-heading" className="text-sm font-semibold text-primary">
          What is connected
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {capabilities.map((capability) => (
            <li
              key={capability.id}
              className="rounded-[var(--radius-xl)] border border-line bg-surface-raised p-4"
            >
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className={
                    capability.connected
                      ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"
                      : "flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-muted"
                  }
                >
                  <Icon name={capability.connected ? "check" : "volumeOff"} size={13} />
                </span>
                <h3 className="min-w-0 flex-1 text-sm font-medium text-primary">
                  {capability.label}
                </h3>
                <Badge tone={capability.connected ? "success" : "muted"}>
                  {capability.connected ? "Connected" : "Not connected"}
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-secondary">
                {capability.detail}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Scenarios come from the database or they do not exist. */}
      <section aria-labelledby="scenarios-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="scenarios-heading" className="text-sm font-semibold text-primary">
            Scenarios
          </h2>
          {scenarioCount > 0 ? (
            <span className="text-xs text-muted">
              {scenarioCount} available for {language.name_en}
            </span>
          ) : null}
        </div>

        {scenarioCount === 0 ? (
          <EmptyState
            tone="sunken"
            icon={<Icon name="speak" size={20} />}
            title="No speaking scenarios have been added yet"
            description={`Speaking practice for ${language.name_en} needs scenarios stored against it — a situation, what you are trying to do in it, and the phrases that would get you through. None exist yet, so this page shows none. The list you may have seen here before was written into the app itself rather than stored, which is why it has been removed.`}
          />
        ) : null}
      </section>

      {conversations.length > 0 ? (
        <section aria-labelledby="history-heading" className="flex flex-col gap-3">
          <h2 id="history-heading" className="text-sm font-semibold text-primary">
            Past conversations
          </h2>
          <ul className="flex flex-col gap-2">
            {conversations.map((conversation) => (
              <li
                key={conversation.id}
                className="flex items-center gap-3 rounded-[var(--radius-xl)] border border-line bg-surface-raised px-4 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-primary">
                    {conversation.scenarioId}
                  </span>
                  <span className="block text-xs text-muted">
                    {conversation.turnCount} turns ·{" "}
                    {new Date(conversation.startedAt).toLocaleDateString("en", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </span>
                <Badge tone={conversation.status === "completed" ? "success" : "muted"}>
                  {conversation.status}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState
          tone="sunken"
          icon={<Icon name="chart" size={20} />}
          title="No speaking sessions yet"
          description="Nothing has been recorded for this language, so there is no history, no minutes and no corrections to report."
        />
      )}

      {/*
        This card used to be headed "What is already built" and listed the
        architecture — prompts, a conversation store, report arithmetic. A learner
        cannot use a codebase, and reading a build status report in the middle of
        practising is not a feature. What a learner needs to know is what they can
        do now, which is the capabilities list above.
      */}
      <Card>
        <CardHeader
          title="What you can do right now"
          description={`Audio for ${language.name_en} works today through your device's speech engine, so any phrase in a lesson or in your bank can be played aloud. Scored speaking practice cannot run until a speech recognition and pronunciation provider is connected for this language.`}
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/${language.code}/bank`}
            className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            Open your bank to listen to saved phrases
            <Icon name="arrowRight" size={15} />
          </Link>
        </div>
      </Card>
    </div>
  );
}
