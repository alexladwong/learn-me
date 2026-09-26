import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Badge, CapabilityNotice, EmptyState } from "@/components/ui/empty-state";
import { ProgressBar, ProgressRing, StatTile } from "@/components/ui/progress";
import { Field, FormError, Select, TextArea, TextInput } from "@/components/ui/form";
import { LanguageDnaPanel, ConfusionPanel } from "@/components/learning/dna-panel";
import { PlanPanel, UpgradeNotice } from "@/components/billing/plan-panel";
import type { Entitlement } from "@/lib/entitlements/features";
import { ModeSwitcher } from "@/app/(app)/[lang]/mode-switcher";
import type { LanguageDna } from "@/lib/db/dna";
import type { ConfusionPattern } from "@/lib/db/confusions";

export const metadata: Metadata = { title: "Layout probe" };

/**
 * A measurement harness for the shared presentation layer.
 *
 * The product must work at 320, 375, 390, 430, 768 and 1024 pixels, and this
 * page renders every presentational component at realistic content lengths so
 * those widths can be measured rather than assumed.
 *
 * It exists because the alternative is guessing. A static scan for `w-[400px]`
 * catches arbitrary widths but not the cases that actually break a narrow
 * screen: a grid that will not shrink, a long target-language sentence that
 * cannot wrap, a four-column stat row, or a sticky header whose contents
 * overflow. Only a real layout engine answers those, so this page is driven by
 * `scripts/verify-layout.mjs`, which measures it in headless Chrome.
 *
 * Long strings below are deliberately at the unhelpful end of realistic: the
 * longest German compound in the curriculum, a long translation, a wide digit
 * count. Components are shown under stress, not under flattering sample data.
 */

/** The longest surface in the seeded curriculum, plus a synthetic stress case. */
const LONG_SURFACE = "Ils appellent leur mère chaque semaine et ils préparent le dîner ensemble.";
const LONG_GLOSS =
  "They call their mother every week and they prepare dinner together, which is a deliberately long gloss";

const DNA: LanguageDna = {
  languageCode: "fr",
  estimates: [
    {
      skill: "vocabulary",
      score: 0.82,
      confidence: 0.9,
      sampleSize: 41,
      basis: "41 saved items",
      missing: null,
    },
    {
      skill: "reading",
      score: 0.67,
      confidence: 0.96,
      sampleSize: 24,
      basis: "Comprehension answers on written prompts",
      missing: null,
    },
    {
      skill: "listening",
      score: null,
      confidence: 0,
      sampleSize: 0,
      basis: "No listening exercise has been answered with audio yet",
      missing: "Listening exercises need audio, which no provider has generated yet.",
    },
    {
      skill: "grammar",
      score: 0.71,
      confidence: 0.44,
      sampleSize: 11,
      basis: "Graded answers that tested a specific form",
      missing: null,
    },
    {
      skill: "speaking",
      score: null,
      confidence: 0,
      sampleSize: 0,
      basis: "No scored speaking signal exists yet.",
      missing: "Recorded speaking practice is not built yet, so there is nothing to measure.",
    },
    {
      skill: "pronunciation",
      score: null,
      confidence: 0,
      sampleSize: 0,
      basis: "Needs a speech-analysis provider",
      missing: "Pronunciation scoring needs a speech-analysis provider, which is not connected.",
    },
  ],
  confident: [],
  observation:
    "Your vocabulary is 82% while your reading is 67%. That gap is worth closing with more comprehension practice.",
  recommendation: { skill: "reading", href: "/fr/review", cta: "Practise recall" },
  totalEvidence: 76,
};

const PATTERNS: ConfusionPattern[] = [
  {
    fingerprint: "conjugation:mange",
    errorType: "conjugation",
    lemma: "manger",
    occurrences: 4,
    distinctDays: 3,
    lastSeenAt: new Date().toISOString(),
    correctStreak: 0,
    wasResolved: false,
    examples: [
      { expected: "mange", produced: "manges", createdAt: new Date().toISOString(), mode: "recall" },
      { expected: "mange", produced: "mangeons", createdAt: new Date().toISOString(), mode: "recall" },
      { expected: "mange", produced: "mangent", createdAt: new Date().toISOString(), mode: "recall" },
    ],
    explanation: "You wrote manges (2nd person singular) but the answer is mange (1st person singular).",
    producedForms: ["manges", "mangeons", "mangent"],
    expectedForm: "mange",
    drillHref: "/fr/drill/conjugation%3Amange",
    contextLabel: null,
  },
];

/**
 * Entitlement fixtures covering the three states the panel renders differently:
 * exhausted, unlimited, and not built.
 */
const PROBE_ENTITLEMENTS: Entitlement[] = [
  { feature: "active_languages", limit: 1, used: 1, source: "free", periodEnd: null },
  { feature: "ai_translation", limit: 40, used: 12, source: "free", periodEnd: null },
  { feature: "ai_conversation", limit: 5, used: 5, source: "free", periodEnd: null },
  { feature: "pronunciation_scoring", limit: 0, used: 0, source: "free", periodEnd: null },
  { feature: "content_capture", limit: null, used: 3, source: "subscription", periodEnd: null },
  { feature: "advanced_analytics", limit: 0, used: 0, source: "free", periodEnd: null },
  { feature: "offline_lessons", limit: 0, used: 0, source: "free", periodEnd: null },
];

export default function LayoutProbePage() {
  return (
    <div id="probe-root" className="bg-surface px-4 py-6 text-primary">
      <p className="mb-6 text-xs text-muted">
        Layout probe. Measured by scripts/verify-layout.mjs. Not linked from the app.
      </p>

      {/* ---- Dashboard: today's session + metrics + panels ------------------- */}
      <section data-probe="dashboard" className="flex flex-col gap-6">
        <div>
          <p className="text-sm text-secondary">Good evening, Ambassadorz</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary">
            Today&apos;s French
          </h1>
          <div className="mt-3">
            <ModeSwitcher
              languageCode="fr"
              active="study"
              minutes={{
                quick: 5,
                commute: 15,
                study: 20,
                speak: 10,
                review: null,
                explore: null,
              }}
            />
          </div>
        </div>

        <Card tone="raised">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <ProgressRing
              value={0.42}
              primary="12"
              secondary="of 30 min"
              label="Daily goal: 12 of 30 minutes planned"
            />
            <div className="min-w-0 flex-1">
              <ul className="flex flex-col gap-2.5">
                <li className="flex items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
                    <Icon name="cards" size={15} />
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-primary">
                    24 cards due for review
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">5 min</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
                    <Icon name="learn" size={15} />
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-primary">
                    Guided lesson: Eating and drinking
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">7 min</span>
                </li>
              </ul>
              <div className="mt-5">
                <ButtonLink href="/fr/review" size="lg" fullWidth>
                  Start today&apos;s session
                  <Icon name="arrowRight" size={18} />
                </ButtonLink>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Streak" value={12} hint="days in a row" icon={<Icon name="flame" size={14} />} />
          <StatTile label="Words learned" value={148} icon={<Icon name="plus" size={14} />} />
          <StatTile label="Sentences" value={37} hint="mastered" icon={<Icon name="book" size={14} />} />
          <StatTile label="Reviews due" value={24} icon={<Icon name="cards" size={14} />} />
          <StatTile label="Listening" value={62} hint="minutes" icon={<Icon name="volume" size={14} />} />
          <StatTile label="Speaking" value={null} hint="minutes" icon={<Icon name="speak" size={14} />} />
        </div>

        <Card>
          <CardHeader
            title="Your learning path"
            description="Where you are in the guided journey."
            action={
              <Link
                href="/fr/path"
                className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent hover:underline"
              >
                View all
              </Link>
            }
          />
          <div className="mt-4">
            <ProgressBar
              value={0.5}
              label="Foundations"
              valueLabel="2 of 4 units"
              size="md"
            />
            <p className="mt-2 text-xs text-muted">4 of 8 lessons complete.</p>
          </div>
        </Card>
      </section>

      {/* ---- Review session ------------------------------------------------ */}
      <section data-probe="review" className="mt-10 flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <ButtonLink href="/fr/review" variant="ghost" size="sm">
            <Icon name="arrowLeft" size={16} />
            Exit
          </ButtonLink>
          <div className="min-w-0 flex-1">
            <ProgressBar value={0.3} label="Card 7 of 24" valueLabel="18 left" />
          </div>
          <Badge tone="muted">conjugation</Badge>
        </div>

        <Card tone="raised" className="flex flex-col gap-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Say it in the target language
            </p>
            <p className="mt-3 text-2xl font-semibold leading-snug text-primary">
              {LONG_GLOSS}
            </p>
          </div>

          <CapabilityNotice
            title="Audio not generated for this item"
            description="Audio is produced once per item and cached for every learner."
          />

          <form>
            <label htmlFor="probe-answer" className="mb-1.5 block text-sm font-medium text-primary">
              Your answer
            </label>
            <input
              id="probe-answer"
              defaultValue={LONG_SURFACE}
              className="h-12 w-full rounded-[var(--radius)] border border-line-strong bg-surface-raised px-3.5 text-base text-primary"
            />
          </form>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {(["Again", "Hard", "Good", "Easy"] as const).map((label) => (
              <button
                key={label}
                type="button"
                className="flex min-h-[52px] flex-col items-center justify-center rounded-[var(--radius)] border-2 border-line-strong bg-surface-raised px-2 text-sm font-semibold text-primary"
              >
                <span>{label}</span>
                <span className="mt-0.5 text-[11px] font-normal opacity-80">1</span>
              </button>
            ))}
          </div>
        </Card>
      </section>

      {/* ---- Bank entry ---------------------------------------------------- */}
      <section data-probe="bank" className="mt-10 flex flex-col gap-3">
        <article className="rounded-[var(--radius-lg)] border border-line bg-surface-raised p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-target text-lg font-semibold text-primary">{LONG_SURFACE}</p>
              <p className="mt-1 text-sm text-secondary">{LONG_GLOSS}</p>
              <p className="mt-0.5 text-xs text-muted">Literally: {LONG_GLOSS}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" aria-label="Favourite" className="flex size-11 items-center justify-center rounded-full text-muted">
                <Icon name="practice" size={18} />
              </button>
              <button type="button" aria-label="Remove" className="flex size-11 items-center justify-center rounded-full text-muted">
                <Icon name="inbox" size={18} />
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="muted">sentence</Badge>
            <Badge tone="success">Well established</Badge>
            <Badge tone="neutral">from a lesson</Badge>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">Reviews</dt>
              <dd className="mt-0.5 tabular-nums text-primary">12</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Strength</dt>
              <dd className="mt-0.5 tabular-nums text-primary">34.7d</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Difficulty</dt>
              <dd className="mt-0.5 tabular-nums text-primary">5.2</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Next review</dt>
              <dd className="mt-0.5 text-primary">35 days</dd>
            </div>
          </dl>
        </article>
      </section>

      {/* ---- Progress: DNA + confusions ------------------------------------ */}
      <section data-probe="progress" className="instrument mt-10 rounded-[var(--radius-lg)] p-4">
        <div className="flex flex-col gap-6">
          <LanguageDnaPanel dna={DNA} />
          <ConfusionPanel patterns={PATTERNS} />
        </div>
      </section>

      {/* ---- Auth form ----------------------------------------------------- */}
      <section data-probe="auth" className="mt-10">
        <Card tone="raised">
          <FormError message="That email and password combination is not right." />
          <div className="mt-4 flex flex-col gap-4">
            <Field label="Email" htmlFor="probe-email" required>
              <TextInput id="probe-email" type="email" placeholder="you@example.com" />
            </Field>
            <Field label="Password" htmlFor="probe-password" required hint="At least 8 characters.">
              <TextInput id="probe-password" type="password" placeholder="••••••••" />
            </Field>
            <Field label="Preferred time" htmlFor="probe-select">
              <Select id="probe-select">
                <option>10 minutes a day</option>
              </Select>
            </Field>
            <Field label="Paste text" htmlFor="probe-textarea">
              <TextArea id="probe-textarea" rows={4} defaultValue={LONG_SURFACE} />
            </Field>
          </div>
        </Card>
      </section>

      {/* ---- Plan and upgrade surface -------------------------------------- */}
      <section data-probe="plan" className="mt-10 flex flex-col gap-4">
        <PlanPanel planName="Free" isPremium={false} entitlements={PROBE_ENTITLEMENTS} />
        <UpgradeNotice
          featureLabel="AI conversations"
          headline="You have had 5 AI conversations and learned 41 new expressions."
          body="The free plan includes 5 conversations a month. Premium removes that limit."
        />
        <UpgradeNotice
          featureLabel="AI conversations"
          headline={null}
          body="The free plan includes 5 conversations a month. Premium removes that limit."
        />
      </section>

      {/* ---- Empty state --------------------------------------------------- */}
      <section data-probe="empty" className="mt-10">
        <EmptyState
          icon={<Icon name="book" size={20} />}
          title="Your bank is empty"
          description="Finish a lesson and its sentences and words are added here automatically."
          action={
            <ButtonLink href="/fr/path" size="sm">
              Go to the learning path
            </ButtonLink>
          }
        />
      </section>
    </div>
  );
}
