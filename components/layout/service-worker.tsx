"use client";

import { useEffect } from "react";

/**
 * Register the service worker.
 *
 * Renders nothing: it exists so the app shell can be cached for offline use and
 * the offline route can be reached without a connection. Registration is
 * deliberately quiet — a learner does not need to know a service worker exists,
 * and a failure here must not break the page, so every error is swallowed after
 * being logged.
 *
 * Only in production. In development the worker would cache the dev bundle and
 * serve stale chunks after every edit, which looks exactly like a broken build.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        console.warn("[pwa] service worker registration failed", error);
      });
    };

    // Wait for load so registration never competes with the first render for
    // bandwidth — on a slow connection that race is visible.
    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
