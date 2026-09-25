import type { Metadata } from "next";
import Link from "next/link";
import { CaptureForm } from "./capture-form";
import { contentCapabilities } from "./capabilities";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/empty-state";
import { loadLanguageContext } from "@/lib/db/context";
import { listSources } from "@/lib/db/content";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Learn from content" };

/**
 * Learn From Content.
 *
 * The capability report comes from `contentCapabilities`, which reports honestly:
 * detection needs a stopword list for the language, and automatic translation
 * needs a configured provider. Where either is missing the page says so and
 * offers the manual path, rather than presenting a control that cannot work.
 */
export default async function CapturePage({ params }: PageProps<"/[lang]/capture">) {
  const { lang } = await params;
  const { profile } = await requireProfile();
  const { language } = await loadLanguageContext(lang);
  const client = await getServerClient();

  const capabilities = contentCapabilities(language.code);
  const sources = await listSources(client, language.code, 10);
  const nativeLanguage = profile.native_language ?? "en";

  return (
    <div className="flex flex-col gap-8">
      <CaptureForm
        language={language}
        nativeLanguage={nativeLanguage}
        enrichmentAvailable={capabilities.enrichment}
        enrichmentReason={capabilities.enrichmentReason}
      />

      {!capabilities.extraction ? (
        <Card>
          <CardHeader
            title={`Word detection is not available for ${language.name_en} yet`}
            description="It needs a function-word list for the language. Without one, every article and preposition would be offered as vocabulary, which is worse than offering nothing."
          />
        </Card>
      ) : null}

      {sources.length > 0 ? (
        <section aria-labelledby="sources-heading" className="flex flex-col gap-3">
          <h2 id="sources-heading" className="text-sm font-semibold text-primary">
            Text you have brought in
          </h2>
          <ul className="flex flex-col gap-2">
            {sources.map((source) => (
              <li key={source.id}>
                <Link
                  href={`/${language.code}/capture/${source.id}`}
                  className="flex min-h-[64px] items-center gap-3 rounded-[var(--radius)] border border-line bg-surface-raised px-4 py-3 transition-colors hover:border-[var(--border-strong)] hover:bg-surface-hover"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-muted"
                  >
                    <Icon name="book" size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-primary">
                      {source.title ?? "Pasted text"}
                    </span>
                    <span className="block text-xs text-muted">
                      {source.charCount.toLocaleString()} characters ·{" "}
                      {source.candidateCount} word
                      {source.candidateCount === 1 ? "" : "s"} found
                      {source.analyzedAt
                        ? ` · ${new Date(source.analyzedAt).toLocaleDateString("en", {
                            day: "numeric",
                            month: "short",
                          })}`
                        : ""}
                    </span>
                  </span>
                  <Icon
                    name="arrowRight"
                    size={16}
                    className="shrink-0 text-muted"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card>
        <CardHeader
          title="Other sources"
          description="Modelled in the database, but not implemented. Listed so the gap is explicit rather than implied."
        />
        <ul className="mt-4 flex flex-wrap gap-2">
          {capabilities.plannedSourceKinds.map((kind) => (
            <li key={kind}>
              <Badge tone="muted">
                <Icon name="lock" size={12} className="mr-1 inline" />
                {SOURCE_LABELS[kind] ?? kind}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Each needs work outside this page: a fetch-and-extract pipeline for
          URLs and video transcripts, and OCR for images. Pasting text needs none
          of that, which is why it shipped first.
        </p>
      </Card>
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  url: "Web article by URL",
  youtube: "YouTube transcript",
  image: "Photo or screenshot",
  document: "Uploaded document",
};

