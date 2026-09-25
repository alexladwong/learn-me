"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerClient } from "@/lib/insforge/server-client";
import { getAuthenticatedUser } from "@/lib/db/learner";
import { findAvailableLanguage } from "@/lib/db/languages";
import {
  createSource,
  dismissCandidates,
  keepCandidate,
  listKnownSurfaceKeys,
  markSourceAnalyzed,
  recordEnrichment,
  replaceCandidates,
} from "@/lib/db/content";
import {
  MAX_SOURCE_CHARS,
  extractCandidates,
  hasStopwords,
  tokenise,
} from "@/lib/learning/extract";
import { enrichBatch, enrichmentStatus } from "@/lib/ai/enrich";
import { requireFeature } from "@/lib/entitlements/gate";
import { userFacingMessage } from "@/lib/errors";

/**
 * Learn From Content.
 *
 * The flow is three deliberate steps — analyse, review, keep — and each one is a
 * separate action returning a result rather than a chain that can half-succeed.
 *
 * Detection is deterministic (`extractCandidates`); the AI provider is used only
 * to translate words the learner has already chosen. That ordering is why the
 * feature is fully usable with no provider configured.
 */

export type CaptureFormState = { error: string | null };

const analyseSchema = z.object({
  languageCode: z.string().trim().min(2).max(8),
  text: z
    .string()
    .trim()
    .min(20, "Paste at least a sentence or two — there is nothing to analyse in a few characters.")
    .max(MAX_SOURCE_CHARS, `That is longer than the ${MAX_SOURCE_CHARS.toLocaleString()} character limit. Paste a section instead.`),
  title: z.string().trim().max(120).optional(),
  nativeLanguage: z.string().trim().min(2).max(8).optional(),
});

export type AnalyseResult =
  | { ok: true; sourceId: string; candidateCount: number; knownCount: number }
  | { ok: false; error: string };

export async function analyseContent(
  _prevState: CaptureFormState,
  formData: FormData,
): Promise<CaptureFormState> {
  const parsed = analyseSchema.safeParse({
    languageCode: String(formData.get("languageCode") ?? ""),
    text: String(formData.get("text") ?? ""),
    title: String(formData.get("title") ?? "") || undefined,
    nativeLanguage: String(formData.get("nativeLanguage") ?? "") || undefined,
  });

  if (!parsed.success) {
    return { error: userFacingMessage(parsed.error.issues[0]?.message, "Check what you pasted.") };
  }

  const client = await getServerClient();
  const user = await getAuthenticatedUser(client);
  if (!user) return { error: "Your session expired. Sign in again." };

  const { languageCode, text, title } = parsed.data;

  const language = await findAvailableLanguage(client, languageCode);
  if (!language) return { error: "That language is not available." };

  // Refuse rather than produce filler. Without a stopword list every function
  // word would be offered as vocabulary, which is worse than saying no.
  if (!hasStopwords(languageCode)) {
    return {
      error: `Word detection is not available for ${language.name_en} yet. It needs a function-word list for the language, otherwise every "the" and "of" would be suggested as vocabulary.`,
    };
  }

  // Metering happens before any work: a request that is refused should not have
  // created a source row first.
  const gate = await requireFeature(client, "content_capture");
  if (!gate.ok) {
    return { error: gate.error };
  }

  let sourceId: string;
  try {
    sourceId = await createSource(client, user.id, {
      languageCode,
      sourceKind: "text",
      title: title ?? deriveTitle(text),
      rawText: text,
    });
  } catch (error) {
    console.error("[capture] creating source failed", error);
    return { error: "Could not save that text. Please try again." };
  }

  const tokens = tokenise(text);
  const knownKeys = await listKnownSurfaceKeys(client, languageCode);
  const extracted = extractCandidates(text, { languageCode, knownKeys });

  let inserted = 0;
  try {
    const result = await replaceCandidates(
      client,
      { id: sourceId, languageCode },
      user.id,
      extracted,
      knownKeys,
    );
    inserted = result.inserted;

    await markSourceAnalyzed(client, sourceId, {
      tokenCount: tokens.length,
      candidateCount: inserted,
      knownCount: knownKeys.size,
    });
  } catch (error) {
    console.error("[capture] analysis failed", error);
    return { error: "Analysed the text but could not save the results. Please try again." };
  }

  revalidatePath(`/${languageCode}/capture`);
  redirect(`/${languageCode}/capture/${sourceId}`);
}

export type EnrichResult =
  | {
      ok: true;
      translated: number;
      unavailable: number;
      /**
       * Generated translations, returned to the client so it can merge them into
       * the form without a page reload — a reload would discard which words the
       * learner had already selected.
       */
      translations: Record<string, { translation: string; gloss: string | null }>;
      note: string | null;
    }
  | { ok: false; error: string };

const enrichSchema = z.object({
  languageCode: z.string().trim().min(2).max(8),
  sourceId: z.string().uuid(),
  candidateIds: z.array(z.string().uuid()).min(1).max(100),
  nativeLanguage: z.string().trim().min(2).max(8),
});

/**
 * Generate translations for chosen candidates.
 *
 * When no provider is configured this returns `ok: false` with the reason, and
 * the UI falls back to asking the learner — it never presents a made-up
 * translation. Partial success is normal and is reported as such.
 */
export async function enrichCandidates(
  input: z.input<typeof enrichSchema>,
): Promise<EnrichResult> {
  const parsed = enrichSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: userFacingMessage(parsed.error.issues[0]?.message, "That request could not be completed") };
  }

  const status = enrichmentStatus();
  if (!status.available) {
    return { ok: false, error: status.reason };
  }

  const { languageCode, sourceId, candidateIds, nativeLanguage } = parsed.data;
  const client = await getServerClient();
  const user = await getAuthenticatedUser(client);
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  // Translation is charged per word, so the cost is the size of the request and
  // is spent in one atomic step. Checking per word would let a 30-word batch
  // pass 30 separate checks and overshoot the allowance.
  const gate = await requireFeature(client, "ai_translation", {
    cost: candidateIds.length,
  });
  if (!gate.ok) {
    return { ok: false, error: gate.error };
  }

  const { data: rows, error } = await client.database
    .from("content_candidates")
    .select("id,surface,context_sentence")
    .eq("source_id", sourceId)
    .in("id", candidateIds)
    .limit(100);

  if (error) {
    console.error("[capture] loading candidates for enrichment failed", error);
    return { ok: false, error: "Could not load those words." };
  }

  const candidates = (Array.isArray(rows) ? rows : []).flatMap((row: unknown) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.surface !== "string") return [];
    return [
      {
        id: record.id,
        surface: record.surface,
        contextSentence:
          typeof record.context_sentence === "string" ? record.context_sentence : null,
      },
    ];
  });

  if (candidates.length === 0) {
    return { ok: false, error: "Those words are no longer in this analysis." };
  }

  const { results, error: providerError } = await enrichBatch(
    candidates.map((candidate) => ({
      surface: candidate.surface,
      contextSentence: candidate.contextSentence,
    })),
    { languageCode, nativeLanguage },
  );

  const bySurface = new Map(
    results.map((result) => [result.surface.toLowerCase(), result]),
  );

  const updates = candidates.map((candidate) => {
    const match = bySurface.get(candidate.surface.toLowerCase());
    const translation = match?.translation ?? null;
    return {
      candidateId: candidate.id,
      translation,
      gloss: match?.gloss ?? null,
      state: translation ? ("enriched" as const) : ("unavailable" as const),
      source: translation ? ("ai" as const) : null,
    };
  });

  await recordEnrichment(client, updates);

  const translated = updates.filter((update) => update.translation).length;
  const unavailable = updates.length - translated;

  revalidatePath(`/${languageCode}/capture/${sourceId}`);

  const translations: Record<string, { translation: string; gloss: string | null }> = {};
  for (const update of updates) {
    if (!update.translation) continue;
    translations[update.candidateId] = {
      translation: update.translation,
      gloss: update.gloss,
    };
  }

  return {
    ok: true,
    translated,
    unavailable,
    translations,
    note: providerError,
  };
}

export type KeepResult =
  | { ok: true; kept: number; alreadyKept: number; queueHref: string }
  | { ok: false; error: string };

const keepSchema = z.object({
  languageCode: z.string().trim().min(2).max(8),
  sourceId: z.string().uuid(),
  /**
   * One entry per kept word. A translation is optional at the schema level
   * because a word the learner has already translated manually must still be
   * saveable when the AI is unavailable; the database function rejects a missing
   * translation, and that message is surfaced verbatim.
   */
  items: z
    .array(
      z.object({
        candidateId: z.string().uuid(),
        translation: z.string().trim().max(300).optional(),
        gloss: z.string().trim().max(300).optional(),
      }),
    )
    .min(1, "Select at least one word")
    .max(100),
});

export async function keepSelected(
  input: z.input<typeof keepSchema>,
): Promise<KeepResult> {
  const parsed = keepSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: userFacingMessage(parsed.error.issues[0]?.message, "That request could not be completed") };
  }

  const { languageCode, sourceId, items } = parsed.data;
  const client = await getServerClient();
  const user = await getAuthenticatedUser(client);
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  // Only accept candidates that belong to this source and this learner: RLS
  // already enforces ownership, and this makes the intent explicit rather than
  // relying on a policy the reader has to go and check.
  const { data: owned, error: ownedError } = await client.database
    .from("content_candidates")
    .select("id,saved_at")
    .eq("source_id", sourceId)
    .in(
      "id",
      items.map((item) => item.candidateId),
    )
    .limit(200);

  if (ownedError) {
    console.error("[capture] verifying candidates failed", ownedError);
    return { ok: false, error: "Could not verify those words." };
  }

  const ownedById = new Map(
    (Array.isArray(owned) ? owned : []).flatMap((row: unknown) => {
      if (!row || typeof row !== "object") return [];
      const record = row as Record<string, unknown>;
      if (typeof record.id !== "string") return [];
      return [[record.id, typeof record.saved_at === "string"] as const];
    }),
  );

  let kept = 0;
  let alreadyKept = 0;
  let firstError: string | null = null;

  for (const item of items) {
    if (!ownedById.has(item.candidateId)) continue;
    if (ownedById.get(item.candidateId) === true) {
      alreadyKept += 1;
      continue;
    }

    const result = await keepCandidate(client, {
      candidateId: item.candidateId,
      translation: item.translation ?? "",
      gloss: item.gloss ?? null,
      translationSource: "learner",
    });

    if (result.ok) kept += 1;
    else firstError ??= result.error;
  }

  if (kept === 0 && alreadyKept === 0) {
    return { ok: false, error: firstError ?? "Nothing was saved." };
  }

  revalidatePath(`/${languageCode}/capture/${sourceId}`);
  revalidatePath(`/${languageCode}/bank`);
  revalidatePath(`/${languageCode}/review`);
  revalidatePath(`/${languageCode}`);

  return {
    ok: true,
    kept,
    alreadyKept,
    queueHref: `/${languageCode}/review`,
  };
}

const dismissSchema = z.object({
  languageCode: z.string().trim().min(2).max(8),
  sourceId: z.string().uuid(),
  candidateIds: z.array(z.string().uuid()).min(1).max(200),
});

export async function dismissSelected(
  input: z.input<typeof dismissSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = dismissSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: userFacingMessage(parsed.error.issues[0]?.message, "That request could not be completed") };
  }

  const client = await getServerClient();
  const user = await getAuthenticatedUser(client);
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  try {
    await dismissCandidates(client, parsed.data.candidateIds);
    revalidatePath(`/${parsed.data.languageCode}/capture/${parsed.data.sourceId}`);
    return { ok: true };
  } catch (error) {
    console.error("[capture] dismissing failed", error);
    return { ok: false, error: "Could not dismiss those words." };
  }
}

/** A readable title from the first line, so the source list is scannable. */
function deriveTitle(text: string): string {
  const firstLine = text.split(/\n/).find((line) => line.trim().length > 0) ?? "";
  const trimmed = firstLine.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed || "Pasted text";
}


