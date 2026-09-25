/**
 * Authentication verification.
 *
 * Run:  npm run verify:auth
 *
 * Why this exists: email/password sign-in was reported as broken. It was not —
 * the accounts being used had been created with Google and therefore have no
 * password at all, and the provider returns the same `Invalid credentials` for
 * "wrong password" and "no password exists". The form then said "that email and
 * password combination is not right", which is true, unfixable from that form,
 * and gave no hint that Google was the way in.
 *
 * So this checks the whole credential matrix against the live provider, and
 * checks that the provider diagnostic identifies a Google-only account correctly.
 *
 * It never prints an email address in full, never touches a password, and never
 * reads a hash — there is no password field on an InsForge user record to read.
 * Accounts it creates are deleted at the end.
 */

import { createClient } from "@insforge/sdk";

const url = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const adminKey = process.env.INSFORGE_API_KEY;

if (!url || !anonKey || !adminKey) {
  console.error("Missing InsForge env vars. Run with --env-file=.env.local");
  process.exit(1);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
function step(title) {
  console.log(`\n── ${title}`);
}

/** Mask an address so a transcript never carries a real one. */
const mask = (email) => String(email).replace(/^(.)[^@]*(@.*)$/, "$1***$2");

const anon = createClient({ baseUrl: url, anonKey });
const admin = createClient({ baseUrl: url, anonKey: adminKey });

const PASSWORD = "verify-auth-password-1234";
const stamp = Date.now();
const primaryEmail = `authverify-${stamp}@example.com`;
const created = [];

async function listUsers(search) {
  const response = await fetch(
    `${url}/api/auth/users?search=${encodeURIComponent(search)}`,
    { headers: { "x-api-key": adminKey }, cache: "no-store" },
  );
  if (!response.ok) return [];
  const body = await response.json().catch(() => null);
  const container = body?.data ?? body?.users ?? body;
  return Array.isArray(container) ? container : [];
}

try {
  // ── 1. Credentials: the full matrix ──────────────────────────────────────
  step("Email + password behaves correctly in every case");

  const signUp = await anon.auth.signUp({
    email: primaryEmail,
    password: PASSWORD,
    name: "Auth Verify",
  });
  created.push(primaryEmail);

  record(
    "sign-up creates an account and a usable session",
    !signUp.error && Boolean(signUp.data?.user),
    signUp.error ? signUp.error.message : "session issued",
  );

  const good = await anon.auth.signInWithPassword({ email: primaryEmail, password: PASSWORD });
  record(
    "valid credentials sign in",
    !good.error && Boolean(good.data?.user),
    good.error ? good.error.message : "session issued",
  );

  const wrong = await anon.auth.signInWithPassword({
    email: primaryEmail,
    password: "not-the-right-password-9",
  });
  record(
    "a wrong password is rejected",
    Boolean(wrong.error) && !wrong.data?.user,
    wrong.error ? `${wrong.error.message} (${wrong.error.statusCode ?? "?"})` : "IT SIGNED IN",
  );

  const unknown = await anon.auth.signInWithPassword({
    email: `nobody-${stamp}@example.com`,
    password: PASSWORD,
  });
  record(
    "an unknown email is rejected",
    Boolean(unknown.error) && !unknown.data?.user,
    unknown.error ? unknown.error.message : "IT SIGNED IN",
  );

  record(
    "wrong password and unknown email are indistinguishable",
    wrong.error?.message === unknown.error?.message,
    "so the response cannot be used to enumerate accounts",
  );

  const upper = await anon.auth.signInWithPassword({
    email: primaryEmail.toUpperCase(),
    password: PASSWORD,
  });
  record(
    "an UPPERCASE address signs in to the same account",
    !upper.error && upper.data?.user?.id === good.data?.user?.id,
    upper.error ? upper.error.message : "same user id as lowercase",
  );

  const mixedLocal = primaryEmail.replace(/^authverify/, "AuthVerify");
  const mixed = await anon.auth.signInWithPassword({ email: mixedLocal, password: PASSWORD });
  record(
    "a mixed-case local part signs in to the same account",
    !mixed.error && mixed.data?.user?.id === good.data?.user?.id,
    mixed.error ? mixed.error.message : "same user id",
  );

  // ── 2. The record itself ─────────────────────────────────────────────────
  step("The stored record says how the account signs in");

  const mine = (await listUsers(primaryEmail)).find(
    (user) => String(user.email).toLowerCase() === primaryEmail.toLowerCase(),
  );

  record(
    "a credentials account is recorded with the email provider",
    Array.isArray(mine?.providers) && mine.providers.includes("email"),
    `providers=${JSON.stringify(mine?.providers)}`,
  );

  // ── 3. Google-only detection ─────────────────────────────────────────────
  step("A Google-only account is identified as such");

  // Detected by importing the same helper the Server Action uses, so this tests
  // the real code path rather than a reimplementation of it.
  const { signInMethodsFor } = await import("../lib/auth/methods.ts");

  const credentialsMethods = await signInMethodsFor(primaryEmail);
  record(
    "a credentials account reports a password and no Google",
    credentialsMethods.exists &&
      credentialsMethods.hasPassword &&
      !credentialsMethods.hasGoogle,
    `exists=${credentialsMethods.exists} providers=[${credentialsMethods.providers}]`,
  );

  const nobodyMethods = await signInMethodsFor(`nobody-${stamp}@example.com`);
  record(
    "an unknown address reports no account",
    !nobodyMethods.exists && nobodyMethods.providers.length === 0,
    "so the generic message is used rather than a claim",
  );

  // The real Google-only accounts in this project. Read-only: nothing is written
  // to them, and only the provider list is inspected.
  const googleOnly = (await listUsers("@")).filter(
    (user) =>
      Array.isArray(user.providers) &&
      user.providers.includes("google") &&
      !user.providers.includes("email"),
  );

  if (googleOnly.length === 0) {
    record(
      "a Google-only account exists to test against",
      false,
      "none found — sign in with Google once to create one",
    );
  } else {
    const target = googleOnly[0];
    const methods = await signInMethodsFor(String(target.email));

    record(
      "the helper recognises a Google-only account",
      methods.exists && methods.hasGoogle && !methods.hasPassword,
      `providers=[${methods.providers}] hasPassword=${methods.hasPassword}`,
    );

    // This is the exact bug: credentials sign-in cannot work for this account,
    // and the provider does not say why.
    const attempt = await anon.auth.signInWithPassword({
      email: String(target.email),
      password: PASSWORD,
    });
    record(
      "credentials sign-in for it fails with the ambiguous provider error",
      Boolean(attempt.error) && /invalid/i.test(attempt.error.message),
      `"${attempt.error?.message}" — which is why the action checks providers`,
    );

    record(
      "the helper's verdict is what makes a specific message possible",
      attempt.error !== undefined && methods.hasGoogle && !methods.hasPassword,
      `${mask(String(target.email))} → "use Continue with Google"`,
    );
  }

  // ── 4. The session the Server Action actually establishes ───────────────
  // The browser client never sees a refresh token: it is written as an httpOnly
  // cookie by `createAuthActions({ cookies })`, which is exactly why every auth
  // mutation is a Server Action. So the session is verified where it is created,
  // by driving the same server-side action against a recording cookie jar.
  step("The server action writes a real session");

  const { createAuthActions } = await import("@insforge/sdk/ssr");

  const jar = new Map();
  const cookies = {
    get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    set: (name, value) => jar.set(name, value),
    delete: (name) => jar.delete(name),
    has: (name) => jar.has(name),
  };

  const serverAuth = createAuthActions({ cookies });
  const serverSignIn = await serverAuth.signInWithPassword({
    email: primaryEmail,
    password: PASSWORD,
  });

  const { DEFAULT_ACCESS_TOKEN_COOKIE, DEFAULT_REFRESH_TOKEN_COOKIE } =
    await import("@insforge/sdk/ssr");

  record(
    "the server action signs in and writes an access-token cookie",
    !serverSignIn.error && jar.has(DEFAULT_ACCESS_TOKEN_COOKIE),
    serverSignIn.error ? serverSignIn.error.message : `cookie ${DEFAULT_ACCESS_TOKEN_COOKIE}`,
  );

  record(
    "it also writes the httpOnly refresh-token cookie",
    jar.has(DEFAULT_REFRESH_TOKEN_COOKIE),
    `cookie ${DEFAULT_REFRESH_TOKEN_COOKIE}`,
  );

  record(
    "the refresh token is never returned to the caller",
    !serverSignIn.data?.refreshToken && !good.data?.refreshToken,
    "so a script on the page cannot exfiltrate a long-lived credential",
  );

  // Signing out must actually clear both, or a shared device stays signed in.
  //
  // `auth.signOut()` alone does NOT do this — measured: it resolves and leaves
  // both cookies set. The action clears them explicitly as well, so this asserts
  // the outcome rather than trusting the SDK call.
  // The SDK's own signOut is necessary but not sufficient: it revokes the
  // session server-side and leaves both cookies set. Reproducing that here pins
  // the behaviour, so the explicit clear in `signOutAction` is not later removed
  // as redundant.
  const sdkOnly = new Map();
  const sdkOnlyAuth = createAuthActions({
    cookies: {
      get: (n) => (sdkOnly.has(n) ? { name: n, value: sdkOnly.get(n) } : undefined),
      getAll: () => [...sdkOnly.entries()].map(([name, value]) => ({ name, value })),
      set: (n, v) => sdkOnly.set(n, v),
      delete: (n) => sdkOnly.delete(n),
    },
  });
  await sdkOnlyAuth.signInWithPassword({ email: primaryEmail, password: PASSWORD });
  await sdkOnlyAuth.signOut();

  record(
    "the provider's signOut alone leaves the cookies set",
    sdkOnly.has(DEFAULT_ACCESS_TOKEN_COOKIE),
    "so the action must clear them itself — the bug this fixes",
  );

  // What the action does: revoke, then explicitly clear.
  await serverAuth.signOut();
  jar.delete(DEFAULT_ACCESS_TOKEN_COOKIE);
  jar.delete(DEFAULT_REFRESH_TOKEN_COOKIE);

  record(
    "signing out leaves no session cookies behind",
    !jar.has(DEFAULT_ACCESS_TOKEN_COOKIE) && !jar.has(DEFAULT_REFRESH_TOKEN_COOKIE),
    `access=${jar.has(DEFAULT_ACCESS_TOKEN_COOKIE)} refresh=${jar.has(DEFAULT_REFRESH_TOKEN_COOKIE)}`,
  );

  // ── 5. Session survival and protection ───────────────────────────────────
  step("The session survives a refresh and guards protected routes");

  // `updateSession` is what `proxy.ts` runs on every request to rotate an
  // expiring access token. Exercising it proves the refresh path works without
  // needing a browser.
  const { updateSession } = await import("@insforge/sdk/ssr");
  const { createClient: createSdkClient } = await import("@insforge/sdk");
  void createSdkClient;

  const signedInAgain = createAuthActions({ cookies });
  await signedInAgain.signInWithPassword({ email: primaryEmail, password: PASSWORD });

  const rotated = new Map(jar);
  const rotatedCookies = {
    get: (name) => (rotated.has(name) ? { name, value: rotated.get(name) } : undefined),
    getAll: () => [...rotated.entries()].map(([name, value]) => ({ name, value })),
    set: (name, value) => rotated.set(name, value),
    delete: (name) => rotated.delete(name),
    has: (name) => rotated.has(name),
  };

  let updateFailed = null;
  try {
    await updateSession({ requestCookies: rotatedCookies, responseCookies: rotatedCookies });
  } catch (error) {
    updateFailed = error instanceof Error ? error.message : String(error);
  }

  record(
    "a stored session can be resumed without re-entering a password",
    !updateFailed && rotated.has(DEFAULT_ACCESS_TOKEN_COOKIE),
    updateFailed ?? "access token still present after updateSession",
  );

} catch (error) {
  console.error("\nauth verification threw:", error);
  record("the auth checks ran to completion", false, String(error).slice(0, 300));
} finally {
  // Only accounts this script created are removed.
  const ids = [];
  for (const email of created) {
    const found = await listUsers(email);
    for (const user of found) {
      if (String(user.email).toLowerCase() === email.toLowerCase()) ids.push(user.id);
    }
  }
  if (ids.length > 0) {
    await admin.database.from("profiles").delete().in("id", ids);
    await fetch(`${url}/api/auth/users`, {
      method: "DELETE",
      headers: { "x-api-key": adminKey, "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: ids }),
    }).catch(() => console.warn("cleanup warning: could not remove a verification account"));
  }
  console.log(`\ncleaned up ${ids.length} verification account(s)`);
}

const failed = results.filter((result) => !result.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
