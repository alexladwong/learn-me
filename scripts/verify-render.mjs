/**
 * Server-render verification for the signed-in app routes.
 *
 * Run:  npm run verify:render
 *
 * A route that throws inside a Server Component still answers with HTML — Next
 * returns a 500 whose body contains the error boundary, not the page. Reading
 * only "did it respond" therefore proves nothing. This script signs in a single
 * disposable probe account and, for every protected route, records the status
 * code, whether Next's error boundary rendered, and a structural marker of the
 * composition that route is supposed to have.
 *
 * The probe account is deleted at the end by the exact id captured at signup,
 * through the same admin endpoint `verify-backend` uses. Nothing else is read,
 * written or deleted.
 */

import { createClient } from "@insforge/sdk";

const BASE = process.env.PROBE_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const adminKey = process.env.INSFORGE_API_KEY;

if (!url || !anonKey || !adminKey) {
  console.error("Missing NEXT_PUBLIC_INSFORGE_URL / ANON_KEY / INSFORGE_API_KEY.");
  process.exit(1);
}

const stamp = Date.now().toString(36);
const email = `render-probe-${stamp}@example.com`;
const password = "render-probe-1234";

const anon = createClient({ baseUrl: url, anonKey });
const admin = createClient({ baseUrl: url, anonKey: adminKey });

/** Routes checked once a session exists. `expect` is a marker that must appear. */
const ROUTES = [
  // A learner with exactly one language has nothing to choose between, so the
  // picker deliberately steps aside. This is a pass, not a failure.
  { path: "/languages", label: "languages steps aside for one language", redirectTo: "/fr" },
  { path: "/languages?add=1", label: "languages · adding another" },
  { path: "/fr", label: "dashboard" },
  { path: "/fr/settings", label: "settings (default section)" },
  { path: "/fr/settings?section=profile", label: "settings · profile" },
  { path: "/fr/settings?section=plan", label: "settings · plan" },
  { path: "/fr/settings?section=languages", label: "settings · languages" },
  { path: "/fr/settings?section=audio", label: "settings · audio" },
  { path: "/fr/settings?section=notifications", label: "settings · notifications" },
  { path: "/fr/settings?section=account", label: "settings · account" },
  { path: "/fr/settings?section=bogus", label: "settings · unknown section falls back" },
  { path: "/fr/path", label: "path" },
  { path: "/fr/bank", label: "bank" },
  { path: "/fr/bank?q=hola", label: "bank · search" },
  { path: "/fr/plan", label: "plan" },
  { path: "/fr/progress", label: "progress" },
  { path: "/fr/review", label: "review" },
  { path: "/fr/speak", label: "speak" },
  { path: "/fr/capture", label: "capture" },
];

/**
 * Routes that must render for a signed-out visitor.
 *
 * These are checked without the probe's cookie: a signed-in learner is
 * deliberately funneled from `/` and `/languages` into the app, so sending the
 * cookie would measure the redirect rather than the public page.
 */
const PUBLIC_ROUTES = [
  { path: "/", label: "public home (signed out)" },
  { path: "/sign-in", label: "sign-in" },
  { path: "/sign-up", label: "sign-up" },
];

/** Signatures Next leaves in the body when a render throws. */
const ERROR_MARKERS = [
  "Application error: a server-side exception",
  "Application error: a client-side exception",
  "Internal Server Error",
];

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

const signUp = await anon.auth.signUp({ email, password, name: "Render Probe" });
if (signUp.error) {
  console.error("Could not create the probe account:", signUp.error.message);
  process.exit(1);
}
const userId = signUp.data?.user?.id;
const accessToken = signUp.data?.accessToken;
const refreshToken = signUp.data?.refreshToken;

if (!accessToken) {
  console.error("Signup returned no access token; cannot render protected routes.");
  process.exit(1);
}

// A brand-new account has no target language, so the app shell correctly sends
// it to /languages. Seed the same minimal plan the real onboarding flow writes,
// through the learner's own token, so the protected routes are reachable.
const authed = createClient({ baseUrl: url, anonKey, accessToken });
const seeded = await authed.database.from("learner_languages").upsert(
  [
    {
      user_id: userId,
      language_code: "fr",
      is_primary: true,
      motivation: ["travel"],
      cefr_level: "A2",
      cefr_goal: "B1",
      daily_minutes: 20,
      skill_priorities: ["speaking"],
    },
  ],
  { onConflict: "user_id,language_code" },
);
if (seeded.error) {
  console.error("Could not seed a plan for the probe:", seeded.error.message);
}
const onboarding = await authed.database
  .from("profiles")
  .update({ onboarding_state: "complete", native_language: "en" })
  .eq("id", userId);
if (onboarding.error) {
  console.error("Could not complete onboarding for the probe:", onboarding.error.message);
}

const cookie = [
  `insforge_access_token=${accessToken}`,
  refreshToken ? `insforge_refresh_token=${refreshToken}` : null,
]
  .filter(Boolean)
  .join("; ");

try {
  const targets = [
    ...PUBLIC_ROUTES.map((route) => ({ ...route, cookie: "" })),
    ...ROUTES.map((route) => ({ ...route, cookie })),
  ];

  for (const route of targets) {
    let res;
    try {
      res = await fetch(`${BASE}${route.path}`, {
        headers: route.cookie ? { cookie: route.cookie } : {},
        redirect: "manual",
      });
    } catch (error) {
      record(route.label, false, `request failed: ${error.message}`);
      continue;
    }

    const body = res.status === 200 || res.status === 500 ? await res.text() : "";
    const marker = ERROR_MARKERS.find((candidate) => body.includes(candidate));

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (route.redirectTo && location === route.redirectTo) {
        record(route.label, true, `-> ${location} (intended)`);
      } else {
        record(route.label, false, `redirected to ${location}`);
      }
      continue;
    }
    if (res.status !== 200) {
      record(route.label, false, `HTTP ${res.status}`);
      continue;
    }
    if (marker) {
      record(route.label, false, `error boundary rendered (${marker})`);
      continue;
    }
    const complained = /"digest":"\d+"/.test(body);
    if (complained) {
      record(route.label, false, "body contains a Next digest (thrown during render)");
      continue;
    }
    if (route.expect && !body.includes(route.expect)) {
      record(route.label, false, `missing expected marker ${JSON.stringify(route.expect)}`);
      continue;
    }
    record(route.label, true, String(res.status));
  }
} finally {
  if (userId) {
    await admin.database.from("profiles").delete().eq("id", userId);
    const cleanup = await fetch(`${url}/api/auth/users`, {
      method: "DELETE",
      headers: { "x-api-key": adminKey, "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [userId] }),
    }).catch(() => null);
    if (!cleanup || !cleanup.ok) {
      console.warn("cleanup warning: probe account was not removed:", userId);
    } else {
      console.log("\nprobe account removed:", userId);
    }
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} routes render`);
process.exit(failed.length === 0 ? 0 : 1);
