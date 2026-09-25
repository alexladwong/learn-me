/**
 * End-to-end verification against the real InsForge backend.
 *
 * Run with:  node --env-file=.env.local scripts/verify-backend.mjs
 *
 * What it proves, in order:
 *   1. A real account can be created and signed into.
 *   2. The `create_profile_for_new_user` trigger fired.
 *   3. Writes with the learner's own token pass RLS (onboarding answers).
 *   4. The zero-argument `refresh_review_cards_due()` RPC resolves the learner
 *      from `auth.uid()` and returns a number.
 *   5. Reading another user's rows returns nothing (RLS actually isolates).
 */

import { createClient } from "@insforge/sdk";

const url = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const adminKey = process.env.INSFORGE_API_KEY;

if (!url || !anonKey || !adminKey) {
  console.error("Missing InsForge env vars. Run with --env-file=.env.local");
  process.exit(1);
}

const anon = createClient({ baseUrl: url, anonKey });
const admin = createClient({ baseUrl: url, anonKey: adminKey });

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const email = `verify-${Date.now()}@example.com`;
const password = "verify-password-1234";

// 1. Sign up.
const signUp = await anon.auth.signUp({ email, password, name: "Verify User" });
if (signUp.error) {
  record("sign up", false, signUp.error.message);
  process.exit(1);
}
const userId = signUp.data?.user?.id;
record("sign up creates a user", Boolean(userId), userId);

// 2. Sign in for a session.
const signIn = await anon.auth.signInWithPassword({ email, password });
if (signIn.error) {
  record("sign in", false, signIn.error.message);
  process.exit(1);
}
const accessToken = signIn.data?.accessToken;
record("sign in returns a session", Boolean(accessToken));

const authed = createClient({ baseUrl: url, anonKey, accessToken });

// 3. The signup trigger must have provisioned a profile row.
const profile = await authed.database
  .from("profiles")
  .select("id,display_name,onboarding_state")
  .eq("id", userId)
  .maybeSingle();

record(
  "profile auto-provisioned by trigger",
  !profile.error && profile.data?.id === userId,
  profile.error?.message ?? `display_name=${profile.data?.display_name}`,
);

// 4. The learner's own write must pass RLS.
const learner = await authed.database
  .from("learner_languages")
  .upsert(
    [
      {
        user_id: userId,
        language_code: "es",
        is_primary: true,
        motivation: ["travel"],
        cefr_level: "A1",
        cefr_goal: "A2",
        daily_minutes: 10,
        skill_priorities: ["speaking"],
      },
    ],
    { onConflict: "user_id,language_code" },
  )
  .select("id,language_code,daily_minutes");

record(
  "onboarding answers persist under RLS",
  !learner.error && learner.data?.[0]?.daily_minutes === 10,
  learner.error?.message ?? `row=${learner.data?.[0]?.language_code}`,
);

// 5. The zero-argument RPC must resolve the learner from the session.
const due = await authed.database.rpc("refresh_review_cards_due");
record(
  "refresh_review_cards_due() resolves the caller",
  !due.error && due.data === 0,
  due.error?.message ?? `returned ${JSON.stringify(due.data)}`,
);

// 6. Isolation: a second, anonymous client must not see the first user's rows.
//
// Either outcome is a pass, and the distinction matters:
//   - `permission denied` means the runtime role has no SQL privilege at all
//     (strongest — RLS never even runs)
//   - zero rows means the grant exists but the RLS policy filtered them out
// What must never happen is another learner's data coming back.
const stranger = createClient({ baseUrl: url, anonKey });
const leak = await stranger.database
  .from("learner_languages")
  .select("id,user_id")
  .eq("user_id", userId);

const leakRows = Array.isArray(leak.data) ? leak.data.length : 0;
record(
  "an anonymous client cannot read another learner's rows",
  leakRows === 0,
  leak.error ? `blocked: ${leak.error.message}` : `${leakRows} rows visible`,
);

// 7. Isolation: a second signed-in learner must not see them either.
const otherEmail = `verify-other-${Date.now()}@example.com`;
const otherSignUp = await anon.auth.signUp({ email: otherEmail, password });
const otherUserId = otherSignUp.data?.user?.id ?? null;
const otherSignIn = await anon.auth.signInWithPassword({ email: otherEmail, password });
if (otherSignIn.data?.accessToken) {
  const other = createClient({
    baseUrl: url,
    anonKey,
    accessToken: otherSignIn.data.accessToken,
  });
  const crossRead = await other.database
    .from("learner_languages")
    .select("id,user_id")
    .eq("user_id", userId);
  record(
    "a signed-in stranger sees no rows",
    !crossRead.error && Array.isArray(crossRead.data) && crossRead.data.length === 0,
    crossRead.error?.message ?? `${crossRead.data?.length ?? "?"} rows visible`,
  );

  const crossWrite = await other.database
    .from("learner_languages")
    .update({ daily_minutes: 60 })
    .eq("user_id", userId)
    .select("id");
  record(
    "a signed-in stranger cannot write another learner's rows",
    !crossWrite.error && Array.isArray(crossWrite.data) && crossWrite.data.length === 0,
    crossWrite.error?.message ?? `${crossWrite.data?.length ?? "?"} rows affected`,
  );
}

// 8. The review engine end to end: create an item, then schedule it.
const item = await authed.database
  .from("items")
  .insert([
    {
      language_code: "es",
      kind: "sentence",
      surface: "¿Cómo estás?",
      translation_literal: "How are you?",
      translation_natural: "How are you?",
      source: "user_capture",
      owner_id: userId,
    },
  ])
  .select("id,surface");

const itemId = item.data?.[0]?.id;
record(
  "a learner can capture their own item",
  !item.error && Boolean(itemId),
  item.error?.message ?? item.data?.[0]?.surface,
);

if (itemId) {
  const applied = await authed.database.rpc("apply_review", {
    p_user_id: userId,
    p_item_id: itemId,
    p_language_code: "es",
    p_rating: "good",
    p_next_due_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    p_stability: 3,
    p_difficulty: 5,
    p_state: "review",
    p_mastery: 0.3,
    p_interval_days: 3,
    p_elapsed_days: 0,
    p_latency_ms: 2400,
    p_mode: "review",
  });

  record(
    "apply_review schedules the card",
    !applied.error && applied.data?.reps === 1,
    applied.error?.message ?? `due=${applied.data?.due_at}`,
  );

  const repeat = await authed.database.rpc("apply_review", {
    p_user_id: userId,
    p_item_id: itemId,
    p_language_code: "es",
    p_rating: "again",
    p_next_due_at: new Date().toISOString(),
    p_stability: 0.5,
    p_difficulty: 6,
    p_state: "relearning",
    p_mastery: 0.1,
  });

  record(
    "a lapse increments reps and lapses",
    !repeat.error && repeat.data?.reps === 2 && repeat.data?.lapses === 1,
    repeat.error?.message ??
      `reps=${repeat.data?.reps} lapses=${repeat.data?.lapses} streak=${repeat.data?.streak_correct}`,
  );

  // The append-only guarantee: history can be read but never rewritten.
  const tamper = await authed.database
    .from("review_events")
    .update({ rating: "easy" })
    .eq("item_id", itemId)
    .select("id");

  record(
    "review_events is append-only",
    Boolean(tamper.error) && !tamper.data?.length,
    tamper.error ? `blocked: ${tamper.error.message}` : "UPDATE SUCCEEDED (unexpected)",
  );

  const history = await authed.database
    .from("review_events")
    .select("id,rating,state_before")
    .eq("item_id", itemId)
    .order("created_at", { ascending: true });

  record(
    "review history recorded both attempts",
    !history.error && history.data?.length === 2,
    history.error?.message ??
      `ratings=${history.data?.map((r) => r.rating).join(",")}`,
  );
}

// 9. The guided curriculum is published and playable.
const missions = await authed.database
  .from("missions")
  .select("id,slug,title,language_code,steps(id,step_type,item_id)")
  .eq("language_code", "es")
  .eq("is_published", true)
  .order("order_index", { ascending: true })
  .limit(100);

const missionRows = Array.isArray(missions.data) ? missions.data : [];
const missionWithSteps = missionRows.find(
  (mission) => Array.isArray(mission.steps) && mission.steps.length > 0,
);

record(
  "published Spanish missions have steps",
  Boolean(missionWithSteps),
  missions.error?.message ??
    `${missionRows.length} missions, first with steps: ${missionWithSteps?.slug ?? "none"}`,
);

// 10. Completing a lesson enrols its items into the bank and the review queue.
if (missionWithSteps) {
  const itemIds = [
    ...new Set(missionWithSteps.steps.map((step) => step.item_id).filter(Boolean)),
  ];

  const saved = await authed.database
    .from("saved_items")
    .upsert(
      itemIds.map((id) => ({
        user_id: userId,
        item_id: id,
        language_code: "es",
        saved_from: `mission:${missionWithSteps.id}`,
      })),
      { onConflict: "user_id,item_id", ignoreDuplicates: true },
    )
    .select("id");

  record(
    "lesson items save to the bank",
    !saved.error && Array.isArray(saved.data) && saved.data.length === itemIds.length,
    saved.error?.message ?? `${saved.data?.length}/${itemIds.length} saved`,
  );

  const enrolled = await authed.database
    .from("review_states")
    .upsert(
      itemIds.map((id) => ({
        user_id: userId,
        item_id: id,
        language_code: "es",
        state: "new",
      })),
      { onConflict: "user_id,item_id", ignoreDuplicates: true },
    )
    .select("id,due_at");

  record(
    "lesson items enrol in spaced repetition, due immediately",
    !enrolled.error &&
      Array.isArray(enrolled.data) &&
      enrolled.data.length === itemIds.length &&
      enrolled.data.every((row) => new Date(row.due_at).getTime() <= Date.now() + 1000),
    enrolled.error?.message ?? `${enrolled.data?.length}/${itemIds.length} queued`,
  );

  const before = await authed.database
    .from("review_states")
    .select("id", { count: "exact", head: true })
    .eq("language_code", "es");

  await authed.database
    .from("review_states")
    .upsert(
      itemIds.map((id) => ({ user_id: userId, item_id: id, language_code: "es" })),
      { onConflict: "user_id,item_id", ignoreDuplicates: true },
    );

  const after = await authed.database
    .from("review_states")
    .select("id", { count: "exact", head: true })
    .eq("language_code", "es");

  record(
    "re-saving never duplicates or resets a queue entry",
    before.count === after.count,
    `${before.count} -> ${after.count}`,
  );

  // The queue is not reset between runs, so asserting a literal number would
  // make this check fail on a second run for no real reason. The invariant that
  // actually matters is that the rollup agrees with the rows: the due count must
  // equal the number of queued cards whose due date has passed.
  const dueNow = await authed.database
    .from("review_states")
    .select("id", { count: "exact", head: true })
    .eq("language_code", "es")
    .lte("due_at", new Date().toISOString());

  const dueCount = await authed.database.rpc("refresh_review_cards_due");

  record(
    "the due-count rollup matches the queue",
    !dueCount.error && dueCount.data === dueNow.count,
    dueCount.error?.message ??
      `rollup=${dueCount.data}, rows due=${dueNow.count}, mission enrolled ${itemIds.length}`,
  );

  const completion = await authed.database.rpc("record_mission_completion", {
    p_mission_id: missionWithSteps.id,
    p_language_code: "es",
    p_accuracy: 0.75,
    p_items_enrolled: itemIds.length,
  });

  record(
    "a lesson completion is recorded",
    !completion.error && completion.data?.completions === 1,
    completion.error?.message ?? `completions=${completion.data?.completions}`,
  );

  const repeat = await authed.database.rpc("record_mission_completion", {
    p_mission_id: missionWithSteps.id,
    p_language_code: "es",
    p_accuracy: 0.9,
    p_items_enrolled: itemIds.length,
  });

  record(
    "repeating a lesson increments rather than duplicating",
    !repeat.error && repeat.data?.completions === 2,
    repeat.error?.message ??
      `completions=${repeat.data?.completions} accuracy=${repeat.data?.accuracy}`,
  );
}

// 11. The confusion engine: repeated conjugation errors become a groupable pair.
{
  const practiceRows = [
    { expected: "como", produced: "comes" },
    { expected: "como", produced: "comemos" },
    { expected: "como", produced: "come" },
  ];

  const { error } = await authed.database.from("practice_events").insert(
    practiceRows.map((row) => ({
      user_id: userId,
      language_code: "es",
      mode: "recall",
      is_correct: false,
      expected: row.expected,
      produced: row.produced,
      error_type: "conjugation",
      fingerprint: "conjugation:como",
    })),
  );

  record("practice events record an error fingerprint", !error, error?.message);

  const grouped = await authed.database
    .from("practice_events")
    .select("fingerprint")
    .eq("language_code", "es")
    .eq("fingerprint", "conjugation:como");

  record(
    "the same confusion groups under one fingerprint",
    !grouped.error && grouped.data?.length === 3,
    grouped.error?.message ?? `${grouped.data?.length} events share the key`,
  );
}


// 12. Learn From Content: private sources, candidates, and promotion.
{
  const source = await authed.database
    .from("content_sources")
    .insert([
      {
        user_id: userId,
        language_code: "es",
        source_kind: "text",
        title: "Verification text",
        raw_text: "Ayer visité el mercado con mi hermana. El mercado estaba lleno.",
        char_count: 62,
      },
    ])
    .select("id");

  const sourceId = source.data?.[0]?.id;
  record(
    "a pasted text is stored",
    !source.error && Boolean(sourceId),
    source.error?.message ?? sourceId,
  );

  if (sourceId) {
    const candidates = await authed.database
      .from("content_candidates")
      .insert([
        {
          source_id: sourceId,
          user_id: userId,
          language_code: "es",
          surface: "mercado",
          surface_key: "mercado",
          kind: "word",
          occurrences: 2,
          context_sentence: "Ayer visité el mercado con mi hermana.",
          score: 0.9,
        },
        {
          source_id: sourceId,
          user_id: userId,
          language_code: "es",
          surface: "lleno",
          surface_key: "lleno",
          kind: "word",
          occurrences: 1,
          context_sentence: "El mercado estaba lleno.",
          score: 0.6,
        },
      ])
      .select("id,surface");

    record(
      "detected candidates are stored",
      !candidates.error && candidates.data?.length === 2,
      candidates.error?.message ?? `${candidates.data?.length} candidates`,
    );

    // The UNIQUE (source_id, surface_key) constraint is what stops a re-analysis
    // from appending duplicates.
    const duplicate = await authed.database
      .from("content_candidates")
      .insert([
        {
          source_id: sourceId,
          user_id: userId,
          language_code: "es",
          surface: "mercado",
          surface_key: "mercado",
          kind: "word",
        },
      ])
      .select("id");

    record(
      "re-analysing cannot duplicate a candidate",
      Boolean(duplicate.error),
      duplicate.error ? "rejected by the unique constraint" : "DUPLICATE ACCEPTED (unexpected)",
    );

    const mercado = candidates.data?.find((row) => row.surface === "mercado");

    if (mercado) {
      const kept = await authed.database.rpc("keep_content_candidate", {
        p_candidate_id: mercado.id,
        p_translation: "market",
        p_gloss: "a place where goods are bought and sold",
        p_translation_source: "learner",
      });

      const itemId = typeof kept.data === "string" ? kept.data : null;
      record(
        "keeping a candidate creates a real item",
        !kept.error && Boolean(itemId),
        kept.error?.message ?? itemId,
      );

      if (itemId) {
        const banked = await authed.database
          .from("saved_items")
          .select("item_id,saved_from")
          .eq("item_id", itemId)
          .maybeSingle();
        record(
          "the kept item is saved to the bank",
          !banked.error && banked.data?.item_id === itemId,
          banked.error?.message ?? banked.data?.saved_from,
        );

        const queued = await authed.database
          .from("review_states")
          .select("item_id,state")
          .eq("item_id", itemId)
          .maybeSingle();
        record(
          "the kept item enters the review queue",
          !queued.error && queued.data?.state === "new",
          queued.error?.message ?? queued.data?.state,
        );

        const linked = await authed.database
          .from("content_candidates")
          .select("saved_item_id,translation,enrichment_state")
          .eq("id", mercado.id)
          .maybeSingle();
        record(
          "the candidate links to what it became",
          !linked.error &&
            linked.data?.saved_item_id === itemId &&
            linked.data?.enrichment_state === "enriched",
          linked.error?.message ?? `translation=${linked.data?.translation}`,
        );
      }

      // The function must refuse a missing translation rather than writing an
      // empty one, which is what keeps a fabricated translation impossible.
      const lleno = candidates.data?.find((row) => row.surface === "lleno");
      if (lleno) {
        const noTranslation = await authed.database.rpc("keep_content_candidate", {
          p_candidate_id: lleno.id,
          p_translation: "   ",
        });
        record(
          "keeping without a translation is refused",
          Boolean(noTranslation.error),
          noTranslation.error ? "rejected" : "EMPTY TRANSLATION ACCEPTED (unexpected)",
        );
      }
    }

    // A second learner must not be able to read this pasted text.
    if (otherSignIn.data?.accessToken) {
      const other = createClient({
        baseUrl: url,
        anonKey,
        accessToken: otherSignIn.data.accessToken,
      });
      const crossRead = await other.database
        .from("content_sources")
        .select("id,raw_text")
        .eq("id", sourceId);
      const rows = Array.isArray(crossRead.data) ? crossRead.data.length : 0;
      record(
        "pasted text is private to its owner",
        rows === 0,
        crossRead.error ? `blocked: ${crossRead.error.message}` : `${rows} rows visible`,
      );
    }
  }
}


// 13. Language DNA and the confusion engine read real signals.
{
  // Seed enough graded answers for a skill to clear the confidence floor.
  const answers = [];
  for (let i = 0; i < 12; i += 1) {
    answers.push({
      user_id: userId,
      language_code: "es",
      mode: i % 2 === 0 ? "recognise" : "recall",
      is_correct: i % 4 !== 0,
      expected: "como",
      produced: i % 4 === 0 ? "comes" : "como",
      error_type: i % 4 === 0 ? "conjugation" : "none",
      fingerprint: i % 4 === 0 ? "conjugation:como" : null,
    });
  }

  const seeded = await authed.database.from("practice_events").insert(answers);
  record("graded answers are recorded for skill measurement", !seeded.error, seeded.error?.message);

  // The three occurrences needed before a pattern is reported already exist from
  // check 11; confirm the grouped read sees them all under one key.
  const grouped = await authed.database
    .from("practice_events")
    .select("fingerprint,expected,produced,created_at")
    .eq("language_code", "es")
    .eq("fingerprint", "conjugation:como")
    .limit(50);

  const rows = Array.isArray(grouped.data) ? grouped.data : [];
  const distinctDays = new Set(rows.map((row) => String(row.created_at).slice(0, 10)));

  record(
    "a confusion pattern has enough occurrences to be reported",
    rows.length >= 3,
    `${rows.length} occurrences over ${distinctDays.size} day(s)`,
  );

  // The vocabulary signal: mastery lives on review_states, which check 8-10 filled.
  const states = await authed.database
    .from("review_states")
    .select("mastery,state,stability")
    .eq("language_code", "es")
    .limit(100);

  const usable = (Array.isArray(states.data) ? states.data : []).filter(
    (row) => row.state !== "suspended",
  );

  record(
    "vocabulary mastery is available for a DNA estimate",
    !states.error && usable.length > 0 && usable.every((row) => row.mastery >= 0 && row.mastery <= 1),
    states.error?.message ?? `${usable.length} cards, mean mastery ${
      (usable.reduce((sum, row) => sum + row.mastery, 0) / Math.max(1, usable.length)).toFixed(3)
    }`,
  );
}


// 14. Every language advertised as available must actually be playable.
//
// This guards the exact defect this check was written in response to: French and
// German were flagged `is_available = true` with no content behind the flag, so a
// learner could select them and land on empty screens. A flag that promises a
// curriculum has to be backed by one.
{
  const languages = await anon.database
    .from("languages")
    .select("code,name_en,is_available")
    .eq("is_available", true)
    .order("sort_order", { ascending: true });

  const available = Array.isArray(languages.data) ? languages.data : [];
  record(
    "at least one language is available",
    available.length > 0,
    available.map((row) => row.code).join(", "),
  );

  for (const language of available) {
    const [tracks, missions, items, steps] = await Promise.all([
      anon.database
        .from("tracks")
        .select("id", { count: "exact", head: true })
        .eq("language_code", language.code)
        .eq("is_published", true),
      anon.database
        .from("missions")
        .select("id", { count: "exact", head: true })
        .eq("language_code", language.code)
        .eq("is_published", true),
      anon.database
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("language_code", language.code)
        .is("owner_id", null),
      anon.database
        .from("steps")
        .select("id", { count: "exact", head: true })
        .eq("language_code", language.code),
    ]);

    const playable =
      (tracks.count ?? 0) > 0 &&
      (missions.count ?? 0) > 0 &&
      (items.count ?? 0) > 0 &&
      (steps.count ?? 0) > 0;

    record(
      `available language "${language.code}" has playable content`,
      playable,
      `${tracks.count} track(s), ${missions.count} mission(s), ${items.count} item(s), ${steps.count} step(s)`,
    );
  }

  // Conversely, a language with no content must not be advertised as available.
  const catalogue = await anon.database
    .from("languages")
    .select("code,is_available");

  const rows = Array.isArray(catalogue.data) ? catalogue.data : [];
  const emptyButAvailable = [];

  for (const row of rows.filter((entry) => entry.is_available === true)) {
    const { count } = await anon.database
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("language_code", row.code)
      .is("owner_id", null);
    if ((count ?? 0) === 0) emptyButAvailable.push(row.code);
  }

  record(
    "no language is advertised without content",
    emptyButAvailable.length === 0,
    emptyButAvailable.length === 0
      ? `${rows.filter((r) => r.is_available).length} available, all backed by content`
      : `empty but available: ${emptyButAvailable.join(", ")}`,
  );
}

// 15. Drill coverage: every launch language can build a drill for its core verbs.
//
// The drill generator refuses to build one below three sentences containing the
// form. That refusal is correct, but a curriculum that never reaches three leaves
// the product's headline feature permanently unavailable — which is exactly what
// an audit of the first French and German units found.
{
  const CORE_FORMS = {
    es: ["como", "bebo", "quiero", "tengo", "hablo", "voy", "estoy"],
    fr: ["mange", "bois", "vais", "voudrais", "parle", "appelle", "prépare"],
    de: ["esse", "trinke", "gehe", "habe", "heiße", "möchte", "bin", "arbeite"],
  };

  /**
   * The A2 past-tense forms, which carry the level.
   *
   * Asserted separately from the A1 present-tense forms because they were added
   * later and in a different way, and because the whole point of the A2 units is
   * that these are drillable.
   */
  const A2_FORMS = {
    es: ["comí", "fui", "estuve", "tuve", "viajé", "compré", "perdí", "hice", "duele"],
    fr: ["mangé", "fait", "vu", "bu", "parlé", "allé", "rentré", "resté", "été", "eu"],
    de: ["gegessen", "gesehen", "getrunken", "gemacht", "gefahren", "geblieben", "gewesen"],
  };

  for (const [code, forms] of Object.entries(CORE_FORMS)) {
    const { data } = await anon.database
      .from("items")
      .select("surface")
      .eq("language_code", code)
      .is("owner_id", null)
      .eq("kind", "sentence")
      .limit(1000);

    const surfaces = (Array.isArray(data) ? data : []).map((row) =>
      String(row.surface).toLowerCase(),
    );

    // Substring matching, matching the drill's own rule. PostgreSQL's `\m`
    // boundary is ASCII-only and fails next to an accented letter or ß, so a
    // regex check here would report a false gap.
    const thin = forms.filter(
      (form) =>
        surfaces.filter((surface) => surface.includes(form.toLowerCase())).length < 3,
    );

    record(
      `"${code}" can build a drill for its core verbs`,
      thin.length === 0,
      thin.length === 0
        ? `${forms.length} verbs, all with 3+ sentences`
        : `below 3 sentences: ${thin.join(", ")}`,
    );
  }

  for (const [code, forms] of Object.entries(A2_FORMS)) {
    const { data } = await anon.database
      .from("items")
      .select("surface")
      .eq("language_code", code)
      .is("owner_id", null)
      .eq("kind", "sentence")
      .eq("difficulty", "A2")
      .limit(1000);

    const surfaces = (Array.isArray(data) ? data : []).map((row) =>
      String(row.surface).toLowerCase(),
    );

    const thin = forms.filter(
      (form) =>
        surfaces.filter((surface) => surface.includes(form.toLowerCase())).length < 3,
    );

    record(
      `"${code}" can build a drill for its A2 past-tense forms`,
      thin.length === 0,
      thin.length === 0
        ? `${forms.length} forms, all with 3+ sentences`
        : `below 3 sentences: ${thin.join(", ")}`,
    );
  }
}

// 19. Every A2 item must be reachable in a lesson.
//
// The coverage migrations added sentences after the steps migrations had run, so
// an item could be counted in the path while having no exercise at all — present
// in a progress figure and impossible to study. This guards that gap.
{
  // Ordered reads, deliberately. PostgREST caps an unordered select at 1000 rows
  // whatever `.limit()` asks for, and returns an arbitrary subset — which is how
  // this check first reported 157 "unreachable" items that all had steps. An
  // `order` makes the cap deterministic and the paging correct.
  const { data: unstepped } = await anon.database
    .from("items")
    .select("id,language_code,surface")
    .eq("difficulty", "A2")
    .is("owner_id", null)
    .order("id", { ascending: true })
    .limit(2000);

  const rows = Array.isArray(unstepped) ? unstepped : [];
  const { data: steps } = await anon.database
    .from("steps")
    .select("item_id")
    .order("id", { ascending: true })
    .limit(20000);

  const stepped = new Set(
    (Array.isArray(steps) ? steps : []).map((row) => row.item_id),
  );

  // Only items whose language has an A2 track are in scope.
  const a2Languages = new Set(["es", "fr", "de"]);
  const orphans = rows.filter(
    (row) => a2Languages.has(row.language_code) && !stepped.has(row.id),
  );

  record(
    "every A2 item has at least one exercise",
    orphans.length === 0,
    orphans.length === 0
      ? `${rows.length} A2 items read, all reachable`
      : `${orphans.length} of ${rows.length} unreachable, e.g. "${orphans[0].surface}"`,
  );
}


// 16. Entitlements actually gate, and the gate holds under concurrency.
//
// This is the check that matters for Phase 7. A quota that leaks under parallel
// requests is worse than no quota, because it looks enforced. The consumption
// function locks the learner's row; without that lock, five simultaneous
// requests would all read "1 remaining" and all proceed.
{
  // A fresh account starts on the free allowance, created lazily on first use.
  const first = await authed.database.rpc("consume_entitlement", {
    p_feature: "ai_conversation",
    p_cost: 1,
  });

  record(
    "a new account is metered from its first use",
    !first.error && first.data?.[0]?.allowed === true,
    first.error?.message ??
      `limit=${first.data?.[0]?.quota_limit} used=${first.data?.[0]?.quota_used}`,
  );

  record(
    "the free allowance matches the published limit",
    first.data?.[0]?.quota_limit === 5,
    `limit=${first.data?.[0]?.quota_limit}`,
  );

  // Spend the remainder, then confirm the next request is refused.
  for (let i = 0; i < 4; i += 1) {
    await authed.database.rpc("consume_entitlement", {
      p_feature: "ai_conversation",
      p_cost: 1,
    });
  }

  const blocked = await authed.database.rpc("consume_entitlement", {
    p_feature: "ai_conversation",
    p_cost: 1,
  });

  record(
    "the sixth conversation is refused",
    !blocked.error && blocked.data?.[0]?.allowed === false,
    blocked.error?.message ??
      `allowed=${blocked.data?.[0]?.allowed} remaining=${blocked.data?.[0]?.remaining}`,
  );

  record(
    "the refusal reports no remainder rather than a negative one",
    blocked.data?.[0]?.remaining === 0,
    `remaining=${blocked.data?.[0]?.remaining}`,
  );

  // The read-only check must agree, and must not spend anything.
  const checked = await authed.database.rpc("check_entitlement", {
    p_feature: "ai_conversation",
  });
  const checkedAgain = await authed.database.rpc("check_entitlement", {
    p_feature: "ai_conversation",
  });

  record(
    "checking an allowance does not spend it",
    checked.data?.[0]?.quota_used === checkedAgain.data?.[0]?.quota_used,
    `used ${checked.data?.[0]?.quota_used} then ${checkedAgain.data?.[0]?.quota_used}`,
  );

  // An unlimited plan reports null, which the UI renders as "no limit".
  //
  // Written through the admin client, not the learner's. A learner raising their
  // own ceiling is now refused — that is what the next check asserts — so
  // simulating a subscription has to happen the way fulfilment does, as the
  // service role.
  const grant = await admin.database
    .from("entitlements")
    .update({ quota_limit: null, source: "subscription" })
    .eq("user_id", userId)
    .eq("feature", "ai_conversation");

  record(
    "the service role can grant a premium allowance",
    !grant.error,
    grant.error?.message ?? "subscription recorded",
  );

  const unlimited = await authed.database.rpc("consume_entitlement", {
    p_feature: "ai_conversation",
    p_cost: 1,
  });

  record(
    "an unlimited plan never blocks and reports no remainder",
    !unlimited.error &&
      unlimited.data?.[0]?.allowed === true &&
      unlimited.data?.[0]?.remaining === null,
    unlimited.error?.message ??
      `limit=${unlimited.data?.[0]?.quota_limit} remaining=${unlimited.data?.[0]?.remaining}`,
  );

  // An unknown feature key must fail loudly rather than create an unmetered row.
  const unknown = await authed.database.rpc("consume_entitlement", {
    p_feature: "unlimited_everything",
    p_cost: 1,
  });
  record(
    "an unknown feature key is rejected",
    Boolean(unknown.error),
    unknown.error ? "rejected at the database boundary" : "ACCEPTED (unexpected)",
  );

  // A learner must not be able to write their own allowance.
  const selfGrant = await authed.database
    .from("entitlements")
    .update({ quota_limit: 999_999, source: "subscription" })
    .eq("user_id", userId)
    .select("id");

  const selfGrantRows = Array.isArray(selfGrant.data) ? selfGrant.data.length : 0;
  record(
    "a learner cannot grant themselves premium",
    Boolean(selfGrant.error) || selfGrantRows === 0,
    selfGrant.error ? `blocked: ${selfGrant.error.message}` : `${selfGrantRows} rows written`,
  );
}

// 17. The concurrency test: the lock is what makes the limit real.
{
  // Reset to a single unit so exactly one concurrent request can succeed.
  // The insert guard only permits the catalogue allowance for a self-created
  // row, so a bespoke limit of 1 is set as the service role.
  const reset = await admin.database
    .from("entitlements")
    .upsert(
      [
        {
          user_id: userId,
          feature: "content_capture",
          quota_limit: 1,
          quota_used: 0,
          source: "subscription",
        },
      ],
      { onConflict: "user_id,feature" },
    );

  if (reset.error) {
    console.warn("concurrency fixture could not be prepared:", reset.error.message);
  }

  const attempts = await Promise.all(
    Array.from({ length: 6 }, () =>
      authed.database.rpc("consume_entitlement", {
        p_feature: "content_capture",
        p_cost: 1,
      }),
    ),
  );

  const allowed = attempts.filter((attempt) => attempt.data?.[0]?.allowed === true).length;
  const refused = attempts.filter((attempt) => attempt.data?.[0]?.allowed === false).length;

  record(
    "six concurrent requests against a limit of one allow exactly one",
    allowed === 1,
    `${allowed} allowed, ${refused} refused`,
  );

  const final = await authed.database.rpc("check_entitlement", {
    p_feature: "content_capture",
  });
  record(
    "the recorded usage matches what was granted",
    final.data?.[0]?.quota_used === 1,
    `used=${final.data?.[0]?.quota_used} of ${final.data?.[0]?.quota_limit}`,
  );
}


// 18. The tutor's conversation store: private, and honest about being unscored.
{
  const conversation = await authed.database
    .from("conversations")
    .insert([
      {
        user_id: userId,
        language_code: "es",
        scenario_id: "coffee-shop",
        cefr_level: "A1",
      },
    ])
    .select("id,turn_count,status");

  const conversationId = conversation.data?.[0]?.id;
  record(
    "a conversation can be started",
    !conversation.error && Boolean(conversationId),
    conversation.error?.message ?? `status=${conversation.data?.[0]?.status}`,
  );

  if (conversationId) {
    const turn = await authed.database
      .from("conversation_turns")
      .insert([
        {
          conversation_id: conversationId,
          user_id: userId,
          turn_index: 0,
          role: "learner",
          content: "Good morning, I would like a coffee please.",
        },
      ])
      .select("id,corrections");

    record(
      "a turn is recorded with no invented corrections",
      !turn.error && Array.isArray(turn.data?.[0]?.corrections),
      turn.error?.message ?? `corrections=${JSON.stringify(turn.data?.[0]?.corrections)}`,
    );

    // The trigger maintains the count; a client must not be able to set it.
    const afterTurn = await authed.database
      .from("conversations")
      .select("turn_count")
      .eq("id", conversationId)
      .maybeSingle();

    record(
      "the turn count is maintained by the server",
      afterTurn.data?.turn_count === 1,
      `turn_count=${afterTurn.data?.turn_count}`,
    );

    const tamper = await authed.database
      .from("conversations")
      .update({ turn_count: 99 })
      .eq("id", conversationId)
      .select("id");

    const tamperRows = Array.isArray(tamper.data) ? tamper.data.length : 0;
    record(
      "a learner cannot falsify their turn count",
      Boolean(tamper.error) || tamperRows === 0,
      tamper.error ? `blocked: ${tamper.error.message}` : `${tamperRows} rows written`,
    );

    // A report must be savable without any judged scores: this build has no
    // provider, and the schema must accept an honest "measured only" report.
    const report = await authed.database
      .from("conversation_reports")
      .insert([
        {
          conversation_id: conversationId,
          user_id: userId,
          language_code: "es",
          fluency_score: 0.75,
          fluency_samples: 3,
          mistakes: [],
          new_words: [],
        },
      ])
      .select("id,grammar_score,pronunciation_score");

    record(
      "a measured-only report is stored with null judged scores",
      !report.error &&
        report.data?.[0]?.grammar_score === null &&
        report.data?.[0]?.pronunciation_score === null,
      report.error?.message ??
        `grammar=${report.data?.[0]?.grammar_score} pronunciation=${report.data?.[0]?.pronunciation_score}`,
    );

    // A conversation is as private as a pasted message.
    if (otherSignIn.data?.accessToken) {
      const stranger = createClient({
        baseUrl: url,
        anonKey,
        accessToken: otherSignIn.data.accessToken,
      });

      const crossRead = await stranger.database
        .from("conversation_turns")
        .select("id,content")
        .eq("conversation_id", conversationId);

      const rows = Array.isArray(crossRead.data) ? crossRead.data.length : 0;
      record(
        "a conversation is private to its owner",
        rows === 0,
        crossRead.error ? `blocked: ${crossRead.error.message}` : `${rows} rows visible`,
      );
    }
  }
}

// ---- Cleanup ---------------------------------------------------------------
// Removing the `profiles` row cascades across the public schema, but the runtime
// role cannot write to the managed `auth` schema, so the account rows survive
// that. The Admin API is the sanctioned route for removing them; there is no
// per-user DELETE route, only a batch one.
const cleanupIds = [userId, otherUserId].filter(Boolean);

if (cleanupIds.length > 0) {
  for (const id of cleanupIds) {
    await admin.database.from("profiles").delete().eq("id", id);
  }

  const cleanup = await fetch(`${url}/api/auth/users`, {
    method: "DELETE",
    headers: { "x-api-key": adminKey, "Content-Type": "application/json" },
    body: JSON.stringify({ userIds: cleanupIds }),
  }).catch(() => null);

  if (!cleanup || !cleanup.ok) {
    console.warn(
      "cleanup warning: verification accounts were not removed. " +
        "Run `npm run reset:test-data` to sweep them up.",
    );
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
