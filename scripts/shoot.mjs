/**
 * Screenshot pass over the real product.
 *
 * Run:  npm run shoot -- [route ...]      (default: every route below)
 *
 *   npm run shoot                     all routes, desktop + 390px
 *   npm run shoot /fr /fr/settings    only those routes
 *   SHOT_WIDTH=1440 npm run shoot /fr desktop only
 *
 * One throwaway account, one headless Chrome, one pass. Each route is captured
 * at 1440x900 and at 390x844 into `.shots/`, which is git-ignored.
 *
 * Cookies are set over the DevTools Protocol from a session created with the
 * SDK, so the browser signs in without driving the sign-in form — the form is
 * covered by `verify:auth`, and repeating that here would only add a way for
 * this script to fail for reasons that have nothing to do with layout.
 *
 * The probe account is deleted by the exact id captured at signup.
 */

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@insforge/sdk";

const BASE = process.env.PROBE_URL ?? "http://localhost:3000";
const OUT = path.resolve(".shots");
const apiUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const adminKey = process.env.INSFORGE_API_KEY;
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333 + (Number(process.env.SHOT_PORT_OFFSET ?? 0) || 0);

if (!apiUrl || !anonKey || !adminKey) {
  console.error("Missing InsForge env vars. Run with --env-file=.env.local");
  process.exit(1);
}

/** Every route in the product, with the viewports it must be checked at. */
const ROUTES = [
  // The public homepage is for visitors. With the probe's cookie the app
  // shell sends a signed-in learner to their dashboard, so this one route is
  // captured with the cookie cleared and restored afterwards.
  { path: "/", name: "public-home", signedOut: true },
  { path: "/languages", name: "public-languages", signedOut: true },
  { path: "/fr", name: "dashboard" },
  { path: "/fr/path", name: "path" },
  { path: "/fr/bank", name: "bank" },
  { path: "/fr/settings", name: "settings" },
  { path: "/fr/settings?section=account", name: "settings-account" },
  { path: "/fr/settings?section=plan", name: "settings-plan" },
  { path: "/fr/onboarding?step=1", name: "onboarding-1" },
  { path: "/fr/onboarding?step=4", name: "onboarding-4" },
  { path: "/fr/onboarding?step=6", name: "onboarding-6" },
  { path: "/languages?add=1", name: "languages" },
  { path: "/fr/review", name: "review" },
  { path: "/fr/progress", name: "progress" },
  { path: "/fr/speak", name: "speak" },
];

const VIEWPORTS = [
  { suffix: "desktop", width: 1440, height: 900, mobile: false },
  { suffix: "390", width: 390, height: 844, mobile: true },
  // The narrowest supported phone, where a row that cannot shrink finally shows
  // it. 390 alone hides these: an iPhone 14 has 60px more to play with.
  { suffix: "320", width: 320, height: 700, mobile: true },
  { suffix: "430", width: 430, height: 932, mobile: true },
];

const only = process.argv.slice(2).filter((arg) => arg.startsWith("/"));
const widthFilter = process.env.SHOT_WIDTH ? Number(process.env.SHOT_WIDTH) : null;
// A taller viewport is how a section further down the page gets inspected: the
// capture is viewport-only so the shots stay a readable size, which means the
// only way to see more is to ask for a taller window.
const heightOverride = process.env.SHOT_HEIGHT ? Number(process.env.SHOT_HEIGHT) : null;
const routes = only.length > 0 ? ROUTES.filter((r) => only.includes(r.path)) : ROUTES;
const viewports = (widthFilter
  ? VIEWPORTS.filter((v) => v.width === widthFilter)
  : VIEWPORTS
).map((v) => (heightOverride ? { ...v, height: heightOverride } : v));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mkdirSync(OUT, { recursive: true });
const profileDir = mkdtempSync(path.join(tmpdir(), "learn-me-shots-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-gpu",
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

const anon = createClient({ baseUrl: apiUrl, anonKey });
const admin = createClient({ baseUrl: apiUrl, anonKey: adminKey });
const email = `shots-${Date.now().toString(36)}@example.com`;
const password = "shots-probe-1234";
let userId = null;

async function cleanup() {
  // Never delete an account this run did not create.
  if (!userId || process.env.SHOT_TOKEN) return;
  try {
    await admin.database.from("profiles").delete().eq("id", userId);
    await fetch(`${apiUrl}/api/auth/users`, {
      method: "DELETE",
      headers: { "x-api-key": adminKey, "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [userId] }),
    });
    console.log(`\ncleaned up probe account ${userId.slice(0, 8)}…`);
  } catch (error) {
    console.warn("cleanup warning:", error instanceof Error ? error.message : error);
  }
}

try {
  /*
   * Usually a fresh account, but `SHOT_TOKEN` reuses an existing session. That
   * exists because the interesting states are the populated ones: an empty bank
   * renders an empty state, which says nothing about how a list of twelve saved
   * items behaves at 320px. The token is a throwaway probe session, not a secret.
   */
  const reuseToken = process.env.SHOT_TOKEN?.trim();
  const reuseRefresh = process.env.SHOT_REFRESH?.trim();

  // ── A real account, with a real plan ─────────────────────────────────────
  const signUp = reuseToken
    ? { data: { user: { id: process.env.SHOT_USER_ID }, accessToken: reuseToken, refreshToken: reuseRefresh } }
    : await anon.auth.signUp({ email, password, name: "Shots Probe" });
  if (!reuseToken && signUp.error) throw new Error(`signup: ${signUp.error.message}`);
  userId = signUp.data?.user?.id;
  const accessToken = signUp.data?.accessToken;
  const refreshToken = signUp.data?.refreshToken;
  if (!userId || !accessToken) throw new Error("signup returned no session");

  const authed = createClient({ baseUrl: apiUrl, anonKey: accessToken });
  const seeded = reuseToken ? { error: null } : await authed.database.from("learner_languages").upsert(
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
  if (seeded.error) throw new Error(`seed: ${seeded.error.message}`);
  if (!reuseToken) {
    await authed.database
      .from("profiles")
      .update({ onboarding_state: "complete", native_language: "en" })
      .eq("id", userId);
  }

  // ── Chrome ───────────────────────────────────────────────────────────────
  let ws;
  for (let i = 0; i < 120; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) {
        ws = (await response.json()).webSocketDebuggerUrl;
        break;
      }
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  if (!ws) throw new Error("Chrome did not open DevTools");

  const socket = new WebSocket(ws);
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(String(event.data));
    const entry = pending.get(payload.id);
    if (!entry) return;
    pending.delete(payload.id);
    if (payload.error) entry.reject(new Error(JSON.stringify(payload.error)));
    else entry.resolve(payload.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Network.enable", {}, sessionId);
  await send("Log.enable", {}, sessionId);

  /*
   * Console errors are captured alongside the screenshots. A layout can look
   * perfect while the page throws behind it — a hydration mismatch, a failed
   * request — and Next only surfaces those as a small badge in the corner of a
   * screenshot. Reporting the text is the difference between noticing and
   * missing it.
   */
  let consoleErrors = [];
  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(String(event.data));
    if (payload.method === "Log.entryAdded" && payload.params?.entry?.level === "error") {
      consoleErrors.push(payload.params.entry.text);
    }
    if (payload.method === "Runtime.exceptionThrown") {
      const description = payload.params?.exceptionDetails?.exception?.description;
      consoleErrors.push(description ?? payload.params?.exceptionDetails?.text ?? "exception");
    }
  });

  const host = new URL(BASE).hostname;
  for (const [name, value] of [
    ["insforge_access_token", accessToken],
    ["insforge_refresh_token", refreshToken],
  ]) {
    if (!value) continue;
    await send(
      "Network.setCookie",
      { name, value, domain: host, path: "/", httpOnly: true, sameSite: "Lax" },
      sessionId,
    );
  }

  const evaluate = async (expression) => {
    const result = await send(
      "Runtime.evaluate",
      { expression: `(()=>{${expression}})()`, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (result.exceptionDetails) {
      throw new Error(
        `page error: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
      );
    }
    return result.result?.value;
  };

  let failures = 0;

  for (const viewport of viewports) {
    await send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
      },
      sessionId,
    );

    for (const route of routes) {
      consoleErrors = [];
      if (route.signedOut) {
        await send("Network.clearBrowserCookies", {}, sessionId);
      } else {
        for (const [name, value] of [
          ["insforge_access_token", accessToken],
          ["insforge_refresh_token", refreshToken],
        ]) {
          if (value) {
            await send(
              "Network.setCookie",
              { name, value, domain: host, path: "/", httpOnly: true, sameSite: "Lax" },
              sessionId,
            );
          }
        }
      }
      // `SHOT_NAV=expanded` seeds the rail preference before first paint, so the
      // capture shows the real layout rather than a post-hydration toggle.
      if (process.env.SHOT_NAV) {
        await send(
          "Page.addScriptToEvaluateOnNewDocument",
          { source: `try{localStorage.setItem("learn-me:nav",${JSON.stringify(process.env.SHOT_NAV)})}catch(e){}` },
          sessionId,
        );
      }
      await send("Page.navigate", { url: `${BASE}${route.path}` }, sessionId);

      // Wait for the document to settle rather than guessing a duration: the
      // page is ready when Next has painted its content and fonts are in.
      for (let i = 0; i < 100; i += 1) {
        const ready = await evaluate(
          "return document.readyState === 'complete' && Boolean(document.querySelector('main, body > div'))",
        ).catch(() => false);
        if (ready) break;
        await sleep(150);
      }
      await evaluate("return document.fonts ? document.fonts.ready.then(()=>true) : true");
      await sleep(450);

      const shot = await send(
        "Page.captureScreenshot",
        { format: "png", captureBeyondViewport: false },
        sessionId,
      );
      const file = path.join(OUT, `${route.name}-${viewport.suffix}.png`);
      writeFileSync(file, Buffer.from(shot.data, "base64"));

      const finalUrl = await evaluate("return location.pathname + location.search");
      const height = await evaluate("return document.documentElement.scrollHeight");
      const scrolled = await evaluate(
        "return document.documentElement.scrollWidth > window.innerWidth + 1",
      );
      if (scrolled) failures += 1;
      const complaints = consoleErrors.filter(
        (text) => !text.includes("React DevTools"),
      );
      if (complaints.length > 0) failures += 1;
      console.log(
        `${scrolled ? "SCROLLS " : "        "}${complaints.length > 0 ? `${complaints.length} ERR ` : "      "}${route.name.padEnd(16)} ${viewport.suffix.padEnd(8)} ${finalUrl}  (page ${height}px)`,
      );
      for (const text of complaints.slice(0, 2)) {
        console.log(`          ! ${text.split("\n")[0].slice(0, 180)}`);
      }
    }
  }

  console.log(`\nscreenshots in ${OUT}`);
  if (failures > 0) console.log(`${failures} viewport(s) scroll horizontally — see SCROLLS above`);
} finally {
  await cleanup();
  chrome.kill("SIGTERM");
  await sleep(400);
  rmSync(profileDir, { recursive: true, force: true });
}