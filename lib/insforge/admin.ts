import { createAdminClient, type InsForgeClient } from "@insforge/sdk";
import { insforgeAdminKey, insforgeUrl } from "@/lib/env";

/**
 * Privileged InsForge client that bypasses Row Level Security.
 *
 * Safety comes from the environment, not from trust: `insforgeAdminKey()` reads
 * `INSFORGE_API_KEY`, which has no `NEXT_PUBLIC_` prefix, so Next.js never
 * inlines it into a client bundle. Importing this from a Client Component
 * therefore throws at call time instead of shipping the key.
 *
 * Never add this module to a Client Component's import graph.
 *
 * Use it only for operations that legitimately cannot run as the learner:
 *   - publishing/authoring curriculum content
 *   - entitlement fulfilment driven by a verified payment webhook
 *   - scheduled jobs that recompute derived rollups
 *
 * Anything a learner does to their own data must go through `getServerClient()`
 * so RLS is the enforcement point, not application-level filtering.
 */
export function getAdminClient(): InsForgeClient {
  return createAdminClient({
    baseUrl: insforgeUrl(),
    apiKey: insforgeAdminKey(),
  });
}
