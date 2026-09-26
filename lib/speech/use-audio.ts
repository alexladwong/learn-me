"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserAvailability, loadVoices } from "@/lib/speech/browser-provider";
import {
  canPause,
  pauseActive,
  playClip,
  resumeActive,
  stopAllAudio,
  type PlaybackHandle,
} from "@/lib/speech/player";
import type { SpeechSpeed } from "@/lib/speech/provider";

/**
 * One audio control, used everywhere.
 *
 * Playback state lives here rather than in the audio layer so React can render
 * it, and it is the only place that tracks "am I playing" — which is what makes
 * the playing indicator, the disabled state and the error message consistent
 * across cards, lessons and the sentence bank.
 *
 * Not wired to a provider directly: it asks `playClip`, so a stored file, the OS
 * engine, or a future server provider all look identical from here.
 */

export type AudioState = "idle" | "loading" | "playing" | "unavailable" | "error";

export function useAudio(input: {
  text: string;
  languageCode: string;
  /** A stored file, when the server provider has generated one. */
  normalUrl?: string | null;
  slowUrl?: string | null;
  /** Alerts the surrounding page when playback is unavailable, for its copy. */
  onUnavailable?: (reason: string) => void;
}) {
  const { text, languageCode, normalUrl, slowUrl } = input;

  const [state, setState] = useState<AudioState>("idle");
  const [speed, setSpeed] = useState<SpeechSpeed>("normal");
  /**
   * Whether the current clip can be paused and resumed.
   *
   * True only for a stored audio file. Synthesised speech is stopped instead,
   * because `speechSynthesis.pause()` is not dependable across engines and a
   * control that silently does nothing is worse than one that stops.
   */
  const [pausable, setPausable] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRef = useRef<PlaybackHandle | null>(null);
  const mounted = useRef(true);
  // Guards against a stale clip's completion resetting a newer clip's state.
  const runId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Availability is checked once the engine reports its voices.
   *
   * Set only inside the async callback: a synchronous `setState` in an effect
   * body triggers a cascading render, which React warns about and which matters
   * here — a page of thirty vocabulary cards would each re-render twice on mount.
   */
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);

  useEffect(() => {
    if (normalUrl) return;
    let cancelled = false;
    void loadVoices().then(() => {
      if (cancelled || !mounted.current) return;
      const availability = browserAvailability(languageCode);
      setUnavailableReason(availability.available ? null : availability.reason);
    });
    return () => {
      cancelled = true;
    };
  }, [languageCode, normalUrl]);

  // Stop this clip if the component unmounts (route change, list re-render).
  useEffect(() => {
    return () => {
      handleRef.current?.stop();
    };
  }, []);

  const play = useCallback(
    async (playSpeed: SpeechSpeed) => {
        if (unavailableReason) return;

      const id = ++runId.current;
      setSpeed(playSpeed);
      setError(null);
      setState("loading");

      const url = playSpeed === "slow" ? (slowUrl ?? normalUrl) : normalUrl;
      const handle = playClip({ text, languageCode, speed: playSpeed }, url);
      handleRef.current = handle;
      // Synthesis gives no reliable "started" event, and a stored element's
      // `play()` promise resolving means playback has begun. Treating the call as
      // started is what makes the control show its playing state and lets the
      // second press stop it.
      if (mounted.current && id === runId.current) {
        setState("playing");
        // `canPause` is true only when the clip is an audio element, i.e. when a
        // stored file exists for it.
        setPausable(Boolean(url) && canPause());
        setPaused(false);
      }

      const result = await handle.done;
      if (!mounted.current || id !== runId.current) return;

      if (result.ok) {
        setState("idle");
        return;
      }

      // `not-allowed` means the browser refused to start without a gesture, or a
      // newer clip cancelled this one. Neither is worth alarming the learner
      // about; reported as idle rather than an error.
      if (/not-allowed|interrupted|canceled/i.test(result.error)) {
        setState("idle");
        return;
      }

      // The technical reason is logged for development and never rendered.
      console.warn("[audio] playback failed", {
        languageCode,
        speed: playSpeed,
        reason: result.error,
      });
      setError("Audio isn't available right now.");
      setState("error");
    },
    [languageCode, normalUrl, slowUrl, unavailableReason, text],
  );

  const stop = useCallback(() => {
    runId.current += 1;
    handleRef.current?.stop();
    handleRef.current = null;
    setState("idle");
  }, []);

  const toggle = useCallback(() => {
    if (state === "playing" || state === "loading") {
      if (pausable && !paused) {
        pauseActive();
        setPaused(true);
        return;
      }
      if (pausable && paused) {
        resumeActive();
        setPaused(false);
        return;
      }
      stop();
      return;
    }
    void play("normal");
  }, [pausable, paused, play, state, stop]);

  // A language with no installed voice is reported as unavailable whatever the
  // transient playback state is, so the control never offers a button that
  // cannot work.
  const effectiveState: AudioState = unavailableReason ? "unavailable" : state;

  return {
    state: effectiveState,
    speed,
    error,
    reason: unavailableReason,
    paused,
    pausable,
    play,
    stop,
    toggle,
    /** True when a stored file exists for this clip. */
    hasStoredAudio: Boolean(normalUrl),
  };
}

/** Stop all audio. Used on navigation so a clip cannot outlive its screen. */
export function useStopAudioOnUnmount() {
  useEffect(() => () => stopAllAudio(), []);
}
