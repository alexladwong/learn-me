/**
 * Bank filter parsing, shared by the Server Component and the client view.
 *
 * This lives in its own module rather than beside the view because of a Next.js
 * boundary rule that is easy to trip over: **every export of a `"use client"`
 * module is a client reference**, regardless of whether the thing exported is a
 * component or a plain function.
 *
 * `parseBankFilter` is pure — it reads the query string and returns a shape — and
 * the Server Component needs it to build the database query. While it lived in
 * `bank-view.tsx` (which must be a client module, because it handles filter
 * interactions), importing it into the page failed at runtime with:
 *
 *   Attempted to call parseBankFilter() from the server but parseBankFilter is on
 *   the client.
 *
 * Same code, wrong side of the boundary. A pure helper that both sides need
 * belongs in a module with no directive at all, which is this one.
 */

export type BankFilterValues = {
  kind: "all" | "word" | "sentence";
  search: string;
  favoritesOnly: boolean;
};

/** Read the bank's filters out of the URL query. */
export function parseBankFilter(params: {
  kind?: string | string[];
  q?: string | string[];
  favorites?: string | string[];
}): BankFilterValues {
  const kind = typeof params.kind === "string" ? params.kind : "all";
  return {
    kind: kind === "word" || kind === "sentence" ? kind : "all",
    search: typeof params.q === "string" ? params.q : "",
    favoritesOnly: params.favorites === "1",
  };
}
