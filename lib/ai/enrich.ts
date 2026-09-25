/**
 * AI enrichment for captured vocabulary.
 *
 * Scope is deliberately narrow: this translates a word the learner has *already
 * chosen* and writes a short gloss. It never decides what to show — that is done
 * deterministically by `lib/learning/extract.ts` — which is what keeps the
 * feature working, and honest, with no provider configured.
 *
 * Availability is a first-class concept here. If no key is set, or the request
 * fails, the caller stores `unavailable`/`failed` and the UI asks the learner for
 * the translation instead. Nothing is ever guessed and presented as a
 * translation.
 */

/** Kept in one place so the model can be swapped without touching call sites. */
export const ENRICHMENT_MODEL =
  process.env.OPENROUTER_CHAT_MODEL ?? "openai/gpt-4o-mini";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Cards per request. Small enough that one bad item cannot spoil a batch. */
const BATCH_SIZE = 20;

export type EnrichmentAvailability =
  | { available: true }
  | { available: false; reason: string };

/**
 * Whether enrichment can run, and if not, the reason to show the learner.
 *
 * Checked before any UI promises a translation, so the interface never offers an
 * action it cannot complete.
 */
export function enrichmentStatus(): EnrichmentAvailability {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key.trim().length === 0) {
    return {
      available: false,
      reason:
        "No AI provider is configured for this project, so translations cannot be generated automatically.",
    };
  }
  return { available: true };
}

export type EnrichmentRequest = {
  surface: string;
  contextSentence: string | null;
};

export type EnrichmentResult = {
  surface: string;
  translation: string | null;
  gloss: string | null;
};

/**
 * Translate and gloss a batch of captured words.
 *
 * Returns a result per input, with `translation: null` where the model did not
 * produce a usable answer. Callers must treat null as "not translated" and ask
 * the learner, never as an empty translation.
 */
export async function enrichBatch(
  requests: readonly EnrichmentRequest[],
  options: { languageCode: string; nativeLanguage: string },
): Promise<{ results: EnrichmentResult[]; error: string | null }> {
  if (requests.length === 0) return { results: [], error: null };

  const status = enrichmentStatus();
  if (!status.available) {
    return { results: [], error: status.reason };
  }

  const collected: EnrichmentResult[] = [];
  let lastError: string | null = null;

  for (let offset = 0; offset < requests.length; offset += BATCH_SIZE) {
    const batch = requests.slice(offset, offset + BATCH_SIZE);
    const { results, error } = await requestBatch(batch, options);
    if (error) lastError = error;
    collected.push(...results);
  }

  return { results: collected, error: lastError };
}

async function requestBatch(
  batch: readonly EnrichmentRequest[],
  options: { languageCode: string; nativeLanguage: string },
): Promise<{ results: EnrichmentResult[]; error: string | null }> {
  const controller = new AbortController();
  // A capture screen must not hang: ten seconds is already longer than a learner
  // will wait, and the manual path is always available.
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ENRICHMENT_MODEL,
        temperature: 0,
        // Strict JSON: this response is parsed, not displayed, so a chatty reply
        // is a failure rather than a nicety.
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              `You translate individual words and short phrases from ${options.languageCode} into ${options.nativeLanguage}.`,
              "For each input, give the most likely meaning *in the supplied sentence*, plus a gloss of at most 12 words.",
              "If the input is a function word, a proper noun, or you are not confident, return null for both fields.",
              "Never invent a translation. Returning null is always preferable to guessing.",
              'Reply with JSON only, shaped exactly: {"items":[{"surface":"...","translation":"...","gloss":"..."}]}',
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              items: batch.map((request) => ({
                surface: request.surface,
                sentence: request.contextSentence,
              })),
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[ai] enrichment request failed", response.status, detail.slice(0, 500));
      return {
        results: [],
        error: `The AI provider returned ${response.status}.`,
      };
    }

    const payload: unknown = await response.json();
    return { results: parseEnrichment(payload, batch), error: null };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    console.error("[ai] enrichment threw", error);
    return {
      results: [],
      error: aborted
        ? "The AI provider took too long to respond."
        : "Could not reach the AI provider.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse the model's reply defensively.
 *
 * Every field is validated and a missing or unusable translation becomes `null`,
 * so a malformed response degrades to "ask the learner" rather than writing a
 * fabricated translation into their vocabulary.
 */
function parseEnrichment(
  payload: unknown,
  batch: readonly EnrichmentRequest[],
): EnrichmentResult[] {
  const content = extractContent(payload);
  if (!content) {
    console.error("[ai] enrichment response had no message content");
    return batch.map((request) => ({
      surface: request.surface,
      translation: null,
      gloss: null,
    }));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("[ai] enrichment response was not JSON");
    return batch.map((request) => ({
      surface: request.surface,
      translation: null,
      gloss: null,
    }));
  }

  const items =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { items?: unknown }).items
      : undefined;

  const bySurface = new Map<string, EnrichmentResult>();
  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const surface = typeof record.surface === "string" ? record.surface.trim() : "";
      if (!surface) continue;

      bySurface.set(surface.toLowerCase(), {
        surface,
        translation: clean(record.translation),
        gloss: clean(record.gloss),
      });
    }
  }

  // Always return one result per request, in order, so the caller can zip
  // results back onto candidates without index arithmetic.
  return batch.map((request) => {
    const match =
      bySurface.get(request.surface.toLowerCase()) ??
      // Fall back to a fuzzy match: the model may have normalised the casing or
      // dropped an accent.
      [...bySurface.values()].find(
        (candidate) =>
          fold(candidate.surface) === fold(request.surface),
      );

    return {
      surface: request.surface,
      translation: match?.translation ?? null,
      gloss: match?.gloss ?? null,
    };
  });
}

function extractContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const first = choices[0];
  if (!first || typeof first !== "object") return null;
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;

  const content = (message as { content?: unknown }).content;
  return typeof content === "string" && content.trim().length > 0 ? content : null;
}

/** A translation must be a non-empty string; anything else is "unknown". */
function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // Models like to answer "null", "N/A" or "-" when they mean "I don't know".
  if (!trimmed) return null;
  if (/^(null|n\/a|na|none|unknown|-|—)$/i.test(trimmed)) return null;
  return trimmed.slice(0, 300);
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
