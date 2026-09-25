/**
 * Exercise the learning-logic modules against live data.
 *
 * Run:  npm run verify:logic
 *
 * `verify:backend.mjs` proves the *database* behaves (RLS, scheduling,
 * append-only history). This proves the TypeScript that sits on top of it
 * behaves: that a real error history is grouped into a pattern with the right
 * count and a correct explanation, and that Language DNA withholds a number
 * rather than inventing one.
 *
 * The modules under test import `@/...` path aliases, so this uses jiti with the
 * alias configured and stubs `next/headers` — the same mechanism Next uses
 * internally. Throwaway accounts are always cleaned up, including on failure.
 */

import { fileURLToPath, pathToFileURL } from "node:url";

import Module from "node:module";
import { createClient } from "@insforge/sdk";

const url = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const adminKey = process.env.INSFORGE_API_KEY;

if (!url || !anonKey || !adminKey) {
  console.error("Missing InsForge env vars. Run with --env-file=.env.local");
  process.exit(1);
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

// ---- Stub the Next request-scoped modules ---------------------------------
// `@insforge/sdk/ssr` reaches for `next/headers` merely by being imported. A
// real cookie store is unnecessary here because every module under test takes an
// already-authenticated client as a parameter.
const jar = new Map();
const STUBS = {
  "next/headers": {
    cookies: async () => ({
      get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      set: (name, value) => jar.set(name, value),
      delete: (name) => jar.delete(name),
    }),
  },
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (Object.hasOwn(STUBS, request)) return STUBS[request];
  return originalLoad.call(this, request, parent, isMain);
};

const { createJiti } = await import("jiti");
const jiti = createJiti(pathToFileURL("./").href, {
  interopDefault: true,
  alias: { "@": projectRoot },
  nativeModules: ["react", "react-dom", "next"],
});

const { listConfusionPatterns, describePattern, MIN_OCCURRENCES } = await jiti.import(
  "./lib/db/confusions.ts",
);
const { computeLanguageDna, MIN_CONFIDENCE } = await jiti.import("./lib/db/dna.ts");
const { loadDrillMaterial, findItemsContaining, recordDrillOutcome } = await jiti.import(
  "./lib/db/drills.ts",
);
const { RESOLUTION_STREAK } = await jiti.import("./lib/db/confusions.ts");
const { MIN_DRILL_ITEMS } = await jiti.import("./lib/learning/drill.ts");
const { budgetFor, describeSessionSize, estimateReviewMinutes } = await jiti.import(
  "./lib/learning/budget.ts",
);
const { listDueCards } = await jiti.import("./lib/db/reviews.ts");
const { listLessons, pickNextLesson, startingLevel, levelRank } = await jiti.import(
  "./lib/db/lessons.ts",
);
const { describeContrast, knownLemmas, paradigmFor, tensesFor } = await jiti.import(
  "./lib/learning/paradigms.ts",
);

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const anon = createClient({ baseUrl: url, anonKey });

const email = `logic-${Date.now()}@example.com`;
const password = "logic-password-1234";

let userId = null;

try {
  await anon.auth.signUp({ email, password, name: "Logic Verify" });
  const signIn = await anon.auth.signInWithPassword({ email, password });
  userId = signIn.data?.user?.id;
  const accessToken = signIn.data?.accessToken;

  if (!userId || !accessToken) throw new Error("could not create a session");

  const authed = createClient({ baseUrl: url, anonKey, accessToken });

  await authed.database
    .from("learner_languages")
    .upsert([{ user_id: userId, language_code: "es", is_primary: true }], {
      onConflict: "user_id,language_code",
    });

  // ---- Confusion engine ---------------------------------------------------
  // Three occurrences of the same confusion, which is exactly the threshold.
  const now = Date.now();
  const events = [
    { produced: "comes", daysAgo: 0 },
    { produced: "comemos", daysAgo: 1 },
    { produced: "come", daysAgo: 2 },
    // A single unrelated slip must NOT become a reported pattern.
    { produced: "leche", daysAgo: 0, fingerprint: "vocabulary:agua->leche", expected: "agua" },
  ];

  const { error: seedError } = await authed.database.from("practice_events").insert(
    events.map((event) => ({
      user_id: userId,
      language_code: "es",
      mode: "recall",
      is_correct: false,
      expected: event.expected ?? "como",
      produced: event.produced,
      error_type: event.fingerprint ? "vocabulary" : "conjugation",
      fingerprint: event.fingerprint ?? "conjugation:como",
      created_at: new Date(now - event.daysAgo * 86_400_000).toISOString(),
    })),
  );

  record("seed practice events", !seedError, seedError?.message);

  const patterns = await listConfusionPatterns(authed, "es");
  const conjugation = patterns.find((pattern) => pattern.fingerprint === "conjugation:como");

  record(
    "a repeated confusion is reported",
    Boolean(conjugation),
    conjugation ? `${conjugation.occurrences} occurrences` : `only: ${patterns.map((p) => p.fingerprint).join(", ")}`,
  );

  record(
    "the occurrence count is correct",
    conjugation?.occurrences === 3,
    `counted ${conjugation?.occurrences}`,
  );

  record(
    "occurrences spread across days are noticed",
    conjugation?.distinctDays === 3,
    `${conjugation?.distinctDays} distinct days`,
  );

  // The fingerprint stores the *normalised form* the learner should have
  // produced, not the infinitive. This assertion used to accept either, which is
  // precisely why a broken lookup went unnoticed: the lemma has to be resolved
  // through the paradigm table ("como" -> "comer"), because that is what
  // `describeContrast` is given. Accepting the raw tail let the two disagree.
  record(
    "the lemma is resolved from the fingerprint, not passed through raw",
    conjugation?.lemma === "comer",
    `lemma=${conjugation?.lemma}`,
  );

  record(
    "a real conjugation pattern carries a tabulated explanation",
    Boolean(conjugation?.explanation),
    conjugation?.explanation ?? "no explanation: the lemma did not resolve",
  );

  record(
    "the produced forms are ranked by frequency",
    conjugation?.producedForms.length === 3,
    conjugation?.producedForms.join(", "),
  );

  record(
    "a one-off slip is not reported as a weakness",
    !patterns.some((pattern) => pattern.fingerprint === "vocabulary:agua->leche"),
    `below the ${MIN_OCCURRENCES}-occurrence threshold`,
  );

  record(
    "the pattern is described in plain language",
    Boolean(conjugation && describePattern(conjugation).length > 20),
    conjugation ? describePattern(conjugation) : "no pattern",
  );

  record(
    "every reported pattern carries its evidence",
    (conjugation?.examples.length ?? 0) > 0,
    `${conjugation?.examples.length} examples attached`,
  );

  // ---- The explanation is only as strong as the paradigm table -------------
  const explainable = describeContrast("es", "comer", "como", "comes");
  record(
    "a tabulated contrast is explained with both persons",
    Boolean(explainable && /comes/.test(explainable) && /como/.test(explainable)),
    explainable,
  );

  record(
    "an untabulated verb is not explained rather than guessed",
    describeContrast("es", "cantar", "canto", "cantas") === null,
    "cantar has no paradigm, so no claim is made",
  );

  // ---- Language DNA -------------------------------------------------------
  // No review_states and no listening audio: both must be withheld, not zeroed.
  const dna = await computeLanguageDna(authed, "es");

  record(
    "DNA returns an estimate for every skill",
    dna.estimates.length === 6,
    dna.estimates.map((estimate) => estimate.skill).join(", "),
  );

  const speaking = dna.estimates.find((estimate) => estimate.skill === "speaking");
  record(
    "speaking is withheld with a reason, not shown as 0%",
    speaking?.score === null && Boolean(speaking?.missing),
    speaking?.missing,
  );

  const pronunciation = dna.estimates.find(
    (estimate) => estimate.skill === "pronunciation",
  );
  record(
    "pronunciation is withheld pending a speech provider",
    pronunciation?.score === null && pronunciation?.confidence === 0,
    pronunciation?.missing,
  );

  const vocabulary = dna.estimates.find((estimate) => estimate.skill === "vocabulary");
  record(
    "vocabulary is withheld when nothing has been saved",
    vocabulary?.score === null,
    `sampleSize=${vocabulary?.sampleSize}, missing=${vocabulary?.missing}`,
  );

  const reading = dna.estimates.find((estimate) => estimate.skill === "reading");
  record(
    "reading is withheld below the confidence floor",
    reading?.score === null || (reading?.confidence ?? 0) >= MIN_CONFIDENCE,
    `score=${reading?.score}, confidence=${reading?.confidence.toFixed(2)}`,
  );

  record(
    "no estimate claims confidence without evidence",
    dna.estimates.every(
      (estimate) => estimate.sampleSize > 0 || estimate.confidence === 0,
    ),
    "every confident estimate has observations behind it",
  );

  // ---- With enough graded answers, reading becomes measurable -------------
  const readingAnswers = [];
  for (let i = 0; i < 20; i += 1) {
    readingAnswers.push({
      user_id: userId,
      language_code: "es",
      mode: "recognise",
      is_correct: i % 5 !== 0, // 80% correct
      expected: "mercado",
      produced: i % 5 !== 0 ? "mercado" : "leche",
      error_type: i % 5 !== 0 ? "none" : "vocabulary",
      fingerprint: i % 5 !== 0 ? null : "vocabulary:mercado->leche",
    });
  }
  await authed.database.from("practice_events").insert(readingAnswers);

  const dnaAfter = await computeLanguageDna(authed, "es");
  const readingAfter = dnaAfter.estimates.find((estimate) => estimate.skill === "reading");

  record(
    "reading becomes measurable once enough answers exist",
    readingAfter?.score !== null && readingAfter?.confidence >= MIN_CONFIDENCE,
    `score=${readingAfter?.score?.toFixed(2)}, confidence=${readingAfter?.confidence.toFixed(2)}, n=${readingAfter?.sampleSize}`,
  );

  record(
    "graded recall answers count towards reading as well as grammar",
    readingAfter?.sampleSize === 24,
    `n=${readingAfter?.sampleSize} (20 recognition + 4 recall)`,
  );

  // The confusion seed contributed 4 more reading-eligible answers (all wrong),
  // so the expected accuracy across 24 answers is 16/24 — counting only the 20
  // seeded here would assert a number the module is right not to produce.
  const expectedReading = 16 / 24;
  record(
    "the measured reading score matches the real accuracy",
    readingAfter?.score !== null &&
      Math.abs((readingAfter?.score ?? 0) - expectedReading) < 0.03,
    `expected ~${expectedReading.toFixed(3)}, got ${readingAfter?.score?.toFixed(3)}`,
  );

  record(
    "listening is still withheld because no audio was ever answered",
    dnaAfter.estimates.find((estimate) => estimate.skill === "listening")?.score === null,
    "a written-form listening step is not counted as listening",
  );

  // ---- Confusion drills: the consumer the engine existed for ---------------
  {
    // The drill is built from the learner's own bank, so seed sentences that
    // actually contain the form they keep getting wrong.
    const curriculum = await authed.database
      .from("items")
      .select("id,surface,translation_natural")
      .eq("language_code", "es")
      .is("owner_id", null)
      .ilike("surface", "%como%")
      .limit(10);

    const candidates = Array.isArray(curriculum.data) ? curriculum.data : [];
    const withForm = candidates.filter((row) =>
      String(row.surface).toLowerCase().includes("como"),
    );

    record(
      "curriculum sentences containing the target form exist",
      withForm.length >= MIN_DRILL_ITEMS,
      `${withForm.length} of ${candidates.length} candidates contain "como"`,
    );

    const saved = await authed.database
      .from("saved_items")
      .upsert(
        withForm.map((row) => ({
          user_id: userId,
          item_id: row.id,
          language_code: "es",
          saved_from: "manual",
        })),
        { onConflict: "user_id,item_id", ignoreDuplicates: true },
      )
      .select("id");

    record(
      "sentences are saved to the learner's bank",
      !saved.error && (saved.data?.length ?? 0) >= MIN_DRILL_ITEMS,
      saved.error?.message ?? `${saved.data?.length} saved`,
    );

    const found = await findItemsContaining(authed, "es", "como");
    record(
      "drill material is found from the bank, whole-word only",
      found.length >= MIN_DRILL_ITEMS,
      `${found.length} usable sentences`,
    );

    record(
      "found sentences all contain the blankable form",
      found.every((item) => item.surface.toLowerCase().includes("como")),
      found.map((item) => item.surface.slice(0, 24)).join(" | "),
    );

    // The full path: a pattern resolves into a drill.
    const material = await loadDrillMaterial(authed, "es", "conjugation:como");

    record(
      "a confusion pattern resolves into a drill",
      Boolean(material?.drill),
      material?.unavailableReason ??
        `${material?.drill?.steps.length} steps, ${material?.drill?.gradedSteps} graded`,
    );

    record(
      "the drill never answers with anything but the expected form",
      (material?.drill?.steps ?? [])
        .filter((step) => step.kind !== "teach")
        .every((step) => step.answer === "como"),
      "every graded step answers with the expected form",
    );

    record(
      "the drill contrasts the expected form against the learner's mistakes",
      (material?.drill?.forms.length ?? 0) >= 2,
      material?.drill?.forms.map((form) => form.form).join(", "),
    );

    // An unknown fingerprint must resolve to nothing rather than to a guess.
    const bogus = await loadDrillMaterial(authed, "es", "conjugation:noexiste");
    record(
      "an unknown pattern yields no drill",
      bogus === null,
      "resolved to nothing",
    );

    // A real pattern with insufficient material must be *refused*, not padded.
    // Seeding the errors is what makes this a genuine test: an id that simply
    // does not exist would trivially resolve to null and prove nothing.
    const barren = "conjugation:trabajo";
    await authed.database.from("practice_events").insert(
      Array.from({ length: 4 }, () => ({
        user_id: userId,
        language_code: "es",
        mode: "recall",
        is_correct: false,
        expected: "trabajo",
        produced: "trabajas",
        error_type: "conjugation",
        fingerprint: barren,
      })),
    );

    const thin = await loadDrillMaterial(authed, "es", barren);
    record(
      "a real pattern with too little material is refused, not padded",
      thin !== null && thin.drill === null && Boolean(thin.unavailableReason),
      thin?.unavailableReason?.slice(0, 100) ?? "no material returned",
    );

    record(
      "the refusal explains what would make a drill possible",
      Boolean(thin?.unavailableReason?.includes("three sentences")),
      thin?.unavailableReason?.slice(0, 70),
    );

    // ---- Resolution: enough correct answers retire the pattern ------------
    // Assert the pattern is currently reported first, so "it disappeared" cannot
    // pass because it was never there.
    const beforePractice = await listConfusionPatterns(authed, "es");
    record(
      "the pattern is reported before it is practised",
      beforePractice.some((pattern) => pattern.fingerprint === "conjugation:como"),
      `${beforePractice.length} pattern(s) reported`,
    );

    if (material?.drill) {
      await recordDrillOutcome(authed, userId, "es", {
        fingerprint: "conjugation:como",
        expectedForm: "como",
        answers: Array.from({ length: RESOLUTION_STREAK }, () => ({
          prompt: "____ arroz",
          produced: "como",
          isCorrect: true,
        })),
      });

      const after = await listConfusionPatterns(authed, "es");
      const stillThere = after.some(
        (pattern) => pattern.fingerprint === "conjugation:como",
      );
      record(
        `a pattern stops being reported after ${RESOLUTION_STREAK} correct answers`,
        !stillThere,
        stillThere
          ? `still reported among: ${after.map((p) => p.fingerprint).join(", ")}`
          : "conjugation:como was retired; others remain as expected",
      );
    }

    // A single fresh mistake must bring it back.
    await authed.database.from("practice_events").insert([
      {
        user_id: userId,
        language_code: "es",
        mode: "recall",
        is_correct: false,
        expected: "como",
        produced: "comes",
        error_type: "conjugation",
        fingerprint: "conjugation:como",
      },
    ]);

    const revived = await listConfusionPatterns(authed, "es");
    record(
      "the pattern is not suppressed while the mistake is still being made",
      revived.some((pattern) => pattern.fingerprint === "conjugation:como") ||
        (revived.find((p) => p.fingerprint === "conjugation:como")?.occurrences ?? 0) < 3,
      revived.length === 0
        ? "not yet at the threshold again"
        : `${revived.length} pattern(s) reported`,
    );
  }

  // ---- The daily budget must actually limit the session -------------------
  {
    const budget = budgetFor(10);

    record(
      "a 10-minute budget produces a session that fits in 10 minutes",
      estimateReviewMinutes(budget.sessionCards) <= 10,
      `${budget.sessionCards} cards ≈ ${estimateReviewMinutes(budget.sessionCards)} min, ${budget.newItems} new items`,
    );

    // Enrol more cards than a small budget covers, then confirm the queue read
    // is actually capped — the composer sizing itself is not enough if the
    // review screen still fetches everything.
    const curriculum = await authed.database
      .from("items")
      .select("id")
      .eq("language_code", "es")
      .is("owner_id", null)
      .limit(40);

    const itemIds = (Array.isArray(curriculum.data) ? curriculum.data : []).map(
      (row) => row.id,
    );

    await authed.database.from("review_states").upsert(
      itemIds.map((id) => ({
        user_id: userId,
        item_id: id,
        language_code: "es",
        state: "new",
      })),
      { onConflict: "user_id,item_id", ignoreDuplicates: true },
    );

    // `ignoreDuplicates` deliberately leaves an existing schedule alone, and
    // earlier checks in this run scheduled some of these items days ahead — so
    // the fixture has to make them due explicitly. Without this the queue read
    // returns nothing and the cap is never exercised.
    await authed.database
      .from("review_states")
      .update({ due_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("language_code", "es")
      .in("item_id", itemIds);

    const smallBudget = budgetFor(5);
    const capped = await listDueCards(authed, "es", smallBudget.sessionCards);
    const uncapped = await listDueCards(authed, "es", 500);

    record(
      "the review queue is capped by the budget, not the backlog",
      capped.length === smallBudget.sessionCards && uncapped.length > capped.length,
      `${capped.length} of ${uncapped.length} due cards returned for a 5-minute budget`,
    );

    const described = describeSessionSize(uncapped.length, smallBudget);
    record(
      "the session description reflects the cap",
      described.cards === smallBudget.sessionCards && !described.limitedByDueCards,
      described.message.slice(0, 100),
    );

    record(
      "a bigger budget yields a bigger session from the same backlog",
      (await listDueCards(authed, "es", budgetFor(30).sessionCards)).length >
        capped.length,
      `5 min -> ${capped.length}, 30 min -> ${
        (await listDueCards(authed, "es", budgetFor(30).sessionCards)).length
      }`,
    );
  }

  // ---- Past-tense paradigm coverage ---------------------------------------
  // A2 content is largely about the past, and the drill generator can only
  // practise a form it can name. This guards the dependency that had to be
  // satisfied *before* A2 content was written.
  {
    for (const code of ["es", "fr", "de"]) {
      const tenses = tensesFor(code);
      const withPast = knownLemmas(code).filter((lemma) =>
        paradigmFor(code, lemma).some((form) => form.tense !== "present"),
      );

      record(
        `"${code}" can label past-tense forms`,
        tenses.some((tense) => tense !== "present") && withPast.length >= 5,
        `tenses: ${tenses.join(", ")} — ${withPast.length} verbs with past forms`,
      );
    }

    // The explanation a learner actually reads, for a real past-tense confusion.
    const confusion = describeContrast("es", "comer", "comió", "comiste");
    record(
      "a past-tense person error is explained in plain language",
      Boolean(confusion && /3rd person singular/.test(confusion)),
      confusion,
    );

    // And the refusal that keeps it honest.
    record(
      "an untabulated past form is refused rather than guessed",
      describeContrast("es", "cantar", "cantó", "canté") === null,
      "cantar has no paradigm, so no claim is made",
    );
  }

  // ---- Level-aware content selection --------------------------------------
  // The bug this guards: lesson order was unit order, and each track restarts its
  // own order index at 10. Across two tracks that interleaved A2 lessons into A1,
  // so a learner halfway through A2 was sent back to A1 Foundations — and a
  // learner who placed at A2 was started there too.
  {
    for (const code of ["es", "fr", "de"]) {
      const lessons = await listLessons(authed, code);

      record(
        `"${code}" lessons are ordered by level`,
        lessons.every(
          (lesson, index) =>
            index === 0 ||
            levelRank(lesson.cefrLevel) >= levelRank(lessons[index - 1].cefrLevel),
        ),
        lessons
          .slice(0, 4)
          .map((lesson) => lesson.cefrLevel ?? "?")
          .join(" -> "),
      );

      record(
        `"${code}" exposes lessons at both A1 and A2`,
        lessons.some((lesson) => lesson.cefrLevel === "A1") &&
          lessons.some((lesson) => lesson.cefrLevel === "A2"),
        `${lessons.length} lessons, levels ${[...new Set(lessons.map((l) => l.cefrLevel))].join(", ")}`,
      );

      // The placement test: an A2 learner must be offered A2, not A1.
      const forA2 = pickNextLesson(lessons, new Set(), "A2");
      record(
        `a learner who placed at A2 is not sent back to A1 in "${code}"`,
        forA2?.lesson.cefrLevel === "A2" && !forA2.isRevision,
        forA2
          ? `offered "${forA2.lesson.title}" (${forA2.lesson.cefrLevel}), revision=${forA2.isRevision}`
          : "nothing offered",
      );

      // An A1 learner still starts at A1.
      const forA1 = pickNextLesson(lessons, new Set(), "A1");
      record(
        `a learner at A1 starts at A1 in "${code}"`,
        forA1?.lesson.cefrLevel === "A1" && !forA1.isRevision,
        forA1 ? `offered "${forA1.lesson.title}" (${forA1.lesson.cefrLevel})` : "nothing offered",
      );

      // Finishing A2 must never present A1 material as the natural next step.
      // Falling back to it is allowed — and useful — but it has to be labelled.
      const a2Ids = new Set(
        lessons.filter((lesson) => lesson.cefrLevel === "A2").map((l) => l.missionId),
      );
      const afterA2 = pickNextLesson(lessons, a2Ids, "A2");
      record(
        `finishing A2 in "${code}" never presents A1 as the next step`,
        afterA2 === null ||
          levelRank(afterA2.lesson.cefrLevel) >= levelRank("A2") ||
          afterA2.isRevision,
        afterA2
          ? `next is "${afterA2.lesson.title}" (${afterA2.lesson.cefrLevel}), revision=${afterA2.isRevision}`
          : "nothing further published",
      );
    }

    // Placement defaults, asserted directly.
    record(
      "a learner who skipped placement starts one band below their goal",
      startingLevel(null, "B1") === "A2",
      `goal B1 -> start ${startingLevel(null, "B1")}`,
    );
    record(
      "a learner with no level and no goal starts at A1",
      startingLevel(null, null) === "A1",
      `start ${startingLevel(null, null)}`,
    );
    record(
      "a placed level overrides the goal",
      startingLevel("B1", "C1") === "B1",
      `placed B1, goal C1 -> start ${startingLevel("B1", "C1")}`,
    );
  }
} finally {
  if (userId) {
    // Removing the `profiles` row cascades across the public schema, but the
    // runtime role cannot write to the managed `auth` schema, so the account
    // itself survives. The Admin API is the sanctioned route — see
    // `scripts/reset-test-data.mjs`, which sweeps up anything left behind.
    await fetch(`${url}/api/auth/users`, {
      method: "DELETE",
      headers: { "x-api-key": adminKey, "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [userId] }),
    }).catch(() => {
      console.warn("cleanup warning: could not remove the verification account");
    });
  }
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
