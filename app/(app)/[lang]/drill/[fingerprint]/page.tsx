import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DrillSession } from "./drill-session";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { CapabilityNotice } from "@/components/ui/empty-state";
import { loadLanguageContext } from "@/lib/db/context";
import { loadDrillMaterial } from "@/lib/db/drills";
import { getServerClient } from "@/lib/insforge/server-client";
import { referenceParadigm } from "@/lib/learning/drill";
import { requireProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Drill" };

/**
 * A generated drill for one confusion pattern.
 *
 * The fingerprint arrives URL-encoded because it contains a colon
 * (`conjugation:como`). It is treated as an opaque key: the pattern is resolved
 * from the learner's own recent history rather than trusted as input, so a
 * tampered fingerprint simply matches nothing and 404s.
 */
export default async function DrillPage({
  params,
}: PageProps<"/[lang]/drill/[fingerprint]">) {
  const { lang, fingerprint } = await params;
  await requireProfile();
  const { language } = await loadLanguageContext(lang);
  const client = await getServerClient();

  let decoded: string;
  try {
    decoded = decodeURIComponent(fingerprint);
  } catch {
    // A malformed escape sequence is a 404, not a 500.
    notFound();
  }

  const material = await loadDrillMaterial(client, language.code, decoded);
  if (!material) notFound();

  const { pattern, drill, unavailableReason } = material;

  // The full paradigm, when the lemma is tabulated, so the learner can see the
  // whole pattern this form belongs to rather than just the one contrast.
  const paradigm = pattern.lemma ? referenceParadigm(language.code, pattern.lemma) : [];

  if (!drill) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <header>
          <p className="text-xs font-medium uppercase tracking-wide text-accent">
            Drill unavailable
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary">
            {pattern.expectedForm ?? "This pattern"}
          </h1>
        </header>

        <Card>
          <CardHeader
            title="A drill cannot be built from your current material"
            description={unavailableReason ?? "There is not enough to practise with yet."}
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/${language.code}/path`}
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent hover:underline"
            >
              Do a lesson to add sentences
            </Link>
            <Link
              href={`/${language.code}/capture`}
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent hover:underline"
            >
              Bring in your own text
            </Link>
            <Link
              href={`/${language.code}/progress`}
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent hover:underline"
            >
              Back to progress
            </Link>
          </div>
        </Card>

        <CapabilityNotice
          title="Why there is no filler drill"
          description="A drill made from sentences that do not contain the word you are struggling with would test something else. Until three relevant sentences exist, this pattern stays in your normal review queue."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <DrillSession
        drill={drill}
        languageCode={language.code}
        attemptsBehindIt={pattern.occurrences}
      />

      {paradigm.length > 0 ? (
        <details className="mx-auto w-full max-w-2xl rounded-[var(--radius-lg)] border border-line bg-surface-raised">
          <summary className="flex min-h-[44px] cursor-pointer items-center px-5 py-4 text-sm font-medium text-primary">
            <span className="inline-flex items-center gap-2">
              <Icon name="book" size={15} />
              See every form of {pattern.lemma}
            </span>
          </summary>
          <ul className="grid gap-1.5 px-5 pb-4 sm:grid-cols-2">
            {paradigm.map((entry) => (
              <li
                key={`${entry.form}-${entry.person}`}
                className="flex items-baseline gap-3 text-sm"
              >
                <span className="text-target font-medium text-primary">
                  {entry.form}
                </span>
                <span className="text-secondary">{entry.gloss}</span>
                <span className="ml-auto text-xs text-muted">{entry.person}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
