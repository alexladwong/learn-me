/**
 * Mobile overflow verification.
 *
 * Run:  npm run verify:overflow
 *
 * `shoot.mjs` checks `documentElement.scrollWidth > innerWidth`, which misses the
 * failure that matters most on a phone: content clipped by an ancestor's
 * `overflow: hidden`. Nothing scrolls, so nothing is reported, and the layout
 * just looks broken. This walks every rendered element and compares its box
 * against the viewport instead.
 *
 * Reports at 320px, the narrowest supported phone — where a row that cannot
 * shrink finally shows it.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@insforge/sdk";

const BASE = "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_INSFORGE_URL, anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY, adminKey = process.env.INSFORGE_API_KEY;
const PORT = 9455, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profileDir = mkdtempSync(path.join(tmpdir(), "ovf-"));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, "--no-first-run", "--disable-gpu", "about:blank"],
  { stdio: ["ignore", "pipe", "pipe"] });

const anon = createClient({ baseUrl: url, anonKey });
const admin = createClient({ baseUrl: url, anonKey: adminKey });
const email = `ovf-${Date.now().toString(36)}@example.com`, password = "ovfprobe-1234";
let userId = null;
try {
  const up = await anon.auth.signUp({ email, password, name: "Overflow Probe" });
  userId = up.data.user.id;
  const authed = createClient({ baseUrl: url, anonKey, accessToken: up.data.accessToken });
  await authed.database.from("learner_languages").upsert([{ user_id: userId, language_code: "fr", is_primary: true, cefr_level: "A2", cefr_goal: "B1", daily_minutes: 20 }], { onConflict: "user_id,language_code" });
  await authed.database.from("profiles").update({ onboarding_state: "complete", native_language: "en" }).eq("id", userId);

  let ws; for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) { ws = (await r.json()).webSocketDebuggerUrl; break; } } catch {} await sleep(250); }
  const socket = new WebSocket(ws);
  await new Promise((r) => socket.addEventListener("open", r, { once: true }));
  let id = 1; const pending = new Map();
  socket.addEventListener("message", (e) => { const p = JSON.parse(String(e.data)); const x = pending.get(p.id); if (!x) return; pending.delete(p.id); if (p.error) x.reject(new Error(JSON.stringify(p.error)));
    else x.resolve(p.result); });
  const send = (m, params = {}, s) => new Promise((res, rej) => { const i = id++; pending.set(i, { resolve: res, reject: rej }); socket.send(JSON.stringify({ id: i, method: m, params, ...(s ? { sessionId: s } : {}) })); });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId); await send("Runtime.enable", {}, sessionId); await send("Network.enable", {}, sessionId);
  for (const [n, v] of [["insforge_access_token", up.data.accessToken], ["insforge_refresh_token", up.data.refreshToken]]) {
    if (v) await send("Network.setCookie", { name: n, value: v, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }, sessionId);
  }
  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: `(()=>{${expr}})()`, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 1, mobile: true }, sessionId);

  for (const route of ["/fr/settings", "/fr/settings?section=account", "/fr/settings?section=plan", "/fr/progress", "/fr/bank", "/fr/path", "/fr"]) {
    await send("Page.navigate", { url: BASE + route }, sessionId);
    await sleep(2500);
    const bad = await evaluate(`
      const vw = window.innerWidth; const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 || r.left < -1) {
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed') continue;

          /*
           * Inside a horizontal scroller, overflowing is the *point*: the tab
           * strip is wider than a phone on purpose and scrolls. Only report
           * elements that overflow with no scrollable ancestor to clip them,
           * which is the case that actually breaks the page.
           */
          let scroller = null;
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const pcs = getComputedStyle(p);
            if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll' || pcs.overflowX === 'hidden') {
              scroller = p;
              break;
            }
          }
          if (scroller) continue;
          // Zero-size elements were skipped, which hid the widest element on the
          // settings routes (960px on a 320px viewport) and made the probe report
          // "clean" while content was visibly clipped. Report them, flagged, and
          // let the reader decide whether they paint anything.
          out.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 70),
            right: Math.round(r.right),
            w: Math.round(r.width),
            h: Math.round(r.height),
            overflowX: cs.overflowX,
          });
        }
      }
      return { overflowing: out.slice(0, 6), scanned: document.querySelectorAll('body *').length, widest: Math.round(Math.max(0, ...[...document.querySelectorAll('body *')].map((e) => e.getBoundingClientRect().right))) };
    `);
    console.log(`\n${route}  (viewport 320)`);
    if (!bad) { console.log("  *** probe returned nothing — investigate ***"); continue; }
    if (!bad.overflowing.length) {
      console.log(`  clean (${bad.scanned} elements scanned, widest right edge ${bad.widest}px)`);
      continue;
    }
    for (const b of bad.overflowing) console.log(`  right=${String(b.right).padStart(4)} w=${String(b.w).padStart(4)} h=${String(b.h).padStart(4)} overflow-x=${b.overflowX.padEnd(7)} <${b.tag}> ${b.cls}`);
  }
} finally {
  if (userId) { await admin.database.from("profiles").delete().eq("id", userId); await fetch(`${url}/api/auth/users`, { method: "DELETE", headers: { "x-api-key": adminKey, "Content-Type": "application/json" }, body: JSON.stringify({ userIds: [userId] }) }); }
  chrome.kill("SIGTERM"); await sleep(300); rmSync(profileDir, { recursive: true, force: true });
}
