import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CandidateReview } from "../candidate-review";
import { contentCapabilities } from "../capabilities";
import { loadLanguageContext } from "@/lib/db/context";
import { getSource, listCandidates } from "@/lib/db/content";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose words to keep" };

/**
 * The candidate review step for one pasted text.
 *
 * Owns the source row, so a source id belonging to another learner is a 404 —
 * `getSource` runs under RLS, which means the query returns nothing rather than
 * someone else's pasted text.
 */
export default async function CaptureDetailPage({
  params,
}: PageProps<"/[lang]/capture/[sourceId]">) {
  const { lang, sourceId } = await params;
  const { profile } = await requireProfile();
  const { language } = await loadLanguageContext(lang);
  const client = await getServerClient();

  const source = await getSource(client, sourceId);
  if (!source || source.languageCode !== language.code) notFound();

  const candidates = await listCandidates(client, sourceId);
  const capabilities = contentCapabilities(language.code);

  return (
    <CandidateReview
      languageCode={language.code}
      languageName={language.name_en}
      sourceId={sourceId}
      candidates={candidates}
      enrichmentAvailable={capabilities.enrichment}
      enrichmentReason={capabilities.enrichmentReason}
      nativeLanguage={profile.native_language ?? "en"}
    />
  );
}
