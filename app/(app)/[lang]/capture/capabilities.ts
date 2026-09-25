import { enrichmentStatus } from "@/lib/ai/enrich";
import { hasStopwords } from "@/lib/learning/extract";
import { SOURCE_KINDS, type SourceKind } from "@/lib/db/content";

/**
 * What Learn From Content can actually do right now.
 *
 * A separate module from the Server Actions because a `"use server"` file may
 * only export async functions — and because capability reporting is a plain read
 * that the UI depends on, not an operation.
 *
 * Both flags are honest negatives when false: the UI shows the feature as
 * unavailable and says why, rather than offering a control that cannot work.
 */
export type ContentCapabilities = {
  /** Deterministic detection needs a stopword list for the language. */
  extraction: boolean;
  /** Automatic translation needs a configured AI provider. */
  enrichment: boolean;
  enrichmentReason: string | null;
  /** Source kinds the server accepts today. */
  acceptedSourceKinds: readonly SourceKind[];
  /** Modelled but not implemented, so the UI can name them as coming. */
  plannedSourceKinds: readonly SourceKind[];
};

export function contentCapabilities(languageCode: string): ContentCapabilities {
  const status = enrichmentStatus();
  const implemented: readonly SourceKind[] = ["text"];

  return {
    extraction: hasStopwords(languageCode),
    enrichment: status.available,
    enrichmentReason: status.available ? null : status.reason,
    acceptedSourceKinds: implemented,
    plannedSourceKinds: SOURCE_KINDS.filter((kind) => !implemented.includes(kind)),
  };
}
