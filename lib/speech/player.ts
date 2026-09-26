"use client";

/**
 * Which speech provider to use, and how to play a clip.
 *
 * Two playback paths exist and they are deliberately different:
 *
 *   1. **Stored audio** — a server provider already generated a file and saved its
 *      URL on the item (`audio_normal_url` / `audio_slow_url`). That is played
 *      with an `HTMLAudioElement`: no synthesis, no cost, identical on every
 *      device. This is the path a paid provider will use, and it is already
 *      supported so nothing needs rewriting when one is configured.
 *   2. **Live synthesis** — no stored file, so the OS speech engine speaks it.
 *      This is what works today.
 *
 * Both funnel through `player`, so "one clip at a time" is enforced in a single
 * place regardless of which path a clip takes.
 */

import { browserProvider } from "./browser-provider";
import type { SpeechClip, SpeechProvider } from "./provider";

/** True when the server reports a configured TTS provider (set from the page). */
let serverConfigured = false;

export function setServerSpeechConfigured(configured: boolean): void {
  serverConfigured = configured;
}

export function serverSpeechConfigured(): boolean {
  return serverConfigured;
}

/**
 * The provider to use for live synthesis.
 *
 * A server provider will slot in here when one is configured; until then the
 * browser engine is the only real option, and saying so is better than failing.
 */
export function resolveProvider(): SpeechProvider {
  return browserProvider;
}

export type PlaybackHandle = {
  /** Stop whatever is playing, whether it is an element or synthesis. */
  stop: () => void;
  /** Resolves when playback ends or fails. */
  done: Promise<{ ok: true } | { ok: false; error: string }>;
};

let activeStop: (() => void) | null = null;
let activeElement: HTMLAudioElement | null = null;

/**
 * Stop the current clip.
 *
 * Called before every new clip, on route change, and on unmount. Several
 * vocabulary cards speaking at once is the failure this prevents.
 */
export function stopAllAudio(): void {
  if (activeStop) {
    activeStop();
    activeStop = null;
  }
  if (activeElement) {
    try {
      activeElement.pause();
      activeElement.currentTime = 0;
    } catch {
      /* already detached */
    }
    activeElement = null;
  }
  // Also cancel synthesis directly: a `speak` that resolved early could otherwise
  // leave an utterance queued.
  browserProvider.stop();
}

/** Play a stored audio file. */
export function playUrl(url: string): PlaybackHandle {
  stopAllAudio();

  const element = new Audio();
  // Deliberately not preloading: the project has already had browser-stability
  // problems from eager preloading, and audio is requested on demand here.
  element.preload = "none";
  element.src = url;
  activeElement = element;

  const done = new Promise<{ ok: true } | { ok: false; error: string }>((resolve) => {
    let settled = false;
    const finish = (result: { ok: true } | { ok: false; error: string }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    element.onended = () => finish({ ok: true });
    element.onerror = () => finish({ ok: false, error: "audio element failed" });
    void element.play().catch((error: unknown) =>
      finish({ ok: false, error: error instanceof Error ? error.message : "play failed" }),
    );
  });

  const stop = () => {
    try {
      element.pause();
      element.removeAttribute("src");
      element.load();
    } catch {
      /* already gone */
    }
  };
  activeStop = stop;

  void done.finally(() => {
    if (activeStop === stop) activeStop = null;
    if (activeElement === element) activeElement = null;
  });

  return { stop, done };
}

/**
 * Speak a clip: prefer a stored file when the caller has one, otherwise
 * synthesise.
 */
export function playClip(
  clip: SpeechClip,
  storedUrl?: string | null,
): PlaybackHandle {
  if (storedUrl) return playUrl(storedUrl);

  stopAllAudio();
  const provider = resolveProvider();
  const stop = () => provider.stop();
  activeStop = stop;

  const done = provider.speak(clip).finally(() => {
    if (activeStop === stop) activeStop = null;
  });

  return { stop, done };
}

/**
 * Pause and resume, where they are meaningful.
 *
 * A stored file is an `HTMLAudioElement`, so it can genuinely pause and resume
 * mid-sentence and keep its position — which is what a learner working through a
 * long sentence actually wants.
 *
 * Synthesised speech is different. `speechSynthesis.pause()` is inconsistently
 * implemented (it is unreliable on several mobile engines), and a paused
 * utterance cannot be scrubbed. Rather than expose a control that silently does
 * nothing on some devices, the caller checks `canPause()` and offers Stop for
 * synthesis — which is honest about what the platform can do, and is what the
 * audible result would be anyway.
 */
export function canPause(): boolean {
  return activeElement !== null;
}

export function pauseActive(): boolean {
  if (activeElement && !activeElement.paused) {
    activeElement.pause();
    return true;
  }
  return false;
}

export function resumeActive(): boolean {
  if (activeElement && activeElement.paused) {
    void activeElement.play().catch(() => undefined);
    return true;
  }
  return false;
}

export function isPaused(): boolean {
  return Boolean(activeElement?.paused);
}
