# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start Vite dev server with HMR
npm run build     # type-check then bundle for production (tsc -b && vite build)
npm run lint      # run Oxlint
npm run preview   # serve the production build locally
```

No test runner is configured.

## Architecture

This is a single-page React 19 + TypeScript app (Vite, Tailwind v4) that displays Philadelphia Phillies stats by fetching from the public MLB Stats API, plus live odds from The Odds API.

**Data flow:** `src/api/mlb.ts` → component → render. There is no state management library; each tab component owns its own fetch lifecycle via `useEffect` + `useState`.

- **`src/api/mlb.ts`** — all external API calls. Constants at the top: `PHILLIES_ID = 143`, `SEASON = 2026`. Each export maps to one MLB Stats API endpoint, plus `fetchOdds` for betting lines. Note: the `gameLog` stats endpoint (`fetchGameLog`) returns a player's full-season splits in **chronological** order (oldest first) — `fetchGameLog` takes the last 10 and reverses them to get most-recent-first. Don't assume MLB Stats API endpoints are reverse-chronological by default; this one isn't.
- **`src/types/mlb.ts`** — TypeScript interfaces for API response shapes (`Player`, `BattingStats`, `PitchingStats`, `RosterEntry`, `StandingsRecord`, `GameLogSplit`, `BattingGameStat`, `PitchingGameStat`).
- **`src/data/allStars.ts`** — hardcoded roster for `AllStarBanner`; update manually each season/selection, not fetched from an API.
- **`src/App.tsx`** — root component; holds the active tab state and conditionally renders the four tab components.
- **`src/components/`** — one file per tab: `BattingTable`, `PitchingTable`, `Standings`, `Schedule`, plus `Header`, `Nav`, `AllStarBanner`, and `GameLogModal` (shared modal opened from a row click in `BattingTable`/`PitchingTable`, showing a player's last 10 games).

**Tab routing** is handled by a simple `useState<Tab>` string in `App.tsx` — no router.

**Odds integration:** `fetchOdds` (in `src/api/mlb.ts`) calls The Odds API and requires `VITE_ODDS_API_KEY` to be set (no `.env` file is checked in — must be created locally / configured in the deploy target). Results are cached in `localStorage` for 30 minutes (`ODDS_CACHE_KEY`/`ODDS_CACHE_TTL`) to stay within API rate limits. `Schedule.tsx` calls `fetchOdds().catch(() => [])`, so a missing/invalid key fails silently and odds just don't render — it won't throw or block the schedule from loading. Odds are only shown for today's not-yet-finished game (see `getPhilliesOdds` in `Schedule.tsx`), matched to the schedule by sorted home/away team name pair since the two APIs don't share game IDs.

**localStorage** is also used for the `AllStarBanner` dismiss state (`phillies_allstar_banner_dismissed_2026`) — read/write is wrapped in try/catch to fail open if storage is unavailable.

**Styling** uses Tailwind v4 (CSS-first, no `tailwind.config.js`). Phillies red is used inline as `text-[#E81828]` / `bg-[#E81828]`.

**Linting** uses Oxlint (not ESLint) with React and TypeScript plugins. Config is in `.oxlintrc.json`.

**Deploy** target is Vercel (`vercel.json` sets security headers only; no custom build config — uses Vite defaults).

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
