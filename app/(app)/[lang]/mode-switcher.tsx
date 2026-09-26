"use client";

import { useRouter } from "next/navigation";
import { cx } from "@/lib/cx";
import { LEARNING_MODES, LEARNING_MODE_META, type LearningMode } from "@/lib/types";

/**
 * Mode switcher.
 *
 * A mode is a different amount of the same material, so switching is a
 * navigation that recomposes the session rather than a separate screen. The
 * choice lives in the URL so it can be bookmarked and shared, and so the server
 * composes the right session on the first render.
 */
export function ModeSwitcher({
  languageCode,
  active,
  minutes,
}: {
  languageCode: string;
  active: LearningMode;
  /**
   * The length of each mode, from `minutesForMode(mode, learner.daily_minutes)`.
   * Passed in rather than read from a constant so the chip and the composed
   * session cannot disagree.
   */
  minutes: Record<LearningMode, number | null>;
}) {
  const router = useRouter();

  return (
    <div
      role="group"
      aria-label="Learning mode"
      /*
       * A horizontally scrollable strip, not a wrapping block.
       *
       * Six pills wrap onto three rows inside the Today panel on a phone, which
       * is most of why that panel read as a dense desktop card. One scrolling row
       * keeps the hero about today's action instead of about mode selection.
       */
      className="scroll-fade-x -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
    >
      {LEARNING_MODES.map((mode) => {
        const meta = LEARNING_MODE_META[mode];
        const isActive = mode === active;

        return (
          <button
            key={mode}
            type="button"
            aria-pressed={isActive}
            onClick={() =>
              router.push(
                mode === "study"
                  ? `/${languageCode}`
                  : `/${languageCode}?mode=${mode}`,
              )
            }
            className={cx(
              "press inline-flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium",
              isActive
                ? "border-accent bg-accent-subtle text-accent"
                : "border-line-strong bg-surface-raised text-secondary hover:bg-surface-hover",
            )}
          >
            {meta.label}
            {minutes[mode] ? (
              <span className="text-xs tabular-nums opacity-70">{minutes[mode]}m</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
