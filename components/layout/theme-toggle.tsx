"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";

/**
 * Appearance control.
 *
 * The product is **light by default**, so this exists to let a learner opt into
 * dark rather than to let the operating system decide. Previously a dark-set
 * machine never saw the light theme at all, which meant the design the product is
 * actually built around was the one some people could not reach.
 *
 * The stored choice is applied before first paint by the inline script in
 * `app/layout.tsx`, so this component only has to read it back and toggle it —
 * there is no flash of the wrong theme on load.
 */

const STORAGE_KEY = "learn-me:theme";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // Read the *current* state from the document rather than from storage, so this
  // agrees with the pre-paint script even if they ever diverge. Deferred to a
  // microtask: a synchronous setState in an effect body triggers a cascading
  // render, which is exactly what this control does not need.
  useEffect(() => {
    void Promise.resolve().then(() => {
      const defined = document.documentElement.dataset.theme;
      setDark(
        defined
          ? defined === "dark"
          : window.matchMedia("(prefers-color-scheme: dark)").matches,
      );
    });
  }, []);

  const toggle = () => {
    const next = dark ? "light" : "dark";
    if (next === "dark") {
      document.documentElement.dataset.theme = "dark";
    } else {
      // "light" is the default, so it is expressed by removing the attribute.
      delete document.documentElement.dataset.theme;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A disabled store must not break the control; the choice just will not
      // survive a reload.
    }
    setDark(!dark);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className="flex size-9 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-surface-hover hover:text-primary"
    >
      <Icon name={dark ? "sun" : "moon"} size={17} />
    </button>
  );
}

/**
 * The pre-paint theme script.
 *
 * Runs synchronously in `<head>` so the correct palette is present on the very
 * first frame. Doing this in an effect would render the light theme first and
 * then swap, which is a visible flash on every navigation.
 *
 * It is inline and tiny deliberately: any external request here would reintroduce
 * the flash it exists to prevent.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="dark"){document.documentElement.dataset.theme="dark"}else if(t==="system"){document.documentElement.dataset.theme="system"}}catch(e){}})();`;
