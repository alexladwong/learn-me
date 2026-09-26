"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";
import { cx } from "@/lib/cx";

/**
 * Whether the desktop navigation rail is expanded.
 *
 * ## Why the state lives on `<html>` rather than in React
 *
 * The rail's width is a **layout** concern — it changes a grid column on the
 * element that wraps every page. If the width were React state, the grid would
 * render collapsed on the server, expand after hydration, and the whole page
 * would jump sideways on every load. Worse, a refresh would do it again.
 *
 * Putting the attribute on `<html>` means the width is correct in the very first
 * paint, and React only toggles an attribute. Same approach as the theme.
 */

const STORAGE_KEY = "learn-me:nav";
export const NAV_ATTRIBUTE = "data-nav";

export type NavState = "expanded" | "collapsed";

/**
 * Applies the stored state before first paint.
 *
 * Injected into the document head by the root layout, so the rail is already the
 * right width when the page paints. Defaults to `collapsed`: the rail is a
 * navigation aid, not the content, and a narrow rail gives the learner's
 * material the width on a first visit.
 */
export const NAV_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});document.documentElement.setAttribute(${JSON.stringify(
  NAV_ATTRIBUTE,
)},s==="expanded"?"expanded":"collapsed");}catch(e){document.documentElement.setAttribute(${JSON.stringify(
  NAV_ATTRIBUTE,
)},"collapsed");}})();`;

/**
 * Reads the attribute the pre-paint script set, and keeps it in sync.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`, for two reasons.
 * The attribute genuinely is an external store — it lives on `<html>` and can be
 * changed outside React — so this is the primitive designed for it. And it takes
 * a **server snapshot**, which is what keeps hydration honest: the server renders
 * `collapsed`, and React adopts the real value on the client without a
 * mismatch warning and without a second render pass.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [NAV_ATTRIBUTE],
  });
  return () => observer.disconnect();
}

/** The server cannot know a stored preference, and the script defaults to collapsed. */
const getServerSnapshot = (): NavState => "collapsed";

function getSnapshot(): NavState {
  return (
    (document.documentElement.getAttribute(NAV_ATTRIBUTE) as NavState | null) ??
    "collapsed"
  );
}

export function useNavState(): { state: NavState; toggle: () => void } {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next: NavState = getSnapshot() === "expanded" ? "collapsed" : "expanded";
    // The attribute drives the CSS variable, so the width changes in the same
    // frame the attribute does — no React render in between.
    document.documentElement.setAttribute(NAV_ATTRIBUTE, next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode with storage disabled: the rail still toggles for this
      // session, it just will not be remembered.
    }
  }, []);

  return { state, toggle };
}

/**
 * The rail's expand/collapse control.
 *
 * Placed at the rail's own footer rather than in the top bar: it changes the
 * rail, so it belongs to the rail, and the top bar is already carrying the
 * language switcher, theme and settings.
 */
export function NavToggle() {
  const { state, toggle } = useNavState();
  const expanded = state === "expanded";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={expanded}
      aria-controls="app-rail"
      title={expanded ? "Collapse navigation" : "Expand navigation"}
      className={cx(
        "press flex min-h-[44px] w-full items-center rounded-[var(--radius)] text-sm font-medium text-muted hover:bg-surface-hover hover:text-primary",
        expanded ? "gap-3 px-3" : "justify-center px-1",
      )}
    >
      <Icon name={expanded ? "arrowLeft" : "arrowRight"} size={18} />
      {/* Hidden when collapsed: the rail is icon-width and a label would wrap. */}
      {expanded ? <span>Collapse</span> : <span className="sr-only">Expand navigation</span>}
    </button>
  );
}
