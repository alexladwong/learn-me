"use client";

/**
 * The browser speech provider: the operating system's own TTS engine.
 *
 * This is the provider that is actually available. It is not a stub and it is not
 * a placeholder — it produces real synthesised speech, which is why the product
 * can ship audio today rather than waiting for a paid provider plan.
 *
 * Everything provider-specific is confined to this file. When a server provider
 * is configured, `resolveProvider` prefers it and no component changes.
 */

import {
  SPEECH_RATES,
  localesFor,
  type SpeechAvailability,
  type SpeechClip,
  type SpeechProvider,
} from "./provider";

/**
 * Web Speech voices load asynchronously, and `getVoices()` returns an empty list
 * on the first call in most browsers. Waiting for `voiceschanged` is the
 * documented answer; this cache means we only wait once per session.
 */
let cachedVoices: SpeechSynthesisVoice[] | null = null;
let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

function supported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (cachedVoices && cachedVoices.length > 0) return Promise.resolve(cachedVoices);
  if (!supported()) return Promise.resolve([]);
  if (voicesPromise) return voicesPromise;

  voicesPromise = new Promise((resolve) => {
    const read = () => window.speechSynthesis.getVoices() ?? [];
    const initial = read();
    if (initial.length > 0) {
      cachedVoices = initial;
      resolve(initial);
      return;
    }

    // Resolve on the event, but never hang: some engines never fire it.
    const done = () => {
      const voices = read();
      if (voices.length > 0) cachedVoices = voices;
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(voices);
    };
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });

  return voicesPromise;
}

/** Synchronous lookup against whatever is already loaded. */
function voicesNow(): SpeechSynthesisVoice[] {
  if (cachedVoices) return cachedVoices;
  if (!supported()) return [];
  return window.speechSynthesis.getVoices() ?? [];
}

/**
 * The best available voice for a language.
 *
 * Tries each locale in order and requires an exact or prefix match, so `fr-FR`
 * is found for `fr` and a bare `en` voice is not silently used for Spanish. A
 * `localService` voice is preferred because it works offline and starts faster.
 */
export function findVoice(
  languageCode: string,
  voices: SpeechSynthesisVoice[] = voicesNow(),
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  for (const locale of localesFor(languageCode)) {
    const target = locale.toLowerCase();
    const exact = voices.filter((voice) => voice.lang.toLowerCase() === target);
    if (exact.length > 0) {
      return exact.find((v) => v.localService) ?? exact[0];
    }
    // `fr-FR` should match a request for `fr`, but `fr` must not match `frr`.
    const base = target.split("-")[0];
    const byPrefix = voices.filter(
      (voice) =>
        voice.lang.toLowerCase() === base ||
        voice.lang.toLowerCase().startsWith(`${base}-`),
    );
    if (byPrefix.length > 0) {
      return byPrefix.find((v) => v.localService) ?? byPrefix[0];
    }
  }

  return null;
}

/** What the UI should say about audio for this language, right now. */
export function browserAvailability(languageCode: string): SpeechAvailability {
  if (!supported()) {
    return { available: false, reason: "This browser cannot play speech audio." };
  }
  const voice = findVoice(languageCode);
  if (!voice) {
    // Honest: no fabricated audio, and no claim that audio exists.
    return {
      available: false,
      reason: `No ${languageCode} voice is installed on this device, so this phrase cannot be played yet.`,
    };
  }
  return {
    available: true,
    provider: "browser",
    voice: voice.name,
    locale: voice.lang,
  };
}

export const browserProvider: SpeechProvider = {
  id: "browser",
  availability: browserAvailability,

  speak(clip: SpeechClip) {
    return new Promise((resolve) => {
      if (!supported()) {
        resolve({ ok: false, error: "speechSynthesis unavailable" });
        return;
      }

      const synth = window.speechSynthesis;
      // One clip at a time, enforced at the lowest level as well as in the hook.
      synth.cancel();

      const voice = findVoice(clip.languageCode);
      if (!voice) {
        resolve({ ok: false, error: `no voice for ${clip.languageCode}` });
        return;
      }

      const utterance = new SpeechSynthesisUtterance(clip.text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = SPEECH_RATES[clip.speed];
      // Slightly above default pitch reads as clearer at slow rates without
      // sounding like a different speaker.
      utterance.pitch = 1;

      let settled = false;
      const finish = (result: { ok: true } | { ok: false; error: string }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      utterance.onend = () => finish({ ok: true });
      utterance.onerror = (event) => {
        // `not-allowed` is the autoplay policy: speech cannot start without a
        // user gesture. `interrupted`/`canceled` are our own stop() calls.
        const reason = (event as SpeechSynthesisErrorEvent).error ?? "unknown";
        finish({ ok: false, error: String(reason) });
      };

      try {
        synth.speak(utterance);
      } catch (error) {
        finish({ ok: false, error: error instanceof Error ? error.message : "speak failed" });
      }
    });
  },

  stop() {
    if (!supported()) return;
    window.speechSynthesis.cancel();
  },
};
