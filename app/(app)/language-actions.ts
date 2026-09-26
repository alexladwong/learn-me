"use server";

import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireSession } from "@/lib/auth/session";
import { setPrimaryLanguage } from "@/lib/db/learner";
import { userFacingMessage } from "@/lib/errors";

export type SwitchLanguageResult = { error: string | null };

/**
 * Move the learner's active language.
 *
 * The URL is changed by the client with `router.push` so the shell stays mounted
 * and the transition is instant; this action is what makes the change survive a
 * reload, and it is the reason switching does not depend on the URL alone.
 *
 * Authorization is server-side and does not trust the code it is handed: a
 * crafted value that the learner is not enrolled in comes back as `false` from
 * `setPrimaryLanguage` and is reported as an error rather than silently ignored.
 * Nothing is created, deleted or reset — each language keeps its own plan, level,
 * progress and review schedule.
 */
export async function switchLanguageAction(
  languageCode: string,
): Promise<SwitchLanguageResult> {
  // `requireSession` is the authoritative check; the layout guard is a
  // convenience and a Server Action is reachable without rendering it.
  const user = await requireSession();

  const code = typeof languageCode === "string" ? languageCode.trim() : "";
  if (!code) return { error: "That language could not be identified." };

  try {
    const client = await getServerClient();
    const moved = await setPrimaryLanguage(client, user.id, code);

    if (!moved) {
      return { error: "That language is not on your account." };
    }
  } catch (error) {
    return {
      error: userFacingMessage(
        error instanceof Error ? error.message : error,
        "Could not change your language.",
      ),
    };
  }

  /*
   * The shell reads the primary language from the database, so the rail and the
   * switcher have to be re-rendered even though the learner has not reloaded.
   * `"layout"` is the widest scope below the root: every `/[lang]/*` page is
   * inside it, and the switcher lives in it.
   */
  revalidatePath("/", "layout");

  return { error: null };
}
