/**
 * Dead-link audit for the authenticated app.
 *
 * Run:  npm run verify:links
 *
 * Static analysis cannot answer this: almost every link in this app is built at
 * runtime (`/${language.code}/lesson/${id}`), so a regex over the source sees a
 * handful of literals and misses the rest. This signs in, walks every
 * authenticated route, harvests every `href` the server actually rendered, and
 * fetches each one with the same session.
 *
 * Reports anything that is not a 200 or an expected redirect, plus any anchor
 * that renders as a dead control (empty, "#", or javascript:).
 */
import { createClient } from "@insforge/sdk";

const BASE = process.env.PROBE_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const adminKey = process.env.INSFORGE_API_KEY;

const ROUTES = ["/fr", "/fr/path", "/fr/bank", "/fr/progress", "/fr/settings", "/fr/speak", "/fr/plan", "/fr/review", "/languages?add=1"];

const anon = createClient({ baseUrl: url, anonKey });
const admin = createClient({ baseUrl: url, anonKey: adminKey });
const email = `links-${Date.now().toString(36)}@example.com`;
const password = "links-probe-1234";
let userId = null;
const results = [];
const check = (n, ok, d) => { results.push({ n, ok }); console.log(`${ok ? "  ok  " : " FAIL "} ${n}${d ? ` — ${d}` : ""}`); };

try {
  const up = await anon.auth.signUp({ email, password, name: "Links Probe" });
  userId = up.data.user.id;
  const authed = createClient({ baseUrl: url, anonKey, accessToken: up.data.accessToken });
  await authed.database.from("learner_languages").upsert(
    [{ user_id: userId, language_code: "fr", is_primary: true, cefr_level: "A2", cefr_goal: "B1", daily_minutes: 20 }],
    { onConflict: "user_id,language_code" });
  await authed.database.from("profiles").update({ onboarding_state: "complete", native_language: "en" }).eq("id", userId);

  const cookie = `insforge_access_token=${up.data.accessToken}`;
  const seen = new Map();   // href -> [routes it appeared on]
  const dead = new Set();

  for (const route of ROUTES) {
    const res = await fetch(BASE + route, { headers: { cookie }, redirect: "manual" });
    if (res.status !== 200) { check(`${route} renders`, false, `HTTP ${res.status}`); continue; }
    const html = await res.text();

    for (const m of html.matchAll(/<a\b[^>]*href="([^"]*)"/g)) {
      const href = m[1];
      if (href === "" || href === "#" || href.startsWith("javascript:")) {
        dead.add(`${route} -> dead anchor "${href}"`);
        continue;
      }
      /*
       * A fragment is only dead if nothing on the page carries that id. The
       * skip-to-content link (#main) is a real anchor, and flagging it was a bug
       * in this check rather than in the app.
       */
      if (href.startsWith("#")) {
        const id = href.slice(1);
        if (!new RegExp(`id="${id}"`).test(html)) {
          dead.add(`${route} -> fragment "${href}" has no matching element`);
        }
        continue;
      }
      if (!href.startsWith("/")) continue;                 // external / mailto
      const target = href.split("#")[0];
      if (!seen.has(target)) seen.set(target, []);
      seen.get(target).push(route);
    }
  }

  check("no dead anchors render", dead.size === 0, [...dead].slice(0, 4).join(" | "));

  // Every harvested internal link must resolve for a signed-in learner.
  const broken = [];
  for (const [target] of seen) {
    const res = await fetch(BASE + target, { headers: { cookie }, redirect: "manual" });
    const ok = res.status === 200 || (res.status >= 300 && res.status < 400);
    if (!ok) broken.push(`${target} -> HTTP ${res.status}`);
  }
  check(`every rendered internal link resolves (${seen.size} checked)`, broken.length === 0, broken.slice(0, 6).join(" | "));

  // Destinations a signed-out visitor must be pushed away from.
  for (const target of ["/fr", "/fr/path", "/fr/settings", "/fr/speak"]) {
    const res = await fetch(BASE + target, { redirect: "manual" });
    const loc = res.headers.get("location") ?? "";
    check(`signed out: ${target} is protected`, res.status >= 300 && loc.includes("sign-in"), `${res.status} ${loc}`);
  }
} finally {
  if (userId) {
    await admin.database.from("profiles").delete().eq("id", userId);
    await fetch(`${url}/api/auth/users`, { method: "DELETE", headers: { "x-api-key": adminKey, "Content-Type": "application/json" }, body: JSON.stringify({ userIds: [userId] }) });
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
