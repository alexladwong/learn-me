/**
 * Unit tests for the FSRS-5 scheduler.
 *
 * Run:  npm test        (node --test, using Node's built-in TypeScript stripping)
 *
 * These assert the properties the product depends on, not just the arithmetic:
 * a lapse must never lengthen an interval, ratings must be monotonically
 * ordered, a same-day failure must not hide a card for days, and the scheduler's
 * own recall estimate must agree with the interval it schedules. Every one of
 * those is a failure mode that would silently damage retention if it regressed.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CARD_STATES,
  DEFAULT_CONFIG,
  DEFAULT_WEIGHTS,
  RATINGS,
  type MemoryState,
  type Rating,
  dueAt,
  initialDifficulty,
  initialStability,
  intervalForRetention,
  isGraduated,
  masteryFrom,
  MS_PER_DAY,
  retrievability,
  schedule,
  type SchedulerConfig,
} from "./fsrs.ts";

const DAY = MS_PER_DAY;

function fresh(): MemoryState {
  return { state: "new", stability: 0, difficulty: 0, streakCorrect: 0, reps: 0 };
}

/** Walk a card forward through a sequence of ratings, one day apart. */
function review(
  state: MemoryState,
  rating: Rating,
  elapsedDays = 1,
  config = DEFAULT_CONFIG,
) {
  const result = schedule(state, rating, elapsedDays, config);
  return {
    result,
    next: {
      state: result.state,
      stability: result.stability,
      difficulty: result.difficulty,
      streakCorrect: result.streakCorrect,
      reps: result.reps,
    } satisfies MemoryState,
  };
}

describe("retrievability", () => {
  it("is 1 at zero elapsed time", () => {
    assert.equal(retrievability(0, 10), 1);
  });

  it("is exactly the target retention when elapsed equals stability", () => {
    // This is the invariant that ties the model to the schedule.
    assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 0.005);
    assert.ok(Math.abs(retrievability(3.173, 3.173) - 0.9) < 0.005);
  });

  it("decreases monotonically with time", () => {
    let previous = 2;
    for (const days of [0, 1, 2, 5, 20, 100, 1000]) {
      const value = retrievability(days, 10);
      assert.ok(value <= previous, `not monotonic at ${days} days`);
      previous = value;
    }
  });

  it("is 0 for an unlearned card", () => {
    assert.equal(retrievability(5, 0), 0);
  });
});

describe("intervalForRetention", () => {
  it("returns stability itself at the default 90% target", () => {
    assert.ok(Math.abs(intervalForRetention(30) - 30) < 1e-9);
  });

  it("round-trips with retrievability for any stability", () => {
    for (const stability of [0.5, 1, 3.173, 42, 365]) {
      const interval = intervalForRetention(stability);
      const recall = retrievability(interval, stability);
      assert.ok(
        Math.abs(recall - DEFAULT_CONFIG.targetRetention) < 1e-6,
        `stability ${stability}: interval ${interval} gives recall ${recall}`,
      );
    }
  });

  it("shrinks when a higher retention is demanded", () => {
    const demanding: SchedulerConfig = { ...DEFAULT_CONFIG, targetRetention: 0.97 };
    assert.ok(intervalForRetention(30, demanding) < intervalForRetention(30));
  });
});

describe("initial state", () => {
  it("orders initial stability again < hard < good < easy", () => {
    const values = RATINGS.map((rating) => initialStability(rating));
    for (let i = 1; i < values.length; i += 1) {
      assert.ok(
        values[i] > values[i - 1],
        `initial stability not increasing: ${values.join(", ")}`,
      );
    }
  });

  it("matches the FSRS-5 seed for Good", () => {
    assert.ok(Math.abs(initialStability("good") - DEFAULT_WEIGHTS[2]) < 1e-9);
  });

  it("orders initial difficulty easy < good < hard < again, within [1, 10]", () => {
    const values = RATINGS.map((rating) => initialDifficulty(rating));
    for (const value of values) {
      assert.ok(value >= 1 && value <= 10, `difficulty out of range: ${value}`);
    }
    assert.ok(values[3] < values[2]);
    assert.ok(values[2] < values[1]);
    assert.ok(values[1] < values[0]);
  });

  it("treats a first 'good' as graduated with a multi-day interval", () => {
    const { result } = review(fresh(), "good");
    assert.equal(result.state, "review");
    assert.ok(isGraduated(result), `expected graduated, got ${result.intervalDays}`);
    assert.ok(result.intervalDays >= 1);
    assert.equal(result.reps, 1);
    assert.equal(result.streakCorrect, 1);
  });

  it("keeps a first 'again' inside the session", () => {
    const { result } = review(fresh(), "again");
    assert.equal(result.state, "learning");
    assert.ok(
      result.intervalDays < 0.02,
      `a first failure should return within minutes, got ${result.intervalDays} days`,
    );
    assert.equal(result.streakCorrect, 0);
  });
});

describe("successful reviews", () => {
  it("increases stability and the interval for hard, good and easy", () => {
    const first = review(fresh(), "good");
    for (const rating of ["hard", "good", "easy"] as Rating[]) {
      const { result } = review(first.next, rating, 3);
      assert.ok(
        result.stability > first.next.stability,
        `${rating} did not increase stability`,
      );
      assert.ok(result.intervalDays > 1, `${rating} produced interval ${result.intervalDays}`);
    }
  });

  it("decreases stability for a lapse, never increases it", () => {
    const first = review(fresh(), "good");
    const { result } = review(first.next, "again", 3);
    assert.ok(
      result.stability <= first.next.stability,
      `a lapse must not increase stability: ${first.next.stability} -> ${result.stability}`,
    );
  });

  it("orders the resulting interval again < hard < good < easy from one state", () => {
    const base = review(fresh(), "good").next;
    const intervals = RATINGS.map((rating) => review(base, rating, 3).result.intervalDays);
    for (let i = 1; i < intervals.length; i += 1) {
      assert.ok(
        intervals[i] >= intervals[i - 1],
        `intervals not ordered for a shared state: ${intervals.join(", ")}`,
      );
    }
    assert.ok(intervals[3] > intervals[2], "easy should beat good");
  });

  it("grows the interval across a run of 'good' reviews", () => {
    let state = fresh();
    const intervals: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const { result, next } = review(state, "good", Math.max(1, intervals.at(-1) ?? 1));
      intervals.push(result.intervalDays);
      state = next;
    }
    for (let i = 1; i < intervals.length; i += 1) {
      assert.ok(
        intervals[i] > intervals[i - 1],
        `intervals not growing: ${intervals.map((n) => n.toFixed(2)).join(", ")}`,
      );
    }
  });

  it("never exceeds the configured maximum interval", () => {
    const capped: SchedulerConfig = { ...DEFAULT_CONFIG, maximumIntervalDays: 30 };
    let state = fresh();
    for (let i = 0; i < 20; i += 1) {
      const { result, next } = review(state, "easy", 30, capped);
      assert.ok(result.intervalDays <= 30, `interval ${result.intervalDays} exceeded cap`);
      state = next;
    }
  });
});

describe("lapses", () => {
  it("never increases stability", () => {
    const learned = review(review(fresh(), "good").next, "good", 3).next;
    const { result } = review(learned, "again", 10);
    assert.ok(
      result.stability <= learned.stability,
      `lapse increased stability: ${learned.stability} -> ${result.stability}`,
    );
  });

  it("resets the correct streak and moves to relearning", () => {
    const learned = review(fresh(), "good").next;
    assert.ok(learned.streakCorrect > 0);
    const { result } = review(learned, "again", 5);
    assert.equal(result.state, "relearning");
    assert.equal(result.streakCorrect, 0);
  });

  it("brings the card back within a day", () => {
    const learned = review(fresh(), "good").next;
    const { result } = review(learned, "again", 5);
    assert.ok(result.intervalDays <= 1, `expected <= 1 day, got ${result.intervalDays}`);
  });
});

describe("same-day reviews", () => {
  it("uses fixed steps rather than stability-derived intervals", () => {
    const learned = review(fresh(), "good").next;
    const byRating = RATINGS.map(
      (rating) => review(learned, rating, 0).result.intervalDays,
    );

    assert.equal(byRating[0], 0, "again should return immediately");
    assert.ok(byRating[1] < 0.01, "hard should be a few minutes");
    assert.ok(byRating[2] < 0.02, "good should be about ten minutes");
    assert.ok(byRating[3] >= 0.5, "easy should graduate to about a day");
  });

  it("does not hide a card for days after repeated same-day failures", () => {
    let state = review(fresh(), "good").next;
    for (let i = 0; i < 5; i += 1) {
      const { result, next } = review(state, "again", 0);
      assert.ok(
        result.intervalDays < 0.02,
        `failure ${i + 1} scheduled ${result.intervalDays} days away`,
      );
      state = next;
    }
  });
});

describe("difficulty", () => {
  it("stays inside [1, 10] through a long adversarial run", () => {
    let state = fresh();
    const pattern: Rating[] = ["again", "again", "easy", "hard", "again", "easy"];
    for (let i = 0; i < 60; i += 1) {
      const { result, next } = review(state, pattern[i % pattern.length], 2);
      assert.ok(
        result.difficulty >= 1 && result.difficulty <= 10,
        `difficulty out of range: ${result.difficulty}`,
      );
      assert.ok(Number.isFinite(result.stability), "stability went non-finite");
      assert.ok(result.stability >= 0, "negative stability");
      state = next;
    }
  });

  it("rises after a failure and falls after an easy success", () => {
    const base = review(review(fresh(), "good").next, "good", 5).next;
    const afterAgain = review(base, "again", 5).result.difficulty;
    const afterEasy = review(base, "easy", 5).result.difficulty;
    assert.ok(afterAgain > base.difficulty, "again should increase difficulty");
    assert.ok(afterEasy < base.difficulty, "easy should decrease difficulty");
  });
});

describe("mastery", () => {
  it("is 0 for an unlearned card and bounded by 1", () => {
    assert.equal(masteryFrom(0), 0);
    assert.ok(masteryFrom(1) > 0 && masteryFrom(1) < 1);
    assert.ok(masteryFrom(10_000) <= 1);
  });

  it("increases monotonically with stability", () => {
    let previous = -1;
    for (const stability of [0, 0.5, 1, 5, 30, 90, 365, 5000]) {
      const value = masteryFrom(stability);
      assert.ok(value >= previous, `not monotonic at stability ${stability}`);
      previous = value;
    }
  });
});

describe("dueAt", () => {
  it("places the due date on a whole day for graduated intervals", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const { result } = review(fresh(), "good");
    assert.ok(result.intervalDays >= 1);

    const due = dueAt(now, result);
    const days = due.getTime() - now.getTime();

    // No millisecond drift: a three-day interval is exactly three days.
    assert.equal(days % DAY, 0, `due date drifted by ${days % DAY} ms`);
    assert.equal(days, Math.round(result.intervalDays) * DAY);
  });

  it("keeps minute precision for same-day learning steps", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const { result } = review(fresh(), "again");
    assert.ok(result.intervalDays < 1);

    const due = dueAt(now, result);
    assert.equal(due.getTime() - now.getTime(), result.intervalDays * DAY);
    // Ten minutes, near enough.
    assert.ok(Math.abs(due.getTime() - now.getTime() - 600_000) < 1000);
  });
});

describe("contract with the database", () => {
  it("only ever emits states the schema accepts", () => {
    let state = fresh();
    for (const rating of [...RATINGS, ...RATINGS, "again", "good"] as Rating[]) {
      const { result, next } = review(state, rating, 0);
      assert.ok(
        (CARD_STATES as readonly string[]).includes(result.state),
        `unknown state ${result.state}`,
      );
      assert.ok(result.intervalDays >= 0, "negative interval");
      assert.ok(Number.isFinite(result.mastery) && result.mastery >= 0);
      state = next;
    }
  });

  it("increments reps by exactly one per review", () => {
    let state = fresh();
    for (let i = 1; i <= 10; i += 1) {
      const { result, next } = review(state, "good", 1);
      assert.equal(result.reps, i);
      state = next;
    }
  });
});
