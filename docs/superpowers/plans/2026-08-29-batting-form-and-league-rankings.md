# Plan: Hot & Cold + League Rankings

Date: 2026-08-29
Specs: `docs/superpowers/specs/2026-08-29-batting-form-design.md`,
`docs/superpowers/specs/2026-08-29-league-rankings-design.md`

Two independent panels, no shared code, no shared files except `src/api/mlb.ts`,
`src/types/mlb.ts` and `src/App.tsx`. Either can ship without the other.

## Task 1 — Data layer

- `fetchBattingByDateRange(startDate, endDate)` in `src/api/mlb.ts`
  (`stats=byDateRange`, trimmed with `fields=`, default `STATS` cache profile).
- `fetchTeamStats(group)` in the same file (`/teams/stats`, all 30 clubs).
- `WindowBattingStats` and `HitterForm` in `src/types/mlb.ts`.

Both paths are already covered by the proxy allowlist (`/stats`, `/teams/`), so
no `MLB_ALLOWED` change.

## Task 2 — Pure logic

- `src/utils/battingForm.ts`: `buildForms(windowSplits, seasonSplits)`,
  `formatDelta`, `parseRate`, `MIN_PLATE_APPEARANCES`, `TREND_THRESHOLD`.
- `src/utils/rankings.ts`: `rankCategories(splits, teamId, categories)` plus the
  two category lists.

No fetching and no `Date.now()` in either — the caller supplies the window and
the data.

## Task 3 — Hot & Cold panel

- `src/components/BattingForm.tsx`, self-hiding on failure or an empty window.
- `src/components/BattingTable.tsx`: add the `enableBattingForm` prop, mount the
  panel, and refactor the loading/error/empty early returns into one return with
  inline ternaries so the panel sits outside them.

## Task 4 — League Rankings panel

- `src/components/LeagueRankings.tsx`, two independent fetches, self-hiding when
  both fail.
- `src/components/Standings.tsx`: add the `enableLeagueRankings` prop and mount
  the panel below `WildCardStandings`.

## Task 5 — Flags and docs

- `enableBattingForm` and `enableLeagueRankings` in `App.tsx`'s `useFlags()`
  destructure, both defaulted `true`.
- CLAUDE.md architecture entries, README feature list.

## Task 6 — Verification

`tsc -b`, `oxlint`, then `webapp-testing`: both panels against live data at
desktop and 375px, ranks cross-checked against the raw API, and the failure
paths driven by aborting each request in turn.
