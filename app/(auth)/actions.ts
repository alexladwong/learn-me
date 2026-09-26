"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAuthActions } from "@insforge/sdk/ssr";
import {
  DEFAULT_ACCESS_TOKEN_COOKIE,
  DEFAULT_REFRESH_TOKEN_COOKIE,
} from "@insforge/sdk/ssr";
import { oauthCallbackOrigin } from "@/lib/env";
import { safeNextPath } from "@/lib/auth/session";
import { signInMethodsFor } from "@/lib/auth/methods";
import { userFacingMessage } from "@/lib/errors";

/**
 * Authentication Server Actions.
 *
 * Everything that establishes or clears a session runs here, on the server,
 * because that is the only place the httpOnly refresh token can be written.
 * Client Components submit to these actions; they never call auth mutations
 * directly.
 */

export type AuthFormState = { error: string | null };

const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .email("That does not look like an email address");

/**
 * Mirrors the backend password policy in `insforge.toml` (`min_length = 8`).
 * Kept in sync deliberately: validating here produces a readable message
 * instead of a raw 400 from the auth service.
 */
const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Passwords cannot be longer than 72 characters");

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Turn a provider error into something a learner can act on.
 *
 * The default for a rejected credential is deliberately generic ("unable to sign
 * in…"), because distinguishing "no such account" from "wrong password" tells an
 * attacker which addresses are registered. The one case worth being specific
 * about is an account that has no password at all, and that specificity is added
 * by the caller only after it has confirmed the provider list — see
 * `signInAction`.
 *
 * The raw cause is logged server-side so this stays debuggable without being
 * readable from the browser.
 */
function messageFor(error: { message?: string; error?: string } | null): string {
  const raw = error?.message ?? error?.error ?? "";
  const lower = raw.toLowerCase();

  if (lower.includes("invalid") && lower.includes("credential")) {
    return "Unable to sign in with those credentials.";
  }
  if (lower.includes("already") || lower.includes("exists")) {
    return "An account with that email already exists. Try signing in instead.";
  }
  if (lower.includes("disabled") || lower.includes("not enabled")) {
    return "That sign-in method is not enabled for this project yet.";
  }
  if (lower.includes("rate") || lower.includes("too many")) {
    return "Too many attempts. Wait a moment and try again.";
  }

  return raw || "Something went wrong. Please try again.";
}

/** Whether a provider error means "this credential was rejected". */
function isBadCredential(error: { message?: string; error?: string } | null): boolean {
  const lower = (error?.message ?? error?.error ?? "").toLowerCase();
  return lower.includes("invalid") && lower.includes("credential");
}

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = emailSchema.safeParse(field(formData, "email"));
  if (!email.success) {
    return { error: userFacingMessage(email.error.issues[0]?.message, "Enter your email address") };
  }

  const password = field(formData, "password");
  if (!password) return { error: "Enter your password" };

  const auth = createAuthActions({ cookies: await cookies() });
  const { data, error } = await auth.signInWithPassword({
    email: email.data,
    password,
  });

  if (error || !data?.user) {
    // A rejected credential is ambiguous: the password may be wrong, or the
    // account may not have a password at all because it was created with Google.
    // The provider confirms that, it never confirms a password — the record has
    // no password field to read.
    if (isBadCredential(error)) {
      const methods = await signInMethodsFor(email.data);

      if (methods.exists && methods.hasGoogle && !methods.hasPassword) {
        // Safe to be specific: the learner has already demonstrated they know the
        // address, and without this they would loop on a form that cannot work.
        console.warn("[auth] credentials rejected: account is Google-only");
        return {
          error:
            "This account signs in with Google. Use “Continue with Google” below.",
        };
      }

      console.warn("[auth] credentials rejected", {
        // Never the address itself, and never the password.
        accountExists: methods.exists,
        providers: methods.providers.join(",") || "none",
      });
    }

    return { error: messageFor(error) };
  }

  redirect(safeNextPath(field(formData, "next")) ?? "/languages");
}

export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = emailSchema.safeParse(field(formData, "email"));
  if (!email.success) {
    return { error: userFacingMessage(email.error.issues[0]?.message, "Enter your email address") };
  }

  const password = passwordSchema.safeParse(field(formData, "password"));
  if (!password.success) {
    return { error: userFacingMessage(password.error.issues[0]?.message, "Choose a password") };
  }

  const name = field(formData, "name").trim();

  const auth = createAuthActions({ cookies: await cookies() });
  const { data, error } = await auth.signUp({
    email: email.data,
    password: password.data,
    ...(name ? { name } : {}),
  });

  if (error) {
    // "An account with that email already exists" is true but not actionable:
    // when that account was created with Google, "sign in instead" means the
    // Google button, not the form directly below this message.
    const lower = (error.message ?? error.error ?? "").toLowerCase();
    if (lower.includes("already") || lower.includes("exists")) {
      const methods = await signInMethodsFor(email.data);

      if (methods.exists && methods.hasGoogle && !methods.hasPassword) {
        console.warn("[auth] signup blocked: account is Google-only");
        return {
          error: "That email already has an account. Use “Continue with Google” below.",
        };
      }
    }

    return { error: messageFor(error) };
  }

  // Email verification is disabled while SMTP is unconfigured, so a successful
  // signup is immediately usable. `SafeAuthAction` deliberately strips the token
  // fields from the returned data, so the presence of a user is the signal that
  // the account was created; the session cookies were written by the action.
  if (data?.user) {
    redirect("/languages");
  }

  redirect("/sign-in?created=1");
}

/**
 * End the session.
 *
 * `auth.signOut()` revokes the session server-side but **does not remove the
 * cookies** — measured, not assumed: it resolves successfully and leaves both
 * `insforge_access_token` and `insforge_refresh_token` set. Relying on it alone
 * therefore left a signed-out browser still holding a valid session, which on a
 * shared device or a borrowed laptop is the whole problem. The cookies are
 * cleared here explicitly as well, so "sign out" actually means signed out.
 */
export type SignOutResult = { ok: true } | { ok: false; error: string };

/**
 * End the session.
 *
 * ## Why this returns a result instead of calling `redirect()`
 *
 * It used to revoke the session, clear the cookies and then `redirect("/")`.
 * That reads well and behaves badly: the redirect is thrown from inside the
 * action, so the client's pending state is only cleared when the navigation
 * completes. Any stall between here and there — a slow revoke, a dropped
 * connection in the Capacitor WebView — left the button on "Signing out…"
 * indefinitely, with no error and no way back.
 *
 * Returning a result puts the caller in charge of what happens next, so it can
 * use try/catch/finally and guarantee the pending state clears either way.
 *
 * ## The session is still really invalidated
 *
 * The cookie deletion below is the part that matters, and it happens on **every**
 * path including failure. `auth.signOut()` revokes the refresh token server-side;
 * if that request fails we still clear the cookies, because leaving a learner
 * signed in on a device they asked to leave is the worse outcome.
 */
export async function signOutAction(): Promise<SignOutResult> {
  const cookieStore = await cookies();
  const auth = createAuthActions({ cookies: cookieStore });

  let revoked = true;
  try {
    await auth.signOut();
  } catch (error) {
    revoked = false;
    // A failed revoke must not leave the learner stuck signed in: fall through
    // and clear the cookies regardless.
    console.error("[auth] sign-out request failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
  }

  try {
    cookieStore.delete(DEFAULT_ACCESS_TOKEN_COOKIE);
    cookieStore.delete(DEFAULT_REFRESH_TOKEN_COOKIE);
    // Written when an OAuth flow starts; clearing it avoids a stale attempt.
    cookieStore.delete("insforge_code_verifier");
  } catch (error) {
    console.error("[auth] clearing session cookies failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, error: "Could not sign out on this device. Please try again." };
  }

  // The cookies are gone either way, so the learner *is* signed out locally.
  // The flag only tells the caller whether the server-side revoke also landed.
  return { ok: true, revoked } as SignOutResult;
}

/**
 * Begin the Google OAuth flow.
 *
 * The PKCE code verifier is stored in an httpOnly cookie and redeemed on the
 * server at `/api/auth/callback`, so the refresh token never passes through the
 * browser.
 */
export async function startOAuthAction(): Promise<AuthFormState> {
  const cookieStore = await cookies();
  const auth = createAuthActions({ cookies: cookieStore });

  const { data, error } = await auth.signInWithOAuth("google", {
    // Derived from the request, so localhost, production and a future custom
    // domain each get their own callback without a code change. The native flow
    // uses `learnme://auth/callback` instead and never comes through here.
    redirectTo: new URL("/api/auth/callback", await oauthCallbackOrigin()).toString(),
    skipBrowserRedirect: true,
  });

  if (error || !data?.url || !data.codeVerifier) {
    return { error: messageFor(error) };
  }

  cookieStore.set("insforge_code_verifier", data.codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  redirect(data.url);
}
