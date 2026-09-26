import Link from "next/link";
import { redirect } from "next/navigation";
import { LanguageCard } from "@/components/learning/language-card";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/empty-state";
import { listLanguages } from "@/lib/db/languages";
import { listLearnerLanguages } from "@/lib/db/learner";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireSession } from "@/lib/auth/session";

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
 *   - **Three weights, three surfaces.** Languages the learner already studies
 *     sit on a mint panel because they are the thing to act on; languages they
 *     can start sit on a quieter mist panel; languages with no guided path are a
 *     plain list on the page itself, because they are information rather than a
 *     choice. Before this pass all three were identical stacks of cards.
 *   - **Unbuilt languages are quiet, not broken.** "Not playable yet" is stated
 *     plainly, so it never looks like a disabled record or an error.
 *
 * The greeting on an enrolled card is looked up in the catalogue this page has
 * already fetched, so it costs no second query.
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
  const byCode = new Map(catalogue.all.map((language) => [language.code, language]));

  return (
    <div className="flex flex-col gap-9">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          Your languages
        </p>
        <h1 className="mt-2.5 text-[1.75rem] font-semibold leading-tight tracking-tight text-primary sm:text-4xl">
          {enrolled.length > 0
            ? "Which language next?"
            : "Which language do you want to learn?"}
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-secondary">
          {enrolled.length > 0
            ? "Each language keeps its own plan, level and progress. Add another and it starts fresh, without disturbing the first."
            : "Choose one to start. You can add more languages later."}
        </p>
      </header>

      {enrolled.length > 0 ? (
        <section
          aria-labelledby="enrolled-heading"
          className="rounded-[var(--radius-section)] bg-[var(--tint-mint)] p-5 sm:p-7"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="enrolled-heading" className="text-sm font-semibold text-primary">
              Continue learning
            </h2>
            <span className="text-xs text-muted">
              {enrolled.length} {enrolled.length === 1 ? "language" : "languages"}
            </span>
          </div>

          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {enrolled.map((learner) => {
              const full = byCode.get(learner.language_code);
              return (
                <li key={learner.id}>
                  <LanguageCard
                    language={full ?? fallback(learner)}
                    layout="row"
                    href={entryHref(
                      learner.language_code,
                      learner.cefr_level !== null,
                    )}
                    meta={
                      <>
                        {learner.is_primary ? <Badge tone="accent">Primary</Badge> : null}
                        {learner.cefr_level ? (
                          <Badge tone="muted">{learner.cefr_level}</Badge>
                        ) : null}
                        <span className="text-xs text-muted">
                          {learner.daily_minutes} min a day
                        </span>
                      </>
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {startable.length > 0 ? (
        <section
          aria-labelledby="start-heading"
          className="rounded-[var(--radius-section)] bg-[var(--tint-mist)] p-5 sm:p-7"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="start-heading" className="text-sm font-semibold text-primary">
              {enrolled.length > 0 ? "Start another language" : "Available now"}
            </h2>
            <span className="text-xs text-muted">
              {startable.length} with a full guided path
            </span>
          </div>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-secondary">
            Each of these has lessons, review and drills, and its own spaced
            repetition schedule.
          </p>

          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {startable.map((language) => (
              <li key={language.code}>
                <LanguageCard
                  language={language}
                  layout="row"
                  href={`/${language.code}/onboarding`}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        The unbuilt languages are a list, not a grid of cards. A card is an
        invitation to act; giving a language that cannot be opened the same shape
        as one that can is what made the old page read as a catalogue of broken
        records.
      */}
      {catalogue.upcoming.length > 0 ? (
        <section aria-labelledby="upcoming-heading" className="flex flex-col gap-4">
          <div className="max-w-3xl">
            <h2
              id="upcoming-heading"
              className="text-sm font-semibold text-primary"
            >
              Still being written
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-secondary">
              No guided path exists for these yet, so there is no lesson to open and
              no plan to build. They are listed so the roadmap is not a secret —
              nothing here is broken.
            </p>
          </div>

          <ul className="grid gap-2 rounded-[var(--radius-section)] bg-surface-sunken p-3 sm:grid-cols-2 lg:grid-cols-3">
            {catalogue.upcoming.map((language) => (
              <li
                key={language.code}
                className="flex items-center gap-3 rounded-[var(--radius-xl)] bg-surface-raised px-4 py-3"
              >
                <span className="min-w-0 flex-1">
                  {/*
                    `<bdi>` rather than `dir="rtl"` on the block. Setting `dir` on
                    a block element also flips its alignment, so the Arabic row
                    pushed its own name to the right edge and no longer lined up
                    with the nine Latin rows beside it. `<bdi>` isolates the
                    bidirectional text — which is the actual requirement — while
                    the row stays left-aligned like every other one.
                  */}
                  <bdi className="block truncate text-left text-sm font-medium text-primary">
                    {language.name_native}
                  </bdi>
                  <span className="block truncate text-xs text-muted">
                    {language.name_en}
                    {language.script ? ` · ${language.script} script` : ""}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-muted">
                  Planned
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-[var(--radius-section)] bg-[var(--tint-mist)] p-5 sm:p-7">
        <h2 className="text-base font-semibold tracking-tight text-primary">
          Not sure where to begin?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-secondary">
          Start with one language and one small daily goal. Ten focused minutes a day
          builds more than an ambitious plan you cannot keep — and you can change
          every answer later.
        </p>
        <Link
          href="/settings"
          className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          Review your plan
          <Icon name="arrowRight" size={15} />
        </Link>
      </section>
    </div>
  );
}

/** Enrolled → their dashboard; not yet onboarded → finish onboarding. */
function entryHref(code: string, onboarded: boolean): string {
  return onboarded ? `/${code}` : `/${code}/onboarding`;
}

/**
 * A stand-in for an enrolled language that the catalogue does not carry.
 *
 * This should not happen — a learner language references the same `languages`
 * table the catalogue reads — but the enrol join returns display names only, and
 * a missing row must not blank the card. It renders a plain card with no
 * greeting rather than inventing one.
 */
function fallback(learner: {
  language_code: string;
  language: { name_en: string; name_native: string; flag_emoji: string | null };
}) {
  return {
    code: learner.language_code,
    name_en: learner.language.name_en,
    name_native: learner.language.name_native,
    flag_emoji: learner.language.flag_emoji,
    direction: "ltr" as const,
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
