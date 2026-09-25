/**
 * Remove throwaway accounts left behind by the verification scripts.
 *
 * Run:  npm run reset:test-data
 *
 * `verify:backend` and `verify:logic` create real accounts. Their own cleanup
 * deletes the `profiles` row, which cascades across the public schema but does
 * **not** remove the row in `auth.users` — and the runtime database role has no
 * permission to write to the managed `auth` schema. So the accounts accumulate.
 *
 * This uses the Admin API, which is the sanctioned route, and is safe to run at
 * any time: it only ever touches accounts whose email matches a verification
 * prefix.
 */

const url = process.env.NEXT_PUBLIC_INSFORGE_URL;
const adminKey = process.env.INSFORGE_API_KEY;

if (!url || !adminKey) {
  console.error("Missing InsForge env vars. Run with --env-file=.env.local");
  process.exit(1);
}

/** Every prefix the verification scripts generate. */
const TEST_PREFIXES = ["verify-", "verify-other-", "logic-", "dbg-", "action-"];

async function listUsers() {
  const response = await fetch(`${url}/api/auth/users`, {
    headers: { "x-api-key": adminKey },
  });

  if (!response.ok) {
    throw new Error(`listing users failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
}

/**
 * Batch delete: `DELETE /api/auth/users` with a `userIds` body.
 *
 * There is no per-user DELETE route — a single-id request returns a plain 404
 * from the Express router, which is easy to misread as "already deleted".
 */
async function deleteUsers(ids) {
  const response = await fetch(`${url}/api/auth/users`, {
    method: "DELETE",
    headers: { "x-api-key": adminKey, "Content-Type": "application/json" },
    body: JSON.stringify({ userIds: ids }),
  });

  if (!response.ok) {
    console.warn(`  delete failed: ${response.status} ${(await response.text()).slice(0, 200)}`);
    return 0;
  }

  const payload = await response.json().catch(() => null);
  const deleted = Array.isArray(payload?.data?.deletedIds)
    ? payload.data.deletedIds.length
    : Array.isArray(payload?.deletedIds)
      ? payload.deletedIds.length
      : ids.length;

  return deleted;
}

const users = await listUsers();
const doomed = users.filter(
  (user) =>
    typeof user.email === "string" &&
    TEST_PREFIXES.some((prefix) => user.email.startsWith(prefix)),
);

if (doomed.length === 0) {
  console.log(`No verification accounts found (${users.length} total users).`);
  process.exit(0);
}

console.log(`Removing ${doomed.length} verification account(s) of ${users.length} total…`);

const removed = await deleteUsers(doomed.map((user) => user.id));

console.log(`Removed ${removed} of ${doomed.length}.`);

if (removed < doomed.length) {
  console.log(
    "Any account that could not be removed has no learner data attached; " +
      "delete it from the InsForge dashboard if you want it gone.",
  );
}
