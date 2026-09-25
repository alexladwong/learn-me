/**
 * Unit tests for error fingerprinting.
 *
 * Run:  npm test
 *
 * The property that matters most here is *restraint*: the classifier must not
 * claim a specific error type it cannot justify. A wrong label produces
 * confident, wrong advice ("you keep confusing como and comes") on the one
 * screen where being wrong destroys trust in the whole product.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { editDistance, fingerprint, normalise } from "./fingerprint.ts";

describe("normalise", () => {
  it("strips accents, case and punctuation", () => {
    assert.equal(normalise("¿Cómo estás?"), "como estas");
    assert.equal(normalise("  MUCHO   GUSTO.  "), "mucho gusto");
    assert.equal(normalise("¡Hasta luego!"), "hasta luego");
  });

  it("makes accented and unaccented forms compare equal", () => {
    assert.equal(normalise("café"), normalise("cafe"));
  });
});

describe("editDistance", () => {
  it("is 0 for identical strings", () => {
    assert.equal(editDistance("comer", "comer"), 0);
  });

  it("counts single-character differences", () => {
    assert.equal(editDistance("como", "comes"), 2);
    assert.equal(editDistance("gato", "gata"), 1);
  });

  it("handles empty strings", () => {
    assert.equal(editDistance("", "agua"), 4);
    assert.equal(editDistance("agua", ""), 4);
  });

  it("is symmetric", () => {
    assert.equal(editDistance("hermano", "hermana"), editDistance("hermana", "hermano"));
  });
});

describe("correct answers", () => {
  it("produce no fingerprint", () => {
    const result = fingerprint({ expected: "¿Cómo estás?", produced: "como estas", mode: "recall" });
    assert.equal(result.errorType, "none");
    assert.equal(result.fingerprint, null);
  });

  it("ignore surrounding punctuation and case", () => {
    const result = fingerprint({ expected: "Mucho gusto", produced: "mucho gusto!", mode: "recall" });
    assert.equal(result.fingerprint, null);
  });
});

describe("blank answers", () => {
  it("are not classified as an error type", () => {
    // A blank answer means "I don't know this", which is real signal for the
    // scheduler but not evidence about *what* was confused.
    const result = fingerprint({ expected: "agua", produced: "   ", mode: "recall" });
    assert.equal(result.errorType, "none");
    assert.equal(result.fingerprint, null);
  });
});

describe("word order", () => {
  it("detects a reordered sentence", () => {
    const result = fingerprint({
      expected: "¿Cómo te llamas?",
      produced: "¿Te llamas cómo?",
      mode: "arrange",
    });
    assert.equal(result.errorType, "word_order");
    assert.equal(result.fingerprint, "word_order:como te llamas");
  });

  it("groups all reorderings of the same sentence under one key", () => {
    const a = fingerprint({ expected: "mi madre se llama grace", produced: "se llama mi madre grace", mode: "arrange" });
    const b = fingerprint({ expected: "mi madre se llama grace", produced: "grace mi madre se llama", mode: "arrange" });
    assert.equal(a.errorType, "word_order");
    assert.equal(a.fingerprint, b.fingerprint);
  });
});

describe("spelling", () => {
  it("detects a near miss on a single word", () => {
    const result = fingerprint({ expected: "gracias", produced: "grazias", mode: "recall" });
    assert.equal(result.errorType, "spelling");
    assert.equal(result.fingerprint, "spelling:gracias");
  });

  it("does not call a genuinely different word a spelling error", () => {
    const result = fingerprint({ expected: "hermano", produced: "caballo", mode: "recall" });
    assert.notEqual(result.errorType, "spelling");
  });
});

describe("conjugation", () => {
  it("detects a wrong person on a single verb", () => {
    const result = fingerprint({ expected: "como", produced: "comes", mode: "recall" });
    assert.equal(result.errorType, "conjugation");
    assert.equal(result.fingerprint, "conjugation:como");
  });

  it("detects a wrong verb form inside a sentence", () => {
    const result = fingerprint({
      expected: "yo como arroz",
      produced: "yo comes arroz",
      mode: "recall",
    });
    assert.equal(result.errorType, "conjugation");
    assert.equal(result.fingerprint, "conjugation:como");
  });

  it("groups the confusable forms of one verb together", () => {
    const a = fingerprint({ expected: "como", produced: "comes", mode: "recall" });
    const b = fingerprint({ expected: "como", produced: "comemos", mode: "recall" });
    // Both are the same confusion: "the forms of comer". Grouping them is what
    // lets the drill generator build one exercise instead of three.
    assert.equal(a.fingerprint, b.fingerprint);
    assert.equal(a.errorType, "conjugation");
  });

  it("does not fire for a different verb", () => {
    const result = fingerprint({ expected: "bebo", produced: "como", mode: "recall" });
    assert.notEqual(result.errorType, "conjugation");
  });
});

describe("gender", () => {
  it("detects a swapped article", () => {
    const result = fingerprint({ expected: "el problema", produced: "la problema", mode: "recall" });
    assert.equal(result.errorType, "gender");
    assert.equal(result.fingerprint, "gender:problema");
  });

  it("detects an -o/-a swap on a noun", () => {
    const result = fingerprint({ expected: "hermano", produced: "hermana", mode: "recall" });
    assert.equal(result.errorType, "gender");
    assert.equal(result.fingerprint, "gender:hermano");
  });
});

describe("prepositions", () => {
  it("detects a wrong preposition inside a sentence", () => {
    const result = fingerprint({
      expected: "soy de uganda",
      produced: "soy en uganda",
      mode: "recall",
    });
    assert.equal(result.errorType, "preposition");
    assert.equal(result.fingerprint, "preposition:de");
  });

  it("does not fire when a content word also differs", () => {
    const result = fingerprint({
      expected: "voy a la tienda",
      produced: "voy en el mercado",
      mode: "recall",
    });
    assert.notEqual(result.errorType, "preposition");
  });
});

describe("register", () => {
  it("detects formal where informal was expected", () => {
    const result = fingerprint({
      expected: "como estas",
      produced: "como esta usted",
      mode: "recall",
    });
    assert.equal(result.errorType, "register");
    assert.equal(result.fingerprint, "register:informal");
  });
});

describe("fallback", () => {
  it("reports vocabulary for an unrelated single word", () => {
    const result = fingerprint({ expected: "agua", produced: "leche", mode: "recall" });
    assert.equal(result.errorType, "vocabulary");
    assert.ok(result.fingerprint?.startsWith("vocabulary:"));
  });

  it("always returns a usable fingerprint for a wrong answer", () => {
    const samples: Array<[string, string]> = [
      ["agua", "leche"],
      ["el agua fria", "la agua fria"],
      ["yo tengo dos hermanos", "yo tienes dos hermanos"],
      ["no bebo alcohol", "no bebe alcohol"],
      ["¿de dónde eres?", "¿de dónde es?"],
    ];

    for (const [expected, produced] of samples) {
      const result = fingerprint({ expected, produced, mode: "recall" });
      assert.notEqual(result.errorType, "none", `${expected} / ${produced} produced no error`);
      assert.ok(
        result.fingerprint && result.fingerprint.length > 0,
        `${expected} / ${produced} produced no fingerprint`,
      );
    }
  });
});
