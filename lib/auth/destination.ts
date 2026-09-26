import type { InsForgeClient } from "@insforge/sdk";
import { getActiveLanguage } from "@/lib/db/learner";

/**
 * Where a learner belongs immediately after signing in.
 *
 * One source of truth, because there are now three ways in — the web OAuth
 * callback, the password form, and the native shell's deep link — and they had
 * already started to drift. The native flow was about to hardcode
 * `window.location.replace("/languages")`, which would have sent a returning
 * learner straight back to language selection every time they signed in on a
 * phone.
 *
 * The order is deliberate:
 *   1. no language at all → the picker, because nothing else is reachable
 *   2. a language without a plan → onboarding for that language
 *   3. a language with a plan → its dashboard
 */
export async function postAuthDestination(client: InsForgeClient): Promise<string> {
  const active = await getActiveLanguage(client);

  if (!active) return "/languages";
  return active.onboarded ? `/${active.code}` : `/${active.code}/onboarding`;
}
