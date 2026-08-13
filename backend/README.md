# backend

The Stride API — **Python + FastAPI + Postgres**. This is the only tier that
touches the database or calls the LLM. Every client is an HTTP consumer of it.

## Responsibilities

- **Auth**: verify Google identity, mint and validate our own session JWTs,
  extract `user_id` from the token on every request.
- **Data**: all rows `user_id`-scoped. Never trust a `user_id` from the request
  body — it comes from the verified token only.
- **Capture separation**: raw user input (typed description, later a voice
  transcript) is stored immutable in `captures`; the LLM-derived structured
  rows link back via `capture_id`. Enables audit, reprocessing, and
  confirm-before-commit.
- **Compute vs. interpret**: aggregation/correlation in SQL; the LLM interprets
  results, never computes them.
- **Contract**: exports OpenAPI to `packages/api-contract` for clients.

## Data model (first cut)

- `users` — identity (Google sub, email), our internal `user_id`.
- `habits` — `id, user_id, name, ...` (things deliberately done).
- `outcomes` — `id, user_id, name, ...` (things observed).
- `habit_logs` — `id, user_id, habit_id, logged_at, value, capture_id?`.
- `outcome_logs` — `id, user_id, outcome_id, logged_at, value, capture_id?`.
- `captures` — `id, user_id, raw_text, source, status, created_at`
  (immutable raw input; `status` tracks parse/confirm lifecycle).

Health labels are **seed data** over these neutral tables, not schema.

## Spec-driven development (GitHub Spec Kit)

This service is built spec-first. **Spec Kit is rooted here** (`backend/`), so
its constitution and specs govern the API tier; the web/iOS clients and the
API-contract package sit outside that loop.

Run once, inside this directory:

```
uv tool install specify-cli
specify init . --integration claude   # or your agent of choice
```

This generates Spec Kit's own files (`specify/memory/constitution.md`, command
files, `specs/`). **Do not hand-create those** — `init` owns them.

Workflow (each phase produces a reviewed artifact):

```
/speckit.constitution   → constitution.md   (project principles)
/speckit.specify        → spec.md           (behavior + acceptance criteria)
/speckit.plan           → plan.md           (technical blueprint)
/speckit.tasks          → tasks.md          (ordered steps)
/speckit.implement      → code
```

### The verification gap — read this

Spec Kit **stops at implementation and does not verify the code satisfies the
spec.** That check is on us. Acceptance criteria must become real pytest tests,
authored as part of `/speckit.tasks`, and enforced **test-first**. Without that,
"regeneration" is just re-rolling dice.

## Stack

- FastAPI, Pydantic, SQLAlchemy (or SQLModel), Alembic for migrations.
- Postgres. `pgvector` later for RAG — same DB, additive.
- Hosted Whisper for transcription later — called backend-side, swappable.
