# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev         # start Vite dev server with HMR
npm run dev:server  # start the backend API proxy (server/) on :8080 — needed for any data to load
npm run build       # type-check then bundle the frontend (tsc -b && vite build)
npm run lint        # run Oxlint
npm run preview     # serve the production build locally (still proxies /api to :8080)
```

Local dev requires **both** servers: `npm run dev:server` in one terminal, `npm run dev` in another. Vite proxies `/api` to `localhost:8080` (see `vite.config.ts`). The backend builds separately: `npm --prefix server run build`.

No test runner is configured.

## Architecture

This is a single-page React 19 + TypeScript app (Vite, Tailwind v4) that displays Philadelphia Phillies stats from the public MLB Stats API, plus live odds from The Odds API. All external API calls go through a small backend proxy (`server/`) so no keys ever reach the client bundle.

**Data flow:** `src/api/mlb.ts` → `/api/*` (backend proxy) → upstream API → component → render. There is no state management library; each tab component owns its own fetch lifecycle via `useEffect` + `useState`.

- **`server/`** — standalone Hono + Node backend (own `package.json`, not a workspace). `server/src/index.ts` defines `GET /api/health`, `GET /api/mlb/*` (allowlisted passthrough to `statsapi.mlb.com/api/v1` — only paths starting with `/teams/`, `/stats`, `/standings`, `/schedule`, `/people/` are forwarded), and `GET /api/odds` (holds `ODDS_API_KEY`, 30-min in-memory cache shared across all visitors); `server/src/chat.ts` adds `POST /api/chat` (see Chat bot below). Dev runs via `tsx watch` loading `../.env.local`; prod is `tsc` → `node dist/index.js`.
- **`src/api/mlb.ts`** — all client-side API calls, now against `/api/mlb` and `/api/odds`. Constants at the top: `PHILLIES_ID = 143`, `SEASON = 2026`. Each export maps to one MLB Stats API endpoint, plus `fetchOdds` for betting lines. Note: the `gameLog` stats endpoint (`fetchGameLog`) returns a player's full-season splits in **chronological** order (oldest first) — `fetchGameLog` passes them through unchanged; `GameLogModal` slices the last 10 (reversed to most-recent-first) for its table and feeds the full season to the trend chart. Don't assume MLB Stats API endpoints are reverse-chronological by default; this one isn't. `fetchSplits(personId, group)` hits the same `/people/{id}/stats` path with `stats=statSplits&sitCodes=vl,vr,h,a` for a player's situational splits (vs LHP/RHP, home/away); the API can omit individual sitCodes (or fields within a split's `stat`) for tiny samples, so `GameLogModal` orders by the requested codes, filters out missing ones, and renders absent fields as blank rather than assuming all four are present.
- **`src/types/mlb.ts`** — TypeScript interfaces for API response shapes (`Player`, `BattingStats`, `PitchingStats`, `RosterEntry`, `StandingsRecord`, `GameLogSplit`, `BattingGameStat`, `PitchingGameStat`, `StatSplit`). `StatSplit` reuses the full `BattingStats`/`PitchingStats` shape under `stat` (statSplits returns season-stat objects), keyed by a `split.code` discriminator.
- **`src/data/allStars.ts`** — hardcoded roster for `AllStarBanner`; update manually each season/selection, not fetched from an API.
- **`src/App.tsx`** — root component; holds the active tab state and conditionally renders the four tab components.
- **`src/components/`** — one file per tab: `BattingTable`, `PitchingTable`, `Standings`, `Schedule`, plus `Header`, `Nav`, `AllStarBanner`, `HeroStrip` (summary-card strip above the Nav on every tab — record/last game/next game/team leaders; owns its own fetches and renders nothing if any MLB fetch fails), and `GameLogModal` (shared player-detail modal opened from a row click in `BattingTable`/`PitchingTable`). It shows, top to bottom: a season-line header of stat tiles (the row's already-loaded `BattingStats`/`PitchingStats` is passed in via the `seasonStat` prop — no extra fetch), a situational splits table (from `fetchSplits`), the rolling-trend chart, and the last-10-games table. The two fetches (game log for the chart/table, splits for the splits table) run in **separate** `useEffect`s and fail independently, so a splits error never blanks the trend/table. The tables' `selectedPlayer` state carries `{ id, name, stat }` so the season line can render immediately. `ChatWidget` is the floating chat bot (see Chat bot below), mounted once in `App.tsx` outside the tab conditionals so its history survives tab switches.

**Tab routing** is handled by a simple `useState<Tab>` string in `App.tsx` — no router.

**Odds integration:** `fetchOdds` (in `src/api/mlb.ts`) hits the backend's `/api/odds`, which holds the key (`ODDS_API_KEY` — runtime env var, never a `VITE_` build-time var) and caches upstream responses in memory for 30 minutes to stay within API rate limits. Locally the key lives in the gitignored `.env.local`; in k8s it comes from the `phillies-stats-odds` Secret (created imperatively with `kubectl create secret`, never committed, marked `optional` so the pod starts keyless). A missing key means `/api/odds` returns 503, and `Schedule.tsx` calls `fetchOdds().catch(() => [])`, so odds just don't render — it won't throw or block the schedule from loading. Odds are only shown for today's not-yet-finished game (see `getPhilliesOdds` in `src/utils/odds.ts`, shared by `Schedule.tsx` and `HeroStrip.tsx`), matched to the schedule by sorted home/away team name pair since the two APIs don't share game IDs.

**Chat bot:** `src/components/ChatWidget.tsx` (floating button bottom-right, full-screen sheet on mobile) sends text-only history to `POST /api/chat` via `sendChat` in `src/api/chat.ts`. The route (`server/src/chat.ts`) holds `ANTHROPIC_API_KEY` (runtime env var, same pattern as odds — gitignored `.env.local` locally, imperatively-created `phillies-stats-anthropic` Secret in k8s, `optional: true`) and runs a Claude tool-use loop (`claude-opus-4-8`, `@anthropic-ai/sdk` beta toolRunner, adaptive thinking, `effort: "low"`, `max_iterations: 8` — never send `temperature`/`top_p`/`top_k`; Opus 4.8 rejects them). Five tools fetch `statsapi.mlb.com` directly server-side (schedule+probables, standings, batting/pitching season stats, player game log) and return trimmed JSON; the loop and tool_use blocks never leave the server — only the final text does. Keyless → 503 and the widget shows a friendly "not configured" bubble (tagged `error: true` locally and **excluded** from later payloads). Client and server both enforce the caps (≤20 messages, ≤2000 chars); the client windows history with `slice(-20)` then drops leading assistant messages because the Anthropic API requires the first message to be user-role. The system-prompt date is computed in `America/New_York`, not UTC, so "today" doesn't roll over during night games.

**localStorage** is used for the `AllStarBanner` dismiss state (`phillies_allstar_banner_dismissed_2026`) — read/write is wrapped in try/catch to fail open if storage is unavailable.

**Styling** uses Tailwind v4 (CSS-first, no `tailwind.config.js`). Brand colors are `@theme` tokens in `src/index.css` — `phillies-red` (#E81828), `phillies-navy` (#002D72), `phillies-cream` (#FAF7F0) — used as `text-phillies-red`, `bg-phillies-navy`, etc.; don't reintroduce inline hex classes (the one exception is SVG attribute literals in `TrendChart.tsx`). The display font is Barlow Condensed (`font-display` token, self-hosted via `@fontsource/barlow-condensed` imports in `main.tsx`), and `.bg-pinstripe` in `index.css` provides the header's pinstripe texture.

**Linting** uses Oxlint (not ESLint) with React and TypeScript plugins. Config is in `.oxlintrc.json`.

**Deploy** targets are the local Docker Desktop k8s cluster (kustomize manifests in `k8s/`, ingress host `phillies-stats.com`) and Vercel — both host the same codebase permanently, not a migration. The ingress routes `/api` to the backend Service and `/` to nginx — direct NodePort access (`localhost:30080`) bypasses the ingress, so `/api` 404s there and no data loads; use the ingress host.

On Vercel, `api/[[...route]].ts` is a serverless function (Vercel's own optional-catch-all filename convention — not Next.js-specific) that manually routes `/api/mlb/*`, `/api/odds`, `/api/config`, `/api/chat`, `/api/health` to the same framework-agnostic functions the k8s backend uses: `server/src/core.ts` (mlb proxy, odds cache, config) and `handleChat` in `server/src/chat.ts`. Those shared functions take/return plain `{ status, body }` objects with **no Hono import** — `server/` and the repo root each do their own separate `npm install`, so each ends up with its own copy of the `hono` package, and mixing objects from two different copies of the same package in one bundle breaks (Hono's request/context types rely on module-scoped symbols that don't match across copies). `server/src/app.ts` is the only file that touches Hono — it wraps those same shared functions for the long-running k8s process (`server/src/index.ts` hands `app.fetch` to `@hono/node-server`'s `serve()`). The Vercel function types its request/response with small local interfaces over Node's built-in `http` types rather than depending on `@vercel/node` (that package pulls in Vercel's entire build toolchain — ~120 packages plus several transitive ReDoS advisories — just for two type shapes). Because `server/` has its own separate `package.json`, `@anthropic-ai/sdk` is also listed in the root `package.json` purely so Vercel's root-level `npm install` can resolve it when bundling `api/[[...route]].ts` — intentional duplication, not a workspace migration. Vercel env vars (`ANTHROPIC_API_KEY`, `ODDS_API_KEY`, `SHOW_ALLSTAR_BANNER`) are set in the Vercel project dashboard, same keys as the k8s Secrets; all are optional/fail-soft so a Vercel deploy works without them, just without chat/odds. The `/api/odds` in-memory 30-min cache (in `core.ts`) is best-effort on Vercel (resets per cold start / per instance) vs. a hard guarantee on the long-running k8s process — accepted tradeoff, no shared cache store used.

The two images are deployed differently, permanently — not a migration in progress. The user's Docker Hub account is free-tier and can only publish one image, so only the frontend is registry-backed:
- **Frontend** (`phillies-stats`, root `Dockerfile`, nginx static) — pulled from Docker Hub. `k8s/base/deployment.yaml` uses `jsaviello1/phillies-stats:latest` with `imagePullPolicy: IfNotPresent` and `imagePullSecrets: dockerhub-creds`.
- **Backend** (`phillies-stats-api`, `server/Dockerfile`) — stays local-only by design. `k8s/base/api-deployment.yaml` uses the locally-built `phillies-stats-api:latest` with `imagePullPolicy: Never`.

`pipeline.sh` builds+pushes the frontend image to Docker Hub then builds the backend image locally (no push), restarting both Deployments after.

## Feature workflow (Spec-Driven Development)

Non-trivial features in this repo go through the `superpowers` SDD workflow, not ad-hoc edits:

- **Design specs** live in `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md`.
- **Implementation plans** live in `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`, broken into numbered tasks.
- **Progress ledger** is `.superpowers/sdd/progress.md` — tracks per-task completion, commit ranges, review status, and any accepted minor issues/deferred fixes for the in-progress feature. Check this file to see what's mid-flight and whether a task's review already surfaced known issues before re-deriving them.

Past examples of this pattern: `odds`, `schedule-team-logos`, `sortable-columns`, `all-star-banner`, `player-game-log` (see the matching plan/spec/progress entries).

## Testing

No automated test runner is configured. Instead, this repo uses the `webapp-testing` skill (`.claude/skills/webapp-testing/SKILL.md`) — a Playwright-based toolkit for driving the app in a real headless browser (navigate, click, screenshot, read console output).

**Every finished feature must be verified with `webapp-testing` before being considered done** — not just lint/typecheck. Use `scripts/with_server.py` to manage the `npm run dev` lifecycle, write a small Playwright script that exercises the actual user flow (click through to the changed UI, screenshot it, check for console errors), and confirm the result visually rather than assuming it works from source review alone.

Requires the `playwright` Python package and its Chromium browser binary to be installed locally (`pip install playwright && playwright install chromium`) — already set up in this environment as of 2026-07-08.

## Automated routines

**auto-merge-branches routine** (finds unmerged branches, opens/merges PRs into `develop`): only send a push notification when there's something actionable — a branch merged, a PR blocked on failing checks, a merge conflict, or an error running the routine. If the run finds no candidate branches or nothing to do, end the run silently; do not notify just to report a no-op.
