import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createAuthActions } from "@insforge/sdk/ssr";

/**
 * OAuth callback for the PKCE flow.
 *
 * InsForge appends `?insforge_code=…` to the `redirectTo` URL. The code is
 * exchanged server-side using the verifier cookie set when the flow started,
 * and the resulting session cookies are written straight onto the redirect.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("insforge_code");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    console.warn("[auth] OAuth provider returned an error", { error: oauthError });
    return NextResponse.redirect(
      new URL(`/sign-in?error=${encodeURIComponent("Google sign-in was cancelled or refused.")}`, request.url),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/sign-in?error=Missing%20authorisation%20code.", request.url),
    );
  }

  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get("insforge_code_verifier")?.value;

  if (!codeVerifier) {
    return NextResponse.redirect(
      new URL(
        "/sign-in?error=Your%20sign-in%20session%20expired.%20Please%20try%20again.",
        request.url,
      ),
    );
  }

  const response = NextResponse.redirect(new URL("/languages", request.url));
  const auth = createAuthActions({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });

  const { data, error } = await auth.exchangeOAuthCode(code, codeVerifier);

  if (error || !data?.user) {
    console.error("[auth] OAuth code exchange failed", error);
    return NextResponse.redirect(
      new URL("/sign-in?error=Could%20not%20complete%20sign-in.", request.url),
    );
  }

  response.cookies.delete("insforge_code_verifier");
  return response;
}
