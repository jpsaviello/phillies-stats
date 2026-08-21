# Design Spec: Bullpen Usage panel (Pitching tab)

## Goal

Answer the question a fan asks between the 6th and the 7th — **"who's left down
there?"** — which this app currently cannot answer at all.

The Pitching tab shows season totals. That tells you Orion Kerkering has a 2.90
ERA; it does not tell you he has thrown on three consecutive days and is almost
certainly not coming in tonight. Recent workload is the single most predictive
thing about how a late inning will go, and it is invisible everywhere in the app:
`GameDetailModal` shows one past game, `MatchupPreview` covers only the two
starters, `LiveGameStrip` shows the pitcher currently on the mound. Nobody covers
the seven arms behind him.

This is also the cheapest remaining high-value feature: every endpoint it needs is
already allowlisted and already used elsewhere in the codebase.

## Live state this was designed against (window ending 2026-08-20)

Pulled from the real API, not hypothetical. Five Phillies games in the trailing
seven days, thirteen pitchers used:

```
Kerkering    8/16 (12p, 1.0)   8/17 ( 5p, 0.1)   8/18 (17p, 1.0)   -> 3 straight days
Bowlan       8/16 (14p, 1.0)   8/17 (34p, 1.0)   8/19 (28p, 1.0)   -> 3 of 4
Duran        8/16 (33p, 1.0)   8/17 (10p, 1.0)   8/19 (18p, 1.0)   -> 3 of 4
McFarlane    8/15 (22p, 1.1)   8/18 (18p, 1.0)
Raley        8/17 ( 9p, 0.2)   8/18 (12p, 1.0)                     -> back-to-back
Alvarado     8/18 (13p, 1.0)
Shugart      8/15 (18p, 1.0)
Mayza        8/16 (14p, 1.0)
starters     Luzardo 8/15 (109p) · Painter 8/16 (94p) · Sanchez 8/17 (90p)
             Wheeler 8/18 (98p) · Nola 8/19 (100p)
```

That Kerkering line is the entire feature in one row. It is a fact sitting in a
public API that no screen in this app surfaces.

## Load-bearing decision 1: report workload, do not predict availability

The obvious version of this panel tags each reliever `AVAILABLE` /
`LIKELY UNAVAILABLE`. **We are not doing that**, and the reason is the same one
already recorded twice in this codebase.

`MatchupPreview` deliberately dropped its "who has the edge" highlight because
picking a winner per row editorializes on a panel whose job is to set two lines
side by side. `PlayoffPush` deliberately shows no playoff probability because
that needs a league simulation and anything less is a fabricated number wearing
false precision. Same standard applies here: whether Rob Thomson uses a reliever
tonight depends on the score, the handedness due up, yesterday's leverage, and
private training-staff information. A confident `UNAVAILABLE` badge would be a
guess rendered in the same visual register as `numberOfPitches`, which is
measured.

So the panel states only what is mechanically true from the boxscores:

- **facts** — appearances in the window, pitches per outing, innings, batters
  faced, days since last appearance
- **derived-but-still-factual flags** — `3 straight days`, `back-to-back`,
  `3 of the last 4`, `40+ pitches yesterday`. These describe what happened. They
  are not claims about tonight.
- **not shown** — any availability verdict, rest "requirement", or projected role

The reader draws the conclusion. A fan who sees `3 straight days · 34 pitches`
already knows what it means, and owning that inference themselves is the honest
version of this panel.

## Load-bearing decision 2: the roster cannot tell you who is a reliever

Verified against `/teams/143/roster?rosterType=active`: **all thirteen active
pitchers carry `position.abbreviation: "P"` and `position.type: "Pitcher"`.**
There is no SP/RP distinction anywhere in the roster response. A panel that
filtered on position would show Wheeler and Nola as bullpen arms.

Classification comes from season usage instead, via `gamesStarted` vs
`gamesPitched` on the season pitching splits (a pitcher who has started most of
his appearances is a starter). Two consequences:

- The panel needs those season splits — which `PitchingTable` **already fetches**.
  See decision 3.
- Fallback when splits are unavailable: `gamesStarted === 1` on the boxscore line
  itself. This is only a fallback, never the primary test, because a reliever who
  made one spot start inside the window would be misclassified by it, and a
  reliever who has not appeared at all has no boxscore line to read.

Starters are not discarded — they render in a separate, secondary row group
("Rotation"), since days-of-rest is meaningful for them too and the sample above
shows the rotation cleanly at four days' rest each. But the bullpen is the
headline and sorts first.

## Load-bearing decision 3: mount inside PitchingTable, above its loading branch

The panel needs season splits to classify SP/RP. `PitchingTable` already calls
`fetchPitchingStats()`. Fetching them a second time would duplicate a real
request for data sitting in a sibling component — the same waste `PlayoffPush`
avoids by taking `divisionRecords` as a prop from `Standings`.

So `PitchingTable` renders `<BullpenUsage seasonSplits={splits} />` and passes
what it already has. **This requires a small refactor**: `PitchingTable` currently
early-returns on loading and error (`if (loading) return <TableSkeleton/>`), which
would take the panel down with a season-stats failure. `Standings` already solved
this exact problem — it uses one `return (` with the loading/error branches inline
as a ternary, and mounts `PlayoffPush` / `WildCardStandings` outside it. Convert
`PitchingTable` to the same shape. The panel then owns its own independent fetch
and failure, matching the convention already documented for the other two.

`seasonSplits` arrives `[]` while the parent is still loading; the panel treats
that as "classification not ready yet" and falls back per decision 2 rather than
blocking on it.

## Data plan

No new endpoint families. Everything below is already proxied and already used.

1. `fetchSchedule(start, end)` — **exists**. Trailing 7 calendar days ending
   today in ET, keep `abstractGameState === 'Final'`, collect `gamePk`.
2. `fetchBullpenBoxscore(gamePk)` — **new**, but a straight sibling of the
   existing `fetchBoxscore`: same `/game/{pk}/feed/live` path (the `/game/` →
   `api/v1.1` mapping in `MLB_ALLOWED` already covers it), narrower `fields=`
   list. Measured at **21.9KB** per game trimmed to the pitching fields, so
   ~110KB for a five-game window. One request per game, not per pitcher — the
   alternative (a `gameLog` call per reliever) is 13 requests of full-season
   payloads to answer the same question.
3. `fetchRoster()` — **exists**. Active pitchers, so an arm that has not appeared
   in the whole window still renders (those are the genuinely fresh ones, and
   omitting them would invert the panel's meaning). `rosterType=active` already
   excludes the IL.
4. Season splits — **prop**, per decision 3. Zero additional requests.

Confirmed present on every boxscore pitching line: `numberOfPitches`,
`pitchesThrown`, `inningsPitched`, `battersFaced`, `earnedRuns`, `strikeOuts`,
`baseOnBalls`, `hits`, `inheritedRunners`, `gamesStarted`. Appearance order comes
from `teams.{side}.pitchers[]`, which is reliable — unlike `batters`, which
appends pitchers to the end.

## Correctness traps

These produced wrong output in similar code already in this repo, so they are
called out rather than left to be rediscovered:

- **Innings are not decimal.** `1.1 + 0.2` is `2.0`, not `1.3`. All summing goes
  through `inningsToOuts` / `outsToInnings` in `src/utils/innings.ts`; span ERA
  goes through `eraOver`. Never `parseFloat` an IP string and add it.
- **Doubleheaders share a date.** Key appearances by `gamePk`, not by date, or
  two outings collapse into one. "Days rest" still measures off the date.
- **Dates are Eastern.** Reuse `easternToday` / `daysBehind` from
  `src/utils/date.ts` — a UTC "today" rolls over mid-night-game and reports a
  reliever who just pitched as having a day of rest.
- **A pitcher absent from the window is not a pitcher with zero appearances.**
  Render "not used in last 7 days", never "0 pitches" — the latter reads as an
  outing where he faced nobody.
- **`numberOfPitches` and `pitchesThrown` are duplicates** in every line sampled.
  Pick one (`pitchesThrown`) and note it, so a future reader does not sum both.

## UI

One panel above the pitching table, following `PlayoffPush`'s visual weight —
header, a table, a footer note. Two row groups: **Bullpen** (sorted by days since
last appearance ascending, so the most-used arms are on top), then **Rotation**.

Per row: player name, days since last appearance, appearance count in the window,
total pitches, total innings, and a compact per-outing trail
(`8/18 17p · 8/17 5p · 8/16 12p`), plus any workload flag from decision 1. Rows
stay visually uniform — no color-coding a reliever as "tired", per decision 1.

Mobile: the per-outing trail is the first thing to drop below `sm`, keeping name,
days rest, and window totals.

## States

- **Loading** — `TableSkeleton`, consistent with the tab.
- **No games in window** (off-season, All-Star break, long rain-out stretch) —
  render `null`. A panel of "not used in last 7 days" rows for the entire staff is
  noise.
- **Schedule fetch fails** — render `null`. Same self-hiding contract as
  `HeroStrip`, `WildCardStandings`, `MatchupPreview`.
- **One boxscore fails** — keep the others and note the window is partial. Losing
  one game's data should not blank four games of usable workload.
- **Roster fails** — still render, from boxscore appearances alone; only the
  never-appeared arms are missing. Degrades, does not disappear.

## Deploy

**Zero backend change, zero new dependency, zero new secret, zero migration.**
Both endpoints are already in `MLB_ALLOWED` (`/teams/`, `/schedule`, `/game/`) and
`fetchBoxscore` already proves the `/game/` → v1.1 route works through the proxy.

That makes this identical on both targets: Vercel picks it up on the next push to
`develop` (production branch), and k8s picks it up on the next `pipeline.sh` —
frontend image only, since `server/` is untouched. No `kubectl create secret`, no
Vercel dashboard env var, no `DATABASE_URL` involvement.

Gated by an `enableBullpenUsage` LaunchDarkly flag, defaulted `true` in the
`useFlags()` destructure so an unreachable LD client preserves behavior — the same
kill-switch pattern as `enableMatchupPreview`. Note that flag, like
`enableMatchupPreview`, must be created in LaunchDarkly to be togglable; until
then it always renders.

## Out of scope

- Availability prediction, in any form (decision 1).
- Leverage index / WPA — not in these endpoints.
- Warming-up detection. The live feed does carry bullpen activity, but that is a
  `LiveGameStrip` concern and only exists mid-game.
- Minor-league / taxi-squad arms.
- Persisting anything. No DB, no auth interaction.
