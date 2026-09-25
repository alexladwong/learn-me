/**
 * The onboarding wizard's answers, persisted across its own remounts.
 *
 * A `useState` in the wizard turned out to be the wrong place for these, and the
 * reason is not obvious from reading the component. Each step is a Server Action
 * submit followed by `redirect()`, which makes Next refetch the route segment —
 * and that replaces the tree, unmounting the wizard. Measured directly: a DOM
 * marker set on the form was gone after one step, and the motivation chips read
 * back as empty on the following step, so the final submit always failed
 * validation and the plan was never saved.
 *
 * `sessionStorage` fixes it because it survives a remount and is scoped to the
 * tab. Session rather than local storage on purpose: a half-finished wizard is
 * not something to resurrect days later on a shared device.
 *
 * The shape, the defaults and the validation rules live in
 * `lib/onboarding/answers.ts` so they can be unit tested.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ONBOARDING_STORAGE_KEY,
  initialAnswers,
  sanitise,
  type OnboardingAnswers,
} from "@/lib/onboarding/answers";

function read(): OnboardingAnswers | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OnboardingAnswers) : null;
  } catch {
    // Storage disabled or holding something unparseable. Starting fresh is the
    // only safe answer; the learner re-answers at worst.
    return null;
  }
}

/** Forget the stored answers, so a finished plan cannot bleed into a new one. */
export function clearStoredAnswers(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function useOnboardingAnswers(
  languageCode: string,
  nativeLanguage: string | null,
): {
  answers: OnboardingAnswers;
  set: <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) => void;
  toggle: (key: "motivation" | "skills", value: string, on: boolean) => void;
} {
  const [answers, setAnswers] = useState<OnboardingAnswers>(() =>
    initialAnswers(languageCode, nativeLanguage),
  );

  /**
   * Whether the stored answers have been read yet.
   *
   * This flag is the fix for a write-before-read race that destroyed every answer
   * on every step. The sequence was:
   *
   *   1. the learner picks reasons; the write effect stores them
   *   2. Continue runs the Server Action, which redirects and remounts the wizard
   *   3. on remount `answers` is the *default* (`motivation: []`)
   *   4. the write effect ran before the deferred rehydrate read completed, so it
   *      overwrote storage with those defaults
   *   5. the rehydrate then found nothing useful, and the answers were gone
   *
   * Measured: storage held `["travel","work"]` immediately after clicking, and
   * `[]` one step later. Because storage is the only thing that survives the
   * remount, the wizard then submitted nothing but defaults — which is why the
   * final step reported a missing reason no matter what had been selected.
   *
   * Nothing is written until the stored value has been read, so a default state
   * can never clobber real answers.
   */
  const hydrated = useRef(false);

  // Rehydrate after mount, never during the first render: the server has no
  // `sessionStorage`, so reading it in the initialiser would render different
  // markup on the client than the server sent and fail hydration.
  //
  // Deferred to a microtask so the update lands after this effect rather than
  // during it — a synchronous `setState` in an effect body triggers a cascading
  // render, and React warns about exactly that.
  useEffect(() => {
    const stored = read();
    const fallback = initialAnswers(languageCode, nativeLanguage);

    if (!stored) {
      // Nothing to restore. Mark hydrated so the write effect can start
      // persisting the learner's own answers.
      hydrated.current = true;
      return;
    }

    void Promise.resolve().then(() => {
      setAnswers(sanitise(stored, fallback));
      hydrated.current = true;
    });
    // Intentionally mount-only: `languageCode`/`nativeLanguage` identify this
    // wizard, and re-running would clobber answers the learner is part-way
    // through.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Never write before the stored answers have been read — see `hydrated`.
    if (!hydrated.current) return;
    try {
      window.sessionStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(answers));
    } catch {
      // A full or disabled store must not break the wizard; the answers simply
      // will not survive a remount.
    }
  }, [answers]);

  const set = useCallback(
    <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) =>
      setAnswers((previous) => ({ ...previous, [key]: value })),
    [],
  );

  const toggle = useCallback((key: "motivation" | "skills", value: string, on: boolean) => {
    setAnswers((previous) => ({
      ...previous,
      [key]: on
        ? [...new Set([...previous[key], value])]
        : previous[key].filter((entry) => entry !== value),
    }));
  }, []);

  return { answers, set, toggle };
}
