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

This is a single-page React 19 + TypeScript app (Vite, Tailwind v4) that displays Philadelphia Phillies stats by fetching from the public MLB Stats API.

**Data flow:** `src/api/mlb.ts` → component → render. There is no state management library; each tab component owns its own fetch lifecycle via `useEffect` + `useState`.

- **`src/api/mlb.ts`** — all MLB API calls. Constants at the top: `PHILLIES_ID = 143`, `SEASON = 2026`. Each export maps to one API endpoint. Note: the `gameLog` stats endpoint (`fetchGameLog`) returns a player's full-season splits in **chronological** order (oldest first) — `fetchGameLog` takes the last 10 and reverses them to get most-recent-first. Don't assume MLB Stats API endpoints are reverse-chronological by default; this one isn't.
- **`src/types/mlb.ts`** — TypeScript interfaces for API response shapes (`Player`, `BattingStats`, `PitchingStats`, `RosterEntry`, `StandingsRecord`, `GameLogSplit`, `BattingGameStat`, `PitchingGameStat`).
- **`src/App.tsx`** — root component; holds the active tab state and conditionally renders the four tab components.
- **`src/components/`** — one file per tab: `BattingTable`, `PitchingTable`, `Standings`, `Schedule`, plus `Header`, `Nav`, `AllStarBanner`, and `GameLogModal` (shared modal opened from a row click in `BattingTable`/`PitchingTable`, showing a player's last 10 games).

**Tab routing** is handled by a simple `useState<Tab>` string in `App.tsx` — no router.

**Styling** uses Tailwind v4 (CSS-first, no `tailwind.config.js`). Phillies red is used inline as `text-[#E81828]` / `bg-[#E81828]`.

**Linting** uses Oxlint (not ESLint) with React and TypeScript plugins. Config is in `.oxlintrc.json`.

## Testing

No automated test runner is configured. Whenever a feature is complete, use the webapp-testing skill to verify it manually in the browser before considering the work done.
