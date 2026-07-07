---
title: Player Game Log Modal -- Batting and Pitching Tables
date: 2026-07-07
status: approved
---

## Summary

Add a per-player game log: clicking a row in `BattingTable` or `PitchingTable` opens a modal showing that player's last 10 games with per-game stats. Fetched on demand (not prefetched), using a new `fetchGameLog` API function and a single shared `GameLogModal` component.

## Data Layer

New function in `src/api/mlb.ts`:

```ts
export async function fetchGameLog(personId: number, group: 'hitting' | 'pitching') {
  const data = await get<{ stats: { splits: GameLogSplit[] }[] }>(
    `/people/${personId}/stats?stats=gameLog&group=${group}&season=${SEASON}&sportId=1`
  )
  return (data.stats[0]?.splits ?? []).slice(0, 10)
}
```

The MLB Stats API returns the full season's game log in reverse-chronological order (most recent first), so no extra sorting is needed -- just slice the first 10.

New types in `src/types/mlb.ts`:

```ts
interface GameLogOpponent {
  team: { id: number; name: string }
}

interface GameLogSplit {
  date: string
  opponent: GameLogOpponent
  isHome: boolean
  stat: BattingGameStat | PitchingGameStat
}

interface BattingGameStat {
  atBats: number
  runs: number
  hits: number
  homeRuns: number
  rbi: number
  baseOnBalls: number
  strikeOuts: number
}

interface PitchingGameStat {
  inningsPitched: string
  hits: number
  runs: number
  earnedRuns: number
  baseOnBalls: number
  strikeOuts: number
}
```

Fetch happens on demand: `GameLogModal` calls `fetchGameLog` in a `useEffect` when it mounts (i.e. when a row is clicked), not prefetched for the whole roster.

## Component Structure

New `src/components/GameLogModal.tsx`, a single shared component:

```ts
type Props = {
  personId: number
  playerName: string
  group: 'hitting' | 'pitching'
  onClose: () => void
}
```

It owns its own `loading`/`error`/`data` state (same `useEffect` + `useState` pattern as the tab components) and renders the correct column set based on `group`.

`BattingTable.tsx` and `PitchingTable.tsx` each add:
- `cursor-pointer hover:bg-gray-50` on player rows
- an `onClick` that sets `selectedPlayer: { id, name } | null` state
- `{selectedPlayer && <GameLogModal personId={...} playerName={...} group="hitting" onClose={() => setSelectedPlayer(null)} />}`

No routing, no global state -- consistent with the rest of the app.

## UI/UX Details

- Modal: centered overlay with dark semi-transparent backdrop, closes on backdrop click, an X button, or Escape key
- Header: player name
- Table columns:
  - Batting: `Date | Opp | AB | R | H | HR | RBI | BB | K`
  - Pitching: `Date | Opp | IP | H | R | ER | BB | K`
- Opponent shown as the 3-letter-style name already used elsewhere in the app (reuse existing formatting conventions, no logos needed here)
- Loading and error states reuse the existing text patterns (`"Loading…"` in gray, error message in red) already used in `Schedule.tsx` and `Standings.tsx`

## Error Handling

If `fetchGameLog` throws (network failure, bad player id), `GameLogModal` shows the same red error-text style used elsewhere in the app. No retry logic -- consistent with the app's existing "just show an error" approach.

## Testing

No automated test runner in this repo. Verify manually with the webapp-testing skill:
- Click a row in Batting -> modal opens with correct batting columns and data
- Click a row in Pitching -> modal opens with correct pitching columns and data
- Close via backdrop click, X button, and Escape
- Simulate a failed request -> error state renders correctly

## Files Changed

- `src/api/mlb.ts` -- add `fetchGameLog`
- `src/types/mlb.ts` -- add `GameLogSplit`, `BattingGameStat`, `PitchingGameStat`
- `src/components/GameLogModal.tsx` -- new
- `src/components/BattingTable.tsx` -- row click handler, render modal
- `src/components/PitchingTable.tsx` -- row click handler, render modal
