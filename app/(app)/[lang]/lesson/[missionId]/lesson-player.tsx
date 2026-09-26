"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress";
import { AnswerPanel } from "@/components/learning/answer-panel";
import { AudioButton } from "@/components/learning/audio-button";
import { cx } from "@/lib/cx";
import { completeLesson } from "./actions";
import type { Lesson, LessonStep, StepType } from "@/lib/db/lessons";
import { answerModeFor, buildOptions, equalsLoose } from "@/lib/learning/answer";
import { shuffleTokens } from "@/lib/learning/shuffle";

/**
 * The guided lesson player.
 *
 * Walks a mission's steps in order, then enrols everything the mission teaches
 * into spaced repetition. That last part is the point of the screen: a lesson is
 * not a quiz you complete, it is how material enters your long-term schedule.
 *
 * Step presentation follows the teaching sequence:
 *   teach      read it, listen to it, move on
 *   recognise  choose the meaning
 *   recall     produce it from memory by typing
 *   listen     meaning from audio — presented as recognition while no audio exists
 *   arrange    rebuild the sentence from its words
 *   speak      say it aloud (self-reported; no score is claimed)
 */

type StepResult = {
  itemId: string;
  stepType: string;
  isCorrect: boolean;
  expected?: string;
  produced?: string;
  latencyMs?: number;
};

/** Steps answered by a mechanism that produces a right/wrong answer. */
const GRADED_STEPS: ReadonlySet<string> = new Set<StepType>([
  "recognise",
  "recall",
  "translate",
  "listen",
  "arrange",
  "match",
  "checkpoint",
]);

export function LessonPlayer({
  lesson,
  languageCode,
  languageName,
}: {
  lesson: Lesson;
  languageCode: string;
  languageName: string;
}) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<StepResult[]>([]);
  const [finished, setFinished] = useState(false);

  const step = lesson.steps[index];
  const progress = lesson.steps.length > 0 ? index / lesson.steps.length : 0;

  const record = useCallback(
    (result: StepResult) => {
      setResults((previous) => [...previous, result]);
      const next = index + 1;
      if (next >= lesson.steps.length) setFinished(true);
      else setIndex(next);
    },
    [index, lesson.steps.length],
  );

  if (finished || !step) {
    return (
      <LessonSummary
        lesson={lesson}
        languageCode={languageCode}
        languageName={languageName}
        results={results}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <header className="flex items-center gap-4">
        <ButtonLink
          href={`/${languageCode}/path`}
          variant="ghost"
          size="sm"
          aria-label="Leave the lesson"
        >
          <Icon name="arrowLeft" size={16} />
          Exit
        </ButtonLink>
        <div className="min-w-0 flex-1">
          <ProgressBar
            value={progress}
            label={lesson.title}
            valueLabel={`${index + 1} / ${lesson.steps.length}`}
          />
        </div>
        <Badge tone="muted">{lesson.unitTitle}</Badge>
      </header>

      <StepView
        key={step.id}
        step={step}
        stepNumber={index + 1}
        languageCode={languageCode}
        distractors={lesson.steps.map((candidate) => candidate.item.translationNatural)}
        onComplete={record}
      />
    </div>
  );
}

function StepView({
  step,
  stepNumber,
  languageCode,
  distractors,
  onComplete,
}: {
  step: LessonStep;
  stepNumber: number;
  /** Needed by every step that offers audio, so the right voice is chosen. */
  languageCode: string;
  distractors: string[];
  onComplete: (result: StepResult) => void;
}) {
  const item = step.item;
  const [startedAt] = useState(() => Date.now());

  const isTeach = step.stepType === "teach";
  const isSpeak = step.stepType === "speak";
  const isArrange = step.stepType === "arrange";
  const useTyping = !isTeach && !isSpeak && !isArrange && answerModeFor(item.surface) === "recall";
  const prompt = step.prompt ?? defaultPrompt(step.stepType);

  return (
    <Card tone="raised" className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{prompt}</p>
        <span className="shrink-0 text-xs tabular-nums text-muted">Step {stepNumber}</span>
      </div>

      {isTeach ? (
        <TeachStep
          item={item}
          languageCode={languageCode}
          onContinue={() =>
            onComplete({
              itemId: item.id,
              stepType: step.stepType,
              isCorrect: true, // Reading an introduction cannot be wrong.
              latencyMs: Date.now() - startedAt,
            })
          }
        />
      ) : isSpeak ? (
        <SpeakStep
          item={item}
          languageCode={languageCode}
          onContinue={(said) =>
            onComplete({
              itemId: item.id,
              stepType: step.stepType,
              isCorrect: said,
              latencyMs: Date.now() - startedAt,
            })
          }
        />
      ) : isArrange ? (
        <ArrangeStep
          item={item}
          onComplete={(isCorrect, produced) =>
            onComplete({
              itemId: item.id,
              stepType: step.stepType,
              isCorrect,
              expected: item.surface,
              produced,
              latencyMs: Date.now() - startedAt,
            })
          }
        />
      ) : step.stepType === "listen" ? (
        <ListenStep
          item={item}
          languageCode={languageCode}
          distractors={distractors}
          onComplete={(isCorrect, produced) =>
            onComplete({
              itemId: item.id,
              stepType: step.stepType,
              isCorrect,
              expected: item.translationNatural,
              produced,
              latencyMs: Date.now() - startedAt,
            })
          }
        />
      ) : useTyping ? (
        <RecallStep
          item={item}
          onComplete={(isCorrect, produced) =>
            onComplete({
              itemId: item.id,
              stepType: step.stepType,
              isCorrect,
              expected: item.surface,
              produced,
              latencyMs: Date.now() - startedAt,
            })
          }
        />
      ) : (
        <RecogniseStep
          item={item}
          languageCode={languageCode}
          distractors={distractors}
          onComplete={(isCorrect, produced) =>
            onComplete({
              itemId: item.id,
              stepType: step.stepType,
              isCorrect,
              expected: item.translationNatural,
              produced,
              latencyMs: Date.now() - startedAt,
            })
          }
        />
      )}
    </Card>
  );
}

function defaultPrompt(stepType: StepType): string {
  switch (stepType) {
    case "teach":
      return "New — read it and listen";
    case "recognise":
      return "What does this mean?";
    case "recall":
      return "Say it in the language you are learning";
    case "listen":
      return "Understand it by ear";
    case "speak":
      return "Say it out loud";
    case "arrange":
      return "Put the words in order";
    case "translate":
      return "Translate it";
    case "checkpoint":
      return "Checkpoint";
    default:
      return "Your turn";
  }
}

function TeachStep({
  item,
  languageCode,
  onContinue,
}: {
  item: LessonStep["item"];
  languageCode: string;
  onContinue: () => void;
}) {
  return (
    <>
      <div>
        <p className="text-target text-2xl font-semibold text-primary">{item.surface}</p>
        <p className="mt-2 text-lg text-secondary">{item.translationNatural}</p>
        {item.translationLiteral ? (
          <p className="mt-1 text-sm text-muted">Literally: {item.translationLiteral}</p>
        ) : null}
      </div>

      <AudioButton
        text={item.surface}
        languageCode={languageCode}
        normalUrl={item.audioNormalUrl}
        slowUrl={item.audioSlowUrl}
      />

      {item.grammarNote ? (
        <div className="rounded-[var(--radius)] border border-line bg-surface-sunken px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Why</p>
          <p className="mt-1 text-sm text-secondary">{item.grammarNote}</p>
        </div>
      ) : null}

      {item.vocabBreakdown.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {item.vocabBreakdown.map((part) => (
            <li key={`${part.token}-${part.gloss}`} className="flex gap-3 text-sm">
              <span className="font-medium text-primary">{part.token}</span>
              <span className="text-secondary">{part.gloss}</span>
              {part.pos ? (
                <span className="ml-auto text-xs text-muted">{part.pos}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="border-t border-line pt-5">
        <Button size="lg" fullWidth onClick={onContinue}>
          Got it
          <Icon name="arrowRight" size={18} />
        </Button>
      </div>
    </>
  );
}

/**
 * Four-option question. Shared by recognise and listen steps so the option
 * button behaves identically wherever it appears.
 */
function ChoiceQuestion({
  surface,
  answer,
  options,
  showSurface,
  onResolved,
}: {
  surface: string;
  answer: string;
  options: string[];
  showSurface: boolean;
  onResolved: (isCorrect: boolean, produced: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const correct = chosen === answer;
  const revealed = chosen !== null;

  return (
    <>
      {showSurface ? (
        <p className="text-target text-2xl font-semibold text-primary">{surface}</p>
      ) : null}

      <ul className="flex flex-col gap-2.5">
        {options.map((option) => {
          const isChosen = chosen === option;
          const isAnswer = option === answer;

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
                  revealed && isChosen && !isAnswer && "border-danger bg-danger-soft text-danger",
                  revealed && !isAnswer && !isChosen && "border-line bg-surface-sunken text-muted",
                )}
              >
                {revealed && (isAnswer || isChosen) ? (
                  <Icon name={isAnswer ? "check" : "inbox"} size={16} className="shrink-0" />
                ) : null}
                <span>{option}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {revealed ? (
        <Button size="lg" fullWidth onClick={() => onResolved(correct, chosen)}>
          Continue
          <Icon name="arrowRight" size={18} />
        </Button>
      ) : null}
    </>
  );
}

function RecogniseStep({
  item,
  languageCode,
  distractors,
  onComplete,
}: {
  item: LessonStep["item"];
  languageCode: string;
  distractors: string[];
  onComplete: (isCorrect: boolean, produced: string) => void;
}) {
  const options = useMemo(
    () => buildOptions(item.translationNatural, distractors),
    [item.translationNatural, distractors],
  );

  return (
    <>
      <AudioButton
        text={item.surface}
        languageCode={languageCode}
        normalUrl={item.audioNormalUrl}
        slowUrl={item.audioSlowUrl}
      />
      <ChoiceQuestion
        surface={item.surface}
        answer={item.translationNatural}
        options={options}
        showSurface
        onResolved={onComplete}
      />
    </>
  );
}

function ListenStep({
  item,
  languageCode,
  distractors,
  onComplete,
}: {
  item: LessonStep["item"];
  languageCode: string;
  distractors: string[];
  onComplete: (isCorrect: boolean, produced: string) => void;
}) {
  const options = useMemo(
    () => buildOptions(item.translationNatural, distractors),
    [item.translationNatural, distractors],
  );
  // Audio-first: the text stays hidden until the learner has listened, which is
  // the whole point of a listening exercise. The control is live either way,
  // because a voice may be synthesised on the spot rather than served as a file.
  const [revealed, setRevealed] = useState(false);

  return (
    <>
      <p className="text-sm text-secondary">
        Listen, then choose what it means. The text stays hidden until you ask for it.
      </p>

      <AudioButton
        text={item.surface}
        languageCode={languageCode}
        normalUrl={item.audioNormalUrl}
        slowUrl={item.audioSlowUrl}
      />

      {revealed ? (
        <p className="text-target text-xl font-semibold text-primary">{item.surface}</p>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setRevealed(true)}>
          Show the text
        </Button>
      )}

      <ChoiceQuestion
        surface={revealed ? item.surface : "🔊"}
        answer={item.translationNatural}
        options={options}
        showSurface={false}
        onResolved={onComplete}
      />
    </>
  );
}

/**
 * Active recall: the learner produces the target-language sentence from its
 * meaning.
 *
 * Deliberately audio-free. Hearing the sentence is exactly what this exercise is
 * testing, so a speaker here would give away the answer.
 */
function RecallStep({
  item,
  onComplete,
}: {
  item: LessonStep["item"];
  onComplete: (isCorrect: boolean, produced: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);
  const correct = equalsLoose(typed, item.surface);
  const inputId = `answer-${item.id}`;

  return (
    <>
      <div>
        <p className="text-xs text-muted">Say it in the language you are learning</p>
        <p className="mt-2 text-xl font-semibold text-primary">
          {item.translationNatural}
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setChecked(true);
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
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Type it in the language you are learning"
          className="h-12 w-full rounded-[var(--radius)] border border-line-strong bg-surface-raised px-3.5 text-base text-primary placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:opacity-70"
        />
        {!checked ? (
          <>
            <p className="mt-1.5 text-xs text-muted">
              Accents are not required — they are corrected for you.
            </p>
            <div className="mt-4">
              <Button type="submit" size="lg" fullWidth>
                Check
              </Button>
            </div>
          </>
        ) : null}
      </form>

      {checked ? (
        <>
          <AnswerPanel
            item={item}
            isCorrect={correct}
            graded
            learnerAnswer={typed}
            promptSide="translation"
          />
          <Button size="lg" fullWidth onClick={() => onComplete(correct, typed)}>
            Continue
            <Icon name="arrowRight" size={18} />
          </Button>
        </>
      ) : null}
    </>
  );
}

/**
 * Sentence ordering: the learner rebuilds the sentence from its words.
 *
 * Also audio-free, for the same reason as recall — the words are the answer.
 */
function ArrangeStep({
  item,
  onComplete,
}: {
  item: LessonStep["item"];
  onComplete: (isCorrect: boolean, produced: string) => void;
}) {
  const tokens = useMemo(() => shuffleTokens(item.surface), [item.surface]);
  const [picked, setPicked] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);

  const produced = picked.map((tokenIndex) => tokens[tokenIndex] ?? "").join(" ");
  const correct = equalsLoose(produced, item.surface);
  const available = tokens
    .map((token, tokenIndex) => ({ token, tokenIndex }))
    .filter(({ tokenIndex }) => !picked.includes(tokenIndex));

  return (
    <>
      <div>
        <p className="text-xs text-muted">Build the sentence</p>
        <p className="mt-2 text-xl font-semibold text-primary">
          {item.translationNatural}
        </p>
      </div>

      {/* Tap-to-build rather than drag-and-drop: reliable on a phone, and works
          with a keyboard and a screen reader. */}
      <div
        className="min-h-[64px] rounded-[var(--radius)] border border-dashed border-line-strong bg-surface-sunken px-3 py-3"
        aria-live="polite"
      >
        {picked.length === 0 ? (
          <p className="text-sm text-muted">Tap the words below in order.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {picked.map((tokenIndex, position) => (
              <button
                key={`${tokenIndex}-${position}`}
                type="button"
                disabled={checked}
                onClick={() =>
                  setPicked((previous) => previous.filter((_, i) => i !== position))
                }
                className="min-h-[44px] rounded-[var(--radius-sm)] border border-accent bg-accent-subtle px-3 text-sm font-medium text-accent"
              >
                {tokens[tokenIndex]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {available.map(({ token, tokenIndex }) => (
          <button
            key={`${tokenIndex}-${token}`}
            type="button"
            disabled={checked}
            onClick={() => setPicked((previous) => [...previous, tokenIndex])}
            className="min-h-[44px] rounded-[var(--radius-sm)] border border-line-strong bg-surface-raised px-3.5 text-sm text-primary hover:bg-surface-hover disabled:opacity-50"
          >
            {token}
          </button>
        ))}
      </div>

      {!checked ? (
        <Button
          size="lg"
          fullWidth
          disabled={picked.length === 0}
          onClick={() => setChecked(true)}
        >
          Check
        </Button>
      ) : (
        <>
          <AnswerPanel
            item={item}
            isCorrect={correct}
            graded
            learnerAnswer={produced}
            promptSide="translation"
          />
          <Button size="lg" fullWidth onClick={() => onComplete(correct, produced)}>
            Continue
            <Icon name="arrowRight" size={18} />
          </Button>
        </>
      )}
    </>
  );
}

function SpeakStep({
  item,
  languageCode,
  onContinue,
}: {
  item: LessonStep["item"];
  languageCode: string;
  onContinue: (said: boolean) => void;
}) {
  return (
    <>
      <div className="flex items-start gap-3 rounded-[var(--radius)] border border-line bg-surface-sunken px-4 py-3">
        <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" />
        <div>
          <p className="text-sm font-medium text-primary">
            Not scored — no speech analysis is connected
          </p>
          <p className="mt-0.5 text-sm text-secondary">
            Saying it out loud is still worth doing. Scoring would need a real
            pronunciation provider, so this step records that you practised instead
            of inventing a score.
          </p>
        </div>
      </div>

      <div>
        <p className="text-target text-2xl font-semibold text-primary">{item.surface}</p>
        <p className="mt-2 text-lg text-secondary">{item.translationNatural}</p>
      </div>

      <AudioButton
        text={item.surface}
        languageCode={languageCode}
        normalUrl={item.audioNormalUrl}
        slowUrl={item.audioSlowUrl}
      />

      <div className="flex flex-col gap-2.5 border-t border-line pt-5 sm:flex-row">
        <Button size="lg" fullWidth onClick={() => onContinue(true)}>
          <Icon name="speak" size={18} />
          I said it
        </Button>
        <Button size="lg" variant="secondary" fullWidth onClick={() => onContinue(false)}>
          Skip
        </Button>
      </div>
    </>
  );
}

function LessonSummary({
  lesson,
  languageCode,
  languageName,
  results,
}: {
  lesson: Lesson;
  languageCode: string;
  languageName: string;
  results: StepResult[];
}) {
  const [state, setState] = useState<
    | { status: "saving" }
    | { status: "saved"; itemsEnrolled: number; accuracy: number | null }
    | { status: "error"; message: string }
  >({ status: "saving" });

  const graded = results.filter((result) => GRADED_STEPS.has(result.stepType));
  const correct = graded.filter((result) => result.isCorrect).length;
  const localAccuracy = graded.length > 0 ? correct / graded.length : null;

  useEffect(() => {
    let cancelled = false;

    void completeLesson({ missionId: lesson.missionId, languageCode, results })
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          setState({
            status: "saved",
            itemsEnrolled: response.itemsEnrolled,
            accuracy: response.accuracy,
          });
        } else {
          setState({ status: "error", message: response.error });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[lesson] completion failed", error);
        setState({
          status: "error",
          message: "Could not save your progress. Check your connection and try again.",
        });
      });

    return () => {
      cancelled = true;
    };
    // Deliberately runs once, when the summary mounts: by then `results` holds
    // the complete lesson and must not be re-submitted on a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <Card tone="raised">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          Lesson complete
        </p>
        <h1 className="mt-1.5 text-xl font-semibold text-primary">{lesson.title}</h1>
        <p className="mt-1 text-sm text-secondary">
          {lesson.trackTitle} · {lesson.unitTitle}
        </p>

        <dl className="mt-5 grid grid-cols-3 gap-4">
          <div>
            <dt className="text-xs text-muted">Steps</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-primary">
              {results.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Correct</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-primary">
              {graded.length > 0 ? `${correct} / ${graded.length}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Accuracy</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-primary">
              {localAccuracy === null ? "—" : `${Math.round(localAccuracy * 100)}%`}
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
              Adding these to your review schedule…
            </p>
          ) : state.status === "saved" ? (
            <>
              <p className="text-sm font-medium text-primary">
                {state.itemsEnrolled} item
                {state.itemsEnrolled === 1 ? "" : "s"} added to your review queue
              </p>
              <p className="mt-1 text-sm text-secondary">
                They are due now, so they come up the next time you review.
                {state.accuracy !== null
                  ? ` You answered ${Math.round(state.accuracy * 100)}% correctly, which sets how soon each one returns.`
                  : ""}
              </p>
            </>
          ) : (
            <p role="status" className="text-sm font-medium text-danger">
              {state.message}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={`/${languageCode}/review`} fullWidth>
            Review what you learned
          </ButtonLink>
          <ButtonLink href={`/${languageCode}/path`} variant="secondary" fullWidth>
            Back to the path
          </ButtonLink>
        </div>
      </Card>

      <p className="text-center text-xs text-muted">
        Your {languageName} path now shows this mission as complete.
      </p>
    </div>
  );
}
