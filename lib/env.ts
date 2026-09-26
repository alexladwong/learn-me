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

/** The only place a development origin is ever assumed. */
const DEVELOPMENT_ORIGIN = "http://localhost:3000";

/**
 * The canonical public origin of this app.
 *
 * Used **only** where something outside the request genuinely needs a stable
 * absolute URL: the OAuth `redirectTo` that InsForge allowlists, and metadata.
 * Internal navigation never calls this — a relative path does not need to know
 * the deployment domain, and hardcoding one is what breaks on preview builds.
 *
 * ## Why this is strict rather than forgiving
 *
 * It used to be `process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"`,
 * and `.env.local` was found holding
 * `http://localhost:3000,https://learn-me-01.vercel.app` — two origins
 * comma-joined into one value. Every caller did `new URL(..., appUrl())`, so the
 * failure surfaced as `Invalid URL` from inside an OAuth redirect: a confusing
 * error a long way from its cause.
 *
 * So a malformed value now fails here, naming the value, and production never
 * falls back to localhost. A crash at startup with a clear message is strictly
 * better than a working-looking app whose sign-in is silently broken.
 */
export function appUrl(): string {
  return resolveAppOrigin(process.env.NEXT_PUBLIC_APP_URL, {
    /*
     * Strictness keys off *being deployed*, not off `NODE_ENV`.
     *
     * `next build` sets NODE_ENV=production on a developer's laptop too, so
     * keying off it made `npm run build` fail locally — which would train
     * everyone to set a fake production URL just to build. `VERCEL_ENV` is the
     * hosting platform's own answer to "is this a real deployment", and
     * `APP_ORIGIN_STRICT=1` covers any other host.
     */
    deployed:
      process.env.VERCEL_ENV === "production" ||
      process.env.APP_ORIGIN_STRICT === "1",
  });
}

/**
 * The decision itself, with no globals read.
 *
 * Separated so every case that matters — a preview hostname, a custom domain, the
 * comma-joined value that actually happened, localhost in a production build —
 * can be asserted directly instead of by mutating `process.env` around a test.
 */
export function resolveAppOrigin(
  value: string | undefined,
  options: { deployed: boolean },
): string {
  const { deployed } = options;
  const raw = value?.trim();

  if (raw) {
    // A comma means someone listed several origins. Only one can be canonical.
    if (raw.includes(",")) {
      throw new Error(
        `NEXT_PUBLIC_APP_URL must be a single origin, but it contains a comma: ` +
          `${JSON.stringify(raw)}. Keep exactly one — the others belong in ` +
          `InsForge's allowed redirect URLs, not here.`,
      );
    }

    const origin = raw.replace(/\/+$/, "");

    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(
        `NEXT_PUBLIC_APP_URL is not an absolute URL: ${JSON.stringify(raw)}. ` +
          `Expected something like https://learn-me-01.vercel.app`,
      );
    }

    /*
     * Only http(s) can serve a web app. This is not pedantry: `new URL(
     * "learnme://auth/callback")` parses happily, with `origin === "null"`, so
     * without this check the native deep-link scheme would pass validation and
     * then produce "null/api/auth/callback" as an OAuth redirect.
     */
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(
        `NEXT_PUBLIC_APP_URL must be an http(s) origin, got ${parsed.protocol}//. ` +
          `The native callback (learnme://auth/callback) is a deep link, not the web origin.`,
      );
    }

    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(
      parsed.hostname,
    );
    if (deployed && isLocal) {
      throw new Error(
        `NEXT_PUBLIC_APP_URL points at ${parsed.hostname} in a production build. ` +
          `Set it to the public origin — an absolute localhost URL reaches no ` +
          `learner and is rejected by OAuth providers.`,
      );
    }

    return origin;
  }

  if (deployed) {
    throw new Error(
      "Missing NEXT_PUBLIC_APP_URL. A deployment needs the public origin for " +
        "OAuth redirects; set it to e.g. https://learn-me-01.vercel.app",
    );
  }

  return DEVELOPMENT_ORIGIN;
}

/**
 * The origin that actually served this request.
 *
 * Preferred over `appUrl()` inside Route Handlers, because a Vercel **preview**
 * deployment has its own hostname and should redirect back to itself rather than
 * to production. Reading the framework's request URL handles forwarded headers
 * for us; this does not parse `x-forwarded-*` by hand.
 *
 * Falls back to the canonical origin only when the request carries no usable
 * URL, which is the one case where a stable value is the right answer.
 */
export function requestOrigin(request: { nextUrl: URL }): string {
  try {
    const origin = request.nextUrl.origin;
    if (origin && origin !== "null") return origin;
  } catch {
    // Fall through to the canonical origin below.
  }
  return appUrl();
}
