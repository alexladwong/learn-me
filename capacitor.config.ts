import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration — the native shell around the deployed app.
 *
 * ## Why this app cannot be bundled into the shell
 *
 * The usual Capacitor setup copies a static `webDir` into the native project.
 * This app cannot work that way: every route is a Server Component behind
 * `requireProfile()`, onboarding and settings are `"use server"` actions, and
 * `proxy.ts` refreshes the session per request. There is no static build, so the
 * shell runs in **remote-URL mode** and `native/www` is a required placeholder
 * that is never shown.
 *
 * ## The server URL is configuration, not code
 *
 * `CAPACITOR_SERVER_URL` is read here and nowhere else. No host is baked into the
 * app, so moving from `learn-me-01.vercel.app` to a custom domain is an
 * environment change:
 *
 *   Production        CAPACITOR_SERVER_URL=https://learn-me-01.vercel.app
 *   iOS Simulator     http://localhost:3000      (shares the Mac's network)
 *   Android emulator  http://10.0.2.2:3000       (10.0.2.2 is the host)
 *   Physical device   http://<MAC-LAN-IP>:3000
 *
 * `npm run cap:android` supplies the emulator host; everything else is explicit,
 * so a release build cannot silently inherit a development URL.
 */

const rawServerUrl = process.env.CAPACITOR_SERVER_URL?.trim();

/**
 * A release build must be given an explicit HTTPS origin.
 *
 * Capacitor has no "production" flag of its own, so this uses the same signal the
 * Next build does: `NODE_ENV`. Without it, a missing variable would silently fall
 * back to `localhost` and ship an app that loads nothing on a real phone.
 */
const isRelease = process.env.NODE_ENV === "production";

if (isRelease && !rawServerUrl) {
  throw new Error(
    "CAPACITOR_SERVER_URL is required for a release build. Set it to the public " +
      "HTTPS origin, e.g. CAPACITOR_SERVER_URL=https://learn-me-01.vercel.app",
  );
}

const serverUrl = rawServerUrl ?? "http://localhost:3000";

if (isRelease && !serverUrl.startsWith("https://")) {
  throw new Error(
    `CAPACITOR_SERVER_URL must be HTTPS for a release build, got ${JSON.stringify(serverUrl)}. ` +
      "Cleartext traffic lets the app's content be rewritten in transit.",
  );
}

/**
 * Cleartext is permitted **only** for a local development origin, and never in a
 * release. `10.0.2.2` and `localhost` are both plain HTTP by necessity: `next dev`
 * has no certificate and the emulator cannot trust one.
 */
const isLocalDev =
  /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|\[::1\])(:\d+)?$/.test(serverUrl);
const cleartext = isLocalDev && !isRelease;

const host = (() => {
  try {
    return new URL(serverUrl).host;
  } catch {
    return "localhost:3000";
  }
})();

/**
 * Warn when a development origin is being synced.
 *
 * This exists because it already went wrong once: an iOS build was synced with
 * the default `http://localhost:3000` and installed on a **physical iPhone**,
 * where `localhost` is the phone itself. The result was a white screen with no
 * error — the most expensive kind of failure to diagnose. A sync that is about
 * to produce a simulator-only build should say so out loud.
 */
if (isLocalDev) {
  console.warn(
    `\n[capacitor] server.url is ${serverUrl}\n` +
      `[capacitor] This works ONLY on the iOS Simulator (shares the Mac's network)\n` +
      `[capacitor] or the Android emulator (where 10.0.2.2 is the host).\n` +
      `[capacitor] A physical device will show a blank screen — localhost is the device.\n` +
      `[capacitor] For a device build:\n` +
      `[capacitor]   npm run cap:ios:device      (production HTTPS)\n` +
      `[capacitor]   npm run cap:android:device  (your Mac's LAN IP)\n`,
  );
}

/**
 * The InsForge backend host.
 *
 * Read from the environment, but `npx cap sync` does **not** load `.env.local`,
 * so this is usually empty during a sync and must not be relied on. It is kept
 * because it costs nothing when present, and `CAPACITOR_BACKEND_HOST` is there
 * for a CI sync that wants it explicit.
 *
 * It is not required for sign-in: the Google URL is opened with `Browser.open`
 * in the system browser, and every `/api/...` call is same-origin with
 * `server.url`, so the webview never navigates to InsForge itself.
 */
const backendHost = (() => {
  const explicit = process.env.CAPACITOR_BACKEND_HOST?.trim();
  if (explicit) return explicit;
  try {
    return new URL(process.env.NEXT_PUBLIC_INSFORGE_URL ?? "").host;
  } catch {
    return "";
  }
})();

const config: CapacitorConfig = {
  appId: "com.learnme.app",
  appName: "Learn Me",
  webDir: "native/www",

  server: {
    url: serverUrl,
    cleartext,
    /**
     * Hosts the webview may navigate to *inside* the shell. Everything else is
     * handed to the system browser — which is what Google requires for OAuth, and
     * why the native flow returns through `learnme://auth/callback` rather than
     * staying in the webview.
     */
    allowNavigation: [host, backendHost, backendHost ? `*.${backendHost}` : ""].filter(
      Boolean,
    ),
  },

  ios: {
    /**
     * `"automatic"`, and this was got wrong once already. It was `"never"`, on the
     * reasoning that the app draws its own headers. The first simulator launch
     * showed the clock, signal and battery sitting on top of the wordmark.
     */
    contentInset: "automatic",
    limitsNavigationsToAppBoundDomains: false,
  },

  android: {
    backgroundColor: "#faf8f5",
  },

  plugins: {
    SplashScreen: {
      backgroundColor: "#faf8f5",
      showSpinner: false,
    },
  },
};

export default config;
