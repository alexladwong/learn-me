"use client";

import { useCallback, useState } from "react";
import { signOutAction } from "@/app/(auth)/actions";

/**
 * Signing out, once, correctly.
 *
 * ## Why this is a hook and not a `<form action={…}>`
 *
 * The form version delegated everything to React's form machinery, so the
 * pending state was owned by the framework and only cleared when the action
 * settled. When it did not settle — a slow revoke, a dropped connection in the
 * Capacitor WebView — the button sat on "Signing out…" with no error and no way
 * back. There was nothing to catch and nothing to reset.
 *
 * Owning the flow here means `try`/`catch`/`finally` can guarantee the pending
 * state clears on every path, success or failure.
 *
 * ## What is not negotiable
 *
 * `signOutAction()` is what actually invalidates the session — it revokes the
 * refresh token and deletes the auth cookies server-side. Navigating without
 * calling it would look like a logout and leave the session alive, so the
 * navigation only happens *after* the action reports success.
 */
export function useSignOut() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Clear what this device holds about the learner.
   *
   * The session itself is already gone server-side by the time this runs. This
   * is client residue: a pending native OAuth request id, which would otherwise
   * outlive the session that created it and be matched against a future deep
   * link, and cached responses belonging to the previous learner.
   */
  const clearClientState = useCallback(() => {
    try {
      window.sessionStorage.removeItem("learnme:native-auth-request");
    } catch {
      // Storage disabled; nothing was stored.
    }
    if ("caches" in window) {
      void caches.keys().then((keys) => {
        for (const key of keys) void caches.delete(key);
      });
    }
  }, []);

  const signOut = useCallback(
    async (onSignedOut?: () => void) => {
      setPending(true);
      setError(null);

      try {
        const result = await signOutAction();

        if (!result.ok) {
          // Cookies could not be cleared. Stay put and say so rather than
          // pretending the learner is signed out.
          setError(result.error);
          return;
        }

        clearClientState();
        onSignedOut?.();

        /*
         * A full document navigation, and this is the one place it is right.
         *
         * `router.replace("/")` was tried first and did not settle reliably after
         * the session cookies were cleared — the URL stayed on the authenticated
         * route. `router.refresh()` alongside it made that worse by cancelling the
         * in-flight navigation.
         *
         * More importantly, a client-side transition keeps the whole authenticated
         * React tree, its cached RSC payloads and every piece of in-memory state
         * alive. Signing out is precisely the moment all of that must be
         * discarded, and a document load is the only thing that guarantees it.
         *
         * `replace` rather than `href`, so the authenticated page is not left in
         * the history for Back to find.
         */
        window.location.replace("/");
      } catch {
        // The action never returned: network, a dropped WebView, a 500.
        setError("Could not sign out. Please try again.");
      } finally {
        // The whole point. Whatever happened above, the button becomes usable.
        setPending(false);
      }
    },
    [clearClientState],
  );

  return { signOut, pending, error };
}
