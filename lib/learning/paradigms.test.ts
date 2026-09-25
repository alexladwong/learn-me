/**
 * Unit tests for the paradigm lookups.
 *
 * Run:  npm test
 *
 * These exist because the explanation text is the most confident-sounding output
 * in the product: "comes is you eat, but como is I eat" reads as authoritative.
 * A wrong label here would be worse than no label, so every claim the explainer
 * can make is asserted — and so is the refusal to make one when the forms are
 * not tabulated.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeContrast,
  knownLemmas,
  labelFor,
  languagesWithForm,
  lookupForm,
  paradigmFor,
  subjectFor,
  tensesFor,
} from "./paradigms.ts";

describe("knownLemmas", () => {
  it("covers the three launch languages", () => {
    for (const code of ["es", "fr", "de"]) {
      assert.ok(knownLemmas(code).length > 0, `${code} has no paradigms`);
    }
  });

  it("returns nothing for a language it does not know", () => {
    assert.deepEqual(knownLemmas("xx"), []);
  });

  it("resolves a regional variant", () => {
    assert.deepEqual(knownLemmas("es-MX"), knownLemmas("es"));
  });
});

describe("paradigmFor", () => {
  it("returns every tabulated form of a Spanish verb", () => {
    const forms = paradigmFor("es", "comer");
    assert.ok(forms.length >= 6);
    assert.ok(forms.some((form) => form.form === "como"));
    assert.ok(forms.some((form) => form.form === "comemos"));
  });

  it("is case-insensitive on the lemma", () => {
    assert.deepEqual(paradigmFor("es", "COMER"), paradigmFor("es", "comer"));
  });

  it("returns an empty array for an untabulated verb, not a guess", () => {
    assert.deepEqual(paradigmFor("es", "cantar"), []);
  });

  it("returns an empty array for an unknown language", () => {
    assert.deepEqual(paradigmFor("xx", "comer"), []);
  });

  it("keys are accent-free so a typed answer matches", () => {
    const form = paradigmFor("es", "estar").find((entry) => entry.form === "estás");
    assert.ok(form);
    assert.equal(form.key, "estas");
  });
});

describe("lookupForm", () => {
  it("identifies a Spanish form", () => {
    const match = lookupForm("es", "comemos");
    assert.ok(match);
    assert.equal(match.lemma, "comer");
    assert.equal(match.label.person, "1p");
    assert.equal(match.label.gloss, "we eat");
  });

  it("matches a form typed without its accent", () => {
    const match = lookupForm("es", "estas");
    assert.ok(match);
    assert.equal(match.lemma, "estar");
    assert.equal(match.label.person, "2s");
  });

  it("resolves a normalised conjugated form back to its infinitive", () => {
    // This is the exact value `lemmaFrom` extracts from a fingerprint: the
    // fingerprint stores the normalised form the learner should have produced
    // (`conjugation:comi`), not the infinitive. Resolving it is what lets
    // `describeContrast` find a paradigm at all — passing "comi" straight
    // through matches no lemma, so every conjugation error lost its explanation.
    for (const [form, lemma] of [
      ["comi", "comer"],
      ["comiste", "comer"],
      ["comio", "comer"],
    ] as const) {
      const match = lookupForm("es", form);
      assert.equal(match?.lemma, lemma, `${form} should resolve to ${lemma}`);
    }
  });

  it("refuses to resolve a form that belongs to two verbs", () => {
    // `fui` is both *ser* and *ir*. Guessing one would put a confidently wrong
    // person and tense in front of the learner, so the lookup declines.
    assert.equal(lookupForm("es", "fui"), null);
  });

  it("identifies a German form", () => {
    const match = lookupForm("de", "habe");
    assert.ok(match);
    assert.equal(match.lemma, "haben");
    assert.equal(match.label.person, "1s");
  });

  it("returns null for a form it cannot place", () => {
    assert.equal(lookupForm("es", "mercado"), null);
  });

  it("returns null when a form is ambiguous across lemmas", () => {
    // "es" is both the Spanish verb *ser* (3rd person) and the German *sein*
    // (2nd person). Within one language it is unambiguous, which is why the
    // lookup is always language-scoped.
    assert.equal(lookupForm("es", "es")?.lemma, "ser");
    assert.equal(lookupForm("de", "ist")?.lemma, "sein");
  });
});

describe("describeContrast", () => {
  it("names both persons when only the person differs", () => {
    const explanation = describeContrast("es", "comer", "como", "comes");
    assert.ok(explanation);
    assert.match(explanation, /comes/);
    assert.match(explanation, /como/);
    assert.match(explanation, /I eat/);
  });

  it("names both tenses when the tense differs", () => {
    const explanation = describeContrast("es", "comer", "comí", "como");
    assert.ok(explanation);
    assert.match(explanation, /preterite|present/);
  });

  it("says so when the two forms are actually the same entry", () => {
    const explanation = describeContrast("es", "comer", "como", "como");
    assert.ok(explanation);
    assert.match(explanation, /spelling/);
  });

  it("refuses to explain an untabulated verb rather than guessing", () => {
    // This is the important one: `cantar` has no paradigm, so the caller must
    // fall back to the weaker lemma-level statement.
    assert.equal(describeContrast("es", "cantar", "canto", "cantas"), null);
  });

  it("returns null when only one of the two forms is tabulated", () => {
    assert.equal(describeContrast("es", "comer", "como", "comeria"), null);
  });

  it("returns null for an unknown language", () => {
    assert.equal(describeContrast("xx", "comer", "como", "comes"), null);
  });

  it("handles a French contrast", () => {
    const explanation = describeContrast("fr", "être", "suis", "es");
    assert.ok(explanation);
    assert.match(explanation, /suis/);
  });

  it("handles a German contrast", () => {
    const explanation = describeContrast("de", "haben", "habe", "hat");
    assert.ok(explanation);
    assert.match(explanation, /habe/);
  });
});

describe("labelFor", () => {
  it("names the grammatical person rather than interpolating a subject", () => {
    const form = paradigmFor("es", "comer").find((entry) => entry.form === "comemos");
    assert.ok(form);
    // "we eat · 1st person plural" reads correctly in a sentence about the form;
    // "we eat · we" does not.
    assert.equal(labelFor(form), "we eat · 1st person plural");
  });

  it("exposes the sentence subject separately from the person name", () => {
    assert.equal(subjectFor("1p"), "we");
    assert.equal(subjectFor("3s"), "he/she/it");
  });
});

describe("explanation wording", () => {
  it("does not interpolate a subject pronoun into a person description", () => {
    const explanation = describeContrast("es", "comer", "como", "comes");
    assert.ok(explanation);
    // Guards the regression where this read "comes is you (you eat)".
    assert.ok(
      !/is you\b/.test(explanation),
      `explanation reads awkwardly: ${explanation}`,
    );
    assert.match(explanation, /2nd person singular/);
  });

  it("names the tense when the tense differs", () => {
    const explanation = describeContrast("es", "comer", "comí", "como");
    assert.ok(explanation);
    assert.match(explanation, /preterite/);
    assert.match(explanation, /present/);
  });
});

describe("past-tense coverage", () => {
  /**
   * The A2 units teach the past tense, and the drill generator has to be able to
   * name a past form to practise it. Shipping A2 sentences the app cannot label
   * would produce material that is learnable but not fixable — which is why this
   * is asserted rather than assumed.
   */
  it("tablulates a past tense for every launch language", () => {
    for (const code of ["es", "fr", "de"]) {
      const tenses = tensesFor(code);
      assert.ok(tenses.includes("present"), `${code} has no present tense`);
      assert.ok(
        tenses.some((tense) => tense !== "present"),
        `${code} has no past tense: ${tenses.join(", ")}`,
      );
    }
  });

  it("names the past tense the way each language does", () => {
    assert.ok(tensesFor("es").includes("preterite"));
    assert.ok(tensesFor("fr").includes("perfect"));
    assert.ok(tensesFor("de").includes("perfect"));
  });

  it("covers several verbs per language in the past, not just one", () => {
    for (const code of ["es", "fr", "de"]) {
      const withPast = knownLemmas(code).filter((lemma) =>
        paradigmFor(code, lemma).some((form) => form.tense !== "present"),
      );
      assert.ok(
        withPast.length >= 5,
        `${code} has past forms for only ${withPast.length} verb(s): ${withPast.join(", ")}`,
      );
    }
  });

  it("does not repeat the same form for the same person and tense", () => {
    // A form shared between two persons is correct and must stay: French `mange`
    // is both 1s and 3s, German `isst` is both 2s and 3s. What would be wrong is
    // the same person listed twice, which makes the lookup order-dependent.
    for (const code of ["es", "fr", "de"]) {
      for (const lemma of knownLemmas(code)) {
        const seen = new Set<string>();
        for (const form of paradigmFor(code, lemma)) {
          const id = `${form.tense}:${form.person}:${form.key}`;
          assert.ok(
            !seen.has(id),
            `${code}/${lemma}: "${form.form}" listed twice for ${form.person} ${form.tense}`,
          );
          seen.add(id);
        }
      }
    }
  });

  it("spells the first person of French -er verbs correctly", () => {
    // Regression guard: the paradigm table and the French curriculum seed both
    // carried `je manges`, which is not a word.
    assert.ok(
      paradigmFor("fr", "manger").some((form) => form.form === "mange" && form.person === "1s"),
      "first person of manger is missing",
    );
    assert.ok(
      !paradigmFor("fr", "manger").some(
        (form) => form.form === "manges" && form.person === "1s",
      ),
      "`je manges` is not French",
    );
  });

  it("gives every form a person and a gloss", () => {
    for (const code of ["es", "fr", "de"]) {
      for (const lemma of knownLemmas(code)) {
        for (const form of paradigmFor(code, lemma)) {
          assert.ok(form.form.length > 0, `${code}/${lemma} has an empty form`);
          assert.ok(form.gloss.length > 0, `${code}/${lemma}/${form.form} has no gloss`);
          assert.ok(form.person.length === 2);
        }
      }
    }
  });
});

describe("past-tense lookups", () => {
  it("identifies a Spanish preterite form", () => {
    const match = lookupForm("es", "comiste");
    assert.ok(match);
    assert.equal(match.lemma, "comer");
    assert.equal(match.label.tense, "preterite");
    assert.equal(match.label.gloss, "you ate");
  });

  it("identifies a French passé composé form", () => {
    const match = lookupForm("fr", "suis allé");
    assert.ok(match);
    assert.equal(match.lemma, "aller");
    assert.equal(match.label.tense, "perfect");
  });

  it("identifies a German Perfekt form", () => {
    const match = lookupForm("de", "habe gegessen");
    assert.ok(match);
    assert.equal(match.lemma, "essen");
    assert.equal(match.label.tense, "perfect");
  });

  it("explains a present/past confusion as a tense difference", () => {
    const explanation = describeContrast("es", "comer", "comí", "como");
    assert.ok(explanation);
    assert.match(explanation, /preterite/);
    assert.match(explanation, /present/);
  });

  it("explains a person error inside the past tense", () => {
    const explanation = describeContrast("es", "comer", "comió", "comiste");
    assert.ok(explanation);
    // Both preterite, so the difference named must be the person.
    assert.match(explanation, /2nd person singular/);
    assert.match(explanation, /3rd person singular/);
  });

  it("explains a French auxiliary error", () => {
    // "j'ai allé" instead of "je suis allé" — the classic A2 mistake.
    const explanation = describeContrast("fr", "aller", "suis allé", "ai allé");
    assert.equal(explanation, null, "ai allé is not tabulated, so no claim is made");
  });

  it("still refuses to explain an untabulated verb", () => {
    assert.equal(describeContrast("es", "cantar", "canté", "canto"), null);
  });
});

describe("languagesWithForm", () => {
  it("finds a form in the language that has it", () => {
    assert.deepEqual(languagesWithForm("comiste"), ["es"]);
  });

  it("reports nothing for a form no language defines", () => {
    assert.deepEqual(languagesWithForm("xyzzy"), []);
  });

  it("surfaces a form shared between languages", () => {
    // `a` is French *avoir* 3s and also German nothing; the check exists so a
    // genuine collision is visible rather than silently order-dependent.
    const shared = languagesWithForm("ist");
    assert.deepEqual(shared, ["de"]);
  });
});
