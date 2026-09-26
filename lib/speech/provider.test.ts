/**
 * Unit tests for the speech layer's pure logic.
 *
 * Run:  npm test
 *
 * What is testable without a browser is exactly the part that has to be right:
 * locale mapping (so a Spanish phrase is never spoken by an English voice) and
 * cache-key stability (so the same sentence is never paid for twice once a server
 * provider is configured). The engine calls themselves are covered by hand.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LANGUAGE_LOCALES,
  SPEECH_RATES,
  localesFor,
  primaryLocale,
  serverSupports,
  speechCacheKey,
} from "./provider.ts";

describe("localesFor", () => {
  it("maps every language in the catalogue to a real BCP-47 tag", () => {
    // A bare `fr` is not a locale; the engine may pick the wrong regional voice
    // or none at all, so each entry must start with a specific tag.
    for (const code of Object.keys(LANGUAGE_LOCALES)) {
      const [primary] = localesFor(code);
      assert.match(primary, /^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$/, `${code} -> ${primary}`);
      assert.ok(primary.length >= 2, `${code} has no primary locale`);
    }
  });

  it("covers all fourteen languages the product models", () => {
    const expected = ["en","es","fr","de","pt","it","nl","ja","ko","zh","id","sw","lg","ar"];
    for (const code of expected) {
      assert.ok(LANGUAGE_LOCALES[code], `${code} is missing a locale mapping`);
    }
  });

  it("does not send a Latin-script locale for a non-Latin language", () => {
    // The specific bug this guards: routing every language through an English
    // voice because the code was passed straight through.
    assert.equal(primaryLocale("ja").split("-")[0], "ja");
    assert.equal(primaryLocale("ko").split("-")[0], "ko");
    assert.equal(primaryLocale("zh").split("-")[0], "zh");
    assert.equal(primaryLocale("ar").split("-")[0], "ar");
  });

  it("falls back to the code itself for an unknown language", () => {
    assert.deepEqual(localesFor("xx"), ["xx"]);
    assert.equal(primaryLocale("xx"), "xx");
  });
});

describe("speechCacheKey", () => {
  const base = { languageCode: "fr", text: "Bonjour, comment ça va ?", voice: "Amelie", speed: "normal" as const };

  it("is stable for the same clip", () => {
    assert.equal(speechCacheKey(base), speechCacheKey({ ...base }));
  });

  it("ignores case and extra whitespace", () => {
    // The same sentence saved from two lessons must not be generated twice.
    assert.equal(
      speechCacheKey(base),
      speechCacheKey({ ...base, text: "  bonjour,   comment ÇA va ?  " }),
    );
  });

  it("separates normal from slow", () => {
    // Different rate means a different file; serving the normal one for a slow
    // request would silently ignore the learner's choice.
    assert.notEqual(speechCacheKey(base), speechCacheKey({ ...base, speed: "slow" }));
  });

  it("separates languages and voices", () => {
    assert.notEqual(speechCacheKey(base), speechCacheKey({ ...base, languageCode: "es" }));
    assert.notEqual(speechCacheKey(base), speechCacheKey({ ...base, voice: "Thomas" }));
  });

  it("produces a filesystem-safe single path segment", () => {
    const key = speechCacheKey({ ...base, text: "¿Dónde está el baño? / 厕所" });
    assert.doesNotMatch(key, /[/\\]/);
    assert.ok(key.length <= 240, "key must fit a storage path");
  });

  it("distinguishes genuinely different text", () => {
    assert.notEqual(speechCacheKey(base), speechCacheKey({ ...base, text: "Bonjour" }));
  });
});

describe("SPEECH_RATES", () => {
  it("keeps slow fast enough to stay natural", () => {
    // Below roughly 0.6 the formants stretch far enough that vowels stop sounding
    // like the language, which teaches the wrong sound.
    assert.ok(SPEECH_RATES.slow >= 0.6 && SPEECH_RATES.slow < 1);
    assert.equal(SPEECH_RATES.normal, 1);
  });
});

describe("serverSupports", () => {
  it("excludes languages no mainstream provider voices", () => {
    assert.equal(serverSupports("lg"), false, "Luganda must not claim server support");
  });

  it("includes the launch languages", () => {
    for (const code of ["en", "es", "fr", "de"]) {
      assert.equal(serverSupports(code), true, `${code} should be speakable`);
    }
  });
});
