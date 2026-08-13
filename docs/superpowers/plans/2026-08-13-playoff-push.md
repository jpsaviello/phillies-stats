# Implementation Plan: Playoff Push panel

Spec: `docs/superpowers/specs/2026-08-13-playoff-push-design.md`

## Task 1 — Types

`src/types/mlb.ts`: extend `StandingsRecord` with the fields the response already
carries and the app currently discards — `eliminationNumber`, `magicNumber`,
`wildCardEliminationNumber`, `divisionLeader`, `clinched`, `streak`. All optional
except the existing ones, so no call site breaks.

Add `RemainingGame { opponentId, isHome }` and `TeamRecord { wins, losses }`.

## Task 2 — API

`src/api/mlb.ts`:

- `fetchRemainingSchedule()` — `/schedule?sportId=1&season&teamId=143&gameType=R`
  with the same `fields=` trimming idiom as `fetchSeasonResults`; keep games where
  `status.abstractGameState !== 'Final'`; map to `{ opponentId, isHome }`.
- `fetchLeagueRecords()` — `/standings?leagueId=103,104&season&standingsTypes=regularSeason`
  with `fields=records,teamRecords,team,id,wins,losses`; flatten all 6 division
  groups into `Map<number, TeamRecord>`.

## Task 3 — Pure math

New `src/utils/playoffPush.ts`, no React, no fetching:

- `splitHomeAway(games)` → `{ total, home, away }`
- `strengthOfSchedule(games, records)` → mean opponent win pct, or `null` if any
  opponent is missing from the map (partial data is worse than none)
- `projectedRecord(wins, losses, remaining)` → extrapolate season pct
- `gamesBetween(a, b)` → standard `((aW-bW) + (bL-aL)) / 2`
- `cutoffMargin(ordered, philliesIndex, spots)` → `{ inSpot, games, rivalName }`
- `ordinal(n)` → `"4th"`

## Task 4 — Shared wild-card hook

New `src/hooks/useWildCardRace.ts`: move the `load()` body of
`WildCardStandings`' `useEffect` verbatim (fetch → `teamsNeedingTiebreak` →
`Promise.allSettled` → bail on partial → `applyTiebreakers`). Export
`windowSize` from here since both consumers need it. Returns
`{ records, notes, loading }`.

## Task 5 — `WildCardStandings` becomes prop-driven

Delete its `useEffect`/state; accept `{ records, notes, loading }` as props.
Rendering, the `MIN_ROWS_SHOWN` window, the cutoff divider row, the `†` markers
and the self-hide on empty are all unchanged.

## Task 6 — `PlayoffPush` component

Props: `divisionRecords: StandingsRecord[]`, plus the hook's
`{ records, notes, loading }`. Own fetches: `fetchRemainingSchedule` and
`fetchLeagueRecords`, both failing soft per the spec's edge-case table.

Returns `null` when the Phillies aren't in `divisionRecords`.

Renders: wild card card, division card, then a remaining-schedule + pace footer.
Brand tokens only (`phillies-red`, `phillies-navy`, `font-display`) — no inline
hex.

## Task 7 — Wire into `Standings`

Call `useWildCardRace()`; mount `<PlayoffPush>` first in the `space-y-8` stack and
**outside** the loading/error branches; pass the hook's values to both children.

## Task 8 — Verify

`npm run lint` + `npm run build`, then Playwright via the `webapp-testing` skill:
load the Standings tab, screenshot the panel, assert the panel's stated wild card
position matches the table's highlighted Phillies row, check for console errors.
