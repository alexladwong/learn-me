/**
 * Verb paradigms, used to label what a learner actually confused.
 *
 * `lib/learning/fingerprint.ts` groups errors by lemma: it can say "you mixed up
 * the forms of *comer*". That is necessary but not sufficient for a drill. To
 * teach, the app has to name the two forms — "you said *comiste* when it should
 * be *comió*: 2nd person instead of 3rd" — which needs a table mapping a form to
 * its person and tense.
 *
 * Only forms that are genuinely confusable are listed. This is not a complete
 * conjugator: a missing entry degrades to "both are forms of *comer*", which is
 * still true. That degradation is deliberate — a partial paradigm is fine, a
 * wrong one is not.
 *
 * Scope note. The A1 units taught the present tense; the A2 units teach the past
 * (preterite, passé composé, Perfekt). The past forms were added here *before* the
 * A2 content, because the drill generator has to name a form to practise it —
 * shipping A2 sentences the app cannot drill would have produced material that is
 * learnable but not fixable.
 *
 * Pure data and lookups: no database, no network.
 */

export type GrammaticalPerson = "1s" | "2s" | "3s" | "1p" | "2p" | "3p";

export type FormLabel = {
  /** The form as written. */
  form: string;
  person: GrammaticalPerson;
  /** `present` | `preterite` | `perfect` | `imperfect` | `future` | `conditional` */
  tense: string;
  /** What the learner sees, e.g. "I eat" / "you eat". */
  gloss: string;
  /** Accent-free, lower-case form for matching. */
  key: string;
};

/**
 * Grammatical person, named for a *description* rather than a translation.
 *
 * Kept separate from the sentence subject on purpose: "comes is the 2nd person
 * singular (you eat)" reads properly, whereas interpolating a subject pronoun
 * produces "comes is you (you eat)".
 */
const PERSON_NAME: Record<GrammaticalPerson, string> = {
  "1s": "1st person singular",
  "2s": "2nd person singular",
  "3s": "3rd person singular",
  "1p": "1st person plural",
  "2p": "2nd person plural",
  "3p": "3rd person plural",
};

/** The sentence subject, for the short label on a form. */
const PERSON_SUBJECT: Record<GrammaticalPerson, string> = {
  "1s": "I",
  "2s": "you (informal)",
  "3s": "he/she/it",
  "1p": "we",
  "2p": "you (plural)",
  "3p": "they",
};

/** Order used when a paradigm is written positionally. */
const PERSON_ORDER: readonly GrammaticalPerson[] = ["1s", "2s", "3s", "1p", "2p", "3p"];

function key(form: string): string {
  return form
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function entry(
  form: string,
  person: GrammaticalPerson,
  tense: string,
  gloss: string,
): FormLabel {
  return { form, person, tense, gloss, key: key(form) };
}

/**
 * Build the entries for one tense.
 *
 * Positional, in the order the language's textbooks use: 1s, 2s, 3s, 1p, 2p, 3p.
 * `null` marks a gap in the paradigm — Spanish has no 2p preterite worth teaching
 * a beginner, and inventing one to keep the array uniform would be worse than
 * omitting it.
 *
 * The gloss carries the subject ("you eat") because that is what the report
 * shows; the person label is what the drill's explanation uses. Both are needed
 * and they say different things.
 */
function tense(
  tenseName: string,
  forms: ReadonlyArray<readonly [string | null, string] | null>,
): FormLabel[] {
  return forms.flatMap((pair, index) => {
    if (!pair) return [];
    const person = PERSON_ORDER[index];
    if (!person) return [];
    const [form, gloss] = pair;
    // A null form marks a gap. Returning nothing is the point: inventing a form
    // to keep the array uniform would put a made-up conjugation in front of a
    // learner.
    if (typeof form !== "string") return [];
    return [entry(form, person, tenseName, gloss)];
  });
}

/**
 * The forms worth distinguishing, per lemma.
 *
 * Deliberately small and hand-written. A generated paradigm would be more
 * complete and less trustworthy: the value here is knowing which pairs a learner
 * actually mixes up.
 */
const PARADIGMS: Record<string, Record<string, FormLabel[]>> = {
  es: {
    comer: [
      ...tense("present", [
        ["como", "I eat"],
        ["comes", "you eat"],
        ["come", "he/she eats"],
        ["comemos", "we eat"],
        ["coméis", "you all eat"],
        ["comen", "they eat"],
      ]),
      ...tense("preterite", [
        ["comí", "I ate"],
        ["comiste", "you ate"],
        ["comió", "he/she ate"],
        ["comimos", "we ate"],
        [null, ""],
        ["comieron", "they ate"],
      ]),
    ],
    hablar: [
      ...tense("present", [
        ["hablo", "I speak"],
        ["hablas", "you speak"],
        ["habla", "he/she speaks"],
        ["hablamos", "we speak"],
        ["habláis", "you all speak"],
        ["hablan", "they speak"],
      ]),
      ...tense("preterite", [
        ["hablé", "I spoke"],
        ["hablaste", "you spoke"],
        ["habló", "he/she spoke"],
        ["hablamos", "we spoke"],
        [null, ""],
        ["hablaron", "they spoke"],
      ]),
    ],
    tener: [
      ...tense("present", [
        ["tengo", "I have"],
        ["tienes", "you have"],
        ["tiene", "he/she has"],
        ["tenemos", "we have"],
        ["tenéis", "you all have"],
        ["tienen", "they have"],
      ]),
      ...tense("preterite", [
        ["tuve", "I had"],
        ["tuviste", "you had"],
        ["tuvo", "he/she had"],
        ["tuvimos", "we had"],
        [null, ""],
        ["tuvieron", "they had"],
      ]),
    ],
    beber: [
      ...tense("present", [
        ["bebo", "I drink"],
        ["bebes", "you drink"],
        ["bebe", "he/she drinks"],
        ["bebemos", "we drink"],
        ["bebéis", "you all drink"],
        ["beben", "they drink"],
      ]),
      ...tense("preterite", [
        ["bebí", "I drank"],
        ["bebiste", "you drank"],
        ["bebió", "he/she drank"],
        ["bebimos", "we drank"],
        [null, ""],
        ["bebieron", "they drank"],
      ]),
    ],
    estar: [
      ...tense("present", [
        ["estoy", "I am"],
        ["estás", "you are"],
        ["está", "he/she is"],
        ["estamos", "we are"],
        ["estáis", "you all are"],
        ["están", "they are"],
      ]),
      ...tense("preterite", [
        ["estuve", "I was"],
        ["estuviste", "you were"],
        ["estuvo", "he/she was"],
        ["estuvimos", "we were"],
        [null, ""],
        ["estuvieron", "they were"],
      ]),
    ],
    ser: [
      ...tense("present", [
        ["soy", "I am"],
        ["eres", "you are"],
        ["es", "he/she is"],
        ["somos", "we are"],
        ["sois", "you all are"],
        ["son", "they are"],
      ]),
      // `ser` and `ir` share a preterite. That is a genuine source of confusion
      // and worth tabulating rather than hiding.
      ...tense("preterite", [
        ["fui", "I was"],
        ["fuiste", "you were"],
        ["fue", "he/she was"],
        ["fuimos", "we were"],
        [null, ""],
        ["fueron", "they were"],
      ]),
    ],
    ir: [
      ...tense("present", [
        ["voy", "I go"],
        ["vas", "you go"],
        ["va", "he/she goes"],
        ["vamos", "we go"],
        ["vais", "you all go"],
        ["van", "they go"],
      ]),
      ...tense("preterite", [
        ["fui", "I went"],
        ["fuiste", "you went"],
        ["fue", "he/she went"],
        ["fuimos", "we went"],
        [null, ""],
        ["fueron", "they went"],
      ]),
    ],
    querer: [
      ...tense("present", [
        ["quiero", "I want"],
        ["quieres", "you want"],
        ["quiere", "he/she wants"],
        ["queremos", "we want"],
        ["queréis", "you all want"],
        ["quieren", "they want"],
      ]),
      ...tense("preterite", [
        ["quise", "I tried"],
        ["quisiste", "you tried"],
        ["quiso", "he/she tried"],
        ["quisimos", "we tried"],
        [null, ""],
        ["quisieron", "they tried"],
      ]),
    ],
    llamarse: [
      ...tense("present", [
        ["me llamo", "my name is"],
        ["te llamas", "your name is"],
        ["se llama", "his/her name is"],
        ["nos llamamos", "our names are"],
        [null, ""],
        ["se llaman", "their names are"],
      ]),
    ],
  },

  fr: {
    être: [
      ...tense("present", [
        ["suis", "I am"],
        ["es", "you are"],
        ["est", "he/she is"],
        ["sommes", "we are"],
        ["êtes", "you all are"],
        ["sont", "they are"],
      ]),
      ...tense("perfect", [
        ["ai été", "I was"],
        ["as été", "you were"],
        ["a été", "he/she was"],
        ["avons été", "we were"],
        [null, ""],
        ["ont été", "they were"],
      ]),
    ],
    avoir: [
      ...tense("present", [
        ["ai", "I have"],
        ["as", "you have"],
        ["a", "he/she has"],
        ["avons", "we have"],
        ["avez", "you all have"],
        ["ont", "they have"],
      ]),
      ...tense("perfect", [
        ["ai eu", "I had"],
        ["as eu", "you had"],
        ["a eu", "he/she had"],
        ["avons eu", "we had"],
        [null, ""],
        ["ont eu", "they had"],
      ]),
    ],
    manger: [
      ...tense("present", [
        ["mange", "I eat"],
        ["manges", "you eat"],
        ["mange", "he/she eats"],
        ["mangeons", "we eat"],
        ["mangez", "you all eat"],
        ["mangent", "they eat"],
      ]),
      ...tense("perfect", [
        ["ai mangé", "I ate"],
        ["as mangé", "you ate"],
        ["a mangé", "he/she ate"],
        ["avons mangé", "we ate"],
        [null, ""],
        ["ont mangé", "they ate"],
      ]),
    ],
    aller: [
      ...tense("present", [
        ["vais", "I go"],
        ["vas", "you go"],
        ["va", "he/she goes"],
        ["allons", "we go"],
        ["allez", "you all go"],
        ["vont", "they go"],
      ]),
      // `aller` takes `être`, not `avoir`. The single most common A2 error.
      ...tense("perfect", [
        ["suis allé", "I went"],
        ["es allé", "you went"],
        ["est allé", "he/she went"],
        ["sommes allés", "we went"],
        [null, ""],
        ["sont allés", "they went"],
      ]),
    ],
    parler: [
      ...tense("present", [
        ["parle", "I speak"],
        ["parles", "you speak"],
        ["parle", "he/she speaks"],
        ["parlons", "we speak"],
        ["parlez", "you all speak"],
        ["parlent", "they speak"],
      ]),
      ...tense("perfect", [
        ["ai parlé", "I spoke"],
        ["as parlé", "you spoke"],
        ["a parlé", "he/she spoke"],
        ["avons parlé", "we spoke"],
        [null, ""],
        ["ont parlé", "they spoke"],
      ]),
    ],
    boire: [
      ...tense("present", [
        ["bois", "I drink"],
        ["bois", "you drink"],
        ["boit", "he/she drinks"],
        ["buvons", "we drink"],
        ["buvez", "you all drink"],
        ["boivent", "they drink"],
      ]),
      ...tense("perfect", [
        ["ai bu", "I drank"],
        ["as bu", "you drank"],
        ["a bu", "he/she drank"],
        ["avons bu", "we drank"],
        [null, ""],
        ["ont bu", "they drank"],
      ]),
    ],
    faire: [
      ...tense("present", [
        ["fais", "I do"],
        ["fais", "you do"],
        ["fait", "he/she does"],
        ["faisons", "we do"],
        ["faites", "you all do"],
        ["font", "they do"],
      ]),
      ...tense("perfect", [
        ["ai fait", "I did"],
        ["as fait", "you did"],
        ["a fait", "he/she did"],
        ["avons fait", "we did"],
        [null, ""],
        ["ont fait", "they did"],
      ]),
    ],
    voir: [
      ...tense("present", [
        ["vois", "I see"],
        ["vois", "you see"],
        ["voit", "he/she sees"],
        ["voyons", "we see"],
        ["voyez", "you all see"],
        ["voient", "they see"],
      ]),
      ...tense("perfect", [
        ["ai vu", "I saw"],
        ["as vu", "you saw"],
        ["a vu", "he/she saw"],
        ["avons vu", "we saw"],
        [null, ""],
        ["ont vu", "they saw"],
      ]),
    ],
  },

  de: {
    sein: [
      ...tense("present", [
        ["bin", "I am"],
        ["bist", "you are"],
        ["ist", "he/she is"],
        ["sind", "we are"],
        ["seid", "you all are"],
        ["sind", "they are"],
      ]),
      ...tense("perfect", [
        ["bin gewesen", "I was"],
        ["bist gewesen", "you were"],
        ["ist gewesen", "he/she was"],
        ["sind gewesen", "we were"],
        [null, ""],
        ["sind gewesen", "they were"],
      ]),
    ],
    haben: [
      ...tense("present", [
        ["habe", "I have"],
        ["hast", "you have"],
        ["hat", "he/she has"],
        ["haben", "we have"],
        ["habt", "you all have"],
        ["haben", "they have"],
      ]),
      ...tense("perfect", [
        ["habe gehabt", "I had"],
        ["hast gehabt", "you had"],
        ["hat gehabt", "he/she had"],
        ["haben gehabt", "we had"],
        [null, ""],
        ["haben gehabt", "they had"],
      ]),
    ],
    gehen: [
      ...tense("present", [
        ["gehe", "I go"],
        ["gehst", "you go"],
        ["geht", "he/she goes"],
        ["gehen", "we go"],
        ["geht", "you all go"],
        ["gehen", "they go"],
      ]),
      // `gehen` takes `sein`, not `haben`.
      ...tense("perfect", [
        ["bin gegangen", "I went"],
        ["bist gegangen", "you went"],
        ["ist gegangen", "he/she went"],
        ["sind gegangen", "we went"],
        [null, ""],
        ["sind gegangen", "they went"],
      ]),
    ],
    essen: [
      ...tense("present", [
        ["esse", "I eat"],
        ["isst", "you eat"],
        ["isst", "he/she eats"],
        ["essen", "we eat"],
        ["esst", "you all eat"],
        ["essen", "they eat"],
      ]),
      ...tense("perfect", [
        ["habe gegessen", "I ate"],
        ["hast gegessen", "you ate"],
        ["hat gegessen", "he/she ate"],
        ["haben gegessen", "we ate"],
        [null, ""],
        ["haben gegessen", "they ate"],
      ]),
    ],
    trinken: [
      ...tense("present", [
        ["trinke", "I drink"],
        ["trinkst", "you drink"],
        ["trinkt", "he/she drinks"],
        ["trinken", "we drink"],
        ["trinkt", "you all drink"],
        ["trinken", "they drink"],
      ]),
      ...tense("perfect", [
        ["habe getrunken", "I drank"],
        ["hast getrunken", "you drank"],
        ["hat getrunken", "he/she drank"],
        ["haben getrunken", "we drank"],
        [null, ""],
        ["haben getrunken", "they drank"],
      ]),
    ],
    arbeiten: [
      ...tense("present", [
        ["arbeite", "I work"],
        ["arbeitest", "you work"],
        ["arbeitet", "he/she works"],
        ["arbeiten", "we work"],
        ["arbeitet", "you all work"],
        ["arbeiten", "they work"],
      ]),
      ...tense("perfect", [
        ["habe gearbeitet", "I worked"],
        ["hast gearbeitet", "you worked"],
        ["hat gearbeitet", "he/she worked"],
        ["haben gearbeitet", "we worked"],
        [null, ""],
        ["haben gearbeitet", "they worked"],
      ]),
    ],
    kaufen: [
      ...tense("present", [
        ["kaufe", "I buy"],
        ["kaufst", "you buy"],
        ["kauft", "he/she buys"],
        ["kaufen", "we buy"],
        ["kauft", "you all buy"],
        ["kaufen", "they buy"],
      ]),
      ...tense("perfect", [
        ["habe gekauft", "I bought"],
        ["hast gekauft", "you bought"],
        ["hat gekauft", "he/she bought"],
        ["haben gekauft", "we bought"],
        [null, ""],
        ["haben gekauft", "they bought"],
      ]),
    ],
    fahren: [
      ...tense("present", [
        ["fahre", "I drive"],
        ["fährst", "you drive"],
        ["fährt", "he/she drives"],
        ["fahren", "we drive"],
        ["fahrt", "you all drive"],
        ["fahren", "they drive"],
      ]),
      ...tense("perfect", [
        ["bin gefahren", "I drove"],
        ["bist gefahren", "you drove"],
        ["ist gefahren", "he/she drove"],
        ["sind gefahren", "we drove"],
        [null, ""],
        ["sind gefahren", "they drove"],
      ]),
    ],
  },
};

/** Every lemma with a paradigm for a language. */
export function knownLemmas(languageCode: string): string[] {
  return Object.keys(PARADIGMS[base(languageCode)] ?? {});
}

/** The paradigm for one lemma, or an empty array when it is not tabulated. */
export function paradigmFor(languageCode: string, lemma: string): FormLabel[] {
  const table = PARADIGMS[base(languageCode)];
  if (!table) return [];
  return table[lemma.toLowerCase()] ?? [];
}

/** Every tense tabulated for a language, for coverage checks and diagnostics. */
export function tensesFor(languageCode: string): string[] {
  const table = PARADIGMS[base(languageCode)];
  if (!table) return [];
  const found = new Set<string>();
  for (const forms of Object.values(table)) {
    for (const form of forms) found.add(form.tense);
  }
  return [...found].sort();
}

/**
 * Find the entry for a written form, across every lemma in the language.
 *
 * Used to label a form the learner produced without knowing which lemma was
 * intended — the label is only shown when exactly one lemma matches, so the UI
 * never asserts a person/tense it cannot be sure of.
 *
 * A form with several entries *within one lemma* is still returned, because the
 * ambiguity is in the label itself (German "isst" is both 2nd and 3rd person).
 * A form belonging to two different lemmas returns null.
 */
export function lookupForm(
  languageCode: string,
  form: string,
): { lemma: string; label: FormLabel } | null {
  const table = PARADIGMS[base(languageCode)];
  if (!table) return null;

  const wanted = key(form);
  const matches: Array<{ lemma: string; label: FormLabel }> = [];

  for (const [lemma, forms] of Object.entries(table)) {
    for (const label of forms) {
      if (label.key === wanted) matches.push({ lemma, label });
    }
  }

  const lemmas = new Set(matches.map((match) => match.lemma));
  if (lemmas.size !== 1) return null;

  // Prefer a present-tense reading when one form has several: it is the reading a
  // learner is most likely to have intended.
  const present = matches.find((match) => match.label.tense === "present");
  return present ?? matches[0] ?? null;
}

/**
 * Describe the difference between two forms of the same lemma.
 *
 * Returns null when the two forms are not both tabulated for that lemma, so the
 * caller falls back to the lemma-level statement rather than inventing detail.
 */
export function describeContrast(
  languageCode: string,
  lemma: string,
  expectedForm: string,
  producedForm: string,
): string | null {
  const forms = paradigmFor(languageCode, lemma);
  if (forms.length === 0) return null;

  const expected = forms.find((form) => form.key === key(expectedForm));
  const produced = forms.find((form) => form.key === key(producedForm));
  if (!expected || !produced) return null;

  if (expected.person === produced.person && expected.tense === produced.tense) {
    return `Both are ${expected.form}, so the difference is spelling rather than grammar.`;
  }

  if (expected.tense === produced.tense) {
    return `You wrote ${produced.form} (${PERSON_NAME[produced.person]} — “${produced.gloss}”) but the answer is ${expected.form} (${PERSON_NAME[expected.person]} — “${expected.gloss}”).`;
  }

  return `You wrote the ${produced.tense} form, ${produced.form} (“${produced.gloss}”). The answer is the ${expected.tense}, ${PERSON_NAME[expected.person]}: ${expected.form} (“${expected.gloss}”).`;
}

/**
 * Which languages a form belongs to, across the whole table.
 *
 * Used to catch a form accidentally shared between languages, which would make
 * the lookup depend on iteration order.
 */
export function languagesWithForm(form: string): string[] {
  const wanted = key(form);
  return Object.entries(PARADIGMS)
    .filter(([, table]) =>
      Object.values(table).some((forms) => forms.some((item) => item.key === wanted)),
    )
    .map(([code]) => code)
    .sort();
}

/** A short label for one form, e.g. "we eat · 1st person plural". */
export function labelFor(label: FormLabel): string {
  return `${label.gloss} · ${PERSON_NAME[label.person]}`;
}

/** The sentence subject for a form, e.g. "we". */
export function subjectFor(person: GrammaticalPerson): string {
  return PERSON_SUBJECT[person];
}

function base(languageCode: string): string {
  return languageCode.split("-")[0] ?? languageCode;
}
