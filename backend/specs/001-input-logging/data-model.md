# Phase 1 Data Model: Input Logging

Four tables are created by this feature's migrations. Only `input_logs` is
read/written by this feature's endpoints; `users`, `inputs`, and `captures`
exist as their necessary foundation/stub (per Constitution Principles I and
II) but are not themselves exercised by new endpoints here.

## `users`

Minimal shape needed for `input_logs.user_id` to have a real FK target and
for the `get_current_user` seam to resolve to a row.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | Internal `user_id` — the identity shape `get_current_user` returns now and the real verifier will return later. |
| `google_sub` | text | nullable, unique | Populated when real Google auth lands (feature 003). Nullable now since auth is stubbed. |
| `email` | text | nullable | Same as above. |
| `created_at` | timestamptz | not null, server default now() | |

## `inputs`

Pre-existing definitions this feature logs against. Full input CRUD is out
of scope (spec.md Assumptions) — this feature only needs enough of the
table to have a valid FK target and to test ownership/rejection paths, so a
minimal seed set is created via migration/fixture, not via new endpoints.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `user_id` | UUID | FK → `users.id`, not null | Owning user. |
| `name` | text | not null | e.g. "Focussed Breathing", "Sleep". |
| `description` | text | nullable | First-class per project README; not exercised by this feature's logic. |
| `created_at` | timestamptz | not null, server default now() | |

## `input_logs`

The entity this feature's three endpoints create, read, and delete.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, generated at write time | Stable identifier returned in the create response and used for delete. |
| `user_id` | UUID | FK → `users.id`, not null | Always taken from `get_current_user`, never from the request body (Constitution Principle I; spec FR-001). |
| `input_id` | UUID | FK → `inputs.id`, not null | The input this log is recorded against. |
| `value` | numeric | nullable | Single clean numeric field. Booleans encode as `1`/`null`. Enums never stored here — see `attributes`. |
| `attributes` | JSONB | nullable | Categorical/extensional data: enum labels (e.g. `level`), per-entity extras (sleep `quality`, walk `distance_miles`/`duration_min`, meal `description`). |
| `occurred_at` | timestamptz | not null | When it happened. Always client-supplied — the backend never guesses it (spec FR-004). |
| `logged_at` | timestamptz | not null, server-stamped | Write time. Any client-supplied value is ignored (spec FR-005). |

**Foreign keys**: `input_logs.user_id → users.id`, `input_logs.input_id →
inputs.id`. Both enforced at the database level (real FKs, not an
application-level type tag), per the research.md decision to avoid a
polymorphic logs table.

**Validation rules** (enforced in the service layer, backed by the FKs
above):

- A log MUST NOT be created against an `input_id` that doesn't exist, or
  that exists but whose `user_id` doesn't match the requesting user
  (spec FR-007). Both cases are treated identically by the API (404).
- `occurred_at` is required on create; there is no server-side default or
  inference (spec FR-004).
- `logged_at` is always set server-side at write time; any client-supplied
  value in the request body is ignored, not merely overridden after
  validation (spec FR-005).
- Delete MUST NOT succeed against a `log_id` that doesn't exist, or exists
  but whose `user_id` (via its `input_id`'s owning input) doesn't match the
  requesting user (spec FR-011). Both cases return the same 404.
- Delete is permanent — no `deleted_at`/tombstone column, no recovery path
  through this feature (spec FR-012).

**State**: `input_logs` rows have no lifecycle/state machine — they exist
from creation until hard-deleted. No update/edit endpoint is in scope for
this feature.

## `captures` (stub table, not exercised by this feature)

Created now so Constitution Principle II's raw-capture/structured-log
separation has a real table to link to once capture-producing features
(voice input, LLM-derived proposals) land. No endpoint in this feature
reads or writes it.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `user_id` | UUID | FK → `users.id`, not null | |
| `raw_text` | text | nullable | Populated by later features. |
| `source` | text | nullable | e.g. "voice", "typed" — populated by later features. |
| `status` | text | nullable | Parse/confirm lifecycle — populated by later features. |
| `created_at` | timestamptz | not null, server default now() | |

`input_logs` does not yet have a `capture_id` column — deferred until a
feature actually produces captures to link, to avoid an unused nullable FK
sitting in the schema ahead of need.

## Entity relationship summary

```text
users (1) ──< (many) inputs
users (1) ──< (many) input_logs
inputs (1) ──< (many) input_logs
users (1) ──< (many) captures   [stub, unlinked this feature]
```
</content>
