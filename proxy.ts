import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@insforge/sdk/ssr/middleware";
import {
  DEFAULT_ACCESS_TOKEN_COOKIE,
  DEFAULT_REFRESH_TOKEN_COOKIE,
} from "@insforge/sdk/ssr";
import { AUTH_ROUTES, PUBLIC_ROUTES } from "@/lib/constants";

/**
 * Next.js 16 replaced `middleware` with `proxy` (the runtime is always
 * `nodejs`; the `edge` runtime is not available here).
 *
 * Responsibilities, in order:
 *   1. Refresh the InsForge session before Server Components render, so a page
 *      never reads an expired access token.
 *   2. Redirect authenticated learners away from the auth pages.
 *   3. Redirect unauthenticated learners to sign-in, preserving where they were
 *      heading.
 *
 * The cookie check here is a cheap gate, not the security boundary. Every query
 * still runs as the learner under Row Level Security via `getServerClient()`,
 * so a forged cookie gets an empty result rather than someone else's data.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  // Refresh first: the result decides whether we treat the request as signed in.
  await updateSession({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });

  const { pathname, search } = request.nextUrl;
  const isSignedIn = hasSession(request, response);

  const isPublic = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // A signed-in learner has no reason to see sign-in or sign-up.
  if (isSignedIn && isAuthRoute) {
    return redirectTo(new URL("/languages", request.url), response);
  }

  if (!isSignedIn && !isPublic) {
    const next = `${pathname}${search}`;
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", next);
    return redirectTo(signIn, response);
  }

  return response;
}

/**
 * Prefer the freshly-refreshed cookies on the response, falling back to the
 * incoming request cookies — `updateSession` may have cleared them on logout.
 */
function hasSession(request: NextRequest, response: NextResponse): boolean {
  const access =
    response.cookies.get(DEFAULT_ACCESS_TOKEN_COOKIE)?.value ??
    request.cookies.get(DEFAULT_ACCESS_TOKEN_COOKIE)?.value;
  const refresh =
    response.cookies.get(DEFAULT_REFRESH_TOKEN_COOKIE)?.value ??
    request.cookies.get(DEFAULT_REFRESH_TOKEN_COOKIE)?.value;

  return Boolean(access || refresh);
}

/**
 * Carry the refreshed cookies onto the redirect so the browser stores them.
 * Dropping them here would lose the rotation `updateSession` just performed.
 */
function redirectTo(url: URL, response: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  /**
   * Run on page routes only. Excluding static assets, the image optimiser and
   * the auth refresh endpoint keeps the proxy off the hot path — the refresh
   * route must not call itself.
   *
   * `sw.js` and `manifest.webmanifest` must also be excluded. Neither is a page,
   * and both are fetched by the browser with no session and often before sign-in.
   * Redirecting them to `/sign-in` broke the PWA silently: the service worker
   * registration and the manifest both failed, and the only symptom was that
   * offline mode never worked.
   */
  matcher: [
    // `api/auth/callback` is excluded here as well as being public: it must reach
    // its route handler untouched, since that handler is what exchanges the OAuth
    // code and writes the session cookies.
    //
    // `/.well-known/…` is chrome-devtools probing for a workspace mapping. It is
    // not a page, no learner can have a session when it fires, and gating it meant
    // every devtools session produced `GET /sign-in?next=%2F.well-known%2F…`.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.well-known|api/auth/refresh|api/auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|woff2?)$).*)",
  ],
};
