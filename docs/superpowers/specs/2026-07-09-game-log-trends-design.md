---
title: Season Trend Charts in the Game Log Modal
date: 2026-07-09
status: approved
---

## Summary

Add a season trend chart to `GameLogModal`, above the existing last-10-games table. Hitters get a rolling 10-game batting average line with a toggle to cumulative home runs; pitchers get a season ERA progression line with a toggle to strikeouts per outing. The chart is a small hand-rolled SVG line chart (`TrendChart`) — no new dependencies. The data is already available: the `gameLog` endpoint returns the **full season** of splits (verified live: 89 games for a position player as of 2026-07-09, oldest-first); the current code just slices off the last 10.

## Data Layer

Change `fetchGameLog` in `src/api/mlb.ts` to return the full season, chronological (oldest-first, exactly as the API sends it):

```ts
export async function fetchGameLog(personId: number, group: 'hitting' | 'pitching') {
  const data = await get<{ stats: { splits: GameLogSplit[] }[] }>(
    `/people/${personId}/stats?stats=gameLog&group=${group}&season=${SEASON}&sportId=1`
  )
  // API returns the season's splits oldest-first (chronological). Callers that
  // want "last N, most recent first" slice/reverse themselves.
  return data.stats[0]?.splits ?? []
}
```

`GameLogModal` (the only consumer) derives the table rows itself: `[...season].slice(-10).reverse()`. The chart consumes the full chronological array. Still one fetch per modal open. No type changes — `GameLogSplit`/`BattingGameStat`/`PitchingGameStat` already carry every field the chart needs.

**CLAUDE.md must be updated** — it currently documents `fetchGameLog` as returning the last 10 reversed.

## Trend Series Computation

New module `src/utils/trends.ts` — pure functions from `GameLogSplit[]` (chronological) to chart points `{ date: string; value: number }[]`:

- **`rollingAvg(splits, window = 10)`** (hitting): for each game index `i ≥ window - 1`, value = `sum(hits) / sum(atBats)` over the trailing window. Skip any window whose AB total is 0. First point appears at game 10 — the line starts partway into the season by design.
- **`cumulativeHomeRuns(splits)`** (hitting): running HR total after each game.
- **`eraProgression(splits)`** (pitching): after each appearance, `9 × cumER / cumIP`. `inningsPitched` is a string like `"6.1"` = 6⅓ innings — parse as `whole + tenths/3`. Skip points while cumulative IP is 0. Cap displayed ERA at 20 to keep an early-season blowup from flattening the rest of the line (cumulative values keep the true sum; only the plotted point is capped).
- **`strikeoutsPerGame(splits)`** (pitching): K's for each appearance (raw per-game values, not cumulative).

A stat with fewer than 2 computed points renders a "Not enough games yet" placeholder instead of a chart.

## TrendChart Component

New `src/components/TrendChart.tsx`:

```ts
type Props = {
  points: { date: string; value: number }[]  // chronological
  yFormat: (v: number) => string             // e.g. .273, 28, 3.42
}
```

Per the dataviz skill (single-series line chart, brand red validated against white — all checks pass):

- SVG with `viewBox`, `w-full` responsive, fixed aspect (~640×180)
- **Line:** 2px, `#E81828`, round join/cap; **area wash** under the line at 10% opacity
- **End dot:** r=4 filled `#E81828` with a 2px white surface ring, marking the latest value; latest value directly labeled at the line end (only that point — no per-point labels)
- **Gridlines:** 3–4 horizontal hairlines (1px, light gray), y-tick labels in muted gray `tabular-nums`; y-domain padded to clean round values
- **X-axis:** month labels ("Apr", "May", …) at the first game of each month; no vertical gridlines
- **Hover layer:** a transparent overlay tracks the pointer, snaps a vertical hairline crosshair to the nearest point, and shows a small tooltip (date + formatted value, value visually leading). Built with React state — no external lib. Tooltip text set via JSX text (React escapes by default).
- **Text tokens:** all labels/ticks in grays — never in the series red
- No legend (single series; the toggle label above the chart names the plotted stat)

## Modal Integration

In `GameLogModal`, between the header and the games table:

- A pair of small pill toggle buttons (active pill: `bg-[#E81828] text-white`; inactive: gray outline):
  - hitting: **Rolling AVG** · **HR Pace**
  - pitching: **ERA** · **K's / Game**
- `useState` for the selected stat, defaulting to Rolling AVG / ERA; computed series memoized from the fetched splits
- Chart section renders under the existing loading/error handling; empty/short seasons fall through to the placeholder text
- Table header text stays "Last 10 Games"; table behavior unchanged

## Error Handling

Unchanged from today: fetch failure shows the existing red error text and no chart or table. Bad numeric edge cases (0 AB windows, 0 IP) are handled in `trends.ts` by skipping points, never producing `NaN`/`Infinity`.

## Testing

Verify with the webapp-testing skill:
- Batting tab → click a regular (e.g., Alec Bohm) → modal shows Rolling AVG chart + table; toggle to HR Pace re-renders monotonically increasing line
- Pitching tab → click a starter (e.g., Aaron Nola) → ERA progression renders; toggle to K's / Game
- Hover over the chart → crosshair + tooltip with date and value
- A player with very few games (September call-up equivalent / low `gamesPlayed`) → "Not enough games yet" placeholder, table still renders
- No console errors; screenshot both chart variants

## Files Changed

- `src/api/mlb.ts` — `fetchGameLog` returns full season, chronological
- `src/utils/trends.ts` — new; series computation helpers
- `src/components/TrendChart.tsx` — new; SVG line chart with hover layer
- `src/components/GameLogModal.tsx` — derive last-10 locally, add stat toggle + chart
- `CLAUDE.md` — update `fetchGameLog` description
