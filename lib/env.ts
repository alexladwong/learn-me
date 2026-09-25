/**
 * Environment access.
 *
 * Centralised so a missing variable fails with one clear message instead of a
 * confusing 401 deep inside a request.
 *
 * Security rule: only values prefixed `NEXT_PUBLIC_` may ever be read in code
 * that can reach the browser. `INSFORGE_API_KEY` is a full-access admin key and
 * must stay inside server-only modules (`lib/insforge/admin.ts`).
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/** Browser-safe InsForge endpoint. */
export function insforgeUrl(): string {
  return required("NEXT_PUBLIC_INSFORGE_URL", process.env.NEXT_PUBLIC_INSFORGE_URL);
}

/** Browser-safe anon key. Access control comes from RLS, not from this key. */
export function insforgeAnonKey(): string {
  return required("NEXT_PUBLIC_INSFORGE_ANON_KEY", process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY);
}

/** Server-only. Bypasses RLS — never import this into a client component. */
export function insforgeAdminKey(): string {
  return required("INSFORGE_API_KEY", process.env.INSFORGE_API_KEY);
}

/**
 * Public origin of this app. Used for OAuth redirect URLs, where a wrong value
 * produces a confusing provider error rather than an obvious failure.
 */
export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
