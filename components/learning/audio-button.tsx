"use client";

import { useId } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/icon";
import { useAudio } from "@/lib/speech/use-audio";
import type { SpeechSpeed } from "@/lib/speech/provider";

/**
 * The product's single audio control.
 *
 * Used on language cards, in lessons, in the sentence bank and anywhere else a
 * phrase can be heard. One component means one behaviour for the states that are
 * easy to get inconsistent across pages: what a click does while loading, what a
 * second click does while playing, what happens when there is no voice, and what
 * a learner sees when playback genuinely fails.
 *
 * Deliberate choices:
 *
 *   - **Not `<audio controls>`.** The browser's default chrome is large, styled
 *     like a media player, and cannot show a "no voice installed" state.
 *   - **`preload="none"` throughout.** Nothing is fetched until asked for. This
 *     project has already had browser-stability trouble from eager preloading.
 *   - **Text is never replaced by audio.** The control supplements the written
 *     phrase; it is never the only way to get the content.
 *   - **The error names no internals.** "Audio isn't available right now." The
 *     technical reason goes to the console.
 */
export function AudioButton({
  text,
  languageCode,
  normalUrl,
  slowUrl,
  label,
  compact = false,
  showSlow = true,
  className,
}: {
  /** The phrase to speak. Also used for the accessible label. */
  text: string;
  languageCode: string;
  normalUrl?: string | null;
  slowUrl?: string | null;
  /** Overrides the accessible label when the text alone is ambiguous. */
  label?: string;
  /** Icon-only, for a card corner where a full button would crowd the layout. */
  compact?: boolean;
  showSlow?: boolean;
  className?: string;
}) {
  const id = useId();
  const audio = useAudio({ text, languageCode, normalUrl, slowUrl });

  const unavailable = audio.state === "unavailable";
  const busy = audio.state === "loading";
  const playing = audio.state === "playing";

  const accessibleName =
    label ?? (text.length > 40 ? `Listen to this phrase` : `Listen to “${text}”`);

  // Unavailable is a real, explainable state — reported inline rather than as a
  // dead button, because "no voice for this language on this device" is useful
  // information and a disabled control with no reason is not.
  if (unavailable) {
    return (
      <span
        className={cx("inline-flex items-center gap-1.5 text-xs text-muted", className)}
        title={audio.reason ?? undefined}
      >
        <Icon name="volumeOff" size={14} />
        {compact ? <span className="sr-only">Audio unavailable</span> : "Audio unavailable"}
      </span>
    );
  }

  return (
    <span className={cx("inline-flex flex-wrap items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={audio.toggle}
        aria-label={
          !playing
            ? accessibleName
            : audio.pausable && !audio.paused
              ? `Pause ${accessibleName.replace(/^Listen to /, "")}`
              : audio.pausable && audio.paused
                ? `Resume ${accessibleName.replace(/^Listen to /, "")}`
                : `Stop ${accessibleName.replace(/^Listen to /, "")}`
        }
        aria-pressed={playing}
        disabled={busy}
        className={cx(
          "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius)] border border-line-strong",
          "bg-surface-raised text-secondary transition-colors hover:bg-surface-hover hover:text-primary",
          "disabled:cursor-wait disabled:opacity-70",
          // A 32px target is not a touch target. It relaxes only from the `sm`
          // breakpoint up, where a pointer is likely — the same rule the shared
          // Button uses, so the two cannot drift apart.
          compact ? "size-11 rounded-[var(--radius)] sm:size-8" : "min-h-[44px] px-2.5 text-xs font-medium",
        )}
      >
        <span aria-hidden="true" className={cx(busy && "animate-pulse")}>
          <Icon
            name={playing ? (audio.paused ? "volume" : "pause") : "volume"}
            size={compact ? 15 : 14}
          />
        </span>
        {compact ? null : (
          <span>
            {busy ? "Loading…" : !playing ? "Listen" : audio.paused ? "Resume" : "Playing"}
          </span>
        )}
      </button>

      {showSlow ? (
        <button
          type="button"
          onClick={() => void audio.play("slow")}
          disabled={busy}
          aria-label={`Play “${text}” slowly`}
          className={cx(
            "inline-flex items-center justify-center rounded-[var(--radius)] border border-line",
            "text-muted transition-colors hover:bg-surface-hover hover:text-primary",
            "disabled:cursor-wait disabled:opacity-70",
            compact ? "size-11 sm:size-8" : "min-h-[44px] px-2.5 text-xs font-medium",
          )}
        >
          <Icon name="turtle" size={compact ? 15 : 14} />
          {compact ? null : <span className="ml-1">Slow</span>}
        </button>
      ) : null}

      {audio.state === "error" && audio.error ? (
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-1.5 text-xs text-danger"
          id={`${id}-error`}
        >
          {audio.error}
          <button
            type="button"
            onClick={() => void audio.play("normal")}
            className="font-medium underline hover:no-underline"
          >
            Retry
          </button>
        </span>
      ) : null}
    </span>
  );
}

/** Exposed for the lesson's listening step, which needs the slow variant alone. */
export function SlowAudioButton(props: Omit<Parameters<typeof AudioButton>[0], "showSlow">) {
  return <AudioButton {...props} showSlow={false} />;
}

export type { SpeechSpeed };
