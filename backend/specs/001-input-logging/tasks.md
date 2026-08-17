---

description: "Task list template for feature implementation"
---

# Tasks: Input Logging

**Input**: Design documents from `/specs/001-input-logging/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/input-logs-api.md, quickstart.md

**Tests**: Included — required by Constitution Principle VII (Test-First, NON-NEGOTIABLE) and explicitly requested for this feature. Every test task below MUST be written and MUST fail before its corresponding implementation task begins.

**Organization**: Tasks are grouped by user story (spec.md priorities P1/P2/P3) so each story is independently completable and testable. Within each story, test-authoring tasks are ordered before their implementation tasks.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3, per spec.md
- File paths are exact, relative to `backend/`

## Traceability

| Spec item | Task(s) |
|---|---|
| US1 AS1 (create succeeds, returns id) | T015 (`test_create_log_success_returns_id`) |
| US1 AS2 (optional fields omitted still succeeds) | T015 (`test_create_log_optional_fields_omitted_still_succeeds`) |
| US1 AS3 (missing `occurred_at` rejected) | T015 (`test_create_log_missing_occurred_at_422`) |
| US1 AS4 (nonexistent input rejected) | T015 (`test_create_log_nonexistent_input_404`) |
| US1 AS5 (other user's input rejected identically to AS4) | T015 (`test_create_log_other_users_input_404_identical_to_nonexistent`) |
| US1 flow (server-stamped `logged_at`) | T016 |
| US1 flow (`attributes` JSONB round-trips intact) | T016 (`test_attributes_jsonb_round_trips_intact`) |
| US2 AS1–AS4 (read) | T021 |
| US3 AS1–AS4 (delete) | T026 |
| SC-001 (write-then-read round trip) | T022 |
| SC-002 (0% cross-user leakage across all ops) | T028 |
| SC-003 (identical 404 for nonexistent vs. cross-user) | T028 |
| SC-004 (deleted log absent from all subsequent reads) | T027 |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create backend project skeleton per plan.md's Source Code structure (`app/`, `alembic/`, `tests/contract/`, `tests/integration/`, `tests/unit/`) at `backend/`
- [X] T002 Initialize `backend/pyproject.toml` with FastAPI, Uvicorn, SQLAlchemy, Pydantic v2, Alembic, psycopg, pytest, httpx as dependencies
- [X] T003 [P] Write `backend/docker-compose.yml` for local Postgres (per plan.md — Docker, not Homebrew, no SQLite fallback)
- [X] T004 [P] Configure linting/formatting (ruff) in `backend/pyproject.toml`

**Checkpoint**: `docker-compose up -d` starts Postgres; `pytest` runs (with zero tests) cleanly.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented — includes the Alembic migration and the `get_current_user` auth stub as explicit prerequisites to every endpoint task, per plan.md's Constitution Check (Principle I binds from day one, even stubbed).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 [P] Configure Alembic environment (`backend/alembic/env.py`, `backend/alembic.ini`) reading the DB URL from `backend/app/core/config.py`
- [X] T006 [P] Create SQLAlchemy engine + per-request session dependency in `backend/app/db/session.py`
- [X] T007 [P] Create `User` ORM model (`id`, `google_sub`, `email`, `created_at`) per data-model.md in `backend/app/models/user.py`
- [X] T008 [P] Create `Input` ORM model (`id`, `user_id` FK, `name`, `description`, `created_at`) per data-model.md in `backend/app/models/input.py`
- [X] T009 [P] Create `Capture` stub ORM model (`id`, `user_id` FK, `raw_text`, `source`, `status`, `created_at`) per data-model.md in `backend/app/models/capture.py`
- [X] T010 Create `InputLog` ORM model (`id`, `user_id` FK, `input_id` FK, `value`, `attributes` JSONB, `occurred_at`, `logged_at`) per data-model.md in `backend/app/models/input_log.py` (depends on T007, T008)
- [X] T011 Author the Alembic migration creating `users`, `inputs`, `input_logs`, `captures` with the FKs and constraints from data-model.md in `backend/alembic/versions/` (depends on T005–T010)
- [X] T012 Implement the `get_current_user` stub dependency in `backend/app/deps/auth.py`, returning a fixed internal `user_id` in the exact shape the real Google-OAuth verifier will later return (Constitution Principle I)
- [X] T013 [P] Create the FastAPI app instantiation and router-registration skeleton in `backend/app/main.py`
- [X] T014 Seed test fixtures in `backend/tests/conftest.py`: two users, one input owned by each, an authenticated test client wired to the `get_current_user` stub (depends on T011, T012)

**Checkpoint**: Foundation ready — migrations apply cleanly, the stub identity dependency resolves a fixed user, and fixtures exist for cross-user testing. User story implementation can now begin.

---

## Phase 3: User Story 1 - Log a value against an input (Priority: P1) 🎯 MVP

**Goal**: An authenticated user can create a log against one of their own inputs and get back the created log including its id.

**Independent Test**: With Foundational complete, `POST /inputs/{id}/logs` against a seeded user's own input returns 201 with a generated id; the same call against a nonexistent or another user's input returns 404.

### Tests for User Story 1 ⚠️

> Write these tests FIRST; they MUST fail before implementation (Constitution Principle VII).

- [X] T015 [P] [US1] Write contract tests for `POST /inputs/{id}/logs` in `backend/tests/contract/test_create_input_log.py`: `test_create_log_success_returns_id` (AS1), `test_create_log_optional_fields_omitted_still_succeeds` (AS2), `test_create_log_missing_occurred_at_422` (AS3), `test_create_log_nonexistent_input_404` (AS4), `test_create_log_other_users_input_404_identical_to_nonexistent` (AS5)
- [X] T016 [P] [US1] Write integration tests in `backend/tests/integration/test_input_logging_flow.py`: `test_create_ignores_client_logged_at_and_stamps_server_time` (server-stamped `logged_at`), `test_attributes_jsonb_round_trips_intact` (a log written with `attributes` such as `{"quality": 4}` reads back with the identical JSON structure and values)

### Implementation for User Story 1

- [X] T017 [US1] Create Pydantic request/response schemas for input-log creation (`InputLogCreate`, `InputLogRead`) in `backend/app/schemas/input_log.py` (depends on T015, T016 existing and failing)
- [X] T018 [US1] Implement `create_log` service function (validate input ownership, generate id, ignore client `logged_at`, stamp server `logged_at`) in `backend/app/services/input_logs.py` (depends on T017)
- [X] T019 [US1] Implement `POST /inputs/{id}/logs` route, wired to `get_current_user` (T012) and `create_log` (T018), in `backend/app/api/routes/input_logs.py`
- [X] T020 [US1] Register the input-logs router on the app in `backend/app/main.py` (depends on T013, T019)

**Checkpoint**: T015 and T016 pass. User Story 1 is fully functional and independently testable — logs can be created and returned with their id.

---

## Phase 4: User Story 2 - Read an input's log history over a date range (Priority: P2)

**Goal**: An authenticated user can retrieve their own input's logs filtered to a relative date range, with correct cross-user isolation.

**Independent Test**: With Foundational and US1 complete (to seed data), `GET /inputs/{id}/logs?range=7d` on a seeded user's own input returns exactly the logs in range; a range with no matches returns an empty list; cross-user/nonexistent targets return 404.

### Tests for User Story 2 ⚠️

- [X] T021 [P] [US2] Write contract tests for `GET /inputs/{id}/logs?range=` in `backend/tests/contract/test_read_input_logs.py`: `test_read_returns_only_logs_in_range_with_id` (AS1), `test_read_empty_range_returns_empty_list_not_error` (AS2), `test_read_never_includes_other_users_logs` (AS3), `test_read_nonexistent_or_other_users_input_404` (AS4)
- [X] T022 [P] [US2] Write integration test for the write-then-read round trip in `backend/tests/integration/test_input_logging_flow.py::test_write_then_read_round_trip_succeeds_first_attempt` — covers **SC-001**

### Implementation for User Story 2

- [X] T023 [US2] Extend `backend/app/schemas/input_log.py` with a list/read response schema for range-scoped log history (depends on T017)
- [X] T024 [US2] Implement `list_logs_in_range` service function (relative-range parsing, ownership check, empty-list-not-error) in `backend/app/services/input_logs.py` (depends on T018, T023)
- [X] T025 [US2] Implement `GET /inputs/{id}/logs` route (with `range` query param) in `backend/app/api/routes/input_logs.py` (depends on T024)

**Checkpoint**: T021 and T022 pass. User Stories 1 AND 2 both work independently — the full write-read loop is provable end to end.

---

## Phase 5: User Story 3 - Delete a single log (Priority: P3)

**Goal**: An authenticated user can hard-delete one of their own logs by id; nonexistent, cross-user, and repeat deletes are uniformly rejected.

**Independent Test**: With Foundational and US1/US2 complete, `DELETE /inputs/{id}/logs/{log_id}` on a seeded user's own log returns 204 and the log is gone from a subsequent read; nonexistent/other-user/repeat deletes return 404.

### Tests for User Story 3 ⚠️

- [X] T026 [P] [US3] Write contract tests for `DELETE /inputs/{id}/logs/{log_id}` in `backend/tests/contract/test_delete_input_log.py`: `test_delete_existing_log_returns_204` (AS1), `test_delete_nonexistent_log_404` (AS2), `test_delete_other_users_log_404` (AS3), `test_delete_already_deleted_log_404_not_idempotent_success` (AS4)
- [X] T027 [P] [US3] Write integration test verifying a deleted log is absent from every subsequent range read in `backend/tests/integration/test_input_logging_flow.py::test_deleted_log_absent_from_all_subsequent_reads` — covers **SC-004**
- [X] T028 [P] [US3] Write cross-cutting integration test asserting create/read/delete all reject nonexistent and cross-user targets identically, with zero data leakage across users, in `backend/tests/integration/test_cross_user_isolation.py::test_uniform_404_and_zero_cross_user_leakage_across_all_endpoints` — covers **SC-002** and **SC-003**

### Implementation for User Story 3

- [X] T029 [US3] Implement `delete_log` service function (ownership check via the log's input, hard delete, not idempotent-success on repeat) in `backend/app/services/input_logs.py` (depends on T018)
- [X] T030 [US3] Implement `DELETE /inputs/{id}/logs/{log_id}` route in `backend/app/api/routes/input_logs.py` (depends on T029)

**Checkpoint**: T026, T027, T028 pass. All three user stories are independently functional — the full write-read-delete spine is complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and contract hygiene that spans all three stories

- [X] T031 [P] Walk through `backend/specs/001-input-logging/quickstart.md` manually against a running local stack and confirm every scenario matches its documented expectation
- [X] T032 [P] Confirm FastAPI's auto-emitted OpenAPI document reflects all three endpoints and regenerate `packages/api-contract` from it — never hand-edit the contract (Constitution: Additional Constraints)
- [X] T033 Run the full test suite (`pytest backend/tests`) and confirm all contract and integration tests from Phases 3–5 pass, satisfying Constitution Principle VII before the feature is considered done

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. Includes the Alembic migration (T011) and `get_current_user` stub (T012), both explicit prerequisites — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational completion.
  - US1 has no dependency on US2/US3.
  - US2's contract tests (T021) can run against fixture-seeded logs alone and don't require US1's route to exist. However, T022 (the write-then-read round trip, SC-001) exercises the `POST` path by definition — it depends on US1's route (T019) being implemented, not just on US1's tests being written. US2 is therefore only fully independently testable for its read-only contract; its SC-001 coverage is inherently cross-story.
  - US3 depends on logs existing (from US1) to delete, and on US2 to verify post-delete absence — implemented last of the three, per spec.md priority order.
- **Polish (Phase 6)**: Depends on Phases 3–5 all complete.

### Within Each User Story

- Contract/integration tests are written first and MUST fail before implementation begins.
- Schemas before services; services before routes.
- Each story's checkpoint must pass before moving to the next priority.

### Parallel Opportunities

- T003, T004 (Setup) can run in parallel.
- T005–T009, T013 (Foundational) can run in parallel; T010 depends on T007/T008, T011 depends on T005–T010, T014 depends on T011/T012.
- Within each story, the test-authoring tasks marked [P] can run in parallel with each other (different files); implementation tasks are mostly sequential within a story since they share `backend/app/services/input_logs.py` and `backend/app/api/routes/input_logs.py`.
- T031, T032 (Polish) can run in parallel.

---

## Parallel Example: User Story 1

```bash
# Launch both US1 test-authoring tasks together:
Task: "Write contract tests for POST /inputs/{id}/logs in backend/tests/contract/test_create_input_log.py"
Task: "Write integration test for server-stamped logged_at in backend/tests/integration/test_input_logging_flow.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (migration + auth stub — CRITICAL, blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: T015/T016 pass; a log can be created and returned with its id
5. Demo if ready — this alone proves auth scoping + persistence + contract for writes

### Incremental Delivery

1. Setup + Foundational → foundation ready (migration applied, stub identity resolves)
2. Add User Story 1 → validate independently → MVP
3. Add User Story 2 → validate independently → full write-read loop demonstrable
4. Add User Story 3 → validate independently → full write-read-delete spine complete
5. Polish (Phase 6) → quickstart walkthrough + contract regeneration + full suite green

## Notes

- [P] tasks touch different files with no dependency on an incomplete task.
- Every acceptance scenario in spec.md (US1 AS1–5, US2 AS1–4, US3 AS1–4) and every success criterion (SC-001–SC-004) is named explicitly in a test task above — see the Traceability table.
- Tests MUST fail before their story's implementation tasks begin (Constitution Principle VII, NON-NEGOTIABLE).
- Commit after each task or logical group.
- Avoid: vague tasks, same-file conflicts marked [P], cross-story dependencies that would break independent testability.
</content>
