# Stride

A generic **habits-in, outcomes-out** tracker: log the things you deliberately
do, record the results you observe, and over time surface whether your
deliberate actions correlate with your observed outcomes.

Health is the **first seed domain** (habits like breathing/planning/hydration,
outcomes like sleep and weight), but the data model is domain-neutral by design
— "health" is seed data, not schema.

## Core idea

- **Habits** = things you deliberately do (user-defined, typed, time-series).
- **Outcomes** = things you observe (user-defined, typed, time-series).
- **Insight** = correlation between the two, computed over accumulated logs.

The value is not any single metric — it is the observe-and-correlate engine.

## Architecture (locked decisions)

| Concern | Decision | Why |
|---|---|---|
| Frontend | Static React (Vite), served from a CDN | UI is a private authenticated app-shell; no SSR need yet |
| Backend | Python + FastAPI | Async-native, schema-validated, LLM/ML-ecosystem-first |
| Database | Postgres, all rows `user_id`-scoped | Relational, time-series-friendly, standard multi-tenant |
| Auth | Google sign-in → backend verifies → backend-issued session JWT | Identity via Google; DB guarded by our own token, backend-only |
| Voice→text | Server-side Whisper (hosted first), later swappable | Cross-device consistency; iOS Safari web speech unreliable |
| LLM calls | Backend-side only, off the write path | Keys/prompts stay server-side; async |
| Compute vs. interpret | Aggregation in SQL; LLM interprets, never calculates | Hard boundary keeps analytics deterministic |
| Raw capture | Stored separately from derived structured logs, linked | Auditability + reprocessing + confirm-before-commit |

## On the horizon (room left, not built)

- **iOS app (React Native)** — the *primary* client long-term; web is the
  showcase. Chosen RN over native Swift for code/type reuse with web.
- **RAG over user docs** — object storage for raw files + `pgvector` in the
  same Postgres; `user_id` scoping extends to documents.
- **Batch + interactive LLM** — batch (Celery/RQ) for pre-computed insights,
  interactive for ad-hoc questions. Keep LLM/retrieval as trigger-agnostic
  service functions so either caller is additive.
- **Bedrock AgentCore** — once genuinely agentic (orchestration + RAG). Keep
  AWS SDKs out of core logic so adoption is an adapter, not a rewrite.

## Repo map

```
stride/
├── apps/
│   └── web/              Vite React SPA — the showcase client
├── packages/
│   └── api-contract/     OpenAPI spec — shared source of truth
└── backend/              FastAPI service — spec-driven (GitHub Spec Kit)
```

- **Why `apps/` + `packages/`** — not `frontend/`+`backend/`: iOS (React
  Native) is a roadmap certainty, so the repo is structured for *multiple*
  peer clients now. `apps/*` holds deployables; `packages/*` holds shared code
  (starting with the API contract).
- **Why the backend is separate** — it never moves; every client is just an
  HTTP consumer of the same API. That seam is what keeps adding clients
  additive.

## Development approach

The **backend is built spec-driven** using [GitHub Spec Kit](https://github.com/github/spec-kit):
specifications are the source of truth, code is the generated output. Spec Kit
stops at implementation and does **not** verify code satisfies the spec — so
acceptance tests are authored as part of each feature and enforced test-first.

See `backend/README.md` for how Spec Kit is rooted there.
