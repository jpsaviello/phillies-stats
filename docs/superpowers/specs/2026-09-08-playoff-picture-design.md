# Design Spec: Playoff Picture bracket (Standings tab)

## Goal

Show **both leagues' postseason fields as they stand right now** — twelve clubs,
seeded, paired into the Wild Card Series they would actually play — at the top of
the Standings tab.

The tab already answers "where are the Phillies?" three different ways: the NL
East table (division position), the Wild Card table (race position), and Playoff
Push (margin, magic/elimination numbers). What none of them shows is **the field**
— who else is in it, what seed the Phillies would carry, and *who they would play*.
That is the thing every October-facing graphic on every other baseball site leads
with, and it is the one shape this tab cannot currently make out of its own data.

Concretely: on 2026-09-08 the app fetches every number below on a Standings load
and shows the reader none of the structure in it.

## Live state this was designed against (2026-09-08)

Every figure from a real response:

```
NL division leaders:   MIL 89-56 (Central)   LAD 87-57 (West)   ATL 85-59 (East)
NL wild card:          1 PHI 81-63 (+4.5)   2 CHC 81-64 (+4.0)   3 ARI 77-68 (-)
First team out:        SD 76-68, 0.5 back
```

Which is the bracket:

```
  1  Brewers   89-56   BYE  →  vs 4/5 winner
  2  Dodgers   87-57   BYE  →  vs 3/6 winner
  3  Braves    85-59   hosts  6  D-backs  77-68
  4  Phillies  81-63   hosts  5  Cubs     81-64
```

Note the shape the existing tables cannot make: the Phillies are the **top wild
card and still only the 4 seed**, because the three seeds above them are reserved
for division winners no matter what anyone's record is. Today all three of those
clubs happen to out-record the Phillies, but they need not — a wild card club can
carry a better record than a division winner and still seed behind it. That is the
single most misunderstood thing about the format, and a bracket states it
structurally where a standings table cannot.

## The load-bearing decisions

### 1. The NL half is free; the AL half costs two requests, on this tab only

The NL's two responses are already on the wire on every Standings load.

**Wild card side** — `useWildCardRace()` is already owned by `Standings` and
spread into `PlayoffPush` and `WildCardStandings`. The bracket becomes its **third**
consumer and takes it as props, for exactly the reason the hook exists: two
components claiming a playoff position from two orderings can drift, and a bracket
seeding a club 6th above a table ranking it 3rd is worse than either alone.

**Division side** — `fetchStandings()` already requests
`/standings?leagueId=104&standingsTypes=regularSeason`, which returns **all three
NL divisions**, and then throws two of them away to return the NL East group.
Rather than a second request, the URL is factored into one private helper
(`nlRegularSeason()`) that both `fetchStandings()` and the new
`fetchDivisionLeaders(leagueId)` call. One URL literal, two exports, one cache key
— the sharing is structural rather than an invariant somebody has to remember.

**The American League is data the app has no other reason to hold**, so it is two
requests: `regularSeason` and `wildCard` for `leagueId=103`. Both standings
endpoints do accept `leagueId=103,104` and return one group per league, which
would have made the whole bracket ride on requests the tab already makes — and it
is the wrong trade, because `fetchStandings` is **HeroStrip's too, and HeroStrip
runs on every tab**. Measured, the combined response is 81KB against 40KB, so
that version puts the American League on the critical path of a reader who never
opens this tab. One league per request keeps the AL's cost on the tab that draws
it. Two new e2e fixtures; no existing URL changes, so nothing already recorded is
touched.

The AL's wild card race also asks for a **smaller tiebreak window** than the NL's.
`useWildCardRace` resolves ties across the seven rows `WildCardStandings` renders;
the bracket shows three clubs in plus the first out, so the AL half asks for four
and does not buy head-to-head round trips for a tie at rank 7 that nothing on
screen depends on.

### 2. Division winners are seeds 1–3, period

Under the 2022 format the three division winners take seeds 1–3 **ordered among
themselves**, and the three wild cards take 4–6. A wild card club with a better
record than a division winner still seeds below it. **The American League on the
day this shipped is the case in the flesh**: the Yankees are 81-62 and seed
*fourth*, below a 75-68 White Sox club on a bye and a 73-71 Astros club that
would host them a round later. The seeding function therefore
never sorts the six clubs together — it sorts two lists and concatenates them, and
a unit test pins the case where a wild card club out-records a division winner.

Seeds 1 and 2 receive byes. The Wild Card Series are **3 vs 6** and **4 vs 5**,
best-of-three, all games at the higher seed's park. There is no reseeding after
that round: the 1 seed meets the 4/5 winner and the 2 seed meets the 3/6 winner,
which is what lets the bye cards say who they are waiting on.

### 3. Ties in the seeding order use the existing tiebreaker chain

MLB's API does not apply tiebreakers — `leagueRank` orders tied clubs by ascending
team ID — so ordering the three leaders by raw record would put the wrong club on a
bye whenever two of them share a winning percentage. `src/utils/tiebreakers.ts`
already implements the real chain (head-to-head → intradivision → intraleague) and
is written against a structural `TiebreakerRecord` shape *specifically* so a second
caller could reuse it. This is that caller, twice — once per league, with the
league id passed through to criterion 3 (intraleague record) so the AL is
measured against the AL.

`applyTiebreakers` groups **consecutive** equal-pct clubs, so the leaders are sorted
by percentage first. The head-to-head fetch (`fetchSeasonResults`, ~25KB per club)
runs **only when two leaders are actually tied** — three distinct records means the
graphic costs literally nothing beyond what the tab already spends. Ties surface
with the same `†` marker and footnote `WildCardStandings` uses, from the same notes
map.

The regularSeason response carries `records.divisionRecords` and
`records.leagueRecords` (criteria 2 and 3) but no `team.division`, so the division
id is attached from the group each record came in. Division **names** are not in
the response at any hydration level that keeps the URL one league wide, so all six
division ids are a local constant in `playoffPicture.ts` — fixed league structure,
not data — and a unit test asserts every one of them resolves, since a gap would
render a blank where a division belongs and report nothing.

### 4. It describes, it does not predict

Same standard `PlayoffPush`, `BullpenUsage` and `BattingForm` already hold: every
figure is either read straight from MLB's response or is arithmetic a fan could
redo by hand. The panel is headed **"if the season ended today"** — it is a
snapshot of a standings state, not a projection, and it carries no playoff odds
for the same reason Playoff Push carries none.

**No colour-by-seed.** The diverging scale states magnitudes, and seed is
arguably one — but colouring it would light the *opponent* up in the club's own
red whenever they seeded higher, which is the exact mistake `MatchupPreview`
already reverted once (its "who has the edge" highlight). Seeds get a neutral
chip; the Phillies get the same red dot marker every other table in the app uses
to mark their row. Clinch state is shown where MLB reports it, in the same green
as the wild card table's indicator.

### 5. Self-hiding per league, and mounted outside the other fetches' branches

**Each league resolves and fails on its own** — a dead AL request leaves the NL
bracket standing and drops to a single centred column, the same independence
`LeagueRankings`' two cards and `PlayoffPush`' two fetches already have. A league
renders `null` unless its field is complete (three leaders **and** three wild card
clubs), and the panel disappears only when neither league has one — same convention as `HeroStrip`, `MatchupPreview`, `BullpenUsage` and
`WildCardStandings`. That covers the offseason, the first days of a season, a
failed request, and any future format change that would make a six-team bracket a
lie. It mounts outside `Standings`' loading/error branches like its siblings, so a
division-standings failure cannot take it down and it cannot take them down.

### 6. Placement: full width, above the two-column grid

The Standings tab is a two-column grid from `lg` up (division-left, race-right).
The bracket is neither: it is the tab's headline and it wants horizontal room. So
`Standings` gains one level of structure, `space-y-8` wrapping the bracket above
the existing grid, and the grid itself is untouched.

Inside the panel it is the **mirrored tournament bracket** every October graphic
uses: NL running inward from the left, AL inward from the right, meeting at the
World Series in the centre, with a dashed empty box for every round the standings
cannot decide. NL is the left half because this is a Phillies app — the reference
brackets put the AL there, and `side` is the only thing that would have to change.

**Two layouts, and both are needed.** The bracket is 1,164px of fixed geometry, so
it draws at `xl` and up; below that the same model renders as stacked cards (a
byes card over the two Wild Card Series per league, two columns from `lg`). Both
subtrees are always in the DOM and CSS picks one — a JS breakpoint would flash the
wrong layout on first paint, and `display: none` keeps the hidden one away from
screen readers. The bracket needs two leagues to mirror, so a single resolved
field falls back to the stacked cards at every width.

**The geometry lives in `playoffPicture.ts`, not the component**, for the reason
`SPRAY_FRAME` does. Every connector is a bracket spanning two slots whose stub
must land exactly on the centre of the box it feeds, so every row is derived
rather than typed in, and the invariants are unit-tested: the midpoints, the
symmetry of the two halves, no two boxes overlapping in the crowded Division
Series column, and `BRACKET_WIDTH <= 1248` — a bracket wider than the container
simply overflows the page. `mirrorX` is the only difference between the halves.

**The empty boxes are the feature, not filler.** They are what makes this a
bracket rather than a list, and they are the honest rendering of a round the
standings cannot decide. They carry `sr-only` labels, since a dashed rectangle
reads as nothing without one.

## Data flow

```
Standings
  ├── useWildCardRace()               NL — already there, now spread into three children
  ├── useDivisionLeaders(NL)          new hook; shares fetchStandings' cache entry
  └── PlayoffPicture                  takes both as props
        ├── useWildCardRace({ leagueId: AL, tiebreakWindow: 4 })
        └── useDivisionLeaders(AL)    the AL's two requests, owned here
```

The AL hooks live in the component rather than in `Standings` because nothing else
in the app wants that data — the same arrangement as `LeagueRankings`. The
prop-passing convention exists to prevent *duplicate* fetches, and there is no
second consumer to duplicate against.

`src/utils/playoffPicture.ts` holds all the seeding logic as pure functions over
plain records, unit-tested in `src/utils/__tests__/playoffPicture.test.ts` —
including the format trap in decision 2, the bye pairings in decision 2, the
incomplete-field null, and the first-team-out boundary.

## Non-goals

- **No playoff probabilities.** Requires simulating the rest of the league; anything
  less is a fabricated number wearing false precision.
- **No historical/what-if seeding.** The tab states today.

## Cost

No new endpoint, no new npm dependency, no backend change, no DB or secret change.
Two new e2e fixtures (the AL's two standings responses); no existing fixture is
re-recorded. One LaunchDarkly flag, `enablePlayoffPicture`, defaulted `true`
in the `useFlags()` destructure — the same posture as `enableMatchupPreview`,
`enableBattingForm` and `enableLeagueRankings`, which do not exist in LaunchDarkly
yet and therefore always serve the code default.
