# Design Spec: Game Story (win probability + spray chart in GameDetailModal)

## Goal

Turn `GameDetailModal` from a box score into a **visual recap of how the game
happened**. Two new sections, both driven by data MLB already publishes and this
app has never touched:

1. **Win probability curve** — the game's swing, plotted across every at-bat,
   with the turning points named.
2. **Spray chart** — every batted ball placed on a field diagram, colored by
   outcome, annotated with exit velocity and launch angle.

The box score answers *what* the final line was. Neither the line score nor the
batting table answers *when the game was decided*, and nothing anywhere in the
app has ever shown where a ball was hit. This is the first genuinely graphical
surface in the product beyond `TrendChart`.

## Data sources — two endpoints, only one of which is currently reachable

Verified against gamePk **825038** (PHI @ ARI, 2026-09-01, Final).

| Section | Endpoint | API version | Reachable today |
|---|---|---|---|
| Win probability | `/game/{pk}/winProbability` | **v1 only** | **No — 404 through the proxy** |
| Spray chart | `/game/{pk}/feed/live` | v1.1 | Yes — already fetched by this modal |

### Spray chart: zero new requests

`hitData` already lives inside the feed `fetchBoxscore` fetches, at
`liveData.plays.allPlays[].playEvents[].hitData`. It is currently trimmed away by
`BOXSCORE_FIELDS`. Adding the fields back costs **~30KB and no extra round trip**:

```
current BOXSCORE_FIELDS : 41,777 bytes
+ spray fields          : 71,682 bytes
```

57 batted balls in that game, **0 missing coordinates**, 1 missing `launchSpeed`.

### Win probability: needs the first `MLB_ALLOWED` change since the proxy shipped

`MLB_ALLOWED` in `server/src/core.ts` maps the `/game/` prefix to **v1.1**.
`winProbability` exists only on **v1** — confirmed directly:

```
v1.1 /game/825038/winProbability -> 404
v1   /game/825038/winProbability -> 200
```

This is the same version mismatch documented for the boxscore endpoint, but here
it cannot be dodged: unlike the box score, win probability has **no v1.1
equivalent**, and it is **not present anywhere in the live feed** (verified —
`allPlays[].about` carries `captivatingIndex` but no probability field). So this
feature requires a backend change, and the design has to accept that.

**The allowlist cannot express this with prefixes alone.** Both
`/game/{pk}/feed/live` and `/game/{pk}/winProbability` start with `/game/`, and
`resolveMlb` takes the **first** `find` match. The entry list must become
predicate-based and ordered most-specific-first:

```ts
const MLB_ALLOWED: [test: (p: string) => boolean, base: string][] = [
  [p => p.startsWith('/game/') && p.endsWith('/winProbability'), MLB_V1],
  [p => p.startsWith('/game/'), MLB_V1_1],
  // ...the five existing v1 prefixes, unchanged in meaning
]
```

Ordering is load-bearing in exactly the way `mlbCachePolicy()`'s `/feed/live`
branch already is — put the general `/game/` rule first and win probability
silently 404s again.

**Deploy consequence, stated plainly.** The `2026-08-13-game-detail` spec
deliberately avoided a backend change so a push to `develop` would auto-deploy
Vercel production and k8s would need only a frontend image rebuild. **This
feature gives that up.** Vercel is still fine (`api/index.ts` imports the same
`core.ts`), but the k8s backend image is local-only (`imagePullPolicy: Never`),
so **k8s needs a full `pipeline.sh` run**, not just a frontend push.

### Cache policy: no change needed, and a dead branch comes alive

`mlbCachePolicy()` tests `/feed/live` -> `no-store` first, then `/game/` -> 60s.
CLAUDE.md records that the `/game/` 60s branch is currently unreachable and
"kept only as the right policy for a future non-live game path."
`winProbability` **is that path**, and 60s is correct for it: a finished game's
curve never changes, but the same URL during a live game does. Client side,
`fetchWinProbability` uses the existing `BOXSCORE` TTL for the same reason.

Trimmed with `fields=`, the win probability response is **22,729 bytes** (from
1,033,568 raw). Total cost of opening the modal becomes ~94KB in two requests,
for a deliberate user action.

## Three upstream traps this design must handle

### 1. Win probability is expressed for the HOME team — the Phillies are often away

The response gives `homeTeamWinProbability` and `homeTeamWinProbabilityAdded`.
Plotted raw, a road game's curve **falls when the Phillies do well**. Both values
must be normalized to the Phillies before anything is drawn:

```ts
const phi = isPhilliesHome ? homeTeamWinProbability : 100 - homeTeamWinProbability
const added = isPhilliesHome ? homeTeamWinProbabilityAdded : -homeTeamWinProbabilityAdded
```

This is the single easiest bug in the feature to ship, because it is **invisible
on home games** — half the sample looks perfect. Verification must include at
least one road game (825038 is one: Phillies away).

### 2. `coordX/coordY` and `totalDistance` are NOT on a common scale — never derive one from the other

The obvious implementation is to convert each batted ball's distance and angle
into a position. It produces a subtly wrong chart. Fitting a ft-per-unit scale
against `totalDistance` gives **2.15 ft/unit**, while the infield landmarks give
**~2.94 ft/unit** — a 37% disagreement, with per-ball errors like:

```
pred 367.1 ft   actual 415.0   (fly_ball, 27deg)
pred 213.7 ft   actual 161.0   (line_drive, 19deg)
```

The cause is that the coordinate is **where the ball was fielded** while
`totalDistance` is Statcast's **projected flight** — a fly ball caught on the
run reads shorter by coordinate than by distance. They come from different
measurement systems.

**Rule: `coordX/coordY` position the dot. `launchSpeed`, `launchAngle` and
`totalDistance` are labels only, never geometry.**

### 3. The coordinate system, established from fielder positions rather than folklore

Averaging the 57 batted balls by their `location` code confirms the frame
independently of any distance assumption:

```
loc  pos    n   meanX  meanY
  2   C     2   139.3  202.9     <- home plate is near y=203
  1   P     4   129.8  183.0     <- mound, 60'6" up from the plate
  6   SS    7   107.1  149.3  \  symmetric about x~127,
  4   2B    5   147.6  151.5  /  same depth
  7   LF   10    83.5   97.1
  8   CF    7   126.3   83.6     <- dead center confirms x~126 at the plate
  9   RF   16   173.8  104.0
```

So: **home plate ~(126, 203); x increases toward right field; y DECREASES toward
the outfield.** Because SVG's y also grows downward, `coordY` maps straight to
SVG y with **no flip** — the outfield naturally lands at the top of the viewBox.
Calibrate the drawn field from the infield (mound at 60'6", bases at 90',
~2.9 ft/unit), not from `totalDistance`.

## Component design

Two new presentational components plus one pure utils module, matching the
house pattern (`bullpen.ts` / `playoffPush.ts` / `tiebreakers.ts` are pure so
they can be replayed against real statsapi JSON with no browser).

### `src/utils/gameStory.ts` (pure)

- `toPhilliesProbability(entries, isPhilliesHome): WinProbPoint[]` — normalization
  from trap #1, plus x-positioning by `atBatIndex`.
- `turningPoints(points, n = 3): WinProbPoint[]` — top n by `|added|`, in game
  order. Ties broken by earlier at-bat.
- `battedBalls(feed, philliesTeamId): BattedBall[]` — flattens
  `allPlays[].playEvents[].hitData`, attaching batter name, `result.event`,
  inning, and which side hit it. **Drops any ball with no `coordinates`** rather
  than defaulting it to home plate.
- `outcomeClass(event): 'hit' | 'out'` — coloring, derived from `result.event`.

### `src/components/WinProbabilityChart.tsx`

Hand-rolled SVG, no charting dependency, following `TrendChart.tsx`'s conventions
(fixed `viewBox`, `MARGIN` constant, `role="img"` with a descriptive `aria-label`,
the `RED` literal commented as the SVG-attribute exception to the token rule).

- x = at-bat index, y = Phillies win probability 0–100%.
- A 50% reference line; area shaded above it in `phillies-red`, below in gray.
- Inning boundaries as faint vertical ticks so the curve is readable as a game.
- Turning points marked with dots.

### `Turning points` list — required, not decoration

Directly beneath the chart, the top 3 swings render as text:

```
Top 1st   Trea Turner doubles (23)          +11.4%
Bot 4th   Jordan Lawlar homers (4)           -8.7%
```

This is deliberately **not** a hover tooltip. It is simultaneously the
screen-reader path (a bare `role="img"` chart is unreadable non-visually), the
touch path (this app's primary target is 375px, where hover does not exist), and
editorially the most interesting content in the section. `result.description`
supplies the text already formatted.

### `src/components/SprayChart.tsx`

- Field diagram drawn in the `coordX/coordY` frame from trap #3: foul lines from
  home plate, infield diamond, an outfield arc sized to contain the plotted points.
- One dot per batted ball. Color = hit vs out. Radius scaled by `launchSpeed`,
  **with a fixed fallback radius when `launchSpeed` is absent** (1 of 57 in the
  sample) — never `NaN` into an `r` attribute.
- Phillies batted balls only by default, with a toggle for the opponent's, so
  the two sides never overplot into an unreadable smear.
- Below it, a compact "hardest hit" line naming the top 2 by exit velocity —
  same accessibility and touch reasoning as the turning-points list.

### Integration into `GameDetailModal.tsx`

Section order becomes: Header -> Line score -> Decisions -> **Win probability** ->
**Spray chart** -> team batting/pitching tables. Facts first (they are compact),
then the two visuals, then the detail tables.

The win probability fetch is a **second, independent `useEffect`**, following the
`GameLogModal` precedent where the game-log and splits fetches fail separately —
a winProbability failure must not blank the box score the user actually opened.
Each visual section self-hides when its data is missing or empty; the existing
modal-level inline error stays as-is for a boxscore failure.

Preview games are already unopenable (`abstractGameState !== 'Preview'`), so
neither section needs an unstarted-game branch. In-progress games work: the curve
is simply shorter.

## Feature flag

`enable-game-story` (boolean, temporary), destructured in `App.tsx` as
`enableGameStory = true` so an unreachable LD client preserves the feature —
matching `enableDailyBriefing` / `enableOnThisDay` / `enableGameDetail`.

Nested under the existing `enable-game-detail` deliberately: the visuals are the
novel, higher-risk half and must be killable **without** taking the box score
down with them. Create it with targeting ON — a flag created OFF serves
`offVariation` to every LD-connected client, which is the trap
`enable-bullpen-usage` hit.

## Out of scope

- **Pitch plot / strike zone** (`pitchData.coordinates.pX/pZ`, pitch type,
  velocity, umpire call). Verified present and ~176KB/game trimmed. It is the
  natural follow-on, but it needs the most baseball literacy of the three
  visuals and would triple this diff.
- **Season-level spray charts** for a player in `GameLogModal`. Would mean ~130
  game feeds; needs its own design for aggregation and cost.
- **Expected stats** (xBA/xwOBA). Not in this payload at any hydration level.
- **League-average comparison** on either chart. Would require league-wide data
  the app does not fetch, and inventing a baseline would be exactly the
  fabricated-precision failure `PlayoffPush` refuses for playoff odds.
- Backfilling win probability into `LiveGameStrip` for in-progress games.
