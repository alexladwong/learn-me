"use client";

import { createBrowserClient } from "@insforge/sdk/ssr";
import type { InsForgeClient } from "@insforge/sdk";

type BrowserClient = ReturnType<typeof createBrowserClient>;

let cached: BrowserClient | undefined;

/**
 * Browser InsForge client.
 *
 * Reads the browser-visible `insforge_access_token` cookie and refreshes
 * through `/api/auth/refresh` when it is missing or expired, so Storage and
 * Realtime calls stay authenticated without the refresh token ever leaving the
 * server.
 *
 * Its auth surface is intentionally read-only (`getCurrentUser`, `getProfile`):
 * all auth mutations go through Server Actions so cookies are written where
 * they cannot be tampered with. Cached because re-creating the client would
 * drop Realtime connections.
 */
export function getBrowserClient(): BrowserClient {
  cached ??= createBrowserClient();
  return cached;
}

/**
 * Re-exported for callers that need the plain SDK type.
 * Using this instead of `ReturnType` keeps imports readable in components.
 */
export type { InsForgeClient };
