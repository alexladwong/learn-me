/**
 * Language switcher verification.
 *
 * Run:  npm run verify:switcher
 *
 * The requirement for this control is mostly about what must *not* happen: no
 * document navigation, no shell rebuild, no divergence between the URL and the
 * persisted language. None of that is visible in a screenshot, and all of it is
 * easy to reintroduce — a `window.location` here, a form post there.
 *
 * So this drives a real browser over the DevTools Protocol and asserts on
 * observable browser facts rather than on markup:
 *
 *   - a switch does not fire `Page.loadEventFired` (a client navigation does not)
 *   - the rail's DOM node survives the switch (tagged before, checked after)
 *   - the persisted language is what a fresh visit to `/` resolves to
 *   - `/es/settings` becomes `/fr/settings`, while `/fr/lesson/…` falls back
 *   - Escape, outside click and ArrowDown behave as a menu should
 *
 * One throwaway account with two enrolled languages, deleted by the exact id
 * captured at signup.
 */

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@insforge/sdk";

const BASE = process.env.PROBE_URL ?? "http://localhost:3000";
const apiUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const adminKey = process.env.INSFORGE_API_KEY;
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9401;

if (!apiUrl || !anonKey || !adminKey) {
  console.error("Missing InsForge env vars. Run with --env-file=.env.local");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SHOTS = path.resolve(".shots");
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

const profileDir = mkdtempSync(path.join(tmpdir(), "learn-me-switcher-"));
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
    "about:blank",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

const anon = createClient({ baseUrl: apiUrl, anonKey });
const admin = createClient({ baseUrl: apiUrl, anonKey: adminKey });
const email = `switcher-${Date.now().toString(36)}@example.com`;
const password = "switcher-probe-1234";
let userId = null;

async function cleanup() {
  if (!userId) return;
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
  // ── An account studying two languages ────────────────────────────────────
  const signUp = await anon.auth.signUp({ email, password, name: "Switcher Probe" });
  if (signUp.error) throw new Error(`signup: ${signUp.error.message}`);
  userId = signUp.data?.user?.id;
  const accessToken = signUp.data?.accessToken;
  const refreshToken = signUp.data?.refreshToken;
  if (!userId || !accessToken) throw new Error("signup returned no session");

  const authed = createClient({ baseUrl: apiUrl, anonKey, accessToken });
  const seeded = await authed.database.from("learner_languages").upsert(
    [
      {
        user_id: userId,
        language_code: "fr",
        is_primary: true,
        motivation: ["travel"],
        cefr_level: "A1",
        cefr_goal: "B1",
        daily_minutes: 15,
        skill_priorities: ["speaking"],
      },
      {
        user_id: userId,
        language_code: "es",
        is_primary: false,
        motivation: ["work"],
        cefr_level: "A2",
        cefr_goal: "B1",
        daily_minutes: 20,
        skill_priorities: ["listening"],
      },
    ],
    { onConflict: "user_id,language_code" },
  );
  if (seeded.error) throw new Error(`seed: ${seeded.error.message}`);
  await authed.database
    .from("profiles")
    .update({ onboarding_state: "complete", native_language: "en" })
    .eq("id", userId);

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
  let loadEvents = 0;
  let consoleErrors = [];

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(String(event.data));
    if (payload.method === "Page.loadEventFired") loadEvents += 1;
    if (payload.method === "Log.entryAdded" && payload.params?.entry?.level === "error") {
      consoleErrors.push(payload.params.entry.text);
    }
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

  const host = new URL(BASE).hostname;
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

  const url = async () => (await evaluate("return location.pathname + location.search")) ?? "";

  async function goto(pathname) {
    consoleErrors = [];
    await send("Page.navigate", { url: `${BASE}${pathname}` }, sessionId);
    for (let i = 0; i < 120; i += 1) {
      const ready = await evaluate(
        "return document.readyState === 'complete' && Boolean(document.querySelector('nav[aria-label=\"Main\"]'))",
      ).catch(() => false);
      if (ready) break;
      await sleep(150);
    }
    await sleep(350);
  }

  /** Poll for a condition instead of sleeping a guessed duration. */
  async function waitFor(probe, description, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await probe()) return true;
      await sleep(120);
    }
    console.log(`  (timed out waiting for ${description}; at ${await url()})`);
    return false;
  }

  const key = async (keyName, code, virtualKeyCode) => {
    await send(
      "Input.dispatchKeyEvent",
      {
        type: "rawKeyDown",
        key: keyName,
        code,
        windowsVirtualKeyCode: virtualKeyCode,
        nativeVirtualKeyCode: virtualKeyCode,
      },
      sessionId,
    );
    await send(
      "Input.dispatchKeyEvent",
      {
        type: "keyUp",
        key: keyName,
        code,
        windowsVirtualKeyCode: virtualKeyCode,
        nativeVirtualKeyCode: virtualKeyCode,
      },
      sessionId,
    );
  };

  const triggerSelector = 'button[aria-haspopup="menu"]';

  /** A real pointer click at an element's centre, not a synthetic `.click()`. */
  async function clickAt(selector) {
    const box = await evaluate(
      `const el = document.querySelector(${JSON.stringify(selector)});
       if (!el) return null;
       const r = el.getBoundingClientRect();
       return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`,
    );
    if (!box) return false;
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send(
        "Input.dispatchMouseEvent",
        { type, x: box.x, y: box.y, button: "left", clickCount: 1 },
        sessionId,
      );
    }
    return true;
  }

  // ── 1. The trigger ───────────────────────────────────────────────────────
  await goto("/fr");

  const trigger = await evaluate(
    `const el = document.querySelector('${triggerSelector}');
     if (!el) return null;
     const rect = el.getBoundingClientRect();
     return { text: el.innerText.replace(/\\s+/g, ' ').trim(), expanded: el.getAttribute('aria-expanded'), height: Math.round(rect.height), width: Math.round(rect.width) };`,
  );

  check("the header renders a language trigger", trigger !== null);
  check(
    "the trigger names the current language",
    Boolean(trigger?.text.includes("French")),
    trigger?.text,
  );
  check(
    "the trigger shows the learner's level for that language",
    Boolean(trigger?.text.includes("A1")),
    trigger?.text,
  );
  check("the trigger is collapsed", trigger?.expanded === "false");
  check(
    "the trigger is not a native select",
    (await evaluate("return document.querySelectorAll('select').length")) === 0,
  );

  // ── Mobile: the target size and the popover's fit ────────────────────────
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
    sessionId,
  );
  await sleep(250);

  const mobile = await evaluate(
    `const el = document.querySelector('${triggerSelector}');
     const rect = el.getBoundingClientRect();
     return { height: Math.round(rect.height), right: Math.round(rect.right), text: el.innerText.replace(/\s+/g, ' ').trim() };`,
  );
  check(
    "the trigger is a 44px touch target on a phone",
    (mobile?.height ?? 0) >= 44,
    `${mobile?.height}px`,
  );
  check(
    "the switcher is visible on a phone",
    Boolean(mobile?.text.includes("French")),
    mobile?.text,
  );
  check(
    "the trigger stays inside a 390px viewport",
    (mobile?.right ?? 999) <= 390,
    `right edge at ${mobile?.right}px`,
  );

  await evaluate(`document.querySelector('${triggerSelector}').click(); return true;`);
  await waitFor(
    async () => Boolean(await evaluate("return Boolean(document.querySelector('[role=menu]'))")),
    "the menu to open on a phone",
  );
  const mobileMenu = await evaluate(
    `const menu = document.querySelector('[role=menu]');
     if (!menu) return null;
     const rect = menu.getBoundingClientRect();
     return { left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), height: Math.round(rect.height) };`,
  );
  check(
    "the popover fits a 390px viewport",
    Boolean(mobileMenu) && mobileMenu.left >= 0 && mobileMenu.right <= 390,
    mobileMenu ? `x ${mobileMenu.left}–${mobileMenu.right}` : "no menu",
  );
  {
    const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(path.join(SHOTS, "switcher-390.png"), Buffer.from(shot.data, "base64"));
  }
  check(
    "the popover is compact, not a full screen",
    Boolean(mobileMenu) && mobileMenu.height < 400,
    `${mobileMenu?.height}px tall`,
  );
  await evaluate(
    "document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true;",
  );
  await send("Emulation.clearDeviceMetricsOverride", {}, sessionId);
  await sleep(250);

  // ── 2. Opening, ARIA and keyboard ────────────────────────────────────────
  await clickAt(triggerSelector);
  const opened = await waitFor(
    async () => Boolean(await evaluate("return Boolean(document.querySelector('[role=menu]'))")),
    "the menu to open",
  );

  check("clicking the trigger opens a menu", opened);
  check(
    "the trigger reports itself expanded",
    (await evaluate(
      `return document.querySelector('${triggerSelector}').getAttribute('aria-expanded')`,
    )) === "true",
  );
  check(
    "the menu is labelled by the trigger",
    (await evaluate(
      `const menu = document.querySelector('[role=menu]');
       return Boolean(menu.getAttribute('aria-labelledby')) && menu.getAttribute('aria-labelledby') === document.querySelector('${triggerSelector}').id;`,
    )) === true,
  );

  const items = await evaluate(
    `return [...document.querySelectorAll('[role=menuitemradio]')].map((el) => ({
       label: el.innerText.replace(/\\s+/g, ' ').trim(),
       checked: el.getAttribute('aria-checked'),
     }));`,
  );
  check(
    "every enrolled language is listed",
    (items ?? []).length === 2,
    `${(items ?? []).length} items`,
  );
  check(
    "the current language is the one marked selected",
    (items ?? []).some((item) => item.label.includes("French") && item.checked === "true"),
  );
  check(
    "the other language is not marked selected",
    (items ?? []).some((item) => item.label.includes("Spanish") && item.checked === "false"),
  );
  check(
    "each item shows its own level",
    (items ?? []).filter((item) => /A1|A2/.test(item.label)).length === 2,
    (items ?? []).map((i) => i.label).join(" | "),
  );
  check(
    "'Add language' is offered as a menu action",
    (await evaluate("return document.querySelectorAll('[role=menuitem]').length")) === 1,
  );
  {
    const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(path.join(SHOTS, "switcher-desktop.png"), Buffer.from(shot.data, "base64"));
  }
  check(
    "a pointer open leaves focus on the trigger, not on a row",
    (await evaluate(
      `return document.activeElement === document.querySelector('${triggerSelector}');`,
    )) === true,
  );

  // Escape closes and hands focus back.
  await key("Escape", "Escape", 27);
  const escaped = await waitFor(
    async () => (await evaluate("return document.querySelectorAll('[role=menu]').length")) === 0,
    "Escape to close the menu",
  );
  check("Escape closes the menu", escaped);
  check(
    "Escape returns focus to the trigger",
    (await evaluate(
      `return document.activeElement === document.querySelector('${triggerSelector}')`,
    )) === true,
  );

  // ArrowDown on the trigger re-opens it, and this time focus does move in.
  await evaluate(`document.querySelector('${triggerSelector}').focus(); return true;`);
  await key("ArrowDown", "ArrowDown", 40);
  await waitFor(
    async () => Boolean(await evaluate("return Boolean(document.querySelector('[role=menu]'))")),
    "ArrowDown to open the menu",
  );
  const firstFocused = await evaluate(
    "return document.activeElement?.getAttribute('role') === 'menuitemradio';",
  );
  await key("ArrowDown", "ArrowDown", 40);
  const movedFocus = await evaluate(
    "return document.activeElement?.getAttribute('role') === 'menuitemradio';",
  );
  check("ArrowDown opens the menu onto an item", firstFocused === true);
  check("ArrowDown moves between items", movedFocus === true);

  // Outside click closes.
  await evaluate(
    "document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true;",
  );
  const dismissed = await waitFor(
    async () => (await evaluate("return document.querySelectorAll('[role=menu]').length")) === 0,
    "an outside click to close the menu",
  );
  check("an outside click closes the menu", dismissed);

  // ── 3. Switching: no reload, no shell rebuild ────────────────────────────
  // Tag the rail and the main content, then prove the rail node — and only the
  // rail node — comes through the switch untouched.
  await evaluate(
    `document.querySelector('nav[aria-label="Main"]').dataset.switcherProbe = 'kept';
     return true;`,
  );

  const loadsBefore = loadEvents;
  await evaluate(`document.querySelector('${triggerSelector}').click(); return true;`);
  await waitFor(
    async () => Boolean(await evaluate("return Boolean(document.querySelector('[role=menu]'))")),
    "the menu to open for the switch",
  );
  await evaluate(
    `const item = [...document.querySelectorAll('[role=menuitemradio]')]
       .find((el) => el.innerText.includes('Spanish'));
     if (!item) return false;
     item.click();
     return true;`,
  );

  const switched = await waitFor(
    async () => (await url()).startsWith("/es"),
    "the URL to become /es",
  );
  await sleep(600);

  check("choosing another language changes the URL", switched, await url());
  check(
    "the switch is a client navigation, not a document load",
    loadEvents === loadsBefore,
    `${loadEvents - loadsBefore} load event(s)`,
  );
  check(
    "the app shell survives the switch",
    (await evaluate(
      `return document.querySelector('nav[aria-label="Main"]')?.dataset.switcherProbe === 'kept';`,
    )) === true,
  );
  check(
    "the rail now points at the language being viewed",
    (await evaluate(
      `return [...document.querySelectorAll('nav[aria-label="Main"] a')]
         .every((a) => a.getAttribute('href')?.startsWith('/es'));`,
    )) === true,
  );
  check(
    "the trigger now names the new language",
    (await evaluate(
      `return document.querySelector('${triggerSelector}').innerText.includes('Spanish');`,
    )) === true,
  );
  check("no console errors during the switch", consoleErrors.length === 0, consoleErrors[0]);

  // ── 4. It persisted ──────────────────────────────────────────────────────
  const stored = await authed.database
    .from("learner_languages")
    .select("language_code,is_primary")
    .eq("user_id", userId);

  const primaryRow = (stored.data ?? []).find((row) => row.is_primary === true);
  check(
    "the active language is persisted server-side",
    primaryRow?.language_code === "es",
    `primary=${primaryRow?.language_code ?? "none"}`,
  );
  check(
    "switching did not create or drop a language row",
    (stored.data ?? []).length === 2,
    `${(stored.data ?? []).length} rows`,
  );

  await goto("/");
  const landed = await waitFor(async () => (await url()).startsWith("/es"), "a fresh visit to resolve to /es");
  check("a fresh visit resolves to the persisted language", landed, await url());

  // ── 5. The equivalent route is preserved ─────────────────────────────────
  await goto("/es/settings");
  check("Spanish settings renders", (await url()) === "/es/settings", await url());

  const loadsBeforeSettings = loadEvents;
  await evaluate(`document.querySelector('${triggerSelector}').click(); return true;`);
  await waitFor(
    async () => Boolean(await evaluate("return Boolean(document.querySelector('[role=menu]'))")),
    "the menu to open on settings",
  );
  await evaluate(
    `const item = [...document.querySelectorAll('[role=menuitemradio]')]
       .find((el) => el.innerText.includes('French'));
     if (!item) return false;
     item.click();
     return true;`,
  );

  const preserved = await waitFor(
    async () => (await url()) === "/fr/settings",
    "/es/settings to become /fr/settings",
  );
  await sleep(400);
  check("switching on a shared route preserves the route", preserved, await url());
  check(
    "that switch is also a client navigation",
    loadEvents === loadsBeforeSettings,
    `${loadEvents - loadsBeforeSettings} load event(s)`,
  );

  // ── 6. A language-scoped route falls back ────────────────────────────────
  const mission = await evaluate(
    `const link = document.querySelector('a[href*="/lesson/"]');
     return link ? link.getAttribute('href') : null;`,
  );

  if (mission) {
    await goto(mission);
    const onLesson = (await url()).startsWith("/fr/lesson/");
    await evaluate(`document.querySelector('${triggerSelector}').click(); return true;`);
    await waitFor(
      async () => Boolean(await evaluate("return Boolean(document.querySelector('[role=menu]'))")),
      "the menu to open on a lesson",
    );
    await evaluate(
      `const item = [...document.querySelectorAll('[role=menuitemradio]')]
         .find((el) => el.innerText.includes('Spanish'));
       if (!item) return false;
       item.click();
       return true;`,
    );
    const fellBack = await waitFor(async () => (await url()) === "/es", "the lesson to fall back to /es");
    check(
      "a content-scoped route falls back to the dashboard",
      onLesson && fellBack,
      await url(),
    );
  } else {
    console.log("  (no lesson link on this page; skipped the content-route case)");
  }

  // ── 7. The stored language follows the URL ───────────────────────────────
  /*
   * The run reaches this point with French stored, so it moves back to Spanish
   * and checks that the two agree.
   *
   * The *failure* branch — the write is rejected or the request never completes,
   * so the label and the URL go back and a small error appears — is covered by
   * `lib/routing/language-switch.test.ts` instead of here, and that is a
   * deliberate choice rather than an omission. A browser test of it was written
   * and removed twice: CDP request interception never paused the action's POST
   * (it only paused the router's own `?_rsc=` request, breaking the navigation it
   * was meant to observe), and taking the connection offline makes Next fall back
   * to a full document navigation, so the run measured the framework's offline
   * behaviour rather than this control's. The decision itself is a pure function
   * now, and that is what the unit tests exercise.
   */
  await goto("/fr");

  async function clickMenuItem(text) {
    await clickAt(triggerSelector);
    await waitFor(
      async () => Boolean(await evaluate("return Boolean(document.querySelector('[role=menu]'))")),
      "the menu to open",
    );
    const box = await evaluate(
      `const item = [...document.querySelectorAll('[role=menuitemradio]')]
         .find((el) => el.innerText.includes(${JSON.stringify(text)}));
       if (!item) return null;
       const r = item.getBoundingClientRect();
       return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`,
    );
    if (!box) return false;
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send(
        "Input.dispatchMouseEvent",
        { type, x: box.x, y: box.y, button: "left", clickCount: 1 },
        sessionId,
      );
    }
    return true;
  }

  await clickMenuItem("Spanish");
  check(
    "the probe can move back to Spanish",
    await waitFor(async () => (await url()) === "/es", "the move to /es"),
    await url(),
  );

  const settled = await authed.database
    .from("learner_languages")
    .select("language_code,is_primary")
    .eq("user_id", userId);
  const primarySettled = (settled.data ?? []).find((row) => row.is_primary === true);
  check(
    "the stored language matches the URL after every switch",
    primarySettled?.language_code === "es",
    `primary=${primarySettled?.language_code ?? "none"}`,
  );

  check(
    "no console errors across the run",
    consoleErrors.length === 0,
    consoleErrors[0],
  );
} finally {
  await cleanup();
  chrome.kill("SIGTERM");
  await sleep(400);
  rmSync(profileDir, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);