/**
 * Which sign-in methods an email address actually has.
 *
 * Why this exists: InsForge returns the same `Invalid credentials` (401) for a
 * wrong password *and* for an account that has no password at all. An account
 * created with Google has `providers: ["google"]` and no password record, so a
 * learner who signed up with Google and then tries the email/password form gets
 * "that combination is not right" — which is true, unfixable from that form, and
 * gives them no idea that Google is the way in. That is the failure this module
 * diagnoses.
 *
 * It runs **only after a credentials attempt has already failed**, so the normal
 * sign-in path costs nothing extra. It uses the admin client because provider
 * metadata is not readable through the learner-scoped client — and it reads only
 * `providers`, never a password field, which does not exist on the record anyway.
 */

export type SignInMethods = {
  /** True when a record exists for this address. */
  exists: boolean;
  /** e.g. `["google"]` or `["email"]`. Empty when the address is unknown. */
  providers: string[];
  /** The account can sign in with email + password. */
  hasPassword: boolean;
  /** The account can sign in with Google. */
  hasGoogle: boolean;
};

const UNKNOWN: SignInMethods = {
  exists: false,
  providers: [],
  hasPassword: false,
  hasGoogle: false,
};

/**
 * Look up the sign-in methods for an address.
 *
 * Never throws: this is called on the failure path of a sign-in, and a diagnostic
 * that itself fails must not replace the user's actual error with a worse one.
 * An unknown address and a lookup failure both return the "no such account"
 * shape, which is the safe default — it produces the generic message rather than
 * a claim about an account we could not confirm.
 */
export async function signInMethodsFor(email: string): Promise<SignInMethods> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return UNKNOWN;

  try {
    // The API's `search` is a substring match and is **case-sensitive**, so it is
    // only a coarse net; the exact comparison below is what decides.
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_INSFORGE_URL}/api/auth/users?search=${encodeURIComponent(wanted)}`,
      {
        headers: { "x-api-key": process.env.INSFORGE_API_KEY ?? "" },
        cache: "no-store",
      },
    );

    if (!response.ok) return UNKNOWN;

    const body: unknown = await response.json().catch(() => null);
    const container = body as { data?: unknown; users?: unknown } | null;
    const rows = Array.isArray(container?.data)
      ? container.data
      : Array.isArray(container?.users)
        ? container.users
        : Array.isArray(body)
          ? body
          : [];

    const match = rows.find((row) => {
      if (typeof row !== "object" || row === null) return false;
      const candidate = (row as { email?: unknown }).email;
      return typeof candidate === "string" && candidate.trim().toLowerCase() === wanted;
    });

    if (!match) return UNKNOWN;

    const raw = (match as { providers?: unknown }).providers;
    const providers = Array.isArray(raw)
      ? raw.filter((entry): entry is string => typeof entry === "string")
      : [];

    return {
      exists: true,
      providers,
      hasPassword: providers.includes("email"),
      hasGoogle: providers.includes("google"),
    };
  } catch (error) {
    // Logged without the address: this is a transcript-visible log, and which
    // emails have accounts is not something to leave lying around in it.
    console.error("[auth] provider lookup failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return UNKNOWN;
  }
}
