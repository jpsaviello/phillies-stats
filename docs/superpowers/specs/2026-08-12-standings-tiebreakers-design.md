# MLB Tiebreaker-Aware Wild Card Ordering

**Date:** 2026-08-12

## Problem

The NL Wild Card table renders teams in the order MLB's `standingsTypes=wildCard`
response returns them, trusting `wildCardRank` as the true postseason order. It
isn't. When clubs are tied on winning percentage, **MLB's Stats API does not apply
the tiebreaker rules** — it lists tied clubs in ascending team-ID order.

Verified live on 2026-08-12 (`GET /standings?leagueId=104&season=2026&standingsTypes=wildCard`):

| API rank | Team | ID | W-L | PCT |
|---|---|---|---|---|
| 1 | Cubs | 112 | 70-50 | .583 |
| 2 | D-backs | 109 | 64-57 | .529 |
| 3 | Padres | 135 | 64-57 | .529 |
| 4 | **Phillies** | 143 | 64-57 | .529 |
| 5 | Marlins | 146 | 61-59 | .508 |

Three clubs are tied at 64-57 and the API orders them 109 → 135 → 143. That is
exactly ascending team ID, and the same pattern holds in `leagueRank` (5, 6, 7) and
`sportRank` (8, 9, 10) — the API's rank fields are a stable sort on record with team
ID as the implicit final key, not a tiebreaker evaluation.

The consequence is user-visible and wrong: our "Playoff cutoff" divider is drawn
after rank 3, so the table currently shows the D-backs and Padres holding the last
two wild card spots with the **Phillies on the outside**. Under the actual MLB
tiebreaker rules the Phillies hold WC2 and the **Padres** are the club on the
outside. This matches what the user reported and what playoffstatus.com shows.

## MLB Tiebreaker Rules (2022 CBA — no game 163)

Since 2022 all ties for postseason position are decided mathematically, in this
order:

1. **Head-to-head record** between the tied clubs.
2. **Higher winning percentage in intradivision games** (each club's record inside
   its own division).
3. **Higher winning percentage in intraleague games** (each club's record against
   its own league).
4. Higher winning percentage over the last half of intraleague games, extending one
   game at a time until broken.

For a tie involving **more than two** clubs, the club with the best *combined*
head-to-head record against the other tied clubs is placed highest; that club is
then removed and the process restarts from criterion 1 for the remaining clubs.

### Applying the rules to the live 2026 tie

Head-to-head among the three tied clubs, computed from completed regular-season
games (verified against `/schedule` on 2026-08-12):

```
D-backs vs Padres    5-5
D-backs vs Phillies  2-1
Padres  vs Phillies  0-6
```

Combined head-to-head vs the other tied clubs:

| Team | Combined H2H | PCT |
|---|---|---|
| **Phillies** | 7-2 | **.778** |
| D-backs | 7-6 | .538 |
| Padres | 5-11 | .313 |

Criterion 1 alone fully separates the group, giving **Phillies (WC2), D-backs (WC3),
Padres (WC4)** — the Phillies and D-backs in, the Padres out. Criteria 2 and 3 are
not needed here but are implemented for the general case; for the record, their
values in this tie are:

| Team | Intradivision | Intraleague |
|---|---|---|
| D-backs | 26-15 (.634) | 48-40 (.545) |
| Padres | 22-17 (.564) | 42-43 (.494) |
| Phillies | 19-17 (.528) | 47-41 (.534) |

Note that intradivision would have ordered the group differently (D-backs first) —
criterion order matters, and head-to-head genuinely comes first.

## Goal

Reorder the NL Wild Card table by the real MLB tiebreaker rules so the playoff
cutoff divider reflects who is actually in, and label tied rows so the divergence
from MLB.com's own standings page is explained rather than surprising.

## Non-Goals

- **The NL East division table (`Standings.tsx`) is not changed.** `divisionRank`
  has the identical flaw, but no cutoff line is drawn there, so a mis-ordered tie is
  cosmetic rather than misleading. The tiebreaker utility is written generically so
  the division table can adopt it later with no changes to the util.
- **Criterion 4** (last half of intraleague games) is not implemented. It requires
  reconstructing each club's intraleague game sequence and only matters when clubs
  are tied on all of head-to-head, intradivision *and* intraleague record — rare
  enough that the fallback (keep the API's order) is acceptable. This is documented
  in the UI-facing behavior below as "order falls back to the API's".
- **No LaunchDarkly flag.** This is a correctness fix, not a new surface, and the
  failure path already degrades to today's behavior (see Failure Behavior). A flag
  was considered and rejected as ceremony; if a kill switch is later wanted it slots
  in the same way `enableOnThisDay` does.
- No backend/server changes. `/standings` and `/schedule` are both already
  allowlisted in `server/src/core.ts` for any query string.
- No new npm dependencies.

## Data Sources

### Head-to-head — `/schedule`, one call per tied club

Head-to-head is **not** in the standings response at any hydration level, so it has
to come from the schedule. One full-season call per tied club, heavily trimmed:

```
GET /api/mlb/schedule?sportId=1&season=2026&teamId=143&gameType=R
    &fields=dates,games,gameType,status,abstractGameState,teams,home,away,team,id,isWinner
```

Verified 2026-08-12: 163 games, **25 KB** untrimmed-by-gzip, and it carries
`teams.{home,away}.isWinner` so no score comparison is needed. Sample game:

```json
{
  "gameType": "R",
  "status": { "abstractGameState": "Final" },
  "teams": {
    "away": { "team": { "id": 140 }, "isWinner": false },
    "home": { "team": { "id": 143 }, "isWinner": true }
  }
}
```

**One call per club, not one per pair.** For a group of N tied clubs that is N calls
instead of N(N-1)/2, it needs no cross-pair de-duplication (each club's record
against each opponent is read from that club's own schedule), and the same payload
is what criterion 4 would need if it is ever added. For the live 3-way tie that is
3 requests.

Only games with `status.abstractGameState === 'Final'` count, and only where exactly
one side has `isWinner === true` — a tie/suspended game contributes to neither
column.

### Intradivision and intraleague — already in the standings response

Both are present per team under `records`, no extra request:

- **Intradivision:** `records.divisionRecords[]`, pick the entry whose
  `division.id` equals the club's own division.
- **Intraleague:** `records.leagueRecords[]`, pick the entry whose `league.id`
  equals `104` (NL).

Knowing a club's *own* division requires `hydrate=team(division)` on the wild card
call. **That hydration has a side effect that must be handled:** it replaces the
plain `team.name` ("Phillies") with the hydrated full name ("Philadelphia
Phillies"), which would silently rewrite every label in the table. The hydrated team
object also carries `teamName`, which is exactly the current short string, so the
component reads `team.teamName ?? team.name`.

Verified hydrated shape:

```json
{ "id": 143, "name": "Philadelphia Phillies", "teamName": "Phillies",
  "abbreviation": "PHI",
  "division": { "id": 204, "name": "National League East" } }
```

## Algorithm

### Grouping

Walk the API-ordered list and group consecutive clubs with an equal winning
percentage. Compare by **cross-multiplication** (`a.wins * bGames === b.wins *
aGames`), not by float division or by the API's rounded `.529` string — two clubs
with different games played can share a percentage, and float equality on
`w / (w + l)` is not reliable.

Groups of size 1 pass through untouched. Only groups with at least one member inside
the rendered window are resolved, so a tie buried at ranks 10-12 costs no requests;
a group straddling the window boundary is resolved because at least one member is
inside it.

### Ordering a tied group

```
order(group):
  if group.length <= 1: return group
  best = selectBest(group)
  return [best, ...order(group minus best)]

selectBest(group):
  for criterion in [combinedHeadToHead, intradivision, intraleague]:
    pcts    = criterion(group)          // computed over the CURRENT group
    leaders = members whose pct equals the max
    if leaders.length == 1:            return leaders[0]
    if leaders.length < group.length:  return selectBest(leaders)   // restart chain
    // every member tied on this criterion — fall through to the next
  return group[0]                       // still tied: keep the API's order
```

Two properties worth stating explicitly:

- **Narrowing restarts the chain**, because head-to-head *within* the narrowed
  subset can separate clubs that combined head-to-head over the larger group could
  not. Termination is guaranteed: the recursive call always receives a strictly
  smaller group.
- **`combinedHeadToHead` is inconclusive, not zero, when unplayed.** If any member
  of the group has played zero games against the rest of the group, criterion 1 is
  skipped entirely rather than scoring that club .000.

`combinedHeadToHead` deliberately uses combined winning percentage even when clubs
have played unequal numbers of games against each other — the Phillies played the
D-backs 3 times and the Padres 6, and the rule as written by MLB does not weight for
that. This is the rule, not an approximation of it.

## UI Changes (`WildCardStandings.tsx`)

- The `#` column renders the **recomputed position** (`index + 1`), not
  `r.wildCardRank`. Today those are the same number; after reordering they are not,
  and the API's field would print `2, 4, 3` down the column.
- Rows belonging to a multi-club tie get a `†` marker after the team name, with a
  `title` naming the deciding criterion and its numbers (e.g. `Head-to-head vs tied
  clubs: 7-2`) so the ordering is inspectable on hover.
- A single footnote line below the table: *"† Tied on record. Order set by MLB
  tiebreakers: head-to-head, then intradivision, then intraleague record."*
- The playoff-cutoff divider logic is **unchanged** — it is drawn after
  `PLAYOFF_SPOTS`, and with the corrected ordering the Padres fall below it on their
  own.
- `MIN_ROWS_SHOWN` and the "Phillies row must stay visible" rule are unchanged.

## Loading and Failure Behavior

The component keeps its existing "render nothing until ready, render nothing on
failure" convention:

1. Fetch wild card standings.
2. Identify tied groups intersecting the rendered window; if there are none, render
   immediately — no second round trip in the common case.
3. Otherwise fetch the schedules for those clubs and render once they settle.

Because the table already renders `null` while loading, resolving ties before first
paint costs a second round trip but produces **no row shuffle** — rendering the API
order first and reordering on arrival would visibly rearrange the playoff cutoff in
front of the user, which is worse than a slightly later paint.

If the schedule fetches fail or return nothing usable, the table renders in the
API's order with no `†` markers and no footnote — i.e. exactly today's behavior. A
tiebreaker failure must never blank the table.

## Files

| File | Change |
|---|---|
| `src/utils/tiebreakers.ts` | **new** — pure grouping/ordering logic, no fetching |
| `src/api/mlb.ts` | `fetchWildCardStandings` gains `hydrate=team(division)`; new `fetchSeasonResults(teamId)` |
| `src/types/mlb.ts` | `WildCardRecord` gains `team.teamName`/`team.division` and `records`; new `SeasonGameResult`, `TeamTiebreakerInfo` |
| `src/components/WildCardStandings.tsx` | resolve ties, positional `#`, `†` marker + footnote |
| `CLAUDE.md` | document that MLB's rank fields ignore tiebreakers, and that this table diverges from MLB.com by design |
