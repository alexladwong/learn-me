"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@/lib/insforge/server-client";
import { getAuthenticatedUser } from "@/lib/db/learner";
import {
  removeItemsFromBank,
  saveItemsToBank,
  setFavorite as setFavoriteInDb,
} from "@/lib/db/bank";
import { findAvailableLanguage } from "@/lib/db/languages";
import { userFacingMessage } from "@/lib/errors";

/**
 * Bank mutations.
 *
 * Saving is what enrols an item in spaced repetition, which makes this the
 * gateway into the whole memory system. Both operations are therefore
 * idempotent and non-destructive: saving twice cannot duplicate a row or reset a
 * schedule, and removing is the only way to take something back out.
 */

const itemIdsSchema = z
  .array(z.string().uuid())
  .min(1, "Choose at least one item")
  .max(200, "Too many items at once");

const saveSchema = z.object({
  languageCode: z.string().trim().min(2).max(8),
  itemIds: itemIdsSchema,
  /** Provenance, e.g. "manual", "lesson", "content". */
  savedFrom: z.string().trim().max(64).default("manual"),
});

export type BankMutationResult =
  | { ok: true; saved: number; alreadyPresent: number; queued: number }
  | { ok: false; error: string };

export async function saveItems(input: z.input<typeof saveSchema>): Promise<BankMutationResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: userFacingMessage(parsed.error.issues[0]?.message, "That selection could not be saved") };
  }

  const { languageCode, itemIds, savedFrom } = parsed.data;
  const client = await getServerClient();
  const user = await getAuthenticatedUser(client);
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  const language = await findAvailableLanguage(client, languageCode);
  if (!language) return { ok: false, error: "That language is not available." };

  try {
    const result = await saveItemsToBank(
      client,
      user.id,
      languageCode,
      itemIds,
      savedFrom,
    );

    revalidatePath(`/${languageCode}/bank`);
    revalidatePath(`/${languageCode}/review`);
    revalidatePath(`/${languageCode}`);

    return {
      ok: true,
      saved: result.saved,
      alreadyPresent: result.alreadyPresent,
      queued: itemIds.length,
    };
  } catch (error) {
    console.error("[bank] save failed", error);
    return { ok: false, error: "Could not save those items. Please try again." };
  }
}

const removeSchema = z.object({
  languageCode: z.string().trim().min(2).max(8),
  itemIds: itemIdsSchema,
});

export async function removeItems(input: z.input<typeof removeSchema>): Promise<BankMutationResult> {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: userFacingMessage(parsed.error.issues[0]?.message, "That selection could not be saved") };
  }

  const { languageCode, itemIds } = parsed.data;
  const client = await getServerClient();
  const user = await getAuthenticatedUser(client);
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  try {
    const removed = await removeItemsFromBank(client, languageCode, itemIds);

    revalidatePath(`/${languageCode}/bank`);
    revalidatePath(`/${languageCode}/review`);
    revalidatePath(`/${languageCode}`);

    return { ok: true, saved: removed, alreadyPresent: 0, queued: 0 };
  } catch (error) {
    console.error("[bank] remove failed", error);
    return { ok: false, error: "Could not remove those items. Please try again." };
  }
}

const favoriteSchema = z.object({
  languageCode: z.string().trim().min(2).max(8),
  savedItemId: z.string().uuid(),
  isFavorite: z.boolean(),
});

export async function toggleFavorite(
  input: z.input<typeof favoriteSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = favoriteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: userFacingMessage(parsed.error.issues[0]?.message, "That selection could not be saved") };
  }

  const { languageCode, savedItemId, isFavorite } = parsed.data;
  const client = await getServerClient();
  const user = await getAuthenticatedUser(client);
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  try {
    await setFavoriteInDb(client, savedItemId, isFavorite);
    revalidatePath(`/${languageCode}/bank`);
    return { ok: true };
  } catch (error) {
    console.error("[bank] favourite failed", error);
    return { ok: false, error: "Could not update that item." };
  }
}
