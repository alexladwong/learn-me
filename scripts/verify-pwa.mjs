/**
 * PWA and offline-shell verification.
 *
 * Run:  npm run verify:pwa                      (against a running `npm start`)
 *       BASE_URL=http://localhost:3001 npm run verify:pwa
 *
 * Everything here failed silently before it was checked. The proxy matcher did
 * not exclude `sw.js` or `.webmanifest`, so both were redirected to `/sign-in`
 * with a 307 — the service worker never registered and the manifest never
 * loaded, and the only symptom was that offline mode quietly did nothing. A
 * browser does not surface either failure anywhere a developer would look.
 *
 * So this asserts the things that have to be true for offline to work at all,
 * against a real server rather than the source files: the bytes a browser would
 * actually receive.
 */

const base = process.env.BASE_URL ?? "http://localhost:3000";

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
function step(title) {
  console.log(`\n── ${title}`);
}

async function get(path) {
  const response = await fetch(`${base}${path}`, { redirect: "manual" });
  const body = await response.text().catch(() => "");
  return { status: response.status, type: response.headers.get("content-type") ?? "", body };
}

try {
  // ── 1. The three files a PWA is made of ──────────────────────────────────
  step("The browser can fetch the files it needs, without a session");

  const manifest = await get("/manifest.webmanifest");
  const sw = await get("/sw.js");
  const offline = await get("/offline");

  record(
    "the web manifest is served, not redirected to sign-in",
    manifest.status === 200 && manifest.type.includes("manifest"),
    `${manifest.status} ${manifest.type}`,
  );

  record(
    "the service worker is served from the scope root",
    sw.status === 200 && /javascript/.test(sw.type),
    `${sw.status} ${sw.type}`,
  );

  record(
    "the offline fallback renders without a session",
    offline.status === 200 && offline.body.includes("offline"),
    `${offline.status}`,
  );

  // ── 2. The manifest is installable ───────────────────────────────────────
  step("The manifest is valid and installable");

  let parsed = null;
  try {
    parsed = JSON.parse(manifest.body);
  } catch {
    parsed = null;
  }

  record("the manifest is valid JSON", parsed !== null, parsed ? "parsed" : "unparseable");

  if (parsed) {
    const required = ["name", "short_name", "start_url", "display", "icons"];
    const missing = required.filter((field) => !parsed[field]);
    record(
      "it declares every field an install prompt requires",
      missing.length === 0,
      missing.length > 0 ? `missing: ${missing.join(", ")}` : required.join(", "),
    );

    record(
      "it opens standalone rather than in a browser tab",
      parsed.display === "standalone",
      `display=${parsed.display}`,
    );

    record(
      "its start_url stays inside its scope",
      typeof parsed.scope === "string" && parsed.start_url.startsWith("/") && parsed.scope === "/",
      `start_url=${parsed.start_url} scope=${parsed.scope}`,
    );

    // A manifest that points at a missing icon fails to install with no visible
    // reason, so every declared icon is fetched.
    const iconUrls = Array.isArray(parsed.icons) ? parsed.icons.map((icon) => icon.src) : [];
    const iconChecks = await Promise.all(iconUrls.map((src) => get(src)));
    const badIcons = iconUrls.filter((_, index) => iconChecks[index]?.status !== 200);

    record(
      "every icon it declares actually exists",
      iconUrls.length > 0 && badIcons.length === 0,
      badIcons.length > 0 ? `missing: ${badIcons.join(", ")}` : `${iconUrls.length} icon(s) served`,
    );

    record(
      "a maskable icon is provided for launchers that crop",
      Array.isArray(parsed.icons) &&
        parsed.icons.some((icon) => String(icon.purpose ?? "").includes("maskable")),
      "so the glyph is not clipped on Android",
    );
  }

  // ── 3. The service worker's rules ────────────────────────────────────────
  step("The worker caches the shell and refuses to cache learner data");

  record(
    "it never caches API or data responses",
    /pathname\.startsWith\("\/api\/"\)/.test(sw.body) &&
      sw.body.includes("/_next/data/") &&
      sw.body.includes("isNeverCached"),
    "a cached schedule would show cards that are not due",
  );

  record(
    "it leaves non-GET requests alone",
    /request\.method !== "GET"/.test(sw.body),
    "submissions must reach the server untouched",
  );

  record(
    "it only handles same-origin requests",
    sw.body.includes("url.origin !== self.location.origin"),
    "the backend is on another origin and must not be proxied",
  );

  record(
    "it treats navigations as network-first",
    /request\.mode === "navigate"/.test(sw.body) && sw.body.includes("await fetch(request)"),
    "a page opened online is always the current page",
  );

  record(
    "it only caches content-hashed build output",
    /isImmutableAsset\(url\)/.test(sw.body) &&
      sw.body.includes('url.pathname.startsWith("/_next/static/")') &&
      // The old extension-only rule cached any `.svg`/`.woff2` forever, including
      // files whose URL survives a deploy.
      !/\.\(\?:css\|js\|woff2\?/.test(sw.body),
    "so a replaceable asset such as /icon.svg can never be pinned",
  );

  record(
    "it pre-caches the offline fallback",
    sw.body.includes('"/offline"') && sw.body.includes("SHELL_ASSETS"),
    "so a failed navigation has somewhere to land",
  );

  record(
    "it removes caches from previous versions on activate",
    sw.body.includes("caches.delete") && sw.body.includes("learn-me-shell-"),
    "an old cache surviving a deploy would serve stale page shells",
  );

  // ── 4. The page declares what the browser reads ──────────────────────────
  step("The document advertises the manifest and theme");

  const home = await get("/sign-in");

  record(
    "the document links the manifest",
    /rel="manifest"/.test(home.body) && home.body.includes("/manifest.webmanifest"),
    "without this the install prompt never appears",
  );

  record(
    "a theme colour is declared so the status bar matches",
    home.body.includes("theme-color"),
    "otherwise mobile browsers paint a default bar",
  );

  record(
    "zoom is not locked, so text can still be enlarged",
    !/user-scalable\s*=\s*no/.test(home.body) && !/maximum-scale\s*=\s*1/.test(home.body),
    "pinch-zoom is an accessibility need",
  );

  // ── 5. Nothing auth-gated leaked into the public surface ─────────────────
  step("Making these routes public did not expose learner data");

  const protectedPaths = ["/settings", "/es", "/fr/path", "/es/review", "/es/bank"];
  const leaked = [];
  for (const path of protectedPaths) {
    const response = await get(path);
    const redirected = response.status === 307 || response.status === 302 || response.status === 303;
    const looksLikeSignIn = response.body.includes("sign-in") || response.status === 200;
    if (!redirected || !looksLikeSignIn) leaked.push(`${path} (${response.status})`);
  }

  record(
    "every learner route still redirects to sign-in when signed out",
    leaked.length === 0,
    leaked.length > 0 ? `leaked: ${leaked.join(", ")}` : `${protectedPaths.length} routes gated`,
  );
} catch (error) {
  console.error("\nPWA verification threw:", error);
  record("the PWA checks ran to completion", false, String(error).slice(0, 300));
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
