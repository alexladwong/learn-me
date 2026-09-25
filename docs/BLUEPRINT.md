# Learn Me — Build Blueprint

> A personal AI language environment that learns how you learn, remembers what you know,
> identifies what you don't know, and continuously builds the shortest path toward real-world fluency.

This document is the technical contract for the product described in the vision brief. It exists to
stop us from building thirteen disconnected features. Everything below serves one loop:

```
Onboarding → Guided Path → Lesson → Sentence Practice → SRS → AI Conversation → Progress
```

Everything else (Learn-From-Content, Pronunciation Coach, Fluency Map, Universal Capture) is an
**amplifier attached to that loop**, never a parallel feature island.

---

## 1. The thesis, stated precisely

Most language apps optimise for *completion*. Duolingo owns the streak habit, Anki owns SRS depth,
Babbel owns human-authored curriculum. None of them model **the specific learner**.

Our wedge is a claim none of them can make cheaply:

> **We know why you are getting this wrong, and we already built the drill for it.**

Three concrete mechanisms deliver that claim, in priority order:

1. **Error fingerprinting → confusion pairs.** Every wrong answer is an event, not a score
   deduction. From events we derive pairs like `como ↔ comes ↔ comemos` and auto-generate a
   targeted micro-session. This is the single most defensible idea in the brief and should be
   built in Phase 3, not "later".
2. **Sentence-level SRS.** Cards are whole utterances with audio, literal + natural translation,
   grammar note, and vocab breakdown — not isolated words. Sentences master *grammar and
   collocation* for free.
3. **Zero-authoring content pipeline.** "Learn From Anything" turns the learner's own life
   (WhatsApp, menus, lecture notes, YouTube) into graded cards. Content cost per learner is ~0,
   so we can support Luganda and Swahili without a curriculum team.

### Positioning line

Not "a language app". A **language environment**. If a feature doesn't either (a) put something
into the learner's memory, (b) prove what they now know, or (c) show them where they're weak, it
waits.

---

## 2. Architecture: what runs where

**Stack decision:** Next.js (App Router) + TypeScript + Tailwind + InsForge (Postgres, Auth,
Storage, Realtime, Edge Functions, AI Model Gateway, Stripe).

InsForge collapses what would otherwise be seven vendors: database, auth, file storage, realtime,
serverless functions, LLM gateway (OpenRouter), and payments. One SDK, one RLS model, one bill.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Browser (Next.js client components)                                      │
│  Today Session · Path · Lesson Player · SRS Review · Speak · Capture      │
│  InsForge SDK (anon key, RLS-enforced)  ·  Web Speech / MediaRecorder     │
└───────────────┬──────────────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────────┐
│ Next.js server (route handlers / server actions)                         │
│  • SRS scheduler (FSRS-5) — deterministic, server-authoritative          │
│  • Session composer ("What should I learn next?")                        │
│  • Grading + error fingerprinting                                        │
│  • Content ingestion pipeline orchestration                              │
│  • Quota / entitlement checks (premium gates)                            │
│  PRIVILEGED: admin client. Never exposes apiKey to the client.           │
└───────────────┬──────────────────────────────────────────────────────────┘
                │  InsForge Edge Functions  (long-running / async)
                │  • analyze-content   • generate-audio   • score-pronunciation
                │  • conversation-report  • embed-items
┌───────────────▼──────────────────────────────────────────────────────────┐
│ InsForge backend                                                         │
│  Postgres (+ pgvector)   Auth   Storage(buckets)   Realtime   Payments    │
│  AI Model Gateway → OpenRouter (chat, STT, TTS, embeddings)               │
└──────────────────────────────────────────────────────────────────────────┘
```

### Why the SRS scheduler lives on the server

If scheduling runs in the browser, offline mode, clock tampering, and multi-device all corrupt the
learner's memory model. Instead: **the server owns the schedule and the queue.** The client can
cache a queue for offline use, but it submits *review events* and receives a *new queue*. This also
makes the confusion engine possible, because the server sees every event.

### Why async work goes to Edge Functions

Content analysis, TTS generation, pronunciation scoring, and conversation reports all take 5–60s.
They must not block a request. Pattern: enqueue a job row → edge function processes → writes
results → realtime notifies the client. The UI shows an optimistic "Analysing…" state.

---

## 3. The domain model

### 3.1 Item: one entity for words and sentences

The brief's "Sentence Bank" and "vocabulary" are the same thing at different granularity. One table,
one SRS engine, one confusion engine. `kind` discriminates.

| field | notes |
|---|---|
| `id` | stable UUID, **never recycled** |
| `language_code` | BCP-47 (`es`, `fr`, `ja`, `ar`, `sw`, `lg`, `id`) |
| `kind` | `word` \| `sentence` \| `phrase` \| `grammar_point` |
| `lemma` / `surface` | dictionary form vs. the form shown |
| `translation_literal` | word-for-word — teaches structure |
| `translation_natural` | what a native would actually say |
| `grammar_note` | short, e.g. "estar for temporary states" |
| `vocab_breakdown` | jsonb array of `{token, lemma, gloss, pos}` |
| `difficulty` | CEFR `A1..C2` |
| `tags[]` | `greeting`, `subjunctive`, `food` |
| `audio_slow_key`, `audio_normal_key` | Storage keys; **store key AND url** |
| `phoneme_hint` | for pronunciation coaching |
| `source` | `curriculum` \| `user_capture` \| `ai_generated` |
| `owner_id` | null for curriculum content (shared), set for captured |
| `embedding vector(1536)` | dedupe + "related vocabulary" + confusion detection |

`UNIQUE (language_code, kind, surface, translation_natural)` prevents duplicates when the same
phrase arrives twice from two sources. Curriculum rows (`owner_id IS NULL`) are world-readable;
captured rows are owner-only.

### 3.2 Course structure: Track → Island → Mission → Step

The "worlds / islands / missions" feel in the brief is a 4-level authored hierarchy:

- **track** — Foundations, Family & Relationships, Food & Shopping, Work & Career, Travel,
  Health, Social Conversations, Emergencies, Culture, Dating, University, Business, Advanced
- **unit** (the "island") — 4–8 per track, ordered, with a checkpoint
- **mission** (the "chapter") — 3–6 per unit, the unit of a single sitting
- **step** — ordered atoms inside a mission: `teach` | `recognise` | `recall` | `listen` |
  `speak` | `match` | `arrange` | `checkpoint`

Steps reference items. `mission_items` is the fast join table for "which items does this mission
teach" — needed by the path renderer and by the SRS `context` field.

**Ordering is explicit and server-side** (`units.order_index`, `missions.order_index`,
`steps.order_index`). Never rely on `created_at` for curriculum order; content gets reordered.

### 3.3 Messy reality: one learner profile per language

Do **not** put `current_level`, `streak`, or `total_xp` on `users`. A learner is B1 in Spanish and
A1 in Japanese with separate streaks. Everything learning-specific hangs off
`learner_languages(user_id, language_code)`.

`user_stats` is a **trigger-maintained rollup**, not a source of truth. The source of truth is
`review_events` + `practice_events`. Rollups exist so the dashboard is one indexed read instead of
an aggregate over millions of rows. (See §9 — every counter needs a rebuild path.)

### 3.4 Memory: the SRS state

`review_states` is the heart. One row per `(user_id, item_id)`.

```
stability        float   -- FSRS: days until recall probability decays to 90%
difficulty       float   -- FSRS: 1..10 intrinsic item difficulty for THIS user
state            text    -- new | learning | review | relearning | suspended
due_at           timestamptz
reps, lapses, streak_correct, streak_wrong   int
last_rating      text    -- again | hard | good | easy
last_reviewed_at timestamptz
```

The four rating buttons in the brief (`Again · Hard · Good · Easy`) map **exactly** onto FSRS-5.
That is not a coincidence to be redesigned — it is the correct algorithm for this UI.

### 3.5 The differentiator: error fingerprints

This is the table most language apps don't have.

```
error_events
  id, user_id, item_id (nullable), language_code
  mode           -- recall | listen | speak | translate | arrange | match
  expected       text      -- 'como'
  produced       text      -- 'comes'
  is_correct     boolean
  error_type     -- conjugation | gender | word_order | vocabulary | tense |
                    preposition | pronunciation | spelling | register
  fingerprint    text      -- normalised pair key, e.g. 'conjugation:comer:1s:2s'
  context        jsonb     -- mission_id, conversation_id, source
  created_at
```

From `error_events` we derive, per user:

```
confusion_pairs (materialized, refreshed per session)
  user_id, language_code
  a_item_id, b_item_id, a_label, b_label   -- como / comes / comemos
  error_type, occurrences, last_seen_at, resolved_at
  mastery        float  -- decays back up if they relapse
```

**The loop that makes this a product:** a confusion pair with `occurrences >= 3` and
`mastery < 0.7` **auto-enqueues a generated micro-drill** — a set of contrast steps built from the
pair plus 2 distractors, inserted as a synthetic mission in the learner's `daily_sessions`. The
dashboard then says:

> You remember *comer*, but you keep mixing up *como*, *comes*, and *comemos*.
> 6-minute drill ready →

That sentence is the product. Everything else is table stakes.

**Confusion detection heuristic (v1, no ML needed):** bucket errors by `error_type`; if two items
share a lemma (or a Levenshtein distance ≤ 2 on the same lemma/paradigm), and the user erred
≥3 times in 14 days, emit a pair. Upgrade to embedding neighbourhood + LLM clustering in Phase 6.

### 3.6 Language DNA: derived, never stored as truth

The bars in the brief (Vocabulary 82%, Listening 64%, Speaking 55%…) are **estimates with
uncertainty**. Storing them as mutable percentages guarantees they drift from reality and become
demoralising lies.

```
skill_estimates
  user_id, language_code, skill  -- vocabulary | listening | speaking |
                                    grammar | reading | pronunciation
  score          numeric(4,3)    -- 0..1
  confidence     numeric(4,3)    -- 0..1, driven by *how much evidence* exists
  sample_size    int
  decayed_at     timestamptz
  contributors   jsonb           -- which signals produced this, for explainability
```

Rules:
- `vocabulary` ← distinct items with `stability >= 21d` ÷ target vocab for the learner's level.
- `reading` ← accuracy on `recognise` + `translate` steps.
- `listening` ← accuracy on `listen` steps **minus** transcript-visible attempts.
- `speaking` ← completed `speak` steps + conversation turns, weighted by pronunciation score.
- `pronunciation` ← mean phoneme-level score from the Pronunciation Coach.
- Apply **time decay** (halve evidence weight every 60 days) so a 6-month-old score isn't quoted.

**When `confidence < 0.5`, the UI must not show a number.** Show "Not enough data yet — do 3 more
speaking exercises". Showing a confident-looking 55% built on two attempts is how this feature
loses trust. The brief's narrative line ("Your reading is ahead of your speaking; this week's plan
includes more spoken recall") is generated from **rank ordering + confidence**, not raw scores.

### 3.7 Full table inventory (schema to be authored as InsForge migrations)

**Identity / profile**
- `profiles` (mirrors `auth.users`, display name, avatar, timezone, locale, onboarding_state)
- `learner_languages` (user_id, language_code, cefr_goal, motivation[], minutes_per_day,
  current_level, active, started_at)
- `user_stats` (rollup: streak_current, streak_longest, words_learned, sentences_mastered,
  listening_seconds, speaking_seconds, review_cards_due, weekly_*, last_active_date)
- `daily_activity` (user_id, date, minutes, reviews, new_items, accuracy) — powers the heatmap

**Curriculum (read-mostly, `owner_id IS NULL`)**
- `languages`, `tracks`, `units`, `missions`, `steps`, `items`
- `mission_items` (mission_id, item_id, role: teach|practice|checkpoint)

**Memory / scheduling**
- `review_states`, `review_events` (append-only), `review_logs`
- `daily_sessions` (user_id, date, composed queue jsonb, completed_steps, source: goal|drill|review)
- `confusion_pairs`

**Practice / production**
- `practice_events` (mode, item_id, correct, latency_ms, raw_answer, error_type, fingerprint)
- `sentence_bank` (user_id, item_id, saved_at, personal_note, mastery) — the learner's library
- `conversations` (scenario, language, transcript jsonb, duration, status)
- `conversation_turns` (role, text, audio_key, corrections jsonb)
- `conversation_reports` (grammar_score, vocab_score, fluency_score, pronunciation_score,
  new_words[], mistakes[])
- `pronunciation_attempts` (item_id, audio_key, overall_score, phoneme_scores jsonb, waveform,
  feedback_text)

**Capture / ingestion**
- `content_sources` (kind: text|url|youtube|image|pdf, raw, status, language_detected)
- `content_candidates` (source_id, surface, gloss, example, accepted bool, item_id)
- `content_jobs` (kind, status, progress, error) — the async work queue

**Product / billing**
- `plans`, `entitlements` (user_id, feature, quota, used, period)
- `usage_events` (feature, count) — drives "you've used 5 of 5 free conversations"
- `subscriptions` — **mirrors Stripe via `payments.webhook_events`**, never the success URL

**Learning science**
- `spaced_repetition_algorithm_config` — FSRS weights, versioned, so a tuning change doesn't
  silently rewrite everyone's schedule.

---

## 4. The scheduling engine ("What should I learn next?")

The brief is emphatic that users should never have to figure out what to do. That means one
server function composes **Today's Session**, and it is the only entry point on the dashboard.

```
composeDailySession(userId, languageCode, mode, minutesAvailable) -> Session
```

Composition rules, in priority order:

1. **Overdue reviews** (`due_at <= now()`), capped by `minutesAvailable` — always first.
2. **Active confusion drills** (`occurrences >= 3`, `mastery < 0.7`) — interleaved, not appended.
   Mixing the weakness *into* the session is what makes it feel intelligent rather than remedial.
3. **New items from the current mission**, capped by a daily new-item budget derived from
   `minutes_per_day` (e.g. 5 min → 3 new items, 30 min → 12 new items).
4. **Speaking quota** — if `skill_estimates.speaking` ranks last with adequate confidence, force
   ≥1 speaking step. This is how "your reading is ahead of your speaking" becomes action instead
   of a taunt.
5. **Retention floor** — if 7-day accuracy < 75%, add remedial steps on previously failed items.

**Learning modes** map to the same composer with different filters:

| Mode | Budget | Composition |
|---|---|---|
| ⚡ Quick | 5 min | overdue reviews + recall only, no new items |
| 🎧 Commute | 15 min | listen + speak steps, **audio-only UI**, hands-free |
| 📚 Study | 30 min | full mission + reviews, all modes |
| 🗣 Speak | 10 min | conversation scenario + pronunciation coach |
| 🧠 Review | — | pure SRS queue |
| 🌍 Explore | — | capture-driven, content source → items → quiz |

Mode is a **first-class column on `daily_sessions`**, because the same learner needs a different
experience at a bus stop than at a desk. The Commute mode's audio-only UI is a real design
constraint, not a filter — it must work with the screen off.

---

## 5. Information architecture & routes

```
/                                  Language Home — pick/create a language
/onboarding                        Motivation → time budget → placement → goal → first session
/(app)/[lang]                      Dashboard: level, streak, goal ring, DNA preview, Today card
/(app)/[lang]/path                 Guided journey: 13 tracks → units → missions, progress-locked
/(app)/[lang]/lesson/[missionId]   Lesson player (teach → recognise → recall → listen → speak)
/(app)/[lang]/review               Smart SRS review with Again/Hard/Good/Easy
/(app)/[lang]/drill/[pairId]       Auto-generated confusion drill
/(app)/[lang]/speak                Scenario picker → live conversation → report
/(app)/[lang]/speak/[convId]       Conversation + post-conversation report + "Practice My Mistakes"
/(app)/[lang]/bank                 Sentence Bank — saved sentences, filters, mastery
/(app)/[lang]/capture              Learn From Anything: paste/upload/URL/photo → candidates → accept
/(app)/[lang]/pronounce            Pronunciation Coach: record, waveform, phoneme feedback, compare
/(app)/[lang]/progress             Progress Intelligence + Fluency Map + Language DNA
/settings                          Languages, goals, notification windows, plan, data export
/billing                           Plans, Stripe checkout/portal (server-driven)
```

**Navigation:** desktop persistent sidebar; mobile bottom nav `Home · Learn · Practice · Speak ·
Profile`. Every screen designed mobile-first, then widened — not the reverse.

**The dashboard's one job:** answer "what do I do right now" in under 2 seconds. Greeting + time
estimate + review count + one primary button (`Start today's session →`). Analytics live one level
down, never competing with the action.

---

## 6. Visual system

The brief asks to merge "approachable, spacious learning product" with "serious intelligent tool".
The resolution is **light content, dark analytics** — and both must feel like one product.

**Token layer first.** All colour lives in CSS custom properties consumed by Tailwind, with
semantic names (`--surface`, `--surface-raised`, `--text-primary`, `--accent`, `--success`,
`--warning`, `--danger`, `--skill-vocab`, …). Never a raw hex in a component. This is what makes
the eventual dark-mode analytics and light-mode learning content consistent rather than two apps.

- **Learning surfaces (light):** warm off-white, generous spacing, large tap targets (≥44px),
  big friendly audio affordances, soft radii (12–20px), minimal chrome. Feels like a good book.
- **Analytics surfaces (dark):** near-black slate, precise type scale, thin rules, data-dense
  but calm. Feels like instrumentation.
- **Bridging device:** the **skill bar** component (Language DNA, track completion, daily goal
  ring) is styled identically in both themes and is the visual signature of the product.
- **Restraint on gamification:** streaks yes; confetti no more than once per milestone; no
  cartoon mascot. The copy sells competence ("18 lessons from completing A1"), not points.
- **Accessibility is a requirement, not a phase:** WCAG AA contrast in both themes, full keyboard
  path through the review loop (a power-user reviewing 100 cards must never touch the mouse),
  visible focus rings, `prefers-reduced-motion` honoured, and every audio element mirrored by text
  (listening exercises are unusable for deaf learners without a transcript affordance).
- **Type:** one humanist sans for UI; target-language text gets a larger optical size and its own
  font stack where the script demands it (Japanese, Arabic). Arabic additionally forces RTL layout
  — plan the `dir` attribute from day one, not later.

---

## 7. AI responsibilities, and where the key lives

`OPENROUTER_API_KEY` is **server-only**. Never `NEXT_PUBLIC_*`. All model calls originate from a
Next.js route handler or an InsForge Edge Function. The client calls our endpoints.

| Job | Model class | Trigger | Output contract |
|---|---|---|---|
| Item enrichment | chat (cheap+fast) | capture accept | strict JSON: gloss, literal, natural, grammar note, breakdown, CEFR |
| Confusion clustering | chat | nightly | group related errors into learner-facing sentences |
| Curriculum generation | chat (strong) | track authoring / premium AI lessons | JSON mission + steps, validated before insert |
| Conversation partner | chat (streaming) | live | persona-constrained, in-language, inline gentle correction |
| Conversation report | chat (strong) | post-conversation | grammar/vocab/fluency scores, mistakes[], new_words[] |
| Speech-to-text | audio STT | push-to-talk | transcript + confidence |
| Pronunciation scoring | audio | recording | overall + per-phoneme scores, feedback sentence |
| Text-to-speech | audio TTS | item creation | cached audio file in Storage (slow + normal) |
| Embeddings | embedding | item creation | 1536-d vector for dedupe + related vocab |

**Cost control is a feature, not an afterthought.** TTS output is generated once per item and
cached forever (`audio_normal_key`). Curriculum audio is shared across all learners, so it's paid
for once globally. Only genuinely user-specific work (their recordings, their conversations) costs
per-use. This is what makes a free tier sustainable.

**Prompt discipline:** every generation that writes to the database goes through a Zod schema
parse. A malformed LLM response must fail loudly into a job error, never insert half a mission.

---

## 8. Business model, implemented honestly

The brief is right that annoyance-driven paywalls destroy trust. The implementation:

- **`entitlements` table** is the only source of truth for what a user may do. Never infer premium
  from a client flag.
- **Value-first upgrade UX.** `usage_events` counts the action. When a free user exceeds the
  allowance, we compute the *narrative* server-side and show it inline:

  > You completed 5 AI conversations this week and learned 41 new expressions.
  > Premium removes the conversation limit.

  The component takes `{action, used, limit, outcome_metric}` — it is data-driven, so we can
  A/B the payload without touching the paywall component.
- **Trial-by-doing.** Premium features are usable a few times before any gate appears
  (`free_trial_uses` per feature). The gate is soft, contextual, and appears *after* the value.
- **Free tier genuinely works:** one active language, core path, daily lessons, basic SRS,
  vocabulary/sentence bank, progress stats, limited AI conversations.

**Stripe wiring (InsForge):** entitlement fulfillment happens on `payments.webhook_events` — never
on a success URL or client callback. Configure with `payments stripe config set`, mirror the
catalog with `payments stripe sync`, then read plans/prices from the synced tables.

---

## 9. Engineering invariants (the rules that prevent a rewrite)

1. **The server owns the schedule.** Client computes nothing about due dates.
2. **Events are append-only; rollups are derived.** `review_events` and `practice_events` are never
   mutated. `user_stats` and `skill_estimates` are rebuildable from events by a documented job.
   If a rollup can't be rebuilt, it's a bug.
3. **Every counter needs a rebuild path** — ship the rebuild script in the same PR as the trigger.
4. **Items are never deleted, only retired** (`retired_at`). Review history points at them forever.
5. **RLS on every user table**, with `WITH CHECK` on INSERT/UPDATE, plus explicit `GRANT`s
   (policies do not replace grants). Curriculum tables get public-read policies.
6. **No unbounded `select()`.** Name columns, `.limit()`, never poll the whole table on an
   interval — that's how you burn the egress quota.
7. **Stable IDs are API contracts.** `item_id`, `mission_id`, `track_slug` appear in client caches
   and analytics. Never recycle, never renumber.
8. **All LLM writes are schema-validated** before insert (Zod), and idempotent on retry.
9. **Content is database-backed, not hardcoded.** So is the curriculum order. The app renders data.
10. **Async by default** for anything over ~2s, with a visible job state and realtime completion.
11. **Offline is a design constraint from Phase 1**, not a feature bolted on later: the review queue
    is deterministic, cacheable, and submittable as a batch of events.
12. **Two languages minimum in the data model** from day one — never a single `target_language`
    column on `users`.

---

## 10. Delivery plan: vertical slices, each shippable

Each phase ends with something a real learner can use end-to-end. No horizontal "all the DB, then
all the UI" phases.

| # | Phase | Deliverable | Done when |
|---|---|---|---|
| **0** | Foundation | Next.js app, Tailwind + design tokens, InsForge project linked, auth (email + OAuth), app shell, mobile nav | A user can sign up, see an empty dashboard, sign out |
| **1** | Onboarding | Motivation, time budget, placement, goal, language selection → `learner_languages` | New user lands on a dashboard that reflects *their* answers |
| **2** | Path + Lesson | Tracks/units/missions seeded for 1 language; lesson player rendering all step types | A learner completes a mission with real audio and progress persists |
| **3** | **The core loop** | FSRS-5 scheduler, review UI (Again/Hard/Good/Easy), error fingerprinting, confusion pairs + auto-drill | Reviews are due tomorrow at the right time; a confusion drill fires after 3 repeated errors |
| **4** | Speak | Scenario conversations, STT, streaming replies, conversation report, "Practice My Mistakes" | A learner has a 5-minute conversation and gets a report that enqueues real drills |
| **5** | Capture | Paste text/URL/notes → analyse → candidates → accept → items + cards | A learner pastes an article and adds 10 words that show up in SRS |
| **6** | Pronunciation | Record, waveform, phoneme-level scoring, native comparison | The coach says *which* phoneme is wrong, not just "incorrect" |
| **7** | Intelligence | Language DNA, Fluency Map, weekly report, estimate/decay model, adaptive plan copy | The app states a specific weakness and the plan visibly responds to it |
| **8** | Commercial | Stripe via InsForge, entitlements, quota gates, value-first upgrade surfaces | Free and premium both behave correctly; fulfillment is webhook-driven |
| **9** | Scale | Offline queue, PWA, browser extension "Add to Language Bank", more languages | Luganda and Swahili work without new curriculum authoring |

**MVP is Phases 0–4.** That is the loop in the brief. Phases 5–7 are the differentiators; 8–9 are
business and reach. Resist shipping 5–7 before 3 is solid — a beautiful capture pipeline on top of
a weak memory model is a toy.

### Where the build actually stands

The phase table above is a plan, not a status. Measured against the code and the verifiers:

| # | State | What is left, and what it is waiting on |
|---|---|---|
| 0–1 | **Done** | Foundation, auth (email + Google), app shell, six-step onboarding. Verified by `verify:onboarding`. |
| 2 | **Done** | 3 languages × A1+A2, 46 lessons, every step type playable, real progress persistence. |
| 3 | **Done** | FSRS-5 scheduler, Again/Hard/Good/Easy review, error fingerprinting, confusion pairs, auto-drill. Verified by `verify:journey`. |
| 4 | **Partly** | Scenarios, conversation store, report arithmetic and the Speak screen exist. **Missing:** streaming replies, STT, and "Practice My Mistakes". **Blocked on:** an AI provider — the InsForge org is on the free plan, so the Model Gateway refuses (`AI is only available on paid plans`). |
| 5 | **Done** | Paste → deterministic extraction → candidates → keep → item + bank + card, in one transaction. Enrichment is off and reports why. Verified by `verify:capture`. |
| 6 | **Blocked** | The Speak screen states honestly that recorded practice is not built. Phoneme scoring needs a speech-analysis provider; no amount of application code substitutes for one, and inventing a score would violate the data-honesty rules. |
| 7 | **Done** | Language DNA withholds a score rather than zeroing it, weekly summary, progress area, adaptive plan copy. |
| 8 | **Partly** | Entitlements, quota gates and the upgrade surface are built and enforced in the database. **Blocked on:** Stripe keys — `payments stripe status` reports `unconfigured` in both test and live. |
| 9 | **Started** | Offline review queue and PWA shell are built: an answer given with no connection is held on the device and replayed with a per-review idempotency key, so a sync that runs twice cannot schedule a card twice. Installable, with a network-first shell that never caches learner data. **Not started:** browser extension, more languages. |

Every "blocked" row is waiting on a credential or a paid plan, not on engineering. Phases 0–3 and
5, 7 are complete and verified; the honest summary is that the product's own logic is done and the
external integrations are what remain.

**A second correction, to row 0–1.** It said onboarding was "done". It rendered, and
`verify:onboarding` passed, because that verifier writes the answers straight to the database and
never touches the wizard — the same blind spot as the review-row one. Driving the real form in a
browser showed the plan could **never** be saved:

  * `/onboarding` lived inside `app/(app)/`, whose layout redirects a learner with no language to
    `/languages`. Onboarding is the one page that *creates* a language, so navigating to it looped
    forever (`ERR_TOO_MANY_REDIRECTS`). It now lives in its own `(onboarding)` group.
  * Each step is a Server Action plus `redirect()`, which makes Next refetch the segment and
    **remount the wizard**. Every answer was therefore destroyed between steps: the motivation
    chips read back empty on the next step, the level reset to A1 and the time budget to 10
    minutes, and the final submit failed validation with "choose at least one reason". The answers
    now live in `sessionStorage` (`lib/onboarding/answers.ts`), not in `useState`.
  * The native-language step injected an English option in its own markup while `profiles.
    native_language` is a foreign key to `languages`, which contained no `en` — so the value the
    wizard defaulted to was rejected by the database.

The lesson is now twice-learned: a verifier that writes rows itself proves the *database* contract,
not that a learner can complete the flow. `scripts/verify-browser.mjs` exists to close that gap.

**A correction to the design constraint above.** Constraint 11 claimed the review queue was already
"submittable as a batch of events" and that offline replay was safe. It was not: `apply_review` had
no idempotency key, so replaying one review wrote a second `review_events` row, advanced `reps`
again and inflated the daily count — measured, not theorised. A per-review `client_key` now gates
the insert (`20260923210000_review-idempotency.sql`), which is what makes the offline queue in
`lib/offline/queue.ts` safe to retry. The lesson is recorded here because the same assumption
("replaying is fine") is the one that would break any future batch path.

---

## 11. Risks and how we de-risk them

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Weak-language audio quality** | Luganda, Swahili TTS is materially worse than Spanish/French. The whole UX rests on audio. | Spike this in Phase 2 with a single language. If TTS is poor, fall back to recorded contributor audio and make that a first-class content path. |
| **ASR accuracy for low-resource languages** | Pronunciation Coach and speaking scores become noise. | Never show a pronunciation score below a confidence floor. Ship the coach for high-resource languages first; gate others behind "beta". |
| **Confusion engine produces false pairs** | Wrong "weakness" claims destroy the intelligence illusion. | Require ≥3 occurrences in 14 days AND shared lemma/paradigm. Show the evidence to the learner ("you said *comes* when we expected *como*, 4 times"). Let them dismiss a pair. |
| **LLM cost per active learner** | Free tier must be sustainable. | Cache all TTS + curriculum audio; cheap models for enrichment; strict per-feature quotas from `entitlements`. |
| **Session composer feels random** | It's the app's whole promise. | Log every composed session and measure completion; make the priority rules explicit in code and reviewable. |
| **Scope explosion** (13 tracks × 6 units × content) | Content is the real cost, not code. | Seed ONE track fully for ONE language in Phase 2, then author with AI assistance + human review. |
| **Analytics overwhelm the learner** | The brief's dashboard has 11 metrics. | Dashboard shows 4 (streak, goal, reviews due, one action). Everything else lives in Progress. |

## 12. Explicitly out of scope for v1

Named so they don't creep in: live human tutors, social/leaderboards/friends, a marketplace for
contributor content, certification/exam accreditation, native mobile apps (PWA first), and
multi-tenant/B2B org accounts. All are compatible with this architecture; none are needed to prove
the loop.

---

## 13. Immediate next actions

1. Provision the InsForge project (`create --json`), link it, write `.env.local`.
2. Author migration `0001_core_schema`: profiles, learner_languages, user_stats, languages,
   items, review_states, review_events, practice_events — with RLS, grants, indexes, and triggers.
3. Scaffold the Next.js app + token layer + auth + app shell (Phase 0).
4. Seed `languages` and one full **Foundations** track for Spanish (Phase 2 content).
5. Build the FSRS-5 scheduler module as **pure, unit-tested functions** before wiring any UI —
   it is the piece that must not be wrong.

**Open questions for the product owner (answer before Phase 6/9, not before Phase 0):**
- Launch languages and launch order (audio quality drives this, not market size).
- Which tracks are authored first, and who reviews the AI-generated content?
- Is pronunciation scoring a free taste or a premium-only feature?
