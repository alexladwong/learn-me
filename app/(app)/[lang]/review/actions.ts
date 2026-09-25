"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@/lib/insforge/server-client";
import { getAuthenticatedUser } from "@/lib/db/learner";
import { parseReviewOutcome, type ReviewOutcome } from "@/lib/db/reviews";
import {
  RATINGS,
  dueAt,
  schedule,
  type MemoryState,
  type Rating,
} from "@/lib/learning/fsrs";
import { fingerprint } from "@/lib/learning/fingerprint";
import { userFacingMessage } from "@/lib/errors";

/**
 * Submit one review.
 *
 * This is the only path that moves a card's schedule. It:
 *   1. runs the pure FSRS scheduler to compute the next memory state,
 *   2. calls the `apply_review` SQL function, which writes the append-only event,
 *      updates `review_states`, and touches the daily rollup atomically,
 *   3. records a `practice_event` when an answer was typed, so the confusion
 *      engine has raw material.
 *
 * The schedule is computed here but *applied* in the database, which is what
 * makes the server authoritative: a client cannot write a due date directly
 * (`review_states` is RLS-scoped, but the scheduler is not exposed to it), and
 * an offline batch replays through the same function.
 *
 * Steps 2 and 3 are deliberately separate. A failure to record the practice
 * event must never roll back a successfully scheduled card — losing analytics is
 * recoverable; losing a review is not.
 */

const reviewSchema = z.object({
  itemId: z.string().uuid(),
  languageCode: z.string().trim().min(2).max(8),
  rating: z.enum(RATINGS),
  /**
   * Client-generated idempotency key, one per review.
   *
   * A retry, a double-tap or an offline batch that syncs twice must not schedule
   * the same card again. The client mints this once and reuses it verbatim for
   * every attempt at the same review, so `apply_review` can recognise the replay.
   * Optional so an older client still works; it then simply is not protected.
   */
  clientKey: z.string().uuid().optional(),
  /** Memory state before this review, as held by the client session. */
  state: z.enum(["new", "learning", "review", "relearning"]),
  stability: z.number().min(0).max(100_000),
  difficulty: z.number().min(0).max(10),
  streakCorrect: z.number().int().min(0),
  reps: z.number().int().min(0),
  /** Days since the last review, or 0 for a new card / same-day repeat. */
  elapsedDays: z.number().min(0).max(100_000),
  /** Present when the learner typed an answer, enabling error fingerprinting. */
  answer: z
    .object({
      expected: z.string().max(500),
      produced: z.string().max(500),
      mode: z.string().max(32),
      isCorrect: z.boolean(),
      latencyMs: z.number().int().min(0).max(600_000).optional(),
    })
    .optional(),
});

export type SubmitReviewInput = z.input<typeof reviewSchema>;

export type SubmitReviewResult =
  | { ok: true; outcome: ReviewOutcome }
  | { ok: false; error: string };

export async function submitReview(
  input: SubmitReviewInput,
): Promise<SubmitReviewResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: userFacingMessage(parsed.error.issues[0]?.message, "That review could not be saved") };
  }

  const data = parsed.data;
  const client = await getServerClient();
  const user = await getAuthenticatedUser(client);
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  // ---- 1. The scheduler, pure and in-process -----------------------------
  const current: MemoryState = {
    state: data.state,
    stability: data.stability,
    difficulty: data.difficulty,
    streakCorrect: data.streakCorrect,
    reps: data.reps,
  };

  const result = schedule(current, data.rating as Rating, data.elapsedDays);
  const now = new Date();

  // ---- 2. Apply it atomically -------------------------------------------
  const { data: applied, error } = await client.database.rpc("apply_review", {
    p_user_id: user.id,
    p_item_id: data.itemId,
    p_language_code: data.languageCode,
    p_rating: data.rating,
    p_next_due_at: dueAt(now, result).toISOString(),
    p_stability: result.stability,
    p_difficulty: result.difficulty,
    p_state: result.state,
    p_mastery: result.mastery,
    // Store the exact interval, before whole-day rounding, so history stays
    // faithful to what the model computed.
    p_interval_days: result.intervalDays,
    p_elapsed_days: data.elapsedDays,
    p_latency_ms: data.answer?.latencyMs ?? null,
    p_mode: data.answer?.mode ?? "review",
    p_client_key: data.clientKey ?? null,
  });

  if (error) {
    console.error("[review] apply_review failed", error);
    return { ok: false, error: "Could not save that review. Please try again." };
  }

  let outcome: ReviewOutcome;
  try {
    outcome = parseReviewOutcome(applied, data.itemId, data.rating as Rating);
  } catch (parseError) {
    console.error("[review] unexpected apply_review result", parseError);
    return { ok: false, error: "The scheduler returned an unexpected result." };
  }

  // ---- 3. Record the answer for the confusion engine, best effort --------
  if (data.answer) {
    const classified = fingerprint({
      expected: data.answer.expected,
      produced: data.answer.produced,
      mode: data.answer.mode,
    });

    const { error: practiceError } = await client.database
      .from("practice_events")
      .insert([
        {
          user_id: user.id,
          language_code: data.languageCode,
          item_id: data.itemId,
          mode: normaliseMode(data.answer.mode),
          is_correct: data.answer.isCorrect,
          expected: data.answer.expected.slice(0, 500),
          produced: data.answer.produced.slice(0, 500),
          error_type: data.answer.isCorrect ? "none" : classified.errorType,
          fingerprint: data.answer.isCorrect ? null : classified.fingerprint,
          latency_ms: data.answer.latencyMs ?? null,
        },
      ]);

    if (practiceError) {
      // Logged, not surfaced: the review itself succeeded, and the learner
      // should not see an error for bookkeeping they did not ask for.
      console.error("[review] practice_event insert failed", practiceError);
    }
  }

  revalidatePath(`/${data.languageCode}/review`);
  revalidatePath(`/${data.languageCode}`);

  return { ok: true, outcome };
}

/**
 * `practice_events.mode` has its own check constraint that uses the step types
 * rather than free text. Anything unrecognised is recorded as a conversation,
 * which is the closest honest fit rather than dropping the event.
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

function normaliseMode(mode: string): string {
  return PRACTICE_MODES.has(mode) ? mode : "conversation";
}
