import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OnboardingWizard } from "./onboarding-wizard";
import { listLanguages } from "@/lib/db/languages";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";
import { parseStep } from "@/lib/onboarding/steps";

export const metadata: Metadata = { title: "Set up your plan" };

/**
 * Onboarding for one language.
 *
 * The step lives in the URL so the wizard is server-rendered, refreshable and
 * works without JavaScript; the client component only supplies the pending state
 * and the single-form plumbing.
 */
export default async function OnboardingPage({
  params,
  searchParams,
}: PageProps<"/[lang]/onboarding">) {
  const { lang } = await params;
  const { step: rawStep } = await searchParams;

  const { profile } = await requireProfile();
  const client = await getServerClient();
  const catalogue = await listLanguages(client);

  const language = catalogue.available.find((l) => l.code === lang);
  // Onboarding only exists for languages that actually have a guided path.
  if (!language) notFound();

  return (
    <OnboardingWizard
      language={language}
      languages={catalogue.available}
      nativeLanguages={catalogue.all}
      step={parseStep(typeof rawStep === "string" ? rawStep : undefined)}
      defaults={{
        displayName: profile.display_name,
        nativeLanguage: profile.native_language,
      }}
    />
  );
}
