import assert from "node:assert/strict";
import test from "node:test";

import { resolveAppOrigin } from "./env.ts";

/**
 * Origin resolution.
 *
 * The case that motivated these is real: `.env.local` held
 * `http://localhost:3000,https://learn-me-01.vercel.app` — two origins
 * comma-joined — and every caller fed it to `new URL()`. The failure appeared as
 * `Invalid URL` inside an OAuth redirect, nowhere near the value that caused it.
 */

test("a localhost origin is fine in development", () => {
  assert.equal(resolveAppOrigin("http://localhost:3000", { deployed: false }), "http://localhost:3000");
});

test("a trailing slash is trimmed, so joined paths do not double up", () => {
  assert.equal(resolveAppOrigin("https://learn-me-01.vercel.app/", { deployed: true }), "https://learn-me-01.vercel.app");
});

test("a production Vercel origin is accepted", () => {
  assert.equal(resolveAppOrigin("https://learn-me-01.vercel.app", { deployed: true }), "https://learn-me-01.vercel.app");
});

test("a Vercel preview hostname is accepted without special handling", () => {
  assert.equal(
    resolveAppOrigin("https://learn-me-git-main-alex.vercel.app", { deployed: true }),
    "https://learn-me-git-main-alex.vercel.app",
  );
});

test("a future custom domain needs no code change", () => {
  assert.equal(resolveAppOrigin("https://learnme.example.com", { deployed: true }), "https://learnme.example.com");
});

test("the comma-joined value that actually shipped is rejected, and named", () => {
  assert.throws(
    () =>
      resolveAppOrigin("http://localhost:3000,https://learn-me-01.vercel.app", {
        deployed: true,
      }),
    /contains a comma/,
  );
});

test("a relative value is rejected rather than silently resolved", () => {
  assert.throws(() => resolveAppOrigin("/learn-me", { deployed: true }), /not an absolute URL/);
});

test("localhost is refused in a production build", () => {
  assert.throws(
    () => resolveAppOrigin("http://localhost:3000", { deployed: true }),
    /points at localhost in a production build/,
  );
});

test("127.0.0.1 and 0.0.0.0 are refused in a production build too", () => {
  assert.throws(() => resolveAppOrigin("http://127.0.0.1:3000", { deployed: true }), /production build/);
  assert.throws(() => resolveAppOrigin("http://0.0.0.0:3000", { deployed: true }), /production build/);
});

test("a missing value fails loudly in production", () => {
  assert.throws(() => resolveAppOrigin(undefined, { deployed: true }), /Missing NEXT_PUBLIC_APP_URL/);
  assert.throws(() => resolveAppOrigin("   ", { deployed: true }), /Missing NEXT_PUBLIC_APP_URL/);
});

test("a missing value is allowed in development", () => {
  assert.equal(
    resolveAppOrigin(undefined, { deployed: false }),
    "http://localhost:3000",
  );
});

test("a local production build is not treated as a deployment", () => {
  // `next build` sets NODE_ENV=production on a laptop. Being strict there would
  // make `npm run build` fail and train everyone to fake a production URL.
  assert.equal(
    resolveAppOrigin("http://localhost:3000", { deployed: false }),
    "http://localhost:3000",
  );
  assert.equal(
    resolveAppOrigin(undefined, { deployed: false }),
    "http://localhost:3000",
  );
});

test("the native custom scheme is never a web origin", () => {
  // `learnme://auth/callback` is a separate concept and must not be substituted
  // for the web origin: `new URL("learnme://auth/callback").origin` is "null",
  // which would silently produce a broken redirect rather than an error.
  assert.throws(
    () => resolveAppOrigin("learnme://auth/callback", { deployed: true }),
    /must be an http\(s\) origin/,
  );
});
