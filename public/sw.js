/**
 * Service worker: an offline-capable app shell.
 *
 * The scope is deliberately narrow. This worker exists so the review screen can
 * *open* without a connection — the reviews themselves are held by the offline
 * queue in `lib/offline/queue.ts`, not here. Getting that boundary wrong is how a
 * service worker starts serving a learner stale data they cannot reason about,
 * so:
 *
 *   - Learner data is never cached. Anything under `/api/` or the Next.js data
 *     endpoints goes straight to the network, because a cached schedule is worse
 *     than no schedule: it would show a card as due that has already been
 *     answered, or hide one that has come due.
 *   - Navigations are network-first. A page a learner opens online is always the
 *     current page; the cache is only a fallback for when the network is gone.
 *   - Static build assets are cache-first, because they are content-hashed and
 *     therefore immutable — a new build produces new URLs.
 *
 * A wrong cache is a bug that survives a reload, which makes it far more
 * expensive than a slow request, so the default here is "do not cache".
 */

const VERSION = "v2";
const SHELL_CACHE = `learn-me-shell-${VERSION}`;

/** The minimum needed to render something offline rather than a browser error. */
const SHELL_ASSETS = ["/offline", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one missing asset cannot fail the whole install.
      await Promise.all(
        SHELL_ASSETS.map((asset) =>
          cache.add(new Request(asset, { cache: "reload" })).catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("learn-me-shell-") && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Never cached: authentication and data.
 *
 * `/api/` covers both the app's own route handlers and the backend calls the
 * server makes on the learner's behalf.
 */
function isNeverCached(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/") ||
    url.searchParams.has("_rsc")
  );
}

/**
 * Only genuinely immutable build output.
 *
 * This used to also match any URL ending in `.woff2`, `.css`, `.js`, `.svg` and
 * so on, by extension alone. That assumed every such file is content-hashed,
 * which is not true of everything served from this origin — a favicon, a static
 * icon, an uploaded avatar. Those keep the same URL across deploys, so
 * cache-first would pin the first version forever with no way for the learner to
 * clear it.
 *
 * Next.js puts a content hash in every path under `/_next/static/`, so that
 * prefix is the honest signal that a cached response can never be stale.
 */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Only same-origin requests; the backend lives on another origin and must not
  // be proxied through this cache.
  if (url.origin !== self.location.origin) return;
  if (isNeverCached(url)) return;

  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })(),
    );
    return;
  }

  // Navigations: the network is authoritative, the cache is the safety net.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const offline = await cache.match("/offline");
          if (offline) return offline;
          return new Response(
            "<!doctype html><meta charset=utf-8><title>Offline</title><p>You are offline. Your answers are saved on this device and will sync when you reconnect.",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
  }
});
