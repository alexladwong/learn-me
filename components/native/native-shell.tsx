"use client";

import { useEffect } from "react";

/**
 * The native shell's behaviour.
 *
 * Everything here is guarded by `Capacitor.isNativePlatform()`, so the same build
 * runs unchanged in a browser: on the web this component mounts and does nothing.
 * That is deliberate — a native build and a web build should share one codebase,
 * and a `NEXT_PUBLIC_IS_NATIVE` branch scattered through the UI would guarantee
 * they drift.
 *
 * ## What each piece does, and why it is not decoration
 *
 *   - **Status bar** follows the app's own theme. The app has a light and a dark
 *     appearance stored under `learn-me:theme`; without this the status bar stays
 *     one colour and the app looks broken against the other theme.
 *   - **Back button** (Android) is real: a webview with no handler exits the app
 *     from any screen. This closes the app only from the app's own root, and
 *     otherwise walks back through the history the learner actually built.
 *   - **Connectivity** is reported to the existing offline handling rather than
 *     inventing a second one. The service worker already serves `/offline`; this
 *     adds the `online`/`offline` signal a webview otherwise does not give
 *     reliably.
 *   - **Deep links** are wired to a single handler so the OAuth return path has
 *     somewhere to land once the server side exists — see the note below.
 *
 * ## Sign-in inside the shell is NOT finished, and this is the reason
 *
 * Google refuses OAuth in an embedded webview (`disallowed_useragent`). The
 * sanctioned route is `@capacitor/browser`, which opens the OS browser — but that
 * browser has its **own cookie jar**, and this app's PKCE flow keeps the code
 * verifier in a cookie (`insforge_code_verifier`, set in
 * `app/api/auth/callback/route.ts`). Opening sign-in externally therefore loses
 * the verifier and the exchange fails.
 *
 * Completing it needs a server change, not a plugin: the callback has to accept
 * the verifier (or a one-time token standing in for it) as a query parameter and
 * finish by redirecting to a custom scheme — `learnme://auth/callback?…` — which
 * `appUrlOpen` below picks up. That touches the authentication flow, so it is
 * left visible and undone rather than half-built. Until then the shell loads the
 * app and everything except Google sign-in works; a learner who is already signed
 * in on the web stays signed in, because the webview and the browser share the
 * same cookie domain only when the shell is pointed at the same origin.
 */
export function NativeShell() {
  useEffect(() => {
    let disposers: Array<() => void> = [];

    void (async () => {
      // Imported dynamically: none of these packages is meaningful in a browser
      // tab, and pulling them into the web bundle would ship dead code.
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      const [{ App }, { StatusBar, Style }, { Network }, { Haptics, ImpactStyle }] =
        await Promise.all([
          import("@capacitor/app"),
          import("@capacitor/status-bar"),
          import("@capacitor/network"),
          import("@capacitor/haptics"),
        ]);

      /** The app's stored appearance, so the status bar matches the page. */
      const applyStatusBar = async () => {
        const dark =
          document.documentElement.dataset.theme === "dark" ||
          (document.documentElement.dataset.theme !== "light" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
        try {
          await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
        } catch {
          // A device without a status bar is not an error worth surfacing.
        }
      };

      await applyStatusBar();
      // The theme toggle writes `data-theme`; observing the attribute is how the
      // status bar learns about a change without the two components knowing
      // about each other.
      const observer = new MutationObserver(() => void applyStatusBar());
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      disposers.push(() => observer.disconnect());

      // Android hardware back: close from the root, otherwise go back.
      const backListener = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else void App.exitApp();
      });
      disposers.push(() => void backListener.remove());

      /*
       * The OAuth return path.
       *
       * Everything about this handler is a check, because a custom scheme can be
       * opened by any app on the device or by a link on a web page. It accepts
       * one exact shape — `learnme://auth/callback?insforge_code=…` — and does
       * nothing at all for anything else.
       *
       * The code is exchanged server-side against the single-use `requestId` held
       * in sessionStorage. This handler never sees the verifier and never handles
       * a token; a stolen deep link is worthless without the matching request.
       */
      const urlListener = await App.addListener("appUrlOpen", async ({ url }) => {
        try {
          const incoming = new URL(url);

          // Exact scheme, host and path. Not a prefix match: `learnme://auth/`
          // must not be enough, and neither must a path that merely starts right.
          if (incoming.protocol !== "learnme:") return;
          if (incoming.host !== "auth") return;
          if (incoming.pathname.replace(/\/$/, "") !== "/callback") return;

          const code = incoming.searchParams.get("insforge_code");
          if (!code) {
            // The provider reported a refusal rather than a code.
            window.location.replace("/sign-in?error=Google%20sign-in%20was%20cancelled.");
            return;
          }

          const { completeNativeSignIn } = await import("@/lib/auth/native-client");
          const { Browser } = await import("@capacitor/browser");

          // The system browser has done its job; leaving it open would strand the
          // learner on a Google page after they are already signed in.
          try {
            await Browser.close();
          } catch {
            // Already closed, or never opened. Not a failure.
          }

          const result = await completeNativeSignIn(code);
          // The destination is the server's — the same function the web flow
          // uses. A returning learner goes to their dashboard, not to language
          // selection.
          window.location.replace(
            result.ok
              ? result.destination
              : `/sign-in?error=${encodeURIComponent(result.error)}`,
          );
        } catch {
          // A malformed deep link is ignored rather than navigated to.
        }
      });
      disposers.push(() => void urlListener.remove());

      const networkListener = await Network.addListener(
        "networkStatusChange",
        ({ connected }) => {
          document.documentElement.dataset.connection = connected
            ? "online"
            : "offline";
        },
      );
      disposers.push(() => void networkListener.remove());

      /*
       * Haptics are wired to the answer feedback the lesson player already
       * renders, rather than to new UI: the element carries `data-haptic`, so the
       * player stays unaware of the shell and the shell stays unaware of the
       * exercise types.
       */
      const hapticHandler = (event: Event) => {
        const target = (event.target as HTMLElement | null)?.closest?.("[data-haptic]");
        if (!target) return;
        const kind = target.getAttribute("data-haptic");
        void Haptics.impact({
          style: kind === "correct" ? ImpactStyle.Light : ImpactStyle.Medium,
        });
      };
      document.addEventListener("click", hapticHandler, true);
      disposers.push(() => document.removeEventListener("click", hapticHandler, true));
    })();

    return () => {
      for (const dispose of disposers) dispose();
      disposers = [];
    };
  }, []);

  return null;
}
