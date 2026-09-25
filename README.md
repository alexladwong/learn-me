# Learn Me

A personal AI language-learning operating system. It answers one question every time you open it:

> **What should I learn next?**

Guided paths, sentence-level spaced repetition, an AI tutor that teaches instead of chatting, and a
learner profile that knows *why* you keep getting something wrong.

**Status: the loop runs end to end, and the app closes the gap it finds.** Onboard → follow the path
→ play a lesson → review with a real FSRS-5 schedule → paste any text and choose which words to keep
→ and when the same mistake keeps recurring, get a drill built from your own sentences. The AI tutor
and pronunciation are the next milestones — see [Roadmap](#roadmap).

Full architecture and data model: [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md).

---

## The loop

```
Onboarding → Guided Path → Lesson → Sentence Practice → SRS → AI Conversation → Progress
```

Every feature either feeds this loop or amplifies it. Nothing is built as a standalone page.

## What makes it different

| Mechanism | Why it matters |
|---|---|
| **Error fingerprinting → confusion pairs** | Every wrong answer is an event, not a score deduction. Repeatedly mixing up *como / comes / comemos* will auto-generate a targeted drill. |
| **Sentence-level SRS** | Cards are whole utterances with audio and grammar notes, so grammar and collocation are learned for free. |
| **Learn From Content** | The learner's own WhatsApp chats, menus and lecture notes become graded cards — at ~zero authoring cost per learner. |
| **Language DNA** | Skill estimates derived from real activity, each carrying a confidence value. Low-confidence numbers are never shown as if they were facts. |

## What is running today

**Backend (InsForge, `us-east`)** — 20 tables with Row Level Security, explicit grants, indexes and
triggers; two storage buckets; **13 languages in the catalogue, with complete A1 curricula for the
three launch languages**:

| Language | Level | Units | Missions | Items | Steps |
|---|---|---|---|---|---|
| Spanish | A1 | 5 | 10 | 53 | 91 |
| Spanish | A2 | 3 | 6 | 41 | 81 |
| French | A1 | 4 | 8 | 49 | 139 |
| French | A2 | 3 | 6 | 55 | 124 |
| German | A1 | 4 | 8 | 52 | 137 |
| German | A2 | 3 | 6 | 62 | 111 |

**All three launch languages now run A1 into A2** — *Foundations* into *Everyday
life* / *Vie quotidienne* / *Alltag*. Each A2 level covers the same three
situations in the same order: talking about the past, travel, and health, so a
learner moving between languages meets the same progression. The past tense is the
point of A2, and each language's own trap is taught explicitly — Spanish's shared
preterite for *ser* and *ir*, French's `être`-taking movement verbs with participle
agreement, German's separable prefixes sitting around the `ge-`.

The FSRS review RPC, the due-count rollup, mission-completion recording and candidate-promotion
function are all in place.

**Application**

| Area | State |
|---|---|
| Email + Google sign-in, server-side sessions | Working |
| Language catalogue (13 languages, honest capability flags) | Working — every language flagged available is backed by a playable curriculum |
| Six-step onboarding → persisted per-language plan | Working |
| Dashboard: what to do next, goal ring, streak, weekly summary | Working |
| Guided path: tracks → units → lessons, with real completion state | Working |
| **Lesson player**: teach / recognise / recall / listen / arrange / speak | Working |
| **Spaced repetition**: FSRS-5 scheduler, Again·Hard·Good·Easy, keyboard-driven | Working |
| **Word & sentence bank**: filter, search, favourite, keyset pagination | Working |
| **Learn From Content**: paste text → ranked candidates → choose → bank | Working (detection is deterministic; translation is manual without an AI provider) |
| **Learning modes**: Quick · Commute · Study · Speak · Review · Explore | Working — one composer, different budgets |
| **Entitlements**: atomic metering, plan panel, value-first prompts | Working — enforcement is real; checkout is not wired |
| **Daily budget**: the time you chose sets your session size | Working — a 5-minute budget gives 15 cards, a 30-minute budget 98 |
| **Placement-aware path**: your CEFR level decides where "next" starts | Working — an A2 learner is given A2, not A1 Foundations |
| **AI tutor**: 12 scenarios, level-adapted prompts, conversation store, report arithmetic | Design and storage built; **conversations cannot run** — no provider |
| **Confusion engine**: grouped repeated mistakes with the evidence attached | Working — named in plain language from a paradigm table |
| **Language DNA**: per-skill estimates with a confidence floor | Working — a skill with too little evidence shows no number at all |


### Data honesty rules this codebase enforces

These are not aspirations — they are why several screens currently show "not yet" instead of a number:

1. **No invented statistics.** Rollups come from `review_events` and `practice_events`, and every
   rollup is rebuildable from those events.
2. **No simulated pronunciation scores.** Nothing displays a pronunciation score until a real
   speech-analysis provider is connected.
3. **No fake AI responses.** With no `OPENROUTER_API_KEY`, the tutor reports that conversation is
   unavailable rather than streaming something that looks like a reply.
4. **`null` means unknown, not zero.** A metric with no evidence renders "Not yet", never `0`.
5. **Low-confidence skill estimates are not shown.** Comparing skills requires evidence per skill;
   the Language DNA bars stay at "no data" until that evidence exists.
6. **Vocabulary detection is deterministic, not generative.** Words are selected by a reproducible
   count-and-rank pass, so the same text always yields the same shortlist and it costs nothing to run.
   The AI provider is used only to translate a word the learner already chose — which is why Learn
   From Content works with no provider configured.
7. **A word cannot be saved without a translation.** The database function rejects an empty one, so
   a fabricated or blank meaning cannot enter someone's vocabulary.
8. **A drill is refused rather than padded.** It needs at least three sentences that actually contain
   the form being practised. Below that the app says what would make a drill possible instead of
   presenting questions about nothing.
9. **A claim carries its evidence.** Every reported confusion pattern shows the learner's own
   attempts, and a pattern stops being reported once they have answered correctly five times in a row
   — the fix is data, not a dismiss button.
10. **An advertised language is a playable language.** `is_available` is verified against real
    content by the test suite, because French and German initially carried the flag with nothing
    behind it and a learner could select them and land on empty screens.
11. **Responsive behaviour is measured, not asserted.** The six required viewport widths are
    checked in a real layout engine rather than claimed in prose.
12. **An allowance is spent atomically, before the work.** Metering happens in one
    `SECURITY INVOKER` function that locks the learner's row, so six concurrent requests against a
    limit of one allow exactly one. A read-then-write would leak the quota under precisely the
    conditions where it matters.
13. **A learner cannot change their own plan.** `quota_limit` and `source` are protected by
    column-level grants *and* an immutability trigger, because RLS filters rows and not columns —
    a lesson this project learned by writing the escalation and watching it succeed.
14. **The answer to "how much time can you study?" is honoured.** Onboarding collects a daily
    budget and the session size is derived from it, so a 5-minute learner gets 15 cards rather
    than the same 30 everyone used to receive. A budget that only changes a label is worse than
    not asking.
15. **A report distinguishes what it measured from what it judged.** Conversation reports compute
    production and vocabulary variety from the learner's own text and state them with their sample
    size. Grammar and vocabulary scores come from a tutor and are `null` without one — the report
    names the missing evidence rather than showing a neutral 0.5 that would read as "average".
16. **Grammar coverage precedes the content that needs it.** The drill generator can only practise a
    form it can name, so the past-tense paradigms for all three launch languages were added *before*
    any A2 sentence. A2 material the app could not drill would be learnable but not fixable.
17. **Content arrives with enough repetition to be drilled.** Every past-tense form in every A2 unit
    appears in at least three sentences, because the drill generator refuses to build one below that.
    A form taught once is recognised, not learned. The verifier asserts this per language.
18. **Every published item is reachable.** A sentence with no exercise is counted in a progress
    figure and impossible to study, so the verifier checks that no A2 item is without at least one
    step — a gap the coverage migrations created the first time round.
19. **Placement decides what you are given.** A learner who places at A2 is started on A2, and
    finishing A2 never presents A1 material as the natural next step. Lower-band lessons stay in the
    path as revision and are labelled as such — the app does not imply a learner has gone backwards.

## Architecture

- **Next.js 16** (App Router, Turbopack) + **TypeScript** + **Tailwind 4** with CSS custom-property
  design tokens — one "paper" surface for learning, one dark "instrument" surface for analytics
- **InsForge** for Postgres (+ pgvector), auth, storage, edge functions, the AI model gateway
  (OpenRouter) and Stripe payments
- The **server owns the review schedule**; the client submits events and receives a queue
- **Events are append-only, rollups are derived** — `review_events` and `practice_events` reject
  `UPDATE` even from a signed-in learner's own session
- **RLS is the enforcement point**, not application-level filtering, and privileges are revoked down
  to the intended operation surface (`npm run verify:backend` asserts this)
- The **scheduler is pure**: `lib/learning/fsrs.ts` has no database, clock or randomness, so the one
  piece of the product where a subtle error silently damages retention is testable in isolation

### Layout

```
app/
  (auth)/            sign-in, sign-up, auth Server Actions
  (app)/             authenticated shell (desktop sidebar + mobile bottom nav)
    languages/       language selection & switching
    settings/        account-level settings
    [lang]/          dashboard, onboarding, path, review, bank, capture, speak, progress, settings
      lesson/[id]/   the guided lesson player
      review/        the spaced-repetition session
      bank/          word & sentence bank
      capture/       Learn From Content: paste, choose, keep
      drill/[key]/   generated exercises for one confusion pattern
  api/auth/          OAuth callback, session refresh
  (dev)/probe/       layout-measurement harness (unlinked, fixture data only)
  api/health/        dependency + database health
lib/
  db/                typed, defensively parsed queries (one module per domain)
  ai/enrich          translation via OpenRouter; reports unavailability honestly
  learning/
    fsrs             the FSRS-5 scheduler — pure, unit-tested
    budget           daily study time -> session size — pure, unit-tested
  tutor/
    scenarios        the tutor's intent: roles, tasks, level-adapted prompts
    report           measured vs judged scores, and which evidence is missing
    fingerprint      error classification for the confusion engine
    paradigms        verb-form tables that name what was confused, present and past
    drill            confusion pattern -> contrast exercises — pure, unit-tested
    extract          deterministic vocabulary detection — pure, unit-tested
    session          the "what should I learn next?" composer
    answer           grading, options, arrangement shuffling — pure, unit-tested
  auth/session       requireSession, profile provisioning, safe redirects
  insforge/          server client (RLS) and admin client (privileged)
components/
  ui/                design-system primitives (buttons, cards, progress, forms)
  learning/          the shared answer panel and audio controls
  layout/            navigation
  auth/              auth widgets
migrations/          applied via the InsForge CLI
scripts/             verification harnesses
```

## Development

```bash
npm install
cp .env.example .env.local   # then fill in from .insforge/project.json
npm run dev                  # http://localhost:3000
```

Keys come from the linked InsForge project:

```bash
npx -y @insforge/cli current            # confirm the linked project
npx -y @insforge/cli secrets get ANON_KEY
npx -y @insforge/cli secrets get API_KEY
```

### Checks

```bash
npm test                  # 343 unit tests: FSRS, budget, paradigms, drills, offline queue, error guard
npm run typecheck
npm run lint
npm run build
npm run verify:auth       # 19 assertions on the credential matrix and session cookies
npm run verify:backend    # 63 assertions on the database (RLS, content coverage, metering, tutor)
npm run verify:logic      # 62 assertions on the TypeScript over live data (DNA, drills, placement)
npm run verify:journey    # 34 assertions walking one account from signup to a finished drill
npm run verify:onboarding # 23 assertions on the plan a learner's answers produce
npm run verify:onboarding-ui # 32 assertions driving the six-step wizard in a browser
npm run verify:capture    # 29 assertions on pasted text becoming vocabulary and cards
npm run verify:pwa        # 19 assertions on the manifest, service worker and offline shell (needs `npm start`)
npm run verify:layout     # 24 assertions measured in headless Chrome at six viewport widths
npm run reset:test-data   # sweeps up any account a verification run left behind
```

`verify:pwa` needs a running server (`npm start`); every other verifier talks to the database
directly.

`verify:onboarding-ui` is the one check that drives a real browser, and it earns that cost: the
wizard keeps answers in `sessionStorage` because each step is a Server Action plus a redirect that
remounts the component. No Node-level verifier can see that interaction — every server-side check
passed while the wizard was losing every answer on every step. It runs one browser, one journey,
one temporary profile, then shuts down; it never touches a browser it did not start. It checks the bytes a browser actually receives, because all of these failed silently
before: the proxy matcher did not exclude `sw.js` or `.webmanifest`, so both were redirected to
`/sign-in` and offline mode simply never worked, with nothing surfaced anywhere a developer would
look.

`verify:journey` drives a single throwaway account through the whole product in order — sign up,
onboard at A2, play the lesson the path offers, finish it, review every card it enrolled, make the
same mistake three times, build a drill, then replay the lesson — asserting the invariants that
connect each step to the next. The other verifiers check pieces; this one checks that the pieces
actually chain. It is what caught the bank screen failing to load for anyone who had saved an item,
and a drill that could never be built for an accented form.

`verify:onboarding` and `verify:capture` cover the two flows that bring content *into* the product
rather than walking the shipped curriculum: the six-step wizard that decides a learner's whole plan,
and Learn-From-Content. Both write their rows directly, so nothing had exercised the real code path —
onboarding failed for anyone who accepted the default first language, and re-analysing a pasted text
silently invalidated every candidate a learner was looking at.

`verify:layout` drives Chrome over the DevTools Protocol against `/probe`, a harness that
renders every presentational component with deliberately unflattering content — the longest
sentence in the curriculum, a long gloss, a wide number — and measures the result at 320, 375,
390, 430, 768 and 1024 pixels. It asserts that nothing scrolls horizontally, nothing overflows
the viewport, every touch target clears 44px on touch widths, and no text renders below 11px.

It exists because a static scan for `w-[400px]` catches arbitrary widths but misses what actually
breaks a narrow screen. On its first run it found twelve controls between 16 and 40 pixels tall
in real screens, including the primary mode switcher.

Both verifiers clean up after themselves. If a run is interrupted, `reset:test-data`
removes anything orphaned — accounts are deleted through the Admin API, because the
runtime database role cannot write to the managed `auth` schema.

`npm test` runs on Node's built-in test runner with native TypeScript stripping — no test framework
dependency. The suites assert *properties*, not just arithmetic: a lapse must never lengthen an
interval, a same-day failure must not hide a card for days, ratings must be monotonically ordered,
and the classifier must not claim a specific error type it cannot justify.

`verify:backend` proves things a unit test cannot: that every language flagged available is backed by
a real curriculum, that each can build a drill for its core verbs, that RLS actually isolates two
learners, that
`review_events` rejects `UPDATE` from a signed-in learner's own session, that completing a lesson
enrols its items due-now, that re-saving never resets a schedule, that repeated conjugation errors
group under one fingerprint, that keeping a captured word creates an item *and* a bank entry *and* a
queue entry, that a blank translation is refused, and that pasted text is unreadable by another
learner. It creates throwaway accounts and deletes them afterwards.

### Applying migrations

```bash
npx -y @insforge/cli db migrations new <name>   # creates migrations/<version>_<name>.sql
npx -y @insforge/cli db migrations up --all
```

## Roadmap

| Phase | Scope | State |
|---|---|---|
| 1 | Architecture, auth, language selection, onboarding, dashboard | **Done** |
| 2 | Learning tracks, lesson player, sentence bank, word bank | **Done** — Spanish, French and German A1 playable |
| 3 | SRS engine wiring, review session UI, error fingerprinting, progress | **Done** |
| 4 | Learn From Content (paste → candidate words → bank) | **Done** for pasted text; URL/video/OCR modelled but not implemented |
| 5 | AI tutor, conversation reports, Practice My Mistakes | **Provider-independent work done**: 12 scenarios with level-adapted prompts, conversation/turn/report schema, measured report arithmetic. **Conversations blocked**: the InsForge org is on the free plan, so the Model Gateway is unavailable. |
| 6 | Pronunciation coach, Language DNA, advanced analytics | Language DNA and the confusion engine **done**; pronunciation needs a speech provider |
| 7 | Premium entitlements, Stripe | **Entitlements done** (catalogue, atomic metering, gates, plan UI). **Checkout blocked**: no Stripe or Razorpay keys are configured. |

## What is blocked, and why

Two phases cannot be completed in this environment, for reasons outside the code:

| Phase | Blocker | What it would take |
|---|---|---|
| 5 — AI tutor | `npx @insforge/cli ai overview` reports *"AI is only available on paid plans."* The Model Gateway is the sanctioned route and it is disabled for this org. | Upgrade the org, or set a direct `OPENROUTER_API_KEY`. `lib/ai/enrich.ts` already reads that variable and reports unavailability honestly. |
| 7 — Checkout | The entitlement layer is built and enforced, but `payments stripe status` and `payments razorpay status` both report **unconfigured** — no provider keys exist, so there is nothing to sell yet. | Configure Stripe with `npx @insforge/cli payments stripe config set`. Fulfilment must run on `payments.webhook_events`, never a success URL; the `project_admin` path through the immutability guard is already in place for it. |

Neither is worked around by faking anything: there is no simulated AI response and no
placeholder checkout. Both features report themselves as unavailable instead.

## Security

- Secrets are server-side only. `INSFORGE_API_KEY` and `OPENROUTER_API_KEY` have no `NEXT_PUBLIC_`
  prefix and never reach the browser.
- The access-token cookie is browser-readable (Storage/Realtime need it); the **refresh token is
  httpOnly** and rotated server-side through `/api/auth/refresh`.
- Sign-in redirects validate `?next` against same-origin absolute paths, so the sign-in page cannot
  be used as an open redirect.
- `entitlements` is read-only to learners — premium cannot be self-assigned by a request.
