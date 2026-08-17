# Quickstart: Input Logging

Validates the write-read-delete spine end to end once implemented. This is
a run guide, not implementation code — see [data-model.md](./data-model.md)
for schema and [contracts/input-logs-api.md](./contracts/input-logs-api.md)
for exact request/response shapes.

## Prerequisites

- Docker running locally.
- Backend dependencies installed (`pyproject.toml`, once implementation
  exists).
- `docker-compose up -d` from `backend/` to start Postgres.
- Alembic migrations applied (`alembic upgrade head`) so `users`, `inputs`,
  `input_logs`, and `captures` exist.
- A seeded user and at least one seeded input owned by that user (fixture
  data — this feature does not include input-creation endpoints).

## Run the service

```bash
cd backend
uvicorn app.main:app --reload
```

## Validation scenarios

Each scenario below maps to an acceptance scenario in
[spec.md](./spec.md). Requests assume the stubbed `get_current_user`
dependency resolves to a fixed seeded user for local/manual testing.

### 1. Log a value against an input (Story 1)

```bash
curl -X POST http://localhost:8000/inputs/<INPUT_ID>/logs \
  -H "Content-Type: application/json" \
  -d '{"value": 7.0, "attributes": {"quality": 4}, "occurred_at": "2026-08-16T07:30:00Z"}'
```

**Expect**: `201`, response body includes a generated `id` and the fields
submitted. `logged_at` in the response is a server timestamp near "now,"
not anything the client sent.

**Also check**: same request with no `value`/`attributes` still returns
`201`. Same request with `occurred_at` omitted returns `422`. Same request
against a random/nonexistent `INPUT_ID`, or an input owned by a different
seeded user, returns `404`.

### 2. Read the log history for a range (Story 2)

```bash
curl "http://localhost:8000/inputs/<INPUT_ID>/logs?range=7d"
```

**Expect**: `200`, a list including the log created in Scenario 1 (its
`occurred_at` is within the last 7 days), each entry carrying its `id`.

**Also check**: `range=30d` still includes it; a range guaranteed not to
include it (e.g. querying a window far in the past relative to seeded data)
returns `200` with an empty list, not an error. Reading another user's
input's logs returns `404`.

### 3. Delete a log (Story 3)

```bash
curl -X DELETE http://localhost:8000/inputs/<INPUT_ID>/logs/<LOG_ID>
```

**Expect**: `204`. A follow-up `GET .../logs?range=30d` no longer includes
`<LOG_ID>`.

**Also check**: deleting the same `<LOG_ID>` again returns `404` (not a
second `204`). Deleting a `log_id` that belongs to another user's log
returns the same `404`.

## Success criteria check

Confirms spec.md's Measurable Outcomes:

- **SC-001**: Scenario 1 → Scenario 2 round-trip succeeds on the first
  attempt.
- **SC-002**: Every cross-user variant in Scenarios 1–3 returns `404`, never
  another user's data.
- **SC-003**: Nonexistent and cross-user targets are indistinguishable in
  the `404` response across all three endpoints.
- **SC-004**: The deleted log is absent from every subsequent read.
</content>
