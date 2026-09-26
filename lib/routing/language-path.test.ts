import assert from "node:assert/strict";
import test from "node:test";

import {
  languageFromPath,
  replaceLanguageInPath,
  withSearch,
} from "./language-path.ts";

/**
 * Switching language is only invisible when the path arithmetic is right, and it
 * is wrong in ways that are easy to miss by hand: a route whose second segment
 * is a content id, a trailing slash, a path that is not in a language at all.
 * These are the cases the switcher actually produces.
 */

const CODES = ["fr", "es", "de"];

test("rewrites the language segment and keeps a shared route", () => {
  assert.equal(replaceLanguageInPath("/fr", "es", CODES), "/es");
  assert.equal(replaceLanguageInPath("/fr/settings", "es", CODES), "/es/settings");
  assert.equal(replaceLanguageInPath("/fr/path", "es", CODES), "/es/path");
  assert.equal(replaceLanguageInPath("/fr/bank", "es", CODES), "/es/bank");
  assert.equal(replaceLanguageInPath("/fr/progress", "es", CODES), "/es/progress");
  assert.equal(replaceLanguageInPath("/fr/plan", "es", CODES), "/es/plan");
  assert.equal(replaceLanguageInPath("/fr/review", "es", CODES), "/es/review");
  assert.equal(replaceLanguageInPath("/fr/speak", "es", CODES), "/es/speak");
});

test("a trailing slash is the same route, not a second segment", () => {
  assert.equal(replaceLanguageInPath("/fr/", "es", CODES), "/es");
  assert.equal(replaceLanguageInPath("/fr/settings/", "es", CODES), "/es/settings");
});

test("content-scoped routes fall back to the dashboard", () => {
  // A mission id belongs to one language's curriculum; carrying it over would
  // request a lesson that does not exist.
  assert.equal(replaceLanguageInPath("/fr/lesson/abc-123", "es", CODES), "/es");
  assert.equal(replaceLanguageInPath("/fr/drill/fingerprint", "es", CODES), "/es");
  assert.equal(replaceLanguageInPath("/fr/capture/source-id", "es", CODES), "/es");
});

test("nested routes under a content id also fall back", () => {
  assert.equal(
    replaceLanguageInPath("/fr/capture/source-id/preview", "es", CODES),
    "/es",
  );
});

test("a path that is not in a language goes to the new language", () => {
  assert.equal(replaceLanguageInPath("/", "es", CODES), "/es");
  assert.equal(replaceLanguageInPath("/languages", "es", CODES), "/es");
  assert.equal(replaceLanguageInPath("/settings", "es", CODES), "/es");
  assert.equal(replaceLanguageInPath("/offline", "es", CODES), "/es");
});

test("only a real language code is treated as one", () => {
  // `/api` and `/dev` are three lowercase letters. A `[a-z]{2,3}` pattern would
  // read them as languages; the known-code list does not.
  assert.equal(replaceLanguageInPath("/api/health", "es", CODES), "/es");
  assert.equal(replaceLanguageInPath("/dev", "es", CODES), "/es");
  // A code the learner is not enrolled in is not a language segment either.
  assert.equal(replaceLanguageInPath("/it/settings", "es", CODES), "/es");
});

test("switching to the language already in the path is idempotent", () => {
  assert.equal(replaceLanguageInPath("/fr/settings", "fr", CODES), "/fr/settings");
});

test("the nav rail reads the language from the URL", () => {
  assert.equal(languageFromPath("/es/settings", CODES, "fr"), "es");
  assert.equal(languageFromPath("/fr", CODES, "es"), "fr");
  assert.equal(languageFromPath("/de/bank", CODES, "fr"), "de");
});

test("the nav rail falls back when the path carries no language", () => {
  assert.equal(languageFromPath("/languages", CODES, "fr"), "fr");
  assert.equal(languageFromPath("/", CODES, "fr"), "fr");
  assert.equal(languageFromPath("/api/health", CODES, "fr"), "fr");
});

test("a query string survives the rewrite when the caller passes it", () => {
  assert.equal(
    withSearch(replaceLanguageInPath("/fr/bank", "es", CODES), "?q=hola"),
    "/es/bank?q=hola",
  );
  assert.equal(withSearch("/es", ""), "/es");
  assert.equal(withSearch("/es", "q=hola"), "/es?q=hola");
});
