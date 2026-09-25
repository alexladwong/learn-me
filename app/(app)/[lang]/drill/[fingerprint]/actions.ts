"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@/lib/insforge/server-client";
import { getAuthenticatedUser } from "@/lib/db/learner";
import { findAvailableLanguage } from "@/lib/db/languages";
import { recordDrillOutcome } from "@/lib/db/drills";
import { userFacingMessage } from "@/lib/errors";

/**
 * Drill completion.
 *
 * Records each graded answer as a `practice_event` so a drill feeds the same
 * engine that suggested it. That is what lets a pattern disappear once the
 * learner has demonstrably stopped making the mistake — the fix is data, not a
 * button the learner has to remember to press.
 */

const answerSchema = z.object({
  prompt: z.string().max(500),
  produced: z.string().max(500),
  isCorrect: z.boolean(),
});

const completeDrillSchema = z.object({
  languageCode: z.string().trim().min(2).max(8),
  fingerprint: z.string().trim().min(1).max(200),
  expectedForm: z.string().trim().min(1).max(100),
  answers: z.array(answerSchema).min(1).max(50),
});

export type CompleteDrillInput = z.input<typeof completeDrillSchema>;

export type CompleteDrillResult =
  | {
      ok: true;
      recorded: number;
      correct: number;
      total: number;
      /**
       * How many more correct answers in a row retire the pattern. Returned so
       * the summary can be specific instead of saying "keep practising".
       */
      message: string;
    }
  | { ok: false; error: string };

export async function completeDrill(
  input: CompleteDrillInput,
): Promise<CompleteDrillResult> {
  const parsed = completeDrillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: userFacingMessage(parsed.error.issues[0]?.message, "Those answers could not be saved") };
  }

  const { languageCode, fingerprint, expectedForm, answers } = parsed.data;
  const client = await getServerClient();
  const user = await getAuthenticatedUser(client);
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  const language = await findAvailableLanguage(client, languageCode);
  if (!language) return { ok: false, error: "That language is not available." };

  let recorded: number;
  try {
    recorded = await recordDrillOutcome(client, user.id, languageCode, {
      fingerprint,
      expectedForm,
      answers,
    });
  } catch (error) {
    console.error("[drill] recording the outcome failed", error);
    return { ok: false, error: "Could not save your answers. Please try again." };
  }

  const correct = answers.filter((answer) => answer.isCorrect).length;
  const total = answers.length;

  revalidatePath(`/${languageCode}/progress`);
  revalidatePath(`/${languageCode}`);
  revalidatePath(`/${languageCode}/review`);

  return {
    ok: true,
    recorded,
    correct,
    total,
    message:
      correct === total
        ? "Every answer was right. This pattern will stop being reported once you get it right a few more times in your normal practice."
        : "The answers you missed have been added back to your review queue, so they will come up again soon.",
  };
}
