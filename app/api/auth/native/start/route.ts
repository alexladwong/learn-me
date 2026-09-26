import { NextResponse, type NextRequest } from "next/server";
import { parsePlatform, startNativeAuth } from "@/lib/auth/native";

/**
 * Begin a sign-in for the Capacitor shell.
 *
 * POST only, and it deliberately does not require a session — this is the route
 * that creates one. It is safe to expose: all it can do is create a short-lived
 * pending record and hand back a Google URL. It authenticates nobody.
 *
 * The response contains no verifier. `requestId` is the only thing the client
 * holds, and on its own it is useless without the `insforge_code` that only the
 * system browser will receive.
 */
export async function POST(request: NextRequest) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const platform = parsePlatform((body as { platform?: unknown } | null)?.platform);
  if (!platform) {
    return NextResponse.json(
      { error: "platform must be 'ios' or 'android'" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const { url, requestId } = await startNativeAuth(platform);
    return NextResponse.json(
      { url, requestId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    // Logged in full, returned in outline: the message can name an internal URL.
    console.error("[auth] native start failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Could not start sign-in." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
