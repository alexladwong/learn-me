import type { Language } from "@/lib/types";

/**
 * What spoken practice can actually do right now, capability by capability.
 *
 * ## Why this is four flags and not one
 *
 * The product used to reason about "a speaking provider" as a single thing. It is
 * four, and they are in four different states:
 *
 *   - **Text to speech** — connected. The device's own speech engine synthesises
 *     real audio (`lib/speech/browser-provider.ts`). Not the server-side provider
 *     the design called for; it is not described as one.
 *   - **Model conversation** — needs a model gateway key. None is configured, and
 *     the InsForge gateway refuses on this plan, so there is no tutor to answer.
 *   - **Speech recognition** — nothing in this codebase calls a recogniser. Not
 *     connected, for any language.
 *   - **Pronunciation scoring** — nothing scores audio. Not connected, for any
 *     language.
 *
 * ## Why the database is not the only input
 *
 * `languages.supports_asr` and `languages.supports_pronunciation` were seeded
 * `true` for the launch languages as a statement of *intent*, and `/[lang]/speak`
 * read them as *connection* — it told learners that speech recognition and
 * pronunciation scoring were "Connected for French". Both columns are now `false`
 * everywhere (see `migrations/20260925120000_correct-speaking-capability-flags.sql`)
 * and flip per language only after a provider is wired up and verified.
 *
 * A column can therefore only ever *remove* a capability here, never add one: a
 * missing implementation is not something a database row can fix.
 */

export type SpeakingCapability = {
  id: "tts" | "conversation" | "asr" | "pronunciation";
  label: string;
  connected: boolean;
  detail: string;
};

/** True when audio can be produced for this language today. */
export function textToSpeechConnected(language: Language): boolean {
  return language.supports_audio;
}

/**
 * Whether a tutor can hold a conversation — which is **not** the same question as
 * whether a model key exists.
 *
 * This returned `Boolean(process.env.OPENROUTER_API_KEY)` and reported
 * "Conversation with a tutor: Connected". The key was real, and it is used — but
 * by `lib/ai/enrich.ts`, for word enrichment on text the learner brings in. The
 * tutor has no model call at all: `planConversation` and `buildOpeningLine` have
 * no caller outside their own unit tests, and nothing sends a turn anywhere. A
 * configured key is not a connected capability.
 *
 * So the honest answer today is no, and it stays no until a call path exists.
 * The InsForge Model Gateway — the sanctioned route — additionally refuses on
 * this plan (`AI is only available on paid plans`).
 */
export function modelConversationConnected(): boolean {
  return false;
}

export function speakingCapabilities(language: Language): SpeakingCapability[] {
  const tts = textToSpeechConnected(language);
  const conversation = modelConversationConnected();

  return [
    {
      id: "tts",
      label: "Text to speech",
      connected: tts,
      detail: tts
        ? `Connected. Your device's own speech engine reads ${language.name_en} aloud — real synthesised speech, produced on the device rather than on a server.`
        : `Not connected for ${language.name_en}. No voice is available for it on your device.`,
    },
    {
      id: "conversation",
      label: "Conversation with a tutor",
      connected: conversation,
      detail: conversation
        ? "Connected. A model can hold the other side of a scenario."
        : "Not connected. The tutor has no model call — the prompt design and the conversation store exist, but nothing sends a turn to a model, so there is nothing to reply to you.",
    },
    {
      id: "asr",
      label: "Speech recognition",
      connected: false,
      detail: `Not connected, for any language. Nothing in this app listens to you, so what you say cannot be transcribed.`,
    },
    {
      id: "pronunciation",
      label: "Pronunciation scoring",
      connected: false,
      detail: `Not connected, for any language. Nothing scores how you sound, and no screen will show you a pronunciation number until something does.`,
    },
  ];
}
