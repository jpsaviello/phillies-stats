---
title: Season OPS Trend Pill in the Game Log Modal
date: 2026-07-14
status: approved
---

## Summary

Add a third trend pill for batters in `GameLogModal`: **OPS**, plotting season-to-date OPS after each game, alongside the existing Rolling AVG and HR Pace pills. Pitchers are unchanged. The last-10-games table is unchanged.

No new computation is needed. Verified live (2026-07-14, Bryce Harper, 97 games): the `gameLog` endpoint's per-game `stat.ops` is **season-to-date through that game**, not single-game — it matches the official cumulative formula `(H+BB+HBP)/(AB+BB+HBP+SF) + TB/AB` computed from the same splits to within .001 rounding at every checkpoint (games 1, 2, 3, 11, 51, 97). We parse that string and plot it.

## Alternative considered (rejected)

Recomputing cumulative OPS from counting stats (the `eraProgression` approach) would require adding `hitByPitch`, `sacFlies`, and `totalBases` to `BattingGameStat` and ~20 lines of math that can silently drift from the official formula (catcher's interference, etc.). Since the API already ships the exact official season-to-date value per game, parsing it is both less code and more correct.

## Data Layer

- `src/types/mlb.ts` — add `ops: string` to `BattingGameStat`. No other type changes; the field is already present in every hitting gameLog split.
- No change to `fetchGameLog` — it already returns full-season chronological splits.

## Trend Series Computation

New helper in `src/utils/trends.ts`:

```ts
export function opsProgression(splits: GameLogSplit[], minGames = 10): TrendPoint[]
```

- For each split from index `minGames - 1` onward, emit `{ date, value: Number(stat.ops) }`.
- Skip any point whose parsed value is not finite (guards a malformed/absent string; MLB renders undefined rate stats as things like `"-.--"`).
- The first ~9 games are skipped **by design**: season-to-date OPS is wildly volatile early (a HR on opening day alone is a 4.000+ OPS) and would flatten the rest of the line's y-scale. Starting at game 10 mirrors exactly where the Rolling AVG line begins, so the two batter rate charts start at the same x-position.

Fewer than 2 emitted points falls through to the existing "Not enough games yet" placeholder.

## Modal Integration

In `GameLogModal`'s `TREND_STATS.hitting`, append a third entry:

```ts
{ label: 'OPS', compute: opsProgression, format: formatOps }
```

where `formatOps` renders three decimals with the leading zero stripped below 1 (`.912`) but kept above (`1.024`):

```ts
(v: number) => (v < 1 ? v.toFixed(3).replace(/^0/, '') : v.toFixed(3))
```

The pill row already maps over the stat array, so no other JSX changes. Pill order: Rolling AVG · HR Pace · OPS. Default selection stays Rolling AVG.

Note: `TREND_STATS` is module-level and typed `as const`; the mixed compute signature (`opsProgression` takes an optional second arg like `rollingAvg` already does) fits the existing shape.

## Traded players (decided 2026-07-14)

For a midseason acquisition, the gameLog spans the player's **full season including their previous team**, and its cumulative `ops` does too — so the chart's end value can differ from the batting table's Phillies-only OPS (live example: Derek Hill, `.749` full season vs `.890` in 23 Phillies games). The gameLog endpoint cannot be team-scoped (`teamId` is ignored).

**Decision: keep the full season.** The chart shows the player's accurate season-long stats even across a trade; this matches the scope the other trend charts (Rolling AVG, HR Pace, ERA, K's/Game) and the last-10 table already have. The alternative — filtering splits to `team.id === 143` and recomputing OPS from counting stats — was considered and rejected by the user.

## Error Handling

Unchanged. Non-finite parses are skipped in the helper; a season of unparseable values degrades to the placeholder text, never `NaN` on the chart.

## Testing

Verify with the webapp-testing skill:

- Batting tab → click a regular (e.g., Bryce Harper) → three pills render; click **OPS** → line renders starting at the same x-position as Rolling AVG, end label formatted like `.862` / `1.024`
- Cross-check the plotted end value against the same player's season OPS in the Batting table behind the modal — they must match
- Pitching tab → click a pitcher → still exactly two pills (ERA, K's / Game)
- Hover the OPS chart → crosshair + tooltip with formatted value
- No console errors; screenshot the OPS chart

## Files Changed

- `src/types/mlb.ts` — `ops: string` on `BattingGameStat`
- `src/utils/trends.ts` — new `opsProgression` helper
- `src/components/GameLogModal.tsx` — third hitting pill + OPS formatter
