/**
 * The onboarding draft's shape and merge rule.
 *
 * Pure and free of database imports so the merge semantics — the part that
 * actually protects a learner's answers — are unit testable under Node's bare
 * test runner. The database read/write lives in `lib/db/learner.ts`.
 *
 * The rule: a step writes only the fields it owns. Anything it omits is
 * preserved, because omitting a field means "this step has nothing to say about
 * it", never "clear it". That distinction is what let the previous browser-only
 * design lose five selected reasons on the way to the final step.
 */

export type OnboardingDraft = {
  language?: string;
  nativeLanguage?: string;
  motivation?: string[];
  level?: string;
  goal?: string;
  dailyMinutes?: number;
  skills?: string[];
  displayName?: string;
  timezone?: string;
};

/**
 * Merge `patch` into `current`, returning a new object.
 *
 * `undefined` and `null` are skipped rather than assigned: they mean "not
 * provided on this step". An empty array *is* assigned, because a step that owns
 * a multi-select and receives nothing is telling us the learner cleared it.
 */
export function mergeDraft(
  current: OnboardingDraft,
  patch: OnboardingDraft,
): OnboardingDraft {
  const merged: OnboardingDraft = { ...current };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    (merged as Record<string, unknown>)[key] = value;
  }

  return merged;
}
