# Phase 0 Research: Input Logging

All technical decisions for this feature were fully specified by the
project owner rather than left open, so this document records the
decision/rationale/alternatives for each rather than resolving open
`NEEDS CLARIFICATION` markers — there are none.

## Web framework & server

- **Decision**: FastAPI on Uvicorn (ASGI).
- **Rationale**: Matches the backend's locked architecture decision
  (async-native, schema-validated, LLM/ML-ecosystem-first) already recorded
  in `backend/README.md`; FastAPI's dependency-injection system is also the
  natural home for the `get_current_user` identity seam.
- **Alternatives considered**: None — this is a project-wide locked choice,
  not a per-feature decision.

## ORM and schema separation

- **Decision**: Plain SQLAlchemy ORM for persistence models, separate
  Pydantic v2 models for request/response schemas. No SQLModel.
- **Rationale**: Keeping the DB-mapped model and the wire-format schema as
  distinct, visible seams means a change to one (e.g. adding an internal-only
  ORM column) doesn't silently change the API contract, and vice versa.
  SQLModel fuses the two by design, which is exactly the coupling being
  avoided here.
- **Alternatives considered**: SQLModel (rejected — fuses ORM and schema,
  explicitly ruled out by the feature owner); Django ORM (rejected — project
  is FastAPI, not Django, per the locked architecture).

## Migrations

- **Decision**: Alembic for all schema changes; no hand-run DDL.
- **Rationale**: Every schema change (this feature's `users`, `inputs`,
  `input_logs`, `captures` tables) must be reproducible and reviewable as a
  migration script, not applied ad hoc to a running database.
- **Alternatives considered**: Hand-run SQL/DDL (rejected — not
  reproducible, no history); SQLAlchemy `create_all` (rejected — fine for
  throwaway scripts, not for a service with an evolving schema).

## Database hosting

- **Decision**: PostgreSQL in Docker via the backend's `docker-compose.yml`.
- **Rationale**: Reproducible, mirrors production, avoids Homebrew-installed
  system state that doesn't travel with the repo. Also a locked project-wide
  decision (`backend/README.md`).
- **Alternatives considered**: Homebrew-installed Postgres (rejected —
  explicitly excluded); SQLite fallback (rejected — explicitly excluded;
  also would not exercise JSONB, which `attributes` depends on).

## Auth seam

- **Decision**: A `get_current_user` FastAPI dependency, stubbed for this
  feature, returns an internal `user_id` in exactly the shape the real
  Google-OAuth-backed verifier will return later. No handler, query, or test
  may branch on whether auth is real or stubbed.
- **Rationale**: Constitution Principle I explicitly requires the identity
  contract to bind from day one so that swapping in real verification
  (feature 003, per the user's own numbering) is a non-breaking change —
  only the dependency's internal verification body changes, not its return
  shape or any caller of it.
- **Alternatives considered**: Skipping auth entirely for this feature and
  hardcoding a constant `user_id` inline at each call site (rejected — would
  scatter the identity contract across handlers instead of centralizing it
  in one dependency, and would make the later real-auth swap a multi-file
  change instead of a one-file change).

## `input_logs` value/attributes shape

- **Decision**: `value` is a single nullable numeric column (booleans encode
  as `1`/`null`; enums never go here). `attributes` is nullable JSONB,
  holding enum labels and per-entity extras (sleep quality, walk
  distance/minutes, meal description, etc.).
- **Rationale**: Keeps `value` as the one clean numeric field that SQL-based
  statistical sketches (Constitution Principle III, a later feature) can
  aggregate over directly, without needing to branch on entity type. Every
  categorical or free-form detail lives in `attributes` instead, off the
  aggregation path.
- **Alternatives considered**: A single polymorphic `value` column typed as
  text/JSON for everything (rejected — would force every future sketch query
  to parse/cast per-entity-type, defeating the "single clean numeric field"
  goal); separate typed columns per input type (rejected — doesn't scale as
  new input types are added, and duplicates what `attributes` already
  covers).

## Table shape: `input_logs` vs. future `outcome_logs`

- **Decision**: `input_logs` and (later, feature 002) `outcome_logs` are two
  separate tables, each with a real foreign key to its own parent definition
  table (`inputs` / `outcomes`) — not one shared polymorphic logs table. The
  union read (`GET /logs?type=`) is assembled in the service layer at read
  time, not baked into a single table.
- **Rationale**: A real FK per table makes referential integrity explicit
  and DB-enforced; a polymorphic table would need a nullable/conditional FK
  or an application-level type tag standing in for what the database could
  otherwise guarantee.
- **Alternatives considered**: One polymorphic `logs` table with a
  `log_type` discriminator (rejected — explicitly ruled out by the feature
  owner; weakens FK integrity and this feature only builds `input_logs`
  anyway, so the union-read service layer has nothing to assemble yet).

## Cross-user / nonexistent-target responses

- **Decision**: Logging against, reading, or deleting a target that doesn't
  exist or belongs to another user returns 404 in every case, with no
  observable difference between "doesn't exist" and "exists but isn't
  yours."
- **Rationale**: Matches spec.md FR-007/FR-011 and SC-003 directly; prevents
  existence of another user's data from being inferred via response
  differences (a standard IDOR-avoidance pattern for tenant-scoped resources).
- **Alternatives considered**: 403 Forbidden for cross-user access
  (rejected — would leak that the target exists for someone else, which the
  spec explicitly forbids).

## Delete semantics

- **Decision**: `DELETE /inputs/{id}/logs/{log_id}` is a hard delete of the
  `input_logs` row. No soft-delete/tombstone on this table.
- **Rationale**: Constitution Principle II's immutable audit trail lives in
  `captures`, not in derived log rows — `input_logs` rows are meant to be
  correctable/removable by the user without that removal itself needing to
  be recoverable.
- **Alternatives considered**: Soft delete with a `deleted_at` column
  (rejected — explicitly ruled out by the feature owner; would also
  complicate every read query with a filter that doesn't map to any current
  requirement).
</content>
