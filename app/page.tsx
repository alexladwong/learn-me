import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { AudioButton } from "@/components/learning/audio-button";
import { LanguageCard } from "@/components/learning/language-card";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Metric, MeterBar, PreviewFrame } from "@/components/marketing/preview-frame";
import { listLanguages } from "@/lib/db/languages";
import { countPublishedMissions } from "@/lib/db/progress";
import { getServerClient } from "@/lib/insforge/server-client";
import { getSession } from "@/lib/auth/session";
import { postAuthDestination } from "@/lib/auth/destination";
import { APP_NAME } from "@/lib/constants";
import type { Language } from "@/lib/types";

/**
 * The public homepage.
 *
 * ## What changed, and why
 *
 * The previous version was a single narrow column: an eyebrow, a headline, and
 * four identical cards — every section on the same surface, every section the
 * same shape. It read as a list of boxes rather than a designed page.
 *
 * This is composed as full-bleed bands that alternate between four section tints,
 * with content in a shared container inside them. That alternation is the whole
 * device: it gives the page rhythm, groups related ideas without dividers, and
 * lets the closing band land with weight.
 *
 * The other half is that **the product is the imagery**. There are no stock
 * photographs — every preview is built from this app's own tokens and component
 * shapes, so what a visitor sees is what they will get.
 *
 * ## Honesty
 *
 * Language cards show real catalogue data: real native names, real greetings, and
 * the real availability flag, with real audio on the launch languages. The counts
 * are real database facts.
 *
 * The interface previews use **sample learner data and say so in the frame's own
 * title bar**. The product's rule is that a figure is either measured or absent,
 * and a marketing page is no exception — an illustrative screen is labelled rather
 * than presenting invented progress as fact.
 */
export default async function HomePage() {
  const session = await getSession();
  if (session) {
    /*
     * A returning learner belongs in the language they were last in, not on a
     * picker. This is the same function the native shell's exchange endpoint
     * calls, so the web root and a phone sign-in can never disagree about where
     * someone belongs — which is how a returning learner would otherwise be sent
     * back to language selection.
     */
    redirect(await postAuthDestination(await getServerClient()));
  }

  const client = await getServerClient();
  const catalogue = await listLanguages(client);
  const learnable = catalogue.available;

  // A real, checkable total: every published lesson across the languages that
  // have a guided path. Summed from the database rather than stated.
  const missionCount = (
    await Promise.all(learnable.map((language) => countPublishedMissions(client, language.code)))
  ).reduce((total, count) => total + count, 0);
  const upcoming = catalogue.upcoming.filter((language) => language.code !== "en");
  // Featured first, then the rest: varying weight is what stops the grid reading
  // as a spreadsheet of languages.
  const [featured, ...others] = learnable;

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <SiteHeader />

      <main className="flex-1">
        <Hero />

        <LanguagesBand featured={featured} others={others} upcoming={upcoming} />

        <HowItWorks />

        <ProductBand
          missionCount={missionCount}
          learnableCount={learnable.length}
        />

        <ClosingBand />
      </main>

      <SiteFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ hero --- */

function Hero() {
  return (
    <section className="px-4 pt-4 sm:px-6 sm:pt-6">
      <div className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-[var(--radius-section)] bg-gradient-to-b from-[var(--tint-mint)] via-[var(--tint-mist)] to-surface-raised">
      {/* A soft radial wash behind the headline: restrained, it lifts the centre of
          the page without becoming a decorative graphic. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-70"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, var(--accent-soft) 0%, transparent 70%)",
        }}
      />

      <div className="relative w-full px-5 pb-14 pt-14 sm:px-10 sm:pb-16 sm:pt-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-raised/80 px-3 py-1 text-xs font-medium text-secondary backdrop-blur">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
            Built around your answers, not a generic course
          </span>

          <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.02em] text-primary sm:text-6xl">
            Learn languages for the life you actually live.
          </h1>

          <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-secondary sm:text-lg">
            Guided lessons, smart review, real-world content, speaking practice, and a
            learning plan built around you.
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <ButtonLink href="/sign-up" size="lg" className="sm:px-7">
              Start learning
              <Icon name="arrowRight" size={16} />
            </ButtonLink>
            <ButtonLink href="#how" variant="secondary" size="lg">
              See how it works
            </ButtonLink>
          </div>
        </div>

        {/* The product, immediately. This is the focal point, so it is the widest
            and most lifted element on the page. */}
        <div className="mx-auto mt-14 max-w-4xl sm:mt-16">
          <DashboardPreview />
        </div>
      </div>
      </div>
    </section>
  );
}

/** A preview of the learner dashboard, built from the product's own primitives. */
function DashboardPreview() {
  return (
    <PreviewFrame title={`${APP_NAME} — dashboard (sample data)`}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-[var(--radius)] bg-accent-soft text-sm font-semibold text-accent"
            >
              ES
            </span>
            <div>
              <p className="text-sm font-semibold text-primary">Spanish · A2</p>
              <p className="text-xs text-secondary">20 minutes a day</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-line bg-surface-sunken px-2 py-1 text-xs font-medium text-secondary">
            <Icon name="flame" size={13} />
            6-day streak
          </span>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Today&apos;s session
          </p>
          <p className="mt-1.5 text-lg font-semibold tracking-tight text-primary">
            Where I went
          </p>
          <p className="mt-0.5 text-sm text-secondary">
            12 cards due · 16 exercises · about 18 min
          </p>
          <div className="mt-3">
            <MeterBar value={0.62} label="Session progress" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Due now" value={12} hint="cards" tone="accent" />
          <Metric label="Words" value={148} hint="in your bank" />
          <Metric label="Sentences" value={37} hint="saved" />
          <Metric label="Speaking" value="6 min" hint="this week" />
        </div>
      </div>
    </PreviewFrame>
  );
}

/* ------------------------------------------------------------- languages --- */

function LanguagesBand({
  featured,
  others,
  upcoming,
}: {
  featured: Language | undefined;
  others: Language[];
  upcoming: Language[];
}) {
  if (!featured) return null;

  return (
    <section id="languages" className="px-4 py-3 sm:px-6 sm:py-4">
      <div className="mx-auto w-full max-w-6xl rounded-[var(--radius-section)] bg-[var(--tint-cream)] px-5 py-14 sm:px-10 sm:py-20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <span className="text-xs font-semibold uppercase tracking-wide text-accent">
              Languages
            </span>
            <h2 className="mt-2.5 text-3xl font-semibold tracking-[-0.02em] text-primary sm:text-4xl">
              Choose what you want to speak.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-secondary">
              Each language is named in its own script, with a real phrase you can hear
              before you commit to anything.
            </p>
          </div>
          <p className="text-sm text-secondary">
            {others.length + 1} with a guided path today
            {upcoming.length > 0 ? ` · ${upcoming.length} on the way` : ""}
          </p>
        </div>

        {/* The featured language gets real emphasis: larger, with its greeting in
            display type. Deliberate size variation is what makes a grid feel
            composed rather than generated. */}
        <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)]">
          <Link
            href={`/${featured.code}/onboarding`}
            className="flex flex-col justify-between rounded-[var(--radius-xl)] border border-line-strong bg-surface-raised p-6 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-[var(--shadow-raised)] sm:p-7"
          >
            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent-soft px-2 py-1 text-xs font-medium text-accent">
                  <Icon name="sparkle" size={12} />
                  Most complete path
                </span>
                {featured.flag_emoji ? (
                  <span aria-hidden="true" className="text-lg opacity-70">
                    {featured.flag_emoji}
                  </span>
                ) : null}
              </div>
              <p
                className="mt-5 text-3xl font-semibold tracking-tight text-primary"
                dir={featured.direction === "rtl" ? "rtl" : undefined}
              >
                {featured.name_native}
              </p>
              <p className="mt-1 text-sm text-secondary">{featured.name_en}</p>
            </div>

            {featured.greeting_native ? (
              <div className="mt-8 border-t border-line pt-5">
                <p
                  className="text-xl font-medium leading-snug text-primary"
                  dir={featured.direction === "rtl" ? "rtl" : undefined}
                >
                  {featured.greeting_native}
                </p>
                {featured.greeting_english ? (
                  <p className="mt-1 text-xs text-muted">{featured.greeting_english}</p>
                ) : null}
                {/* Real audio on a real phrase — the strongest signal that this is a
                    language product and not a landing page about one. */}
                <div className="mt-3">
                  <AudioButton
                    text={featured.greeting_native}
                    languageCode={featured.code}
                    showSlow={false}
                    label={`Hear the ${featured.name_en} greeting`}
                  />
                </div>
              </div>
            ) : null}
          </Link>

          <div className="grid gap-4 sm:grid-cols-2">
            {others.slice(0, 4).map((language) => (
              <LanguageCard
                key={language.code}
                language={language}
                href={`/${language.code}/onboarding`}
              />
            ))}
          </div>
        </div>

        {upcoming.length > 0 ? (
          <div className="mt-10">
            <h3 className="text-sm font-semibold text-primary">Being written now</h3>
            <p className="mt-1.5 max-w-2xl text-sm text-secondary">
              These are in the catalogue with real greetings, but no guided path yet. We
              would rather show them honestly than offer a lesson that teaches nothing.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2.5">
              {upcoming.map((language) => (
                <li
                  key={language.code}
                  className="flex items-center gap-2.5 rounded-[var(--radius)] border border-line bg-surface-sunken px-3.5 py-2.5"
                >
                  <span
                    className="text-sm font-medium text-primary"
                    dir={language.direction === "rtl" ? "rtl" : undefined}
                  >
                    {language.name_native}
                  </span>
                  <span className="text-xs text-muted">{language.name_en}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- how it works --- */

const STEPS = [
  {
    n: "01",
    title: "Tell us why",
    body: "Six questions — your reason, level, and how much time you really have. The plan is built from your answers.",
  },
  {
    n: "02",
    title: "Follow the path",
    body: "Tracks, units and lessons in order, each one teaching before it tests.",
  },
  {
    n: "03",
    title: "Review what fades",
    body: "A real scheduling engine decides what to show you and when, so recall holds.",
  },
  {
    n: "04",
    title: "See the truth",
    body: "Progress from your own answers. Not enough evidence yet? It stays blank.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="px-4 py-3 sm:px-6 sm:py-4">
      <div className="mx-auto w-full max-w-6xl rounded-[var(--radius-section)] bg-surface-raised px-5 py-14 sm:px-10 sm:py-20">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">
            How it works
          </span>
          <h2 className="mt-2.5 text-3xl font-semibold tracking-[-0.02em] text-primary sm:text-4xl">
            Four steps, repeated until it sticks.
          </h2>
          <p className="mt-3 text-base leading-relaxed text-secondary">
            Not a course you finish and forget. The loop is the product.
          </p>
        </div>

        {/* A numbered rail rather than four cards: these are a sequence, and boxes
            would imply they are independent options. */}
        <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((item) => (
            <li key={item.n} className="border-t-2 border-accent/30 pt-5">
              <p className="text-xs font-semibold tabular-nums tracking-wide text-accent">
                {item.n}
              </p>
              <h3 className="mt-2 text-base font-semibold text-primary">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-secondary">{item.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- product --- */

function ProductBand({
  missionCount,
  learnableCount,
}: {
  missionCount: number;
  learnableCount: number;
}) {
  return (
    <section id="product" className="px-4 py-3 sm:px-6 sm:py-4">
      <div className="mx-auto w-full max-w-6xl rounded-[var(--radius-section)] bg-tint-mint px-5 py-14 sm:px-10 sm:py-20">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">
            Inside {APP_NAME}
          </span>
          <h2 className="mt-2.5 text-3xl font-semibold tracking-[-0.02em] text-primary sm:text-4xl">
            The surfaces you will actually spend time in.
          </h2>
          <p className="mt-3 text-base leading-relaxed text-secondary">
            {missionCount} published lessons across {learnableCount} languages, plus a
            scheduler, a bank and an analysis layer built on your own answers.
          </p>
        </div>

        {/* Alternating direction is the composition device: each band is a
            different shape, so the page never settles into a grid. */}
        <div className="mt-14 flex flex-col gap-16 sm:gap-20">
          <FeatureBand
            eyebrow="Guided learning"
            title="A path that always knows what is next."
            body="Tracks and units in order, each lesson introducing material before it asks you to produce it. You never have to decide what to study."
            points={[
              "Vocabulary, sentences and grammar in one sequence",
              "Audio on every item, at normal and learner speed",
              "Completion recorded per lesson, not per session",
            ]}
            preview={<PathPreview />}
          />

          <FeatureBand
            reverse
            eyebrow="Smart review"
            title="Review that adapts to what you forget."
            body="A spaced-repetition scheduler decides when each word, phrase and sentence comes back. The server owns the schedule, so it is identical on every device."
            points={[
              "Intervals computed from your own recall, not a fixed timetable",
              "Every review appended to a history that cannot be edited",
              "Drills generated from the mistakes you keep making",
            ]}
            preview={<ReviewPreview />}
          />

          <FeatureBand
            eyebrow="Real-world content"
            title="Bring your own text and keep what matters."
            body="Paste an article, a message, or a page from a book. The product finds the words worth learning, and anything you keep joins the same review queue as the curriculum."
            points={[
              "Deterministic word detection — no invented vocabulary",
              "You supply the meaning; the product keeps your context",
              "No duplicates: the same word from two sources is one card",
            ]}
            preview={<CapturePreview />}
          />

          <FeatureBand
            reverse
            eyebrow="Speaking"
            title="Practise producing, not just recognising."
            body="Speaking steps ask you to say the sentence out loud. Scoring needs a speech provider that is not connected yet, so the product records that you practised instead of inventing a score."
            points={[
              "Phrases you have already met, read aloud by your device",
              "An honest empty state wherever a number is not yet available",
              "No invented score, no invented streak, no invented progress",
            ]}
            preview={<SpeakingPreview />}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * One feature band: explanation on one side, a product preview on the other.
 *
 * Alternating the side is what keeps four consecutive features from reading as a
 * list — the eye has to travel differently each time.
 */
function FeatureBand({
  eyebrow,
  title,
  body,
  points,
  preview,
  reverse = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  preview: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
      <div className={reverse ? "lg:order-2" : undefined}>
        <span className="text-xs font-semibold uppercase tracking-wide text-accent">
          {eyebrow}
        </span>
        <h3 className="mt-2.5 text-2xl font-semibold tracking-[-0.015em] text-primary sm:text-3xl">
          {title}
        </h3>
        <p className="mt-3 text-base leading-relaxed text-secondary">{body}</p>
        <ul className="mt-6 flex flex-col gap-3">
          {points.map((point) => (
            <li key={point} className="flex gap-3 text-sm text-secondary">
              <span aria-hidden="true" className="mt-0.5 shrink-0 text-accent">
                <Icon name="check" size={15} />
              </span>
              <span className="leading-relaxed">{point}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? "lg:order-1" : undefined}>{preview}</div>
    </div>
  );
}

function PathPreview() {
  const units = [
    { title: "Foundations", done: true, lessons: 4 },
    { title: "Introductions", done: true, lessons: 3 },
    { title: "Everyday life", done: false, lessons: 5 },
  ];
  return (
    <PreviewFrame title="Learning path (sample data)" tone="sunken">
      <ul className="flex flex-col gap-3">
        {units.map((unit) => (
          <li
            key={unit.title}
            className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface-raised px-4 py-3"
          >
            <span
              aria-hidden="true"
              className={
                unit.done
                  ? "flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
                  : "flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong text-muted"
              }
            >
              {unit.done ? <Icon name="check" size={13} /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-primary">
                {unit.title}
              </span>
              <span className="block text-xs text-muted">{unit.lessons} lessons</span>
            </span>
          </li>
        ))}
      </ul>
    </PreviewFrame>
  );
}

function ReviewPreview() {
  return (
    <PreviewFrame title="Review (sample data)" tone="sunken">
      <div className="flex flex-col gap-4">
        <div className="rounded-[var(--radius-lg)] border border-line bg-surface-raised p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Say it in Spanish
          </p>
          <p className="mt-2 text-base font-medium text-primary">
            I ate with my family on Sunday.
          </p>
          <span className="mt-3 inline-block rounded-[var(--radius-sm)] border border-line px-2 py-1 text-xs text-muted">
            Reveal answer
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {["Again", "Hard", "Good", "Easy"].map((rating) => (
            <span
              key={rating}
              className="rounded-[var(--radius)] border border-line bg-surface px-2 py-2 text-center text-xs font-medium text-secondary"
            >
              {rating}
            </span>
          ))}
        </div>
        <MeterBar value={0.4} label="Cards reviewed today" />
      </div>
    </PreviewFrame>
  );
}

function CapturePreview() {
  return (
    <PreviewFrame title="Learn from content (sample data)" tone="sunken">
      <div className="flex flex-col gap-3">
        <div className="rounded-[var(--radius-lg)] border border-line bg-surface-raised p-4">
          <p className="text-xs text-muted">Pasted text · 472 characters</p>
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            La ciudad de Valencia celebra cada año una fiesta llamada Las Fallas…
          </p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {["fiesta", "visitantes", "cada año", "quemar"].map((word) => (
            <li
              key={word}
              className="rounded-[var(--radius)] border border-line bg-surface px-2.5 py-1.5 text-sm text-primary"
            >
              {word}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">
          Words you keep join the same review queue as the curriculum.
        </p>
      </div>
    </PreviewFrame>
  );
}

function SpeakingPreview() {
  return (
    <PreviewFrame title="Speaking practice (sample data)" tone="sunken">
      <div className="flex flex-col gap-4">
        <div className="rounded-[var(--radius-lg)] border border-line bg-surface-raised p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Scenario · A2
          </p>
          <p className="mt-1.5 text-sm font-medium text-primary">
            Meeting your partner&apos;s family
          </p>
          <p className="mt-2 text-sm text-secondary">
            Practise the phrases you will actually need before the conversation.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {["Comí con mi familia el domingo.", "Estuve en casa todo el día."].map((line) => (
            <div
              key={line}
              className="rounded-[var(--radius)] border border-line bg-surface px-3.5 py-2.5 text-sm text-primary"
            >
              {line}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          Scoring needs a speech provider, which is not connected — so this records that
          you practised rather than inventing a number.
        </p>
      </div>
    </PreviewFrame>
  );
}

/* -------------------------------------------------------------- closing --- */

function ClosingBand() {
  return (
    <section id="progress" className="px-4 py-3 sm:px-6 sm:py-4">
      <div className="mx-auto w-full max-w-6xl rounded-[var(--radius-section)] bg-tint-deep px-5 py-14 text-tint-deep-text sm:px-10 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-center lg:gap-16">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-tint-deep-text-soft">
              Progress
            </span>
            <h2 className="mt-2.5 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
              Numbers you can check.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-tint-deep-text-soft">
              Every figure comes from your own answers. Where there is not enough
              evidence to state something honestly, the product says so rather than
              showing a plausible-looking zero.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/sign-up" size="lg" className="sm:px-7">
                Start learning
                <Icon name="arrowRight" size={16} />
              </ButtonLink>
              <Link
                href="/sign-in"
                className="inline-flex min-h-[48px] items-center justify-center rounded-[var(--radius)] border border-tint-deep-line px-5 text-sm font-medium text-tint-deep-text transition-colors hover:bg-tint-deep-raised"
              >
                I already have an account
              </Link>
            </div>
          </div>

          <MeterStack />
        </div>
      </div>
    </section>
  );
}

/** The analysis layer, shown as measured bars rather than a decorative chart. */
function MeterStack() {
  const rows = [
    { label: "Reading", value: 0.72 },
    { label: "Vocabulary", value: 0.58 },
    { label: "Listening", value: 0.41 },
    { label: "Grammar", value: 0.33 },
  ];
  return (
    <div className="rounded-[var(--radius-xl)] border border-tint-deep-line bg-tint-deep-raised p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-tint-deep-text-soft">
        Language DNA (sample data)
      </p>
      <div className="mt-5 flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-tint-deep-text">{row.label}</span>
              <span className="text-xs tabular-nums text-tint-deep-text-soft">
                {Math.round(row.value * 100)}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--tint-deep)]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.round(row.value * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs leading-relaxed text-tint-deep-text-soft">
        A skill without enough evidence is shown as unavailable, not as 0%.
      </p>
    </div>
  );
}
