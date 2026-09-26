"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { stopAllAudio } from "@/lib/speech/player";

/**
 * Stop audio when the route changes.
 *
 * A clip must not outlive the screen it belongs to: navigating from a lesson to
 * the path while a sentence is still being spoken is the same class of bug as two
 * clips playing at once, and it is more likely — the learner has already moved
 * on. Mounted once in the app shell rather than in each screen, so nothing can
 * forget to do it.
 *
 * Also stops on `visibilitychange` (a backgrounded tab) and on unmount.
 */
export function AudioLifecycle() {
  const pathname = usePathname();

  useEffect(() => {
    stopAllAudio();
  }, [pathname]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") stopAllAudio();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      stopAllAudio();
    };
  }, []);

  return null;
}
