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

/**
 * A neutral plan for a language the learner has not enrolled in.
 *
 * Every field here has to read as "we do not know", not as a default the learner
 * might mistake for their own answer. `cefr_goal` used to be `"A2"` and
 * `daily_minutes` used to be `10`, which reached `/plan` and rendered as an
 * aiming level and a daily budget the learner had never chosen — the reason that
 * page could show a different goal from the rest of the product.
 */
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
    // Not `"A2"`. A preview of a language nobody has a plan for has no goal.
    cefr_goal: null,
    // Not `10`. `daily_minutes` is the learner's own answer; 0 states that they
    // have not given one for this language.
    daily_minutes: 0,
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
