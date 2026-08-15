# Stride — web

The showcase client. **Vite + React + TypeScript + TanStack Router + MSW +
Tailwind v4 + Recharts.** All fetches are client-side and mocked by MSW in dev,
so the app runs with no backend. The mock's shape *is* the target API contract —
going live is a base-URL change, not a rewrite.

## Run it

```bash
cd apps/web
pnpm install
pnpm approve-builds                 # approve esbuild + msw if prompted
pnpm dlx msw init public/ --save    # once — generates public/mockServiceWorker.js
pnpm dev                            # → http://localhost:5173
```

Console should log MSW `Mocking enabled`. If not, the `msw init` step didn't
run — the worker file must live in `public/`.

## Why this stack

- **TanStack Router, not Start.** Nothing needs SSR. The Router alone is
  browser-only file-based routing; Start would add a Node server layer (and an
  MSW footgun, since the browser worker only intercepts in-tab fetches). Upgrade
  to Start is additive, triggered only by a real SSR need.
- **MSW client-side only.** Every fetch runs in the tab (in `useEffect`/handlers,
  never in a loader), so the browser worker reliably intercepts it.
- **`src/lib/api.ts` is the only network-aware file** — the seam to the live
  backend.

## Model the UI speaks

Two kinds of tracked thing, both user-definable later:

- **inputs** — things you do or control: Focussed Breathing, Stretches, Walking,
  Sleep, Last meal, Water intake. `daily_vibe` is an input shown **disabled**,
  previewing the end-of-day summary path.
- **outcomes** — things observed: Weight, Mood.

Every log carries `occurred_at` (when it happened = page-date + a time) and
`logged_at` (server write time). Time is optional for most entries and
**compulsory** for Sleep (worded "Bed time") and Last meal. Unset time defaults
to now on today, noon when backfilling a past date.

### Seed entities (in `src/mocks/handlers.ts`)

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

- `name` + `description` are first-class on every definition (the agent reasons
  over descriptions).
- **Sleep is repeatable** (naps / split sleep): value = hours, quality in
  attributes, bed time = `occurred_at`.
- **Breathing / stretches** are binary in the UI but always store
  `duration_min: 5`.
- **Water** is one entity: quick-add buttons (4/8/16/24 oz) and a free-flow
  total both append here; the day total is a read-time sum.
- **Mood** is one-tap "now" logging (Energized, Focused, Calm, Tired, Stressed,
  Meh); density of taps is collated later — the user does not hand-enter
  frequency. **Daily vibe** is the same labels with Sometimes/Often/Most, shown
  disabled to preview the summary path (a distinct entity, not built).

## Tabs

- **Today (`/`)** — date header ("Logs for the day <date>"); checklist,
  Sleep, Last meal, Water, Weight, one-tap Mood, disabled Daily-vibe preview,
  and a "Notes for the day" card (recording controls by default, toggle to a
  textarea that posts to `/captures`). Neutral framing throughout.
- **Dashboard (`/dashboard`)** — 14-day Recharts trends. The mock returns **raw
  logs**; the UI summarizes them client-side (this is the demo end-state).
  Outcomes row (Weight line + greyed-but-live Daily vibe), then inputs (sleep
  hours, bed time, water/day, last-meal time as a bubble sized by heaviness,
  breathing/stretches binary, walking minutes).
- **Insights (`/insights`)** — the nightly insight cards plus an "Ask me" chat
  posting to a mocked `/insights/ask`.
- **Wall (`/wall`)** — bookmarks (local state; no API yet).

## Mocked contract (resource-oriented, time-series)

```
GET    /api/inputs                       input definitions
GET    /api/outcomes                     outcome definitions
GET    /api/logs?type=input|outcome      union read (&date= &range=)
GET    /api/inputs/{id}/logs?range=30d   one input's series
POST   /api/inputs/{id}/logs             append { value?, occurred_at?, attributes? }
DELETE /api/inputs/{id}/logs/{logId}     remove (checklist untoggle)
GET    /api/outcomes/{id}/logs
POST   /api/outcomes/{id}/logs
GET    /api/insights                     cross-entity agent output (read-only)
POST   /api/insights/ask                 mocked "Ask me" reply
POST   /api/captures                     { raw_text, source } note/voice proxy
```

`?type=` is the filter on the single `/logs` collection — there is no
`/input_logs` endpoint. Mock state is in-memory with ~14 days of seeded history
so the Dashboard has something to chart; a write then re-read reflects the
change, but a full page reload resets to seed (intentional).

## Structure

```
apps/web/
├── index.html
├── vite.config.ts        TanStackRouterVite() + react() + tailwindcss()
├── package.json          pnpm; pinned deps
└── src/
    ├── main.tsx          starts MSW in dev, then renders RouterProvider
    ├── index.css         Tailwind import + @theme tokens (calm paper/ink/teal)
    ├── routeTree.gen.ts  regenerated by the router plugin on first dev run
    ├── routes/           __root (nav) · index (Today) · dashboard · insights · wall
    ├── components/ui.tsx  Card, SectionLabel, FieldLabel, input styles
    ├── lib/              api.ts (the only network file) · use-today-logs.ts
    └── mocks/            handlers.ts (contract + seed) · browser.ts
```

## The seam to the live backend

`src/lib/api.ts` owns every fetch. Going live = stop starting the worker
(already dev-only in `main.tsx`) and point the base URL at the real API.
Components and endpoints don't change — the mock predicts the contract the
generated FastAPI backend will emit.
