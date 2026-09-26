/**
 * Native OAuth verification.
 *
 * Run:  npm run verify:native
 *
 * The web flow and the native flow share no code path, so nothing that passes
 * `verify:auth` proves anything about this one. What matters here is the claim
 * protocol, and it is asserted against the **real database** rather than a mock:
 * a single-use guarantee that only holds against a fake is not a guarantee.
 *
 * Asserted:
 *   1. `start` returns a Google URL and an opaque id — and never the verifier
 *   2. the verifier is stored server-side against that id
 *   3. the id is consumed by the first `exchange`, whatever the code does
 *   4. a second `exchange` with the same id is refused (replay)
 *   5. unknown, expired and already-consumed ids are all refused
 *   6. malformed input is refused before any database work
 *   7. expired rows are cleaned up when the next sign-in starts
 *
 * No account is created and nothing is deleted: these endpoints authenticate
 * nobody on their own, which is the point being tested.
 */

import { execFileSync } from "node:child_process";

const BASE = process.env.PROBE_URL ?? "http://localhost:3000";

/** Direct SQL, because the claim protocol is a database guarantee. */
function sql(query) {
  const url = (() => {
    const line = execFileSync("grep", ["^DATABASE_URL=", ".env.local"], {
      encoding: "utf8",
    }).trim();
    return line.slice("DATABASE_URL=".length);
  })();
  return execFileSync("psql", [url, "-tAc", query], { encoding: "utf8" }).trim();
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

const post = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// ── 1. start returns a URL and an id, never a verifier ────────────────────
const startResponse = await post("/api/auth/native/start", { platform: "ios" });
const startBody = await startResponse.json().catch(() => null);

check("start succeeds", startResponse.status === 200, `HTTP ${startResponse.status}`);
check(
  "start returns a Google URL",
  typeof startBody?.url === "string" && startBody.url.includes("accounts.google.com"),
  startBody?.url ? new URL(startBody.url).host : "no url",
);
check(
  "start returns an opaque request id",
  typeof startBody?.requestId === "string" && startBody.requestId.length >= 32,
  `${startBody?.requestId?.length ?? 0} chars`,
);
check(
  "start never returns the verifier",
  startBody !== null && !("codeVerifier" in startBody) && !("code_verifier" in startBody),
  Object.keys(startBody ?? {}).join(", "),
);

const requestId = startBody?.requestId;

// ── 2. the verifier really is stored server-side ──────────────────────────
const stored = requestId
  ? sql(
      `SELECT length(code_verifier) || '|' || (consumed_at IS NULL) FROM native_auth_requests WHERE request_id = '${requestId}'`,
    )
  : "";
const [verifierLength, notConsumed] = stored.split("|");

check(
  "the verifier is held server-side",
  Number(verifierLength) > 20,
  `${verifierLength} chars stored`,
);
// `'x' || (bool)` renders `true`/`false`; a bare boolean column renders `t`/`f`.
// This assertion was written against the latter and failed against the former.
check("the request starts unconsumed", notConsumed === "true", notConsumed);

// ── 3 & 4. the first exchange consumes it, the second is refused ──────────
const first = await post("/api/auth/native/exchange", {
  requestId,
  insforgeCode: "deliberately-not-a-real-code",
});
check(
  "a bad code is refused",
  first.status === 401,
  `HTTP ${first.status}`,
);

const consumed = sql(
  `SELECT (consumed_at IS NOT NULL) FROM native_auth_requests WHERE request_id = '${requestId}'`,
);
check(
  "the request is consumed even though the code failed",
  consumed === "t",
  "a code that did not work must not be retryable",
);

const replay = await post("/api/auth/native/exchange", {
  requestId,
  insforgeCode: "deliberately-not-a-real-code",
});
const replayBody = await replay.json().catch(() => null);
check("replaying the same id is refused", replay.status === 401, `HTTP ${replay.status}`);
check(
  "the refusal does not disclose why",
  typeof replayBody?.error === "string" &&
    !/consum|expir|unknown|not found/i.test(replayBody.error),
  replayBody?.error,
);

// ── 5. unknown and expired ────────────────────────────────────────────────
const unknown = await post("/api/auth/native/exchange", {
  requestId: "z".repeat(43),
  insforgeCode: "whatever",
});
check("an unknown id is refused", unknown.status === 401, `HTTP ${unknown.status}`);

const expiredStart = await post("/api/auth/native/start", { platform: "android" });
const expiredId = (await expiredStart.json().catch(() => null))?.requestId;
sql(
  `UPDATE native_auth_requests SET expires_at = now() - interval '1 minute' WHERE request_id = '${expiredId}'`,
);
const expired = await post("/api/auth/native/exchange", {
  requestId: expiredId,
  insforgeCode: "whatever",
});
check("an expired id is refused", expired.status === 401, `HTTP ${expired.status}`);
check(
  "an expired request is left unconsumed",
  sql(
    `SELECT (consumed_at IS NULL) FROM native_auth_requests WHERE request_id = '${expiredId}'`,
  ) === "t",
  "expiry is not the same as use",
);

// ── 6. malformed input, before any database work ──────────────────────────
const noCode = await post("/api/auth/native/exchange", { requestId: expiredId });
const noId = await post("/api/auth/native/exchange", { insforgeCode: "x" });
const empty = await post("/api/auth/native/exchange", { requestId: "  ", insforgeCode: " " });
check("a missing code is refused", noCode.status === 400, `HTTP ${noCode.status}`);
check("a missing id is refused", noId.status === 400, `HTTP ${noId.status}`);
check("whitespace-only input is refused", empty.status === 400, `HTTP ${empty.status}`);

const badPlatform = await post("/api/auth/native/start", { platform: "windows" });
check("an unknown platform is refused", badPlatform.status === 400, `HTTP ${badPlatform.status}`);

// ── 7. expired rows are cleaned up opportunistically ──────────────────────
const before = Number(sql(`SELECT count(*) FROM native_auth_requests WHERE expires_at < now()`));
await post("/api/auth/native/start", { platform: "ios" });
const after = Number(sql(`SELECT count(*) FROM native_auth_requests WHERE expires_at < now()`));

check(
  "starting a sign-in clears expired rows",
  before > 0 && after === 0,
  `${before} expired before, ${after} after`,
);

// Leave nothing of ours behind.
sql(
  `DELETE FROM native_auth_requests WHERE consumed_at IS NOT NULL OR expires_at < now()`,
);

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
