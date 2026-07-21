# Player Detail View Implementation Plan

**Goal:** Expand `GameLogModal` into a player detail view: a season-line header +
situational splits (vs LHP/RHP, home/away) on top of the existing rolling-trend
chart and last-10-games table.

**Architecture:** The season line reuses the `BattingStats`/`PitchingStats` the
tables already loaded, passed in via a new `seasonStat` prop (no fetch). Splits come
from a new `fetchSplits(personId, group)` that hits the same `/people/{id}/stats`
path with `stats=statSplits&sitCodes=vl,vr,h,a`. The modal runs the game-log and
splits fetches in two independent `useEffect`s so a splits failure never blanks the
trend/table.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4, MLB Stats API -- no test
runner; verify via `webapp-testing` (Playwright).

> **Status:** Implemented and verified (build + lint + Playwright, zero console
> errors). This plan is a retroactive record; the checkboxes reflect completed work.

## Global Constraints

- No backend change -- `/people/` is already allowlisted in `server/src/index.ts`.
- No new dependencies, no router (stays a modal).
- Splits fetch fails soft (`catch -> []`); its section is hidden when empty.
- The API may omit sitCodes or individual `stat` fields for tiny samples -- order by
  requested codes, filter missing, render absent fields blank.
- Reuse existing modal/table/pill classes and the `HeroStrip` stat-tile idiom.

---

### Task 1: Data layer -- StatSplit type + fetchSplits

**Files:** `src/types/mlb.ts`, `src/api/mlb.ts`

- [x] Add `StatSplit` to `src/types/mlb.ts`:

```ts
export interface StatSplit {
  split: { code: string; description: string } // vl, vr, h, a
  stat: BattingStats | PitchingStats
}
```

- [x] Import `StatSplit` and add `fetchSplits` after `fetchGameLog` in `src/api/mlb.ts`:

```ts
export async function fetchSplits(personId: number, group: 'hitting' | 'pitching') {
  const data = await get<{ stats: { splits: StatSplit[] }[] }>(
    `/people/${personId}/stats?stats=statSplits&sitCodes=vl,vr,h,a&group=${group}&season=${SEASON}&sportId=1`
  )
  return data.stats[0]?.splits ?? []
}
```

- [x] `npm run build` && `npm run lint` -- both clean.

---

### Task 2: Expand GameLogModal

**Files:** `src/components/GameLogModal.tsx`

- [x] Add `seasonStat: BattingStats | PitchingStats` to `Props`.
- [x] Add a `StatTile` helper and `SPLIT_ORDER` / `SPLIT_LABELS` constants.
- [x] Add `splits` state + a second `useEffect` calling `fetchSplits` (keyed
      `[personId, group]`, `catch -> setSplits([])`), plus an `orderedSplits` memo
      that maps `SPLIT_ORDER` onto the returned splits and filters out missing ones.
- [x] Render, inside `p-4`, before the loading gate:
      - season-line tile grid (hitting: AVG/OBP/SLG/OPS/HR/RBI/SB;
        pitching: ERA/W-L/IP/K/WHIP/SV),
      - splits table guarded by `orderedSplits.length > 0`.
- [x] Widen the panel `max-w-2xl` -> `max-w-3xl`.
- [x] `npm run build` && `npm run lint` -- both clean.

---

### Task 3: Wire seasonStat from both tables

**Files:** `src/components/BattingTable.tsx`, `src/components/PitchingTable.tsx`

- [x] Widen `selectedPlayer` state to `{ id, name, stat }` (`BattingStats` /
      `PitchingStats` respectively).
- [x] Set `stat` in the row `onClick`.
- [x] Pass `seasonStat={selectedPlayer.stat}` to `<GameLogModal>`.
- [x] `npm run build` && `npm run lint` -- both clean.

---

### Task 4: Verify end-to-end + docs

- [x] Run both dev servers via `scripts/with_server.py`, drive with Playwright:
      batting + pitching modals each show season line, four splits, trend, last-10;
      zero console errors; screenshots reviewed.
- [x] Confirm graceful degradation: tiny-sample split with a missing ERA renders a
      blank cell, no crash.
- [x] Update `CLAUDE.md` (mlb.ts / types / GameLogModal descriptions).

---

## Post-Implementation Notes

- Verified live that `statSplits` can return a split with a missing rate field
  (Bryse Wilson, 0.1 IP vs LHP -> no ERA). Rendering absent fields as blank cells
  (rather than assuming presence) was the right call and needed no extra guard code
  beyond reading `s.era` directly, which is `undefined` -> renders empty.
- Season line intentionally shows the table's Phillies-only season stat. Note this
  can differ from the full-season chart for traded players (same caveat already
  documented for the OPS trend), because gameLog/statSplits span the prior team.
