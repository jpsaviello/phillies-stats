# Implementation Plan: Game Detail Modal

Spec: `docs/superpowers/specs/2026-08-13-game-detail-design.md`

## Confirmed Decisions

- Data comes from the **v1.1 live feed**, not `/game/{pk}/boxscore` — no backend change.
- Both teams' box scores are shown, stacked, Phillies first.
- Feature flag `enable-game-detail`, defaulted `true` in the `useFlags()` destructure.
- Rows are clickable only when `abstractGameState !== 'Preview'`; in-progress games open.
- Player names do **not** link into `GameLogModal` (see spec, out of scope).

## Tasks

### Task 1: `fetchBoxscore` + types
**Files:** `src/api/mlb.ts`

Add `BoxscorePlayer`, `BoxscoreBatting`, `BoxscorePitching`, `BoxscoreTeam` and
`GameBoxscore` interfaces alongside the existing `LiveFeed` (declared in this file,
not `types/mlb.ts` — `LiveFeed`/`Game` set that precedent), plus `BOXSCORE_FIELDS`
and `fetchBoxscore(gamePk)`.

Every nested field the API can omit is modeled optional. `stats.batting` and
`stats.pitching` are `Partial<>` because the API returns `{}` for players who
didn't appear.

**Verify:** `npm run build` (runs `tsc -b`).

### Task 2: `GameDetailModal`
**Files:** `src/components/GameDetailModal.tsx` (new)

Shell copied structurally from `GameLogModal.tsx`. Helpers:
- `played(player, group)` — the non-empty-stats filter (Trap 1).
- `battingRows(team)` — sorts by `battingOrder` slot code, flags substitutes (Trap 2).
- `pitchingRows(team)` — maps `pitchers[]` through the players dict.

Sub-components `LineScore` and `TeamBoxscore` keep the main component readable.

**Verify:** browser run, below.

### Task 3: Schedule rows + flag wiring
**Files:** `src/components/Schedule.tsx`, `src/App.tsx`

`Schedule` gains `selectedGame` state and its first prop. Click handlers are spread
conditionally so flag-off rows keep their original markup. `App.tsx` extends the
existing `useFlags()` destructure and passes the flag down.

**Verify:** `npm run lint` and `npm run build` clean.

### Task 4: LaunchDarkly flag
Create `enable-game-detail` (boolean, temporary, client-side ID availability) in
project `default`, matching `enable-daily-briefing` / `enable-on-this-day`.

Created flags are OFF in all environments — the flag must be toggled on in
production for the feature to reach users, since an LD-served `false` overrides the
code default of `true`.

### Task 5: Browser verification
Per CLAUDE.md, lint/build alone is not sufficient. Drive the real app with
`webapp-testing` and confirm against known games.

## Verification results (2026-08-13)

`npm run lint` clean. `npm run build` clean.

Driven with Playwright via `scripts/with_server.py` running both servers. Note
`wait_for_load_state('networkidle')` never settles on this app — the LaunchDarkly
client holds an SSE stream open — so waits must key on real elements instead.

**Flag ON (code default, LD unreachable path):**
- 13 of 25 Schedule rows clickable; the 12 future rows and today's not-yet-started
  game are correctly inert.
- gamePk 823018 (Aug 10, PHI 6 STL 5) renders `PHI 0 2 0 0 1 0 1 2 0 | 6 8 0` and
  `STL 0 0 0 0 0 2 0 3 0 | 5 8 2`, matching the raw API.
- `W: Andrew Painter`, `L: Hunter Dobbins`, `S: Jonathan Bowlan`.
- Batting order renders Schwarber (slot 100) with Bohm (slot 101) indented beneath
  him — Trap 2 handled. Ten batters, three pitchers, no rostered non-participants.
- Escape closes the modal.
- gamePk 823425 (Aug 9, 12 innings) renders inning columns 1–12; at 375px the line
  score scrolls inside its own container (scrollWidth 428 > clientWidth 311) while
  the page does not scroll horizontally (375 = 375).
- No console errors at any point.

**Flag OFF (verified against the real flag, which LD creates off):**
- 0 of 25 rows clickable; clicking a Final row does nothing; no console errors.

## Status

- `enable-game-detail` was toggled **ON in production** on 2026-08-13 and verified
  working against the local k8s cluster (`phillies-stats.com`) after a `pipeline.sh`
  build and rollout.
- Because k8s and Vercel share the same LD `production` environment, and the flag is
  already on, the feature goes live on Vercel the moment this code is pushed to
  `develop` — no second toggle needed.

## Not done

- No per-environment or per-user flag control: `main.tsx` initializes a single
  anonymous context (`key: 'anonymous'`), so LD sees every visitor as the same
  context and both deploy targets read the same environment. Splitting them would
  need a real context key and a separate client-side ID.
