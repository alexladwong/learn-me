"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerClient } from "@/lib/insforge/server-client";
import { getAuthenticatedUser } from "@/lib/db/learner";
import { listMissionItemIds } from "@/lib/db/lessons";
import { saveItemsToBank } from "@/lib/db/bank";
import { findAvailableLanguage } from "@/lib/db/languages";
import { fingerprint } from "@/lib/learning/fingerprint";
import { userFacingMessage } from "@/lib/errors";

/**
 * Finish a guided lesson.
 *
 * The most important action in the product so far, because it is what turns
 * reading into a schedule:
 *
 *   1. every item the mission teaches is saved to the learner's bank,
 *   2. those items are enrolled in spaced repetition (due immediately),
 *   3. each answered step is recorded as a practice event, so the confusion
 *      engine has raw material,
 *   4. the completion itself is recorded against the mission.
 *
 * All four are idempotent. Re-running a lesson must not create duplicate bank
 * entries, and — critically — must not reset a review schedule that already has
 * history, because that would silently destroy the learner's progress.
 */

const stepResultSchema = z.object({
  itemId: z.string().uuid(),
  stepType: z.string().max(32),
  isCorrect: z.boolean(),
  expected: z.string().max(500).optional(),
  produced: z.string().max(500).optional(),
  latencyMs: z.number().int().min(0).max(600_000).optional(),
});

const completeLessonSchema = z.object({
  missionId: z.string().uuid(),
  languageCode: z.string().trim().min(2).max(8),
  results: z.array(stepResultSchema).max(200),
});

export type CompleteLessonInput = z.input<typeof completeLessonSchema>;

export type CompleteLessonResult =
  | {
      ok: true;
      itemsEnrolled: number;
      alreadyPresent: number;
      accuracy: number | null;
    }
  | { ok: false; error: string };

export async function completeLesson(
  input: CompleteLessonInput,
): Promise<CompleteLessonResult> {
  const parsed = completeLessonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: userFacingMessage(parsed.error.issues[0]?.message, "This lesson could not be saved") };
  }

  const { missionId, languageCode, results } = parsed.data;
  const client = await getServerClient();
  const user = await getAuthenticatedUser(client);
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  // The language must be one the platform actually publishes, so a hand-crafted
  // call cannot enrol items against a language with no content.
  const language = await findAvailableLanguage(client, languageCode);
  if (!language) return { ok: false, error: "That language is not available." };

  const missionItemIds = await listMissionItemIds(client, missionId);
  if (missionItemIds.length === 0) {
    return { ok: false, error: "This lesson has no content yet." };
  }

  // ---- 1 & 2. Bank + review queue, idempotently -------------------------
  let saved: { saved: number; alreadyPresent: number };
  try {
    saved = await saveItemsToBank(
      client,
      user.id,
      languageCode,
      missionItemIds,
      `mission:${missionId}`,
    );
  } catch (error) {
    console.error("[lesson] saving items failed", error);
    return { ok: false, error: "Could not save this lesson's items. Please try again." };
  }

  // ---- 3. Practice events, best effort ----------------------------------
  const graded = results.filter((result) => result.expected && result.produced);
  const correct = graded.filter((result) => result.isCorrect).length;
  const accuracy = graded.length > 0 ? correct / graded.length : null;

  if (results.length > 0) {
    const { error: practiceError } = await client.database
      .from("practice_events")
      .insert(
        results.map((result) => {
          const classified =
            result.expected && result.produced
              ? fingerprint({
                  expected: result.expected,
                  produced: result.produced,
                  mode: result.stepType,
                })
              : { errorType: "none" as const, fingerprint: null };

          return {
            user_id: user.id,
            language_code: languageCode,
            item_id: result.itemId,
            mode: normaliseStepType(result.stepType),
            is_correct: result.isCorrect,
            expected: result.expected?.slice(0, 500) ?? null,
            produced: result.produced?.slice(0, 500) ?? null,
            error_type: result.isCorrect ? "none" : classified.errorType,
            fingerprint: result.isCorrect ? null : classified.fingerprint,
            latency_ms: result.latencyMs ?? null,
            context: { missionId },
          };
        }),
      );

    if (practiceError) {
      // The lesson still counts as complete. Losing analytics is recoverable;
      // telling a learner their finished lesson failed is not.
      console.error("[lesson] practice_events insert failed", practiceError);
    }
  }

  // ---- 4. Record the completion ----------------------------------------
  const { error: completionError } = await client.database.rpc(
    "record_mission_completion",
    {
      p_mission_id: missionId,
      p_language_code: languageCode,
      p_accuracy: accuracy,
      p_items_enrolled: missionItemIds.length,
    },
  );

  if (completionError) {
    console.error("[lesson] record_mission_completion failed", completionError);
    return { ok: false, error: "Could not record your progress. Please try again." };
  }

  revalidatePath(`/${languageCode}/path`);
  revalidatePath(`/${languageCode}`);
  revalidatePath(`/${languageCode}/review`);
  revalidatePath(`/${languageCode}/bank`);

  return {
    ok: true,
    itemsEnrolled: missionItemIds.length,
    alreadyPresent: saved.alreadyPresent,
    accuracy,
  };
}

/**
 * `practice_events.mode` has its own check constraint, so an unknown step type
 * is recorded as a checkpoint rather than being dropped.
 */
const PRACTICE_MODES = new Set([
  "teach",
  "recognise",
  "recall",
  "listen",
  "speak",
  "match",
  "arrange",
  "translate",
  "checkpoint",
  "conversation",
]);

function normaliseStepType(stepType: string): string {
  return PRACTICE_MODES.has(stepType) ? stepType : "checkpoint";
}

/** Leave a lesson without recording anything, including the completion. */
export async function abandonLesson(languageCode: string): Promise<void> {
  redirect(`/${languageCode}/path`);
}
