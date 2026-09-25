/**
 * Unit tests for the arrangement-token shuffler.
 *
 * Run:  npm test
 *
 * `shuffleTokens` is the one piece of the arrange exercise that can be silently
 * wrong: if it ever emits the sentence already in order, the exercise answers
 * itself, and nobody would notice from reading the screen.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shuffleTokens } from "./shuffle.ts";

describe("shuffleTokens", () => {
  it("keeps every token exactly once", () => {
    const sentence = "mi madre se llama grace";
    const shuffled = shuffleTokens(sentence);
    assert.deepEqual([...shuffled].sort(), [...sentence.split(" ")].sort());
  });

  it("never returns the sentence already in order", () => {
    const samples = [
      "¿Cómo te llamas?",
      "Estoy bien, gracias",
      "Me llamo Ana",
      "mi madre se llama grace",
      "Quiero un café, por favor",
      "¿Tienen algo sin carne?",
      "La cuenta, por favor",
      "No bebo alcohol",
      "Hablo un poco de español",
      "Mucho gusto",
    ];

    for (const sentence of samples) {
      const shuffled = shuffleTokens(sentence);
      assert.notEqual(
        shuffled.join(" "),
        sentence,
        `"${sentence}" came back in its original order`,
      );
    }
  });

  it("is deterministic, so tiles never move under the learner", () => {
    const sentence = "¿Cómo estás?";
    assert.deepEqual(shuffleTokens(sentence), shuffleTokens(sentence));
  });

  it("handles a single word", () => {
    assert.deepEqual(shuffleTokens("agua"), ["agua"]);
  });

  it("handles an empty string", () => {
    assert.deepEqual(shuffleTokens(""), []);
  });

  it("collapses repeated whitespace", () => {
    const shuffled = shuffleTokens("el   agua   fria");
    assert.equal(shuffled.length, 3);
  });

  it("varies the arrangement across different sentences", () => {
    const arrangements = new Set(
      [
        "mi madre se llama grace",
        "quiero un cafe por favor",
        "la cuenta por favor",
        "no bebo alcohol",
      ].map((sentence) => shuffleTokens(sentence).join(" ")),
    );
    assert.ok(arrangements.size > 1, "every sentence was shuffled identically");
  });
});
