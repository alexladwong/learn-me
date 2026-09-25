import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Badge, CapabilityNotice } from "@/components/ui/empty-state";
import { loadLanguageContext } from "@/lib/db/context";
import { listConversations } from "@/lib/db/conversations";
import { getUserStats } from "@/lib/db/learner";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";
import { CORRECTION_STYLES, findScenario, scenariosForLevel } from "@/lib/tutor/scenarios";

export const metadata: Metadata = { title: "Speak" };

/**
 * The AI tutor's home.
 *
 * The scenarios are real, chosen by the learner's level, and each one shows what
 * it is actually for. The conversation itself cannot run — the InsForge
 * organisation is on the free plan, so the Model Gateway is unavailable — and the
 * page says exactly that rather than showing a chat box that answers nothing or,
 * worse, a scripted reply pretending to be a tutor.
 *
 * Everything that does not need a model is already here: the scenario design, the
 * level-adapted prompt, the report arithmetic and the conversation store.
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

  const providerConfigured = Boolean(process.env.OPENROUTER_API_KEY);
  const level = learner.cefr_level;
  const offered = scenariosForLevel(level);

  const speakingIsPriority = learner.skill_priorities.includes("speaking");
  const speakingMinutes =
    stats && stats.speaking_seconds > 0
      ? Math.round(stats.speaking_seconds / 60)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          Speak {language.name_en}
        </h1>
        <p className="mt-1 text-sm text-secondary">
          Practise producing language in a situation, with a tutor that corrects as
          you go.
        </p>
      </header>

      {speakingIsPriority && speakingMinutes === null ? (
        <CapabilityNotice
          title="You named speaking as a priority"
          description="Nothing speaking has been logged for this language yet. Scored speaking practice needs a provider, which is not connected."
        />
      ) : null}

      {!providerConfigured ? (
        <CapabilityNotice
          title="Conversations cannot run yet"
          description="No AI provider is configured for this project, so the tutor has nothing to respond with. Every scenario below is designed and ready; the conversation itself is the only missing piece."
        />
      ) : null}

      <section aria-labelledby="scenarios-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="scenarios-heading" className="text-sm font-semibold text-primary">
            Scenarios
          </h2>
          <p className="text-xs text-muted">
            {level
              ? `Chosen for ${level}${learner.cefr_goal ? `, aiming at ${learner.cefr_goal}` : ""}`
              : "All levels — we do not know your level yet"}
          </p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {offered.map((scenario) => {
            const matchesLevel =
              level !== null &&
              scenario.minLevel <= level &&
              scenario.maxLevel >= level;

            return (
              <li key={scenario.id}>
                <Card className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-primary">
                      {scenario.title}
                    </h3>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Badge tone={matchesLevel ? "accent" : "muted"}>
                        {scenario.minLevel}
                        {scenario.maxLevel !== scenario.minLevel
                          ? `–${scenario.maxLevel}`
                          : ""}
                      </Badge>
                      <span
                        aria-hidden="true"
                        className="flex size-7 items-center justify-center rounded-full bg-surface-sunken text-muted"
                      >
                        <Icon name="lock" size={13} />
                      </span>
                    </span>
                  </div>

                  <p className="mt-1.5 text-sm text-secondary">{scenario.goal}</p>

                  <dl className="mt-3 flex flex-col gap-1.5 text-xs">
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted">You will</dt>
                      <dd className="text-secondary">
                        {scenario.tasks.slice(0, 2).join("; ")}
                        {scenario.tasks.length > 2
                          ? `; and ${scenario.tasks.length - 2} more`
                          : ""}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted">Corrections</dt>
                      <dd className="text-secondary">
                        {CORRECTION_STYLES.includes(scenario.correctionStyle)
                          ? CORRECTION_LABELS[scenario.correctionStyle]
                          : scenario.correctionStyle}
                      </dd>
                    </div>
                  </dl>

                  <details className="mt-3">
                    <summary className="flex min-h-[44px] cursor-pointer items-center text-xs font-medium text-accent">
                      Phrases you can lean on
                    </summary>
                    <ul className="mt-1 flex flex-col gap-1 pb-1">
                      {scenario.usefulPhrases.map((phrase) => (
                        <li key={phrase} className="text-xs text-secondary">
                          “{phrase}”
                        </li>
                      ))}
                    </ul>
                  </details>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {conversations.length > 0 ? (
        <section aria-labelledby="history-heading" className="flex flex-col gap-3">
          <h2 id="history-heading" className="text-sm font-semibold text-primary">
            Past conversations
          </h2>
          <ul className="flex flex-col gap-2">
            {conversations.map((conversation) => {
              const scenario = findScenario(conversation.scenarioId);
              return (
                <li
                  key={conversation.id}
                  className="flex items-center gap-3 rounded-[var(--radius)] border border-line bg-surface-raised px-4 py-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-primary">
                      {scenario?.title ?? conversation.scenarioId}
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
              );
            })}
          </ul>
        </section>
      ) : null}

      <Card>
        <CardHeader
          title="What is already built"
          description="The tutor's design does not depend on the provider."
        />
        <ul className="mt-4 flex flex-col gap-2 text-sm text-secondary">
          <li className="flex gap-2.5">
            <Icon name="check" size={15} className="mt-0.5 shrink-0 text-success" />
            <span>
              <span className="font-medium text-primary">
                {offered.length} scenarios
              </span>{" "}
              with goals, tasks, correction policy and scaffolding phrases.
            </span>
          </li>
          <li className="flex gap-2.5">
            <Icon name="check" size={15} className="mt-0.5 shrink-0 text-success" />
            <span>
              <span className="font-medium text-primary">Level-adapted prompts</span>{" "}
              — an A1 tutor is told to use 8-word sentences and only the present
              tense, so a beginner is not buried in fluent input.
            </span>
          </li>
          <li className="flex gap-2.5">
            <Icon name="check" size={15} className="mt-0.5 shrink-0 text-success" />
            <span>
              <span className="font-medium text-primary">A conversation store</span>{" "}
              that records each turn and what was corrected, so mistakes can become
              review cards.
            </span>
          </li>
          <li className="flex gap-2.5">
            <Icon name="check" size={15} className="mt-0.5 shrink-0 text-success" />
            <span>
              <span className="font-medium text-primary">Report arithmetic</span>{" "}
              that measures what you produced, and states which scores are missing
              instead of inventing them.
            </span>
          </li>
        </ul>
        <p className="mt-4 text-xs text-muted">
          What remains is one function that sends the prompt to a model.{" "}
          <Link href={`/${language.code}/progress`} className="font-medium text-accent hover:underline">
            See your progress
          </Link>{" "}
          in the meantime.
        </p>
      </Card>
    </div>
  );
}

const CORRECTION_LABELS: Record<(typeof CORRECTION_STYLES)[number], string> = {
  gentle: "Only when meaning is lost",
  balanced: "Meaningful errors, as they happen",
  strict: "Every error, with a repeat",
};
