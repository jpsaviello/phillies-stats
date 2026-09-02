# Implementation Plan: Game Story (win probability + spray chart)

Spec: `docs/superpowers/specs/2026-09-02-game-story-design.md`
Base: `feature/pitcher-handedness` @ e203ff9 (or `develop` once that merges)

Tasks 1–3 are backend and must land before Task 5 can be verified at all;
Tasks 4/6/7 (spray chart) depend only on Task 2 and can proceed in parallel.

## Task 1 — Backend: `MLB_ALLOWED` becomes predicate-based

`server/src/core.ts`. Convert the tuple type from
`[prefix: string, base: string][]` to `[test: (p: string) => boolean, base: string][]`,
and update `resolveMlb`'s `find` accordingly.

Entry order, most-specific first:

1. `p => p.startsWith('/game/') && p.endsWith('/winProbability')` → `MLB_V1`
2. `p => p.startsWith('/game/')` → `MLB_V1_1`
3. …the five existing v1 prefixes (`/teams/`, `/stats`, `/standings`, `/schedule`, `/people/`), semantics unchanged

Add a comment on entry 1 explaining that prefixes alone cannot express this
(both paths start with `/game/`, `find` takes the first match) and that
reordering silently reintroduces the 404 — the same ordering constraint
`mlbCachePolicy()` documents for its `/feed/live` branch.

**No change to `mlbCachePolicy()`.** `winProbability` correctly falls into the
existing `/game/` 60s branch, which this feature makes reachable for the first
time. Confirm the `/feed/live` → `no-store` test still runs first.

Verify: `curl 'localhost:8080/api/mlb/game/825038/winProbability?fields=...'`
returns 200 with `Cache-Control: public, max-age=60...`, and every pre-existing
proxied path still resolves to the same base as before.

## Task 2 — Types

`src/types/mlb.ts`:

- `WinProbEntry` — trimmed shape: `{ atBatIndex, homeTeamWinProbability, homeTeamWinProbabilityAdded, result: { description, event }, about: { inning, halfInning, captivatingIndex } }`
- `WinProbPoint` — normalized: `{ atBatIndex, inning, halfInning, philliesWinProb, added, description }`
- `HitData` — `{ launchSpeed?, launchAngle?, totalDistance?, trajectory?, hardness?, location?, coordinates?: { coordX, coordY } }`. Every measurement optional; only `coordinates` gates rendering.
- `BattedBall` — `{ batterId, batterName, event, inning, isTopInning, isPhillies, hit: HitData }`
- Extend `GameBoxscore.liveData` with the optional `plays.allPlays[]` shape carrying `playEvents[].hitData`, `matchup.batter`, `result.event`, `about.inning/isTopInning`.

## Task 3 — API

`src/api/mlb.ts`:

- `WIN_PROB_FIELDS = 'result,description,event,about,inning,halfInning,captivatingIndex,homeTeamWinProbability,homeTeamWinProbabilityAdded,atBatIndex'`
  (verified: trims 1,033,568 B → 22,729 B).
- `fetchWinProbability(gamePk): Promise<WinProbEntry[]>` → `get('/game/{pk}/winProbability?fields=...', BOXSCORE)`. Note in the comment that the response is a **bare array**, not an object — unlike every other endpoint in this file — and that it is the one v1 path under `/game/`.
- Extend `BOXSCORE_FIELDS` with: `plays,allPlays,playEvents,hitData,launchSpeed,launchAngle,totalDistance,trajectory,hardness,location,coordinates,coordX,coordY,matchup,batter,isTopInning`.
  (`result`, `event`, `about`, `inning`, `fullName`, `person`, `id` are already in the list.)
  Update the size comment: **~39KB → ~72KB**, still one request.

## Task 4 — Pure logic

New `src/utils/gameStory.ts`. No React, no fetch — replayable against saved
statsapi JSON, same posture as `bullpen.ts` / `playoffPush.ts`.

- `toPhilliesProbability(entries, isPhilliesHome): WinProbPoint[]`
  — **the normalization from spec trap #1.** Flips both the probability and the
  sign of `added` when the Phillies are away. Carries a comment saying this bug
  is invisible on home games.
- `turningPoints(points, n = 3): WinProbPoint[]` — top n by `Math.abs(added)`,
  returned in game order, ties to the earlier `atBatIndex`.
- `battedBalls(feed, philliesTeamId): BattedBall[]` — flattens
  `allPlays[].playEvents[].hitData`. **Drops any entry whose `coordinates` is
  missing** rather than defaulting it. Determines `isPhillies` from the batting
  half-inning against the home/away team ids, not from a roster lookup.
- `outcomeClass(event): 'hit' | 'out'`.
- Field-frame constants, from the spec's fielder-position table:
  `HOME_PLATE = { x: 126, y: 203 }`, `FT_PER_UNIT = 2.9`. A comment must state
  that these were derived from infield landmarks and that `totalDistance` must
  **never** be used to position a dot (spec trap #2, with the 2.15-vs-2.94
  numbers).

## Task 5 — `WinProbabilityChart.tsx`

Follow `TrendChart.tsx`'s conventions exactly: fixed `VIEW_W`/`VIEW_H`/`MARGIN`
constants, `role="img"` with a descriptive `aria-label`, the `RED` SVG literal
carrying the "canonical token is --color-phillies-red" comment.

- Props: `{ points: WinProbPoint[], opponentName: string }`.
- x = `atBatIndex`, y = 0–100%. 50% reference line; area above shaded red, below gray.
- Faint vertical ticks at inning boundaries.
- Dots on the turning points.
- **Turning-points list rendered below the chart as text**, not a tooltip —
  it is the screen-reader path and the 375px touch path (spec). Format:
  `Top 1st · Trea Turner doubles (23) · +11.4%`.
- Returns `null` for fewer than 2 points.

## Task 6 — `SprayChart.tsx`

- Props: `{ balls: BattedBall[], opponentName: string }`.
- Field drawn in the `coordX/coordY` frame: foul lines from `HOME_PLATE`, infield
  diamond, outfield arc sized to contain the plotted points. **No y-flip** —
  `coordY` maps straight to SVG y (spec trap #3).
- One dot per ball; color by `outcomeClass`; radius from `launchSpeed` with a
  **fixed fallback radius when it is absent** — never `NaN` into `r`.
- Default to Phillies batted balls with a toggle for the opponent's.
- "Hardest hit" text line naming the top 2 by exit velocity, below the diagram.
- `role="img"` + `aria-label` summarizing count and outcome split.
- Returns `null` on an empty list.

## Task 7 — Mount into `GameDetailModal.tsx`

- New prop `enableGameStory: boolean`, threaded from `App.tsx` → `Schedule` →
  modal, alongside the existing `enableGameDetail`.
- Second, **independent** `useEffect` for `fetchWinProbability`, cancellation-guarded,
  its own error state — a winProbability failure must not blank the box score
  (the `GameLogModal` game-log/splits precedent).
- Section order: Header → Line score → Decisions → WinProbabilityChart →
  SprayChart → team tables. Each visual self-hides when its data is empty.
- `isPhilliesHome` computed once from `gameData.teams.home.id === PHILLIES_ID`
  and passed into `toPhilliesProbability`.

## Task 8 — Checks

`npm run build`, `npm run lint`, and `npm --prefix server run build` — the
backend build is a separate `tsc` and Task 1 is the first `core.ts` change here
in a while. Also typecheck `api/index.ts` standalone, since it imports the same
`core.ts`.

## Task 9 — Browser verification (required before "done")

Per CLAUDE.md, `webapp-testing` with both servers up. Must include:

- **A road game and a home game.** 825038 is a road game and is the regression
  test for spec trap #1: the curve must END near 100% (Phillies won 6-1 away).
  A home game must also be checked, or the normalization bug passes vacuously.
- A blowout and a one-run game — the second should show a visibly wandering curve.
- 375px and 1280px, 0px horizontal overflow, both charts legible at mobile width.
- Spray chart dots visually inside the drawn field, with the left/center/right
  distribution matching the game's own `location` codes.
- Turning-points and hardest-hit text present and matching the plotted extremes.
- Zero console errors; `enable-game-story` off restores the pre-feature modal exactly.
- Note: `wait_until='networkidle'` never settles on this app (LD holds an SSE
  stream) — use `domcontentloaded` plus a wait.

## Task 10 — Docs

- CLAUDE.md: `WinProbabilityChart` / `SprayChart` in the components list,
  `gameStory.ts` in utils, a **Game Story** section covering the three traps,
  and — importantly — update the `MLB_ALLOWED` description plus the note that
  the `/game/` 60s cache branch is **no longer unreachable**.
- `.superpowers/sdd/progress.md`: new ledger section.

## Not in this plan

- Pitch plot / strike zone (spec: out of scope, natural follow-on).
- Season spray charts in `GameLogModal`.
- Creating the LD flag — user action, and it must be created with targeting ON.
- Deploy. **k8s needs a full `pipeline.sh`** this time because Task 1 changes the
  backend image (`imagePullPolicy: Never`, local-only); Vercel needs only the push.
