/**
 * Unit tests for confusion drill construction.
 *
 * Run:  npm test
 *
 * The stakes here are higher than elsewhere: a drill built from the wrong
 * contrast does not merely fail to help, it *teaches the mistake*. So the tests
 * check that the expected form is always the answer, that a drill is refused
 * when the material cannot support one, and that option order is stable.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_DRILL_STEPS,
  MIN_DRILL_ITEMS,
  blankOutForm,
  buildConfusionDrill,
  canBuildDrill,
  containsForm,
  orderOptions,
  referenceParadigm,
  type DrillItem,
} from "./drill.ts";

/** Three sentences that actually contain the target form. */
const ITEMS: DrillItem[] = [
  {
    itemId: "11111111-1111-1111-1111-111111111111",
    surface: "Como arroz todos los días.",
    translation: "I eat rice every day.",
    targetForm: "como",
  },
  {
    itemId: "22222222-2222-2222-2222-222222222222",
    surface: "Yo como en casa.",
    translation: "I eat at home.",
    targetForm: "como",
  },
  {
    itemId: "33333333-3333-3333-3333-333333333333",
    surface: "Como a las dos.",
    translation: "I eat at two.",
    targetForm: "como",
  },
];

function baseInput(overrides: Partial<Parameters<typeof buildConfusionDrill>[0]> = {}) {
  return {
    languageCode: "es",
    fingerprint: "conjugation:como",
    errorType: "conjugation",
    expectedForm: "como",
    producedForms: ["comes", "comemos"],
    items: ITEMS,
    attempts: [
      { produced: "comes", expected: "como" },
      { produced: "comemos", expected: "como" },
    ],
    ...overrides,
  };
}

describe("fold-based matching helpers", () => {
  it("finds a form inside a sentence regardless of case or accents", () => {
    assert.ok(containsForm("Como arroz", "como"));
    assert.ok(containsForm("¿CÓMO estás?", "cómo"));
    assert.ok(containsForm("Estoy bien", "estoy"));
  });

  it("does not match a form embedded inside a longer word", () => {
    // "como" must not match "comodidad" — that would build a nonsense prompt.
    assert.ok(!containsForm("La comodidad importa", "como"));
    assert.ok(!containsForm("comes", "como"));
  });

  it("matches across accents, which the SQL prefilter cannot do", () => {
    // `containsForm` folds both sides, so an unaccented search finds accented
    // text. The database prefilter that narrows the candidate rows is a plain
    // case-insensitive substring match and is NOT accent-insensitive — `ILIKE`
    // has no notion of folding. Searching with the folded form ("comi") therefore
    // matched nothing, so the precise filter never saw a row and every drill for
    // an accented form was silently empty.
    //
    // The invariant this pins down: the form as written is a substring of the
    // text, so the written form is what the prefilter must be given.
    const sentence = "Comí con mi familia el domingo.";
    assert.ok(containsForm(sentence, "comí"), "folded match succeeds");
    assert.ok(
      sentence.toLowerCase().includes("comí".toLowerCase()),
      "and the written form is present verbatim, so the SQL net can find it",
    );
    assert.ok(
      !sentence.toLowerCase().includes("comi"),
      "while the folded form is absent from the text — which is why it found nothing",
    );
  });

  it("blanks out only the target form", () => {
    assert.equal(blankOutForm("Como arroz todos los días.", "como"), "____ arroz todos los días.");
  });

  it("blanks a form mid-sentence without touching the rest", () => {
    assert.equal(blankOutForm("Yo como en casa.", "como"), "Yo ____ en casa.");
  });

  it("blanks an accented form typed without the accent", () => {
    assert.equal(blankOutForm("¿Cómo estás?", "como"), "¿____ estás?");
  });

  it("returns the sentence unchanged when the form is absent", () => {
    assert.equal(blankOutForm("No bebo alcohol.", "como"), "No bebo alcohol.");
  });
});

describe("buildConfusionDrill", () => {
  const drill = buildConfusionDrill(baseInput());

  it("builds a drill from adequate material", () => {
    assert.ok(drill, "expected a drill");
  });

  it("opens with a teach card carrying the contrast", () => {
    assert.equal(drill?.steps[0]?.kind, "teach");
    const first = drill?.steps[0];
    assert.ok(first && first.kind === "teach");
    assert.ok(first.headline.includes("comes"));
    assert.ok(first.headline.includes("como"));
  });

  it("lists the expected form first in the contrast set", () => {
    assert.equal(drill?.forms[0]?.form, "como");
    assert.equal(drill?.forms[0]?.isExpected, true);
  });

  it("labels the forms it can place grammatically", () => {
    const expected = drill?.forms.find((form) => form.isExpected);
    const mistake = drill?.forms.find((form) => form.form === "comes");
    assert.match(expected?.label ?? "", /1s|1st/);
    assert.match(mistake?.label ?? "", /2s|2nd/);
  });

  it("carries the learner's attempts onto the teach card", () => {
    const first = drill?.steps[0];
    assert.ok(first && first.kind === "teach");
    assert.equal(first.attempts.length, 2);
  });

  it("always uses the expected form as the answer", () => {
    for (const step of drill?.steps ?? []) {
      if (step.kind === "teach") continue;
      assert.equal(step.answer, "como", `${step.kind} step had the wrong answer`);
    }
  });

  it("never offers a distractor that is the answer", () => {
    for (const step of drill?.steps ?? []) {
      if (step.kind !== "choose") continue;
      assert.equal(
        step.options.filter((option) => option === step.answer).length,
        1,
        "the answer appeared more than once",
      );
    }
  });

  it("only asks about sentences that contain the target form", () => {
    for (const step of drill?.steps ?? []) {
      if (step.kind === "teach") continue;
      assert.ok(
        step.prompt.includes("____"),
        `prompt was not blanked: ${step.prompt}`,
      );
    }
  });

  it("includes both recognition and production", () => {
    const kinds = new Set((drill?.steps ?? []).map((step) => step.kind));
    assert.ok(kinds.has("choose"), "no recognition step");
    assert.ok(kinds.has("produce"), "no production step");
  });

  it("ends on a checkpoint with no options to lean on", () => {
    const last = drill?.steps.at(-1);
    assert.equal(last?.kind, "checkpoint");
  });

  it("counts its graded steps", () => {
    const graded = (drill?.steps ?? []).filter((step) => step.kind !== "teach").length;
    assert.equal(drill?.gradedSteps, graded);
  });

  it("never exceeds the step ceiling", () => {
    const many: DrillItem[] = Array.from({ length: 40 }, (_, index) => ({
      itemId: `${String(index).padStart(8, "0")}-0000-0000-0000-000000000000`,
      surface: `Como algo número ${index}.`,
      translation: `I eat something number ${index}.`,
      targetForm: "como",
    }));
    const big = buildConfusionDrill(baseInput({ items: many }));
    assert.ok((big?.steps.length ?? 0) <= MAX_DRILL_STEPS);
  });
});

describe("buildConfusionDrill refusals", () => {
  it("returns null without a known expected form", () => {
    assert.equal(buildConfusionDrill(baseInput({ expectedForm: null })), null);
  });

  it("returns null when no item contains the expected form", () => {
    const unrelated: DrillItem[] = ITEMS.map((item) => ({
      ...item,
      surface: "No bebo alcohol.",
    }));
    assert.equal(buildConfusionDrill(baseInput({ items: unrelated })), null);
  });

  it(`returns null below ${MIN_DRILL_ITEMS} usable items`, () => {
    assert.equal(buildConfusionDrill(baseInput({ items: ITEMS.slice(0, 2) })), null);
    assert.ok(buildConfusionDrill(baseInput({ items: ITEMS.slice(0, 3) })));
  });

  it("returns null when there is nothing to contrast against", () => {
    // Only the expected form exists, so there is no confusion to drill.
    assert.equal(buildConfusionDrill(baseInput({ producedForms: [] })), null);
  });

  it("returns null for an empty item list", () => {
    assert.equal(buildConfusionDrill(baseInput({ items: [] })), null);
  });

  it("returns null when every produced form equals the expected form", () => {
    assert.equal(
      buildConfusionDrill(baseInput({ producedForms: ["como", "COMO", "Cómo"] })),
      null,
    );
  });
});

describe("buildConfusionDrill without a paradigm entry", () => {
  it("still builds a drill, but makes no grammatical claim", () => {
    // `cantar` is not tabulated, so the drill must work from the raw forms only.
    const drill = buildConfusionDrill(
      baseInput({
        fingerprint: "conjugation:canto",
        expectedForm: "canto",
        producedForms: ["cantas"],
        items: ITEMS.map((item) => ({
          ...item,
          surface: "Canto en el coro.",
        })),
      }),
    );

    assert.ok(drill, "a drill should still be possible");
    const first = drill.steps[0];
    assert.ok(first && first.kind === "teach");
    // No invented person or tense.
    assert.equal(first.detail, null);
    assert.equal(drill.forms.every((form) => form.label === null), true);
  });
});

describe("orderOptions", () => {
  it("includes the answer exactly once", () => {
    const options = orderOptions("como", ["comes", "comemos", "come"], "seed");
    assert.equal(options.filter((option) => option === "como").length, 1);
  });

  it("is stable for the same seed", () => {
    const a = orderOptions("como", ["comes", "comemos"], "item-1");
    const b = orderOptions("como", ["comes", "comemos"], "item-1");
    assert.deepEqual(a, b);
  });

  it("varies the answer's position across items", () => {
    const distractors = ["comes", "comemos", "come"];
    const positions = ["a", "b", "c", "d", "e", "f", "g", "h"].map((seed) =>
      orderOptions("como", distractors, seed).indexOf("como"),
    );
    assert.ok(
      new Set(positions).size > 1,
      `answer always at position ${positions[0]}`,
    );
  });

  it("never duplicates the answer when it appears among the distractors", () => {
    const options = orderOptions("como", ["como", "comes"], "seed");
    assert.equal(new Set(options).size, options.length);
  });
});

describe("canBuildDrill", () => {
  it("requires a form, a contrast, and enough items", () => {
    assert.equal(
      canBuildDrill({ expectedForm: "como", producedForms: ["comes"], itemCount: 3 }),
      true,
    );
    assert.equal(
      canBuildDrill({ expectedForm: null, producedForms: ["comes"], itemCount: 3 }),
      false,
    );
    assert.equal(
      canBuildDrill({ expectedForm: "como", producedForms: [], itemCount: 3 }),
      false,
    );
    assert.equal(
      canBuildDrill({ expectedForm: "como", producedForms: ["comes"], itemCount: 2 }),
      false,
    );
  });
});

describe("referenceParadigm", () => {
  it("returns every tabulated form for a known verb", () => {
    const paradigm = referenceParadigm("es", "comer");
    assert.ok(paradigm.length >= 6);
    assert.ok(paradigm.every((entry) => entry.form && entry.gloss && entry.person));
  });

  it("returns nothing for an untabulated verb rather than a partial table", () => {
    assert.deepEqual(referenceParadigm("es", "cantar"), []);
  });
});
