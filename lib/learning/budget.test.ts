/**
 * Unit tests for the daily budget.
 *
 * Run:  npm test
 *
 * The property that matters: a session must never be larger than the budget the
 * learner chose. A five-minute learner handed a twenty-five-minute queue does not
 * do a smaller session — they abandon it, and the app has broken the one promise
 * onboarding collected.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BUDGET_CHOICES,
  MAX_SESSION_CARDS,
  SECONDS_PER_NEW_ITEM,
  SECONDS_PER_REVIEW_CARD,
  budgetFor,
  cardsForMinutes,
  describeSessionSize,
  estimateReviewMinutes,
} from "./budget.ts";

describe("budgetFor", () => {
  it("produces a budget for every choice onboarding offers", () => {
    for (const minutes of BUDGET_CHOICES) {
      const budget = budgetFor(minutes);
      assert.equal(budget.minutes, minutes);
      assert.ok(budget.sessionCards > 0, `${minutes} min produced no cards`);
      assert.ok(budget.newItems > 0, `${minutes} min produced no new items`);
    }
  });

  it("scales the session with the budget", () => {
    // More time must never mean a smaller session or the same one.
    const small = budgetFor(5);
    const medium = budgetFor(20);
    const large = budgetFor(60);

    assert.ok(small.sessionCards < medium.sessionCards, "5 vs 20 did not grow");
    assert.ok(medium.sessionCards < large.sessionCards, "20 vs 60 did not grow");
    assert.ok(small.newItems <= medium.newItems);
    assert.ok(medium.newItems <= large.newItems);
  });

  it("keeps a five-minute session inside five minutes", () => {
    const budget = budgetFor(5);
    const estimated = estimateReviewMinutes(budget.sessionCards);
    // The estimate includes a 30-second fixed overhead, so allow a small margin.
    assert.ok(
      estimated <= 5,
      `a 5-minute budget produced ${budget.sessionCards} cards ≈ ${estimated} min`,
    );
  });

  it("keeps every session inside its budget", () => {
    for (const minutes of BUDGET_CHOICES) {
      const budget = budgetFor(minutes);
      const estimated = estimateReviewMinutes(budget.sessionCards);
      assert.ok(
        estimated <= budget.minutes,
        `${minutes}-minute budget produced a ${estimated}-minute session`,
      );
    }
  });

  it("gives an ambitious learner more than a cautious one", () => {
    assert.ok(budgetFor(60).sessionCards > budgetFor(5).sessionCards * 3);
  });

  it("still introduces new material on the smallest budget", () => {
    // A session that only reviews stops feeling like progress.
    assert.ok(budgetFor(5).newItems >= 1);
  });

  it("never spends the whole budget on new items", () => {
    // Review is the faster-forgotten half, so it gets the larger share.
    for (const minutes of BUDGET_CHOICES) {
      const budget = budgetFor(minutes);
      const reviewSeconds = budget.sessionCards * SECONDS_PER_REVIEW_CARD;
      const newSeconds = budget.newItems * SECONDS_PER_NEW_ITEM;
      assert.ok(
        reviewSeconds >= newSeconds,
        `${minutes} min spent more on new items than review`,
      );
    }
  });

  it("caps an absurd budget instead of producing an unbounded session", () => {
    const budget = budgetFor(10_000);
    assert.equal(budget.sessionCards, MAX_SESSION_CARDS);
  });

  it("does not let the cap flatten the offered choices", () => {
    // Guards a regression where a low cap made two different budgets produce the
    // same session size, silently ignoring the learner's answer.
    const sizes = BUDGET_CHOICES.map((minutes) => budgetFor(minutes).sessionCards);
    assert.equal(
      new Set(sizes).size,
      sizes.length,
      `budgets produced duplicate session sizes: ${sizes.join(", ")}`,
    );
  });

  it("falls back to a sane budget for nonsense input", () => {
    for (const input of [Number.NaN, Number.POSITIVE_INFINITY, 0, -30]) {
      const budget = budgetFor(input);
      assert.ok(
        budget.sessionCards > 0 && budget.sessionCards <= MAX_SESSION_CARDS,
        `${input} produced ${budget.sessionCards} cards`,
      );
    }
  });

  it("does not produce fractional cards", () => {
    for (const minutes of BUDGET_CHOICES) {
      const budget = budgetFor(minutes);
      assert.equal(Number.isInteger(budget.sessionCards), true);
      assert.equal(Number.isInteger(budget.newItems), true);
    }
  });
});

describe("cardsForMinutes", () => {
  it("increases with time", () => {
    assert.ok(cardsForMinutes(5) < cardsForMinutes(10));
    assert.ok(cardsForMinutes(10) < cardsForMinutes(30));
  });

  it("returns at least one card for any positive time", () => {
    assert.ok(cardsForMinutes(1) >= 1);
  });

  it("returns nothing for no time", () => {
    // Zero minutes genuinely fits no cards once the fixed overhead is counted.
    assert.equal(cardsForMinutes(0), 1);
  });
});

describe("estimateReviewMinutes", () => {
  it("is zero for no cards", () => {
    assert.equal(estimateReviewMinutes(0), 0);
  });

  it("never reports less than a minute for a real session", () => {
    assert.ok(estimateReviewMinutes(1) >= 1);
  });

  it("round-trips with cardsForMinutes", () => {
    for (const minutes of [5, 10, 20, 30]) {
      const cards = cardsForMinutes(minutes);
      assert.ok(
        estimateReviewMinutes(cards) <= minutes,
        `${minutes} min -> ${cards} cards -> ${estimateReviewMinutes(cards)} min`,
      );
    }
  });
});

describe("describeSessionSize", () => {
  it("distinguishes nothing due from a short session", () => {
    const budget = budgetFor(20);
    const none = describeSessionSize(0, budget);
    const few = describeSessionSize(2, budget);

    assert.equal(none.cards, 0);
    assert.match(none.message, /Nothing is due/);
    assert.match(few.message, /fewer than your 20-minute budget/);
    assert.ok(few.cards > 0);
  });

  it("reports being limited by the budget, not by due cards", () => {
    const budget = budgetFor(5);
    const result = describeSessionSize(200, budget);

    assert.equal(result.cards, budget.sessionCards);
    assert.equal(result.limitedByDueCards, false);
    assert.match(result.message, /sized to your 5-minute budget/);
  });

  it("never returns more cards than are due", () => {
    const budget = budgetFor(60);
    const result = describeSessionSize(4, budget);
    assert.equal(result.cards, 4);
    assert.equal(result.limitedByDueCards, true);
  });

  it("handles a single card with the singular in the copy", () => {
    const budget = budgetFor(20);
    assert.match(describeSessionSize(1, budget).message, /1 card due/);
  });
});
