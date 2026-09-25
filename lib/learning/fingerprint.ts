/**
 * Error fingerprinting.
 *
 * Every wrong answer becomes an event carrying a normalised key. From those keys
 * the confusion engine derives pairs like *como / comes / comemos* and, once a
 * pair has enough occurrences, generates a targeted drill.
 *
 * The key is built from normalised text rather than from item ids, because a
 * learner mixing up two verb forms produces the same fingerprint whether the
 * prompt was Spanish, a translation or a listening question.
 *
 * The property that matters most is *restraint*. A classifier that claims a
 * specific error it cannot justify produces confident, wrong advice on the one
 * screen where being wrong destroys trust in the whole product. So checks run
 * from strongest signal to weakest, and the fallback is the honest "you used a
 * different word".
 */

export type ErrorType =
  | "conjugation"
  | "gender"
  | "word_order"
  | "vocabulary"
  | "tense"
  | "preposition"
  | "pronunciation"
  | "spelling"
  | "register"
  | "none";

export type FingerprintInput = {
  /** What the exercise expected, in the target language. */
  expected: string;
  /** What the learner produced (typed answer, transcript, or chosen option). */
  produced: string;
  /** The exercise mode, which narrows down what kind of error is plausible. */
  mode: string;
  partOfSpeech?: string | null;
  tags?: readonly string[];
};

export type Fingerprint = {
  errorType: ErrorType;
  /** Stable key for grouping, or null when the answer was correct. */
  fingerprint: string | null;
};

/** Strip accents, punctuation and case so "Cómo" and "como" compare equal. */
export function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:"'()«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Levenshtein distance.
 *
 * Only ever called on short strings (a word or a phrase), where it is used to
 * separate "a misspelling of the same word" from "a different word".
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    [previous, current] = [current, previous];
  }

  return previous[b.length] ?? 0;
}

const ARTICLES = ["el", "la", "los", "las", "un", "una", "unos", "unas"];
const PREPOSITIONS = ["a", "de", "en", "con", "sin", "por", "para", "desde", "hasta"];

/** Formal and informal address markers. */
const FORMAL_MARKERS = ["usted", "ustedes", "senor", "senora", "senorita"];
const INFORMAL_MARKERS = ["tu", "vosotros", "te", "ti", "ti"];

/**
 * Verb endings. Presence of any of these on a differing token is what makes a
 * pair of words "the same verb, wrong form" rather than "two words".
 */
const VERB_ENDINGS = [
  "o", "as", "es", "a", "e", "amos", "emos", "imos", "ais", "eis", "is",
  "an", "en", "e", "aste", "asteis", "aron", "io", "ieron", "aba", "ia",
  "aria", "eria", "are", "ere", "ire", "ado", "ido", "ando", "iendo",
];

const NOUNISH_ENDINGS = ["a", "o", "ad", "dad", "tad", "cion", "sion", "umbre", "triz"];

function tokenise(normalised: string): string[] {
  return normalised.split(" ").filter(Boolean);
}

/**
 * Longest common prefix length.
 *
 * Two forms of the same verb share a stem ("com" in *como* / *comes*), which is
 * the signal that separates a conjugation error from a different word.
 */
function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return index;
}

function endsWithAny(word: string, endings: readonly string[]): boolean {
  return endings.some((ending) => word.endsWith(ending));
}

/**
 * Are these two tokens the same verb in different forms?
 *
 * Three conditions, all required:
 *   1. a shared *prefix* of at least three characters — the stem. A shared
 *      suffix does not count, which is what stops "madre"/"padre" being read as
 *      one verb.
 *   2. the produced form's ending is a verb ending.
 *   3. the difference is confined to the endings: one form must be a prefix of
 *      the other, or they must differ only in their final characters.
 *
 * Requiring all three is what rejects genuinely different words, the failure
 * mode that would fabricate a confusion pair.
 */
function isSameVerbDifferentForm(expected: string, produced: string): boolean {
  if (expected === produced) return false;

  const shared = commonPrefixLength(expected, produced);
  if (shared < 3) return false;

  const expectedEnding = expected.slice(shared);
  const producedEnding = produced.slice(shared);

  // Both tails must be plausible verb endings, and neither may be empty in both.
  if (expectedEnding.length === 0 && producedEnding.length === 0) return false;
  if (!endsWithAny(produced, VERB_ENDINGS)) return false;
  if (expectedEnding.length > 0 && !endsWithAny(expected, VERB_ENDINGS)) return false;

  // The remainder beyond the shared stem must be short: an ending, not a word.
  return expectedEnding.length <= 4 && producedEnding.length <= 4;
}

/** Classify a wrong answer and produce its grouping key. */
export function fingerprint(input: FingerprintInput): Fingerprint {
  const expected = normalise(input.expected);
  const produced = normalise(input.produced);

  // A blank answer is not an error *type*: it means "I did not know this",
  // which is real signal for the scheduler but says nothing about what was
  // confused.
  if (!produced) {
    return { errorType: "none", fingerprint: null };
  }

  if (expected === produced) {
    return { errorType: "none", fingerprint: null };
  }

  const expectedTokens = tokenise(expected);
  const producedTokens = tokenise(produced);

  // ---- 1. Word order: same multiset of words, different sequence ----------
  if (
    expectedTokens.length > 1 &&
    expectedTokens.length === producedTokens.length &&
    [...expectedTokens].sort().join(" ") === [...producedTokens].sort().join(" ")
  ) {
    return { errorType: "word_order", fingerprint: `word_order:${expected}` };
  }

  // ---- 2. Gender: an -o/-a swap on a single noun ------------------------
  // Checked before conjugation because a one-letter vowel change is the
  // signature of noun gender, not of verb agreement.
  if (
    expectedTokens.length === 1 &&
    producedTokens.length === 1 &&
    expected.slice(0, -1) === produced.slice(0, -1) &&
    expected.slice(-1) !== produced.slice(-1) &&
    ["a", "o"].includes(expected.slice(-1)) &&
    ["a", "o"].includes(produced.slice(-1)) &&
    isNounish(expected)
  ) {
    return { errorType: "gender", fingerprint: `gender:${expected}` };
  }

  // ---- 3. Spelling: one edit away, and not a verb form -------------------
  // "gracias" vs "grazias" is a typo; "como" vs "comes" is two edits and is a
  // conjugation error, which the next check picks up.
  if (
    expectedTokens.length === 1 &&
    producedTokens.length === 1 &&
    editDistance(expected, produced) === 1
  ) {
    return { errorType: "spelling", fingerprint: `spelling:${expected}` };
  }

  // ---- 4. Conjugation: the same verb in the wrong form -------------------
  if (expectedTokens.length === 1 && producedTokens.length === 1) {
    if (isSameVerbDifferentForm(expected, produced)) {
      return { errorType: "conjugation", fingerprint: `conjugation:${expected}` };
    }
  } else if (expectedTokens.length === producedTokens.length) {
    for (let i = 0; i < expectedTokens.length; i += 1) {
      const e = expectedTokens[i] ?? "";
      const p = producedTokens[i] ?? "";
      if (isSameVerbDifferentForm(e, p)) {
        return { errorType: "conjugation", fingerprint: `conjugation:${e}` };
      }
    }
  }

  // ---- 5. Spelling, remaining cases: a distant near-miss on one token -----
  if (
    expectedTokens.length === 1 &&
    producedTokens.length === 1 &&
    editDistance(expected, produced) <= 2
  ) {
    return { errorType: "spelling", fingerprint: `spelling:${expected}` };
  }

  // ---- 6. Register: formal where informal was expected (or vice versa) ---
  const expectedRegister = registerOf(expectedTokens);
  const producedRegister = registerOf(producedTokens);
  if (
    expectedRegister !== null &&
    producedRegister !== null &&
    expectedRegister !== producedRegister
  ) {
    return { errorType: "register", fingerprint: `register:${expectedRegister}` };
  }

  // ---- 7. Gender: a swapped article --------------------------------------
  const expectedArticle = expectedTokens.find((t) => ARTICLES.includes(t)) ?? null;
  const producedArticle = producedTokens.find((t) => ARTICLES.includes(t)) ?? null;

  if (expectedArticle && producedArticle && expectedArticle !== producedArticle) {
    const expectedNoun = expectedTokens.find((t) => !ARTICLES.includes(t)) ?? "";
    const producedNoun = producedTokens.find((t) => !ARTICLES.includes(t)) ?? "";
    if (expectedNoun === producedNoun) {
      return { errorType: "gender", fingerprint: `gender:${expectedNoun}` };
    }
  }

  // ---- 8. Preposition: everything else matches ---------------------------
  if (expectedTokens.length === producedTokens.length && expectedTokens.length > 1) {
    const differing = expectedTokens
      .map((token, index) => (token === producedTokens[index] ? null : index))
      .filter((index): index is number => index !== null);

    if (
      differing.length > 0 &&
      differing.every((index) =>
        [expectedTokens[index], producedTokens[index]].every((t) =>
          PREPOSITIONS.includes(t ?? ""),
        ),
      )
    ) {
      return {
        errorType: "preposition",
        fingerprint: `preposition:${differing.map((i) => expectedTokens[i]).join(",")}`,
      };
    }
  }

  // ---- 7. Fallback: a different word was used ---------------------------
  if (expectedTokens.length === 1 && producedTokens.length === 1) {
    return {
      errorType: "vocabulary",
      fingerprint: `vocabulary:${expected}->${produced}`,
    };
  }

  return { errorType: "vocabulary", fingerprint: `vocabulary:${expected}` };
}

/**
 * Could this token be a noun or adjective?
 *
 * Requires a noun-like ending *and* rules out verb-only endings, so an -o/-a
 * difference is only read as gender when it is not verb agreement.
 */
function isNounish(word: string): boolean {
  const VERB_ONLY_ENDINGS = ["as", "es", "amos", "emos", "imos", "ais", "eis", "an", "en"];
  if (endsWithAny(word, VERB_ONLY_ENDINGS)) return false;
  return endsWithAny(word, NOUNISH_ENDINGS);
}

/**
 * Which register a set of tokens is in, or null when it carries no signal.
 *
 * Both an explicit marker ("usted") and a verb ending ("está" is formal third
 * person, "estás" is informal second) count.
 */
function registerOf(tokens: string[]): "formal" | "informal" | null {
  if (tokens.some((token) => FORMAL_MARKERS.includes(token))) return "formal";
  if (tokens.some((token) => INFORMAL_MARKERS.includes(token))) return "informal";

  // Second-person -s endings without an explicit pronoun lean informal.
  if (tokens.some((token) => /^(est|tien|pued|habl|com|beb|quier|eres|vas)[a-z]*s$/.test(token))) {
    return "informal";
  }

  return null;
}
