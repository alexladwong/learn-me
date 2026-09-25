/**
 * Unit tests for the review session's pure helpers.
 *
 * Run:  npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  answerModeFor,
  buildOptions,
  equalsLoose,
  formatDue,
  normaliseAnswer,
} from "./answer.ts";

describe("equalsLoose", () => {
  it("ignores accents, so a missing accent is not a failed answer", () => {
    assert.ok(equalsLoose("como estas", "¿Cómo estás?"));
    assert.ok(equalsLoose("Adios", "adiós"));
  });

  it("ignores case and surrounding punctuation", () => {
    assert.ok(equalsLoose("MUCHO GUSTO", "mucho gusto."));
  });

  it("ignores extra internal whitespace", () => {
    assert.ok(equalsLoose("el  agua   fria", "el agua fria"));
  });

  it("still distinguishes genuinely different answers", () => {
    assert.ok(!equalsLoose("como", "comes"));
    assert.ok(!equalsLoose("hermano", "hermana"));
    assert.ok(!equalsLoose("", "agua"));
  });

  it("does not treat a longer answer as correct for a shorter prompt", () => {
    assert.ok(!equalsLoose("la cuenta", "la cuenta por favor"));
  });
});

describe("normaliseAnswer", () => {
  it("strips accents and punctuation consistently", () => {
    assert.equal(normaliseAnswer("¿Cómo estás?"), "como estas");
    assert.equal(normaliseAnswer("café"), "cafe");
  });
});

describe("buildOptions", () => {
  it("always includes the correct answer exactly once", () => {
    const options = buildOptions("agua", ["leche", "café", "arroz"]);
    assert.equal(options.filter((option) => option === "agua").length, 1);
    assert.equal(options.length, 4);
  });

  it("never duplicates a distractor", () => {
    const options = buildOptions("agua", ["leche", "leche", "café", "café"]);
    assert.equal(new Set(options).size, options.length);
  });

  it("ignores a distractor identical to the answer", () => {
    const options = buildOptions("agua", ["agua", "agua", "leche"]);
    assert.equal(options.filter((option) => option === "agua").length, 1);
    assert.equal(options.length, 2);
  });

  it("degrades gracefully when the pool is too small", () => {
    const options = buildOptions("agua", ["leche"]);
    assert.equal(options.length, 2);
    assert.ok(options.includes("agua"));
  });

  it("works with an empty pool", () => {
    assert.deepEqual(buildOptions("agua", []), ["agua"]);
  });

  it("caps the option count at four however large the pool", () => {
    const pool = ["a", "b", "c", "d", "e", "f", "g"];
    assert.equal(buildOptions("agua", pool).length, 4);
  });

  it("is deterministic for the same answer and pool", () => {
    const pool = ["madre", "padre", "trabajo"];
    assert.deepEqual(buildOptions("hermano", pool), buildOptions("hermano", pool));
  });

  it("does not always put the correct answer in the same position", () => {
    const pool = ["madre", "padre", "trabajo"];
    const positions = ["agua", "leche", "arroz", "café", "hermano", "padre"].map(
      (answer) => buildOptions(answer, pool).indexOf(answer),
    );
    // A fixed position would let a learner pass recognition without reading.
    assert.ok(new Set(positions).size > 1, `all positions were ${positions[0]}`);
  });
});

describe("answerModeFor", () => {
  it("asks for production when the answer is one or two words", () => {
    assert.equal(answerModeFor("agua"), "recall");
    assert.equal(answerModeFor("hasta luego"), "recall");
  });

  it("asks for recognition when the answer is a full sentence", () => {
    assert.equal(answerModeFor("Estoy bien, gracias"), "recognise");
    assert.equal(answerModeFor("¿Cómo te llamas?"), "recognise");
  });

  it("tolerates extra whitespace", () => {
    assert.equal(answerModeFor("  agua  "), "recall");
  });
});

describe("formatDue", () => {
  const now = new Date("2026-06-01T12:00:00.000Z").getTime();

  it("describes a future date in days", () => {
    assert.equal(formatDue("2026-06-04T12:00:00.000Z", now), "in 3 days");
  });

  it("describes tomorrow explicitly", () => {
    assert.equal(formatDue("2026-06-02T12:00:00.000Z", now), "tomorrow");
  });

  it("describes a same-day interval in minutes", () => {
    assert.equal(formatDue("2026-06-01T12:10:00.000Z", now), "in 10 minutes");
  });

  it("treats a past date as now", () => {
    assert.equal(formatDue("2026-05-01T12:00:00.000Z", now), "now");
  });

  it("survives an unparseable value", () => {
    assert.equal(formatDue("not-a-date", now), "at an unknown time");
  });
});
