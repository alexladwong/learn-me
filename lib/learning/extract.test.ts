/**
 * Unit tests for content-based vocabulary extraction.
 *
 * Run:  npm test
 *
 * The property that matters most: the shortlist must not be filler. A list of
 * "el, la, de, que" is worse than an empty one, because it teaches the learner
 * that the feature is not worth opening. So the tests check that function words
 * are excluded, that known words are never re-offered, and that the ranking puts
 * recurring content words at the top.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_CANDIDATE_LIMIT,
  MAX_SOURCE_CHARS,
  extractCandidates,
  foldKey,
  hasStopwords,
  splitSentences,
  stopwordsFor,
  tokenise,
} from "./extract.ts";

const ARTICLE = `Buenos días. Ayer visité el mercado central con mi hermana.
El mercado estaba muy lleno porque era sábado por la mañana.
Compramos tomates, cebollas y un kilo de arroz.
Mi hermana quería comprar pescado fresco, pero el pescado ya se había acabado.
Al final compramos pollo y verduras para la cena.
El mercado cierra a las dos de la tarde, así que tuvimos que darse prisa.
Mañana volveremos al mercado más temprano para comprar pescado.`;

describe("foldKey", () => {
  it("removes accents so a typed answer can match a stored one", () => {
    assert.equal(foldKey("café"), "cafe");
    assert.equal(foldKey("MAÑANA"), "manana");
    assert.equal(foldKey("¿Cómo?"), "¿como?");
  });

  it("keeps apostrophes, which are part of the word in French", () => {
    assert.equal(foldKey("l'homme"), "l'homme");
    assert.equal(foldKey("L’homme"), "l'homme");
  });

  it("makes accented and unaccented forms compare equal", () => {
    assert.equal(foldKey("sábado"), foldKey("sabado"));
  });
});

describe("tokenise", () => {
  it("splits on punctuation and whitespace", () => {
    assert.deepEqual(tokenise("Hola, ¿qué tal?"), ["Hola", "qué", "tal"]);
  });

  it("keeps internal apostrophes and hyphens together", () => {
    assert.deepEqual(tokenise("l'homme est là-bas"), ["l'homme", "est", "là-bas"]);
  });

  it("drops single characters", () => {
    assert.deepEqual(tokenise("a b c casa"), ["casa"]);
  });

  it("keeps a script whose words are not space-separated as one token", () => {
    // Japanese is in the catalogue but is not supported for extraction. The
    // tokeniser treats the run as a single unit, which the tests below show is
    // why extraction refuses to rank such a language at all.
    assert.deepEqual(tokenise("日本語のテキスト"), ["日本語のテキスト"]);
    assert.deepEqual(tokenise("casa 日本語"), ["casa", "日本語"]);
  });

  it("handles an empty string", () => {
    assert.deepEqual(tokenise(""), []);
  });
});

describe("splitSentences", () => {
  it("splits on sentence terminators", () => {
    const sentences = splitSentences("Uno. Dos! ¿Tres? Cuatro");
    assert.equal(sentences.length, 4);
    assert.equal(sentences[0], "Uno.");
  });

  it("splits on blank lines", () => {
    const sentences = splitSentences("Primer párrafo.\n\nSegundo párrafo.");
    assert.equal(sentences.length, 2);
  });

  it("does not split on a decimal point inside a number", () => {
    assert.equal(splitSentences("Cuesta 3.50 euros").length, 1);
  });
});

describe("stopwordsFor", () => {
  it("returns a list for each launch language", () => {
    for (const code of ["es", "fr", "de"]) {
      assert.ok(stopwordsFor(code).size > 20, `${code} list is suspiciously short`);
      assert.ok(hasStopwords(code));
    }
  });

  it("resolves a regional variant to its base language", () => {
    assert.deepEqual([...stopwordsFor("es-MX")], [...stopwordsFor("es")]);
  });

  it("returns an empty set for a language it does not know", () => {
    assert.equal(stopwordsFor("xx").size, 0);
    assert.equal(hasStopwords("xx"), false);
  });

  it("includes the articles and prepositions that would otherwise dominate", () => {
    for (const word of ["el", "la", "de", "que", "y"]) {
      assert.ok(stopwordsFor("es").has(word), `"${word}" missing from Spanish stopwords`);
    }
  });
});

describe("extractCandidates", () => {
  const candidates = extractCandidates(ARTICLE, { languageCode: "es" });
  const keys = candidates.map((candidate) => candidate.surfaceKey);

  it("returns candidates for real text", () => {
    assert.ok(candidates.length > 5, `only ${candidates.length} candidates`);
  });

  it("never offers a stopword", () => {
    const stopwords = stopwordsFor("es");
    const leaked = keys.filter((key) => stopwords.has(key));
    assert.deepEqual(leaked, [], `stopwords leaked into the shortlist: ${leaked.join(", ")}`);
  });

  it("puts the recurring content word 'mercado' near the top", () => {
    // It appears five times in the sample and is the topic of the text.
    const position = keys.indexOf("mercado");
    assert.ok(position >= 0, "mercado missing entirely");
    assert.ok(position < 5, `mercado ranked ${position}; expected near the top`);
  });

  it("ranks a recurring word above a one-off word", () => {
    const mercado = candidates.find((c) => c.surfaceKey === "mercado");
    const tomates = candidates.find((c) => c.surfaceKey === "tomates");
    assert.ok(mercado && tomates);
    assert.ok(
      mercado.score > tomates.score,
      `mercado ${mercado.score} should outrank tomates ${tomates.score}`,
    );
  });

  it("offers a recurring multi-word unit as a phrase", () => {
    const phrase = candidates.find((c) => c.surfaceKey === "el mercado");
    assert.ok(phrase, "the recurring bigram 'el mercado' was not offered");
    assert.equal(phrase.kind, "phrase");
  });

  it("excludes words the learner already knows", () => {
    const known = new Set(["mercado", "hermana", "pescado"]);
    const filtered = extractCandidates(ARTICLE, { languageCode: "es", knownKeys: known });
    const filteredKeys = filtered.map((candidate) => candidate.surfaceKey);
    for (const key of known) {
      assert.ok(!filteredKeys.includes(key), `known word "${key}" was re-offered`);
    }
  });

  it("excludes a known word from phrases too", () => {
    const filtered = extractCandidates(ARTICLE, {
      languageCode: "es",
      knownKeys: new Set(["el mercado"]),
    });
    const phraseKeys = filtered
      .filter((candidate) => candidate.kind === "phrase")
      .map((candidate) => candidate.surfaceKey);
    assert.ok(!phraseKeys.includes("el mercado"));
  });

  it("preserves accents in the surface form", () => {
    const candidate = extractCandidates("El sábado comimos mañana.", {
      languageCode: "es",
    }).find((c) => c.surfaceKey === "sabado");
    // The key is folded for matching; the surface keeps the accent for display.
    assert.equal(candidate?.surface, "sábado");
    assert.equal(candidate?.surfaceKey, "sabado");
  });

  it("preserves an initial capital from the source text", () => {
    const candidate = extractCandidates("Mañana volveremos temprano.", {
      languageCode: "es",
    }).find((c) => c.surfaceKey === "manana");
    assert.equal(candidate?.surface, "Mañana");
  });

  it("attaches a context sentence to each candidate", () => {
    for (const candidate of candidates) {
      assert.ok(
        candidate.contextSentence && candidate.contextSentence.length > 0,
        `"${candidate.surfaceKey}" has no context`,
      );
    }
  });

  it("honours the limit", () => {
    const limited = extractCandidates(ARTICLE, { languageCode: "es", limit: 3 });
    assert.equal(limited.length, 3);
  });

  it("defaults to a list a person can actually read", () => {
    const long = extractCandidates(ARTICLE.repeat(20), { languageCode: "es" });
    assert.ok(long.length <= DEFAULT_CANDIDATE_LIMIT);
  });

  it("is deterministic", () => {
    const again = extractCandidates(ARTICLE, { languageCode: "es" });
    assert.deepEqual(again, candidates);
  });

  it("handles empty and whitespace-only input without throwing", () => {
    assert.deepEqual(extractCandidates("", { languageCode: "es" }), []);
    assert.deepEqual(extractCandidates("   \n\n  ", { languageCode: "es" }), []);
    assert.deepEqual(extractCandidates("...", { languageCode: "es" }), []);
  });

  it("produces filler for a language with no stopword list", () => {
    // This is the reason the UI refuses the feature when `hasStopwords` is false:
    // without a stopword list every function word is offered, which is exactly
    // the filler that makes this kind of feature feel thoughtless. Asserting it
    // here keeps that gate honest rather than aspirational.
    const result = extractCandidates("Le chat est sur la table avec le chien.", {
      languageCode: "xx",
    });
    const keys = result.map((candidate) => candidate.surfaceKey);
    assert.ok(keys.includes("le"), "expected the filler this gate exists to prevent");
    assert.equal(hasStopwords("xx"), false);
  });

  it("never returns a duplicate surface key", () => {
    const duplicate = extractCandidates(
      "casa Casa CASA casa. La casa es grande y la casa es vieja.",
      { languageCode: "es" },
    );
    const seen = duplicate.map((candidate) => candidate.surfaceKey);
    assert.equal(new Set(seen).size, seen.length);
  });

  it("counts occurrences correctly", () => {
    const result = extractCandidates("pescado pescado pescado arroz.", {
      languageCode: "es",
    });
    const pescado = result.find((candidate) => candidate.surfaceKey === "pescado");
    assert.equal(pescado?.occurrences, 3);
  });

  it("keeps every score inside 0..1", () => {
    for (const candidate of candidates) {
      assert.ok(
        candidate.score >= 0 && candidate.score <= 1,
        `${candidate.surfaceKey} scored ${candidate.score}`,
      );
    }
  });
});

describe("MAX_SOURCE_CHARS", () => {
  it("is a sane ceiling for pasted text", () => {
    assert.ok(MAX_SOURCE_CHARS >= 10_000 && MAX_SOURCE_CHARS <= 1_000_000);
  });
});
