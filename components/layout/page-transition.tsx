"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Plays a short enter transition whenever the route changes.
 *
 * ## Why this does not remount its children
 *
 * The obvious implementation is `<div key={pathname}>`, which restarts a CSS
 * animation for free. It also destroys and rebuilds the entire DOM subtree on
 * every navigation — losing focus, scroll position inside the page, and the
 * state of any form the learner was midway through. The animation is not worth
 * that.
 *
 * So the wrapper persists and the animation is replayed by removing the class,
 * forcing a reflow, and adding it back. The forced reflow is the price of
 * restarting an animation without a remount, and it costs one layout read on a
 * navigation that is already doing far more work.
 *
 * Reduced motion is handled in CSS, not here: the global
 * `prefers-reduced-motion` block collapses the animation to nothing, so this
 * component does not need to know the preference.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.classList.remove("page-enter");
    // Reading `offsetWidth` flushes the style change, so the re-added class
    // starts a new animation instead of being a no-op.
    void element.offsetWidth;
    element.classList.add("page-enter");
  }, [pathname]);

  return <div ref={ref}>{children}</div>;
}
