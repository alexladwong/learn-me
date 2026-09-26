// Relative with explicit extensions, not the `@/` alias: `lib/**` is also run by
// the bare `node --test` runner, which has no path mapping.
import { userFacingMessage } from "../errors.ts";
import { replaceLanguageInPath, withSearch } from "./language-path.ts";

/**
 * What a language switch is going to do, decided before anything happens.
 *
 * Split out of the switcher for one reason: the failure branch is the part of
 * this control that is hardest to see and easiest to get wrong. Making the
 * decision a pure function means it can be tested directly, instead of only
 * through a browser in circumstances that are awkward to reproduce — a dropped
 * connection during a client navigation tends to take the router down with it,
 * so a browser test of that path mostly measures the framework.
 */

export type LanguageSwitchPlan = {
  /** Where the learner is now, including the query — where a failure returns them. */
  originalHref: string;
  /** Where the switch goes when it succeeds. */
  nextPath: string;
  /**
   * False when the chosen language is already the one in the path. The caller
   * must not revalidate, navigate or write anything in that case.
   */
  changesLanguage: boolean;
};

export function planLanguageSwitch(input: {
  pathname: string;
  search: string;
  currentCode: string;
  nextCode: string;
  knownCodes: Iterable<string>;
}): LanguageSwitchPlan {
  const { pathname, search, currentCode, nextCode, knownCodes } = input;

  return {
    originalHref: withSearch(pathname, search),
    nextPath: withSearch(
      replaceLanguageInPath(pathname, nextCode, knownCodes),
      search,
    ),
    changesLanguage: nextCode !== currentCode,
  };
}

/** The shape a Server Action returns here. */
export type SwitchLanguageOutcome = { error: string | null };

/**
 * The message to show, or `null` when the write landed.
 *
 * A server action can fail in two different ways and both have to end in the
 * same place. The action returns `{ error }` for a write it rejected — the
 * language is not on the account, the row is gone. The promise *rejects* when
 * the request never completed: offline, a dropped connection, a 500. Left
 * unhandled, the second case would leave the switcher showing a language the
 * server never accepted, which is the exact divergence this control exists to
 * prevent.
 *
 * The message is filtered through `userFacingMessage`, so a driver error that
 * escaped the action's own handling is replaced by the sentence rather than
 * printed at a learner.
 */
export function switchFailureMessage(
  outcome: SwitchLanguageOutcome | null,
  thrown?: unknown,
): string | null {
  if (thrown !== undefined) {
    /*
     * A rejection carries no authored copy — it is a `TypeError` from `fetch` or
     * whatever the runtime raised. Passing it through the friendly-message guard
     * would let "Failed to fetch" onto the screen, so a thrown error always gets
     * the written sentence.
     */
    void thrown;
    return "Could not reach the server. Your language was not changed.";
  }
  // No result at all is not a success. Only an explicit `error: null` is.
  if (outcome === null) return "Could not change your language.";
  if (outcome.error === null) return null;
  return userFacingMessage(outcome.error, "Could not change your language.");
}
