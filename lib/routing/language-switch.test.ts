import assert from "node:assert/strict";
import test from "node:test";

import {
  planLanguageSwitch,
  switchFailureMessage,
} from "./language-switch.ts";

const CODES = ["fr", "es", "de"];

test("a switch plans where it goes and where a failure returns to", () => {
  const plan = planLanguageSwitch({
    pathname: "/fr/settings",
    search: "",
    currentCode: "fr",
    nextCode: "es",
    knownCodes: CODES,
  });

  assert.equal(plan.nextPath, "/es/settings");
  assert.equal(plan.originalHref, "/fr/settings");
  assert.equal(plan.changesLanguage, true);
});

test("the query string survives both directions", () => {
  const plan = planLanguageSwitch({
    pathname: "/fr/bank",
    search: "?q=hola",
    currentCode: "fr",
    nextCode: "es",
    knownCodes: CODES,
  });

  assert.equal(plan.nextPath, "/es/bank?q=hola");
  assert.equal(plan.originalHref, "/fr/bank?q=hola");
});

test("a content-scoped route plans a fallback but still remembers the original", () => {
  // Reverting has to return to the lesson, even though the forward path could
  // not carry its id across languages.
  const plan = planLanguageSwitch({
    pathname: "/fr/lesson/abc-123",
    search: "",
    currentCode: "fr",
    nextCode: "es",
    knownCodes: CODES,
  });

  assert.equal(plan.nextPath, "/es");
  assert.equal(plan.originalHref, "/fr/lesson/abc-123");
});

test("choosing the language already in the path changes nothing", () => {
  const plan = planLanguageSwitch({
    pathname: "/fr",
    search: "",
    currentCode: "fr",
    nextCode: "fr",
    knownCodes: CODES,
  });

  assert.equal(plan.changesLanguage, false);
  assert.equal(plan.nextPath, "/fr");
});

test("a write that landed produces no error and no revert", () => {
  assert.equal(switchFailureMessage({ error: null }), null);
});

test("a write the action rejected is reported as written", () => {
  assert.equal(
    switchFailureMessage({ error: "That language is not on your account." }),
    "That language is not on your account.",
  );
});

test("a request that never completed is reported, not swallowed", () => {
  // The rejection case. Without this the optimistic label would stay on a
  // language the server never accepted.
  assert.equal(
    switchFailureMessage(null, new TypeError("Failed to fetch")),
    "Could not reach the server. Your language was not changed.",
  );
  assert.equal(
    switchFailureMessage(null, "NetworkError when attempting to fetch resource."),
    "Could not reach the server. Your language was not changed.",
  );
});

test("a developer-shaped message never reaches the learner", () => {
  // The action wraps its own errors, but a `TypeError` that escaped would
  // otherwise be printed verbatim.
  assert.equal(
    switchFailureMessage({ error: "Cannot read properties of undefined (reading 'id')" }),
    "Could not change your language.",
  );
  assert.equal(
    switchFailureMessage({ error: "permission denied for table learner_languages" }),
    "Could not change your language.",
  );
});

test("an empty outcome is treated as a failure, not a success", () => {
  // `null` would mean "the action never returned a result", which must not be
  // read as "the write landed".
  assert.equal(switchFailureMessage(null), "Could not change your language.");
});
