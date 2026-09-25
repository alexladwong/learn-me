import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAuthActions } from "@insforge/sdk/ssr";
import {
  getAuthenticatedUser,
  ensureProfile,
  type AuthenticatedUser,
} from "@/lib/db/learner";
import { getServerClient } from "@/lib/insforge/server-client";
import type { Profile } from "@/lib/types";

/**
 * Session helpers for Server Components and Server Actions.
 *
 * `requireSession` is the guard every protected page calls. It is deliberately
 * server-side: a client-side check would be cosmetic, and the real enforcement
 * is Row Level Security on every query underneath.
 */

/** The signed-in user, or `null`. Use on pages that render for both states. */
export async function getSession(): Promise<AuthenticatedUser | null> {
  const client = await getServerClient();
  return getAuthenticatedUser(client);
}

/**
 * The signed-in user, redirecting to sign-in when absent.
 *
 * `next` is preserved so the learner lands where they intended after signing in.
 */
export async function requireSession(nextPath?: string): Promise<AuthenticatedUser> {
  const user = await getSession();
  if (user) return user;

  const target = nextPath
    ? `/sign-in?next=${encodeURIComponent(nextPath)}`
    : "/sign-in";
  redirect(target);
}

/** The learner's profile, provisioning it if the signup trigger has not landed. */
export async function requireProfile(): Promise<{
  user: AuthenticatedUser;
  profile: Profile;
}> {
  const user = await requireSession();
  const client = await getServerClient();
  const profile = await ensureProfile(client, user);

  // A learner who has not finished onboarding is sent there from the app shell
  // rather than here, so this helper stays usable from onboarding itself.
  return { user, profile };
}

/**
 * Auth mutations.
 *
 * These must run where cookies can be written, which is why they live in Server
 * Actions. `createAuthActions` owns the cookie names and the expiry derived from
 * each JWT, so the app never hand-rolls cookie lifetimes.
 */
export async function authActions() {
  return createAuthActions({ cookies: await cookies() });
}

/**
 * Only allow same-origin, absolute-path redirects.
 *
 * Without this, `?next=https://evil.example` turns the sign-in page into an open
 * redirect that lends this app's domain to a phishing link.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
}
