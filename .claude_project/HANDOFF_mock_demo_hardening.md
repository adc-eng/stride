# Handoff — Mock Demo Hardening + Live LLM Integration

**Status:** Paused here, deliberately. This track ran in parallel to (not instead
of) the Spec Kit backend track — Features 002–008 in `features.txt` are
untouched at exactly the state `HANDOFF_001` left them.

## Why this track exists

Backend features 002–008 take real time to build correctly, and that time is
also deliberately being spent learning Python/SDD. Rather than block the demo
on the backend, the decision was: **do the demo entirely in the MSW mock**,
but make the mock's data and reasoning genuinely real — reproducible 60-day
data with designed statistical patterns, and an actual LLM call (not canned
text) reasoning over real computed sketches. The mock's contract shape still
matches what the real backend will emit, so this isn't wasted work — the
sketch functions and prompt design here are close to directly portable.

## What shipped

**60-day seeded dataset, reproducible.** `src/mocks/handlers.ts` seeds day
1–60 (60 = today) via a mulberry32 PRNG with a fixed seed — same arc shapes
and noise every reload, not fresh-random each time. Three independent
narrative arcs, kept calendar-separated so no insight is confounded:
- Two single-night sleep drops (day 12, 3h; day 40, 2h) — day 12 is
  *cushioned* by steady breathing/walking around it, day 40 is *unprotected*
  (breathing/walking already lapsed) — designed to produce a visibly
  different, longer fatigue aftermath for the unprotected case.
- A 10-day late-meal stretch (days 20–29) with a clean rise-and-fall weight
  bump (peaks near day 28, decays by day 32).
- A breathing/walking completion lapse (days 33–48) overlapping the
  unprotected sleep event.
- Today (day 60) is intentionally left **unseeded for Mood/daily_vibe** —
  it's the live, interactively-tappable day; other entities (weight, sleep,
  etc.) still seed through day 60 as part of the arcs.

**Real sketch computation**, mirroring the backend's intended
sketches-in-SQL contract: numeric sketches (mean/median/sd, min/max with
dates, >1.5sd outliers, 7d-vs-prior-7d trend, completion rate), completion
sketches (rate + longest-gap-with-dates), Mood sketches (label-frequency
distribution, full-range + last-7d), and daily-vibe sketches (per-label
distribution/recent-window/peak-days/longest-elevated-streak). All computed
client-side in the mock from raw seeded logs — no LLM ever touches raw
numbers, only these sketches.

**Mood → Daily vibe**, live and bug-fixed:
- One-tap Mood buttons, fixed (non-progressive) per-label tint, a small
  `[N]` tap-count badge, and an Add/Less toggle (Less removes the most
  recent tap of that label, floors at 0).
- Daily vibe is **not** a separate manual-entry widget — it's a live
  horizontal bar, six segments, proportional to *raw* today's Mood tap
  counts (deliberately not bucketed into none/sometimes/often/alot, since
  bucketing was flattening e.g. 6 taps and 2 taps into the same visual
  width — a real bug caught and fixed mid-session).
- **Real bug found & fixed:** `MoodCard` was calling `api.addLog` directly
  instead of going through the parent's `onAppend`/reload mechanism, so taps
  didn't visibly update until something else forced a re-fetch (e.g.
  navigating away and back). Now wired through `onAppend`/`onRemove` like
  every other card, so state updates immediately.
- **Real bug found & fixed:** the whole app was computing "today" via
  `Date.toISOString()` (UTC-based) in several places (`todayISODate`,
  `composeOccurredAt`, `lastNDays`, insights' `rangeParams`) while the seed
  data used local-date strings — for part of every day (timezone-dependent),
  a live write would land on a different calendar-date bucket than the
  Dashboard/Today were reading. Fixed by standardizing everything to local
  calendar-date construction (`getFullYear()/getMonth()/getDate()`, no
  `toISOString()`) across handlers.ts, use-today-logs.ts, dashboard.tsx, and
  insights.tsx.

**Dashboard**: replaced the fixed 14-day window with a shared `RangePicker`
(30d / 60d / custom, bounded to the mock's actual 60-day window — see
`src/lib/date-range.ts`). X-axis tick spacing and `LastMealChart`'s tick
marks now scale to the actual day count shown rather than assuming a fixed
window. `VibeChart` reads raw Mood logs directly (same math as Today's bar)
instead of the separately-derived, bucketed `daily_vibe` rows — one source
of truth instead of two that could drift. Tooltip backgrounds are
semi-transparent so the chart shape stays visible under the cursor.

**Insights tab — real Anthropic integration, not canned:**
- `POST /insights/generate` calls the real Anthropic Messages API
  (`claude-sonnet-4-6`) with **forced tool-use** — a `return_insights` tool
  with a strict JSON schema (2–5 insights, each with title/body/confidence/
  confidence_reason/entity_ids) and `tool_choice: {type:"tool", name:
  "return_insights"}`. This was validated by hand via curl before wiring it
  in (see chat history) — free-text "return only JSON" prompting reliably
  leaked stray prose outside the array; forced tool-use doesn't.
  `max_tokens: 4000` (1500 silently truncated a 5-insight response —
  `stop_reason: "max_tokens"` with an empty `tool_use.input`).
- Two-phase UX: `POST /insights/prompt` is fast/local (just the sketch
  math + prompt text, no network) and types into the UI immediately;
  `POST /insights/generate` is the slow real call (~20–35s) and shows a
  bouncing-dots + rotating-status-text indicator meanwhile. The gray preview
  box shows the *actual* full prompt plus a readable dump of the forced tool
  schema, so the demo can show what's really being sent.
- `POST /chat` ("Ask me") is also a real Anthropic call now — same sketch
  dump, but the tail is the user's question instead of the tool-forced
  insight instructions, and it's a plain-text reply (no tool schema). It is
  **stateless per-question** — no conversation history is sent; a follow-up
  referencing a prior answer will not work. Known, not built.
- Two seed insights are pre-generated real output from **Gemini** (pasted
  in by the user from an external run), tagged
  `generated_by: "Gemini (external, pre-generated)"`, spanning the full
  60-day window, dated ~20h in the past so they sort below anything freshly
  generated. The old 3 hardcoded/canned "arc" insights are gone entirely —
  replaced by the real call.

**Key handling (demo-only, explicitly temporary):** the API key lives in
`apps/web/.env.local` (gitignored, one line:
`VITE_ANTHROPIC_API_KEY=sk-ant-...`), read via `import.meta.env` from
`src/lib/anthropic.ts` and inlined directly in `src/mocks/handlers.ts` for
the chat call. Calls go straight from the browser to
`api.anthropic.com` using the `anthropic-dangerous-direct-browser-access:
true` header. **This directly violates the documented "LLM calls:
backend-side only" architecture principle** (README_top_level.md) — it's a
deliberate, acknowledged shortcut so the demo can show real reasoning before
the real backend exists. When Feature 005 (on-demand insights) is actually
built, this whole mechanism moves server-side and the key stops living in
the browser bundle.

**New files** (not yet reflected in `code_base.rtf`):
- `src/lib/vibe.ts` — shared Mood/vibe constants, colors, and the
  tap-count→level mapping (`tapCountToLevel`: 0→none, 1→sometimes,
  2-3→often, 4+→alot). Centralized after the level-bucketing logic was
  found duplicated (and drifting) between `handlers.ts` and `dashboard.tsx`.
- `src/lib/date-range.ts` — local-date math shared by the Dashboard/Insights
  range pickers (`localISODate`, `presetRange`, `daysBetween`,
  `availableBounds`/`clampToAvailable` for the custom-range bound).
- `src/lib/anthropic.ts` — the real Anthropic client: tool schema, prompt
  instructions, error handling, entity-id normalization
  (`normalizeEntityId`: maps free-text labels like "Sleep (h)" or "last
  meal" to canonical ids like `sleep`/`last_meal` for consistent chip
  rendering across live-model and Gemini-sourced insights).
- `apps/web/.env.local` — gitignored, holds the Anthropic key. Not in the
  zip bundles handed over during the session (Vite needs it at the project
  root, not inside `src/`) — was delivered separately as a template.

## Deferred / open (not blocking, just not built)

- **Chat has no multi-turn memory.** Each question is a fresh, stateless
  call — the visible transcript is local UI only, never sent back. Fix is
  straightforward (send the growing `messages` array instead of one string)
  but wasn't asked for this session.
- **Entity-id normalization is heuristic** (`normalizeEntityId`'s
  keyword-substring matching) — fine for a demo with a small, known entity
  set; a real implementation would key off the actual entity schema.
- **The prompt/generate two-call split is a demo-only UX device** — it
  exists so the prompt preview can type instantly while the slow real call
  runs in the background. A real backend implementation would likely do
  this in one call, or via streaming, not two separate endpoints.
- A one-page project overview PDF was generated (`stride_overview.pdf`,
  landscape, matches the app's calm paper/ink/teal palette) for a 1–2 min
  spoken demo intro. Not part of the codebase — a standalone deliverable.

## Resuming from here

Two independent threads, pick based on what's next:

1. **Backend Spec Kit track** (original plan) — Feature 002
   (outcome-tracking) is next per `features.txt`, using the four
   test/runtime-divergence lessons from `HANDOFF_001`. Nothing here changes
   that plan or its prerequisites.
2. **Mock/demo polish track** — multi-turn chat memory, moving the real LLM
   call server-side once a backend exists (retiring the browser-key
   shortcut), or tightening entity-id normalization.

If picking back up after a long pause: skim this doc plus the "Mock demo
hardening" section in `PROJECT_OVERVIEW.md` (see suggested addition from
this session) before touching code — several of the fixes here (timezone
handling, the shared `lib/vibe.ts`/`lib/date-range.ts` modules) are easy to
accidentally re-break by editing one file without the others.
