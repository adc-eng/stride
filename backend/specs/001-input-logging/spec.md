# Feature Specification: Input Logging

**Feature Branch**: `001-input-logging`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "Feature: input logging — the canonical vertical slice. An authenticated user logs a value against one of their existing inputs (e.g. marks Focussed Breathing done, records 7 hours of Sleep), reads that input's log history back over a date range, and can delete an individual log. This is the write-read-delete spine: it must prove auth scoping, persistence, and the API contract end to end. Identity comes only from the verified session token (stubbed for now via a get_current_user seam returning an internal user_id); a user_id in the request body is never trusted. Every write, read, and delete is scoped to the current user. Logging appends a log to an existing input. Each log gets its own stable id (uuid) at write time and carries: an optional value, optional attributes (JSON), a required occurred_at (when it happened — always supplied by the client; the backend never guesses it), and a server-stamped logged_at (write time; clients never send it). The POST returns the created log including its id. Reading returns that input's logs filtered to a requested range (e.g. 7d, 30d), for the current user only, each log carrying its id. Deleting removes a single log by its id (DELETE /inputs/{id}/logs/{log_id}), scoped to the current user. Deleting a log that doesn't exist or belongs to another user returns 404 (existence is not revealed across users). Delete is hard — the immutable audit trail lives in captures, not input_logs. Logging against an input that doesn't exist, or another user's input, is rejected. No LLM, no insight generation, no outcomes — those are later features. The frontend is already built against a mock of exactly this contract."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Log a value against an input (Priority: P1)

An authenticated user records that something happened for one of their existing
inputs — marking Focussed Breathing done, or recording 7 hours of Sleep — and
the system stores it as a new, uniquely identified log entry tied to them and
to that input.

**Why this priority**: This is the write half of the canonical slice. Nothing
else in the feature (or in the product) is reachable without a durable,
correctly-scoped write, and it is the first proof that auth scoping and
persistence work end to end.

**Independent Test**: Can be fully tested by authenticating as a user, posting
a log against one of that user's own inputs, and confirming the response
contains a created log with a stable identifier — independent of any read or
delete capability.

**Acceptance Scenarios**:

1. **Given** an authenticated user with an existing input, **When** they log a
   value with an `occurred_at` against it, **Then** a new log is created,
   assigned its own stable identifier, stamped with a server-side write time,
   and the created log (including its identifier) is returned to the caller.
2. **Given** an authenticated user with an existing input, **When** they log
   against it without supplying a value or attributes, **Then** the log is
   still created successfully (value and attributes are optional).
3. **Given** an authenticated user, **When** they attempt to log without
   supplying `occurred_at`, **Then** the request is rejected and no log is
   created.
4. **Given** an authenticated user, **When** they attempt to log against an
   input that does not exist, **Then** the request is rejected.
5. **Given** an authenticated user, **When** they attempt to log against an
   input owned by a different user, **Then** the request is rejected in the
   same way as logging against a nonexistent input (no distinction that would
   reveal the other user's input exists).

---

### User Story 2 - Read an input's log history over a date range (Priority: P2)

An authenticated user retrieves the logs recorded against one of their own
inputs, filtered to a date range they choose, so they can see their own
history reflected back.

**Why this priority**: This closes the write-read loop — "log something and
see it reflected" — which is the whole point of the canonical slice. It
depends on Story 1 existing but is independently verifiable once some logs
exist.

**Independent Test**: Can be fully tested by seeding logs for a user's input
and confirming a range-scoped read returns exactly those logs (each with its
identifier) and none belonging to other users or other inputs.

**Acceptance Scenarios**:

1. **Given** an authenticated user whose input has logs both inside and
   outside a requested date range, **When** they request that input's logs
   for the range, **Then** only the logs with an `occurred_at` inside that
   range are returned, each including its identifier.
2. **Given** an authenticated user whose input has no logs in the requested
   range, **When** they request that range, **Then** an empty result is
   returned rather than an error.
3. **Given** two users who each have logs against their own, separately-owned
   input, **When** one user requests their input's log history, **Then** the
   response never includes the other user's logs.
4. **Given** an authenticated user, **When** they request the log history for
   an input that does not exist or belongs to another user, **Then** the
   request is rejected in the same way for both cases.

---

### User Story 3 - Delete a single log (Priority: P3)

An authenticated user removes one log entry they previously recorded, by its
identifier.

**Why this priority**: Completes the write-read-delete spine. It is lower
priority than logging and reading because a working create/read loop already
proves the core contract; delete rounds out full CRUD coverage of the
scoping and persistence guarantees.

**Independent Test**: Can be fully tested by creating a log, deleting it by
its identifier, and confirming a subsequent read no longer includes it —
independent of any other feature.

**Acceptance Scenarios**:

1. **Given** an authenticated user with an existing log on one of their own
   inputs, **When** they delete it by its identifier, **Then** the log is
   permanently removed and no longer appears in subsequent reads of that
   input's history.
2. **Given** an authenticated user, **When** they attempt to delete a log
   identifier that does not exist, **Then** the request is rejected with a
   not-found response.
3. **Given** an authenticated user, **When** they attempt to delete a log
   that belongs to another user, **Then** the request is rejected with the
   same not-found response used for a nonexistent log (existence is never
   revealed across users).
4. **Given** a log has been deleted, **When** the same delete is attempted
   again, **Then** it is rejected as not-found (delete is not idempotent
   success on a second call).

### Edge Cases

- What happens when a user requests a log history range with no matching
  logs? Returns an empty result, not an error (covered in Story 2).
- What happens when `occurred_at` is omitted on a log write? The write is
  rejected — it is always required from the client (covered in Story 1).
- What happens when a client supplies its own `logged_at` on write? It is
  ignored; `logged_at` is always the server's write-time stamp, never
  client-supplied.
- What happens when a user tries to log against, read, or delete something
  tied to another user's input? Rejected/not-found in every case, with no
  response difference between "doesn't exist" and "belongs to someone else."
- What happens on a second delete of an already-deleted log? Rejected as
  not-found, not treated as a repeat success.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST identify the current user solely from a verified
  identity check performed on every request; it MUST NOT accept or trust a
  user identifier supplied in a request body.
- **FR-002**: Users MUST be able to create a log entry against one of their
  own existing inputs.
- **FR-003**: Every log entry MUST be assigned its own stable, unique
  identifier at the time it is created.
- **FR-004**: A log entry MUST support an optional value and optional
  attributes, and MUST require an `occurred_at` timestamp supplied by the
  client at write time.
- **FR-005**: System MUST stamp each log entry with its write time
  (`logged_at`) itself; any client-supplied write-time value MUST be
  ignored.
- **FR-006**: On successful creation, System MUST return the created log
  entry, including its identifier, to the caller.
- **FR-007**: System MUST reject a log-creation request when the target
  input does not exist or does not belong to the requesting user, and MUST
  respond identically in both cases so existence of another user's input is
  never revealed.
- **FR-008**: Users MUST be able to retrieve the log history for one of
  their own inputs, filtered to a requested date range.
- **FR-009**: A log-history read MUST return only logs belonging to the
  requesting user's own input, never logs belonging to another user.
- **FR-010**: Users MUST be able to delete a single log entry by its
  identifier.
- **FR-011**: System MUST reject a delete request when the target log does
  not exist or does not belong to the requesting user, responding
  identically (not-found) in both cases.
- **FR-012**: Deletion MUST permanently remove the log entry (hard delete);
  this feature MUST NOT retain a recoverable or soft-deleted copy of the log
  itself.
- **FR-013**: This feature MUST NOT perform or expose any LLM-based
  reasoning, insight generation, or outcome-logging capability — those are
  out of scope for this slice.

### Key Entities

- **Input**: A trackable item already owned by a user (e.g. "Focussed
  Breathing", "Sleep") that logs are recorded against. Inputs already exist
  going into this feature; creating, editing, or listing inputs is out of
  scope here.
- **Input Log**: A single recorded instance against an input. Carries its
  own identifier, an optional value, optional attributes, a required
  client-supplied `occurred_at` (when it happened), and a server-stamped
  `logged_at` (when it was written). Always belongs to exactly one input and,
  through it, to exactly one user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user who logs a value against their own input can see that
  exact entry, with its identifier, in a subsequent read of that input's
  history on the first attempt, with no manual retry needed.
- **SC-002**: Across all read, write, and delete operations, 0% of attempts
  by one user ever return, modify, or remove another user's log data,
  verified by dedicated cross-user test coverage.
- **SC-003**: 100% of attempts to log against, read, or delete something
  that does not exist or belongs to another user are rejected, with no
  observable difference in response between "does not exist" and "belongs
  to someone else."
- **SC-004**: A deleted log is absent from every subsequent history read of
  that input, 100% of the time, with no way to recover it through this
  feature.

## Assumptions

- The `get_current_user` identity seam is a stand-in for real session-token
  verification; it already returns the same internal user-identifier shape
  the real verifier will, so this feature's scoping logic does not change
  when real authentication lands.
- Date ranges are expressed in simple relative terms (e.g. "7d", "30d") for
  the read scenario; the exact set of supported range expressions is a
  planning-level detail, not a scoping decision for this spec.
- A log's `value` and `attributes` are treated as opaque data at this layer;
  type-specific validation of `value` against its input's declared type is
  not required for this slice.
- Inputs themselves (creation, listing, ownership assignment) already exist
  as a prerequisite and are out of scope for this feature — this slice only
  logs against, reads, and deletes against pre-existing inputs.
- The immutable audit trail referenced for raw captures is a separate,
  already-designed concern (`captures`) and is not built or modified as
  part of this feature; this feature's delete is a true hard delete of the
  log row only.
</content>
