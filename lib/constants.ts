/**
 * Product constants shared across routes and UI.
 */

export const APP_NAME = "Learn Me";

export const APP_TAGLINE =
  "A personal language environment that learns how you learn.";

/**
 * Learner-facing navigation. Desktop renders this as a persistent sidebar;
 * mobile renders the first five entries as the bottom bar.
 *
 * "Practice" covers review, the word bank and the sentence bank — one
 * destination rather than three competing tabs, because at the point of use a
 * learner wants "practise what I know", not a taxonomy.
 */
export const NAV_ITEMS = [
  { key: "home", label: "Home", icon: "home", segment: "" },
  { key: "learn", label: "Learn", icon: "learn", segment: "path" },
  { key: "practice", label: "Practice", icon: "practice", segment: "bank" },
  { key: "speak", label: "Speak", icon: "speak", segment: "speak" },
  { key: "profile", label: "Profile", icon: "profile", segment: "progress" },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];

/**
 * Routes reachable without a session. Everything else requires one.
 *
 * `/probe` is the layout-measurement harness, driven by
 * `scripts/verify-layout.mjs`. It is intentionally unlinked from the app and
 * renders only presentational components with fixture data — no learner data is
 * reachable through it.
 */
export const PUBLIC_ROUTES = [
  "/",
  "/sign-in",
  "/sign-up",
  "/api/health",
  "/probe",
  // Must be reachable with no session: it is the fallback the service worker
  // serves when a navigation fails, and the worker pre-caches it at install.
  // Behind the auth gate it would redirect to sign-in, which is unreachable
  // offline — turning "you are offline" into a failed navigation.
  "/offline",
] as const;

export const AUTH_ROUTES = ["/sign-in", "/sign-up"] as const;
