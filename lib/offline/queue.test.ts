/**
 * Unit tests for the offline review queue.
 *
 * Run:  npm test
 *
 * The retry logic is the whole reason this module exists, and retry logic is
 * notoriously easy to get wrong in ways that only show up after a crash or a
 * flaky connection. So the tests are about the failure paths, not the happy one:
 * an entry survives an exception, leaves only on success, is never applied twice
 * under the same key, and cannot grow without bound.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_ATTEMPTS,
  MAX_QUEUED,
  QUEUE_STORAGE_KEY,
  enqueue,
  newClientKey,
  pendingCount,
  readQueue,
  removeQueued,
  syncQueue,
  writeQueue,
  type QueueStore,
  type QueuedReview,
} from "./queue.ts";

/** An in-memory store, so no test needs a browser. */
function memoryStore(initial: Record<string, string> = {}): QueueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function entry(overrides: Partial<QueuedReview> = {}): QueuedReview {
  return {
    clientKey: newClientKey(),
    itemId: "11111111-1111-1111-1111-111111111111",
    languageCode: "es",
    rating: "good",
    state: "new",
    stability: 0,
    difficulty: 0,
    streakCorrect: 0,
    reps: 0,
    elapsedDays: 0,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    ...overrides,
  };
}

describe("newClientKey", () => {
  it("produces a distinct, uuid-shaped key each time", () => {
    const a = newClientKey();
    const b = newClientKey();
    assert.notEqual(a, b);
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.match(b, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("stays unique across many draws", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => newClientKey()));
    assert.equal(seen.size, 2000);
  });
});

describe("readQueue", () => {
  it("returns an empty queue when nothing is stored", () => {
    assert.deepEqual(readQueue(memoryStore()), []);
  });

  it("survives unparseable content instead of throwing", () => {
    // A corrupt value must not take the review screen down with it.
    const store = memoryStore({ [QUEUE_STORAGE_KEY]: "{not json" });
    assert.deepEqual(readQueue(store), []);
  });

  it("discards entries that are not shaped like a review", () => {
    const good = entry();
    const store = memoryStore({
      [QUEUE_STORAGE_KEY]: JSON.stringify([good, { nope: true }, null, "x", { clientKey: "" }]),
    });
    assert.deepEqual(readQueue(store), [good]);
  });

  it("survives a storage that throws on read", () => {
    const hostile: QueueStore = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    assert.deepEqual(readQueue(hostile), []);
  });
});

describe("enqueue and remove", () => {
  it("keeps entries in the order they were answered", () => {
    const store = memoryStore();
    const first = entry({ itemId: "aaaaaaaa-1111-1111-1111-111111111111" });
    const second = entry({ itemId: "bbbbbbbb-2222-2222-2222-222222222222" });
    enqueue(store, first);
    enqueue(store, second);

    assert.deepEqual(
      readQueue(store).map((item) => item.itemId),
      [first.itemId, second.itemId],
    );
    assert.equal(pendingCount(store), 2);
  });

  it("removes exactly the entry with the given key", () => {
    const store = memoryStore();
    const keep = entry();
    const drop = entry();
    enqueue(store, keep);
    enqueue(store, drop);

    removeQueued(store, drop.clientKey);
    assert.deepEqual(
      readQueue(store).map((item) => item.clientKey),
      [keep.clientKey],
    );
  });
});

describe("bounded queue", () => {
  it("trims the oldest entries rather than growing without bound", () => {
    const store = memoryStore();
    const many = Array.from({ length: MAX_QUEUED + 25 }, () => entry());
    const stored = writeQueue(store, many);

    assert.equal(stored.length, MAX_QUEUED);
    assert.equal(pendingCount(store), MAX_QUEUED);
    // The survivors are the newest, so the most recent work is what is kept.
    assert.equal(stored[stored.length - 1]?.clientKey, many[many.length - 1]?.clientKey);
  });

  it("reports entries it could not persist when storage is full", () => {
    // Better to tell the caller nothing was stored than to claim durability.
    const full: QueueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    };
    const one = entry();
    const stored = writeQueue(full, [one]);
    assert.deepEqual(stored, [one]);
  });
});

describe("syncQueue", () => {
  it("sends oldest first and clears everything on success", async () => {
    const store = memoryStore();
    enqueue(store, entry({ itemId: "aaaaaaaa-1111-1111-1111-111111111111" }));
    enqueue(store, entry({ itemId: "bbbbbbbb-2222-2222-2222-222222222222" }));

    const sent: string[] = [];
    const outcome = await syncQueue(store, async (queued) => {
      sent.push(queued.itemId);
      return { ok: true };
    });

    assert.deepEqual(sent, [
      "aaaaaaaa-1111-1111-1111-111111111111",
      "bbbbbbbb-2222-2222-2222-222222222222",
    ]);
    assert.equal(outcome.synced, 2);
    assert.equal(outcome.failed, 0);
    assert.equal(pendingCount(store), 0);
  });

  it("sends the SAME idempotency key on a retry", async () => {
    // This is the property the database's idempotency gate depends on: a replay
    // must be recognisable, which means the key cannot be regenerated per attempt.
    const store = memoryStore();
    const queued = entry();
    enqueue(store, queued);

    const keys: string[] = [];
    await syncQueue(store, async (sent) => {
      keys.push(sent.clientKey);
      return { ok: false, error: "offline" };
    });
    await syncQueue(store, async (sent) => {
      keys.push(sent.clientKey);
      return { ok: true };
    });

    assert.deepEqual(keys, [queued.clientKey, queued.clientKey]);
    assert.equal(pendingCount(store), 0);
  });

  it("keeps an entry whose send failed, and records why", async () => {
    const store = memoryStore();
    enqueue(store, entry());

    const outcome = await syncQueue(store, async () => ({ ok: false, error: "network down" }));

    assert.equal(outcome.synced, 0);
    assert.equal(outcome.failed, 1);
    const [remaining] = readQueue(store);
    assert.equal(remaining?.attempts, 1);
    assert.equal(remaining?.lastError, "network down");
  });

  it("treats a thrown exception as a failure, not a crash", async () => {
    const store = memoryStore();
    enqueue(store, entry());

    const outcome = await syncQueue(store, async () => {
      throw new Error("boom");
    });

    assert.equal(outcome.failed, 1);
    assert.equal(outcome.synced, 0);
    assert.equal(readQueue(store)[0]?.lastError, "boom");
  });

  it("only removes entries the server confirmed", async () => {
    const store = memoryStore();
    const ok = entry({ itemId: "aaaaaaaa-1111-1111-1111-111111111111" });
    const bad = entry({ itemId: "bbbbbbbb-2222-2222-2222-222222222222" });
    enqueue(store, ok);
    enqueue(store, bad);

    const outcome = await syncQueue(store, async (queued) =>
      queued.itemId === ok.itemId ? { ok: true } : { ok: false, error: "rejected" },
    );

    assert.equal(outcome.synced, 1);
    assert.equal(outcome.failed, 1);
    assert.deepEqual(
      readQueue(store).map((item) => item.itemId),
      [bad.itemId],
    );
  });

  it("drops an entry that has exhausted its attempts, and says so", async () => {
    const store = memoryStore();
    const doomed = entry({ attempts: MAX_ATTEMPTS - 1 });
    enqueue(store, doomed);

    const outcome = await syncQueue(store, async () => ({ ok: false, error: "always fails" }));

    assert.equal(outcome.failed, 0);
    assert.equal(outcome.dropped.length, 1);
    assert.equal(outcome.dropped[0]?.clientKey, doomed.clientKey);
    assert.equal(outcome.dropped[0]?.error, "always fails");
    assert.equal(pendingCount(store), 0, "a permanently stuck entry must not block the queue");
  });

  it("resends an entry after a crash rather than losing it", async () => {
    // The entry left in storage by a process that died mid-sync must still be sent.
    const store = memoryStore();
    const interrupted = entry({ attempts: 1, lastError: "connection reset" });
    writeQueue(store, [interrupted]);

    const outcome = await syncQueue(store, async () => ({ ok: true }));
    assert.equal(outcome.synced, 1);
    assert.equal(pendingCount(store), 0);
  });

  it("sends no more than one batch, leaving the rest queued", async () => {
    const store = memoryStore();
    for (let i = 0; i < 5; i += 1) enqueue(store, entry());

    let calls = 0;
    const outcome = await syncQueue(
      store,
      async () => {
        calls += 1;
        return { ok: true };
      },
      { batch: 2 },
    );

    assert.equal(calls, 2);
    assert.equal(outcome.synced, 2);
    assert.equal(pendingCount(store), 3);
  });

  it("does nothing when the queue is empty", async () => {
    let calls = 0;
    const outcome = await syncQueue(memoryStore(), async () => {
      calls += 1;
      return { ok: true };
    });
    assert.equal(calls, 0);
    assert.deepEqual(outcome, { synced: 0, failed: 0, dropped: [] });
  });
});
