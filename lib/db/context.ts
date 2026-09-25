import { notFound, redirect } from "next/navigation";
import { getLanguage } from "@/lib/db/languages";
import { getLearnerLanguage, type LearnerLanguageWithMeta } from "@/lib/db/learner";
import { listLanguages } from "@/lib/db/languages";
import { getServerClient } from "@/lib/insforge/server-client";
import type { Language } from "@/lib/types";

export type LanguageContext = {
  /** The catalogue row: names, direction, and which capabilities exist. */
  language: Language;
  /** The learner's plan for this language: goal, budget, priorities. */
  learner: LearnerLanguageWithMeta;
  /** Null when there is no `learner_languages` row yet (onboarding incomplete). */
  learnerOrNull: LearnerLanguageWithMeta | null;
};

/**
 * Resolve a `[lang]` URL segment into everything a language page needs.
 *
 * Centralised so every `/[lang]/*` route agrees on behaviour:
 *   - an unknown or unpublished code is a 404, never an empty page
 *   - a learner who has not started this language is sent to onboarding
 *   - the branch language (`?language=`) is honoured, so a learner can browse a
 *     language they are not actively studying without corrupting their plan
 */
export async function loadLanguageContext(
  langCode: string,
  options: { requireEnrollment?: boolean } = {},
): Promise<LanguageContext> {
  const { requireEnrollment = true } = options;
  const client = await getServerClient();

  const language = await getLanguage(client, langCode);
  if (!language || !language.is_available) notFound();

  const learnerOrNull = await getLearnerLanguage(client, langCode);

  if (!learnerOrNull && requireEnrollment) {
    // Nothing to show: send them through onboarding to create the plan.
    redirect(`/${langCode}/onboarding`);
  }

  return {
    language,
    learner: learnerOrNull ?? placeholderPlan(language),
    learnerOrNull,
  };
}

/** A neutral plan for a language the learner has not enrolled in. */
function placeholderPlan(
  language: Language,
): LearnerLanguageWithMeta {
  return {
    id: `preview-${language.code}`,
    user_id: "",
    language_code: language.code,
    is_active: false,
    is_primary: false,
    motivation: [],
    cefr_level: null,
    cefr_goal: "A2",
    daily_minutes: 10,
    skill_priorities: [],
    preferred_modes: [],
    started_at: new Date(0).toISOString(),
    language: {
      code: language.code,
      name_en: language.name_en,
      name_native: language.name_native,
      flag_emoji: language.flag_emoji,
    },
  };
}

/** Available languages, for settings and language switchers. */
export async function loadAvailableLanguages(): Promise<Language[]> {
  const client = await getServerClient();
  const catalogue = await listLanguages(client);
  return catalogue.available;
}
