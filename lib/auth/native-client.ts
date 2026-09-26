"use client";

/**
 * The WebView's side of the native sign-in flow.
 *
 * Separate from `lib/auth/native.ts`, which is server-only and holds the
 * verifier. Nothing here can see it.
 *
 * ## Where the pending request id lives
 *
 * In `sessionStorage`, and nowhere else. It is needed for exactly one thing —
 * matching the deep link that comes back to the sign-in that started it — and it
 * is meaningless once used. Writing it to `localStorage` would leave a stale id
 * on the device after a failed attempt, which is the kind of leftover that
 * eventually gets treated as a credential.
 *
 * If it is missing when the deep link arrives (the app was killed mid-flow,
 * storage was cleared), the exchange is simply refused and the learner is asked
 * to try again. That is the correct outcome: without it there is nothing binding
 * the callback to this device.
 */

const PENDING_KEY = "learnme:native-auth-request";

export type NativeSignInResult =
  | { ok: true; destination: string }
  | { ok: false; error: string };

/** True only inside the Capacitor shell, never in a browser tab. */
export async function isNativeShell(): Promise<boolean> {
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.isNativePlatform();
}

export function rememberPendingRequest(requestId: string): void {
  try {
    window.sessionStorage.setItem(PENDING_KEY, requestId);
  } catch {
    // Private mode with storage disabled: the flow still works if the app stays
    // alive, and the deep link will be refused rather than mismatched if it dies.
  }
}

export function takePendingRequest(): string | null {
  try {
    const value = window.sessionStorage.getItem(PENDING_KEY);
    window.sessionStorage.removeItem(PENDING_KEY);
    return value;
  } catch {
    return null;
  }
}

async function platform(): Promise<"ios" | "android"> {
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.getPlatform() === "android" ? "android" : "ios";
}

/**
 * Start the flow: ask the server for a Google URL, then open it in the system
 * browser.
 *
 * The system browser is not a preference. Google refuses OAuth inside a WebView
 * (`disallowed_useragent`), and `Browser.open` is the sanctioned way out of it —
 * on iOS it is `ASWebAuthenticationSession`, on Android a Chrome Custom Tab.
 */
export async function beginNativeSignIn(): Promise<{ error: string } | { url: string }> {
  const { Browser } = await import("@capacitor/browser");

  const response = await fetch("/api/auth/native/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform: await platform() }),
  });

  const body = (await response.json().catch(() => null)) as
    | { url?: string; requestId?: string; error?: string }
    | null;

  if (!response.ok || !body?.url || !body.requestId) {
    return { error: body?.error ?? "Could not start sign-in." };
  }

  rememberPendingRequest(body.requestId);
  await Browser.open({ url: body.url, presentationStyle: "popover" });

  return { url: body.url };
}

/** Complete the flow from the deep link the OS hands back to the app. */
export async function completeNativeSignIn(
  insforgeCode: string,
): Promise<NativeSignInResult> {
  const requestId = takePendingRequest();
  if (!requestId) {
    return {
      ok: false,
      error: "That sign-in attempt has expired. Please try again.",
    };
  }

  const response = await fetch("/api/auth/native/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, insforgeCode }),
  });

  const body = (await response.json().catch(() => null)) as
    | { ok?: boolean; destination?: string; error?: string }
    | null;

  if (!response.ok || !body?.ok) {
    return { ok: false, error: body?.error ?? "Could not complete sign-in." };
  }

  return { ok: true, destination: body.destination ?? "/languages" };
}
