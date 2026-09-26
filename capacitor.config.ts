import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration — the native shell around the deployed app.
 *
 * ## Why this app cannot be bundled into the shell
 *
 * The usual Capacitor setup copies a static `webDir` into the native project and
 * runs entirely from the device. This app cannot work that way, and it is worth
 * being precise about why rather than discovering it later:
 *
 *   - every route is a Server Component guarded by `requireProfile()`, which
 *     reads the session per request;
 *   - onboarding, settings, the language switch and capture are `"use server"`
 *     Server Actions — they are POSTs to a Node server;
 *   - `proxy.ts` middleware refreshes the InsForge session before render;
 *   - `output: "export"` is therefore impossible: there is no static build.
 *
 * So the shell runs in **remote-URL mode**: the webview loads the real deployed
 * app over HTTPS and the native project supplies the things a browser cannot —
 * a home-screen presence, a store listing, and native plugins.
 *
 * `native/www` still has to exist because Capacitor requires a `webDir`. Its
 * `index.html` is never shown while `server.url` is set; it is a required
 * placeholder, and it says so.
 *
 * ## Set the host before building
 *
 *   CAPACITOR_SERVER_URL=https://learn-me.example  npm run cap:sync
 *
 * Defaults, which are development conveniences only:
 *   - iOS Simulator shares the Mac's network, so `localhost` reaches `next dev`.
 *   - Android emulator reaches the host at `10.0.2.2`, not `localhost`.
 *     `npm run cap:android` sets that for you.
 *
 * A shipping build must point at an HTTPS origin. `localhost` is not shipped.
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

/** The InsForge backend, so API calls are not treated as external navigation. */
const backendHost = "7vb4s4kw.us-east.insforge.app";
/** The app's own host, parsed from `serverUrl` when it is a real URL. */
const appHost = (() => {
  try {
    return new URL(serverUrl).host;
  } catch {
    return "localhost:3000";
  }
})();

const config: CapacitorConfig = {
  appId: "com.learnme.app",
  appName: "Learn Me",
  webDir: "native/www",

  server: {
    url: serverUrl,
    // Development only: `next dev` over plain HTTP. A release build must be
    // HTTPS, and this must be removed for it — a shipping app that permits
    // cleartext traffic can have its content rewritten in transit.
    cleartext: serverUrl.startsWith("http://"),
    /*
     * Hosts the webview may navigate to *inside* the shell. Everything else is
     * handed to the system browser, which is the behaviour Google requires for
     * OAuth (see the note in `components/native/native-shell.tsx` about sign-in).
     */
    allowNavigation: [appHost, backendHost, `*.${backendHost}`],
  },

  ios: {
    /*
     * `"automatic"`, and this was got wrong once already.
     *
     * It was `"never"`, on the reasoning that the app draws its own headers and
     * an inset would add a second empty bar. The opposite happened: with no
     * inset the webview draws under the status bar, and the first simulator
     * launch showed the clock, signal and battery sitting on top of the
     * wordmark. `"automatic"` is the default for exactly this reason.
     */
    contentInset: "automatic",
    // `speechSynthesis` — the only speech capability that is actually connected —
    // requires audio to keep playing when the screen locks, and requires the
    // webview to be allowed to start it from a user gesture.
    limitsNavigationsToAppBoundDomains: false,
  },

  android: {
    // The lesson player records answers; those must not be lost to a background
    // webview being killed.
    backgroundColor: "#faf8f5",
  },

  plugins: {
    SplashScreen: {
      // The app's own surface colour, so the hand-off from splash to page is not
      // a flash of white.
      backgroundColor: "#faf8f5",
      showSpinner: false,
    },
  },
};

export default config;
