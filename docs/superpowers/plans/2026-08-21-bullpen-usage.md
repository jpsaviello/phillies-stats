# Implementation Plan: Bullpen Usage panel

Spec: `docs/superpowers/specs/2026-08-21-bullpen-usage-design.md`

## Task 1 — Types

`src/types/mlb.ts`:

- `BullpenOuting { gamePk, date, pitches, inningsPitched, battersFaced, earnedRuns, strikeOuts, baseOnBalls, hits, inheritedRunners, wasStart }`
- `PitcherWorkload { playerId, name, outings, totalPitches, totalOuts, daysSinceLast, role: 'reliever' | 'starter', flags: string[] }`
- `BullpenBoxscore` — trimmed live-feed shape: `liveData.boxscore.teams.{home,away}` with `team.id`, `pitchers: number[]`, `players: Record<string, { person, stats.pitching }>`.

## Task 2 — API

`src/api/mlb.ts`, next to the existing `fetchBoxscore`:

- `BULLPEN_FIELDS` — `liveData,boxscore,teams,home,away,team,id,players,person,fullName,stats,pitching,pitchesThrown,inningsPitched,battersFaced,gamesStarted,earnedRuns,strikeOuts,baseOnBalls,hits,inheritedRunners,pitchers`
- `fetchBullpenBoxscore(gamePk)` → `get('/game/{pk}/feed/live?fields=...')`. Comment why it exists separately from `fetchBoxscore` (different field set, per-game not per-modal) and that the `/game/` → v1.1 mapping already covers it.

No change to `fetchSchedule` or `fetchRoster` — both used as-is.

## Task 3 — Pure logic

New `src/utils/bullpen.ts`. No React, no fetching, no dates from `Date.now()`
passed implicitly — `today` is an argument so it is testable and so the ET
resolution stays at the call site.

- `extractPhilliesPitchers(box, gamePk, date)` → `BullpenOuting[]`. Reads
  `teams.{side}` where `team.id === 143`, iterates `pitchers[]` (not `players`
  key order), pulls each line from `players['ID'+pid].stats.pitching`.
- `buildWorkloads(outings, roster, seasonSplits, today)` → `PitcherWorkload[]`.
  - Group outings by `playerId`.
  - Union with active-roster pitchers so never-appeared arms get a zero-outing entry.
  - Role: season `gamesStarted / gamesPitched >= 0.5` → starter; if the player has
    no season split, fall back to `wasStart` on any outing in the window.
  - `daysSinceLast` via `daysBehind(lastDate, today)`; `null` when no outings.
  - `totalOuts` via `inningsToOuts`, summed as outs — never float IP.
- `workloadFlags(outings, today)` → `string[]`. Purely descriptive, per spec
  decision 1: `back-to-back`, `3 straight days`, `3 of last 4`, `40+ pitches` on
  the most recent outing. No availability language.
- `sortWorkloads(list)` → relievers first by `daysSinceLast` ascending (nulls
  last), then starters, same ordering.

Reuse, do not reimplement: `inningsToOuts` / `outsToInnings` / `eraOver` from
`src/utils/innings.ts`, `easternToday` / `daysBehind` from `src/utils/date.ts`.

## Task 4 — Component

New `src/components/BullpenUsage.tsx`, props `{ seasonSplits: { player, stat }[] }`.

Own `useEffect`:
1. `easternToday()` → window start = today − 6 days.
2. `fetchSchedule(start, today)` → Final games → `gamePk` + date.
3. `Promise.allSettled(gamePks.map(fetchBullpenBoxscore))` — **allSettled, not
   all**, so one dead game keeps the rest (spec: States). Track whether any
   rejected to drive the partial-window note.
4. `fetchRoster().catch(() => [])` in parallel — roster failure degrades, does not
   blank (spec: States).
5. Build via Task 3, store.

Render per spec UI: header, Bullpen group, Rotation group, footer note (window
span, plus partial-window warning when a boxscore failed). `TableSkeleton` while
loading. `return null` when the schedule fetch fails or the window has no games.
Uniform row styling — no color-coding by workload.

## Task 5 — Mount + parent refactor

`src/components/PitchingTable.tsx`:

- Convert the two early returns (`if (loading) return <TableSkeleton/>`,
  `if (error) return <ErrorState/>`) into a single `return (` with an inline
  `{loading ? ... : error ? ... : <table/>}` ternary — mirroring `Standings.tsx`.
  Move the `sorted` / `cols` derivation so it is not evaluated while `splits` is
  still `[]`.
- Render `{enableBullpenUsage && <BullpenUsage seasonSplits={splits} />}` above
  that ternary, so a season-stats failure cannot take the panel down.
- Add `enableBullpenUsage: boolean` to `Props`.

`src/App.tsx`: destructure `enableBullpenUsage = true` from `useFlags()` alongside
the existing four, pass to `<PitchingTable>`. Comment it the way
`enableMatchupPreview` is commented.

## Task 6 — Checks

- `npm run build` (tsc + vite) and `npm run lint` (Oxlint) both clean.
- Confirm no duplicate `fetchPitchingStats` call appears in the network log.

## Task 7 — Browser verification (required before "done")

Per CLAUDE.md, lint + typecheck is not sufficient. Using the `webapp-testing`
skill and `scripts/with_server.py`:

- Both servers up (`npm run dev:server` + `npm run dev`).
- Navigate to the Pitching tab, screenshot the panel, confirm the real Kerkering /
  Duran / Bowlan multi-day rows from the spec's sample render as expected.
- Confirm the rotation group shows the five starters at their true rest.
- Check the console for errors.
- Re-check at 375px that the outing trail drops and the row stays readable.
- Verify the flag-off path renders the tab exactly as it is today.

No chat interaction anywhere in this feature, so **nothing here costs money**.

## Task 8 — Docs

Update `CLAUDE.md`'s component list with `BullpenUsage`, recording the three
load-bearing decisions in the same compressed style as the `MatchupPreview` and
`PlayoffPush` entries — especially that the roster cannot distinguish SP from RP,
and that the panel deliberately reports workload rather than predicting
availability.

Note in the flag list that `enableBullpenUsage` does not yet exist in
LaunchDarkly, same caveat as `enableMatchupPreview`.

## Not in this plan

Backend, `k8s/`, `server/`, migrations, `package.json`, `vercel.json` — all
untouched. If any task starts editing one of those, the plan is wrong; stop.
