"use client";

import { Icon } from "@/components/ui/icon";
import { cx } from "@/lib/cx";

/**
 * Shared answer presentation.
 *
 * Used by both the review session and the lesson player. One component means the
 * explanation a learner sees after a mistake is identical wherever the mistake
 * happened — which matters, because that panel is where the teaching actually
 * lands.
 */

export type AnswerExplanationItem = {
  surface: string;
  translationLiteral: string | null;
  translationNatural: string;
  grammarNote: string | null;
  vocabBreakdown: Array<{ token: string; gloss: string; pos?: string }>;
  tags: readonly string[];
};

export function AnswerPanel({
  item,
  isCorrect,
  graded,
  learnerAnswer,
  promptSide,
}: {
  item: AnswerExplanationItem;
  isCorrect: boolean;
  /** False for self-graded prompts, where "correct" is the learner's call. */
  graded: boolean;
  learnerAnswer?: string | null;
  /** Which side the prompt showed, so the panel reveals the other one. */
  promptSide: "surface" | "translation";
}) {
  const revealSurface = promptSide === "translation";

  return (
    <div className="flex flex-col gap-4 border-t border-line pt-5">
      {graded ? (
        <div
          className={cx(
            "flex items-start gap-3 rounded-[var(--radius)] px-4 py-3",
            isCorrect ? "bg-success-soft" : "bg-danger-soft",
          )}
        >
          <Icon
            name={isCorrect ? "check" : "inbox"}
            size={18}
            className={cx("mt-0.5 shrink-0", isCorrect ? "text-success" : "text-danger")}
          />
          <div className="min-w-0">
            <p
              className={cx(
                "text-sm font-semibold",
                isCorrect ? "text-success" : "text-danger",
              )}
            >
              {isCorrect ? "Correct" : "Not quite"}
            </p>
            {learnerAnswer !== undefined && learnerAnswer !== null ? (
              <p className="mt-0.5 text-sm text-secondary">
                You answered{" "}
                <span className="font-medium text-primary">
                  {learnerAnswer.trim() || "(nothing)"}
                </span>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {revealSurface ? "The answer" : "Meaning"}
        </p>
        <p
          className={cx(
            "mt-1.5 font-semibold text-primary",
            revealSurface ? "text-target text-2xl" : "text-xl",
          )}
        >
          {revealSurface ? item.surface : item.translationNatural}
        </p>
        {revealSurface && item.translationLiteral ? (
          <p className="mt-1 text-sm text-secondary">
            Literally: {item.translationLiteral}
          </p>
        ) : null}
        {!revealSurface ? (
          <p className="mt-1.5 text-target text-lg text-secondary">{item.surface}</p>
        ) : null}
      </div>

      {item.grammarNote ? (
        <div className="rounded-[var(--radius)] border border-line bg-surface-sunken px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Why</p>
          <p className="mt-1 text-sm text-secondary">{item.grammarNote}</p>
        </div>
      ) : null}

      {item.vocabBreakdown.length > 0 ? (
        <details className="rounded-[var(--radius)] border border-line bg-surface-sunken">
          <summary className="flex min-h-[44px] cursor-pointer items-center px-4 py-3 text-sm font-medium text-primary">
            Word by word ({item.vocabBreakdown.length})
          </summary>
          <ul className="flex flex-col gap-1.5 px-4 pb-3">
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
        </details>
      ) : null}
    </div>
  );
}
