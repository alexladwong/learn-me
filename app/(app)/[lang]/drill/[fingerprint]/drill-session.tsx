"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress";
import { cx } from "@/lib/cx";
import { completeDrill } from "./actions";
import type { Drill, DrillStep } from "@/lib/learning/drill";
import { equalsLoose } from "@/lib/learning/answer";

/**
 * A confusion drill session.
 *
 * Short by design — one contrast, then a handful of attempts, then a checkpoint
 * with no options. The learner should be able to finish it while standing in a
 * queue, which is why it is bounded at `MAX_DRILL_STEPS` in the builder.
 *
 * Keyboard-drivable like the review session, because this is meant to be done
 * often and quickly.
 */

type Answer = { prompt: string; produced: string; isCorrect: boolean };

export function DrillSession({
  drill,
  languageCode,
  attemptsBehindIt,
}: {
  drill: Drill;
  languageCode: string;
  /** How many wrong answers produced this drill, shown as the reason it exists. */
  attemptsBehindIt: number;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [finished, setFinished] = useState(false);

  const step = drill.steps[index];

  const record = useCallback(
    (answer: Answer) => {
      setAnswers((previous) => [...previous, answer]);
      const next = index + 1;
      if (next >= drill.steps.length) setFinished(true);
      else setIndex(next);
    },
    [index, drill.steps.length],
  );

  if (finished || !step) {
    return (
      <DrillSummary
        drill={drill}
        answers={answers}
        languageCode={languageCode}
        attemptsBehindIt={attemptsBehindIt}
      />
    );
  }

  const gradedTotal = drill.gradedSteps;
  const gradedSoFar = answers.length;
  const progress = gradedTotal > 0 ? gradedSoFar / gradedTotal : 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <header className="flex items-center gap-4">
        <ButtonLink
          href={`/${languageCode}/progress`}
          variant="ghost"
          size="sm"
          aria-label="Leave the drill"
        >
          <Icon name="arrowLeft" size={16} />
          Exit
        </ButtonLink>
        <div className="min-w-0 flex-1">
          <ProgressBar
            value={progress}
            label="Drill progress"
            valueLabel={
              gradedTotal > 0 ? `${gradedSoFar} / ${gradedTotal}` : "Introduction"
            }
          />
        </div>
        <Badge tone="accent">drill</Badge>
      </header>

      <StepView key={step.id} step={step} onComplete={record} />
    </div>
  );
}

function StepView({
  step,
  onComplete,
}: {
  step: DrillStep;
  onComplete: (answer: Answer) => void;
}) {
  if (step.kind === "teach") {
    return (
      <TeachCard
        step={step}
        onContinue={() => onComplete({ prompt: "teach", produced: "", isCorrect: true })}
      />
    );
  }

  if (step.kind === "choose") {
    return <ChooseStep step={step} onComplete={onComplete} />;
  }

  return <TypeStep step={step} onComplete={onComplete} />;
}

function TeachCard({
  step,
  onContinue,
}: {
  step: Extract<DrillStep, { kind: "teach" }>;
  onContinue: () => void;
}) {
  return (
    <Card tone="raised" className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          What went wrong
        </p>
        <h1 className="mt-1.5 text-lg font-semibold text-primary">{step.headline}</h1>
        {step.detail ? (
          <p className="mt-2 text-sm text-secondary">{step.detail}</p>
        ) : null}
      </div>

      {/* The forms, side by side. The one they should have used is marked with
          both a label and a colour, so the distinction is never colour-only. */}
      <ul className="flex flex-col gap-2">
        {step.forms.map((form) => (
          <li
            key={form.key}
            className={cx(
              "flex items-center gap-3 rounded-[var(--radius)] border px-4 py-3",
              form.isExpected
                ? "border-success/40 bg-success-soft"
                : "border-line bg-surface-sunken",
            )}
          >
            <span className="text-target text-lg font-semibold text-primary">
              {form.form}
            </span>
            <span className="min-w-0 flex-1 text-sm text-secondary">
              {form.gloss ?? "—"}
            </span>
            {form.label ? (
              <span className="shrink-0 text-xs text-muted">{form.label}</span>
            ) : null}
            {form.isExpected ? (
              <Badge tone="success">the answer</Badge>
            ) : form.mistakeCount > 0 ? (
              <Badge tone="muted">
                you wrote this {form.mistakeCount}×
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>

      {step.attempts.length > 0 ? (
        <details className="rounded-[var(--radius)] border border-line bg-surface-sunken">
          <summary className="flex min-h-[44px] cursor-pointer items-center px-4 py-3 text-sm font-medium text-primary">
            Your actual attempts ({step.attempts.length})
          </summary>
          <ul className="flex flex-col gap-1 px-4 pb-3 text-sm">
            {step.attempts.map((attempt, index) => (
              <li key={`${attempt.produced}-${index}`} className="flex gap-2">
                <span className="text-danger">{attempt.produced}</span>
                {attempt.expected ? (
                  <>
                    <span className="text-muted">should have been</span>
                    <span className="text-success">{attempt.expected}</span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="border-t border-line pt-5">
        <Button size="lg" fullWidth onClick={onContinue}>
          Start the drill
          <Icon name="arrowRight" size={18} />
        </Button>
      </div>
    </Card>
  );
}

function ChooseStep({
  step,
  onComplete,
}: {
  step: Extract<DrillStep, { kind: "choose" }>;
  onComplete: (answer: Answer) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const correct = chosen === step.answer;

  useKeyboardRating({
    revealed: chosen !== null,
    onContinue: () => {
      if (chosen !== null) {
        onComplete({ prompt: step.prompt, produced: chosen, isCorrect: correct });
      }
    },
    onNumber: (position) => {
      const option = step.options[position - 1];
      if (option !== undefined && chosen === null) setChosen(option);
    },
  });

  return (
    <Card tone="raised" className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {step.instruction}
        </p>
        <p className="text-target mt-2 text-xl font-semibold text-primary">
          {step.prompt}
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {step.options.map((option, position) => {
          const isChosen = chosen === option;
          const isAnswer = option === step.answer;
          const revealed = chosen !== null;

          return (
            <li key={option}>
              <button
                type="button"
                disabled={revealed}
                onClick={() => setChosen(option)}
                className={cx(
                  "flex min-h-[48px] w-full items-center gap-3 rounded-[var(--radius)] border px-4 py-3 text-left text-sm transition-colors",
                  !revealed &&
                    "border-line-strong bg-surface-raised text-primary hover:border-accent hover:bg-accent-subtle",
                  revealed && isAnswer && "border-success bg-success-soft text-success",
                  revealed &&
                    isChosen &&
                    !isAnswer &&
                    "border-danger bg-danger-soft text-danger",
                  revealed &&
                    !isAnswer &&
                    !isChosen &&
                    "border-line bg-surface-sunken text-muted",
                )}
              >
                <span className="w-4 shrink-0 text-xs tabular-nums text-muted">
                  {position + 1}
                </span>
                {revealed && (isAnswer || isChosen) ? (
                  <Icon
                    name={isAnswer ? "check" : "inbox"}
                    size={16}
                    className="shrink-0"
                  />
                ) : null}
                <span>{option}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {chosen !== null ? (
        <>
          <p
            className={cx(
              "text-sm font-medium",
              correct ? "text-success" : "text-danger",
            )}
          >
            {correct ? "Correct." : `Not quite — the answer is “${step.answer}”.`}
          </p>
          {step.explanation ? (
            <p className="text-sm text-secondary">{step.explanation}</p>
          ) : null}
          <Button
            size="lg"
            fullWidth
            onClick={() =>
              onComplete({ prompt: step.prompt, produced: chosen, isCorrect: correct })
            }
          >
            Continue
            <Icon name="arrowRight" size={18} />
          </Button>
        </>
      ) : (
        <p className="text-xs text-muted">
          Press 1–{step.options.length} to choose, or tap an option.
        </p>
      )}
    </Card>
  );
}

function TypeStep({
  step,
  onComplete,
}: {
  step: Extract<DrillStep, { kind: "produce" | "checkpoint" }>;
  onComplete: (answer: Answer) => void;
}) {
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);
  const correct = equalsLoose(typed, step.answer);
  const inputId = `drill-${step.id}`;

  const submit = useCallback(() => {
    setChecked(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" && checked) {
        event.preventDefault();
        onComplete({ prompt: step.prompt, produced: typed, isCorrect: correct });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [checked, correct, onComplete, step.prompt, typed]);

  return (
    <Card tone="raised" className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {step.instruction}
        </p>
        <p className="text-target mt-2 text-xl font-semibold text-primary">
          {step.prompt}
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!checked) submit();
        }}
      >
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-primary">
          Your answer
        </label>
        <input
          id={inputId}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          disabled={checked}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Type the missing form"
          className="h-12 w-full rounded-[var(--radius)] border border-line-strong bg-surface-raised px-3.5 text-base text-primary placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:opacity-70"
        />
        {!checked ? (
          <div className="mt-4">
            <Button type="submit" size="lg" fullWidth>
              Check
            </Button>
          </div>
        ) : null}
      </form>

      {checked ? (
        <>
          <p
            className={cx(
              "text-sm font-medium",
              correct ? "text-success" : "text-danger",
            )}
          >
            {correct ? "Correct." : `Not quite — the answer is “${step.answer}”.`}
          </p>
          {step.explanation ? (
            <p className="text-sm text-secondary">{step.explanation}</p>
          ) : null}
          <Button
            size="lg"
            fullWidth
            onClick={() =>
              onComplete({ prompt: step.prompt, produced: typed, isCorrect: correct })
            }
          >
            Continue
            <Icon name="arrowRight" size={18} />
            <kbd className="ml-1 rounded border border-current/30 px-1.5 py-0.5 text-[10px] font-normal">
              Enter
            </kbd>
          </Button>
        </>
      ) : null}
    </Card>
  );
}

/**
 * Shared keyboard handling for the multiple-choice step.
 *
 * Number keys select; Enter continues once something is chosen. Mirrors the
 * review session so the two do not feel like different apps.
 */
function useKeyboardRating({
  revealed,
  onContinue,
  onNumber,
}: {
  revealed: boolean;
  onContinue: () => void;
  onNumber: (position: number) => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" && revealed) {
        event.preventDefault();
        onContinue();
        return;
      }
      const position = Number(event.key);
      if (Number.isInteger(position) && position >= 1 && position <= 6 && !revealed) {
        event.preventDefault();
        onNumber(position);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [revealed, onContinue, onNumber]);
}

function DrillSummary({
  drill,
  answers,
  languageCode,
  attemptsBehindIt,
}: {
  drill: Drill;
  answers: Answer[];
  languageCode: string;
  attemptsBehindIt: number;
}) {
  const [state, setState] = useState<
    | { status: "saving" }
    | { status: "saved"; message: string; correct: number; total: number }
    | { status: "error"; message: string }
  >({ status: "saving" });

  const graded = useMemo(
    () => answers.filter((answer) => answer.prompt !== "teach"),
    [answers],
  );
  const correct = graded.filter((answer) => answer.isCorrect).length;

  useEffect(() => {
    let cancelled = false;

    void completeDrill({
      languageCode,
      fingerprint: drill.fingerprint,
      expectedForm: drill.subject,
      answers: graded.map((answer) => ({
        prompt: answer.prompt,
        produced: answer.produced,
        isCorrect: answer.isCorrect,
      })),
    })
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          setState({
            status: "saved",
            message: response.message,
            correct: response.correct,
            total: response.total,
          });
        } else {
          setState({ status: "error", message: response.error });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[drill] completion failed", error);
        setState({
          status: "error",
          message: "Could not save your answers. Check your connection and try again.",
        });
      });

    return () => {
      cancelled = true;
    };
    // Runs once, when the summary mounts: `graded` is complete by then and the
    // outcome must not be re-submitted on a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accuracy = graded.length > 0 ? Math.round((correct / graded.length) * 100) : null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <Card tone="raised">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          Drill complete
        </p>
        <h1 className="mt-1.5 text-xl font-semibold text-primary">
          {drill.subject}: {graded.length} attempt{graded.length === 1 ? "" : "s"}
        </h1>

        <dl className="mt-5 grid grid-cols-3 gap-4">
          <div>
            <dt className="text-xs text-muted">Correct</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-primary">
              {correct} / {graded.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Accuracy</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-primary">
              {accuracy === null ? "—" : `${accuracy}%`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Pattern from</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-primary">
              {attemptsBehindIt}
            </dd>
          </div>
        </dl>

        <div className="mt-5 rounded-[var(--radius)] border border-line bg-surface-sunken px-4 py-3">
          {state.status === "saving" ? (
            <p className="flex items-center gap-2 text-sm text-secondary">
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              Recording your answers…
            </p>
          ) : state.status === "saved" ? (
            <p className="text-sm text-secondary">{state.message}</p>
          ) : (
            <p role="status" className="text-sm font-medium text-danger">
              {state.message}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={`/${languageCode}/progress`} fullWidth>
            Back to progress
          </ButtonLink>
          <ButtonLink
            href={`/${languageCode}/review`}
            variant="secondary"
            fullWidth
          >
            Go to review
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
