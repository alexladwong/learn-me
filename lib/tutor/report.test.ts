/**
 * Unit tests for the tutor's scenario design and report arithmetic.
 *
 * Run:  npm test
 *
 * Two things are being protected here.
 *
 * First, the *level adaptation*. A prompt that tells a model to speak naturally
 * to an A1 learner produces incomprehensible input, and the failure is invisible
 * from the outside — the conversation still runs, it just teaches nothing. So the
 * guidance is asserted, not trusted.
 *
 * Second, the *honesty of the report*. A percentage the data does not support is
 * worse than no percentage, because the learner will believe it.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CORRECTION_BEHAVIOUR,
  SCENARIOS,
  buildOpeningLine,
  findScenario,
  levelRank,
  planConversation,
  scenariosForLevel,
} from "./scenarios.ts";
import {
  MIN_UTTERANCES_FOR_SCORE,
  buildReport,
  dedupeCorrections,
  dedupeNewWords,
  hasEnoughForScore,
  measureLearnerOutput,
  type ConversationCorrection,
} from "./report.ts";

describe("the scenario catalogue", () => {
  it("has unique ids", () => {
    const ids = SCENARIOS.map((scenario) => scenario.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("gives every scenario a goal, a role and at least two tasks", () => {
    for (const scenario of SCENARIOS) {
      assert.ok(scenario.goal.length > 10, `${scenario.id} has no clear goal`);
      assert.ok(scenario.tutorRole.length > 5, `${scenario.id} has no tutor role`);
      assert.ok(scenario.tasks.length >= 2, `${scenario.id} has too few tasks`);
      assert.ok(scenario.setting.length > 3, `${scenario.id} has no setting`);
    }
  });

  it("gives every scenario between one and five tasks", () => {
    // More than five and the conversation stops being finishable in one sitting.
    for (const scenario of SCENARIOS) {
      assert.ok(
        scenario.tasks.length <= 5,
        `${scenario.id} has ${scenario.tasks.length} tasks`,
      );
    }
  });

  it("orders every level band correctly", () => {
    for (const scenario of SCENARIOS) {
      assert.ok(
        levelRank(scenario.minLevel) <= levelRank(scenario.maxLevel),
        `${scenario.id}: min ${scenario.minLevel} above max ${scenario.maxLevel}`,
      );
    }
  });

  it("offers useful phrases a beginner could actually say", () => {
    for (const scenario of SCENARIOS) {
      assert.ok(
        scenario.usefulPhrases.length >= 1,
        `${scenario.id} offers no scaffolding`,
      );
    }
  });

  it("covers the scenarios the brief named", () => {
    const required = [
      "coffee-shop",
      "airport",
      "job-interview",
      "university",
      "shopping",
      "meeting-someone",
      "restaurant",
      "directions",
      "workplace",
    ];
    for (const id of required) {
      assert.ok(findScenario(id), `missing scenario "${id}"`);
    }
  });

  it("returns null for an unknown id rather than a default", () => {
    assert.equal(findScenario("not-a-scenario"), null);
  });
});

describe("scenariosForLevel", () => {
  it("gives an A1 learner only beginner scenarios", () => {
    const offered = scenariosForLevel("A1");
    assert.ok(offered.length > 0);
    for (const scenario of offered) {
      assert.ok(
        levelRank(scenario.minLevel) <= levelRank("A2"),
        `${scenario.id} (min ${scenario.minLevel}) should not be offered at A1`,
      );
    }
  });

  it("does not offer an A1 learner the job interview", () => {
    assert.ok(!scenariosForLevel("A1").some((scenario) => scenario.id === "job-interview"));
  });

  it("offers everything when the learner has no level yet", () => {
    assert.equal(scenariosForLevel(null).length, SCENARIOS.length);
  });

  it("gives a C1 learner an expert scenario", () => {
    const offered = scenariosForLevel("C1");
    assert.ok(offered.some((scenario) => scenario.maxLevel === "C1"));
  });
});

describe("planConversation", () => {
  const coffee = findScenario("coffee-shop");
  assert.ok(coffee);

  it("names the role and the setting", () => {
    const plan = planConversation(coffee, "A1");
    assert.match(plan.systemPrompt, /barista/);
    assert.match(plan.systemPrompt, /café/);
  });

  it("states the learner's level", () => {
    const plan = planConversation(coffee, "A2");
    assert.match(plan.systemPrompt, /level A2/);
  });

  it("constrains sentence length at A1", () => {
    // The check that matters: without an explicit length limit the model will
    // speak naturally and a beginner will understand nothing.
    const plan = planConversation(coffee, "A1");
    assert.match(plan.systemPrompt, /at most 8 words/);
    assert.match(plan.systemPrompt, /present simple/);
  });

  it("loosens the constraints as the level rises", () => {
    const a1 = planConversation(coffee, "A1").systemPrompt;
    const c1 = planConversation(coffee, "C1").systemPrompt;
    assert.match(a1, /at most 8 words/);
    assert.ok(!/at most 8 words/.test(c1), "C1 was given a beginner limit");
    assert.match(c1, /idioms/);
  });

  it("escalates the expected conversation length with level", () => {
    const lengths = (["A1", "A2", "B1", "B2", "C1", "C2"] as const).map(
      (level) => planConversation(coffee, level).expectedTurns,
    );
    for (let i = 1; i < lengths.length; i += 1) {
      assert.ok(
        (lengths[i] ?? 0) >= (lengths[i - 1] ?? 0),
        `turns did not grow: ${lengths.join(", ")}`,
      );
    }
  });

  it("includes the scenario's correction style", () => {
    const gentle = findScenario("coffee-shop");
    const strict = findScenario("job-interview");
    assert.ok(gentle && strict);

    assert.match(
      planConversation(gentle, "A1").systemPrompt,
      /Correct at most one thing per turn/,
    );
    assert.match(
      planConversation(strict, "B2").systemPrompt,
      /Correct every error/,
    );
  });

  it("lists every task as an instruction to the tutor", () => {
    const plan = planConversation(coffee, "A1");
    for (const task of coffee.tasks) {
      assert.match(
        plan.systemPrompt.toLowerCase(),
        new RegExp(task.toLowerCase().slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        `task "${task}" missing from the prompt`,
      );
    }
  });

  it("keeps the tutor in character rather than explaining grammar", () => {
    const plan = planConversation(coffee, "A1");
    assert.match(plan.systemPrompt, /Stay in character/);
  });

  it("flags whether the learner's level is inside the authored band", () => {
    assert.equal(planConversation(coffee, "A1").levelIsInBand, true);
    assert.equal(planConversation(coffee, "C1").levelIsInBand, false);
  });

  it("produces a prompt for every scenario at every level", () => {
    for (const scenario of SCENARIOS) {
      for (const level of ["A1", "A2", "B1", "B2", "C1", "C2"] as const) {
        const plan = planConversation(scenario, level);
        assert.ok(plan.systemPrompt.length > 200, `${scenario.id} at ${level} is thin`);
      }
    }
  });
});

describe("buildOpeningLine", () => {
  it("gives a short opening to an A1 learner", () => {
    const coffee = findScenario("coffee-shop");
    assert.ok(coffee);
    const a1 = buildOpeningLine(coffee, "A1");
    const b1 = buildOpeningLine(coffee, "B1");
    assert.ok(a1 && b1);
    assert.ok(
      a1.length <= b1.length,
      `A1 opening "${a1}" is longer than B1 "${b1}"`,
    );
  });

  it("returns nothing for a free conversation", () => {
    // A canned greeting would defeat the point of a free conversation.
    const free = findScenario("free-conversation");
    assert.ok(free);
    assert.equal(buildOpeningLine(free, "B1"), null);
  });

  it("has an opening for every scripted scenario", () => {
    for (const scenario of SCENARIOS) {
      if (scenario.id === "free-conversation") continue;
      assert.ok(
        buildOpeningLine(scenario, "B1"),
        `${scenario.id} has no opening line`,
      );
    }
  });

  it("states a behaviour for every correction style", () => {
    for (const [style, behaviour] of Object.entries(CORRECTION_BEHAVIOUR)) {
      assert.ok(behaviour.length > 30, `${style} behaviour is too vague`);
    }
  });
});

describe("measureLearnerOutput", () => {
  const turns = [
    { index: 1, content: "Good morning, I would like a coffee please." },
    { index: 3, content: "Can I have a croissant too?" },
    { index: 5, content: "How much is it altogether?" },
    { index: 7, content: "Thank you very much, goodbye." },
  ];

  it("counts utterances and words", () => {
    const measured = measureLearnerOutput(turns, { level: "A1" });
    assert.equal(measured.utterances, 4);
    assert.ok(measured.totalWords > 20);
  });

  it("computes a mean length", () => {
    const measured = measureLearnerOutput(turns, { level: "A1" });
    assert.ok(measured.meanWordsPerUtterance !== null);
    assert.ok(measured.meanWordsPerUtterance > 3);
  });

  it("reports the longest utterance", () => {
    const measured = measureLearnerOutput(turns, { level: "A1" });
    assert.ok(measured.longestUtterance >= (measured.meanWordsPerUtterance ?? 0));
  });

  it("recognises a suggested phrase however it was finished", () => {
    const measured = measureLearnerOutput(turns, {
      level: "A1",
      usefulPhrases: ["I would like…", "Where is the station?"],
    });
    assert.deepEqual(measured.usefulPhrasesUsed, ["I would like…"]);
    assert.deepEqual(measured.usefulPhrasesMissed, ["Where is the station?"]);
  });

  it("withholds vocabulary variety on too little text", () => {
    // Below ~20 content words the figure swings on one repeated word.
    const measured = measureLearnerOutput([{ index: 1, content: "Yes please." }], {
      level: "A1",
    });
    assert.equal(measured.vocabularyVariety, null);
  });

  it("reports vocabulary variety once there is enough text", () => {
    const long = Array.from({ length: 8 }, (_, index) => ({
      index,
      content:
        "Yesterday I walked through the market and bought vegetables, bread, cheese and a rather large fish for dinner.",
    }));
    const measured = measureLearnerOutput(long, { level: "B1" });
    assert.ok(measured.vocabularyVariety !== null);
    // The same sentence eight times means almost no variety.
    assert.ok(measured.vocabularyVariety < 0.4);
  });

  it("ignores empty and whitespace-only turns", () => {
    const measured = measureLearnerOutput(
      [
        { index: 1, content: "Hello there." },
        { index: 2, content: "   " },
        { index: 3, content: "" },
      ],
      { level: "A1" },
    );
    assert.equal(measured.utterances, 1);
  });

  it("returns an honest empty result when nothing was said", () => {
    const measured = measureLearnerOutput([], { level: "A1" });
    assert.equal(measured.utterances, 0);
    assert.equal(measured.meanWordsPerUtterance, null);
    assert.equal(measured.productionScore, null);
    assert.equal(measured.vocabularyVariety, null);
  });

  it("scores production relative to the level's expectation", () => {
    const short = measureLearnerOutput([{ index: 1, content: "Yes." }], { level: "A1" });
    const long = measureLearnerOutput(
      [{ index: 1, content: "Yes I would like that very much indeed thank you." }],
      { level: "A1" },
    );
    assert.ok((long.productionScore ?? 0) > (short.productionScore ?? 0));
  });

  it("does not penalise a B1 learner for a sentence a beginner would find long", () => {
    const sentence = "I have been working on this project for about three months now.";
    const a1 = measureLearnerOutput([{ index: 1, content: sentence }], { level: "A1" });
    const c1 = measureLearnerOutput([{ index: 1, content: sentence }], { level: "C1" });
    assert.ok((a1.productionScore ?? 0) > (c1.productionScore ?? 0));
  });
});

describe("buildReport", () => {
  const turns = [
    { index: 1, content: "Good morning, I would like a coffee please." },
    { index: 3, content: "Can I have a croissant too?" },
    { index: 5, content: "How much is it altogether?" },
  ];

  it("produces a measured-only report with no provider", () => {
    const report = buildReport({ level: "A1", learnerTurns: turns });
    assert.equal(report.measuredOnly, true);
    assert.equal(report.judged, null);
    assert.equal(report.measured.utterances, 3);
  });

  it("says which evidence is missing rather than showing a neutral score", () => {
    const report = buildReport({ level: "A1", learnerTurns: turns });
    assert.ok(report.missingEvidence.length >= 2);
    assert.ok(
      report.missingEvidence.some((line) => /no AI provider is configured/.test(line)),
      `unexpected: ${report.missingEvidence.join(" | ")}`,
    );
    assert.ok(
      report.missingEvidence.some((line) => /Pronunciation was not scored/.test(line)),
    );
  });

  it("always reports pronunciation as unscored, since no provider exists for it", () => {
    const withProvider = buildReport({
      level: "A1",
      learnerTurns: turns,
      judged: {
        grammarScore: 0.8,
        vocabularyScore: 0.7,
        grammarSamples: 12,
        vocabularySamples: 10,
        corrections: [],
        newWords: [],
        grammarPatterns: [],
        summary: "Good session.",
        model: "test-model",
      },
    });
    assert.ok(
      withProvider.missingEvidence.some((line) => /Pronunciation was not scored/.test(line)),
    );
  });

  it("drops the provider disclaimer once a provider has scored", () => {
    const report = buildReport({
      level: "A1",
      learnerTurns: turns,
      judged: {
        grammarScore: 0.8,
        vocabularyScore: 0.7,
        grammarSamples: 12,
        vocabularySamples: 10,
        corrections: [],
        newWords: [],
        grammarPatterns: [],
        summary: null,
        model: "test-model",
      },
    });
    assert.equal(report.measuredOnly, false);
    assert.ok(
      !report.missingEvidence.some((line) => /no AI provider is configured/.test(line)),
    );
  });

  it("explains a withheld grammar score with its sample size", () => {
    const report = buildReport({
      level: "A1",
      learnerTurns: turns,
      judged: {
        grammarScore: null,
        vocabularyScore: 0.7,
        grammarSamples: 2,
        vocabularySamples: 10,
        corrections: [],
        newWords: [],
        grammarPatterns: [],
        summary: null,
        model: "test-model",
      },
    });
    assert.ok(
      report.missingEvidence.some((line) => /only 2 sentences were judged/.test(line)),
      `unexpected: ${report.missingEvidence.join(" | ")}`,
    );
  });

  it("builds highlights from measured figures only", () => {
    const report = buildReport({ level: "A1", learnerTurns: turns });
    assert.ok(report.highlights.length > 0);
    for (const line of report.highlights) {
      assert.ok(
        /\d/.test(line),
        `highlight contains no measured figure: "${line}"`,
      );
    }
  });

  it("says nothing when there is nothing to say", () => {
    const report = buildReport({ level: "A1", learnerTurns: [] });
    assert.deepEqual(report.highlights, []);
  });

  it("passes through the tutor's corrections", () => {
    const correction: ConversationCorrection = {
      kind: "grammar",
      original: "I would like a coffee",
      correction: "I would like a coffee, please",
      explanation: "Adding please sounds more natural in a café.",
    };
    const report = buildReport({
      level: "A1",
      learnerTurns: turns,
      judged: {
        grammarScore: 0.8,
        vocabularyScore: 0.7,
        grammarSamples: 3,
        vocabularySamples: 3,
        corrections: [correction],
        newWords: [],
        grammarPatterns: [],
        summary: null,
        model: "m",
      },
    });
    assert.equal(report.mistakes.length, 1);
    assert.equal(report.mistakes[0]?.correction, "I would like a coffee, please");
  });
});

describe("dedupeCorrections", () => {
  it("shows the same mistake once", () => {
    const correction = (original: string): ConversationCorrection => ({
      kind: "grammar",
      original,
      correction: "fixed",
      explanation: null,
    });
    const deduped = dedupeCorrections([
      correction("je suis"),
      correction("je suis"),
      correction("je suis"),
      correction("tu es"),
    ]);
    assert.equal(deduped.length, 2);
  });

  it("treats the same original with different fixes as different", () => {
    const deduped = dedupeCorrections([
      { kind: "grammar", original: "je suis", correction: "a", explanation: null },
      { kind: "grammar", original: "je suis", correction: "b", explanation: null },
    ]);
    assert.equal(deduped.length, 2);
  });

  it("handles case differences as the same mistake", () => {
    const deduped = dedupeCorrections([
      { kind: "grammar", original: "Je Suis", correction: "x", explanation: null },
      { kind: "grammar", original: "je suis", correction: "x", explanation: null },
    ]);
    assert.equal(deduped.length, 1);
  });
});

describe("dedupeNewWords", () => {
  it("keeps one entry per surface", () => {
    const deduped = dedupeNewWords([
      { surface: "mercado", translation: "market", context: null },
      { surface: "Mercado", translation: null, context: null },
      { surface: "arroz", translation: "rice", context: null },
    ]);
    assert.equal(deduped.length, 2);
  });

  it("ignores empty surfaces", () => {
    assert.equal(dedupeNewWords([{ surface: "  ", translation: null, context: null }]).length, 0);
  });
});

describe("hasEnoughForScore", () => {
  it("withholds a score below the threshold", () => {
    const measured = measureLearnerOutput(
      [{ index: 1, content: "Yes please thank you very much." }],
      { level: "A1" },
    );
    assert.equal(hasEnoughForScore(measured), false);
    assert.ok(MIN_UTTERANCES_FOR_SCORE > 1);
  });

  it("allows a score once enough was said", () => {
    const measured = measureLearnerOutput(
      Array.from({ length: MIN_UTTERANCES_FOR_SCORE }, (_, index) => ({
        index,
        content: "I would like a coffee and a croissant please.",
      })),
      { level: "A1" },
    );
    assert.equal(hasEnoughForScore(measured), true);
  });
});
