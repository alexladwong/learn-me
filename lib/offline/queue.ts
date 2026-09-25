/**
 * The offline review queue.
 *
 * A review session must survive losing its connection. The learner is on a train,
 * the request fails, and the card they just answered is either kept or lost — so
 * it is kept, in this queue, and replayed when the network returns.
 *
 * Three properties make that safe, and all three are the point of this module:
 *
 *   1. **Every queued review carries an idempotency key, minted once.** The key
 *      is created when the review is queued and reused verbatim on every retry,
 *      so `apply_review` can recognise a replay. Without this, a sync that
 *      half-succeeded would schedule the same card twice — which is exactly the
 *      bug `20260923210000_review-idempotency.sql` exists to prevent.
 *   2. **An entry is removed only after the server confirms it.** A crash mid-sync
 *      re-sends rather than silently dropping a review. Re-sending is free
 *      because of (1); dropping is not recoverable.
 *   3. **The queue is bounded, and the oldest entries go.** An unbounded queue
 *      that cannot sync would grow until the storage quota fails and takes the
 *      whole app down with it.
 *
 * Storage is injected rather than reaching for `localStorage` directly, so the
 * behaviour above can be tested with a fake in `node:test`. A module that can
 * only be tested by hand in a browser is a module whose retry logic is never
 * tested at all.
 */

import type { Rating } from "@/lib/learning/fsrs";

/** One review the learner completed but the server has not confirmed. */
export type QueuedReview = {
  /** Idempotency key. Minted once, reused across every attempt. */
  clientKey: string;
  itemId: string;
  languageCode: string;
  rating: Rating;
  /** The memory state held by the client at the time of the answer. */
  state: string;
  stability: number;
  difficulty: number;
  streakCorrect: number;
  reps: number;
  elapsedDays: number;
  /** The typed answer, when there was one, so the confusion engine still sees it. */
  answer?: {
    expected: string;
    produced: string;
    mode: string;
    isCorrect: boolean;
    latencyMs?: number;
  };
  /** When the learner answered, so sync order matches the order they worked. */
  queuedAt: string;
  /** How many sync attempts have been made. */
  attempts: number;
  /** The last failure, so the UI can explain why something is stuck. */
  lastError: string | null;
};

/** The minimal storage surface this module needs. */
export type QueueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export const QUEUE_STORAGE_KEY = "learn-me:offline-reviews:v1";

/**
 * Ceiling on queued reviews.
 *
 * A session is at most `MAX_SESSION_CARDS` (200); keeping double that absorbs a
 * second session without letting a permanently offline client grow without end.
 */
export const MAX_QUEUED = 400;

/** How many attempts before an entry is dropped rather than retried forever. */
export const MAX_ATTEMPTS = 5;

/** How many entries to send in one sync pass, so a long queue cannot flood. */
export const SYNC_BATCH = 20;

export type SyncOutcome = {
  /** Entries the server confirmed and which left the queue. */
  synced: number;
  /** Entries still queued because the attempt failed. */
  failed: number;
  /** Entries dropped for exceeding `MAX_ATTEMPTS`, with the reason. */
  dropped: Array<{ clientKey: string; itemId: string; error: string }>;
};

/** Mint an idempotency key. Uses the platform UUID generator when there is one. */
export function newClientKey(): string {
  const maybeCrypto = globalThis.crypto as
    | { randomUUID?: () => string; getRandomValues?: (array: Uint8Array) => Uint8Array }
    | undefined;
  if (typeof maybeCrypto?.randomUUID === "function") return maybeCrypto.randomUUID();

  // `randomUUID` needs a secure context, which a plain-http dev host is not. A
  // version-4 UUID built from random bytes is still unique enough for a key that
  // only has to be unique per learner.
  const bytes = new Uint8Array(16);
  if (typeof maybeCrypto?.getRandomValues === "function") {
    maybeCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isQueuedReview(value: unknown): value is QueuedReview {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.clientKey === "string" &&
    entry.clientKey.length > 0 &&
    typeof entry.itemId === "string" &&
    typeof entry.languageCode === "string" &&
    typeof entry.rating === "string"
  );
}

/**
 * Read the queue.
 *
 * Storage is the learner's own device and may hold anything — a half-written
 * value, an older shape, a value another app wrote to the same key. Unparseable
 * or malformed content yields an empty queue rather than throwing, because a
 * corrupt queue must not take the review screen down with it.
 */
export function readQueue(store: QueueStore): QueuedReview[] {
  let raw: string | null;
  try {
    raw = store.getItem(QUEUE_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedReview);
  } catch {
    return [];
  }
}

/**
 * Write the queue, newest last, trimming the oldest beyond `MAX_QUEUED`.
 *
 * Returns what was actually stored, so a caller never believes it queued
 * something that was trimmed away.
 */
export function writeQueue(store: QueueStore, entries: readonly QueuedReview[]): QueuedReview[] {
  const bounded = entries.length > MAX_QUEUED ? entries.slice(entries.length - MAX_QUEUED) : [...entries];
  try {
    store.setItem(QUEUE_STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // Quota exceeded or storage disabled (private browsing). The caller gets the
    // unbounded truth rather than a silent lie about durability.
    return entries as QueuedReview[];
  }
  return bounded;
}

/** Add one review to the queue. */
export function enqueue(store: QueueStore, entry: QueuedReview): QueuedReview[] {
  return writeQueue(store, [...readQueue(store), entry]);
}

/** Remove one entry, matching on the idempotency key. */
export function removeQueued(store: QueueStore, clientKey: string): QueuedReview[] {
  return writeQueue(
    store,
    readQueue(store).filter((entry) => entry.clientKey !== clientKey),
  );
}

/** How many reviews are waiting. */
export function pendingCount(store: QueueStore): number {
  return readQueue(store).length;
}

/**
 * Replay the queue in order, oldest first.
 *
 * `send` is the caller's way of posting one review — normally the `submitReview`
 * Server Action. It returns `{ ok: true }` once the server has accepted the
 * review, or `{ ok: false, error }` otherwise.
 *
 * An entry leaves the queue only on `ok`. An entry that keeps failing stays and
 * accumulates attempts, and is dropped only after `MAX_ATTEMPTS` so a genuinely
 * impossible entry cannot block the queue behind it forever.
 */
export async function syncQueue(
  store: QueueStore,
  send: (entry: QueuedReview) => Promise<{ ok: true } | { ok: false; error: string }>,
  options: { batch?: number } = {},
): Promise<SyncOutcome> {
  const batch = options.batch ?? SYNC_BATCH;
  const queue = readQueue(store);
  const outcome: SyncOutcome = { synced: 0, failed: 0, dropped: [] };

  if (queue.length === 0) return outcome;

  const remaining: QueuedReview[] = [];
  let processed = 0;

  // Oldest first: the learner's answers should reach the scheduler in the order
  // they gave them, because each one's elapsed time depends on the last.
  for (const entry of queue) {
    if (processed >= batch) {
      remaining.push(entry);
      continue;
    }
    processed += 1;

    let result: { ok: true } | { ok: false; error: string };
    try {
      result = await send(entry);
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : "network error" };
    }

    if (result.ok) {
      outcome.synced += 1;
      continue;
    }

    const attempts = entry.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      outcome.dropped.push({
        clientKey: entry.clientKey,
        itemId: entry.itemId,
        error: result.error,
      });
      continue;
    }

    outcome.failed += 1;
    remaining.push({ ...entry, attempts, lastError: result.error });
  }

  writeQueue(store, remaining);
  return outcome;
}
