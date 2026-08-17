# API Contract (design reference): Input Logs

This document is a **design-time reference** for the tasks/implementation
phases. It is not the authoritative contract — per Constitution "Additional
Constraints: Contract," FastAPI auto-emits the real OpenAPI document to
`packages/api-contract` from the implemented routes; nothing here is
hand-authored into that package.

All three endpoints require a valid identity resolved via the
`get_current_user` dependency. There is no unauthenticated path.

## `POST /inputs/{id}/logs`

Create a log against the current user's input `{id}`.

**Path params**: `id` (UUID) — the input to log against.

**Request body**:

```json
{
  "value": 7.0,
  "attributes": { "quality": 4 },
  "occurred_at": "2026-08-16T07:30:00Z"
}
```

- `value`: number, optional.
- `attributes`: object, optional, arbitrary JSON-serializable shape.
- `occurred_at`: ISO-8601 timestamp with timezone, **required**.
- `logged_at` MUST NOT be accepted from the client — if present in the body
  it is ignored, never used as the stored write time.

**Responses**:

| Status | When | Body |
|---|---|---|
| 201 | Log created | The created log, including its generated `id`, `input_id`, `value`, `attributes`, `occurred_at`, `logged_at`. |
| 404 | `id` does not exist, or exists but belongs to another user | No body detail distinguishing the two cases. |
| 422 | `occurred_at` missing or malformed | Standard validation error. |

## `GET /inputs/{id}/logs?range=`

Read the current user's log history for input `{id}`, filtered to a
relative range.

**Path params**: `id` (UUID).

**Query params**: `range` — relative window, e.g. `7d`, `30d`. Filters on
`occurred_at`.

**Responses**:

| Status | When | Body |
|---|---|---|
| 200 | Always (including zero matches) | A list of logs (each with `id`, `value`, `attributes`, `occurred_at`, `logged_at`) whose `occurred_at` falls within the requested range. Empty list if none match — never an error. |
| 404 | `id` does not exist, or exists but belongs to another user | Same uniform 404 as create. |

## `DELETE /inputs/{id}/logs/{log_id}`

Hard-delete a single log.

**Path params**: `id` (UUID, the input), `log_id` (UUID, the log).

**Responses**:

| Status | When | Body |
|---|---|---|
| 204 | Log deleted | Empty. |
| 404 | `log_id` does not exist, belongs to another user, or does not belong to input `id` | Same uniform 404 as create/read. Includes the case of deleting an already-deleted log — delete is not idempotent-success on a repeat call. |

## Cross-cutting rules (apply to all three)

- `user_id` is never read from the request body or query string on any of
  these endpoints — it comes only from `get_current_user`.
- A 404 from any of these endpoints never distinguishes "doesn't exist" from
  "belongs to someone else" in status code, body, or headers.
- No endpoint in this contract performs LLM reasoning, insight generation,
  or outcome logging — out of scope for this feature (spec FR-013).
</content>
