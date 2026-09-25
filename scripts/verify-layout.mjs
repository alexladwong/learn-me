/**
 * Responsive layout verification, measured in real headless Chrome.
 *
 * Run:  npm run verify:layout
 *
 * The product must work at 320, 375, 390, 430, 768 and 1024 pixels. A static scan
 * for `w-[400px]` catches arbitrary widths but misses what actually breaks a
 * narrow screen: a grid that will not shrink, a long target-language sentence
 * that cannot wrap, a four-column stat row, or a sticky bar whose contents
 * overflow. Only a layout engine answers those.
 *
 * So this drives Chrome over the DevTools Protocol against the `/probe` route,
 * which renders every presentational component with deliberately unflattering
 * content (the longest sentence in the curriculum, a long gloss, a wide number),
 * and measures the rendered result at each width.
 *
 * What it asserts, per width:
 *   1. the document does not scroll horizontally
 *   2. no element overflows the viewport, and the offending element is named
 *   3. every interactive control clears a 44x44 touch target
 *   4. text does not render below 11px
 *
 * Chrome is used through its built-in DevTools Protocol with Node's own
 * WebSocket client, so there is no test-runner or browser-driver dependency.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE_URL = process.env.PROBE_URL ?? "http://localhost:3000";
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** The widths the product is required to work at, narrowest first. */
const WIDTHS = [
  { width: 320, label: "320 (smallest supported phone)", touch: true },
  { width: 375, label: "375 (iPhone SE / 8)", touch: true },
  { width: 390, label: "390 (iPhone 14)", touch: true },
  { width: 430, label: "430 (iPhone 14 Pro Max)", touch: true },
  { width: 768, label: "768 (tablet portrait)", touch: false },
  { width: 1024, label: "1024 (tablet landscape / small laptop)", touch: false },
];

/**
 * Minimum comfortable touch target, in CSS pixels.
 *
 * 44 is the figure both Apple's and Google's guidance converge on. A control
 * below it is not merely tight; on a phone it is a mis-tap waiting to happen,
 * and this product is used one-handed.
 */
const MIN_TOUCH_TARGET = 44;

/** Below this, text stops being comfortably readable on a phone. */
const MIN_FONT_SIZE = 11;

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

// ---------------------------------------------------------------------------
// Chrome lifecycle
// ---------------------------------------------------------------------------
const profileDir = mkdtempSync(path.join(tmpdir(), "learnme-layout-"));

/**
 * A fixed, unlikely port. Chrome cannot choose one for us without either parsing
 * its stderr or reading the profile's `DevToolsActivePort` file, and a fixed port
 * makes the readiness check a plain HTTP poll.
 */
const DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT ?? 9333);

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
    // A fixed device scale factor keeps measurement in CSS pixels, which is what
    // the CSS is written in.
    "--force-device-scale-factor=1",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

/**
 * Wait for Chrome to accept DevTools connections.
 *
 * Polls the HTTP endpoint rather than parsing stderr for the
 * "DevTools listening on ..." line. That line is emitted reliably, but reading it
 * from a child process's stderr turns a simple readiness check into a race
 * against stream buffering — and the HTTP endpoint is the documented interface
 * anyway.
 */
async function waitForDevToolsUrl(port, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "no response";

  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome exited early with code ${chrome.exitCode}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const info = await response.json();
        if (typeof info.webSocketDebuggerUrl === "string") {
          return info.webSocketDebuggerUrl;
        }
        lastError = "no webSocketDebuggerUrl in /json/version";
      } else {
        lastError = `HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Chrome did not open DevTools on port ${port}: ${lastError}`);
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
    socket.addEventListener("error", () => reject(new Error(`could not connect to ${url}`)), {
      once: true,
    });
  });
  return { socket, send: makeClient(socket) };
}

// ---------------------------------------------------------------------------
// The measurement itself, evaluated inside the page
// ---------------------------------------------------------------------------
/**
 * Runs in the browser. Returns everything the assertions need in one round trip,
 * so measurement is not interleaved with navigation.
 */
const MEASURE = `(() => {
  const viewportWidth = window.innerWidth;

  // Anything wider than the viewport, or positioned past its right edge.
  const overflowing = [];
  for (const element of document.querySelectorAll("body *")) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const overflowRight = rect.right - viewportWidth;
    const overflowLeft = -rect.left;
    if (overflowRight > 1 || overflowLeft > 1) {
      overflowing.push({
        tag: element.tagName.toLowerCase(),
        probe: element.closest("[data-probe]")?.getAttribute("data-probe") ?? "page",
        cls: (element.className && typeof element.className === "string")
          ? element.className.slice(0, 90)
          : "",
        text: (element.textContent || "").trim().slice(0, 50),
        overflowRight: Math.round(overflowRight),
        overflowLeft: Math.round(overflowLeft),
        width: Math.round(rect.width),
      });
    }
  }

  // Interactive controls below the touch-target minimum.
  const smallTargets = [];
  const interactive = document.querySelectorAll(
    "a[href], button, input:not([type=hidden]), select, textarea, [role=button], summary"
  );
  for (const element of interactive) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none") continue;
    // Deliberately hidden affordances (sr-only) are excluded by their size.
    if (rect.height < 2 || rect.width < 2) continue;
    if (rect.height < ${MIN_TOUCH_TARGET} - 0.5 || rect.width < ${MIN_TOUCH_TARGET} - 0.5) {
      smallTargets.push({
        tag: element.tagName.toLowerCase(),
        probe: element.closest("[data-probe]")?.getAttribute("data-probe") ?? "page",
        label: (element.textContent || element.getAttribute("aria-label") || "").trim().slice(0, 40),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      });
    }
  }

  // Text smaller than the readable floor.
  const tinyText = [];
  for (const element of document.querySelectorAll("body *")) {
    if (!element.textContent || !element.textContent.trim()) continue;
    const hasOwnText = Array.from(element.childNodes).some(
      (node) => node.nodeType === 3 && node.textContent.trim().length > 0
    );
    if (!hasOwnText) continue;
    const size = parseFloat(getComputedStyle(element).fontSize);
    if (size > 0 && size < ${MIN_FONT_SIZE}) {
      tinyText.push({
        tag: element.tagName.toLowerCase(),
        size,
        text: element.textContent.trim().slice(0, 40),
      });
    }
  }

  return {
    viewportWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    overflowing: overflowing.slice(0, 8),
    overflowingCount: overflowing.length,
    smallTargets: smallTargets,
    smallTargetCount: smallTargets.length,
    tinyText: tinyText.slice(0, 5),
    tinyTextCount: tinyText.length,
  };
})()`;

// ---------------------------------------------------------------------------
// Drive it
// ---------------------------------------------------------------------------
let exitCode = 0;

try {
  const browserSocketUrl = await waitForDevToolsUrl(DEBUG_PORT);
  const browser = await connect(browserSocketUrl);

  // A fresh target per run, so nothing is measured inside a stale page.
  const { targetId } = await browser.send("Target.createTarget", {
    url: `${BASE_URL}/probe`,
  });
  const { sessionId } = await browser.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });

  // With flattening, commands carry the session id.
  const sessionSend = (method, params = {}) => {
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

  let loaded = false;
  for (const width of WIDTHS) {
    await sessionSend("Emulation.setDeviceMetricsOverride", {
      width: width.width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width.width <= 430,
    });

    if (!loaded) {
      // Wait for the page to finish loading before the first measurement.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      loaded = true;
    }
    // Re-layout after the metrics change.
    await new Promise((resolve) => setTimeout(resolve, 350));

    const { result } = await sessionSend("Runtime.evaluate", {
      expression: MEASURE,
      returnByValue: true,
    });

    const m = result.value;

    record(
      `${width.label}: no horizontal scrolling`,
      m.documentScrollWidth <= m.viewportWidth + 1,
      `document scrollWidth ${m.documentScrollWidth} vs viewport ${m.viewportWidth}`,
    );

    record(
      `${width.label}: nothing overflows the viewport`,
      m.overflowingCount === 0,
      m.overflowingCount === 0
        ? "no element extends past the edge"
        : `${m.overflowingCount} element(s), first: <${m.overflowing[0].tag}> in [${m.overflowing[0].probe}] overflowing by ${m.overflowing[0].overflowRight}px — "${m.overflowing[0].text}"`,
    );

    // The 44px floor binds where there is a finger. From the `sm` breakpoint up
    // the app deliberately relaxes to denser controls for a pointer, so the same
    // rule is applied here — otherwise the check would demand phone-sized
    // buttons on a desktop and the rule would be wrong rather than strict.
    const touchApplies = width.touch;

    record(
      `${width.label}: touch targets are at least ${MIN_TOUCH_TARGET}px${touchApplies ? "" : " (pointer device: informational)"}`,
      !touchApplies || m.smallTargetCount === 0,
      m.smallTargetCount === 0
        ? "every control clears the minimum"
        : `${m.smallTargetCount} too small:\n${m.smallTargets
            .map(
              (t) =>
                `        <${t.tag}> [${t.probe}] ${t.w}x${t.h} — "${t.label}"`,
            )
            .join("\n")}`,
    );

    record(
      `${width.label}: text is at least ${MIN_FONT_SIZE}px`,
      m.tinyTextCount === 0,
      m.tinyTextCount === 0
        ? "no unreadably small text"
        : `${m.tinyTextCount} too small, first: ${m.tinyText[0].size}px`,
    );
  }

  await browser.send("Target.closeTarget", { targetId });
} catch (error) {
  console.error(`\nlayout verification could not run: ${error.message}`);
  console.error(
    "Is the dev server running on http://localhost:3000? Try `npm run dev` first.",
  );
  exitCode = 1;
} finally {
  chrome.kill("SIGKILL");
  rmSync(profileDir, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

if (failed.length > 0) exitCode = 1;
process.exit(exitCode);
