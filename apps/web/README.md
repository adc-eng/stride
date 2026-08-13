# apps/web

The Stride web client — a **static React SPA** (Vite build), served from a CDN.
This is the **assignment showcase**; the primary long-term client is the iOS
(React Native) app, not this.

## What this is

- Single-page app: one HTML shell, JS-driven routing, no full-page reloads.
- Builds to static assets (`dist/`) → served by any static host / CDN.
- Holds **no secrets and no data** — it renders whatever authenticated API
  calls return.

## Auth (runtime, not build-time)

The CDN serves the inert shell to anyone. Auth happens at runtime:

1. App boots, checks for a valid session (stored token or `/me` ping).
2. No session → render login. Valid session → render dashboard + fetch data.
3. Login: Google sign-in → **authorization code** sent to backend →
   backend exchanges it (server-side, with secret), verifies the Google ID
   token, mints **our own session JWT**.
4. SPA sends our session token on every API call; the **backend** enforces
   access and scopes all queries by `user_id`.

The SPA is *never* the OAuth client and *never* touches the DB. It is an SPA
(a frontend architecture); the **backend** is the OAuth client (an auth role).

## Not yet, but planned

- Migrate to Next.js **only** if a real SSR trigger appears (public/SEO pages,
  heavy-bundle first-paint problems, per-request server render logic). Until
  then, static CSR is correct. Components port over if that day comes.
- Two capture paths converge on the same structured logs: **manual**
  (deterministic) and **description → LLM** (inferred, user-confirmed). Voice
  becomes a third path feeding transcript text into the same flow.

## Stack

- Vite + React + Tailwind CSS.
- API client points at the FastAPI backend over HTTP/JSON.
