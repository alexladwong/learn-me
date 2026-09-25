import { createRefreshAuthRouter } from "@insforge/sdk/ssr";

/**
 * Session refresh endpoint.
 *
 * The browser client calls this when its access token is missing or expiring.
 * The refresh token itself stays httpOnly, so rotation happens entirely on the
 * server and a compromised script cannot exfiltrate a long-lived credential.
 */
export const { POST } = createRefreshAuthRouter();
