import { randomBytes } from "node:crypto";
import { createAuthActions } from "@insforge/sdk/ssr";
import { getAdminClient } from "@/lib/insforge/admin";
import { appUrl } from "@/lib/env";

/**
 * The native shell's half of the OAuth flow.
 *
 * ## Why this exists at all
 *
 * Google refuses OAuth inside an embedded WebView (`disallowed_useragent`).
 * Capacitor's shell is a WebView, so sign-in has to happen in the system
 * browser — and the system browser has its **own cookie jar**. The web flow keeps
 * the PKCE code verifier in an httpOnly cookie, so if the browser hop happened
 * outside the WebView the verifier would be written in one jar and looked for in
 * another, and the exchange would fail with no useful error.
 *
 * So for native, the verifier lives in the database instead, against an opaque
 * `request_id` that only the app and the server ever see.
 *
 * ## What each side holds
 *
 *   WebView   → `request_id` (and nothing else), only while a sign-in is pending
 *   Database  → `code_verifier`, never returned by any route
 *   System    → the Google session, unrelated to this app
 *   Deep link → `insforge_code`, which is useless without the verifier
 *
 * The client never receives the verifier, and no token of any kind is placed in
 * the deep-link URL.
 */

/** How long a pending sign-in stays valid. A slower one has failed. */
export const NATIVE_REQUEST_TTL_MS = 10 * 60 * 1000;

/**
 * Guard against a leaked or guessed id from a public endpoint. 32 bytes of
 * `randomBytes` is the point: it is not guessable, and the lookup is exact.
 */
function newRequestId(): string {
  return randomBytes(32).toString("base64url");
}

export type NativePlatform = "ios" | "android";

export function parsePlatform(value: unknown): NativePlatform | null {
  return value === "ios" || value === "android" ? value : null;
}

export type StartedNativeAuth = { url: string; requestId: string };

/**
 * Begin a native sign-in.
 *
 * Creates the pending record first and only returns once it is stored, so there
 * is no window in which the app holds a `requestId` the server cannot resolve.
 *
 * The cookie store passed to `createAuthActions` is a throwaway: the SDK returns
 * the verifier on the response, and persisting it to a cookie here would put it
 * back in the WebView's jar — exactly the state this design removes.
 */
export async function startNativeAuth(
  platform: NativePlatform,
): Promise<StartedNativeAuth> {
  const discardCookies = {
    get: () => undefined,
    set: () => {},
    delete: () => {},
    getAll: () => [],
  };

  const auth = createAuthActions({ cookies: discardCookies });

  const { data, error } = await auth.signInWithOAuth("google", {
    // Allowlisted verbatim in `insforge.toml`. InsForge appends `?insforge_code=`
    // itself; the backend rejects any query string we add to `redirectTo`.
    redirectTo: `${appUrl().replace(/\/$/, "")}`.startsWith("http")
      ? "learnme://auth/callback"
      : "learnme://auth/callback",
    skipBrowserRedirect: true,
  });

  if (error || !data?.url || !data.codeVerifier) {
    throw new Error(
      `native auth: could not start the OAuth flow (${error?.message ?? "no verifier returned"})`,
    );
  }

  const requestId = newRequestId();
  const admin = getAdminClient();

  // Opportunistic cleanup. No scheduler is configured for this project, and a
  // table of dead sign-in attempts has no reason to exist — expired rows are
  // removed on the next sign-in rather than accumulating forever.
  await admin.database
    .from("native_auth_requests")
    .delete()
    .lt("expires_at", new Date().toISOString());

  const { error: insertError } = await admin.database
    .from("native_auth_requests")
    .insert([
      {
        request_id: requestId,
        code_verifier: data.codeVerifier,
        platform,
        expires_at: new Date(Date.now() + NATIVE_REQUEST_TTL_MS).toISOString(),
      },
    ]);

  if (insertError) {
    throw new Error(`native auth: could not record the request (${insertError.message})`);
  }

  return { url: data.url, requestId };
}

export type ConsumedNativeAuth =
  | { ok: true; codeVerifier: string }
  | { ok: false; reason: "unknown" | "expired" | "consumed" };

/**
 * Claim a pending request exactly once, returning its verifier.
 *
 * The claim is a single conditional `UPDATE`, not a read followed by a write.
 * That is the whole replay defence: two simultaneous exchanges of the same
 * `requestId` both run this statement, Postgres serialises them, and the second
 * matches no row because `consumed_at` is now set. A read-then-write would let
 * both succeed.
 *
 * A failure here is not distinguished by cause on the wire — the caller reports
 * one message for all three — but the reason is returned so tests can assert the
 * difference between "never existed" and "already used".
 */
export async function consumeNativeAuthRequest(
  requestId: string,
): Promise<ConsumedNativeAuth> {
  const admin = getAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await admin.database
    .from("native_auth_requests")
    .update({ consumed_at: now })
    .eq("request_id", requestId)
    // Both conditions are in the WHERE clause, so an expired or already-used
    // row is not merely ignored — it is never claimed.
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("code_verifier");

  if (error) {
    throw new Error(`native auth: could not claim the request (${error.message})`);
  }

  const rows = Array.isArray(data) ? data : [];
  const claimed = rows[0] as { code_verifier?: unknown } | undefined;
  if (typeof claimed?.code_verifier === "string") {
    return { ok: true, codeVerifier: claimed.code_verifier };
  }

  // Nothing was claimed. The reason matters for the audit trail and for tests,
  // so it is looked up rather than assumed.
  const { data: existing } = await admin.database
    .from("native_auth_requests")
    .select("consumed_at,expires_at")
    .eq("request_id", requestId)
    .limit(1)
    .maybeSingle();

  if (!existing) return { ok: false, reason: "unknown" };
  const row = existing as { consumed_at?: string | null; expires_at?: string };
  if (row.consumed_at) return { ok: false, reason: "consumed" };
  return { ok: false, reason: "expired" };
}
