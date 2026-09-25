"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/empty-state";
import { AnswerPanel, AudioButtons } from "@/components/learning/answer-panel";
import { ProgressBar } from "@/components/ui/progress";
import { cx } from "@/lib/cx";
import { submitReview, type SubmitReviewResult } from "./actions";
import type { ReviewCard } from "@/lib/db/reviews";
import { RATINGS, schedule, type Rating } from "@/lib/learning/fsrs";
import {
  enqueue,
  newClientKey,
  pendingCount,
  readQueue,

  syncQueue,
  type QueuedReview,
} from "@/lib/offline/queue";
import {
  answerModeFor,
  buildOptions,
  equalsLoose,
  type AnswerMode,
} from "@/lib/learning/answer";

/**
 * The review session.
 *
 * Design constraints that shaped this:
 *   - A learner may review 100 cards in a sitting, so the whole loop is
 *     keyboard-drivable: Space reveals, 1-4 rate, and nothing requires a mouse.
 *   - The rating must reflect what the learner actually did. Typed answers are
 *     graded automatically (which also feeds the confusion engine); a prompt the
 *     learner cannot type is self-graded, and the UI says so rather than
 *     pretending to have judged them.
 *   - Audio controls only appear when audio exists. Spanish is flagged
 *     `supports_audio`, but no provider has generated files yet, so the control
 *     is disabled with a reason instead of playing silence.
 */

type SessionStats = {
  reviewed: number;
  correct: number;
  failed: number;
  /** Cards whose interval grew past a day during this session. */
  graduated: number;
  /** Scheduled for a future date, in days — shown in the summary. */
  intervals: number[];
};

const EMPTY_STATS: SessionStats = {
  reviewed: 0,
  correct: 0,
  failed: 0,
  graduated: 0,
  intervals: [],
};

/** Cards still in the queue, in order, minus the one being answered. */
export function ReviewSession({
  languageCode,
  languageName,
  initialCards,
  nextDueAt,
}: {
  languageCode: string;
  languageName: string;
  initialCards: ReviewCard[];
  nextDueAt: string | null;
}) {
  // The queue is fixed for the session: advancing is an index change, never a
  // mutation, so a card cannot be dropped or duplicated by a state update.
  const [queue] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(initialCards.length === 0);
  // Initialised from the platform rather than in an effect, so the first paint
  // already knows whether it is offline and how much is waiting. Reading these in
  // an effect body would mean a render that says "online, nothing pending" and
  // then corrects itself.
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [pending, setPending] = useState(() =>
    typeof window === "undefined" ? 0 : pendingCount(window.localStorage),
  );
  const [flushed, setFlushed] = useState(0);

  const card = queue[index];

  // ---- Offline queue ------------------------------------------------------
  // Reviews answered with no connection are held on the device and replayed on
  // the same `submitReview` path, each with the idempotency key it was queued
  // with, so a sync that runs twice cannot schedule a card twice.
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const flush = useCallback(async () => {
    if (readQueue(window.localStorage).length === 0) {
      setPending(0);
      return;
    }

    const outcome = await syncQueue(window.localStorage, async (queued) => {
      const result = await submitReview({
        itemId: queued.itemId,
        languageCode: queued.languageCode,
        rating: queued.rating,
        clientKey: queued.clientKey,
        state: queued.state as "new" | "learning" | "review" | "relearning",
        stability: queued.stability,
        difficulty: queued.difficulty,
        streakCorrect: queued.streakCorrect,
        reps: queued.reps,
        elapsedDays: queued.elapsedDays,
        ...(queued.answer ? { answer: queued.answer } : {}),
      });
      return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
    });

    setPending(pendingCount(window.localStorage));
    if (outcome.synced > 0) setFlushed((previous) => previous + outcome.synced);
  }, []);

  // Replay anything left over from a previous visit, and again whenever the
  // connection returns. Deferred to a microtask so the state updates land after
  // the effect rather than during it.
  useEffect(() => {
    if (!online) return;
    void Promise.resolve().then(() => flush());
  }, [online, flush]);

  /**
   * Distractor pool for multiple choice.
   *
   * Built from the learner's own queue rather than a dictionary, so the wrong
   * options are drawn from material they are actually studying.
   */
  const distractors = useMemo(() => {
    if (!card) return [];
    return queue
      .filter((candidate) => candidate.itemId !== card.itemId)
      .map((candidate) => candidate.translationNatural)
      .filter((value) => value !== card.translationNatural)
      .slice(0, 12);
  }, [queue, card]);

  const advance = useCallback(
    (result: Extract<SubmitReviewResult, { ok: true }>["outcome"]) => {
      const intervalDays =
        (new Date(result.dueAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000);

      setStats((previous) => ({
        reviewed: previous.reviewed + 1,
        correct: previous.correct + (result.rating === "again" ? 0 : 1),
        failed: previous.failed + (result.rating === "again" ? 1 : 0),
        graduated: previous.graduated + (intervalDays >= 1 ? 1 : 0),
        intervals: [...previous.intervals, intervalDays],
      }));

      const nextIndex = index + 1;
      if (nextIndex >= queue.length) {
        setFinished(true);
      } else {
        setIndex(nextIndex);
      }
    },
    [index, queue.length],
  );

  const rate = useCallback(
    async (rating: Rating, answer?: AnswerRecord) => {
      if (!card || saving) return;
      setSaving(true);
      setError(null);

      // One key per review, minted here and used for every attempt at it. This is
      // what makes the queued path safe to retry: the server recognises the key
      // and refuses to schedule the same card twice.
      const clientKey = newClientKey();
      const elapsedDays = elapsedDaysSince(card.lastReviewedAt);

      const queued: QueuedReview = {
        clientKey,
        itemId: card.itemId,
        languageCode: card.languageCode,
        rating,
        state: card.memory.state,
        stability: card.memory.stability,
        difficulty: card.memory.difficulty,
        streakCorrect: card.memory.streakCorrect,
        reps: card.memory.reps,
        elapsedDays,
        ...(answer ? { answer } : {}),
        queuedAt: new Date().toISOString(),
        attempts: 0,
        lastError: null,
      };

      /**
       * Keep the answer on the device and move on.
       *
       * The schedule shown in the summary is computed locally with the same pure
       * function the server uses, so the numbers the learner sees are the numbers
       * they will get. The server still decides the authoritative schedule when
       * the queue syncs — this only avoids pretending the review was lost.
       */
      const hold = () => {
        enqueue(window.localStorage, queued);
        setPending(pendingCount(window.localStorage));

        const local = schedule(card.memory, rating, elapsedDays);
        advance({
          itemId: card.itemId,
          rating,
          state: local.state,
          stability: local.stability,
          difficulty: local.difficulty,
          mastery: local.mastery,
          dueAt: new Date(Date.now() + local.intervalDays * 86_400_000).toISOString(),
        });
      };

      // Already known to be offline: do not wait for a request to fail.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        hold();
        setSaving(false);
        return;
      }

      try {
        const result = await submitReview({
          itemId: card.itemId,
          languageCode: card.languageCode,
          rating,
          clientKey,
          state: card.memory.state,
          stability: card.memory.stability,
          difficulty: card.memory.difficulty,
          streakCorrect: card.memory.streakCorrect,
          reps: card.memory.reps,
          elapsedDays,
          ...(answer ? { answer } : {}),
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }

        advance(result.outcome);
      } catch (unexpected) {
        // A thrown request is almost always a lost connection, so the answer is
        // queued rather than discarded — losing a review the learner completed is
        // the one outcome worth going out of our way to avoid.
        console.error("[review] submission threw, queueing locally", unexpected);
        hold();
      } finally {
        setSaving(false);
      }
    },
    [card, saving, advance],
  );

  // ---- Session summary ----------------------------------------------------
  if (finished || !card) {
    return (
      <div className="flex flex-col gap-5">
        <QueueStatus online={online} pending={pending} flushed={flushed} />
        <SessionSummary
          languageCode={languageCode}
          languageName={languageName}
          stats={stats}
          nextDueAt={nextDueAt}
          remaining={queue.length - index}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <QueueStatus online={online} pending={pending} flushed={flushed} />

      <SessionHeader
        position={index + 1}
        total={queue.length}
        tag={card.tags[0] ?? card.kind}
      />

      {error ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-[var(--radius)] border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      ) : null}

      <CardView
        key={card.itemId}
        card={card}
        distractors={distractors}
        disabled={saving}
        onRate={rate}
      />
    </div>
  );
}

type AnswerRecord = {
  expected: string;
  produced: string;
  mode: string;
  isCorrect: boolean;
  latencyMs?: number;
};

function elapsedDaysSince(iso: string | null): number {
  if (!iso) return 0;
  const elapsed = (Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000);
  return Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
}

/**
 * What happened to the learner's answers.
 *
 * Offline review is only trustworthy if the app says what it did with each
 * answer. Silence here would mean a learner cannot tell whether their work was
 * saved, queued, or lost — and the whole point of the queue is that nothing is
 * lost. `role="status"` so a screen reader is told without the message stealing
 * focus from the card being answered.
 */
function QueueStatus({
  online,
  pending,
  flushed,
}: {
  online: boolean;
  pending: number;
  flushed: number;
}) {
  if (online && pending === 0) {
    return flushed > 0 ? (
      <p role="status" aria-live="polite" className="text-xs font-medium text-success">
        {flushed === 1
          ? "1 review saved from offline."
          : `${flushed} reviews saved from offline.`}
      </p>
    ) : null;
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-[var(--radius)] border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-sm font-medium text-warning"
    >
      <Icon name="cloudOff" size={15} />
      {!online
        ? `${pending === 1 ? "1 answer is" : `${pending} answers are`} saved on this device and will sync when you are back online.`
        : `${pending} ${pending === 1 ? "answer is" : "answers are"} waiting to sync.`}
    </p>
  );
}

function SessionHeader({
  position,
  total,
  tag,
}: {
  position: number;
  total: number;
  tag: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <ButtonLink
        href="."
        variant="ghost"
        size="sm"
        aria-label="Leave the review session"
      >
        <Icon name="arrowLeft" size={16} />
        Exit
      </ButtonLink>

      <div className="min-w-0 flex-1">
        <ProgressBar
          value={total > 0 ? (position - 1) / total : 0}
          label={`Card ${position} of ${total}`}
          valueLabel={`${total - position + 1} left`}
        />
      </div>

      <Badge tone="muted">{tag}</Badge>
    </div>
  );
}

function CardView({
  card,
  distractors,
  disabled,
  onRate,
}: {
  card: ReviewCard;
  distractors: string[];
  disabled: boolean;
  onRate: (rating: Rating, answer?: AnswerRecord) => void;
}) {
  // Cards longer than a couple of words are self-graded: producing a full
  // sentence from memory is the skill, and a typed answer would mostly measure
  // typing. Short prompts are graded automatically, which also gives the
  // confusion engine a real error to fingerprint.
  const [mode] = useState<AnswerMode>(() => answerModeFor(card.surface));

  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());

  const options = useMemo(
    () => buildOptions(card.translationNatural, distractors),
    [card.translationNatural, distractors],
  );

  const correct =
    mode === "recall"
      ? equalsLoose(typed, card.surface)
      : chosen === card.translationNatural;

  const answerRecord = useCallback((): AnswerRecord | undefined => {
    if (!revealed) return undefined;
    return {
      expected: mode === "recall" ? card.surface : card.translationNatural,
      produced: mode === "recall" ? typed : (chosen ?? ""),
      mode: mode === "recall" ? "recall" : "recognise",
      isCorrect: correct,
      latencyMs: Date.now() - startedAt,
    };
  }, [revealed, mode, card.surface, card.translationNatural, typed, chosen, correct, startedAt]);

  const reveal = useCallback(() => setRevealed(true), []);

  // ---- Keyboard: Space reveals, 1-4 rate once revealed -------------------
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typingInField =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if (!revealed) {
        if (event.key === " " && !typingInField) {
          event.preventDefault();
          reveal();
        }
        return;
      }

      const rating = RATINGS[Number(event.key) - 1];
      if (rating) {
        event.preventDefault();
        onRate(rating, answerRecord());
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [revealed, reveal, onRate, answerRecord]);

  return (
    <Card tone="raised" className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {mode === "recall" ? "Say it in the target language" : "What does this mean?"}
        </p>
        <p
          className={cx(
            "mt-3 text-2xl font-semibold leading-snug text-primary",
            mode === "recall" && "text-target",
          )}
        >
          {mode === "recall" ? card.translationNatural : card.surface}
        </p>
      </div>

      <AudioButtons normalUrl={card.audioNormalUrl} slowUrl={card.audioSlowUrl} />

      {mode === "recall" && !revealed ? (
        <RecallInput value={typed} onChange={setTyped} onSubmit={reveal} />
      ) : null}

      {mode === "recognise" && !revealed ? (
        <ul className="flex flex-col gap-2.5">
          {options.map((option) => (
            <li key={option}>
              <button
                type="button"
                onClick={() => {
                  setChosen(option);
                  setRevealed(true);
                }}
                className="min-h-[44px] w-full rounded-[var(--radius)] border border-line-strong bg-surface-raised px-4 py-3 text-left text-sm text-primary transition-colors hover:border-accent hover:bg-accent-subtle"
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!revealed ? (
        <div className="flex flex-col gap-3 border-t border-line pt-5">
          <Button size="lg" fullWidth onClick={reveal} disabled={disabled}>
            {mode === "recall" ? "Show the answer" : "I don't know this one"}
            <kbd className="ml-1 rounded border border-current/30 px-1.5 py-0.5 text-[10px] font-normal">
              Space
            </kbd>
          </Button>
          {mode === "recognise" ? (
            <p className="text-center text-xs text-muted">
              Choosing an option reveals the answer immediately.
            </p>
          ) : null}
        </div>
      ) : (
        <AnswerPanel
          item={{
            surface: card.surface,
            translationLiteral: card.translationLiteral,
            translationNatural: card.translationNatural,
            grammarNote: card.grammarNote,
            vocabBreakdown: card.vocabBreakdown,
            tags: card.tags,
          }}
          isCorrect={correct}
          graded={mode === "recall"}
          learnerAnswer={mode === "recall" ? typed : chosen}
          promptSide={mode === "recall" ? "translation" : "surface"}
        />
      )}

      {revealed ? (
        <RatingBar
          disabled={disabled}
          correct={correct}
          graded={mode === "recall"}
          onRate={(rating) => onRate(rating, answerRecord())}
        />
      ) : null}
    </Card>
  );
}

function RecallInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="review-answer" className="mb-1.5 block text-sm font-medium text-primary">
        Your answer
      </label>
      <input
        id="review-answer"
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="Type it in the language you are learning"
        className="h-12 w-full rounded-[var(--radius)] border border-line-strong bg-surface-raised px-3.5 text-base text-primary placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
      />
      <p className="mt-1.5 text-xs text-muted">
        Press Enter to check. Accents are not required — they are corrected for you.
      </p>
    </form>
  );
}

function RatingBar({
  disabled,
  correct,
  graded,
  onRate,
}: {
  disabled: boolean;
  correct: boolean;
  graded: boolean;
  onRate: (rating: Rating) => void;
}) {
  const meta: Record<Rating, { label: string; hint: string; tone: string }> = {
    again: { label: "Again", hint: "No idea", tone: "border-danger/40 text-danger" },
    hard: { label: "Hard", hint: "Struggled", tone: "border-warning/40 text-warning" },
    good: { label: "Good", hint: "Got it", tone: "border-success/40 text-success" },
    easy: { label: "Easy", hint: "Too simple", tone: "border-info/40 text-info" },
  };

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-5">
      <p className="text-xs text-muted">
        {graded
          ? "Your answer is graded automatically. The button below sets how soon you see it again."
          : "Rated by you, not guessed: this prompt is too long to grade from typing."}
      </p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {RATINGS.map((rating, position) => (
          <button
            key={rating}
            type="button"
            disabled={disabled}
            onClick={() => onRate(rating)}
            aria-keyshortcuts={String(position + 1)}
            className={cx(
              "flex min-h-[52px] flex-col items-center justify-center rounded-[var(--radius)] border-2 bg-surface-raised px-2 text-sm font-semibold transition-colors",
              "hover:bg-surface-hover disabled:opacity-50",
              meta[rating].tone,
              // The rating that matches the automatic grade is highlighted, so
              // the learner is nudged towards honest self-reporting.
              correct && rating === "good" && "bg-success-soft",
              !correct && rating === "again" && "bg-danger-soft",
            )}
          >
            <span>{meta[rating].label}</span>
            <span className="mt-0.5 text-[11px] font-normal opacity-80">
              {meta[rating].hint} · {position + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SessionSummary({
  languageCode,
  languageName,
  stats,
  nextDueAt,
  remaining,
}: {
  languageCode: string;
  languageName: string;
  stats: SessionStats;
  nextDueAt: string | null;
  remaining: number;
}) {
  const accuracy =
    stats.reviewed > 0 ? Math.round((stats.correct / stats.reviewed) * 100) : null;

  const nextInterval = stats.intervals.length > 0 ? Math.max(...stats.intervals) : null;

  if (stats.reviewed === 0) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
        <Card tone="raised">
          <h1 className="text-xl font-semibold text-primary">Nothing due right now</h1>
          <p className="mt-2 text-sm text-secondary">
            {nextDueAt
              ? `Your next ${languageName} card is scheduled for ${formatDueLong(nextDueAt)}.`
              : `You have no ${languageName} cards in your review queue yet. Add words from a lesson, or save them from content you bring in.`}
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={`/${languageCode}/path`} fullWidth>
              Go to the learning path
            </ButtonLink>
            <ButtonLink href={`/${languageCode}`} variant="secondary" fullWidth>
              Back to dashboard
            </ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <Card tone="raised">
        <p className="text-xs font-medium uppercase tracking-wide text-success">
          Session complete
        </p>
        <h1 className="mt-1.5 text-xl font-semibold text-primary">
          {stats.reviewed} card{stats.reviewed === 1 ? "" : "s"} reviewed
        </h1>

        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryStat label="Reviewed" value={String(stats.reviewed)} />
          <SummaryStat label="Correct" value={String(stats.correct)} />
          <SummaryStat label="Failed" value={String(stats.failed)} />
          <SummaryStat label="Recall" value={accuracy === null ? "—" : `${accuracy}%`} />
        </dl>

        <div className="mt-5 rounded-[var(--radius)] border border-line bg-surface-sunken px-4 py-3">
          <p className="text-sm text-secondary">
            {stats.graduated > 0
              ? `${stats.graduated} card${stats.graduated === 1 ? "" : "s"} moved to a multi-day interval.`
              : "Every card you missed stays in this session until you get it right."}
            {nextInterval !== null && nextInterval >= 1
              ? ` The longest gap is now ${Math.round(nextInterval)} days.`
              : ""}
          </p>
          {remaining > 0 ? (
            <p className="mt-1 text-sm text-secondary">
              {remaining} card{remaining === 1 ? "" : "s"} still in the queue.
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={`/${languageCode}/review`} fullWidth>
            Review again
          </ButtonLink>
          <ButtonLink href={`/${languageCode}`} variant="secondary" fullWidth>
            Back to dashboard
          </ButtonLink>
        </div>
      </Card>

      <p className="text-center text-xs text-muted">
        Every interval above was written to your review history, which is
        append-only — your schedule can be rebuilt from it at any time.
      </p>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-primary">{value}</dd>
    </div>
  );
}

function formatDueLong(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "an unknown time";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
