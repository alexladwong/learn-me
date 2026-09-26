import { NextResponse, type NextRequest } from "next/server";
import { createAuthActions, createServerClient } from "@insforge/sdk/ssr";
import { DEFAULT_ACCESS_TOKEN_COOKIE } from "@insforge/sdk/ssr";
import { consumeNativeAuthRequest } from "@/lib/auth/native";
import { postAuthDestination } from "@/lib/auth/destination";
import { insforgeAnonKey, insforgeUrl } from "@/lib/env";

/** One message for every rejection, so the route cannot be used as an oracle. */
const REJECTED = "That sign-in link is no longer valid. Please try again.";

/**
 * Finish a native sign-in.
 *
 * This is the step that puts the session into the **WebView's** cookie jar: the
 * cookies are written onto this response, and this response is made by the
 * WebView (not the system browser), so they land where the app can use them.
 *
 * Order matters. The request is claimed *before* the code is exchanged, so a
 * replay is refused even if the exchange itself is slow, and a code that fails to
 * exchange still burns its request.
 */
export async function POST(request: NextRequest) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const payload = body as { requestId?: unknown; insforgeCode?: unknown } | null;
  const requestId =
    typeof payload?.requestId === "string" ? payload.requestId.trim() : "";
  const insforgeCode =
    typeof payload?.insforgeCode === "string" ? payload.insforgeCode.trim() : "";

  if (!requestId || !insforgeCode) {
    return NextResponse.json(
      { error: REJECTED },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const claimed = await consumeNativeAuthRequest(requestId);
  if (!claimed.ok) {
    console.warn("[auth] native exchange refused", { reason: claimed.reason });
    return NextResponse.json(
      { error: REJECTED },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const response = NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );

  const auth = createAuthActions({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });

  const { data, error } = await auth.exchangeOAuthCode(
    insforgeCode,
    claimed.codeVerifier,
  );

  if (error || !data?.user) {
    console.error("[auth] native code exchange failed", {
      reason: error?.message ?? "no user returned",
    });
    // The request is already consumed, which is the correct outcome: a code that
    // did not work must not be retryable against the same pending record.
    return NextResponse.json(
      { error: "Could not complete sign-in." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  /*
   * The session cookies are on `response` now. Rather than guess the token out of
   * the SDK's session shape, they are read back from the response that will carry
   * them — so the destination is resolved with exactly the credentials the
   * WebView is about to receive.
   */
  const accessToken = response.cookies.get(DEFAULT_ACCESS_TOKEN_COOKIE)?.value;

  let destination = "/languages";
  if (accessToken) {
    try {
      const client = createServerClient({
        baseUrl: insforgeUrl(),
        anonKey: insforgeAnonKey(),
        accessToken,
      });
      // Shared with the web flow, so native and web cannot disagree about where
      // a learner belongs. A returning learner goes to their dashboard, not back
      // to language selection.
      destination = await postAuthDestination(client);
    } catch (destinationError) {
      console.error("[auth] native destination lookup failed", {
        reason:
          destinationError instanceof Error ? destinationError.message : "unknown",
      });
    }
  }

  return NextResponse.json(
    { ok: true, destination },
    { headers: response.headers },
  );
}
