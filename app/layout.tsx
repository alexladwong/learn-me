import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/layout/service-worker";
import { AudioLifecycle } from "@/components/layout/audio-lifecycle";
import { NativeShell } from "@/components/native/native-shell";
import { THEME_SCRIPT } from "@/components/layout/theme-toggle";
import { NAV_SCRIPT } from "@/components/layout/nav-state";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/**
 * Mono is declared for `--font-mono` but nothing currently renders in it — there
 * is no `font-mono` utility and no monospace element in the product. Left
 * preloaded, Next emitted `<link rel="preload" as="font">` for a face the page
 * never uses, which the browser reports as an unused preload and, on a phone,
 * means downloading font bytes that are never painted.
 *
 * `preload: false` keeps the family available to `font-mono` the moment anything
 * needs it, while taking it off the critical path.
 */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — learn a language properly`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_TAGLINE,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

/**
 * `themeColor` lives here rather than in `metadata`, because Next.js 15+ moved it
 * out and warns if it is still nested under `metadata`.
 */
export const viewport: Viewport = {
  themeColor: "#faf8f5",
  // The review screen is a full-height card layout; letting it zoom is an
  // accessibility need, so zoom is never locked.
  initialScale: 1,
  width: "device-width",
};

/**
 * The root layout owns nothing but language, fonts and background.
 *
 * Language-specific layout — including `dir="rtl"` for Arabic — is applied by
 * the `[lang]` segment once the learner's language is known, because the correct
 * value is a database property (`languages.direction`), not a constant.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* All inputs put be incryted */}

        {/*
          Applies a stored appearance before first paint, so there is no flash of
          the wrong theme. Light is the default: the attribute is only present
          when a learner has chosen something else.

          This goes through `next/script` with `beforeInteractive` rather than a
          bare `<script>` tag. React 19 does not execute a script element it
          renders, so a plain tag produced a console error on every route and —
          worse — ran only when the server happened to send it, which is exactly
          the client-side navigation where the flash appears. `beforeInteractive`
          is documented as belonging in the root layout, which is where it is.
        */}
        <Script id="theme-restore" strategy="beforeInteractive">
          {THEME_SCRIPT}
        </Script>
        {/* Same reason as the theme: the rail's width is a layout decision, so it
            has to be settled before the first paint or the page jumps. */}
        <Script id="nav-restore" strategy="beforeInteractive">
          {NAV_SCRIPT}
        </Script>
      </head>
      <body className="min-h-full bg-surface text-primary antialiased">
        {children}
          {/* Add Here */}
        
        <AudioLifecycle />
        {/*
          A no-op in a browser tab; in the native shell it owns the status bar,
          the Android back button, connectivity and the OAuth deep link.
        */}
        <NativeShell />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
