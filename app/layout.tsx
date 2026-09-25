import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/layout/service-worker";
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
      <body className="min-h-full bg-surface text-primary antialiased">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
