import Link from "next/link";
import { redirect } from "next/navigation";
import { LanguageCard } from "@/components/learning/language-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/empty-state";
import { listLanguages } from "@/lib/db/languages";
import { listLearnerLanguages } from "@/lib/db/learner";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireSession } from "@/lib/auth/session";
import type { Language } from "@/lib/types";

/**
 * Language selection and switching.
 *
 * This page is the front door for a new account — the app shell sends a learner
 * here when they have no language, and `/[lang]/onboarding` is the only route
 * that creates one. It previously read as a database catalogue: a muted table of
 * rows, each led by a flag, with the real languages and the unbuilt ones given
 * almost the same treatment.
 *
 * What changed, and why:
 *   - **Languages are identified by name and script.** Each card leads with the
 *     language's own name and shows a real greeting in the target script (with
 *     `dir` set for Arabic). A flag names a country; Spanish, Arabic and Swahili
 *     are each spoken across many.
 *   - **Available languages look available.** They are raised, bordered, hover,
 *     and carry a greeting — they read as things you can start.
 *   - **Unbuilt languages are quiet, not broken.** "More languages coming" is
 *     stated plainly on a sunken surface, so it never looks like a disabled
 *     record or an error.
 *
 * The greeting on an enrolled card is deliberately omitted rather than fetched:
 * the enrolled list carries display names only, and a second query for pure
 * decoration is not worth it.
 */
export default async function LanguagesPage({ searchParams }: PageProps<"/languages">) {
  await requireSession("/languages");

  const params = await searchParams;
  const isAdding = params.add === "1";

  const client = await getServerClient();
  const [catalogue, enrolled] = await Promise.all([
    listLanguages(client),
    listLearnerLanguages(client),
  ]);

  // A learner with exactly one language has nothing to choose between, so skip
  // the picker — unless they explicitly asked to add another one.
  if (enrolled.length === 1 && !isAdding) {
    const only = enrolled[0];
    redirect(entryHref(only.language_code, only.cefr_level !== null));
  }

  const enrolledCodes = new Set(enrolled.map((l) => l.language_code));
  const startable = catalogue.available.filter((l) => !enrolledCodes.has(l.code));

  return (
    <div className="flex flex-col gap-10">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
          {enrolled.length > 0
            ? "Which language next?"
            : "Which language do you want to learn?"}
        </h1>
        <p className="mt-3 text-base text-secondary">
          {enrolled.length > 0
            ? "Each language keeps its own plan, level and progress. Add another and it starts fresh, without disturbing the first."
            : "Choose one to start. You can add more languages later."}
        </p>
      </header>

      {enrolled.length > 0 ? (
        <section aria-labelledby="enrolled-heading" className="flex flex-col gap-4">
          <h2
            id="enrolled-heading"
            className="text-sm font-semibold uppercase tracking-wide text-muted"
          >
            Continue learning
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enrolled.map((learner) => (
              <li key={learner.id}>
                <LanguageCard
                  language={asLanguage({
                    code: learner.language_code,
                    name_en: learner.language.name_en,
                    name_native: learner.language.name_native,
                    flag_emoji: learner.language.flag_emoji,
                  })}
                  href={entryHref(learner.language_code, learner.cefr_level !== null)}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
                  {learner.is_primary ? <Badge tone="accent">Primary</Badge> : null}
                  {learner.cefr_level ? <Badge tone="muted">{learner.cefr_level}</Badge> : null}
                  <span className="text-xs text-muted">{learner.daily_minutes} min a day</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {startable.length > 0 ? (
        <section aria-labelledby="start-heading" className="flex flex-col gap-4">
          <div>
            <h2
              id="start-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted"
            >
              {enrolled.length > 0 ? "Start another language" : "Available now"}
            </h2>
            <p className="mt-1.5 text-sm text-secondary">
              Each of these has a full guided path — lessons, review and drills.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {startable.map((language) => (
              <li key={language.code}>
                <LanguageCard language={language} href={`/${language.code}/onboarding`} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {catalogue.upcoming.length > 0 ? (
        <section aria-labelledby="upcoming-heading" className="flex flex-col gap-4">
          <div>
            <h2
              id="upcoming-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted"
            >
              More languages coming
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm text-secondary">
              Not playable yet — there is no guided path for these, and we would
              rather say so than offer a lesson that teaches nothing. Nothing here
              is broken; it is simply still being written.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {catalogue.upcoming.map((language) => (
              <li key={language.code}>
                <LanguageCard language={language} quiet />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card tone="sunken">
        <CardHeader
          title="Not sure where to begin?"
          description="Start with one language and one small daily goal. Ten focused minutes a day builds more than an ambitious plan you cannot keep — and you can change every answer later in settings."
        />
        <Link
          href="/settings"
          className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          Open settings
          <Icon name="arrowRight" size={15} />
        </Link>
      </Card>
    </div>
  );
}

/** Enrolled → their dashboard; not yet onboarded → finish onboarding. */
function entryHref(code: string, onboarded: boolean): string {
  return onboarded ? `/${code}` : `/${code}/onboarding`;
}

/**
 * Fill in the fields the shared card needs but the enrolled join does not carry.
 *
 * The join returns display names only; a greeting would be a second query for
 * pure decoration, so it is left null and the card omits that block.
 */
function asLanguage(
  partial: Pick<Language, "code" | "name_en" | "name_native" | "flag_emoji">,
): Language {
  return {
    ...partial,
    direction: "ltr",
    script: null,
    greeting_native: null,
    greeting_english: null,
    supports_cefr: true,
    supports_audio: false,
    supports_asr: false,
    supports_pronunciation: false,
    is_available: true,
    sort_order: 0,
  };
}
