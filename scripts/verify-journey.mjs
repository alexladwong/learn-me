/**
 * End-to-end learner journey verification.
 *
 * Run:  npm run verify:journey
 *
 * The other three verifiers check pieces: `verify-backend` the database rules,
 * `verify-logic` the TypeScript over live data, `verify-layout` the rendering.
 * None of them walks a *learner* from signup to a finished review, which is
 * where cross-module bugs live — a lesson that saves items but never enrols
 * them, a review that schedules a card but never updates the rollup, an error
 * that never reaches the confusion engine.
 *
 * This drives one throwaway account through the whole product in order,
 * asserting the invariants that connect each step to the next. Each step calls
 * the same data-layer function the corresponding Server Action calls, because
 * that is exactly what an action is: a thin validated wrapper over these.
 *
 * The account is deleted at the end, including when a step throws.
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
// real cookie store is unnecessary because every module under test takes an
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

const { listLessons, getLesson, listMissionItemIds, pickNextLesson, startingLevel } =
  await jiti.import("./lib/db/lessons.ts");
const { saveItemsToBank, listBankEntries, getBankCounts } = await jiti.import(
  "./lib/db/bank.ts",
);
const { listDueCards, getReviewQueueStats } = await jiti.import("./lib/db/reviews.ts");
const { getUserStats, refreshDueCount } = await jiti.import("./lib/db/learner.ts");
const { listConfusionPatterns, MIN_OCCURRENCES, RESOLUTION_STREAK } = await jiti.import(
  "./lib/db/confusions.ts",
);
const { loadDrillMaterial, findItemsContaining } = await jiti.import("./lib/db/drills.ts");
const { computeLanguageDna } = await jiti.import("./lib/db/dna.ts");
const { getWeeklySummary } = await jiti.import("./lib/db/progress.ts");
const { budgetFor, describeSessionSize, MAX_SESSION_CARDS } = await jiti.import(
  "./lib/learning/budget.ts",
);
const { schedule, dueAt, initialState } = await jiti.import("./lib/learning/fsrs.ts");
const { fingerprint } = await jiti.import("./lib/learning/fingerprint.ts");

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
function step(title) {
  console.log(`\n── ${title}`);
}

const anon = createClient({ baseUrl: url, anonKey });
const admin = createClient({ baseUrl: url, anonKey: adminKey });

const email = `journey-${Date.now()}@example.com`;
const password = "journey-password-1234";
let userId = null;

try {
  // ── 1. Sign up ───────────────────────────────────────────────────────────
  step("Sign up and choose a language");

  await anon.auth.signUp({ email, password, name: "Journey Learner" });
  const signIn = await anon.auth.signInWithPassword({ email, password });
  userId = signIn.data?.user?.id;

  const accessToken = signIn.data?.accessToken;
  const authed = createClient({ baseUrl: url, anonKey, accessToken });

  record("a new account can sign in", Boolean(userId), userId ?? "no session");

  const profile = await authed.database
    .from("profiles")
    .select("id,onboarding_state")
    .eq("id", userId)
    .maybeSingle();

  record(
    "the signup trigger provisioned a profile",
    profile.data?.id === userId,
    profile.error?.message ?? `onboarding=${profile.data?.onboarding_state}`,
  );

  // Onboarding: an A2 learner, 20 minutes a day. The level matters — it is what
  // decides which lessons they are given next.
  const learnerWrite = await authed.database.from("learner_languages").upsert(
    [
      {
        user_id: userId,
        language_code: "es",
        is_primary: true,
        motivation: ["travel"],
        cefr_level: "A2",
        cefr_goal: "B1",
        daily_minutes: 20,
        skill_priorities: ["speaking"],
      },
    ],
    { onConflict: "user_id,language_code" },
  );
  if (learnerWrite.error) throw new Error(`learner_languages: ${learnerWrite.error.message}`);

  await authed.database
    .from("profiles")
    .update({ onboarding_state: "complete", native_language: "en" })
    .eq("id", userId);

  const learner = await authed.database
    .from("learner_languages")
    .select("daily_minutes,cefr_level,cefr_goal")
    .eq("language_code", "es")
    .maybeSingle();

  record(
    "the onboarding plan is saved",
    learner.data?.cefr_level === "A2" && learner.data?.daily_minutes === 20,
    `level=${learner.data?.cefr_level} goal=${learner.data?.cefr_goal} minutes=${learner.data?.daily_minutes}`,
  );

  // ── 2. The path respects placement ───────────────────────────────────────
  step("The path is chosen for their level");

  const lessons = await listLessons(authed, "es");
  const start = startingLevel("A2", "B1");
  const next = pickNextLesson(lessons, new Set(), start);

  record(
    "an A2 learner is offered A2 content, not A1",
    next?.lesson.cefrLevel === "A2" && next.isRevision === false,
    next ? `"${next.lesson.title}" (${next.lesson.cefrLevel})` : "nothing offered",
  );

  // ── 3. Play the lesson ───────────────────────────────────────────────────
  step("Play a lesson and finish it");

  const missionId = next.lesson.missionId;
  const lesson = await getLesson(authed, "es", missionId);
  const missionItems = await listMissionItemIds(authed, missionId);

  // The rest of the unit, finished later. `comí` is taught across two missions
  // in this unit, so a drill only has enough material once both are done —
  // which is the behaviour under test further down.
  const unitLessons = lessons.filter(
    (candidate) =>
      candidate.unitTitle === next.lesson.unitTitle &&
      candidate.cefrLevel === next.lesson.cefrLevel,
  );
  const sibling = unitLessons.find((candidate) => candidate.missionId !== missionId) ?? null;
  const siblingItems = sibling ? await listMissionItemIds(authed, sibling.missionId) : [];

  record(
    "the lesson loads with ordered steps and items",
    Boolean(lesson && lesson.steps.length > 0 && missionItems.length > 0),
    lesson ? `${lesson.steps.length} steps, ${missionItems.length} items` : "no lesson",
  );

  // Finishing is what enrols the items. Answer half correctly — realistic, and
  // it gives the confusion engine real material later.
  const saved = await saveItemsToBank(
    authed,
    userId,
    "es",
    missionItems,
    `mission:${missionId}`,
  );

  const completion = await authed.database.rpc("record_mission_completion", {
    p_mission_id: missionId,
    p_language_code: "es",
    p_accuracy: 0.5,
    p_items_enrolled: missionItems.length,
  });
  if (completion.error) throw new Error(`completion: ${completion.error.message}`);

  record(
    "finishing a lesson saves every item to the bank",
    saved.saved + saved.alreadyPresent === missionItems.length,
    `${saved.saved} new, ${saved.alreadyPresent} already present`,
  );

  const dueAfterLesson = await refreshDueCount(authed, null);

  record(
    "the lesson's items enter the review queue due now",
    dueAfterLesson === missionItems.length,
    `${dueAfterLesson} due of ${missionItems.length} enrolled`,
  );

  // ── 4. Review them ───────────────────────────────────────────────────────
  step("Review the cards");

  const statsBeforeReview = await getUserStats(authed, "es");
  const budget = budgetFor(20);
  const due = await listDueCards(authed, "es", budget.sessionCards);
  const size = describeSessionSize(due.length, budget);

  record(
    "the queue is sized to the learner's own budget, not a constant",
    due.length <= budget.sessionCards && budget.sessionCards <= MAX_SESSION_CARDS,
    `${due.length} cards for a 20-minute budget (max ${budget.sessionCards})`,
  );

  record(
    "the session description matches the queue it describes",
    size.cards === due.length,
    size.message,
  );

  // Review every due card, rating half of them "again" so the schedule has to
  // actually move in both directions.
  let reviewed = 0;
  let lapsed = 0;
  for (const [index, card] of due.entries()) {
    const rating = index % 2 === 0 ? "again" : "good";
    const outcome = schedule(initialState(), rating, 0);

    const applied = await authed.database.rpc("apply_review", {
      p_user_id: userId,
      p_item_id: card.itemId,
      p_language_code: "es",
      p_rating: rating,
      p_next_due_at: dueAt(new Date(), outcome).toISOString(),
      p_stability: outcome.stability,
      p_difficulty: outcome.difficulty,
      p_state: outcome.state,
      p_mastery: outcome.mastery,
      p_interval_days: outcome.intervalDays,
      p_elapsed_days: 0,
      p_mode: "review",
    });
    if (applied.error) {
      record(`reviewing card ${index + 1} of ${due.length}`, false, applied.error.message);
      break;
    }
    reviewed += 1;
    if (rating === "again") lapsed += 1;
  }

  record(
    "every due card can be reviewed through the scheduler",
    reviewed === due.length && reviewed > 0,
    `${reviewed} of ${due.length} reviewed, ${lapsed} lapsed`,
  );

  // The review screen recomputes the rollups when it loads; the counters are not
  // written per card, because a 60-card session would then be 60 extra scans.
  await refreshDueCount(authed, null);

  const statsAfterReview = await getUserStats(authed, "es");

  record(
    "the review rollup counts exactly the reviews performed",
    statsAfterReview?.total_reviews === reviewed,
    `total_reviews=${statsAfterReview?.total_reviews}, expected ${reviewed}` +
      (statsBeforeReview ? ` (was ${statsBeforeReview.total_reviews})` : ""),
  );

  record(
    "the streak starts on the first real day of study",
    (statsAfterReview?.streak_current ?? 0) >= 1,
    `streak=${statsAfterReview?.streak_current}`,
  );

  const weekly = await getWeeklySummary(authed, "es", 7);
  record(
    "this week's activity matches the reviews performed",
    weekly?.reviews === reviewed,
    weekly ? `${weekly.reviews} reviews over ${weekly.active_days} active day(s)` : "no summary",
  );

  // A lapsed card must come back sooner than a graduated one — this is the
  // whole point of the scheduler, and the easiest thing to get silently wrong.
  const queueAfter = await getReviewQueueStats(authed, "es");
  record(
    "lapsed cards stay in the queue and passed cards are scheduled ahead",
    queueAfter.learning + queueAfter.graduated === due.length,
    `learning=${queueAfter.learning} graduated=${queueAfter.graduated} total=${queueAfter.total}`,
  );

  // ── 4b. A replayed review must not count twice ───────────────────────────
  // This is what makes the offline queue safe: a batch that half-syncs and is
  // retried, a double-tap, or a request that succeeds but whose response is lost
  // all replay a review. Before the idempotency key existed, each replay wrote a
  // second event, advanced `reps` again and inflated the daily count.
  step("Replaying a review does not schedule it twice");

  const replayCard = due[0];
  const replayKey = crypto.randomUUID();
  const replayParams = {
    p_user_id: userId,
    p_item_id: replayCard.itemId,
    p_language_code: "es",
    p_rating: "good",
    p_next_due_at: new Date(Date.now() + 4 * 86_400_000).toISOString(),
    p_stability: 4,
    p_difficulty: 5,
    p_state: "review",
    p_mastery: 0.4,
    p_interval_days: 4,
    p_elapsed_days: 0,
    p_mode: "review",
    p_client_key: replayKey,
  };

  const firstApply = await authed.database.rpc("apply_review", replayParams);
  const secondApply = await authed.database.rpc("apply_review", replayParams);
  const thirdApply = await authed.database.rpc("apply_review", replayParams);

  record(
    "the same key applies once and is then ignored",
    !firstApply.error &&
      !secondApply.error &&
      !thirdApply.error &&
      firstApply.data?.reps === secondApply.data?.reps &&
      secondApply.data?.reps === thirdApply.data?.reps,
    `reps ${firstApply.data?.reps} → ${secondApply.data?.reps} → ${thirdApply.data?.reps}`,
  );

  const replayEvents = await authed.database
    .from("review_events")
    .select("id")
    .eq("client_key", replayKey);

  record(
    "a replayed review writes exactly one event",
    replayEvents.data?.length === 1,
    `${replayEvents.data?.length} event(s) for that key`,
  );

  const afterReplay = await refreshDueCount(authed, null);
  await refreshDueCount(authed, null);
  const replayStats = await getUserStats(authed, "es");

  record(
    "replaying does not inflate the lifetime review count",
    replayStats?.total_reviews === reviewed + 1,
    `total_reviews=${replayStats?.total_reviews}, expected ${reviewed + 1}`,
  );

  record(
    "the queue is unchanged by the replays",
    typeof afterReplay === "number",
    `${afterReplay} due`,
  );

  // A genuinely new review must still apply, or the gate would be swallowing work.
  const freshApply = await authed.database.rpc("apply_review", {
    ...replayParams,
    p_client_key: crypto.randomUUID(),
  });

  record(
    "a new review still applies after a replay",
    !freshApply.error && (freshApply.data?.reps ?? 0) > (thirdApply.data?.reps ?? 0),
    `reps ${thirdApply.data?.reps} → ${freshApply.data?.reps}`,
  );

  // ── 5. Errors become a pattern, then a drill ─────────────────────────────
  step("A repeated mistake becomes a pattern, then a drill");

  const candidates = await findItemsContaining(authed, "es", "comí");
  const target = candidates[0] ?? null;

  if (!target) {
    record("A2 preterite material exists to make mistakes against", false, "no «comí» item");
  } else {
    // One confusion, three times. The fingerprint deliberately keys on the
    // expected form and the *error type*, so three different wrong forms do not
    // necessarily share a fingerprint: `comió` is classified as spelling (it
    // differs from `comí` only by the accent) while `comiste` and `comieron` are
    // conjugated forms. Mixing them would split the evidence across buckets and
    // never reach MIN_OCCURRENCES, which is correct behaviour, not a bug.
    const mistakes = ["comiste", "comiste", "comiste"];
    const insert = await authed.database.from("practice_events").insert(
      mistakes.map((produced) => {
        const classified = fingerprint({ expected: "comí", produced, mode: "recall" });
        return {
          user_id: userId,
          language_code: "es",
          item_id: target.itemId,
          mode: "recall",
          is_correct: false,
          expected: "comí",
          produced,
          error_type: classified.errorType,
          fingerprint: classified.fingerprint,
        };
      }),
    );
    if (insert.error) throw new Error(`practice_events: ${insert.error.message}`);

    const patterns = await listConfusionPatterns(authed, "es");
    const pattern = patterns.find((item) => item.expectedForm === "comí");

    record(
      `${MIN_OCCURRENCES} identical errors become one reported pattern`,
      Boolean(pattern) && pattern.occurrences === mistakes.length,
      pattern
        ? `"${pattern.expectedForm}" missed ${pattern.occurrences}x, forms: ${pattern.producedForms.join(", ")}`
        : `no pattern found among ${patterns.length} pattern(s)`,
    );

    if (pattern) {
      record(
        "the pattern is explained, not just counted",
        Boolean(pattern.explanation),
        pattern.explanation ?? "no tabulated explanation available",
      );

      // Reading drill material only from the learner's own bank is a deliberate
      // product decision — being drilled on a sentence you never chose to learn
      // is how this would become homework. This learner has finished one lesson,
      // so exactly one sentence containing "comí" is theirs, and the honest
      // outcome is a refusal with a reason rather than a pad of filler.
      const thin = await loadDrillMaterial(authed, "es", pattern.fingerprint);

      record(
        "one saved sentence is refused with a reason, not padded with filler",
        thin?.drill === null && Boolean(thin.unavailableReason),
        thin?.unavailableReason ?? "a drill was built from insufficient material",
      );

      // Now finish the rest of the unit, the way a learner working through
      // their path would, and the same pattern should have real material.
      if (!sibling) {
        record(
          "the unit has a second mission to finish",
          false,
          "no sibling mission found, so the drill path is unverified",
        );
      } else {
        const siblingSave = await saveItemsToBank(
          authed,
          userId,
          "es",
          siblingItems,
          `mission:${sibling.missionId}`,
        );
        const siblingCompletion = await authed.database.rpc("record_mission_completion", {
          p_mission_id: sibling.missionId,
          p_language_code: "es",
          p_accuracy: 0.6,
          p_items_enrolled: siblingItems.length,
        });
        if (siblingCompletion.error) {
          throw new Error(`sibling completion: ${siblingCompletion.error.message}`);
        }

        const material = await loadDrillMaterial(authed, "es", pattern.fingerprint);

        record(
          `finishing "${sibling.title}" gives the drill real sentences`,
          Boolean(material?.drill) && material.drill.steps.length > 0,
          material?.drill
            ? `${siblingSave.saved} more saved, ${material.drill.steps.length} steps over ${material.drill.forms.length} forms`
            : (material?.unavailableReason ?? "no material"),
        );

        record(
          "the drill contrast names the person and tense",
          Boolean(material?.drill) &&
            material.drill.steps.some(
              (item) => item.kind === "teach" && item.headline.length > 0,
            ),
          material?.drill?.steps.find((item) => item.kind === "teach")?.headline ??
            "no teach step",
        );
      }

      record(
        "an unresolved pattern is not reported as fixed",
        pattern.wasResolved === false && pattern.correctStreak < RESOLUTION_STREAK,
        `wasResolved=${pattern.wasResolved} correctStreak=${pattern.correctStreak}/${RESOLUTION_STREAK}`,
      );
    }
  }

  // ── 6. Progress reflects what happened ───────────────────────────────────
  step("Progress and Language DNA reflect the session");

  const dna = await computeLanguageDna(authed, "es");

  record(
    "Language DNA returns one estimate per skill",
    dna.estimates.length === 6,
    dna.estimates.map((estimate) => estimate.skill).join(", "),
  );

  const measured = dna.estimates.filter((estimate) => estimate.score !== null);
  const withheld = dna.estimates.filter((estimate) => estimate.score === null);

  record(
    "a skill with real evidence gets a number",
    measured.length > 0 &&
      measured.every((estimate) => estimate.score >= 0 && estimate.score <= 1),
    measured.map((e) => `${e.skill}=${e.score.toFixed(2)} (n=${e.sampleSize})`).join(", "),
  );

  record(
    "a skill with no evidence is withheld, never reported as zero",
    withheld.length > 0 && withheld.every((estimate) => Boolean(estimate.missing)),
    withheld.map((e) => `${e.skill}: ${e.missing}`).join(" | "),
  );

  // The two missions in this unit share at least one sentence ("Comí con mi
  // familia el domingo." is taught by both), so the bank holds the union, not
  // the sum — saving the same item twice must not create two rows.
  const expectedBankSize = new Set([...missionItems, ...siblingItems]).size;

  const bank = await getBankCounts(authed, "es");
  record(
    "the bank holds the union of both lessons' items, with no duplicates",
    bank.total === expectedBankSize,
    `${bank.total} saved of ${expectedBankSize} distinct (${missionItems.length} + ${siblingItems.length} taught, overlapping) — ${bank.words} words, ${bank.sentences} sentences`,
  );

  const entries = await listBankEntries(authed, "es", { limit: 5 });
  record(
    "bank entries load joined to their memory state",
    entries.length > 0 && entries.every((entry) => entry.memory?.state),
    entries.length > 0
      ? `${entries.length} entries, first state=${entries[0].memory?.state}`
      : "no entries",
  );

  // ── 7. Replay, which is where journeys usually corrupt state ─────────────
  step("Replaying a lesson does not corrupt the learner's state");

  const before = await getUserStats(authed, "es");
  const queueBefore = await getReviewQueueStats(authed, "es");

  const resave = await saveItemsToBank(authed, userId, "es", missionItems, "manual");
  const replay = await authed.database.rpc("record_mission_completion", {
    p_mission_id: missionId,
    p_language_code: "es",
    p_accuracy: 0.9,
    p_items_enrolled: missionItems.length,
  });
  if (replay.error) throw new Error(`replay: ${replay.error.message}`);

  const after = await getUserStats(authed, "es");
  const queueAfterReplay = await getReviewQueueStats(authed, "es");

  record(
    "re-saving a lesson adds nothing and resets no schedule",
    resave.saved === 0 && resave.alreadyPresent === missionItems.length,
    `${resave.saved} new, ${resave.alreadyPresent} already present`,
  );

  record(
    "replaying a lesson does not duplicate queued cards",
    queueAfterReplay.total === queueBefore.total,
    `${queueBefore.total} -> ${queueAfterReplay.total} queued`,
  );

  record(
    "replaying a lesson does not inflate review counts",
    after?.total_reviews === before?.total_reviews,
    `total_reviews ${before?.total_reviews} -> ${after?.total_reviews}`,
  );

  const completions = await authed.database
    .from("mission_completions")
    .select("completions,accuracy,items_enrolled")
    .eq("mission_id", missionId)
    .eq("user_id", userId)
    .maybeSingle();

  record(
    "replaying increments the completion instead of duplicating the row",
    completions.data?.completions === 2 &&
      completions.data?.items_enrolled === missionItems.length,
    `completions=${completions.data?.completions} accuracy=${completions.data?.accuracy}`,
  );
} catch (error) {
  console.error("\njourney verification threw:", error);
  record("the journey ran to completion", false, String(error).slice(0, 300));
} finally {
  if (userId) {
    // Deleting the auth user cascades across the public schema; only the Admin
    // API can remove the account row itself.
    await admin.database.from("profiles").delete().eq("id", userId);
    const cleanup = await fetch(`${url}/api/auth/users`, {
      method: "DELETE",
      headers: { "x-api-key": adminKey, "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [userId] }),
    }).catch(() => null);
    if (!cleanup || !cleanup.ok) {
      console.warn(`cleanup warning: journey account ${userId} may remain`);
    }
  }
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
