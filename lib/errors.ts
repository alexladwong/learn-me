/**
 * Keeping internal validation text away from learners.
 *
 * Zod messages come in two kinds, and the difference matters:
 *
 *   - **Authored** — a message someone wrote on purpose: "Choose at least one
 *     reason". These are the good case and should be shown as-is.
 *   - **Library-generated** — produced by a bare `z.string().min(2)` with no
 *     message: "Too small: expected string to have >=2 characters". These are
 *     written for the developer reading a stack trace, not for a learner on a
 *     phone, and they were reaching the screen — a screenshot showed exactly that
 *     string under a correctly selected "English".
 *
 * The rule enforced here: if a message looks like it was written for a
 * developer, it is replaced with the caller's friendly fallback. Authored
 * messages pass through untouched, so no copy is lost.
 *
 * This is a guard, not a fix. The actual defects — a form field that submitted
 * its search text, and issue ordering that reported the wrong step — are fixed
 * at their source. This exists so that the *next* unguarded `min(2)` cannot reach
 * a learner either.
 */

/**
 * Shapes that only ever appear in machine-generated validation text.
 *
 * Each is deliberately specific. A loose pattern such as /expected/ would also
 * swallow a legitimate sentence like "Choose the expected answer", so these match
 * the literal phrasings Zod and its siblings emit.
 */
const INTERNAL_PATTERNS: RegExp[] = [
  /expected\s+(string|number|boolean|array|object|date|integer|bigint|symbol|null|undefined)/i,
  /too\s+(small|big|large|short|long)\b/i,
  /invalid\s+(type|input|enum value|literal|union|arguments?|date)\b/i,
  /^required$/i,
  /unrecognized key/i,
  /\bZodError\b/,
  /issues?\s*\[/i,
  /\bexpected\s+.{0,20}\bto\s+(have|be|match|contain)\b/i,
  // SQL / driver shapes.
  /\b(select|insert|update|delete)\b[\s\S]{0,40}\bfrom\b/i,
  /violates\s+(foreign key|unique|check|not-null)/i,
  /\bpermission denied\b/i,
  /\brelation\s+"[^"]+"\s+does not exist\b/i,
  // Runtime shapes that should have been logged, not displayed.
  /\b(TypeError|ReferenceError|SyntaxError)\b/,
  /is not a function/,
  /Cannot read propert(y|ies) of (undefined|null)/,
];

/**
 * True when a message is safe to show a learner.
 *
 * Empty messages are not safe — a blank error box is worse than a generic one.
 */
export function isUserFacingMessage(message: unknown): message is string {
  if (typeof message !== "string") return false;
  const trimmed = message.trim();
  if (trimmed.length < 3) return false;
  // A message ending in a file path or code fence is a stack trace fragment.
  if (/\((?:[a-z]:)?[\\/][^)]+\)$/i.test(trimmed)) return false;
  return !INTERNAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * The message to show, or `fallback` when the original was not written for a
 * human. Always returns a usable string.
 */
export function userFacingMessage(message: unknown, fallback: string): string {
  return isUserFacingMessage(message) ? message.trim() : fallback;
}

/**
 * Pick the first safely displayable message from a list of schema issues.
 *
 * Used where a form has several fields and any of them failing should produce a
 * readable line rather than whichever issue happened to be ordered first.
 */
export function firstUserFacingMessage(
  issues: ReadonlyArray<{ message?: string }> | undefined,
  fallback: string,
): string {
  for (const issue of issues ?? []) {
    if (isUserFacingMessage(issue?.message)) return issue.message.trim();
  }
  return fallback;
}
