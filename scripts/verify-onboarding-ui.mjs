/**
 * Browser verification of the onboarding wizard.
 *
 * Run:  npm run verify:onboarding-ui     (needs a dev server on :3000)
 *
 * ## Why this test has to exist
 *
 * The wizard keeps answers in `sessionStorage` because each step is a Server
 * Action plus a redirect that **remounts the component**. No Node-level verifier
 * can see that interaction — every server-side check passed while the wizard was
 * losing every answer on every step. This is the only check that covers it.
 *
 * ## Why it was unreliable, and what changed
 *
 * The previous version failed intermittently (8–17 of 32). All three causes were
 * the test's fault, not the product's:
 *
 *   1. **Fixed sleeps** (`await sleep(2800)` after Continue). A step that took
 *      longer left the assertion reading the *previous* step, so every later check
 *      was one step behind and cascaded. Replaced with `waitUntil`, which polls a
 *      condition and fails loudly, naming the state it saw.
 *   2. **A hard-coded route.** The test assumed `/es` throughout, but choosing
 *      French on step 1 legitimately moves the wizard to `/fr/onboarding` — the
 *      Server Action redirects using the language from the payload. The old
 *      version treated that correct behaviour as failure. The expected language is
 *      now derived from the selection and every later path is built from it.
 *   3. **Clicking controls that were already on.** Listening and Speaking are
 *      checked by default, so a blind click on their labels *unchecked* them and
 *      step 6 then failed validation for a genuine reason. Ticking goes through
 *      `ensureChecked`, which only clicks what is off.
 *
 * ## Isolation
 *
 * It signs up its own account through the real form, so the session arrives by the
 * same path a learner's does, and deletes that account — looked up by the exact
 * address it created, never by a name pattern — in `finally`. It does not read,
 * write or delete any other account, and never calls `kill` on a browser it did
 * not start.
 *
 * ## Browser discipline
 *
 * One browser, one context, one journey, one temporary profile, a dedicated debug
 * port, and a shutdown that waits for the process to exit before removing the
 * profile.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@insforge/sdk";

const apiUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const adminKey = process.env.INSFORGE_API_KEY;
if (!apiUrl || !anonKey || !adminKey) {
  console.error("Missing InsForge env vars. Run with --env-file=.env.local");
  process.exit(1);
}

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = Number(process.env.CHROME_DEBUG_PORT ?? 9372);
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
/** The language chosen on step 1 — deliberately not the one in the URL. */
const TARGET_LANGUAGE = process.env.TARGET_LANGUAGE ?? "fr";
const START_LANGUAGE = process.env.START_LANGUAGE ?? "es";

const results = [];
let pass = 0;
function check(name, ok, detail = "") {
  if (ok) pass += 1;
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
function step(title) {
  console.log(`\n── ${title}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profileDir = mkdtempSync(path.join(tmpdir(), "lm-onboarding-ui-"));
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
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

const admin = createClient({ baseUrl: apiUrl, anonKey: adminKey });
const email = `onboarding-ui-${Date.now()}@example.com`;
const password = "onboarding-ui-probe-1234";
let createdUserId = null;

/** Find our own account by the exact address we created. Never a name pattern. */
async function findCreatedUser() {
  try {
    const response = await fetch(
      `${apiUrl}/api/auth/users?search=${encodeURIComponent(email)}`,
      { headers: { "x-api-key": adminKey }, cache: "no-store" },
    );
    const body = await response.json().catch(() => null);
    const rows = body?.data ?? body?.users ?? body;
    const match = (Array.isArray(rows) ? rows : []).find(
      (row) => String(row.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    return match?.id ?? null;
  } catch {
    return null;
  }
}

async function cleanup() {
  const id = createdUserId ?? (await findCreatedUser());
  if (!id) {
    console.log("\nno probe account to clean up");
    return;
  }
  try {
    // Scoped to this one id: its profile row, then the auth user.
    await admin.database.from("profiles").delete().eq("id", id);
    await fetch(`${apiUrl}/api/auth/users`, {
      method: "DELETE",
      headers: { "x-api-key": adminKey, "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [id] }),
    });
    console.log(`\ncleaned up probe account ${id.slice(0, 8)}…`);
  } catch (error) {
    console.warn("cleanup warning:", error instanceof Error ? error.message : error);
  }
}

try {
  // ── Connect ──────────────────────────────────────────────────────────────
  let ws;
  for (let i = 0; i < 100; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) {
        ws = (await r.json()).webSocketDebuggerUrl;
        break;
      }
    } catch {
      /* not ready */
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

  const url = async () => (await evaluate("return location.pathname + location.search;")) ?? "";
  const bodyText = async () =>
    (await evaluate("return document.body ? document.body.innerText : '';")) ?? "";

  /** Poll a condition instead of sleeping a guessed duration. */
  async function waitUntil(probe, description, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await probe()) return true;
      await sleep(150);
    }
    console.warn(`  (timed out waiting for ${description}; at ${await url()})`);
    return false;
  }

  const waitForUrl = (fragment, timeoutMs) =>
    waitUntil(async () => (await url()).includes(fragment), `url to include ${fragment}`, timeoutMs);

  const waitForFunction = (expression, description, timeoutMs) =>
    waitUntil(async () => Boolean(await evaluate(expression)), description, timeoutMs);

  const checked = async (name) =>
    (await evaluate(
      `const out=[]; for (const el of document.querySelectorAll('input[name=${JSON.stringify(name)}]')) if (el.checked) out.push(el.value); return out;`,
    )) ?? [];

  /** Tick only what is off. A blind click UNCHECKS a default-checked control. */
  const ensureChecked = (name, values) =>
    evaluate(
      `for (const v of ${JSON.stringify(values)}) {
         const box = document.querySelector('input[name="'+${JSON.stringify(name)}+'"][value="'+v+'"]');
         if (box && !box.checked) document.querySelector('label[for="'+${JSON.stringify(name)}+'-'+v+'"]')?.click();
       }
       return true;`,
    );

  const clickLabel = (selector) =>
    evaluate(
      `const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return false; el.click(); return true;`,
    );

  /** Exactly what the browser would post, excluding React's framework fields. */
  const payload = async () =>
    (await evaluate(`
      const f = document.querySelector("form");
      if (!f) return null;
      const out = {};
      for (const [k, v] of new FormData(f).entries()) {
        if (k.startsWith("$")) continue;
        out[k] = out[k] ? [].concat(out[k], v) : v;
      }
      return out;`)) ?? null;

  /** Submit the current step, then wait for the route it should produce. */
  async function advanceTo(urlFragment) {
    const before = await url();
    await evaluate(`
      const f = document.querySelector("form");
      const buttons = [...f.querySelectorAll('button[type=submit]')];
      buttons[buttons.length - 1]?.click();
      return true;`);
    const ok = await waitUntil(async () => {
      const now = await url();
      return now !== before && now.includes(urlFragment);
    }, `advance to ${urlFragment}`);
    // Let the newly rendered step settle before anything reads its form.
    if (ok) await waitForFunction("return Boolean(document.querySelector('form'));", "step form");
    return ok;
  }

  async function goBackTo(urlFragment) {
    const before = await url();
    await evaluate(`
      const f = document.querySelector("form");
      [...f.querySelectorAll('button[type=submit]')][0]?.click();
      return true;`);
    return waitUntil(async () => {
      const now = await url();
      return now !== before && now.includes(urlFragment);
    }, `go back to ${urlFragment}`);
  }

  // ── 1. Sign up through the real form ─────────────────────────────────────
  step("A probe account signs up through the real form");

  await send("Page.navigate", { url: `${BASE}/sign-up` }, sessionId);
  await waitForFunction("return Boolean(document.querySelector('input[name=email]'));", "sign-up form");
  await evaluate(`
    const set = (name, value) => {
      const el = document.querySelector('input[name="'+name+'"]');
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    };
    set("email", ${JSON.stringify(email)});
    set("password", ${JSON.stringify(password)});
    return true;`);

  // The email form is the one holding the email input; the first form on the page
  // is Google OAuth, and clicking its button navigates to accounts.google.com.
  await evaluate(`
    const form = [...document.querySelectorAll("form")].find(f => f.querySelector('input[name="email"]'));
    form?.querySelector('button[type=submit]')?.click();
    return true;`);

  const signedUp = await waitUntil(async () => !(await url()).startsWith("/sign-up"), "leaving sign-up", 25_000);
  check("the probe account signs up and gets a session", signedUp, await url());
  createdUserId = await findCreatedUser();
  check("the probe account exists in the database", Boolean(createdUserId), createdUserId?.slice(0, 8) ?? "not found");

  // ── 2. Step 1: choose a language that is NOT the one in the URL ──────────
  step("Step 1 moves the wizard to the chosen language");

  await send("Page.navigate", { url: `${BASE}/${START_LANGUAGE}/onboarding` }, sessionId);
  await waitForUrl("/onboarding", 15_000);
  await waitForFunction(
    `return Boolean(document.querySelector('label[for="language-${TARGET_LANGUAGE}"]'));`,
    "step 1 language cards",
  );
  check("step 1 renders its language cards", (await url()).includes("/onboarding"), await url());

  await clickLabel(`label[for="language-${TARGET_LANGUAGE}"]`);
  await waitUntil(
    async () => (await checked("language")).includes(TARGET_LANGUAGE),
    "the chosen card to register as selected",
  );

  const stepOneForm = await payload();
  check(
    "step 1 submits the language that was chosen, not the URL's",
    stepOneForm?.language === TARGET_LANGUAGE,
    `language=${stepOneForm?.language}`,
  );

  // The route legitimately moves to the chosen language — expected behaviour.
  check("step 1 advances to step 2", await advanceTo("step=2"), await url());
  check(
    "the wizard follows the chosen language's route",
    (await url()).includes(`/${TARGET_LANGUAGE}/onboarding`),
    await url(),
  );

  // ── 3. Steps 2–5 ─────────────────────────────────────────────────────────
  step("Each step accepts its answers and advances");

  check(
    "step 2 shows the first-language picker",
    Boolean(await evaluate("return Boolean(document.querySelector('input[role=combobox]'));")),
  );
  check("step 2 shows no raw internal error", !/expected string|Too small/i.test(await bodyText()));
  check("step 2 advances to step 3", await advanceTo("step=3"), await url());

  await ensureChecked("motivation", ["travel", "school"]);
  await waitUntil(async () => (await checked("motivation")).length === 2, "two reasons to be selected");
  check(
    "two learning reasons are selected",
    (await checked("motivation")).length === 2,
    JSON.stringify(await checked("motivation")),
  );
  check("step 3 advances to step 4", await advanceTo("step=4"), await url());

  await clickLabel('label[for="level-A2"]');
  await clickLabel('label[for="goal-B1"]');
  await waitUntil(async () => (await checked("level"))[0] === "A2", "the level to register");
  check(
    "step 4 records a level and a goal",
    (await checked("level"))[0] === "A2" && (await checked("goal"))[0] === "B1",
    `${(await checked("level"))[0]}/${(await checked("goal"))[0]}`,
  );
  check("step 4 advances to step 5", await advanceTo("step=5"), await url());

  await clickLabel('label[for="dailyMinutes-20"]');
  await waitUntil(async () => (await checked("dailyMinutes"))[0] === "20", "the daily time to register");
  check("step 5 records the daily time", (await checked("dailyMinutes"))[0] === "20", (await checked("dailyMinutes"))[0]);
  check("step 5 advances to step 6", await advanceTo("step=6"), await url());

  // ── 4. Backward navigation must not erase state ──────────────────────────
  step("Going back and forward again preserves every answer");

  check("back reaches step 5", await goBackTo("step=5"), await url());
  check("back reaches step 4", await goBackTo("step=4"), await url());
  check("back reaches step 3", await goBackTo("step=3"), await url());
  check(
    "the reasons survived the round trip",
    (await checked("motivation")).length === 2,
    JSON.stringify(await checked("motivation")),
  );

  check("forward reaches step 4", await advanceTo("step=4"), await url());
  check("forward reaches step 5", await advanceTo("step=5"), await url());
  check("forward reaches step 6", await advanceTo("step=6"), await url());

  // ── 5. Step 6: skills, name, timezone ────────────────────────────────────
  step("Step 6 collects skills, name and timezone");

  await ensureChecked("skills", ["listening", "speaking"]);
  await waitUntil(async () => (await checked("skills")).length >= 2, "the skills to be selected");
  check(
    "at least two skills are selected",
    (await checked("skills")).length >= 2,
    JSON.stringify(await checked("skills")),
  );

  await evaluate(`
    const el = document.querySelector('input[name=displayName]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, "Probe Learner");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;`);
  await waitUntil(async () => (await payload())?.displayName === "Probe Learner", "the name to register");

  await waitUntil(
    async () => Boolean((await payload())?.timezone),
    "the browser-detected timezone to appear",
    10_000,
  );
  const timezone = (await payload())?.timezone;
  check(
    "the timezone is detected, not hard-coded",
    Boolean(timezone) && timezone !== "Europe/London",
    String(timezone),
  );

  // ── 6. The complete payload, then the real final submit ──────────────────
  step("The final submit carries the complete plan");

  const final = await payload();
  check("motivation count is above zero", (final?.motivation ?? []).length > 0, JSON.stringify(final?.motivation));
  check("skills count is above zero", (final?.skills ?? []).length > 0, JSON.stringify(final?.skills));
  check("language is the selected language", final?.language === TARGET_LANGUAGE, String(final?.language));
  check("native language is preserved", Boolean(final?.nativeLanguage), String(final?.nativeLanguage));
  check("level is preserved", final?.level === "A2", String(final?.level));
  check("goal is preserved", final?.goal === "B1", String(final?.goal));
  check("daily minutes are preserved", final?.dailyMinutes === "20", String(final?.dailyMinutes));
  check("display name is preserved", final?.displayName === "Probe Learner", String(final?.displayName));
  check("timezone is preserved", Boolean(final?.timezone), String(final?.timezone));

  await evaluate(`
    const f = document.querySelector("form");
    const buttons = [...f.querySelectorAll('button[type=submit]')];
    buttons[buttons.length - 1]?.click();
    return true;`);

  check("the final submit reaches the plan summary", await waitForUrl("/plan", 30_000), await url());
  check(
    "the plan is for the chosen language",
    (await url()).includes(`/${TARGET_LANGUAGE}/plan`),
    await url(),
  );
  check("no validation error is shown", !/at least one|expected string/i.test(await bodyText()));

  // ── 7. The database is the real proof ────────────────────────────────────
  step("The database holds the complete plan");

  const { data: learner } = await admin.database
    .from("learner_languages")
    .select("language_code,cefr_level,cefr_goal,daily_minutes,motivation,skill_priorities,is_active")
    .eq("user_id", createdUserId)
    .maybeSingle();
  const { data: profile } = await admin.database
    .from("profiles")
    .select("onboarding_state,onboarding_draft,native_language,display_name,timezone")
    .eq("id", createdUserId)
    .maybeSingle();

  check("the plan row exists for the probe user", Boolean(learner), learner ? "row present" : "no row");
  check("the saved language is the chosen one", learner?.language_code === TARGET_LANGUAGE, String(learner?.language_code));
  check("the saved reasons match the selection", (learner?.motivation ?? []).length === 2, JSON.stringify(learner?.motivation));
  check(
    "the saved skills match the selection",
    (learner?.skill_priorities ?? []).length >= 2,
    JSON.stringify(learner?.skill_priorities),
  );
  check(
    "the saved level and goal match",
    learner?.cefr_level === "A2" && learner?.cefr_goal === "B1",
    `${learner?.cefr_level}/${learner?.cefr_goal}`,
  );
  check("the saved daily minutes match", learner?.daily_minutes === 20, String(learner?.daily_minutes));
  check("onboarding is marked complete", profile?.onboarding_state === "complete", String(profile?.onboarding_state));
  check("the native language was saved", profile?.native_language === "en", String(profile?.native_language));
  check(
    "the draft was cleared once the plan was written",
    profile?.onboarding_draft === null,
    JSON.stringify(profile?.onboarding_draft),
  );

  // ── 8. The plan survives a reload ────────────────────────────────────────
  step("The plan persists across a reload");

  await send("Page.navigate", { url: `${BASE}/${TARGET_LANGUAGE}/plan` }, sessionId);
  await waitForUrl("/plan", 15_000);
  check("a reload still shows the plan", /plan is ready/i.test(await bodyText()), await url());
} catch (error) {
  console.error("\nverifier threw:", error);
  check("the verifier ran to completion", false, String(error).slice(0, 200));
} finally {
  await cleanup();
  try {
    chrome.kill("SIGKILL");
    await new Promise((resolve) => {
      if (chrome.exitCode !== null || chrome.signalCode !== null) return resolve();
      chrome.once("exit", resolve);
      setTimeout(resolve, 3000);
    });
  } catch {
    /* already gone */
  }
  await sleep(400);
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}

const failed = results.length - pass;
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
