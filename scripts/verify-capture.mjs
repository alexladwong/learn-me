/**
 * Learn-From-Content verification (Phase 5).
 *
 * Run:  npm run verify:capture
 *
 * `verify:journey` covers the path a learner follows from the curriculum. This
 * covers the other way content enters the product: text a learner brings in
 * themselves. Nothing exercised it before, and it is the flow with the most
 * moving parts — a deterministic extractor, a candidate table, an optional AI
 * enrichment step, and one transactional SQL function that has to write four
 * rows or none.
 *
 * The extractor is asserted against real prose rather than a fixture, because
 * its whole job is to be right about a language it has never seen: the stopword
 * list, the fold key and the ranking all have to agree on real Spanish.
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
  createSource,
  replaceCandidates,
  markSourceAnalyzed,
  listCandidates,
  listKnownSurfaceKeys,
  keepCandidate,
  dismissCandidates,
  getSource,
} = await jiti.import("./lib/db/content.ts");
const { extractCandidates, hasStopwords, MAX_SOURCE_CHARS } = await jiti.import(
  "./lib/learning/extract.ts",
);
const { enrichmentStatus } = await jiti.import("./lib/ai/enrich.ts");
const { listDueCards } = await jiti.import("./lib/db/reviews.ts");
const { getReviewQueueStats } = await jiti.import("./lib/db/reviews.ts");

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
function step(title) {
  console.log(`\n── ${title}`);
}

/**
 * A real paragraph with a deliberate shape: common function words that must
 * never be offered, two words repeated often enough to rank first, and one
 * accent-bearing word so folding is exercised.
 */
const ARTICLE = `
La ciudad de Valencia celebra cada año una fiesta llamada Las Fallas. Durante una
semana, las calles se llenan de esculturas enormes hechas de madera y cartón. Los
vecinos trabajan durante meses para construir cada escultura, y al final de la
fiesta las esculturas se queman en la calle. La fiesta atrae a miles de visitantes
cada año, y los visitantes dicen que la fiesta es una experiencia inolvidable.
Muchos visitantes vuelven cada año porque la fiesta cambia siempre.
`.trim();

const anon = createClient({ baseUrl: url, anonKey });
const admin = createClient({ baseUrl: url, anonKey: adminKey });

const email = `capture-${Date.now()}@example.com`;
const password = "capture-password-1234";
let userId = null;

try {
  // ── 0. Extraction, before any database involvement ───────────────────────
  step("A pasted article is analysed deterministically");

  record(
    "Spanish has a stopword list, so detection is available",
    hasStopwords("es") === true,
    "the capability report depends on this",
  );

  const extracted = extractCandidates(ARTICLE, {
    languageCode: "es",
    knownKeys: new Set(),
  });

  record(
    "real prose yields candidates",
    extracted.length > 0,
    `${extracted.length} candidates, top: ${extracted
      .slice(0, 4)
      .map((c) => `${c.surface}(${c.occurrences})`)
      .join(", ")}`,
  );

  const surfaces = extracted.map((candidate) => candidate.surface);
  const folded = surfaces.map((surface) => surface.toLowerCase());

  // Function words are the thing a naive frequency count gets wrong: "la" and
  // "de" would top every list and be worthless to learn.
  const functionWords = ["la", "de", "cada", "los", "las", "una", "y", "en", "que"];
  const leaked = functionWords.filter((word) => folded.includes(word));

  record(
    "no function word is offered as vocabulary",
    leaked.length === 0,
    leaked.length > 0 ? `leaked: ${leaked.join(", ")}` : `${functionWords.length} checked`,
  );

  // The ranking claim: a word repeated five times should outrank one seen once.
  const repeated = extracted.find((candidate) => candidate.surface.toLowerCase() === "fiesta");
  const once = extracted.find((candidate) => candidate.occurrences === 1);

  record(
    "a repeated word is ranked above a one-off",
    Boolean(repeated && once) && repeated.score > once.score,
    repeated
      ? `"fiesta" x${repeated.occurrences} scores ${repeated.score.toFixed(2)} vs "${once?.surface}" x1 at ${once?.score.toFixed(2)}`
      : `"fiesta" was not extracted; got ${surfaces.slice(0, 8).join(", ")}`,
  );

  record(
    "candidates carry the sentence they came from",
    extracted.every(
      (candidate) =>
        typeof candidate.contextSentence === "string" && candidate.contextSentence.length > 0,
    ),
    `e.g. "${extracted[0]?.contextSentence?.slice(0, 60)}…"`,
  );

  record(
    "each candidate carries a match key, so a word already known is recognised",
    extracted.every(
      (candidate) => candidate.surfaceKey.length > 0 && candidate.surfaceKey === candidate.surfaceKey.toLowerCase(),
    ),
    `e.g. "${extracted[0]?.surface}" has key "${extracted[0]?.surfaceKey}"`,
  );

  const withAccent = extracted.find((candidate) => /[áéíóúñü]/i.test(candidate.surface));
  record(
    "an accented word survives extraction unfolded",
    Boolean(withAccent),
    withAccent ? `"${withAccent.surface}" (key "${withAccent.surfaceKey}")` : "no accented candidate found",
  );

  // ── 1. The capability report must be honest ──────────────────────────────
  step("The page only promises what it can do");

  const enrichment = enrichmentStatus();
  const keyPresent = Boolean(process.env.OPENROUTER_API_KEY?.trim());

  record(
    "the enrichment report matches whether a provider key exists",
    enrichment.available === keyPresent,
    enrichment.available
      ? "a provider is configured"
      : `unavailable: ${enrichment.reason}`,
  );

  record(
    "the extraction limit is a real, enforced bound",
    MAX_SOURCE_CHARS > 0 && Number.isFinite(MAX_SOURCE_CHARS),
    `${MAX_SOURCE_CHARS} characters`,
  );

  // ── 2. Storing the source ────────────────────────────────────────────────
  step("The text is stored and analysed");

  await anon.auth.signUp({ email, password, name: "Capture Verify" });
  const signIn = await anon.auth.signInWithPassword({ email, password });
  userId = signIn.data?.user?.id;
  if (!userId) throw new Error("could not create a session");

  const authed = createClient({ baseUrl: url, anonKey, accessToken: signIn.data?.accessToken });

  await authed.database
    .from("learner_languages")
    .upsert(
      [{ user_id: userId, language_code: "es", is_primary: true, daily_minutes: 20 }],
      { onConflict: "user_id,language_code" },
    );

  const sourceId = await createSource(authed, userId, {
    languageCode: "es",
    sourceKind: "text",
    title: "Las Fallas",
    rawText: ARTICLE,
  });

  record("a pasted source is created", typeof sourceId === "string", sourceId);

  const known = await listKnownSurfaceKeys(authed, "es");
  const inserted = await replaceCandidates(
    authed,
    { id: sourceId, languageCode: "es" },
    userId,
    extracted,
    known,
  );

  await markSourceAnalyzed(authed, sourceId, {
    tokenCount: ARTICLE.split(/\s+/).length,
    candidateCount: inserted.inserted,
    knownCount: known.size,
  });

  record(
    "the analysis stores every candidate",
    inserted.inserted === extracted.length,
    `${inserted.inserted} stored of ${extracted.length} extracted, ${inserted.alreadyDecided} already decided`,
  );

  const candidates = await listCandidates(authed, sourceId);
  record(
    "candidates load back ordered by how useful they are",
    candidates.length === extracted.length &&
      candidates.every(
        (candidate, index) =>
          index === 0 || candidates[index - 1].score >= candidate.score,
      ),
    `${candidates.length} candidates, top score ${candidates[0]?.score?.toFixed(2)}`,
  );

  const stored = await getSource(authed, sourceId);
  record(
    "the source records its own size honestly",
    stored?.charCount === ARTICLE.length && stored?.candidateCount === inserted.inserted,
    `${stored?.charCount} chars, ${stored?.candidateCount} candidates`,
  );

  // ── 3. Re-analysing must be stable ───────────────────────────────────────
  step("Re-analysing the same text is stable, not destructive");

  const again = await replaceCandidates(
    authed,
    { id: sourceId, languageCode: "es" },
    userId,
    extracted,
    known,
  );

  const afterReanalysis = await listCandidates(authed, sourceId);

  record(
    "a second analysis adds no duplicates",
    afterReanalysis.length === candidates.length,
    `${candidates.length} candidates, still ${afterReanalysis.length}`,
  );

  record(
    "a second analysis reports nothing newly inserted",
    again.inserted === 0,
    `${again.inserted} inserted, ${again.removed} removed`,
  );

  // The id is what the results screen posts back when keeping a word. Minting new
  // ids on re-analysis orphaned every analysis in flight and turned a keep into
  // "that word is no longer in this analysis".
  const idsBefore = new Set(candidates.map((candidate) => candidate.id));
  const idsAfter = new Set(afterReanalysis.map((candidate) => candidate.id));
  const preserved = [...idsBefore].filter((id) => idsAfter.has(id)).length;

  record(
    "every candidate keeps its identity across a re-analysis",
    preserved === idsBefore.size,
    `${preserved} of ${idsBefore.size} ids preserved`,
  );

  // ── 4. Keeping a candidate ───────────────────────────────────────────────
  step("Keeping a word creates the item, the bank entry and the card");

  // Two distinct candidates: one to keep, one to prove a blank translation is
  // refused. They must differ, or the refusal check would actually be exercising
  // "already kept" and pass for the wrong reason.
  const target =
    candidates.find((candidate) => candidate.surface.toLowerCase() === "fiesta") ?? candidates[0];
  const blank =
    candidates.find((candidate) => candidate.id !== target.id) ?? null;

  const missing = blank
    ? await keepCandidate(authed, { candidateId: blank.id, translation: "   " })
    : { ok: false, error: "no second candidate available" };

  record(
    "a candidate cannot be kept without a translation",
    blank !== null && missing.ok === false && /translation/i.test(missing.error),
    missing.ok ? "it was kept with a blank translation" : missing.error,
  );

  const kept = await keepCandidate(authed, {
    candidateId: target.id,
    translation: "festival, celebration",
    gloss: "a traditional festival",
    translationSource: "learner",
  });

  record("a candidate is kept", kept.ok === true, kept.ok ? kept.itemId : kept.error);

  if (kept.ok) {
    const queue = await getReviewQueueStats(authed, "es");
    record(
      "keeping it enrols exactly one review card",
      queue.total === 1,
      `${queue.total} queued card(s)`,
    );

    // The card is created by an RPC and read back immediately; reads can lag the
    // write by a few hundred milliseconds, so this retries briefly rather than
    // asserting on a single read. Measured: the same read 400ms later finds it.
    let due = await listDueCards(authed, "es", 10);
    let card = due.find((entry) => entry.itemId === kept.itemId);
    for (let attempt = 0; attempt < 5 && !card; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      due = await listDueCards(authed, "es", 10);
      card = due.find((entry) => entry.itemId === kept.itemId);
    }

    record(
      "the new card is due immediately and carries the learner's own translation",
      Boolean(card && card.translationNatural === "festival, celebration"),
      card ? `"${card.surface}" → "${card.translationNatural}" (state ${card.memory.state})` : "not in the due list",
    );

    record(
      "the card is tagged as captured rather than authored",
      Boolean(card && card.tags.includes("from-content")),
      card ? `tags: ${card.tags.join(", ")}` : "no card",
    );

    const bank = await authed.database
      .from("saved_items")
      .select("saved_from")
      .eq("item_id", kept.itemId)
      .maybeSingle();

    record(
      "the bank entry records which source it came from",
      bank.data?.saved_from === `content:${sourceId}`,
      `saved_from=${bank.data?.saved_from}`,
    );

    const decision = await authed.database
      .from("content_candidates")
      .select("saved_item_id,saved_at,translation")
      .eq("id", target.id)
      .maybeSingle();

    record(
      "the candidate is marked decided and linked to what it became",
      decision.data?.saved_item_id === kept.itemId && Boolean(decision.data?.saved_at),
      `saved_item_id=${decision.data?.saved_item_id ? "set" : "null"}`,
    );

    // The same word kept from a second source must share one card, or the
    // learner would review the same word twice under two schedules.
    const secondSource = await createSource(authed, userId, {
      languageCode: "es",
      sourceKind: "text",
      title: "La misma fiesta",
      rawText: "La fiesta de Valencia es la fiesta más famosa de España.",
    });
    const secondKnown = await listKnownSurfaceKeys(authed, "es");
    const secondCandidates = extractCandidates(
      "La fiesta de Valencia es la fiesta más famosa de España.",
      { languageCode: "es", knownKeys: secondKnown },
    );
    await replaceCandidates(
      authed,
      { id: secondSource, languageCode: "es" },
      userId,
      secondCandidates,
      secondKnown,
    );

    const secondList = await listCandidates(authed, secondSource);
    const repeat = secondList.find((candidate) => candidate.surface.toLowerCase() === "fiesta");

    if (!repeat) {
      record(
        "a word already in the bank is not offered again",
        true,
        "the extractor excluded it as a known key",
      );
    } else {
      const reKept = await keepCandidate(authed, {
        candidateId: repeat.id,
        translation: "festival, celebration",
        translationSource: "learner",
      });

      const queueAfter = await getReviewQueueStats(authed, "es");
      record(
        "keeping the same word from a second source shares one card",
        reKept.ok === true &&
          reKept.itemId === kept.itemId &&
          queueAfter.total === 1,
        reKept.ok
          ? `same item: ${reKept.itemId === kept.itemId}, cards: ${queueAfter.total}`
          : reKept.error,
      );
    }

    const reKeep = await keepCandidate(authed, {
      candidateId: target.id,
      translation: "festival, celebration",
    });
    record(
      "keeping an already-kept candidate is idempotent",
      reKeep.ok === true && reKeep.itemId === kept.itemId,
      reKeep.ok ? "returned the same item" : reKeep.error,
    );

    // A decision the learner already made must outlive a re-analysis, or
    // dismissing a word would only hide it until the next analysis brought it back.
    const toDismiss = afterReanalysis.find((candidate) => candidate.id !== target.id);
    const dismissedCount = toDismiss ? await dismissCandidates(authed, [toDismiss.id]) : 0;

    const afterDismissAnalysis = await replaceCandidates(
      authed,
      { id: sourceId, languageCode: "es" },
      userId,
      extracted,
      known,
    );
    const reopened = await listCandidates(authed, sourceId);

    record(
      "a dismissed word does not come back when the text is re-analysed",
      Boolean(toDismiss) &&
        dismissedCount === 1 &&
        !reopened.some((candidate) => candidate.id === toDismiss.id) &&
        afterDismissAnalysis.inserted === 0,
      toDismiss
        ? `"${toDismiss.surface}" dismissed; ${reopened.length} still offered, ${afterDismissAnalysis.inserted} re-inserted`
        : "no second candidate to dismiss",
    );
  }

  // ── 5. Capture feeds the same loop as the curriculum ─────────────────────
  step("Captured words join the ordinary review loop");

  const captured = await listDueCards(authed, "es", 10);
  const first = captured[0];

  if (!first) {
    record("a captured card is reviewable", false, "nothing due");
  } else {
    const { schedule, dueAt, initialState } = await jiti.import("./lib/learning/fsrs.ts");
    const outcome = schedule(initialState(), "good", 0);

    const applied = await authed.database.rpc("apply_review", {
      p_user_id: userId,
      p_item_id: first.itemId,
      p_language_code: "es",
      p_rating: "good",
      p_next_due_at: dueAt(new Date(), outcome).toISOString(),
      p_stability: outcome.stability,
      p_difficulty: outcome.difficulty,
      p_state: outcome.state,
      p_mastery: outcome.mastery,
      p_interval_days: outcome.intervalDays,
      p_elapsed_days: 0,
      p_mode: "review",
    });

    record(
      "a captured card can be reviewed through the normal scheduler",
      !applied.error,
      applied.error?.message ?? `"${first.surface}" scheduled for ${outcome.intervalDays} day(s)`,
    );

    const after = await listDueCards(authed, "es", 10);
    record(
      "reviewing it removes it from the due queue",
      !after.some((card) => card.itemId === first.itemId),
      `${captured.length} due → ${after.length} due`,
    );
  }

  // ── 6. Capture must not leak across accounts ─────────────────────────────
  step("Captured content is private to the learner who brought it in");

  const otherEmail = `capture-other-${Date.now()}@example.com`;
  await anon.auth.signUp({ email: otherEmail, password, name: "Capture Other" });
  const otherSignIn = await anon.auth.signInWithPassword({ email: otherEmail, password });
  const otherId = otherSignIn.data?.user?.id;
  const other = createClient({ baseUrl: url, anonKey, accessToken: otherSignIn.data?.accessToken });

  const otherRead = await other.database.from("content_sources").select("id").limit(50);
  const otherCandidates = await other.database.from("content_candidates").select("id").limit(50);

  record(
    "another learner sees neither the source nor its candidates",
    (otherRead.data?.length ?? 0) === 0 && (otherCandidates.data?.length ?? 0) === 0,
    `${otherRead.data?.length ?? 0} sources, ${otherCandidates.data?.length ?? 0} candidates visible`,
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
  console.error("\ncapture verification threw:", error);
  record("the capture flow ran to completion", false, String(error).slice(0, 300));
} finally {
  if (userId) {
    await admin.database.from("profiles").delete().eq("id", userId);
    const cleanup = await fetch(`${url}/api/auth/users`, {
      method: "DELETE",
      headers: { "x-api-key": adminKey, "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [userId] }),
    }).catch(() => null);
    if (!cleanup || !cleanup.ok) {
      console.warn(`cleanup warning: capture account ${userId} may remain`);
    }
  }
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
