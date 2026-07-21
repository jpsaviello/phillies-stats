---
title: Player Detail View -- Expanded Game Log Modal
date: 2026-07-20
status: approved
---

## Summary

Expand the existing `GameLogModal` from a last-10-games modal into a fuller player
detail view. Clicking a row in `BattingTable` or `PitchingTable` now opens a modal
that shows, top to bottom:

1. A **season-line header** of stat tiles (the player's current-season slash/pitching line).
2. A **situational splits** table (vs LHP, vs RHP, Home, Away).
3. The existing **rolling-trend chart** (unchanged).
4. The existing **last-10-games** table (unchanged).

Applies to both hitters and pitchers. Stays a modal (no router) consistent with the
rest of the app. Built via plan mode; this spec is a retroactive record to keep the
SDD convention consistent.

## Data Layer

### Season line -- no new fetch

Both tables already hold the full season `BattingStats`/`PitchingStats` per player.
Rather than re-fetch, the tables' `selectedPlayer` state is widened from
`{ id, name }` to `{ id, name, stat }`, and the `stat` is passed to the modal via a
new `seasonStat` prop. The header renders immediately, before any fetch resolves.

### Situational splits -- new fetch

New function in `src/api/mlb.ts`, mirroring `fetchGameLog` (same `get<T>` helper,
same `/people/{id}/stats` path -- already allowlisted by the proxy's `/people/`
prefix, so **no `server/` change**):

```ts
export async function fetchSplits(personId: number, group: 'hitting' | 'pitching') {
  const data = await get<{ stats: { splits: StatSplit[] }[] }>(
    `/people/${personId}/stats?stats=statSplits&sitCodes=vl,vr,h,a&group=${group}&season=${SEASON}&sportId=1`
  )
  return data.stats[0]?.splits ?? []
}
```

`sitCodes`: `vl` = vs left-handed, `vr` = vs right-handed, `h` = home, `a` = away.
Each split carries the full season-stat object under `stat`.

New type in `src/types/mlb.ts`:

```ts
export interface StatSplit {
  split: { code: string; description: string } // vl, vr, h, a
  stat: BattingStats | PitchingStats
}
```

`StatSplit` reuses the existing `BattingStats`/`PitchingStats` shapes -- `statSplits`
returns season-stat objects, keyed by the `split.code` discriminator.

## Component Structure

`GameLogModal` gains:
- A `seasonStat: BattingStats | PitchingStats` prop.
- A `splits` state + a **second, independent** `useEffect` calling `fetchSplits`.
  The two fetches (game log and splits) fail independently -- a splits error is
  swallowed to `[]` so it never blanks the trend chart or last-10 table.
- An `orderedSplits` memo that maps the requested sitCodes to the returned splits,
  filtering out any the API omitted (small samples), preserving vl/vr/h/a order.
- A small `StatTile` helper (label + value) reusing the `HeroStrip` idiom
  (`font-display`, `text-phillies-navy`, `tabular-nums`).

`BattingTable`/`PitchingTable` change only the `selectedPlayer` state shape, the
row `onClick` (adds `stat`), and pass `seasonStat` to the modal.

## UI/UX Details

- Panel widened `max-w-2xl` -> `max-w-3xl` to fit the wider splits table.
- Season-line tiles:
  - Hitting: `AVG / OBP / SLG / OPS / HR / RBI / SB`
  - Pitching: `ERA / W-L / IP / K / WHIP / SV`
  - Rendered raw (no reformatting) to stay consistent with the tables.
- Splits table columns:
  - Hitting: `Split | AVG | OBP | SLG | OPS | HR | RBI`
  - Pitching: `Split | ERA | WHIP | IP | K | BB`
  - Row label from a `vl/vr/h/a -> "vs LHP"/"vs RHP"/"Home"/"Away"` map,
    falling back to `split.description`.
- Reuses existing modal/table/pill classes; no new styling primitives.

## Error / Edge Handling

- The MLB API can omit an entire sitCode, or individual fields within a split's
  `stat`, for tiny samples. `orderedSplits` drops missing sitCodes; missing fields
  render as blank cells (no `NaN`, no crash). Confirmed live: a pitcher with 0.1 IP
  vs LHP returned no ERA -- the cell rendered blank.
- If `fetchSplits` throws, `splits` stays `[]` and the whole splits section is
  hidden (`orderedSplits.length > 0` guard); the rest of the modal is unaffected.
- Off-season / no-data players simply show no splits section.

## Testing

No automated test runner. Verified with the `webapp-testing` skill (Playwright,
both dev servers via `scripts/with_server.py`):
- Batting tab -> row click -> modal shows season line, four splits, trend, last-10.
- Pitching tab -> same, with pitching header + ERA/WHIP splits.
- Zero console errors across both.
- Graceful-degradation case confirmed (blank ERA for a tiny-sample split).

## Files Changed

- `src/types/mlb.ts` -- add `StatSplit`
- `src/api/mlb.ts` -- add `fetchSplits`
- `src/components/GameLogModal.tsx` -- `seasonStat` prop, header block, splits fetch + table, widen panel
- `src/components/BattingTable.tsx` -- widen `selectedPlayer`, pass `seasonStat`
- `src/components/PitchingTable.tsx` -- same as BattingTable
- `CLAUDE.md` -- update mlb.ts / types / GameLogModal descriptions

No backend/proxy change (`/people/` already allowlisted). No new dependencies.
