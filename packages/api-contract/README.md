# packages/api-contract

The **single source of truth** for the Stride HTTP API: the OpenAPI spec that
every client conforms to.

## Why this exists

Once there is more than one client (web SPA today, React Native iOS later),
hand-copied types drift across codebases. This package holds one contract that:

- the **backend produces** (FastAPI auto-emits OpenAPI from its Pydantic
  models/routes — the backend is the *source*),
- the **web app consumes** (codegen TypeScript types/client from the spec),
- the **iOS app will consume** (codegen its own client — the one thing shared
  across languages even when no runtime code can be).

## Flow

```
FastAPI (Pydantic models + routes)
        │  exports OpenAPI
        ▼
packages/api-contract/openapi.json   ← this package, the published artifact
        │
        ├──► apps/web        (codegen TS client)
        └──► iOS (later)     (codegen Swift client)
```

## Rule

One contract, everyone conforms, no hand-copied types. When the API changes,
the spec is re-exported from the backend and clients regenerate — they never
maintain their own divergent copy.

*(Backend-driven export is the path of least resistance with FastAPI. If the
project ever moves to spec-first, this package becomes the hand-authored
authority and the backend validates against it instead.)*
