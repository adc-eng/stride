# backend

The Stride API — **Python + FastAPI + Postgres**. This is the only tier that
touches the database or calls the LLM. Every client is an HTTP consumer of it.

## Responsibilities

- **Auth**: verify Google identity (Authorization Code + PKCE; backend is the
  confidential OAuth client), mint and validate our own session JWTs, extract
  `user_id` from the token on every request.
- **Data**: all rows `user_id`-scoped. Never trust a `user_id` from the request
  body — it comes from the verified token only.
- **Capture separation**: raw user input (typed description, later a voice
  transcript) is stored immutable in `captures`; LLM-derived structured rows
  link back via `capture_id`. Enables audit, reprocessing, and
  confirm-before-commit.
- **Sketches vs. reasoning**: SQL produces **statistical sketches** (count/n,
  mean, median, sd, min/max with timestamps, recent-window trend, completion
  rate, last-logged). The LLM **reasons** over sketches + descriptions; it never
  does arithmetic on raw rows. This *scopes* the old "compute-in-SQL" rule — the
  guardrail is now "ground every claim in a provided sketch, quote the numbers,
  label correlation/hypothesis, never causation."
- **Contract**: FastAPI auto-emits OpenAPI to `packages/api-contract` for
  clients. The backend is the producer; clients codegen from it.

## Terminology

**inputs / outcomes** (not "habits"). An *input* covers both deliberate acts
(stretching) and logged facts you control (last-meal time). *Outcomes* are
observed results (weight, mood). Log entries are "logs" / `log_id` to match the
schema vocabulary.

## Data model (first cut)

- `users` — Google sub, email, internal `user_id`.
- `inputs` — `id, user_id, name, description, type, unit, ...`.
- `outcomes` — `id, user_id, name, description, type, unit, ...`
  (type includes boolean, numeric, time-of-day, enum, **image**).
- `input_logs` — `id, user_id, input_id, occurred_at, logged_at, value, attributes?, capture_id?`.
- `outcome_logs` — `id, user_id, outcome_id, occurred_at, logged_at, value, attributes?, capture_id?`
  (for image outcomes, `value` is an object-storage reference).
- `captures` — `id, user_id, raw_text, source, status, created_at`
  (immutable raw input; `status` tracks the parse/confirm lifecycle).
- `insights` (roadmap) — nightly cross-entity agent output, its own lifecycle.

Notes: `description` is **first-class** (the agent reasons over it). Every log
carries both `occurred_at` (when it happened) and `logged_at` (server write
time), enabling backfill of past days. `value` is the single field SQL sketches
over; `attributes` (JSON) is the extensibility sidecar (e.g. sleep
`value`=hours, `attributes.quality`=1–5). Health labels are **seed data** over
these neutral tables, not schema.

## Target API (resource-oriented, time-series)

The MSW mock in `apps/web` already serves this shape — it is the contract the
generated backend must emit.

```
GET  /inputs                     · POST /inputs               · GET /inputs/{id}
GET  /outcomes                   · POST /outcomes             · GET /outcomes/{id}
POST /inputs/{id}/logs           { value?, occurred_at?, attributes? }
GET  /inputs/{id}/logs?range=30d
DELETE /inputs/{id}/logs/{log_id}
POST /outcomes/{id}/logs         · GET /outcomes/{id}/logs?range=…
GET  /logs?type=input|outcome    union read (&date= &range=); no /input_logs endpoint
GET  /inputs/{id}/stats?range=30d   SQL-computed sketch (the agent's input) — planned
GET  /insights                   cross-entity nightly agent output (read-only in mock)
POST /captures                   { raw_text, source } → immutable raw row
```

`user_id` is always taken from the token, never the body. Image outcomes upload
direct-to-S3 via a backend-issued pre-signed URL; the log stores the object key.

## The nightly agent (design, not built)

Per night, for each input and outcome: a JSON object with its **description** +
a **statistical sketch** (computed in SQL — no raw row dumps). The LLM is asked
to *reason* about likely cross-relationships from its world-knowledge and these
numbers, and return the top N insights plus proposals for what to track next.

Hard guardrails belong in the agent's system prompt: ground every claim in a
sketch and quote the numbers; label hypothesis/correlation, never causation;
flag sparse data as inconclusive; **observe-don't-pressure applies to
suggestions too** (never propose restriction-gamification); **confirm-before-
commit** on both LLM-inferred entries and agent track proposals. Batch (nightly)
and interactive (the "Ask me" chat) share trigger-agnostic service functions.

## The canonical vertical slice

**"Log an input and see it reflected."** Auth + `user_id` scoping + the API/DB
contract + read-back is the spine every later feature hangs off: `users`,
`inputs`, `input_logs` (+ `captures` stubbed), `POST /inputs/{id}/logs`,
`GET /inputs/{id}/logs?range=7d`. The frontend is already built against the
matching mock, so this slice just makes it real.

## Spec-driven development (GitHub Spec Kit)

Built spec-first. **Spec Kit is rooted here** (`backend/`), so its constitution
and specs govern the API tier; the web/iOS clients and the api-contract package
sit outside that loop.

Run once, inside this directory:

```
uv tool install specify-cli
specify init . --integration claude   # or your agent of choice
```

`init` generates Spec Kit's own files (`specify/memory/constitution.md`, command
files, `specs/`). **Do not hand-create those.** Workflow, each phase producing a
reviewed artifact:

```
/speckit.constitution   → constitution.md   (project principles)
/speckit.specify        → spec.md           (behavior + acceptance criteria)
/speckit.plan           → plan.md           (technical blueprint)
/speckit.tasks          → tasks.md          (ordered steps)
/speckit.implement      → code
```

> Command names/flags have shifted between Spec Kit releases — verify the
> current CLI before relying on the exact invocations above.

### Constitution — at minimum
`user_id` always from the verified token; raw-capture/structured-log
separation; **sketches-in-SQL / reasoning-in-LLM**; **no auto-commit** of
LLM-inferred entries *or* agent track proposals without user confirmation;
**observe-don't-pressure as a hard agent constraint**; test-first gate; OpenAPI
published to `packages/api-contract`; no AWS SDKs in core logic.

### The verification gap — read this
Spec Kit **stops at implementation and does not verify the code satisfies the
spec.** That check is on us. Acceptance criteria must become real pytest tests,
authored as part of `/speckit.tasks`, enforced **test-first**. Without that,
"regeneration" is just re-rolling dice. When behavior and spec diverge, fix the
spec and regenerate — don't hand-patch and let it drift.

## Stack

- FastAPI, Pydantic, SQLAlchemy (or SQLModel), Alembic for migrations.
- Postgres in **Docker** (`docker-compose.yml` ships with the backend scaffold),
  not Homebrew — clean, reproducible, mirrors prod.
- `pgvector` later for RAG — same DB, additive, behind a service interface.
- Hosted Whisper for transcription later — called backend-side, swappable.
