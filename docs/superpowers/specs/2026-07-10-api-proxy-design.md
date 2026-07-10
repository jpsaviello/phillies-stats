---
title: Backend API Proxy Service
date: 2026-07-10
status: approved
---

## Summary

Move all external API calls behind a small backend service (`server/`) so the Odds API key never reaches the client bundle, unblocking public deployment. The backend is a second container deployed alongside the nginx frontend in the k8s cluster; the ingress routes `/api` to it. Both upstreams are proxied: The Odds API (key required) and the MLB Stats API (public, proxied for a single choke point for caching and future changes).

## Motivation

`VITE_ODDS_API_KEY` was inlined into the client JavaScript at build time (Vite inlines all `VITE_*` vars) — anyone viewing a deployed bundle could extract the key. A build-time secret also meant the key was baked into every `phillies-stats:latest` image layer.

## Architecture

**Framework: Hono** on `@hono/node-server` — tiny (2 runtime deps), TypeScript-first, web-standard Request/Response, ports unchanged to Workers/Lambda if hosting moves off k8s. Dev via `tsx watch`, prod via `tsc` → `node dist/index.js`.

**Layout:** `server/` with its own `package.json` — no npm workspaces. The proxy is transparent, so no code is shared with the frontend; response types stay in `src/api/mlb.ts`. `server/` is its own Docker build context.

## API contract

All routes are `basePath('/api')`, so the ingress needs no rewrite annotation.

- `GET /api/health` — `{ ok: true }`; used by the k8s readiness probe.
- `GET /api/mlb/*` — constrained passthrough to `https://statsapi.mlb.com/api/v1`, forwarding path + query. **Allowlist** of path prefixes: `/teams/`, `/stats`, `/standings`, `/schedule`, `/people/`; anything else → 403. GET-only. This keeps the proxy from being an open relay while letting future MLB endpoints work with no server change.
- `GET /api/odds` — holds `ODDS_API_KEY` (runtime env var) and a **server-side 30-minute in-memory cache** (module-level; single replica, shared across all visitors — strictly better rate-limit protection than the old per-browser localStorage cache). Missing key → 503 `{ error: 'odds not configured' }`; upstream failure → 502. The client's existing `.catch(() => [])` fail-soft covers both.

## Client changes

- `BASE` in `src/api/mlb.ts` → `/api/mlb` (one line; all six MLB fetchers unchanged).
- `fetchOdds` → plain `fetch('/api/odds')`; the localStorage cache (`phillies_odds_cache_v2`) and `import.meta.env.VITE_ODDS_API_KEY` are deleted.
- `teamLogoUrl`/`playerHeadshotUrl` stay direct — static images, no key.
- Vite `server.proxy` **and** `preview.proxy` map `/api` → `http://localhost:8080` (`vite preview` does not inherit `server.proxy`).

## Secrets

- Dev: `ODDS_API_KEY` in the gitignored `.env.local`, loaded by `tsx --env-file`.
- k8s: Secret `phillies-stats-odds`, created imperatively (`kubectl create secret generic … --from-literal=ODDS_API_KEY=…`), never committed, referenced with `secretKeyRef` + `optional: true` so the pod starts keyless.
- **Key rotation required before public exposure:** the old key is baked into previously built `phillies-stats:latest` image layers and previously served bundles.

## CORS

None — same-origin in dev (Vite proxy) and prod (ingress split). Its absence is mild hardening: third-party origins can't read the proxy from a browser.

## Accepted caveats

- Direct NodePort access (`localhost:30080`) bypasses the ingress, so `/api/*` 404s and no data loads; the ingress host is the supported entry point. (Rejected alternative: nginx `proxy_pass` to the api Service — couples the frontend container to k8s DNS.)
- In-memory odds cache resets on pod restart and is per-replica if ever scaled — fine at 1 replica.
- Root `npm run build` does not build the server; each Dockerfile is the source of truth for its artifact.
- `tsx watch --env-file=../.env.local` requires `.env.local` to exist for dev (`--env-file-if-missing` is rejected by the local node 26 build).
