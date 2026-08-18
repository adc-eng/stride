# Stride — Project Overview (working state)

Companion to the three repo READMEs (root / `apps/web` / `backend`), which are
the canonical "what & why." This doc holds only what those don't: **the current
build state, the decision history behind the locked choices, and the open
questions / next steps.** When this and a README disagree, the README wins for
contract/architecture; this wins for "what actually runs today."

Audience/tone: senior (~30 yrs). Concise, prose over formatting, push back on
imprecision, no beginner explanations. The owner drives — drafts or pushes back
first, then asks for critique.

---

## Mock demo hardening + live LLM integration (session, parallel to backend)

Full detail in `HANDOFF_mock_demo_hardening.md`. Summary: backend Features
002–008 are untouched (still exactly where `HANDOFF_001` left them) — this
was a separate, parallel push to make the **mock** demo-ready without
waiting on the real backend: a reproducible 60-day seeded dataset with three
designed narrative arcs (sleep-lag/cushion contrast, late-meal→weight,
movement-lapse→mood), real sketch computation client-side mirroring the
backend's intended sketch shape, and — the headline change — **the Insights
tab and "Ask me" chat now call the real Anthropic API** (forced tool-use for
structured insight output, plain-text for chat) instead of returning canned
text.

Two real bugs were found and fixed along the way: a stale-reload bug where
Mood taps didn't visibly update until something else forced a refetch, and a
local/UTC date mismatch across several files that could route a live write
to a different calendar-date bucket than the seed data, depending on
timezone and time of day.

**Important:** the live LLM calls run directly from the browser with the
Anthropic key in `apps/web/.env.local` (gitignored) — this is a deliberate,
temporary violation of the "LLM calls: backend-side only" principle above,
purely so the demo can show real reasoning before Feature 005 is built. It
must move server-side when that feature lands.

---


## Where the build actually is

**Frontend — built and running.** Vite + React + TS + TanStack Router + MSW +
Tailwind v4 + Recharts, under `apps/web/`, four tabs, all fetches client-side and
mocked by MSW. Runs at `localhost:5173` via
`pnpm install && pnpm dlx msw init public/ --save && pnpm dev`.

- **Today** — date-scoped logging (checklist, sleep, last meal, water, weight,
  one-tap mood, disabled daily-vibe preview, notes → `/captures`).
- **Dashboard** — 14-day Recharts trends; the mock returns **raw logs**, the UI
  summarizes client-side (this is the demo end-state, not a stopgap).
- **Insights** — on-demand generation over a page-level date range, stored with
  provenance, newest-first scroll list; separate range-scoped chat.
- **Wall** — bookmarks (local state; no API yet).

**Backend — not started.** `backend/` holds only its README. Spec Kit not yet
initialized. Postgres decided (Docker, not Homebrew). Auth designed, not built.
The nightly/on-demand reasoning agent is designed, not built.

**Mock is the contract.** MSW serves the resource-oriented shape the real backend
must emit; `apps/web/src/lib/api.ts` is the only network-aware file, so going
live is a base-URL change. State is in-memory with ~14 days of seeded history +
a couple of seeded insights; a full reload resets to seed (intentional).

## The finalized entity table (as seeded in the mock)

| Entity | type | value | unit | attributes | time |
|---|---|---|---|---|---|
| Focussed Breathing | input | boolean | — | `{duration_min:5}` | optional |
| Stretches | input | boolean | — | `{duration_min:5}` | optional |
| Walking | input | boolean | — | `{duration_min, distance_miles}` | optional |
| Sleep | input | numeric (hours) | hours | `{quality:1–5}` | **required** ("Bed time") |
| Last meal | input | numeric (1–5) | scale_1_5 | `{description?}` | **required** |
| Water intake | input | numeric | oz | — | optional |
| Daily vibe | input | enum | — | `{level}` | disabled (preview) |
| Weight | outcome | numeric | lbs | — | optional |
| Mood | outcome | enum | — | `{at:"now"}` | optional |

- Only **Weight** and **Mood** are outcomes; everything else is an input.
- **Sleep** is repeatable (naps/split sleep): value = hours, quality in
  attributes, bed time = `occurred_at`.
- **Breathing/stretches** are binary in the UI but store `duration_min: 5`;
  **Walking** toggles with a default `duration_min: 20` so it charts.
- **Water** is one entity — quick-adds (4/8/16/24 oz) and a free-flow total both
  append; the day total is a read-time sum.
- **Mood** is one-tap "now" (Energized, Focused, Calm, Tired, Stressed, Meh);
  daily-vibe (same labels + Sometimes/Often/Most) is a distinct, disabled
  preview of the end-of-day summary path, to be collated from mood later.
- Every log and insight carries `user_id` (mock stamps a constant; real backend
  takes it from the token).

## Decision history worth preserving

Rationale behind the locked choices, so they aren't relitigated:

- **inputs / outcomes, not habits/actions.** "input" covers both deliberate acts
  (stretching) and logged facts you control (last-meal time) — neither a habit
  nor an action. Only observed results are outcomes.
- **On-demand insight generation, not nightly batch (a deliberate pivot).**
  Simpler for the demo and the better primitive: the user picks a range and
  generates; results are persisted with provenance; nightly becomes just the
  same call on a schedule. The reasoning service stays trigger-agnostic. This
  superseded the earlier nightly-agent framing across all docs.
- **Insights are stored rows with provenance** (`generated_at`, `range_from/to`,
  `generated_by`, `confidence`, `entity_ids`). Chat is separate and **not**
  persisted — different lifecycle and trust level.
- **Thin-data honesty is a feature.** Generation must be allowed to return a
  single "nothing trustworthy to say yet — ask me something specific" card
  rather than manufacture correlations from noise. Low-confidence output should
  be a modest observation, not a claimed link.
- **Sketches-in-SQL / reasoning-in-LLM** is a *scoping* of the old
  "compute-in-SQL, LLM-never-calculates" rule, not a reversal. SQL produces the
  numbers so the model can't fabricate them; the LLM does the cross-entity
  reasoning but must ground and label every claim.
- **Vite + TanStack Router, not TanStack Start.** Nothing needs SSR; the Router
  alone stays browser-only, which also keeps MSW simple (browser worker only
  intercepts in-tab fetches). Upgrade to Start is additive, on a real SSR
  trigger only.
- **MSW client-side only.** Every fetch runs in the tab (in `useEffect`/handlers,
  never a loader) so the worker reliably intercepts — no SSR path to leak a fetch
  onto Node.
- **`occurred_at` + `logged_at` on every log.** `occurred_at` = page-date + a
  24-hr time (Today is scoped to one date); enables backfilling past days as a
  non-event. Seed timestamps are **local-time** ISO (no trailing `Z`) so charted
  hours match seeded hours.
- **Single `/logs?type=` union, no `/input_logs` endpoint.** `/inputs` and
  `/outcomes` are definitions; logs live underneath; the union read filters by
  type.
- **Dashboard summarizes raw logs client-side** by design — the mock returns raw
  series, mirroring what the real `/logs` will serve, so the dashboard needs no
  rework when the backend lands.
- **Recharts** for charts (over hand-rolled bars) once the dashboard grew past a
  few charts.
- **observe-don't-pressure is an agent constraint, not just UI copy** — because
  an agent that can propose new metrics could reintroduce
  restriction-gamification through suggestions. Belongs in the system prompt.

## Open questions / deferred

- **Scheduled generation** — whether to add a nightly/cron trigger alongside
  on-demand later. Service is trigger-agnostic, so additive.
- **Walking minutes** — currently a fixed default on toggle; a real minutes/
  distance input on the Today card is a later add.
- **entity_ids surfacing** — captured in the API and on stored insights, not yet
  shown on the cards (chips later).
- **Auth token transport** — httpOnly cookies (preferred for health data, needs
  CSRF handling) vs. localStorage JWT. Use a library/provider, don't hand-roll.
- **Image outcomes + vision** — designed (pre-signed S3 upload, key stored on the
  log) but unspecced.
- **TanStack Start** — only on a real SSR trigger.
- **Spec Kit CLI** — command names/flags shift between releases; verify the
  current CLI before `specify init`.
- **SETUP.md** — retired; its content lives in `apps/web/README.md`.

## Immediate next steps

1. Commit the frontend baseline + the three updated READMEs.
2. Verify the current Spec Kit workflow, then `specify init` in `backend/`.
3. Draft the constitution (see `backend/README.md` for the minimum principles).
4. Spec + build the canonical slice: "log an input and see it reflected"
   (auth + `user_id` scoping + `input_logs` + read-back), test-first.
5. Swap the SPA off MSW onto the live API (base-URL change).
