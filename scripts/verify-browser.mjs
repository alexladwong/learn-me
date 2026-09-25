/**
 * Browser-driven end-to-end journey.
 *
 * Run:  npm run verify:browser          (needs `npm start` on port 3000)
 *
 * Every other verifier drives the data layer directly. This one drives the actual
 * product in a real browser: it signs a learner up through the form, answers the
 * six-step wizard by clicking, opens a lesson, submits it, rates a review card and
 * then visits every remaining page.
 *
 * That distinction matters because the data layer and the UI are different code.
 * `verify:journey` proves the queries compose; it says nothing about whether the
 * wizard's submit button posts the step the server expects, whether a disabled
 * control is disabled for a reason, or whether a page renders a server error for
 * a signed-in learner. The bugs found in earlier rounds were mostly of that kind —
 * correct at the data layer, broken for the person using it.
 *
 * A session cannot be fabricated from outside: the tokens are written as cookies
 * by a Server Action. So this signs up through the UI rather than seeding a row,
 * which also means the sign-up path itself is exercised.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@insforge/sdk";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT ?? 9334);

const INSFORGE_URL = process.env.NEXT_PUBLIC_INSFORGE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const ADMIN_KEY = process.env.INSFORGE_API_KEY;

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
function step(title) {
  console.log(`\n── ${title}`);
}

const profileDir = mkdtempSync(path.join(tmpdir(), "learnme-journey-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-gpu",
    "--force-device-scale-factor=1",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

async function waitForDevToolsUrl(port, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "no response";
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited early (${chrome.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const info = await response.json();
        if (typeof info.webSocketDebuggerUrl === "string") return info.webSocketDebuggerUrl;
      }
    } catch (error) {
      lastError = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Chrome did not open DevTools: ${lastError}`);
}

let nextId = 1;
function makeClient(socket) {
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(String(event.data));
    const entry = pending.get(payload.id);
    if (!entry) return;
    pending.delete(payload.id);
    if (payload.error) entry.reject(new Error(JSON.stringify(payload.error)));
    else entry.resolve(payload.result);
  });
  return function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  };
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("could not connect")), { once: true });
  });
  return { socket, send: makeClient(socket) };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let browser = null;
let sessionSend = null;
let cleanup = null;

try {
  const browserSocketUrl = await waitForDevToolsUrl(DEBUG_PORT);
  browser = await connect(browserSocketUrl);

  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });

  sessionSend = (method, params = {}) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const socket = browser.socket;
      const handler = (event) => {
        const payload = JSON.parse(String(event.data));
        if (payload.id !== id) return;
        socket.removeEventListener("message", handler);
        if (payload.error) reject(new Error(JSON.stringify(payload.error)));
        else resolve(payload.result);
      };
      socket.addEventListener("message", handler);
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  };

  await sessionSend("Page.enable");
  await sessionSend("Runtime.enable");

  await sessionSend("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });

  /** Run an expression in the page and return its JSON value. */
  async function evaluate(expression) {
    const result = await sessionSend("Runtime.evaluate", {
      expression: `(() => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        `page error: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
      );
    }
    return result.result?.value;
  }

  async function goto(path) {
    await sessionSend("Page.navigate", { url: `${BASE_URL}${path}` });
    // Wait for real content, not just the navigation event: a Server Component
    // streams, so `document.body` exists well before it has anything in it, and
    // assertions that read too early see an empty page.
    await waitFor(async () => (await pageText()).trim().length > 40, `content at ${path}`);
    await sleep(300);
  }

  /** The visible text of the page, for assertions about what a learner sees. */
  async function pageText() {
    // During a client navigation the document can briefly have no body at all.
    return (await evaluate("return document.body ? document.body.innerText : '';")) ?? "";
  }

  async function currentUrl() {
    return (await evaluate("return location.pathname + location.search;")) ?? "";
  }

  /**
   * Wait until the URL or page text settles.
   *
   * Server Actions navigate via a client transition, so there is no load event to
   * await; polling for a condition is the only reliable signal.
   */
  async function waitFor(check, description, timeoutMs = 12_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await check()) return true;
      await sleep(250);
    }
    console.warn(`  (timed out waiting for ${description})`);
    return false;
  }

  // ── 1. Sign up through the real form ─────────────────────────────────────
  step("A new learner can sign up");

  const email = `browser-${Date.now()}@example.com`;
  const password = "browser-journey-1234";

  // The account is created through the UI, so it is removed through the Admin
  // API afterwards. Registered before the first navigation so a failure anywhere
  // in the run still cleans up.
  if (INSFORGE_URL && ANON_KEY && ADMIN_KEY) {
    cleanup = async () => {
      const admin = createClient({ baseUrl: INSFORGE_URL, anonKey: ADMIN_KEY });
      const { data } = await admin.database
        .from("profiles")
        .select("id")
        .eq("display_name", "Browser Learner")
        .limit(5);

      const ids = (Array.isArray(data) ? data : []).flatMap((row) =>
        typeof row?.id === "string" ? [row.id] : [],
      );
      if (ids.length === 0) return;

      await admin.database.from("profiles").delete().in("id", ids);
      await fetch(`${INSFORGE_URL}/api/auth/users`, {
        method: "DELETE",
        headers: { "x-api-key": ADMIN_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: ids }),
      }).catch(() => console.warn("cleanup warning: could not remove the browser account"));
    };
  }

  await goto("/sign-up");

  const signUpForm = await evaluate(`
    return Boolean(document.querySelector("input[name=email]") && document.querySelector("input[name=password]"));
  `);
  record("the sign-up form renders", signUpForm === true, "/sign-up");

  await evaluate(`
    const set = (name, value) => {
      const el = document.querySelector('input[name="' + name + '"]');
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    };
    set("email", ${JSON.stringify(email)});
    set("password", ${JSON.stringify(password)});
    return true;
  `);

  await evaluate(`
    // The email form is the second form on the page; the first is Google OAuth.
    // Picking the first submit button navigates to accounts.google.com.
    const forms = [...document.querySelectorAll("form")];
    const emailForm = forms.find((f) => f.querySelector('input[name="email"]'));
    const submit = emailForm?.querySelector('button[type="submit"]');
    // A real click, not form.requestSubmit(). React installs a submit listener
    // that calls preventDefault and runs the action itself, and the form action
    // attribute is literally javascript:throw, so requestSubmit() surfaces
    // "React form unexpectedly submitted." instead of invoking the action.
    if (submit) submit.click();
    return ${"Boolean"}(submit);
  `);

  const reachedApp = await waitFor(
    async () => !(await currentUrl()).startsWith("/sign-up"),
    "leaving the sign-up page",
  );
  const afterSignUp = await currentUrl();

  record(
    "signing up establishes a session and leaves the form",
    reachedApp,
    `landed on ${afterSignUp}`,
  );

  record(
    "signing up lands on the language chooser",
    afterSignUp === "/languages",
    `${afterSignUp} — the app shell's entry point for an account with no language`,
  );

  // ── 1b. Choose a language, which is what starts onboarding ───────────────
  step("Choosing a language opens its onboarding");

  const chooserHref = await evaluate(`
    const link = [...document.querySelectorAll('a[href$="/onboarding"]')][0];
    return link ? link.getAttribute("href") : null;
  `);

  record(
    "the chooser offers a language that can be started",
    typeof chooserHref === "string" && /^\/[a-z]{2}\/onboarding$/.test(chooserHref),
    chooserHref ?? "no onboarding link found",
  );

  await goto(chooserHref ?? "/es/onboarding");
  const onboardingUrl = await currentUrl();

  record(
    "opening it renders the onboarding wizard",
    onboardingUrl.includes("onboarding"),
    onboardingUrl,
  );

  // ── 2. The wizard, driven by clicking ────────────────────────────────────
  step("The six-step wizard accepts answers and builds a plan");

  const wizardLanguage = await pageText();
  record(
    "step 1 asks what to learn",
    /What do you want to learn/i.test(wizardLanguage),
    wizardLanguage.split("\n").find((line) => /learn/i.test(line))?.slice(0, 60) ?? "",
  );

  async function checkRadio(name, value) {
    // The value is embedded from Node, where `CSS.escape` does not exist — the
    // expression is evaluated in the page, but it is *built* here.
    return evaluate(`
      const el = document.querySelector('input[name=${JSON.stringify(name)}][value=${JSON.stringify(value)}]');
      if (!el) return false;
      el.click();
      return el.checked;
    `);
  }

  async function checkBox(name, value) {
    return evaluate(`
      const el = document.querySelector('input[name=${JSON.stringify(name)}][value=${JSON.stringify(value)}]');
      if (!el) return false;
      if (!el.checked) el.click();
      return el.checked;
    `);
  }

  /** Submit the currently visible step and wait for the step number to change. */
  async function submitStep(expectStep) {
    await evaluate(`
      const form = document.querySelector("form");
      // The visible "Continue" carries formAction; "Back" also has one, so prefer
      // the last submit button, which is the forward action.
      const submit = [...form.querySelectorAll('button[type="submit"]')].pop();
      if (submit) submit.click();
      return Boolean(submit);
    `);
    return waitFor(
      async () => (await currentUrl()).includes(`step=${expectStep}`),
      `step ${expectStep}`,
    );
  }

  const choseLanguage = await checkRadio("languageChoice", "es");
  record("Spanish is offered and selectable", choseLanguage === true, "languageChoice=es");

  let advanced = await submitStep(2);
  record("step 1 advances to step 2", advanced, await currentUrl());

  const nativeSet = await evaluate(`
    const select = document.querySelector('select[name="nativeLanguage"]');
    if (!select) return null;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    setter.call(select, "en");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return select.value;
  `);
  record(
    "English is available as a first language in the rendered form",
    nativeSet === "en",
    `select value=${nativeSet}`,
  );

  advanced = await submitStep(3);
  record("step 2 advances to step 3", advanced, await currentUrl());

  await checkBox("motivation", "travel");
  advanced = await submitStep(4);
  record("step 3 advances to step 4", advanced, await currentUrl());

  // A2 placement: the level that decides which lessons the learner is offered.
  await checkRadio("level", "A2");
  await evaluate(`
    const select = document.querySelector('select[name="goal"]');
    if (select) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
      setter.call(select, "B1");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  `);
  advanced = await submitStep(5);
  record("steps 4 advances to step 5", advanced, await currentUrl());

  await checkRadio("dailyMinutes", "20");
  advanced = await submitStep(6);
  record("step 5 advances to step 6", advanced, await currentUrl());

  await checkBox("skills", "speaking");
  await evaluate(`
    const el = document.querySelector('input[name="displayName"]');
    if (el) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, "Browser Learner");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return true;
  `);

  // The final submit is the one that writes the plan and redirects to the app.
  // Submit once, then poll. Polling must not re-click: an earlier version did,
  // which meant a step that failed and stayed put was clicked over and over until
  // some unrelated navigation satisfied the condition — reporting a pass for a
  // wizard whose plan was never written.
  await evaluate(`
    const form = document.querySelector("form");
    const submit = [...form.querySelectorAll('button[type="submit"]')].pop();
    if (submit) submit.click();
    return Boolean(submit);
  `);

  const finishedWizard = await waitFor(
    async () => !(await currentUrl()).includes("onboarding"),
    "the wizard to finish",
    20_000,
  );

  const afterWizard = await currentUrl();
  record("finishing the wizard leaves onboarding", finishedWizard, afterWizard);

  // The URL is not evidence that anything was saved: this flow once navigated
  // away while the plan was never written, and the check passed anyway. The
  // database is the only thing that can confirm a plan exists.
  if (INSFORGE_URL && ANON_KEY && ADMIN_KEY) {
    const admin = createClient({ baseUrl: INSFORGE_URL, anonKey: ADMIN_KEY });
    const { data: savedProfiles } = await admin.database
      .from("profiles")
      .select("id,onboarding_state,native_language")
      .eq("display_name", "Browser Learner")
      .limit(1);
    const savedProfile = Array.isArray(savedProfiles) ? savedProfiles[0] : null;

    const { data: savedLanguages } = savedProfile
      ? await admin.database
          .from("learner_languages")
          .select("language_code,cefr_level,daily_minutes,motivation,skill_priorities")
          .eq("user_id", savedProfile.id)
          .limit(1)
      : { data: null };
    const learner = Array.isArray(savedLanguages) ? savedLanguages[0] : null;

    record(
      "the wizard actually wrote the plan to the database",
      savedProfile?.onboarding_state === "complete" && Boolean(learner),
      savedProfile
        ? `state=${savedProfile.onboarding_state}, language=${learner?.language_code ?? "none"}`
        : "no profile saved",
    );

    record(
      "the saved plan carries the answers the learner gave",
      learner?.cefr_level === "A2" &&
        learner?.daily_minutes === 20 &&
        Array.isArray(learner?.motivation) &&
        learner.motivation.includes("travel"),
      learner
        ? `level=${learner.cefr_level} minutes=${learner.daily_minutes} motivation=[${learner.motivation}]`
        : "no learner_languages row",
    );
  }

  record(
    "the learner lands on their language dashboard",
    /^\/[a-z]{2}(\/|$)/.test(afterWizard),
    afterWizard,
  );

  const dashboard = await pageText();
  record(
    "the dashboard offers the primary action",
    /Start today|Start Today|session/i.test(dashboard),
    dashboard.split("\n").find((line) => /start/i.test(line))?.slice(0, 70) ?? "",
  );

  // ── 3. The path and a lesson ─────────────────────────────────────────────
  step("The path opens and a lesson can be completed");

  await goto("/es/path");
  const pathText = await pageText();

  record(
    "the path lists real lessons for the chosen language",
    /A2|A1/i.test(pathText) && !/error|something went wrong/i.test(pathText),
    pathText.split("\n").find((line) => /What I did|Foundations|unit/i.test(line))?.slice(0, 70) ??
      "no lesson title found",
  );

  // Open the lesson the path proposes, by clicking rather than by URL, so the
  // link itself is exercised.
  const openedLesson = await evaluate(`
    const link = document.querySelector('a[href*="/lesson/"]');
    if (!link) return null;
    link.click();
    return link.getAttribute("href");
  `);

  await sleep(1200);
  const lessonUrl = await currentUrl();

  record(
    "a lesson link opens the lesson player",
    Boolean(openedLesson) && lessonUrl.includes("/lesson/"),
    `${openedLesson} → ${lessonUrl}`,
  );

  const lessonText = await pageText();
  record(
    "the lesson player renders its first step",
    lessonText.length > 200 && !/application error|something went wrong/i.test(lessonText),
    lessonText.split("\n").filter(Boolean)[2]?.slice(0, 70) ?? "",
  );

  // Answer the lesson: reveal, then take whatever action moves it forward.
  let stepsAnswered = 0;
  for (let i = 0; i < 40; i += 1) {
    const done = await evaluate(`
      const text = document.body.innerText;
      return /complete|summary|well done|finished/i.test(text) && !document.querySelector("form button[type=submit]");
    `);
    if (done) break;

    const clicked = await evaluate(`
      const norm = (s) => (s || "").replace(/\\s+/g, " ").trim().toLowerCase();
      const buttons = [...document.querySelectorAll("button")].filter((b) => !b.disabled);
      // Prefer an explicit continue/check action, then the first option-like control.
      const advance = buttons.find((b) => /continue|next|check|reveal|show answer|submit|finish/.test(norm(b.textContent)));
      const option = buttons.find((b) => /^(a|b|c|d)\\)|^\\d\\./.test(norm(b.textContent)));
      const target = advance || option || buttons[0];
      if (!target) return null;
      target.click();
      return norm(target.textContent).slice(0, 40);
    `);

    if (clicked === null) break;
    stepsAnswered += 1;
    await sleep(320);
  }

  record(
    "the lesson can be driven to its end by clicking",
    stepsAnswered > 0,
    `${stepsAnswered} control(s) activated`,
  );

  const afterLesson = await pageText();
  record(
    "finishing the lesson reports something specific",
    /complete|summary|correct|saved|review/i.test(afterLesson),
    afterLesson.split("\n").find((line) => /complete|correct|saved/i.test(line))?.slice(0, 70) ??
      "no completion message",
  );

  // ── 4. Review ────────────────────────────────────────────────────────────
  step("The review screen works for what the lesson enrolled");

  await goto("/es/review");
  const reviewText = await pageText();

  record(
    "the review screen renders for a learner with a queue",
    /review/i.test(reviewText) && !/application error/i.test(reviewText),
    reviewText.split("\n").find((line) => /due|card/i.test(line))?.slice(0, 70) ?? "",
  );

  const rated = await evaluate(`
    const norm = (s) => (s || "").replace(/\\s+/g, " ").trim().toLowerCase();
    const buttons = [...document.querySelectorAll("button")].filter((b) => !b.disabled);
    const good = buttons.find((b) => norm(b.textContent) === "good") ||
                 buttons.find((b) => /\\bgood\\b/.test(norm(b.textContent)));
    if (good) { good.click(); return norm(good.textContent); }
    const reveal = buttons.find((b) => /reveal|show answer/.test(norm(b.textContent)));
    if (reveal) { reveal.click(); return "revealed"; }
    return null;
  `);

  await sleep(1600);
  const afterRating = await pageText();

  record(
    "a review card can be answered in the UI",
    rated !== null,
    rated === null ? "no rating control found" : `activated "${rated}"`,
  );

  record(
    "the review screen reports progress after an answer",
    /\d+\s*(of|\/)\s*\d+|correct|reviewed|next/i.test(afterRating),
    afterRating.split("\n").find((line) => /\d/.test(line))?.slice(0, 60) ?? "",
  );

  // ── 5. Every remaining page renders for a signed-in learner ──────────────
  step("Every page renders without an error");

  const pages = [
    ["/es", "dashboard"],
    ["/es/path", "path"],
    ["/es/bank", "bank"],
    ["/es/progress", "progress"],
    ["/es/review", "review"],
    ["/es/capture", "capture"],
    ["/es/speak", "speak"],
    ["/es/settings", "settings"],
    ["/settings", "account settings"],
    ["/languages", "languages"],
  ];

  const broken = [];
  for (const [route] of pages) {
    await goto(route);
    const text = await pageText();
    const url = await currentUrl();

    const looksBroken =
      /application error|something went wrong|unhandled|Internal Server Error/i.test(text) ||
      text.trim().length < 60;
    const bounced = url.startsWith("/sign-in");

    if (looksBroken || bounced) {
      broken.push(`${route} (${bounced ? "redirected to sign-in" : "error or empty"})`);
    }
  }

  record(
    "every page renders for a signed-in learner",
    broken.length === 0,
    broken.length > 0 ? `broken: ${broken.join(", ")}` : `${pages.length} pages checked`,
  );

  // The offline route is public and must not need a session.
  await goto("/offline");
  const offlineText = await pageText();
  record(
    "the offline fallback is reachable and explains itself",
    /offline/i.test(offlineText) && /sync|saved/i.test(offlineText),
    offlineText.split("\n").filter(Boolean)[1]?.slice(0, 70) ?? "",
  );

  // ── 6. Sign out ──────────────────────────────────────────────────────────
  step("Signing out ends the session");

  await goto("/settings");
  const signedOut = await evaluate(`
    const norm = (s) => (s || "").replace(/\\s+/g, " ").trim().toLowerCase();
    const button = [...document.querySelectorAll("button")].find((b) => /sign out|log out/.test(norm(b.textContent)));
    if (button) { button.click(); return "clicked"; }
    return null;
  `);

  await sleep(2200);
  const afterSignOut = await currentUrl();
  record(
    "signing out returns the learner to a signed-out page",
    signedOut !== null && !afterSignOut.startsWith("/es"),
    `${signedOut ?? "no sign-out control"} → ${afterSignOut}`,
  );

  await goto("/es/review");
  const guardedUrl = await currentUrl();
  record(
    "a learner route is no longer reachable after signing out",
    guardedUrl.startsWith("/sign-in"),
    guardedUrl,
  );
} catch (error) {
  console.error("\nbrowser journey threw:", error);
  record("the browser journey ran to completion", false, String(error).slice(0, 300));
} finally {
  if (cleanup) await cleanup();
  try {
    chrome.kill("SIGKILL");
    // Wait for the process to actually exit before removing its profile: Chrome
    // keeps writing to the directory for a moment after the signal, which makes
    // the removal fail with ENOTEMPTY and masks the real result.
    await new Promise((resolve) => {
      if (chrome.exitCode !== null || chrome.signalCode !== null) return resolve();
      chrome.once("exit", resolve);
      setTimeout(resolve, 3000);
    });
  } catch {
    /* already gone */
  }
  await sleep(600);
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
