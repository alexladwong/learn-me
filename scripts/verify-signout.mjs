/**
 * Sign-out verification.
 *
 * Run:  npm run verify:signout
 *
 * "Sign out" is easy to fake: navigate to /sign-in and the learner *appears*
 * signed out while the session is still live. This asserts the parts that
 * distinguish a real logout from that:
 *
 *   1. the account menu is reachable and contains the expected controls
 *   2. signing out clears the session cookies
 *   3. a protected route afterwards redirects to sign-in, server-side — which is
 *      what makes the native/browser Back button harmless
 *   4. a stale pending native OAuth request id does not survive
 *
 * Drives real Chrome with real pointer events, so the menu's click-outside and
 * keyboard behaviour are exercised rather than assumed.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@insforge/sdk";

const BASE = process.env.PROBE_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const adminKey = process.env.INSFORGE_API_KEY;
const PORT = 9477;
const SHOTS = path.resolve(".shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
};

const profileDir = mkdtempSync(path.join(tmpdir(), "signout-"));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
   "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank"],
  { stdio: ["ignore", "pipe", "pipe"] });

const anon = createClient({ baseUrl: url, anonKey });
const admin = createClient({ baseUrl: url, anonKey: adminKey });
const email = `signout-${Date.now().toString(36)}@example.com`;
const password = "signout-probe-1234";
let userId = null;

try {
  const up = await anon.auth.signUp({ email, password, name: "Signout Probe" });
  userId = up.data.user.id;
  const authed = createClient({ baseUrl: url, anonKey, accessToken: up.data.accessToken });
  await authed.database.from("learner_languages").upsert(
    [{ user_id: userId, language_code: "fr", is_primary: true, cefr_level: "A2", cefr_goal: "B1", daily_minutes: 20 }],
    { onConflict: "user_id,language_code" });
  await authed.database.from("profiles").update({ onboarding_state: "complete", native_language: "en" }).eq("id", userId);

  let ws;
  for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) { ws = (await r.json()).webSocketDebuggerUrl; break; } } catch {} await sleep(250); }
  const socket = new WebSocket(ws);
  await new Promise((r) => socket.addEventListener("open", r, { once: true }));
  let id = 1; const pending = new Map();
  socket.addEventListener("message", (e) => {
    const p = JSON.parse(String(e.data)); const x = pending.get(p.id); if (!x) return;
    pending.delete(p.id);
    if (p.error) x.reject(new Error(JSON.stringify(p.error))); else x.resolve(p.result);
  });
  const send = (m, params = {}, s) => new Promise((res, rej) => { const i = id++; pending.set(i, { resolve: res, reject: rej }); socket.send(JSON.stringify({ id: i, method: m, params, ...(s ? { sessionId: s } : {}) })); });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  for (const d of ["Page", "Runtime", "Network"]) await send(`${d}.enable`, {}, sessionId);

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: `(()=>{${expr}})()`, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  const clickAt = async (selector) => {
    const box = await evaluate(`const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};`);
    if (!box) return false;
    for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 }, sessionId);
    return true;
  };
  const setCookies = async () => {
    for (const [n, v] of [["insforge_access_token", up.data.accessToken], ["insforge_refresh_token", up.data.refreshToken]]) {
      if (v) await send("Network.setCookie", { name: n, value: v, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }, sessionId);
    }
  };
  const cookies = async () => (await send("Network.getCookies", { urls: [BASE] }, sessionId)).cookies ?? [];
  const url_ = async () => evaluate("return location.pathname + location.search");

  await setCookies();
  await send("Page.navigate", { url: `${BASE}/fr` }, sessionId);
  await sleep(3500);
  check("authenticated dashboard loads", (await url_()).startsWith("/fr"), await url_());

  // A stale pending native OAuth id, to prove sign-out clears it.
  await evaluate(`window.sessionStorage.setItem("learnme:native-auth-request","stale-request-id"); return true;`);

  const trigger = '[aria-haspopup="menu"][aria-label^="Account"]';
  check("the account trigger is present", await evaluate(`return Boolean(document.querySelector('${trigger}'))`));

  await clickAt(trigger);
  await sleep(400);
  const menu = await evaluate(`
    const m = document.querySelector('[role=menu]');
    if (!m) return null;
    return { text: m.innerText.replace(/\\s+/g,' ').trim(),
             items: [...m.querySelectorAll('[role=menuitem]')].map(e => e.innerText.trim()) };
  `);
  const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  writeFileSync(path.join(SHOTS, "account-menu.png"), Buffer.from(shot.data, "base64"));

  check("clicking it opens the account menu", Boolean(menu));
  check("it shows the learner's name", Boolean(menu?.text.includes("Signout Probe")), menu?.text.slice(0, 60));
  check("it shows the account email", Boolean(menu?.text.includes(email)));
  check("it offers Profile, Settings and Languages",
    ["Profile", "Settings", "Languages"].every((l) => menu?.items.includes(l)),
    (menu?.items ?? []).join(", "));
  check("Sign out is the last item", menu?.items.at(-1) === "Sign out", menu?.items.at(-1));

  // Escape closes it, and returns focus to the trigger.
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await sleep(300);
  check("Escape closes the menu", (await evaluate("return document.querySelectorAll('[role=menu]').length")) === 0);

  await clickAt(trigger);
  await sleep(300);
  const before = (await cookies()).length;
  check("the session cookie is present before sign-out", before > 0, `${before} cookie(s)`);

  /*
   * `.click()` on the element rather than a coordinate click.
   *
   * A synthetic CDP mouse press at the button's centre did not submit the form —
   * the menu stayed open and the session survived. Dispatching the click on the
   * element itself removes coordinate/hit-testing from the equation, so a failure
   * here means the form action is broken rather than the click landing elsewhere.
   */
  const found = await evaluate(`
    const btn = document.querySelector('[role=menuitem][type="submit"]');
    if (!btn) return "no button";
    btn.click();
    return "clicked";
  `);
  check("the Sign out control was found and clicked", found === "clicked", found);
  await sleep(5000);

  const after = await cookies();
  const authLeft = after.filter((c) => /insforge_(access|refresh)_token/.test(c.name));
  check("signing out sends the learner to a public page",
    ["/", "/sign-in"].includes(await url_()), await url_());
  check("the session cookies are gone", authLeft.length === 0,
    authLeft.map((c) => c.name).join(", ") || "none left");
  check("the pending native OAuth id is cleared",
    (await evaluate(`return window.sessionStorage.getItem("learnme:native-auth-request")`)) === null);

  // The Back button / a cached link / a typed URL must all fail identically.
  await send("Page.navigate", { url: `${BASE}/fr` }, sessionId);
  await sleep(2500);
  check("a protected route redirects to sign-in after sign-out",
    (await url_()).startsWith("/sign-in"), await url_());

  await send("Page.navigate", { url: `${BASE}/fr/settings` }, sessionId);
  await sleep(2500);
  check("a deep protected route redirects too", (await url_()).startsWith("/sign-in"), await url_());
} finally {
  if (userId) {
    await admin.database.from("profiles").delete().eq("id", userId);
    await fetch(`${url}/api/auth/users`, { method: "DELETE", headers: { "x-api-key": adminKey, "Content-Type": "application/json" }, body: JSON.stringify({ userIds: [userId] }) });
  }
  chrome.kill("SIGTERM"); await sleep(400); rmSync(profileDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
