/**
 * Deterministic token shuffling for the arrange exercise.
 *
 * Seeded by the sentence rather than randomised, for two reasons: the exercise
 * must present the same arrangement on every visit (so recognition is based on
 * the content), and a re-render must never reorder tiles under the learner's
 * finger. A `Math.random()` shuffle fails both.
 *
 * Lives in `lib/` rather than beside the component so it can be unit-tested
 * without a DOM — it is the one part of the arrange step that can be *wrong* in
 * a way nobody would notice from reading the screen.
 */

export function shuffleTokens(surface: string): string[] {
  const tokens = surface.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return tokens;

  let seed = 0;
  for (const character of surface) {
    seed = (seed * 31 + character.charCodeAt(0)) % 9973;
  }

  for (let i = tokens.length - 1; i > 0; i -= 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    const left = tokens[i] as string;
    const right = tokens[j] as string;
    tokens[i] = right;
    tokens[j] = left;
  }

  // A shuffle that leaves the answer already in order would hand the learner the
  // solution, so rotate once when that happens.
  if (tokens.join(" ") === surface) {
    const first = tokens.shift();
    if (first !== undefined) tokens.push(first);
  }

  return tokens;
}
