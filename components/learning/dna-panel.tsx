"use client";

import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress";
import { cx } from "@/lib/cx";
import { MIN_CONFIDENCE, type LanguageDna } from "@/lib/db/dna";
import { describePattern, type ConfusionPattern } from "@/lib/db/confusions";
import { SKILL_LABELS } from "@/lib/types";

/**
 * Language DNA.
 *
 * The rendering rule that matters: a skill whose confidence is below the floor
 * shows **no number at all**. It shows what is missing and how to produce the
 * evidence instead. That is not caution for its own sake — a percentage built on
 * two answers is the kind of claim a learner disproves the first time they try to
 * speak, and after that nothing on the screen is believable.
 */
export function LanguageDnaPanel({ dna }: { dna: LanguageDna }) {
  return (
    <Card>
      <CardHeader
        title="Language DNA"
        description="Each skill from your own activity, and only where there is enough of it."
      />

      {dna.observation ? (
        <p className="mt-4 rounded-[var(--radius)] border border-line bg-surface-sunken px-4 py-3 text-sm text-primary">
          {dna.observation}
        </p>
      ) : null}

      <ul className="mt-5 flex flex-col gap-5">
        {dna.estimates.map((estimate) => {
          const measured =
            estimate.score !== null && estimate.confidence >= MIN_CONFIDENCE;
          const percent = estimate.score === null ? 0 : Math.round(estimate.score * 100);

          return (
            <li key={estimate.skill}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-primary">
                  {SKILL_LABELS[estimate.skill]}
                </span>
                {measured ? (
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-primary">
                      {percent}%
                    </span>
                    {/* Confidence shown as a qualitative label, not another
                        number to interpret. */}
                    <Badge tone={estimate.confidence >= 0.75 ? "success" : "muted"}>
                      {estimate.confidence >= 0.75 ? "firm" : "early"}
                    </Badge>
                  </span>
                ) : (
                  <Badge tone="muted">no reading yet</Badge>
                )}
              </div>

              <div className="mt-1.5">
                <ProgressBar
                  value={measured ? estimate.score ?? 0 : 0}
                  label={`${SKILL_LABELS[estimate.skill]} strength`}
                  valueLabel={
                    measured
                      ? `${estimate.sampleSize} observations`
                      : "withheld — not enough evidence"
                  }
                  tone={measured ? "info" : "accent"}
                  size="md"
                  hideLabel
                />
              </div>

              <p className="mt-1 text-xs text-muted">
                {measured ? estimate.basis : (estimate.missing ?? estimate.basis)}
              </p>
            </li>
          );
        })}
      </ul>

      {dna.recommendation ? (
        <div className="mt-5 border-t border-line pt-4">
          <ButtonLink href={dna.recommendation.href} variant="secondary" size="sm">
            {dna.recommendation.cta}
          </ButtonLink>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * The confusion engine's output.
 *
 * Every claim carries the learner's own attempts and a way to dismiss it, which
 * is what separates "this app noticed something" from "this app is guessing". A
 * pattern shown here has at least three occurrences behind it.
 */
export function ConfusionPanel({ patterns }: { patterns: ConfusionPattern[] }) {
  if (patterns.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Nothing you keep getting wrong"
          description="This fills in when the same mistake shows up three times or more, so a single slip never gets called a weakness."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="What you keep getting wrong"
        description="Grouped from your own wrong answers. Every claim below shows the attempts behind it."
      />

      <ul className="mt-4 flex flex-col gap-4">
        {patterns.map((pattern) => (
          <li
            key={pattern.fingerprint}
            className="rounded-[var(--radius)] border border-line bg-surface-sunken p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{describeType(pattern.errorType)}</Badge>
              <span className="text-xs tabular-nums text-muted">
                {pattern.occurrences} time{pattern.occurrences === 1 ? "" : "s"}
                {pattern.distinctDays > 1 ? ` over ${pattern.distinctDays} days` : ""}
              </span>
            </div>

            <p className="mt-2.5 text-sm font-medium text-primary">
              {describePattern(pattern)}
            </p>

            {pattern.explanation ? (
              <p className="mt-1.5 text-sm text-secondary">{pattern.explanation}</p>
            ) : null}

            <div className="mt-3">
              <ButtonLink href={pattern.drillHref} variant="secondary" size="sm">
                <Icon name="practice" size={15} />
                Drill this
              </ButtonLink>
            </div>

            {pattern.examples.length > 0 ? (
              <details className="mt-3">
                <summary className="flex min-h-[44px] cursor-pointer items-center text-xs font-medium text-accent">
                  Show the attempts ({pattern.examples.length})
                </summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {pattern.examples.map((example, index) => (
                    <li
                      key={`${pattern.fingerprint}-${index}`}
                      className="flex flex-wrap gap-2 text-xs text-secondary"
                    >
                      <span className="tabular-nums text-muted">
                        {new Date(example.createdAt).toLocaleDateString("en", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                      <span>
                        wrote{" "}
                        <span className="font-medium text-danger">
                          {example.produced ?? "(nothing)"}
                        </span>
                      </span>
                      {example.expected ? (
                        <span>
                          expected{" "}
                          <span className="font-medium text-success">
                            {example.expected}
                          </span>
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-muted">
        Practising these records how you do, so a pattern stops being reported once
        you have clearly stopped making the mistake. Everything stays in your normal
        review queue too.
      </p>
    </Card>
  );
}

function describeType(errorType: string): string {
  const labels: Record<string, string> = {
    conjugation: "verb forms",
    gender: "gender",
    word_order: "word order",
    vocabulary: "word choice",
    tense: "tense",
    preposition: "prepositions",
    pronunciation: "pronunciation",
    spelling: "spelling",
    register: "formality",
  };
  return labels[errorType] ?? errorType;
}

/** A single-line summary for the dashboard, with the detail kept on Progress. */
export function ConfusionSummaryCard({
  patterns,
  languageCode,
  className,
}: {
  patterns: ConfusionPattern[];
  languageCode: string;
  className?: string;
}) {
  if (patterns.length === 0) return null;

  const worst = patterns[0];
  if (!worst) return null;

  return (
    <Card className={cx(className)}>
      <CardHeader
        title="A pattern worth fixing"
        description="From your own wrong answers."
      />

      <p className="mt-3 text-sm font-medium text-primary">
        {describePattern(worst)}
      </p>
      {worst.explanation ? (
        <p className="mt-1.5 text-sm text-secondary">{worst.explanation}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ButtonLink href={worst.drillHref} size="sm">
          <Icon name="practice" size={15} />
          Drill this now
        </ButtonLink>
        <ButtonLink href={`/${languageCode}/review`} variant="ghost" size="sm">
          Or review instead
        </ButtonLink>
        {patterns.length > 1 ? (
          <span className="text-xs text-muted">
            and {patterns.length - 1} more pattern
            {patterns.length - 1 === 1 ? "" : "s"} on Progress
          </span>
        ) : null}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <Icon name="chart" size={13} />
        {patterns.reduce((sum, pattern) => sum + pattern.occurrences, 0)} repeated
        mistakes grouped
      </p>
    </Card>
  );
}
