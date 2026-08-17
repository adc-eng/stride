# Stride

A **personal reasoning agent over a self-logged life.** You log the things you
deliberately do or control (**inputs**) and the things you observe
(**outcomes**). On demand — for whatever date range you choose — an agent
reasons over rich *descriptions* + *statistical sketches* of those entities,
using its own world-knowledge rather than a hardwired correlation engine, and
returns plain-language insight. The longer-term thesis adds **proposals for what
to track next**, so the schema and the agent's attention **morph** to fit the
person.

Health is the **first seed domain** (inputs like breathing/stretches/walking,
sleep, meals, water; outcomes like weight and mood), but the data model is
domain-neutral by design — "health" is seed data, not schema.

## The thesis (what makes this not a habit tracker)

1. **Reasoning over computation.** We do *not* pre-compute pairwise
   correlations and ask the LLM to narrate them. We hand the model each
   entity's description + a statistical sketch and ask it to reason about
   cross-relationships from its understanding of the world and of these
   specific numbers — grounding every claim in the sketch, labelling
   correlation/hypothesis, never asserting causation. When the data in range is
   too thin, the honest answer ("nothing trustworthy to say yet") is a valid
   result, not a failure.
2. **The suggest-and-track loop.** The agent proposes *new* things to log and
   evolves what the person tracks through an interactive chat. **This loop is
   the IP** — it's where the product stops being a tracker and becomes an agent.
3. **It morphs.** What's hardcoded today (weight, sleep, three checklist inputs)
   is seed data; the schema is designed to become user- and eventually
   agent-editable.

## The product principle — an agent constraint, not just UI copy

**Observe and reflect; do not enforce or pressure.** Body/outcome metrics are
logged neutrally and shown descriptively, never as targets to beat. Because the
agent can *propose new metrics*, observe-don't-pressure lives in the agent's
operating constraints: it must never suggest restriction-gamification (calorie
counting, weigh-in streaks, guilt framing). Streaks, if any, belong on
behavioral habits only.

## Core model

- **Inputs** = things deliberately done *or* logged facts you control
  (user-defined, typed, time-series). "input" was chosen over "habit"/"action":
  last-meal time is neither a habit nor an action, but it is an input you track.
- **Outcomes** = things observed (user-defined, typed, time-series, including
  **image-typed** outcomes like a daily photo). Today only Weight and Mood.
- **Insight** = the agent's reasoning over both for a chosen date range, stored
  as a first-class row with provenance. The forward thesis adds proposals for
  what to track next.

Every log carries two timestamps: `occurred_at` (when it happened) and
`logged_at` (server write time) — enabling backfill of past days. Every log and
insight is `user_id`-scoped (from the verified token, never the request body).
`value` is the single field SQL sketches over; `attributes` (JSON) is the
extensibility sidecar. `description` is first-class product data — the agent
reasons over it.

### Insights are generated on demand and stored

Insight generation is **on-demand, not a nightly batch** (nightly becomes just
"run the same call on a schedule" later — the reasoning service is
trigger-agnostic by design). The user picks a date range and generates; the
backend runs the reasoning over that range's sketches and **persists** the
result. Each stored insight row carries `id`, `user_id`, `generated_at`,
`range_from`, `range_to`, `generated_by` (the model identifier), plus
`title`, `body`, `confidence`, and the `entity_ids` it reasoned over — so every
insight shows exactly which window and which entities produced it. A separate,
range-scoped **chat** ("Ask me") answers ad-hoc questions and is *not* persisted
as insights.

## Architecture (locked decisions)

| Concern | Decision | Why |
|---|---|---|
| Frontend | Static React (Vite) → CDN | Private authenticated app-shell; no SSR need |
| Frontend routing | Vite + **TanStack Router** (no Start/server layer yet) | File-based routing, browser-only; upgrade to Start only on a real SSR trigger |
| Backend | Python + FastAPI | Async-native, schema-validated, LLM/ML-ecosystem-first |
| Database | Postgres, all rows `user_id`-scoped | Relational + time-series + `pgvector` later |
| Auth | Google → backend verifies → backend-issued session JWT | Backend is the confidential OAuth client; DB guarded by our token |
| Voice→text | Server-side Whisper (hosted first), swappable | iOS Safari web speech unreliable; uniform server-side transcription |
| LLM calls | Backend-side only, off the write path | Keys/prompts stay server-side; async |
| Sketches vs. reasoning | SQL produces **statistical sketches**; LLM **reasons** over sketches + descriptions | Scoped boundary: no LLM arithmetic on raw rows; reasoning is the LLM's job |
| Insight generation | On-demand, range-scoped, **persisted with provenance** | Subsumes nightly batch; keeps the reasoning service trigger-agnostic |
| Raw capture | Stored separately from derived logs, linked | Audit, reprocess, confirm-before-commit |
| Repo | Monorepo: `apps/` + `packages/` + `backend/` | iOS is a roadmap certainty → multiple peer clients |
| License / visibility | MIT, public (revisit before the agent loop is real) | Nothing novel yet; the suggest-and-track loop is the part worth protecting |

> **The sketches-vs-reasoning boundary** is a deliberate scoping of the older
> "compute-in-SQL, LLM-never-calculates" rule. SQL still produces the numbers so
> the model can't fabricate them; the LLM now does the cross-entity
> *reasoning*, but must ground and label every claim.

## On the horizon (room left, not built)

- **iOS app (React Native)** — primary client long-term; web is the showcase.
  RN over Swift for code/type reuse.
- **The suggest-and-track loop** — the thesis: the agent proposing new things to
  track and evolving the schema, confirm-before-commit. On-demand and any future
  scheduled generation share trigger-agnostic service functions.
- **RAG over the person's own history + reference docs** — `pgvector` in the
  same Postgres first, behind a service interface; graduate to OpenSearch only
  when retrieval sophistication justifies the ops weight.
- **Image outcomes + vision** — daily photos via pre-signed S3 upload; vision
  models reading them into a generation pass.
- **Bedrock AgentCore** — once genuinely agentic. Keep AWS SDKs out of core
  logic so adoption is an adapter, not a rewrite.

## Repo map

```
stride/
├── apps/
│   └── web/              Vite + TanStack Router SPA — the showcase client
├── packages/
│   └── api-contract/     OpenAPI spec — shared source of truth (emitted by the backend)
└── backend/              FastAPI service — spec-driven (GitHub Spec Kit)
```

- **Why `apps/` + `packages/`** (not `frontend/`+`backend/`): iOS is a roadmap
  certainty, so the repo is structured for *multiple* peer clients now. `apps/*`
  holds deployables; `packages/*` holds shared code (starting with the contract).
- **Why the backend is separate**: it never moves; every client is an HTTP
  consumer of the same API. FastAPI auto-emits the OpenAPI, so the backend is
  the *producer* of the contract and clients codegen from it.

## Development approach

The **backend is built spec-driven** using [GitHub Spec Kit](https://github.com/github/spec-kit):
specifications are the source of truth, code is generated output, and the
OpenAPI contract is emitted by the generated backend — not hand-authored. Spec
Kit stops at implementation and does **not** verify code satisfies the spec — so
acceptance tests are authored per feature and enforced **test-first**.

The frontend already runs against a mock (MSW) whose shape *is* the target
contract — four tabs (Today, Dashboard, Insights, Wall), on-demand insight
generation, and `user_id`-scoped logs — so when the generated backend emits that
contract the UI needs no rework. See `apps/web/README.md` for the running client
and `backend/README.md` for how Spec Kit is rooted there.
