"use server";

import { redirect } from "next/navigation";
import {
  getAuthenticatedUser,
  getOnboardingDraft,
  mergeOnboardingDraft,
  saveOnboardingAnswers,
  clearOnboardingDraft,
  type OnboardingDraft,
} from "@/lib/db/learner";
import { findAvailableLanguage } from "@/lib/db/languages";
import { getServerClient } from "@/lib/insforge/server-client";
import { checkFeature, consumeFeature } from "@/lib/db/entitlements";
import { getLearnerLanguage } from "@/lib/db/learner";
import { firstProblemForStep } from "@/lib/onboarding/answers";
import { STEP_FIELDS, onboardingSchema } from "@/lib/onboarding/schema";
import {
  FIRST_STEP,
  LAST_STEP,
  ONBOARDING_STEPS,
  onboardingPath,
  parseStep,
  type OnboardingStep,
} from "@/lib/onboarding/steps";

/**
 * The onboarding wizard's single Server Action.
 *
 * One action, not two, because the wizard is one DOM form and `useActionState`
 * tracks one action per form. The hidden `step` field says what the submit meant:
 *
 *   step < 6 → validate that step and advance
 *   step = 6 → validate everything and write the learner's plan
 *
 * All validation is server-side, so a hand-crafted POST cannot skip a step or
 * save a half-filled plan.
 */

export type OnboardingFormState = { error: string | null; step: OnboardingStep };

/** The canonical, pre-validation shape of one step's answers. */
type RawOnboardingValues = {
  language: string;
  nativeLanguage: string;
  motivation: string[];
  level: string;
  goal: string;
  dailyMinutes: string;
  skills: string[];
};

function readForm(formData: FormData): RawOnboardingValues {
  return {
    language: String(formData.get("language") ?? "").trim(),
    nativeLanguage: String(formData.get("nativeLanguage") ?? "").trim(),
    // Multi-selects submit one entry per checked box; `getAll` is the only
    // correct reader for them.
    motivation: formData.getAll("motivation").map(String),
    level: formData.get("level") === null ? "unsure" : String(formData.get("level")),
    goal: String(formData.get("goal") ?? "A2"),
    dailyMinutes: String(formData.get("dailyMinutes") ?? ""),
    skills: formData.getAll("skills").map(String),
  };
}

async function assertLanguage(code: string) {
  const client = await getServerClient();
  const language = await findAvailableLanguage(client, code);
  if (!language) {
    // An unavailable language is not the learner's mistake; send them to the
    // catalogue to choose a real one.
    redirect("/languages");
  }
  return language;
}

export async function submitOnboarding(
  _prevState: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const values = readForm(formData);
  const language = await assertLanguage(values.language);
  const step = parseStep(String(formData.get("step") ?? "1"));

  // ---- Persist what this step collected, on the server ----------------------
  //
  // This is the durable half of the state model. The browser also keeps answers
  // in `sessionStorage` for instant display, but it must never be the only copy:
  // a step transition remounts the wizard, and a render that happens before the
  // client rehydrates produced a form with no reason inputs at all — the learner's
  // selections were visibly there and then arrived empty.
  //
  // Only the fields this step owns are written, so nothing already stored is
  // erased. `STEP_FIELDS[1]` is empty because step 1's language is carried
  // separately below.
  const client0 = await getServerClient();
  const user0 = await getAuthenticatedUser(client0);
  if (user0) {
    const owned = STEP_FIELDS[step];
    const patch: OnboardingDraft = {
      language: values.language || undefined,
      // The display name and timezone live on the last step only.
      ...(step === LAST_STEP
        ? {
            displayName: String(formData.get("displayName") ?? "").trim() || undefined,
            timezone: String(formData.get("timezone") ?? "").trim() || undefined,
          }
        : {}),
    };
    if (owned.includes("nativeLanguage")) patch.nativeLanguage = values.nativeLanguage || undefined;
    if (owned.includes("motivation")) patch.motivation = values.motivation;
    if (owned.includes("level")) patch.level = values.level;
    if (owned.includes("goal")) patch.goal = values.goal;
    if (owned.includes("dailyMinutes")) {
      const minutes = Number(values.dailyMinutes);
      if (Number.isFinite(minutes)) patch.dailyMinutes = minutes;
    }
    if (owned.includes("skills")) patch.skills = values.skills;

    try {
      await mergeOnboardingDraft(client0, user0.id, patch, step);
    } catch (error) {
      // A failed draft write must not block the learner; the browser copy still
      // carries the step, and the final submit falls back to it.
      console.error("[onboarding] could not save the draft", {
        step,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  // ---- Final step: validate the COMPLETE plan, then write it ---------------
  //
  // Built from the server draft first and the submitted form second, so a value
  // the browser failed to send is recovered from what the server already holds.
  // The form still wins where it has a value, because that is the learner's most
  // recent intent.
  let complete: RawOnboardingValues = values;
  if (step === LAST_STEP && user0) {
    const draft = await getOnboardingDraft(client0, user0.id);
    complete = {
      language: values.language || draft.language || "",
      nativeLanguage: values.nativeLanguage || draft.nativeLanguage || "",
      motivation: values.motivation.length > 0 ? values.motivation : (draft.motivation ?? []),
      level: values.level || draft.level || "unsure",
      goal: values.goal || draft.goal || "A2",
      dailyMinutes:
        values.dailyMinutes !== ""
          ? values.dailyMinutes
          : draft.dailyMinutes !== undefined
            ? String(draft.dailyMinutes)
            : "",
      skills: values.skills.length > 0 ? values.skills : (draft.skills ?? []),
    };
  }

  const parsed = onboardingSchema.safeParse(complete);

  // ---- Final step: validate everything, then write the plan. ----------------
  if (step === LAST_STEP) {
    if (!parsed.success) {
      // Report the most relevant problem, not the first one Zod happens to list.
      // The rule lives in `firstProblemForStep` so it is unit tested; see there
      // for why `issues[0]` produced a message about the wrong step.
      return {
        error:
          firstProblemForStep(
            parsed.error.issues,
            STEP_FIELDS,
            step,
            ONBOARDING_STEPS,
          ) ?? "Check your answers before continuing",
        step,
      };
    }

    const client = await getServerClient();
    const user = await getAuthenticatedUser(client);
    if (!user) {
      redirect(`/sign-in?next=${encodeURIComponent(`/${language.code}/onboarding`)}`);
    }

    // Starting a second language is the one gate on the core loop, so it is
    // checked here rather than in the UI — and only when the language is new.
    // Re-running onboarding for a language already held must never be blocked.
    const alreadyEnrolled = await getLearnerLanguage(client, language.code);
    if (!alreadyEnrolled) {
      const decision = await checkFeature(client, "active_languages");
      if (!decision.allowed) {
        return {
          error: `The free plan includes one active language. Learning ${language.name_en} as well would make two — change your active language in settings, or upgrade to study both.`,
          step,
        };
      }

      const spent = await consumeFeature(client, "active_languages");
      if (!spent.ok) {
        return {
          error: "You have reached the number of languages on your plan.",
          step,
        };
      }
    }

    const name = String(formData.get("displayName") ?? "").trim();
    const timezone = String(formData.get("timezone") ?? "").trim();

    await saveOnboardingAnswers(
      client,
      user.id,
      {
        languageCode: parsed.data.language,
        nativeLanguage: parsed.data.nativeLanguage,
        motivations: parsed.data.motivation,
        cefrLevel: parsed.data.level === "unsure" ? null : parsed.data.level,
        cefrGoal: parsed.data.goal,
        dailyMinutes: parsed.data.dailyMinutes,
        skillPriorities: parsed.data.skills,
      },
      {
        ...(name ? { displayName: name } : {}),
        ...(timezone ? { timezone } : {}),
      },
    );

    // The plan is written, so the draft has done its job. Leaving it behind
    // would let a half-filled plan resurface on a later visit.
    try {
      await clearOnboardingDraft(client, user.id);
    } catch (error) {
      // Not fatal: the plan is already saved. A stale draft only affects a
      // future re-run of onboarding, which overwrites it anyway.
      console.error("[onboarding] could not clear the draft", {
        reason: error instanceof Error ? error.message : "unknown",
      });
    }

    // Land on the plan summary, not the dashboard. Six questions deserve an
    // answer to "what did that produce?" before being shown a generic home
    // screen — and it is the one place the learner sees the first lesson named.
    redirect(`/${language.code}/plan`);
  }

  // ---- Intermediate step: validate only this step, then advance. ------------
  if (!parsed.success) {
    const fields = STEP_FIELDS[step];
    const relevant = parsed.error.issues.filter((issue) =>
      fields.some((field) => issue.path[0] === field),
    );
    if (relevant.length > 0) {
      return { error: relevant[0]?.message ?? "Check your answer", step };
    }
  }

  redirect(onboardingPath(language.code, (step + 1) as OnboardingStep));
}

/**
 * Go back one step.
 *
 * Deliberately a Server Action rather than a link: it is submitted from the same
 * form, so the answers already entered survive the move. A link to
 * `?step=n-1` would be a fresh GET and discard everything the learner has typed.
 */
export async function previousOnboardingStep(formData: FormData): Promise<void> {
  const language = String(formData.get("language") ?? "").trim();
  const step = parseStep(String(formData.get("step") ?? "1"));

  if (!language) redirect("/languages");
  if (step <= 1) redirect(onboardingPath(language, FIRST_STEP));

  redirect(onboardingPath(language, (step - 1) as OnboardingStep));
}
