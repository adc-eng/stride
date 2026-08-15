# Stride web — run it

Vite + React + TS + TanStack Router + MSW + Tailwind v4 + Recharts. All fetches
are client-side and mocked by MSW in dev.

## First run

```bash
cd apps/web
pnpm install
pnpm approve-builds                 # approve esbuild + msw if prompted
pnpm dlx msw init public/ --save    # generates public/mockServiceWorker.js
pnpm dev                            # → http://localhost:5173
```

Console should log MSW `Mocking enabled`. If not, the `msw init` step didn't
run — the worker file must live in `public/`.

## Model

Two kinds of tracked thing, both user-definable later:

- **inputs** — things you do or control (breathing, stretches, walking, sleep,
  last meal, water intake). `daily_vibe` is an input shown disabled, previewing
  the end-of-day summary path.
- **outcomes** — things observed (weight, mood).

Every log carries `occurred_at` (when it happened = page-date + a time) and
`logged_at` (server write time). Time is optional for most entries and
compulsory for Sleep (worded "Bed time") and Last meal. Unset time defaults to
now on today, noon when backfilling a past date.

## Tabs

- **Today (`/`)** — checklist, sleep, last meal, water, weight, one-tap mood,
  disabled daily-vibe preview, and a "Notes for the day" card (record controls
  by default, toggle to a textarea posting to `/captures`).
- **Dashboard (`/dashboard`)** — 14-day Recharts trends; the mock returns raw
  logs and the UI summarizes them client-side.
- **Insights (`/insights`)** — nightly insight cards + an "Ask me" chat.
- **Wall (`/wall`)** — bookmarks (local state; no API yet).

## Endpoints (mocked in `src/mocks/handlers.ts`)

```
GET    /api/inputs                       input definitions
GET    /api/outcomes                     outcome definitions
GET    /api/logs?type=input|outcome      union read (supports &date= &range=)
GET    /api/inputs/{id}/logs?range=30d   one input's series
POST   /api/inputs/{id}/logs             append { value?, occurred_at?, attributes? }
DELETE /api/inputs/{id}/logs/{logId}     remove (checklist untoggle)
GET    /api/outcomes/{id}/logs           one outcome's series
POST   /api/outcomes/{id}/logs           append
GET    /api/insights                     cross-entity nightly agent output (read-only)
POST   /api/insights/ask                 mocked "Ask me" reply
POST   /api/captures                     { raw_text, source } raw note/voice proxy
```

State is in-memory with ~14 days of seeded history across all entities so the
Dashboard has something to chart. A write then re-read reflects the change; a
full page reload resets to seed. Intentional for a mock.

## The seam

`src/lib/api.ts` is the only file that knows the network. Going live = stop the
worker (already dev-only in `main.tsx`) and point `BASE` at the real API.
Components and endpoints don't change — the mock's shape *is* the target
contract.
