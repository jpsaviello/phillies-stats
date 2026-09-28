# Postseason Mode — Design

**Date:** 2026-09-28
**Status:** Approved (user asked for ideas 1, 2 and 3 from the postseason brainstorm)

## Why

The regular season ended on 2026-09-27 and the Phillies are in: the NL's 6 seed,
opening the Wild Card Series at the 3-seed Braves on 2026-09-29. Everything in the
app still speaks regular season:

- **Playoff Picture** says "Seeds if the season ended today". The season has ended,
  and from here the bracket moves on series results, which the standings cannot
  show.
- **Today and Schedule** already list postseason games (`fetchSchedule` has no
  `gameType` filter), but nothing says "NL Wild Card Series · Game 2" or that the
  series is tied 1–1. Worse, an *if-necessary* game in a series that is already
  decided stays `Scheduled` until MLB removes it, so it could headline Today as
  "Next game".
- **Batting and Pitching** show regular-season lines only. Postseason performance
  appears nowhere.

This ships three pieces as one "postseason mode": a live bracket, series context
on game surfaces, and a regular season / postseason split on the two stat tables.

## Data

### One new request: the league-wide postseason schedule

`fetchPostseasonGames()` in `src/api/mlb.ts`:

```
/schedule?sportId=1&season=2026&gameType=F,D,L,W&fields=…
```

`F` Wild Card Series (best of 3), `D` Division Series (5), `L` Championship Series
(7), `W` World Series (7). Trimmed with `fields=` to the game identity, series
fields (`seriesGameNumber`, `gamesInSeries`, `seriesDescription`, `ifNecessary`),
status and the two teams' id/name/score/isWinner. SCHEDULE cache profile (60s) —
it carries scores of games in progress.

Verified against the live API on 2026-09-28:

- MLB posts the **whole** postseason schedule in advance, all 53 potential games.
  Undecided entrants are **placeholder teams** — `"ATL/PHI"`, `"NL Higher Seed"`,
  `"Lower Seed League Champion"` — with ids outside the 30 clubs' (e.g. 5517, 2711).
  So "is this a real club" is a fixed id set, `MLB_CLUB_IDS`, not a name test.
- Every Wild Card Series game is at the higher seed's park.
- Unplayed if-necessary games are **removed** once a series ends (2025's schedule
  holds exactly the 47 games played), but not instantly — so the app must treat a
  not-Final game in a decided series as moot rather than rely on the removal.
- `leagueRecord` on a postseason game is the club's series record, but the app
  counts Final games itself rather than trusting a field whose before/after
  semantics differ by game state.

### Stats: `gameType=P`

`/stats?stats=season&group=hitting|pitching&…&gameType=P` returns postseason-only
lines in the same shape as the season call (verified on 2025: 13 Phillies hitters,
10 pitchers). Before a club's first postseason game it returns `splits: []`.
`fetchBattingStats`/`fetchPitchingStats` gain an optional `gameType` argument; the
regular-season URL stays byte-identical so its cache key and e2e fixtures don't
move.

## Pure logic: `src/utils/postseason.ts`

No React, no fetch, unit-tested — the same posture as `playoffPicture.ts` and
`today.ts`, because every interesting state (a series 2–1, a sweep with a Game 3
still listed, a World Series) can only be produced on demand from fixtures.

- `winsNeeded(bestOf)` → 2 / 3 / 4.
- `seriesBetween(games, round, a, b)` → `Series | null`: every game of that round
  between those two clubs, wins per club counted from Final games' `isWinner`,
  `winnerId` once a club reaches `winsNeeded`, and `next` = the first non-Final
  game while undecided.
- `seriesOfGame(game, games)` → the series a given game belongs to.
- `isMoot(game, games)` → not Final and its series is already decided.
- `seriesContext(game, games, focusId)` → the one-line context the game surfaces
  show: round name, `Game N`, the series score **going into** the game (for an
  unplayed or live game) or **after** it (for a Final one), and the stakes from
  the focus club's side — `Winner take all`, `Elimination game`, `Chance to clinch`.
  Series status is phrased from the leader's side: `Series tied 1–1`,
  `Phillies lead 2–1`, `Phillies win 3–1`.
- `clubName(fullName)` → the nickname ("Braves", "Red Sox"). Schedule games carry
  only full names; the three two-word nicknames are a fixed list.
- `buildLiveBracket(picture, games)` → per-league `LiveLeague` (see below), or
  `null` when the schedule doesn't agree with the standings.
- `buildWorldSeries(nl, al, games)`.

## 1. Live bracket (Playoff Picture)

### Seeds from standings, results from the schedule

The existing projection (`buildPlayoffPicture`) already produces the seeds and the
pairings from the tiebreaker-corrected standings. The live bracket **keeps that
model and overlays series results** from the postseason schedule, matching series
by the pair of club ids. That reuses the drawing geometry, logos, seed chips and
tests unchanged in shape, and needs no parsing of `"NLDS 'B'"` description strings.

**The safety rule:** a league goes live only when *both* its Wild Card pairings from
the standings appear as real games in the schedule (`higher` at home, `lower`
away). If they don't — a tiebreak our chain resolves differently from MLB (criterion
4 isn't implemented), a failed schedule request, or the regular season still in
progress — that league stays in projection mode exactly as today. The panel never
draws seeds and pairings that disagree with the schedule. Checked 2026-09-28: both
leagues reconcile (NL: MIL 1, LAD 2, ATL 3, SD 4, CHC 5, PHI 6; AL: TB, CLE, HOU,
NYY, BOS, CWS).

### What a live league shows

`LiveLeague` = two Wild Card series, two Division Series, one Championship Series
and a pennant winner. Each slot is a `SeriesView`: two entrants (a `SeededTeam`,
or null while the feeding series is undecided), each one's wins in *this* round,
and the winner's index. No reseeding: the 1 seed meets the 4/5 winner, the 2 seed
the 3/6 winner, which is where the existing bracket already draws them.

- **Wild Card and Division columns** keep the 140px team box. The regular-season
  record on the second line is replaced by the round's context ("Won 2–0",
  "Leads 1–0"); the series wins are drawn large at the right edge of the box.
  A club that has been eliminated is drawn at reduced emphasis, the winner at full.
- **The Wild Card winner's empty slot fills** with the winner once decided.
- **Championship and pennant columns** (108px) get a compact box: logo, name, wins.
  They stay dashed empty slots until their feeding series is decided.
- **World Series:** the centre gutter keeps its label and adds the series status
  underneath ("Tied 1–1", "Dodgers win 4–2") once both pennants are decided.
- **First team out** lines are hidden in live mode — the race is over.
- **Heading hint** changes to state what the bracket now shows: series wins, seeds
  from the final standings, no reseeding.

### Stacked layout (below `xl`)

In live mode each league renders one card per round that has at least one known
entrant — Wild Card Series ×2, Division Series ×2, Championship Series — and a
World Series card beneath both leagues. Each card: two team lines with the round's
wins in place of the record, and a footer with the series status and next game
date. An undecided entrant renders as "Winner of 4/5" in muted text.

### Deliberately not done

- **No series odds or win probabilities.** Same standard as Playoff Push: nothing
  that needs a simulation.
- **No reseeding logic or reading seeds out of placeholder names.** MLB's format
  doesn't reseed; the standings already hold the seeds.

## 2. Series context on Today and Schedule

Computed from the Phillies' own schedule window — which is exactly the set of
their series games, and no series spans more than nine days, inside both tabs'
windows — so **neither tab gains a request.** `Game` gains the optional series
fields the unfiltered `fetchSchedule` response already carries.

- **Today headline:** a line under the opponent — `NL Wild Card Series · Game 2 ·
  Phillies lead 1–0` — plus a stakes chip (`Elimination game`, `Chance to clinch`,
  `Winner take all`) when one applies. The card label stays "Next game"; the
  round name already says it is a postseason game.
- **Today last-game card:** the round and the series status after that game.
- **Schedule rows:** a full-width line under the row (indented under the opponent
  from `sm` up — at 375px the name column is ~100px and the line wrapped five
  times inside it): `NL Wild Card · Gm 2 · Braves lead 1–0 · Elimination game`,
  with the round abbreviated the way fans do (`NLDS`, `ALCS`). A `Postseason`
  divider goes before the first postseason game (the existing `Upcoming` divider
  still marks the results/first-pitch boundary; one divider carries both labels
  when they land on the same row).
- **Only a played game and the series' next game get a score and stakes.** Game 3
  of a series that is 1–0 with Game 2 unplayed could be entered at 2–0 (and never
  happen) or at 1–1, so it reads `Gm 3 · If necessary` instead. The first draft
  printed "Braves lead 1–0 · Elimination game" on it, which is false half the time.
- **Moot games are dropped** on both tabs (`isMoot`): a Game 3 of a sweep must not
  headline Today or sit in the list with a first-pitch time.

## 3. Regular season / postseason split on Batting and Pitching

- A two-option segmented control, **Regular season · Postseason**, beside each
  table's section heading. It renders only when the Phillies appear as a real club
  in the postseason schedule (the same cached request as the bracket), so it is
  invisible for the other eleven months.
- The choice lives in the URL as `?split=post` — view-defining state goes in the
  hash in this app, a toggle is a discrete choice (not per-keystroke like search),
  and it makes "Phillies postseason stats" linkable. `setTab` clears it.
- The table's heading follows the choice (`Postseason Batting`). Before the first
  postseason game the view shows an empty state, not a blank table.
- **The game-log modal, Hot & Cold and Bullpen Usage stay regular season.** They
  are fed the regular-season splits regardless of the toggle: the modal's game log
  and trend chart are regular season, so a postseason line in its header would sit
  over a regular-season log. A `?player=` link therefore still resolves in either
  view.

## Flags, backend, dependencies

No new flag: the bracket rides `enablePlayoffPicture`, and the context line and
toggle are additive and self-hiding. No backend change — `/schedule` and `/stats`
are already allowlisted and cached. No dependency, DB or secret change.

## Testing

- **Unit (Vitest):** `postseason.test.ts` — series counting, decided/moot, context
  phrasing before/after a game and from either side, stakes, placeholder clubs,
  bracket reconciliation (agrees → live; swapped seeds → null), winners advancing
  to the next round, the World Series.
- **E2E:** one new fixture, the postseason schedule. The suite's clock is frozen at
  2026-09-03 with standings from that day, which do **not** reconcile with the real
  postseason field — so the existing bracket assertions keep passing in projection
  mode, and that is the safety rule doing its job.
- **Browser (`webapp-testing`):** the live bracket against real 2026 data at desktop
  and 375px, the Today and Schedule context, and the toggle.
