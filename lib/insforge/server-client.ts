import { cookies } from "next/headers";
import { createServerClient } from "@insforge/sdk/ssr";
import type { InsForgeClient } from "@insforge/sdk";
import {
  DEFAULT_ACCESS_TOKEN_COOKIE,
  DEFAULT_REFRESH_TOKEN_COOKIE,
} from "@insforge/sdk/ssr";
import { insforgeAnonKey, insforgeUrl } from "@/lib/env";

/**
 * Per-request InsForge client for Server Components, Server Actions and Route
 * Handlers.
 *
 * It reads the access-token cookie set by `createAuthActions` and passes it as
 * a bearer token, so every query runs as this learner and Row Level Security
 * decides what they can see. The refresh token stays httpOnly and is never
 * exposed here.
 *
 * Callers must ensure `proxy.ts` ran first (`updateSession`), so the access
 * token is fresh rather than expired.
 */
export async function getServerClient(): Promise<InsForgeClient> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(DEFAULT_ACCESS_TOKEN_COOKIE)?.value;

  return createServerClient({
    baseUrl: insforgeUrl(),
    anonKey: insforgeAnonKey(),
    accessToken,
  });
}

/** True when a session cookie is present. Cheap check; does not validate it. */
export async function hasSessionCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  return Boolean(
    cookieStore.get(DEFAULT_ACCESS_TOKEN_COOKIE)?.value ||
      cookieStore.get(DEFAULT_REFRESH_TOKEN_COOKIE)?.value,
  );
}
