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

- **`server/`** — standalone Hono + Node backend (own `package.json`, not a workspace). `server/src/index.ts` is the whole thing: `GET /api/health`, `GET /api/mlb/*` (allowlisted passthrough to `statsapi.mlb.com/api/v1` — only paths starting with `/teams/`, `/stats`, `/standings`, `/schedule`, `/people/` are forwarded), and `GET /api/odds` (holds `ODDS_API_KEY`, 30-min in-memory cache shared across all visitors). Dev runs via `tsx watch` loading `../.env.local`; prod is `tsc` → `node dist/index.js`.
- **`src/api/mlb.ts`** — all client-side API calls, now against `/api/mlb` and `/api/odds`. Constants at the top: `PHILLIES_ID = 143`, `SEASON = 2026`. Each export maps to one MLB Stats API endpoint, plus `fetchOdds` for betting lines. Note: the `gameLog` stats endpoint (`fetchGameLog`) returns a player's full-season splits in **chronological** order (oldest first) — `fetchGameLog` passes them through unchanged; `GameLogModal` slices the last 10 (reversed to most-recent-first) for its table and feeds the full season to the trend chart. Don't assume MLB Stats API endpoints are reverse-chronological by default; this one isn't.
- **`src/types/mlb.ts`** — TypeScript interfaces for API response shapes (`Player`, `BattingStats`, `PitchingStats`, `RosterEntry`, `StandingsRecord`, `GameLogSplit`, `BattingGameStat`, `PitchingGameStat`).
- **`src/data/allStars.ts`** — hardcoded roster for `AllStarBanner`; update manually each season/selection, not fetched from an API.
- **`src/App.tsx`** — root component; holds the active tab state and conditionally renders the four tab components.
- **`src/components/`** — one file per tab: `BattingTable`, `PitchingTable`, `Standings`, `Schedule`, plus `Header`, `Nav`, `AllStarBanner`, and `GameLogModal` (shared modal opened from a row click in `BattingTable`/`PitchingTable`, showing a player's last 10 games).

**Tab routing** is handled by a simple `useState<Tab>` string in `App.tsx` — no router.

**Odds integration:** `fetchOdds` (in `src/api/mlb.ts`) hits the backend's `/api/odds`, which holds the key (`ODDS_API_KEY` — runtime env var, never a `VITE_` build-time var) and caches upstream responses in memory for 30 minutes to stay within API rate limits. Locally the key lives in the gitignored `.env.local`; in k8s it comes from the `phillies-stats-odds` Secret (created imperatively with `kubectl create secret`, never committed, marked `optional` so the pod starts keyless). A missing key means `/api/odds` returns 503, and `Schedule.tsx` calls `fetchOdds().catch(() => [])`, so odds just don't render — it won't throw or block the schedule from loading. Odds are only shown for today's not-yet-finished game (see `getPhilliesOdds` in `Schedule.tsx`), matched to the schedule by sorted home/away team name pair since the two APIs don't share game IDs.

**localStorage** is used for the `AllStarBanner` dismiss state (`phillies_allstar_banner_dismissed_2026`) — read/write is wrapped in try/catch to fail open if storage is unavailable.

**Styling** uses Tailwind v4 (CSS-first, no `tailwind.config.js`). Phillies red is used inline as `text-[#E81828]` / `bg-[#E81828]`.

**Linting** uses Oxlint (not ESLint) with React and TypeScript plugins. Config is in `.oxlintrc.json`.

**Deploy** target is the local Docker Desktop k8s cluster (kustomize manifests in `k8s/`, ingress host `phillies-stats.com`). Two images built locally (`imagePullPolicy: Never`): `phillies-stats:latest` (root `Dockerfile`, nginx static) and `phillies-stats-api:latest` (`server/Dockerfile`). The ingress routes `/api` to the backend Service and `/` to nginx — direct NodePort access (`localhost:30080`) bypasses the ingress, so `/api` 404s there and no data loads; use the ingress host. `vercel.json` is a leftover from the earlier Vercel target (security headers only).

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
