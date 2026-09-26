import type { Metadata } from "next";
import { SettingsWorkspace } from "./settings-form";
import {
  DEFAULT_SETTINGS_SECTION,
  isSettingsSection,
  type SettingsSection,
} from "./sections";
import { loadLanguageContext } from "@/lib/db/context";
import { listLearnerLanguages } from "@/lib/db/learner";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  params,
  searchParams,
}: PageProps<"/[lang]/settings">) {
  const { lang } = await params;
  const query = await searchParams;
  // The section lives in the URL, so it is shareable, survives a refresh, and
  // works without JavaScript.
  const requested = typeof query.section === "string" ? query.section : undefined;
  const activeSection: SettingsSection = isSettingsSection(requested)
    ? requested
    : DEFAULT_SETTINGS_SECTION;
  const { user, profile } = await requireProfile();
  const { language, learner } = await loadLanguageContext(lang);

  const client = await getServerClient();
  const enrolled = await listLearnerLanguages(client);
  const otherLanguages = enrolled
    .filter((l) => l.language_code !== language.code)
    .map((l) => ({
      code: l.language_code,
      name_en: l.language.name_en,
      flag_emoji: l.language.flag_emoji,
    }));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">Settings</h1>
        <p className="mt-1 text-sm text-secondary">
          Adjust your plan. Your progress and history are never affected by these
          changes.
        </p>
      </header>

      <SettingsWorkspace
        language={language}
        learner={learner}
        displayName={profile.display_name ?? user.email?.split("@")[0] ?? ""}
        timezone={profile.timezone ?? ""}
        email={user.email ?? ""}
        otherLanguages={otherLanguages}
        activeSection={activeSection}
      />
    </div>
  );
}
