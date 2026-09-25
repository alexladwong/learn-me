"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/db/learner";
import { getServerClient } from "@/lib/insforge/server-client";
import { CEFR_LEVELS, DAILY_MINUTES_OPTIONS, MOTIVATIONS, SKILLS } from "@/lib/types";
import { userFacingMessage } from "@/lib/errors";

/**
 * Update the learner's plan for one language.
 *
 * Authorization is delegated to Row Level Security: the update runs with the
 * learner's own token, and the `learner_languages` policy restricts it to their
 * rows. The action never takes a user id, so there is nothing to tamper with.
 */

export type SettingsFormState = { error: string | null; saved: boolean };

const planSchema = z.object({
  languageCode: z.string().trim().min(2).max(8),
  displayName: z.string().trim().max(80).optional(),
  timezone: z
    .string()
    .trim()
    .max(64)
    .optional()
    // An invalid timezone would silently break daily resets later, so it is
    // checked against the platform's own list rather than pattern-matched.
    .refine(
      (value) => {
        if (!value) return true;
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      },
      "That is not a recognized time zone (for example Europe/London)",
    ),
  dailyMinutes: z.coerce
    .number()
    .int()
    .refine(
      (n) => (DAILY_MINUTES_OPTIONS as readonly number[]).includes(n),
      "Choose one of the offered study times",
    ),
  goal: z.enum(CEFR_LEVELS),
  motivation: z.array(z.enum(MOTIVATIONS)),
  skills: z.array(z.enum(SKILLS)),
});

export async function updatePlanAction(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = planSchema.safeParse({
    languageCode: String(formData.get("languageCode") ?? ""),
    displayName: String(formData.get("displayName") ?? "") || undefined,
    timezone: String(formData.get("timezone") ?? "") || undefined,
    dailyMinutes: formData.get("dailyMinutes") ?? "",
    goal: String(formData.get("goal") ?? ""),
    motivation: formData.getAll("motivation").map(String),
    skills: formData.getAll("skills").map(String),
  });

  if (!parsed.success) {
    return {
      error: userFacingMessage(parsed.error.issues[0]?.message, "Enter a valid time zone"),
      saved: false,
    };
  }

  const client = await getServerClient();
  const user = await getAuthenticatedUser(client);
  if (!user) return { error: "Your session expired. Sign in again.", saved: false };

  const { error: learnerError } = await client.database
    .from("learner_languages")
    .update({
      daily_minutes: parsed.data.dailyMinutes,
      cefr_goal: parsed.data.goal,
      motivation: parsed.data.motivation,
      skill_priorities: parsed.data.skills,
    })
    .eq("language_code", parsed.data.languageCode);

  if (learnerError) {
    console.error("[settings] failed to update plan", learnerError);
    return { error: "Could not save your plan. Please try again.", saved: false };
  }

  const { error: profileError } = await client.database
    .from("profiles")
    .update({
      ...(parsed.data.displayName !== undefined
        ? { display_name: parsed.data.displayName }
        : {}),
      ...(parsed.data.timezone ? { timezone: parsed.data.timezone } : {}),
    })
    .eq("id", user.id);

  if (profileError) {
    console.error("[settings] failed to update profile", profileError);
    return { error: "Could not save your details. Please try again.", saved: false };
  }

  revalidatePath(`/${parsed.data.languageCode}/settings`);
  revalidatePath(`/${parsed.data.languageCode}`);

  return { error: null, saved: true };
}
