# Handoff — 001 Input Logging

**Status:** Complete. `tasks.md` T001–T033 all `[X]`; `uv run pytest` → 18/18 green;
OpenAPI contract emitted to `packages/api-contract/openapi.json`. Verified live by
hand (full write→read→delete cycle) in addition to the suite.

## What shipped

The canonical vertical slice — "log an input and see it reflected" — proving auth
scoping + persistence + the API contract end to end. No LLM, no outcomes.

**Endpoints** (all `user_id`-scoped from the `get_current_user` seam, never the body):

- `POST   /inputs/{input_id}/logs` → 201, returns created log incl. generated uuid;
  `logged_at` server-stamped (client value ignored); `occurred_at` required (422 if absent).
- `GET    /inputs/{input_id}/logs?range=Nd` → 200, list of logs in the relative
  window; empty range returns `[]`, not an error.
- `DELETE /inputs/{input_id}/logs/{log_id}` → 204; hard delete; non-idempotent
  (repeat → 404).
- Nonexistent and cross-user targets return **identical 404s** across all three
  (existence not revealed across users).

**Schema:** `users`, `inputs`, `input_logs`, `captures` (stub). `input_logs` carries
uuid PK, `user_id` FK, `input_id` FK, `value` (single nullable numeric — the sketchable
field), `attributes` (nullable JSONB — enum labels + per-entity extras), `occurred_at`
(client-supplied, required), `logged_at` (server-stamped). Alembic migration applied.

**Identity seam:** `get_current_user` returns a `CurrentUser` object (`user_id`, plus
`email`/`google_sub` slots), NOT a bare UUID — so 003's real OAuth is a stub-body swap,
not a signature change. Constitution I holds while auth is stubbed.

**Test isolation:** suite runs against a dedicated `stride_test` DB (auto-created +
migrated per session), separate from the `stride` dev DB. Manual live-server seeding no
longer collides with fixtures.

## Lessons — test/runtime divergence (read before 002+)

The through-line: **a green suite proves the code satisfies the tests, not that the app
runs.** Four real bugs this feature passed tests while carrying; all caught by hand.

1. **Missing commit (invisible to rollback tests).** `create_log` flushed but never
   committed; POST returned a valid 201 while nothing persisted. The per-test rollback
   fixture *structurally cannot* catch this. Fixed by committing at the `get_db` request
   boundary (tests keep rollback). → **Always hand-verify persistence across operations.**

2. **Model registration divergence.** App imported `InputLog` without `User`, so the FK
   target wasn't on `Base.metadata` at runtime → `NoReferencedTableError` on live flush.
   Tests hid it because conftest imported all four models. Fixed via `app/models/__init__.py`
   importing all models, imported by `app/main.py` at startup.

3. **Shared dependency-override closure (a green that proved nothing).** Both test clients
   shared one `dependency_overrides[get_current_user]` closure, silently authenticating
   both as the same user — so cross-user isolation tests passed *without testing isolation*.
   Fixed with per-client header-driven identity. **SC-002/SC-003 were decorative until this.**

4. **Route-absence 404s (TDD artifact).** "Expect 404" tests trivially pass when the route
   doesn't exist yet (absence also yields 404), so red can't distinguish missing-route from
   working-ownership-logic. The real proof is those tests staying green *with the route
   present and rejecting via ownership logic*.

## Deferred / open (not blocking 001)

- **Seed-on-signup:** inputs are per-user rows (each user owns their own Sleep/Weight,
  etc.). 001 has no input-creation endpoint — rows were hand-seeded. A new user gets the
  starter health set by copying seed inputs into their `inputs` rows at creation. Not built.
- **Frontend must resolve name→id from live `GET /inputs`** (uuids differ per user; never
  hardcode an input uuid). Mock already does this.
- **`occurred_at` timezone:** seed timestamps are local-time (no trailing `Z`); range
  cutoffs computed consistently on both sides to avoid UTC drift. Revisit when real tz
  handling lands.

## Next

- **002-outcome-tracking:** same vertical for outcomes (Weight, Mood) + `outcome_logs` as
  a second table (real FK to `outcomes`; union `/logs?type=` assembled at read time). Real
  trend series replaces seeded mock data on the Dashboard. Still stubbed auth, no LLM.
