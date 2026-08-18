<!--
Sync Impact Report
Version change: 1.1.0 → 1.1.1
Modified principles:
  - V. Observe, Don't Pressure — reworded (no-guilt rule made explicit,
    encouragement permitted for behavioral inputs); same scope as before,
    not a new rule, so treated as a wording clarification (PATCH)
Added principles: none
Added sections: none
Removed sections: none
Deferred placeholders: none
Follow-up TODOs: none

Prior amendment (1.0.0 → 1.1.0): added Principle VIII (Insights Persisted
With Provenance), materially expanded Principle I (identity contract binds
while auth is stubbed), corrected Development Workflow / Governance command
references from hyphenated to dotted form.
-->

# Stride Backend Constitution

## Core Principles

### I. User-Scoped Data Only
Every row in every table is `user_id`-scoped. `user_id` MUST be derived from
the verified session token on every request; it MUST NOT be trusted from the
request body, query string, or any other client-supplied value. Rationale:
this is a personal health-data service — cross-user data leakage is the
single most damaging failure mode, so tenant isolation is enforced at the
token boundary, not left to per-endpoint discipline.

This principle binds from day one, including while authentication is
stubbed. The stub `get_current_user` dependency returns the same identity
shape (an internal `user_id`) that the real token verifier will return;
only the verification body changes when real auth lands. No handler,
query, or test may depend on auth being real vs. stubbed — the identity
contract is fixed now, so swapping the stub for real Google OAuth is a
non-breaking change.

### II. Capture / Log Separation
Raw user input (typed description, later a voice transcript) is stored
immutably in `captures`. LLM-derived structured rows (logs, entity
proposals) link back to their source capture via `capture_id` and never
overwrite or discard the raw record. Rationale: enables audit, reprocessing
against improved prompts/models, and confirm-before-commit without losing
what the user actually said.

### III. Sketches-in-SQL, Reasoning-in-LLM
SQL computes statistical sketches (count, mean, median, sd, min/max with
timestamps, recent-window trend, completion rate, last-logged) over raw
rows. The LLM reasons over sketches plus entity descriptions and MUST NOT
perform arithmetic on raw rows itself. Every claim the model makes MUST be
grounded in a provided sketch, quote the numbers it relies on, and be
labeled as correlation or hypothesis — never asserted as causation.
Rationale: keeps numeric truth in deterministic SQL so the model can't
fabricate figures, while reserving cross-entity reasoning — the actual
product value — for the LLM.

### IV. Confirm-Before-Commit (NON-NEGOTIABLE)
No LLM-inferred log entry and no agent-proposed change to what a user
tracks (new inputs/outcomes) is committed to the database without explicit
user confirmation. Rationale: the schema is designed to become
agent-editable over time; a human gate is the only thing standing between
that flexibility and silent, wrong writes to someone's health record.

### V. Observe, Don't Pressure
The agent observes and reflects; it does not pressure. LLM output —
generated insights, chat responses, or track-proposals — MUST NOT guilt
the user for what they haven't logged or what they are not achieving.
Behavioral inputs MAY use encouragement; observed outcomes stay neutral.
Rationale: the agent can shape what's tracked, so this constraint lives in
the agent, not just the UI.

### VI. Thin-Data Honesty
When a requested range holds too little data to support a claim, insight
generation MUST return an explicit, low-confidence "nothing trustworthy to
say yet — ask me something specific" result rather than manufacture a
correlation to fill space. Returning zero relationships is a valid outcome;
returning a fabricated one is not. Rationale: the product's credibility
depends on every claim being trustworthy, not on always having something to
say.

### VII. Test-First (NON-NEGOTIABLE)
Spec Kit stops at implementation and does not verify that generated code
satisfies its spec — that verification is this project's responsibility.
Acceptance criteria from each feature's spec MUST be authored as pytest
tests during `/speckit-tasks`, MUST fail before implementation, and MUST
pass before a feature is considered done. When implemented behavior and the
spec diverge, the spec is fixed and the code regenerated or corrected to
match it — the spec is never left to silently drift from what actually
runs. Rationale: without an enforced test gate, "regeneration" from a spec
is indistinguishable from re-rolling dice.

### VIII. Insights Persisted With Provenance
Insight generation is on-demand and range-scoped. Every generated insight
is persisted as a first-class row carrying its full provenance:
`generated_at`, `range_from`, `range_to`, `generated_by` (the model
identifier), `confidence`, and the `entity_ids` it reasoned over. Insights
are append-only — nothing is overwritten — so which window, when, and
which model produced each insight always travels with it. The reasoning
service is trigger-agnostic: on-demand generation and any future scheduled
run call the same service functions; a schedule is just a different
trigger, not different logic. Range-scoped chat ("Ask me") uses the same
reasoning core but is explicitly NOT persisted as insights — different
lifecycle, different trust level. Rationale: provenance is what lets a
user trust and audit an insight, and trigger-agnosticism is what stops
"add a nightly job later" from becoming a rewrite.

## Additional Constraints

**Contract**: FastAPI auto-emits the OpenAPI contract to
`packages/api-contract`. The backend is the sole producer of this contract;
it MUST NOT be hand-authored or hand-edited, and clients codegen from it.

**No cloud SDKs in core logic**: AWS SDKs (e.g. for Bedrock AgentCore, S3)
MUST stay out of core business logic. Cloud-provider integration is an
adapter at the edges, not a dependency baked into reasoning or data-access
code, so provider adoption stays additive rather than a rewrite.

**Local infrastructure**: Postgres runs in Docker
(`docker-compose.yml` ships with the backend), not Homebrew, so local
environments stay reproducible and mirror production.

## Development Workflow

The backend is built **spec-driven** using GitHub Spec Kit, rooted in
`backend/`: specifications are the source of truth, code is generated
output. The workflow is, in order, each phase producing a reviewed
artifact: `/speckit.constitution` → `/speckit.specify` → `/speckit.plan` →
`/speckit.tasks` → `/speckit.implement`.

Spec Kit's own generated files (`.specify/memory/constitution.md`, command
files, `specs/`) are produced by Spec Kit tooling and MUST NOT be
hand-created from scratch outside that workflow. This constitution itself
is only ever updated via `/speckit.constitution`.

## Governance

This constitution supersedes ad hoc conventions for everything under
`backend/`. Amendments are made only via `/speckit.constitution`, must
state which principle(s) or section(s) changed and why, and take effect
immediately on merge to the default branch.

Versioning follows semantic versioning: MAJOR for backward-incompatible
principle removals or redefinitions, MINOR for new principles or materially
expanded guidance, PATCH for wording and clarification fixes with no
semantic change. Every amendment updates the Sync Impact Report at the top
of this file and bumps `LAST_AMENDED_DATE`.

Every pull request touching `backend/` MUST be checked against the Core
Principles above before merge; a reviewer who identifies a violation blocks
the PR rather than waiving it silently. `backend/README.md` carries
day-to-day technical guidance that supplements this document but never
overrides it — where the two conflict, this constitution wins.

**Version**: 1.1.1 | **Ratified**: 2026-08-16 | **Last Amended**: 2026-08-16
