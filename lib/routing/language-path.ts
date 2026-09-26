/**
 * Moving between the languages a learner already studies, without leaving the
 * page they are on.
 *
 * Pure and directive-free on purpose: `components/layout/language-switcher.tsx`
 * is a Client Component, so anything it exports becomes a client reference and
 * cannot be called from a Server Component. Keeping the path arithmetic here
 * means the switcher, the nav rail and the tests all share one implementation.
 */

/**
 * Sub-routes that mean the same thing in every language.
 *
 * These are the routes whose *page* is defined by code rather than by content:
 * `/fr/settings` and `/es/settings` are the same screen showing the same
 * learner. Switching language on one of them should land on its equivalent.
 *
 * Deliberately excluded, because the second segment is a content id that only
 * exists in the language it was fetched from:
 *   - `lesson/[missionId]`  — a mission belongs to one language's curriculum
 *   - `drill/[fingerprint]` — a drill is built from that language's review queue
 *   - `capture/[sourceId]`  — a saved text is in one language
 * Carrying those ids across languages would request a lesson that does not
 * exist, so those paths fall back to the target language's dashboard.
 */
export const PORTABLE_SEGMENTS: ReadonlySet<string> = new Set([
  "settings",
  "path",
  "bank",
  "progress",
  "plan",
  "review",
  "speak",
]);

/** `/fr/` and `/fr` are the same route; this makes the two compare equal. */
function normalize(pathname: string): string {
  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.replace(/\/+$/, "");
  }
  return withLeadingSlash;
}

/**
 * The language a path is currently in, or `fallback` when it is not in one.
 *
 * Used by the navigation rail, which has to link to the language the learner is
 * *looking at* rather than the one stored as primary. Those two differ for the
 * moment after a switch and for as long as a learner browses another language,
 * and linking to the stored one would silently teleport them.
 *
 * `knownLanguageCodes` is required rather than pattern-matched: `/api` and
 * `/dev` are three lowercase letters, and a `[a-z]{2,3}` test would read them as
 * language segments.
 */
export function languageFromPath(
  pathname: string,
  knownLanguageCodes: Iterable<string>,
  fallback: string,
): string {
  const [, first] = normalize(pathname).split("/");
  if (!first) return fallback;
  return contains(knownLanguageCodes, first) ? first : fallback;
}

/**
 * Rewrite the language segment of a path.
 *
 *   /fr                -> /es
 *   /fr/settings       -> /es/settings
 *   /fr/path           -> /es/path
 *   /fr/bank           -> /es/bank
 *   /fr/progress       -> /es/progress
 *
 *   /fr/lesson/abc-123 -> /es      (the id is French-only)
 *   /languages         -> /es      (nothing to translate)
 *   /settings          -> /es
 *   /                  -> /es
 *
 * The query string is not part of `pathname` in Next's router, so callers that
 * need to keep one append it themselves — see `withSearch`.
 */
export function replaceLanguageInPath(
  pathname: string,
  nextLanguageCode: string,
  knownLanguageCodes: Iterable<string>,
): string {
  const segments = normalize(pathname).split("/");
  const first = segments[1];
  const second = segments[2];

  if (first === undefined || !contains(knownLanguageCodes, first) || !second) {
    return `/${nextLanguageCode}`;
  }
  if (!PORTABLE_SEGMENTS.has(second)) return `/${nextLanguageCode}`;

  return `/${nextLanguageCode}/${second}`;
}

/** Append the current query string, if there is one, to a rewritten path. */
export function withSearch(path: string, search: string): string {
  if (!search) return path;
  return search.startsWith("?") ? `${path}${search}` : `${path}?${search}`;
}

/**
 * Membership without building an array.
 *
 * `[...codes].includes(x)` allocates a copy on every call, and this runs during
 * render on every navigation.
 */
function contains(codes: Iterable<string>, value: string): boolean {
  for (const code of codes) {
    if (code === value) return true;
  }
  return false;
}
