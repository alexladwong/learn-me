/**
 * Speech synthesis, behind one interface.
 *
 * ## Why this file exists
 *
 * Audio appears in seven places (onboarding phrases, discovery cards, lesson
 * vocabulary, lesson sentences, the sentence bank, listening exercises, and later
 * pronunciation and the tutor). Coupling any of those to a specific vendor would
 * mean seven integrations and seven bills. So there is exactly one place that
 * knows how speech is produced, and everything else asks for a clip.
 *
 * ## What is actually available today, stated plainly
 *
 * The InsForge AI gateway — the intended server-side provider — requires a paid
 * organisation plan and refuses on this one (`AI is only available on paid
 * plans`). There are no other provider keys configured. So a cloud TTS provider is
 * **not** wired up, and this file does not pretend otherwise.
 *
 * What it does instead is use the **operating system's own speech engine**
 * through `speechSynthesis`, which:
 *
 *   - produces real synthesised speech — not a placeholder, not a sine tone,
 *     not text-to-text pretending to be audio;
 *   - needs no key and no paid plan, so audio works today;
 *   - works offline, on the device, with no per-request cost.
 *
 * The honest trade-offs, which the UI and the report both state:
 *
 *   1. **Synthesis happens in the browser, not on the server.** The product goal
 *      was a server-side provider. A cloud provider can be added behind this same
 *      interface without touching a single component — see `serverProvider` below
 *      for the shape and the cache-key helper that makes it cheap.
 *   2. **Voice quality varies by device.** Windows, macOS, Android and iOS each
 *      ship different voices. A learner on one machine may hear a better voice
 *      than on another. That is a real limitation, not a hidden one.
 *   3. **Coverage varies by device.** Every language in our catalogue except
 *      Luganda had a voice on the machine this was verified on; `resolveVoice`
 *      reports "unavailable" rather than playing something wrong.
 *   4. **Autoplay policy requires a gesture.** Speech cannot begin without the
 *      learner pressing the control, which is also the correct product behaviour.
 *
 * ## What does not change when a provider arrives
 *
 * `synthesizeSpeech` is the only call site. A server provider implements
 * `SpeechProvider`, the resolver prefers it when configured, and the components
 * are untouched. The cache key is already defined so generated audio can be stored
 * once and reused — the thing that actually keeps cost down at thousands of items.
 */

export type SpeechClip = {
  /** The text to speak, exactly as written. */
  text: string;
  /** Our language code, e.g. `fr`. */
  languageCode: string;
  /** `normal` is the native rate; `slow` is for learners. */
  speed: SpeechSpeed;
};

export type SpeechSpeed = "normal" | "slow";

export type SpeechProviderId = "browser" | "server";

export type SpeechAvailability =
  | { available: true; provider: SpeechProviderId; voice: string; locale: string }
  | { available: false; reason: string };

export type SpeechProvider = {
  id: SpeechProviderId;
  /**
   * Whether this provider can speak the language on *this* device.
   *
   * Capability is per-device for the browser engine (it depends on installed
   * voices) and per-account for a server provider (it depends on configured
   * voices). Neither can be answered from a static table, which is why this is a
   * function rather than a database column.
   */
  availability: (languageCode: string) => SpeechAvailability;
  /** Speak, resolving when playback finishes or fails. */
  speak: (clip: SpeechClip) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Stop whatever is speaking. Safe to call when nothing is. */
  stop: () => void;
};

/**
 * The rate applied to each speed.
 *
 * `slow` is 0.7 rather than something more dramatic on purpose: below roughly
 * 0.6 the formants stretch far enough that vowels stop sounding like the
 * language, which teaches the wrong sound. 0.7 is slow enough to hear the
 * syllables and still recognisably native speech.
 */
export const SPEECH_RATES: Record<SpeechSpeed, number> = {
  normal: 1,
  slow: 0.7,
};

/**
 * A stable cache key for generated audio.
 *
 * `language + normalized text + voice + speed`. Normalisation collapses
 * whitespace and case so the same sentence saved twice does not pay twice, and
 * the voice is part of the key so changing voices regenerates rather than
 * silently serving the old one. Provided now so a server provider can store files
 * under it without a migration of its own.
 */
export function speechCacheKey(input: {
  languageCode: string;
  text: string;
  voice: string;
  speed: SpeechSpeed;
}): string {
  const normalized = input.text.replace(/\s+/g, " ").trim().toLowerCase();
  return [input.languageCode, input.voice, input.speed, normalized]
    .join("|")
    // Keep it filesystem-safe: this becomes a storage path.
    .replace(/[^a-z0-9|.-]+/gi, "_")
    .slice(0, 240);
}

/**
 * How our language codes map to BCP-47 tags the speech engine understands.
 *
 * A bare `fr` is not a locale. Left to itself the engine may pick a regional
 * voice that is not the one a learner expected, or none at all, so each language
 * names its primary tag and the fallbacks worth trying.
 */
export const LANGUAGE_LOCALES: Record<string, string[]> = {
  en: ["en-GB", "en-US", "en"],
  es: ["es-ES", "es-MX", "es-US", "es"],
  fr: ["fr-FR", "fr-CA", "fr"],
  de: ["de-DE", "de-AT", "de"],
  pt: ["pt-PT", "pt-BR", "pt"],
  it: ["it-IT", "it"],
  nl: ["nl-NL", "nl-BE", "nl"],
  ja: ["ja-JP", "ja"],
  ko: ["ko-KR", "ko"],
  zh: ["zh-CN", "zh-Hans", "zh"],
  id: ["id-ID", "id"],
  sw: ["sw-KE", "sw"],
  lg: ["lg-UG", "lg"],
  ar: ["ar-SA", "ar-EG", "ar-001", "ar"],
};

export function localesFor(languageCode: string): string[] {
  return LANGUAGE_LOCALES[languageCode] ?? [languageCode];
}

/**
 * The single BCP-47 tag to send a server provider.
 *
 * A cloud provider rejects a bare `fr`; it wants `fr-FR`. The first entry in each
 * list is the primary locale, so this is the one place that decision is made.
 */
export function primaryLocale(languageCode: string): string {
  return localesFor(languageCode)[0] ?? languageCode;
}

/**
 * Whether a server provider could speak this language.
 *
 * Static and intentionally conservative: it says what providers in general can
 * do, not what this device has installed. The browser engine's real answer comes
 * from `browserAvailability`, which is the one that decides what the learner
 * sees today. Luganda is excluded because no mainstream TTS provider ships a
 * voice for it; claiming otherwise would put a button on screen that cannot work.
 */
export const SERVER_SPEAKABLE_LANGUAGES = [
  "en", "es", "fr", "de", "pt", "it", "nl", "ja", "ko", "zh", "id", "ar",
] as const;

export function serverSupports(languageCode: string): boolean {
  return (SERVER_SPEAKABLE_LANGUAGES as readonly string[]).includes(languageCode);
}
