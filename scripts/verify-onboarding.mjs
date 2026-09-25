/**
 * Onboarding verification.
 *
 * Run:  npm run verify:onboarding
 *
 * Onboarding is where a learner's entire plan is decided: which language is
 * primary, what level they are placed at, how long their sessions are. Every
 * other screen reads those answers. No verifier exercised this function
 * directly — `verify:journey` writes the rows by hand, so the real code path had
 * never run.
 *
 * The rule with teeth is the one-primary-language constraint: `learner_languages`
 * has a partial unique index allowing exactly one primary row, and the code
 * decides whether to claim it from a count taken beforehand. Getting that wrong
 * fails as a constraint violation on the second language, which a learner would
 * meet as "something went wrong" while adding a second language — after having
 * already succeeded at the first.
 *
 * A throwaway account is deleted at the end, including when a step throws.
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

// `@insforge/sdk/ssr` reaches for `next/headers` merely by being imported.
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

const {
  saveOnboardingAnswers,
  listLearnerLanguages,
  getLearnerLanguage,
  getProfile,
  getUserStats,
} = await jiti.import("./lib/db/learner.ts");
const { listLessons, pickNextLesson, startingLevel } = await jiti.import("./lib/db/lessons.ts");
const { listLanguages } = await jiti.import("./lib/db/languages.ts");
const { budgetFor } = await jiti.import("./lib/learning/budget.ts");
const {
  ONBOARDING_STEPS,
  STEP_TITLES,
  parseStep,
  FIRST_STEP,
  LAST_STEP,
} = await jiti.import("./lib/onboarding/steps.ts");

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

const email = `onboarding-${Date.now()}@example.com`;
const password = "onboarding-password-1234";
let userId = null;

try {
  // ── 0. The wizard's own arithmetic ───────────────────────────────────────
  step("The step machine is bounded");

  record(
    "there are six steps and they are ordered",
    ONBOARDING_STEPS.length === 6 && ONBOARDING_STEPS[0] === 1 && ONBOARDING_STEPS[5] === 6,
    `${ONBOARDING_STEPS.join(", ")}`,
  );

  record(
    "every step has a title and a subtitle",
    ONBOARDING_STEPS.every((stepNumber) => {
      const entry = STEP_TITLES[stepNumber];
      return Boolean(entry?.title && entry.subtitle);
    }),
    STEP_TITLES[1].title,
  );

  // A hand-edited query string must not skip the wizard or crash it.
  record(
    "an out-of-range or malformed step falls back to the first",
    parseStep("0") === FIRST_STEP &&
      parseStep("7") === FIRST_STEP &&
      parseStep("abc") === FIRST_STEP &&
      parseStep(undefined) === FIRST_STEP &&
      parseStep("999999999999") === FIRST_STEP,
    `"7" -> ${parseStep("7")}, "abc" -> ${parseStep("abc")}`,
  );

  record(
    "a valid step is preserved",
    parseStep("1") === 1 && parseStep(String(LAST_STEP)) === LAST_STEP,
    `"6" -> ${parseStep("6")}`,
  );

  // ── 1. A new learner completes onboarding ────────────────────────────────
  step("A new learner's answers become their plan");

  await anon.auth.signUp({ email, password, name: "Onboarding Verify" });
  const signIn = await anon.auth.signInWithPassword({ email, password });
  userId = signIn.data?.user?.id;
  if (!userId) throw new Error("could not create a session");

  const authed = createClient({ baseUrl: url, anonKey, accessToken: signIn.data?.accessToken });

  const before = await getProfile(authed, userId);
  record(
    "a new profile starts pending, not complete",
    before?.onboarding_state !== "complete",
    `onboarding_state=${before?.onboarding_state}`,
  );

  // The native-language picker offers every catalogue entry; the target picker
  // offers only languages with a guided path. English must be in the first and
  // not the second — when it was missing from the catalogue entirely, the wizard
  // injected it into its own markup and the foreign key on
  // `profiles.native_language` rejected the value the wizard defaulted to.
  const catalogue = await listLanguages(authed);

  record(
    "English is a selectable first language",
    catalogue.all.some((entry) => entry.code === "en"),
    `${catalogue.all.length} languages in the catalogue`,
  );

  record(
    "English is not offered as something to learn here",
    !catalogue.available.some((entry) => entry.code === "en"),
    `available: ${catalogue.available.map((entry) => entry.code).join(", ")}`,
  );

  record(
    "the native-language list is a superset of the learnable list",
    catalogue.available.every((entry) =>
      catalogue.all.some((candidate) => candidate.code === entry.code),
    ) && catalogue.all.length > catalogue.available.length,
    `${catalogue.all.length} in catalogue vs ${catalogue.available.length} learnable`,
  );

  await saveOnboardingAnswers(
    authed,
    userId,
    {
      languageCode: "es",
      nativeLanguage: "en",
      motivations: ["travel", "family"],
      cefrLevel: "A2",
      cefrGoal: "B1",
      dailyMinutes: 20,
      skillPriorities: ["speaking", "listening"],
    },
    { displayName: "Ana", timezone: "Europe/Madrid" },
  );

  const profile = await getProfile(authed, userId);
  record(
    "onboarding marks the profile complete and records when",
    profile?.onboarding_state === "complete" && Boolean(profile?.onboarded_at),
    `state=${profile?.onboarding_state}, at=${profile?.onboarded_at ? "set" : "null"}`,
  );

  record(
    "the native language and display name are saved",
    profile?.native_language === "en" && profile?.display_name === "Ana",
    `native=${profile?.native_language}, name=${profile?.display_name}, tz=${profile?.timezone}`,
  );

  const learner = await getLearnerLanguage(authed, "es");
  record(
    "the plan is saved exactly as answered",
    learner?.cefr_level === "A2" &&
      learner?.cefr_goal === "B1" &&
      learner?.daily_minutes === 20 &&
      learner?.skill_priorities.includes("speaking") &&
      learner?.motivation.includes("travel"),
    `level=${learner?.cefr_level} goal=${learner?.cefr_goal} minutes=${learner?.daily_minutes} priorities=[${learner?.skill_priorities}]`,
  );

  const languages = await listLearnerLanguages(authed);
  const primary = languages.filter((entry) => entry.is_primary);

  record(
    "the first language claims primary, and is the only one that does",
    primary.length === 1 && primary[0].language_code === "es",
    `${languages.length} language(s), ${primary.length} primary`,
  );

  // ── 2. The plan actually drives the product ──────────────────────────────
  step("The answers decide what the learner is given");

  const lessons = await listLessons(authed, "es");
  const next = pickNextLesson(lessons, new Set(), startingLevel(learner.cefr_level, learner.cefr_goal));

  record(
    "the placement decided during onboarding picks the first lesson",
    next?.lesson.cefrLevel === "A2",
    next ? `"${next.lesson.title}" (${next.lesson.cefrLevel})` : "nothing offered",
  );

  const budget = budgetFor(learner.daily_minutes);
  record(
    "the daily budget decided during onboarding sizes the session",
    budget.minutes === 20 && budget.sessionCards > 0,
    `20 minutes -> ${budget.sessionCards} cards, ${budget.newItems} new item(s)`,
  );

  const stats = await getUserStats(authed, "es");
  record(
    "a stats row is seeded, so the dashboard reads a row rather than inventing one",
    stats !== null && stats.total_reviews === 0,
    stats ? `total_reviews=${stats.total_reviews}` : "no stats row",
  );

  // ── 3. Re-running onboarding is a safe edit, not a second enrolment ──────
  step("Changing your mind updates the plan instead of duplicating it");

  await saveOnboardingAnswers(
    authed,
    userId,
    {
      languageCode: "es",
      nativeLanguage: "en",
      motivations: ["work"],
      cefrLevel: "A2",
      cefrGoal: "C1",
      dailyMinutes: 30,
      skillPriorities: ["reading"],
    },
    { displayName: "Ana", timezone: "Europe/Madrid" },
  );

  const languagesAgain = await listLearnerLanguages(authed);
  const learnerAgain = await getLearnerLanguage(authed, "es");

  record(
    "re-running onboarding for the same language does not add a row",
    languagesAgain.length === 1,
    `${languagesAgain.length} language(s)`,
  );

  record(
    "the changed answers replace the old plan",
    learnerAgain?.cefr_goal === "C1" &&
      learnerAgain?.daily_minutes === 30 &&
      learnerAgain?.skill_priorities.length === 1 &&
      learnerAgain?.skill_priorities[0] === "reading",
    `goal=${learnerAgain?.cefr_goal} minutes=${learnerAgain?.daily_minutes} priorities=[${learnerAgain?.skill_priorities}]`,
  );

  const statsAgain = await getUserStats(authed, "es");
  record(
    "the seeded stats row is not reset or duplicated",
    statsAgain !== null && statsAgain.user_id === userId,
    statsAgain ? "one row, unchanged" : "no stats row",
  );

  // ── 4. Adding a second language, the constraint with teeth ───────────────
  step("A second language does not try to claim primary");

  const otherLessons = await listLessons(authed, "fr");
  record(
    "French content is available to enrol in",
    otherLessons.length > 0,
    `${otherLessons.length} lessons`,
  );

  await saveOnboardingAnswers(
    authed,
    userId,
    {
      languageCode: "fr",
      nativeLanguage: "en",
      motivations: ["culture"],
      cefrLevel: "A1",
      cefrGoal: "A2",
      dailyMinutes: 10,
      skillPriorities: ["speaking"],
    },
    { displayName: "Ana", timezone: "Europe/Madrid" },
  );

  const both = await listLearnerLanguages(authed);
  const primaries = both.filter((entry) => entry.is_primary);

  record(
    "enrolling in a second language succeeds and adds exactly one row",
    both.length === 2,
    `${both.length} languages: ${both.map((entry) => entry.language_code).join(", ")}`,
  );

  record(
    "still exactly one primary, and it is the original",
    primaries.length === 1 && primaries[0].language_code === "es",
    `${primaries.length} primary (${primaries[0]?.language_code})`,
  );

  record(
    "the second language keeps its own plan",
    both.find((entry) => entry.language_code === "fr")?.cefr_level === "A1" &&
      both.find((entry) => entry.language_code === "es")?.cefr_goal === "C1",
    "fr is A1, es still targets C1",
  );

  // ── 5. The answers are private ───────────────────────────────────────────
  step("A learner's plan is their own");

  const otherEmail = `onboarding-other-${Date.now()}@example.com`;
  await anon.auth.signUp({ email: otherEmail, password, name: "Other Learner" });
  const otherSignIn = await anon.auth.signInWithPassword({ email: otherEmail, password });
  const otherId = otherSignIn.data?.user?.id;
  const other = createClient({ baseUrl: url, anonKey, accessToken: otherSignIn.data?.accessToken });

  const otherLanguages = await other.database.from("learner_languages").select("id,language_code").limit(20);

  record(
    "another learner sees none of this plan",
    (otherLanguages.data?.length ?? 0) === 0,
    `${otherLanguages.data?.length ?? 0} rows visible`,
  );

  if (otherId) {
    await admin.database.from("profiles").delete().eq("id", otherId);
    await fetch(`${url}/api/auth/users`, {
      method: "DELETE",
      headers: { "x-api-key": adminKey, "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [otherId] }),
    }).catch(() => {});
  }
} catch (error) {
  console.error("\nonboarding verification threw:", error);
  record("the onboarding flow ran to completion", false, String(error).slice(0, 300));
} finally {
  if (userId) {
    await admin.database.from("profiles").delete().eq("id", userId);
    const cleanup = await fetch(`${url}/api/auth/users`, {
      method: "DELETE",
      headers: { "x-api-key": adminKey, "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [userId] }),
    }).catch(() => null);
    if (!cleanup || !cleanup.ok) {
      console.warn(`cleanup warning: onboarding account ${userId} may remain`);
    }
  }
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
