# Design Spec: Game Detail Modal (Schedule tab box scores)

## Goal

Make every started game on the Schedule tab openable into a real box score: an
inning-by-inning line score, both teams' batting and pitching lines, and the
W/L/SV decisions. Today a Schedule row is a dead end — it shows `W 5–3` with no
way to find out how.

This is the last major MLB data surface the app doesn't expose. `GameLogModal`
covers a player across a season, `LiveGameStrip` covers a game in progress, but a
finished game has no detail view.

## Data Source — the v1.1 live feed, not the boxscore endpoint

No backend change. This is the load-bearing decision in the design.

The obvious endpoint is `/game/{pk}/boxscore`, which lives on **api/v1**. But
`MLB_ALLOWED` in `server/src/core.ts` maps the `/game/` prefix to **api/v1.1** —
the same mismatch that already forces `server/src/chat.ts` to call
`statsapi.mlb.com` directly rather than going through the app's proxy.

Rather than widen the allowlist, the modal reads the **v1.1 live feed**
(`/game/{pk}/feed/live`), which is already allowlisted and already used by
`fetchLiveFeed` for `LiveGameStrip`. Verified against gamePk 823018 (PHI 6 STL 5,
2026-08-10), `liveData` carries everything needed in **one request**:

| Field | Supplies |
|---|---|
| `liveData.linescore.innings[]` | Per-inning R/H/E for both sides |
| `liveData.linescore.teams` | R/H/E totals |
| `liveData.boxscore.teams.{home,away}` | Players, positions, per-game stats, `pitchers[]` |
| `liveData.decisions` | W / L / SV pitchers |

The raw feed is ~860KB; MLB's `fields=` param trims it to **~39KB** — the same
technique `LIVE_FEED_FIELDS` already uses.

**Why this matters operationally:** a frontend-only feature means a push to
`develop` auto-deploys Vercel production, and k8s needs only a frontend image
rebuild. The backend image is local-only (`imagePullPolicy: Never`) and any
`core.ts` change would have required a full `pipeline.sh` run.

## Two upstream traps this design must handle

**1. `players` is the whole 26-man roster.** Verified: 26 entries, only 10 with a
non-empty `stats.batting`. Anyone who didn't appear has `stats.batting: {}` and
`stats.pitching: {}`. This is precisely the trap that forced the chat bot's
`get_game_boxscore` tool to exist (it had been attaching real box-score lines to
players who never entered the game). The UI filters on the stat object being
non-empty.

**2. `batters[]` is NOT the batting order.** It appends the pitchers to the end —
verified `[...596117, 691725, 660604, 680742]` where the last three are pitchers.
The correct ordering comes from each player's `battingOrder` **slot code string**,
which sorts lexically into a proper lineup:

```
100  Kyle Schwarber  1B
 101   Alec Bohm     1B    ← substitute in the 1st slot, indented
200  Bryson Stott    3B
...
900  Garrett Stubbs  C
```

A code not ending in `00` is a substitute. `pitchers[]` *is* reliable (appearance
order) and is used as-is for the pitching table.

## Component Design — `GameDetailModal.tsx`

Reuses `GameLogModal`'s shell: backdrop `onClick={onClose}`, inner
`stopPropagation`, `max-h-[80vh] overflow-y-auto`, Escape-key listener, `×` button.

Props: `{ gamePk, onClose }`. One fetch, one `useEffect`, cancellation-guarded.

Sections top to bottom:
1. **Header** — `Phillies 6, Cardinals 5` / `Aug 10 · Final`. Date formatted with
   the noon-anchored `formatDate` from `src/utils/date.ts` (a bare `YYYY-MM-DD`
   parses as UTC midnight and shifts a day).
2. **Line score** — one column per entry in `innings[]`, then R/H/E. Away row on
   top, home below, per box-score convention.
3. **Decisions** — `W: … L: … S: …`, omitted entirely when `decisions` is absent.
4. **Two team sections stacked** — Phillies first regardless of home/away, then
   the opponent. Each has a batting table (`AB R H RBI BB K AVG`) and a pitching
   table (`IP H R ER BB K ERA`), with the season AVG/ERA pulled from
   `seasonStats`. Pitcher decision annotations come from `stats.pitching.note`,
   which MLB pre-formats as `(W, 2-8)` / `(S, 18)` — not rebuilt from `decisions`.

Unlike the self-hiding cards (`DailyBriefing`, `HeroStrip`), a fetch failure shows
an inline error: the user deliberately opened this, so silence would read as a bug.

## Schedule tab integration

`Schedule` gains its first prop, `enableGameDetail`. A row is clickable when:

```ts
const clickable = enableGameDetail && game.status.abstractGameState !== 'Preview'
```

Verified: a Preview game returns `innings: []`, `battingOrder: []` and no
`decisions`, so an unstarted game would open an empty shell. In-progress games are
allowed — the modal shows the innings played so far.

Clickable rows get `role="button"`, `tabIndex={0}`, Enter/Space handling, an
`aria-label`, and a hover/focus treatment. When the flag is off the row renders
exactly the markup that shipped before this feature.

## Feature flag

`enable-game-detail` (boolean, temporary), destructured in `App.tsx` as
`enableGameDetail = true` so an unreachable LD client preserves the feature —
matching `enableDailyBriefing` and `enableOnThisDay`.

## Out of scope

- **Linking player names into `GameLogModal`.** Nesting a modal inside a modal is
  poor UX, and `GameLogModal` requires full `BattingStats`/`PitchingStats` objects
  that the trimmed `seasonStats` doesn't supply — it would mean widening the
  `fields=` list to feed a second component. Worth revisiting separately.
- `topPerformers` and `pitchingNotes` from the boxscore payload.
- Criterion for 7-inning games: `scheduledInnings` is modeled but not specially
  displayed; the innings array drives the columns either way.
