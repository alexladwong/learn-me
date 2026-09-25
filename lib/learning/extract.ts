/**
 * Vocabulary extraction from text the learner already has.
 *
 * Deliberately deterministic: the same input always produces the same
 * shortlist, the ranking is inspectable, and it costs nothing to run. That is
 * what lets "Learn From Content" work with no AI provider configured — the model
 * is reserved for *enrichment* (translating a word the learner already chose),
 * never for deciding what to show.
 *
 * Pure functions only: no database, no network, no clock. Everything that can be
 * wrong about the shortlist is therefore unit-testable, which matters because a
 * shortlist full of filler is why people stop using this kind of feature.
 */

export type CandidateKind = "word" | "phrase";

export type ExtractedCandidate = {
  /** As it appeared, accents preserved. */
  surface: string;
  /** Case-folded, unaccented form used for matching against known vocabulary. */
  surfaceKey: string;
  kind: CandidateKind;
  occurrences: number;
  /** The sentence it first appeared in, for context. */
  contextSentence: string | null;
  /** 0..1 ranking score. Higher is more worth learning for *this* text. */
  score: number;
};

export type ExtractionOptions = {
  /** BCP-47 code, used to pick the stopword list. */
  languageCode: string;
  /**
   * `surfaceKey`s the learner already knows. These are excluded from the
   * shortlist — offering a word someone has already learned is the fastest way
   * to make a feature feel thoughtless.
   */
  knownKeys?: ReadonlySet<string>;
  /** Hard cap on the returned list. */
  limit?: number;
  /** Minimum length for a single word to be considered. */
  minWordLength?: number;
};

/** Fallback cap. Enough to choose from, few enough to decide about. */
export const DEFAULT_CANDIDATE_LIMIT = 40;

/**
 * Function words per language.
 *
 * These are the words that dominate any frequency count while carrying the least
 * learning value: articles, prepositions, pronouns, very common verb forms. A
 * measured word-frequency list is not available offline, so this list *is* the
 * frequency signal — and it only ever *removes* candidates, so an incomplete
 * list degrades to "slightly more suggestions", never to "broken".
 */
const STOPWORDS: Record<string, readonly string[]> = {
  es: [
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "a", "al",
    "en", "con", "sin", "por", "para", "que", "qué", "y", "o", "u", "pero", "si",
    "sí", "no", "ni", "se", "su", "sus", "mi", "mis", "tu", "tus", "lo", "le",
    "les", "me", "te", "nos", "os", "es", "son", "era", "fue", "ser", "estar",
    "está", "están", "hay", "ha", "han", "he", "has", "como", "cómo", "cuando",
    "cuándo", "donde", "dónde", "porque", "más", "menos", "muy", "ya", "también",
    "todo", "toda", "todos", "todas", "este", "esta", "estos", "estas", "ese",
    "esa", "esos", "esas", "aquel", "esto", "eso", "aquello", "yo", "tú", "él",
    "ella", "nosotros", "vosotros", "ellos", "ellas", "usted", "ustedes", "al",
    "muy", "tan", "así", "aquí", "allí", "ahora", "luego", "siempre", "nunca",
    "tiene", "tienen", "tengo", "hace", "hacen", "puede", "pueden", "va", "van",
    "voy", "fue", "sea", "sido", "solo", "sólo", "cada", "otro", "otra",
  ],
  fr: [
    "le", "la", "les", "un", "une", "des", "de", "du", "à", "au", "aux", "en",
    "avec", "sans", "par", "pour", "que", "qui", "quoi", "et", "ou", "mais", "si",
    "ne", "pas", "se", "sa", "ses", "son", "mon", "ma", "mes", "ton", "ta", "tes",
    "lui", "leur", "me", "te", "nous", "vous", "ils", "elles", "est", "sont",
    "était", "être", "avoir", "a", "ont", "ai", "as", "comme", "comment", "quand",
    "où", "parce", "plus", "moins", "très", "déjà", "aussi", "tout", "toute",
    "tous", "toutes", "ce", "cet", "cette", "ces", "ça", "cela", "je", "tu", "il",
    "elle", "on", "y", "dans", "sur", "sous", "entre", "vers", "chez", "encore",
    "toujours", "jamais", "fait", "faire", "peut", "peuvent", "vais", "va", "vont",
  ],
  de: [
    "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem",
    "eines", "einer", "und", "oder", "aber", "wenn", "weil", "dass", "ob", "als",
    "in", "im", "an", "am", "auf", "mit", "ohne", "für", "von", "vom", "zu", "zum",
    "zur", "bei", "nach", "aus", "über", "unter", "vor", "durch", "gegen", "ist",
    "sind", "war", "waren", "sein", "haben", "hat", "habe", "hast", "habt", "wird",
    "werden", "wurde", "werden", "kann", "können", "muss", "müssen", "soll",
    "sollen", "will", "wollen", "ich", "du", "er", "sie", "es", "wir", "ihr",
    "mich", "dich", "sich", "uns", "euch", "mein", "dein", "sein", "ihr", "unser",
    "nicht", "kein", "keine", "auch", "nur", "schon", "noch", "sehr", "mehr",
    "wie", "was", "wer", "wo", "wann", "warum", "so", "dann", "denn", "doch",
    "hier", "dort", "jetzt", "immer", "nie", "etwas", "alles", "man",
  ],
};

/** English is a common source language for the *interface*, not a target here. */
STOPWORDS.en = [
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at", "by",
  "for", "with", "without", "from", "into", "as", "is", "are", "was", "were",
  "be", "been", "has", "have", "had", "do", "does", "did", "will", "would",
  "can", "could", "should", "i", "you", "he", "she", "it", "we", "they", "me",
  "him", "her", "us", "them", "my", "your", "his", "its", "our", "their", "this",
  "that", "these", "those", "not", "no", "so", "than", "then", "there", "here",
];

export function stopwordsFor(languageCode: string): ReadonlySet<string> {
  const base = languageCode.split("-")[0] ?? languageCode;
  return new Set(STOPWORDS[base] ?? []);
}

/** True when the language has a stopword list, so ranking can be trusted more. */
export function hasStopwords(languageCode: string): boolean {
  const base = languageCode.split("-")[0] ?? languageCode;
  return base in STOPWORDS;
}

/**
 * Fold a surface form for comparison.
 *
 * Accents are removed so "café" and "cafe" are the same word, and so a learner
 * typing without accents still gets a match against what they already know.
 * Apostrophes are kept because they are part of the word in French ("l'homme").
 */
export function foldKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .trim();
}

/** Split into sentences, keeping the terminator so context reads naturally. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n{2,}/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * Tokenise into words, preserving internal apostrophes and hyphens.
 *
 * Character classes cover Latin script plus the accented ranges Spanish, French
 * and German need. A script this regex cannot see (Japanese, Arabic) simply
 * produces no candidates rather than wrong ones, which is the honest failure.
 */
export function tokenise(text: string): string[] {
  return (
    text
      .match(/[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu)
      ?.filter((token) => token.length > 1) ?? []
  );
}

type Counted = {
  /** The most common original casing, so the surface reads naturally. */
  surface: string;
  occurrences: number;
  contextSentence: string | null;
};

/**
 * Extract a ranked shortlist of words and phrases worth learning.
 *
 * Scoring, in plain terms:
 *   - frequency matters most, but logarithmic — seeing a word ten times is not
 *     ten times as important as seeing it once
 *   - length is a weak positive signal (longer words carry more meaning)
 *   - very short words are penalised, since they are usually function words that
 *     slipped past the stopword list
 *   - phrases get a bonus: a recurring multi-word unit is a stronger candidate
 *     than a single word, because it is a collocation rather than a coincidence
 *   - anything the learner already knows is removed outright
 */
export function extractCandidates(
  text: string,
  options: ExtractionOptions,
): ExtractedCandidate[] {
  const {
    languageCode,
    knownKeys = new Set<string>(),
    limit = DEFAULT_CANDIDATE_LIMIT,
    minWordLength = 2,
  } = options;

  const stopwords = stopwordsFor(languageCode);
  const sentences = splitSentences(text);

  // ---- Single words -------------------------------------------------------
  const words = new Map<string, Counted>();
  // Token positions, so recurring bigrams/trigrams can be found.
  const tokenStream: Array<{ key: string; sentence: string }> = [];

  for (const sentence of sentences) {
    for (const token of tokenise(sentence)) {
      const key = foldKey(token);
      if (key.length < minWordLength) continue;
      tokenStream.push({ key, sentence });
      if (stopwords.has(key)) continue;

      const existing = words.get(key);
      if (existing) {
        existing.occurrences += 1;
        continue;
      }
      words.set(key, { surface: token, occurrences: 1, contextSentence: sentence });
    }
  }

  // ---- Recurring phrases --------------------------------------------------
  // Only n-grams that repeat, and that contain at least one non-stopword. This
  // is not collocation extraction; it is "a multi-word unit this text uses more
  // than once", which is a defensible signal and needs no model.
  const phrases = new Map<string, Counted>();
  for (const size of [2, 3]) {
    for (let i = 0; i + size <= tokenStream.length; i += 1) {
      const window = tokenStream.slice(i, i + size);
      const keys = window.map((entry) => entry.key);
      if (keys.every((key) => stopwords.has(key))) continue;
      if (keys.some((key) => key.length < minWordLength)) continue;
      // Reject windows spanning a sentence boundary: those are not units.
      const sentence = window[0]?.sentence ?? "";
      if (!window.every((entry) => entry.sentence === sentence)) continue;

      const phraseKey = keys.join(" ");
      const existing = phrases.get(phraseKey);
      if (existing) {
        existing.occurrences += 1;
        continue;
      }
      phrases.set(phraseKey, {
        surface: originalCaseFor(phraseKey, text),
        occurrences: 1,
        contextSentence: sentence,
      });
    }
  }

  // ---- Score and merge ----------------------------------------------------
  const maxOccurrences = Math.max(
    1,
    ...[...words.values()].map((w) => w.occurrences),
    ...[...phrases.values()].map((p) => p.occurrences),
  );
  const logMax = Math.log1p(maxOccurrences);

  const results: ExtractedCandidate[] = [];
  const seen = new Set<string>();

  const frequencyScore = (occurrences: number) =>
    logMax > 0 ? Math.log1p(occurrences) / logMax : 0;

  for (const [key, counted] of phrases) {
    if (counted.occurrences < 2) continue; // A one-off n-gram is coincidence.
    if (knownKeys.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    const lengthBonus = Math.min(1, key.length / 30);
    results.push({
      surface: counted.surface,
      surfaceKey: key,
      kind: "phrase",
      occurrences: counted.occurrences,
      contextSentence: counted.contextSentence,
      // A recurring phrase outranks an equally frequent single word.
      score: clamp01(0.6 * frequencyScore(counted.occurrences) + 0.25 + 0.15 * lengthBonus),
    });
  }

  for (const [key, counted] of words) {
    if (knownKeys.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    const lengthBonus = Math.min(1, key.length / 12);
    const shortPenalty = key.length <= 3 ? 0.15 : 0;

    results.push({
      surface: counted.surface,
      surfaceKey: key,
      kind: "word",
      occurrences: counted.occurrences,
      contextSentence: counted.contextSentence,
      score: clamp01(
        0.75 * frequencyScore(counted.occurrences) + 0.2 * lengthBonus - shortPenalty,
      ),
    });
  }

  return results
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.occurrences - a.occurrences ||
        a.surfaceKey.localeCompare(b.surfaceKey),
    )
    .slice(0, Math.max(0, limit));
}

/**
 * Recover natural casing for a phrase from the original text.
 *
 * A folded key loses accents, so the sentence the phrase came from is searched
 * with a case-insensitive, accent-tolerant pattern and the match returned as it
 * was written.
 */
function originalCaseFor(phraseKey: string, text: string): string {
  const words = phraseKey.split(" ").filter(Boolean);
  if (words.length === 0) return phraseKey;

  // `\p{M}` keeps combining marks attached, so "café" matches as one unit.
  const pattern = words
    .map((word) => escapeRegExp(word).replace(/[aeiounc]/g, (letter) => `[${letter}${accentVariants(letter)}]`))
    .join("[\\s\\u00A0]+");

  const match = new RegExp(pattern, "iu").exec(text);
  return match ? match[0].replace(/\s+/g, " ").trim() : phraseKey;
}

function accentVariants(letter: string): string {
  const map: Record<string, string> = {
    a: "áàâäã",
    e: "éèêë",
    i: "íìîï",
    o: "óòôöõ",
    u: "úùûü",
    n: "ñ",
    c: "ç",
  };
  return map[letter] ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Text-length ceiling. Longer input is rejected with a clear message elsewhere. */
export const MAX_SOURCE_CHARS = 60_000;
