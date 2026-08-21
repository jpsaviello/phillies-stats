# Design Spec: Roster tab

## Goal

Answer the two questions this app currently cannot answer at all: **"who is on
this team?"** and **"who's hurt?"**

Every existing tab is a leaderboard. Batting and Pitching list only players who
have accumulated stats, sorted by production, with no position, no jersey number,
no age, no handedness, and — critically — no indication that a player is on the
injured list. A fan looking at the Batting tab has no way to learn that Adolis
García has not played since June because he is on the 60-day IL; his row simply
sits there with a .195 average as though he were available tonight.

The injury gap is the loudest part. Pulled live while writing this spec, the
40-man carries **seven injured Phillies** — five on the 60-day, one 15-day, one
10-day — and not one screen in this application mentions any of them. `HeroStrip`
shows leaders, `BullpenUsage` shows arms that have recently pitched (an injured
reliever is invisible there precisely *because* he is injured), `MatchupPreview`
covers two starters. Nobody covers absence.

This is also the cheapest feature left. `/teams/` is already in `MLB_ALLOWED`,
`fetchRoster()` already exists, and the whole tab is one HTTP call.

## Live state this was designed against (2026-08-21)

Real API output, not hypothetical. `rosterType=40Man` returns 45 entries:

```
Active (26)               C  Realmuto, Stubbs
                          IF Harper, Stott, Arraez, Bohm, Turner
                          OF Marsh, Sosa, Hill, Crawford, De La Cruz
                          DH Schwarber
                          P  Wheeler, Nola, Luzardo, Sanchez, Painter,
                             Alvarado, Duran, Kerkering, Raley, Mayza,
                             Bowlan, McFarlane, Shugart

Injured 10-Day (1)        Rafael Marchán      C
Injured 15-Day (1)        Caleb Kilian        P
Injured 60-Day (5)        Johan Rojas         CF
                          Felix Reyes         LF
                          Adolis García       RF
                          Brad Keller         P
                          Tanner Banks        P

Reassigned to Minors (12) Cortes, Chace, Lazar, Backhus, Holman, Hoffmann,
                          Rangel, Rincones Jr., Thomas, Kemp, Misner, Cairo
```

Those seven IL names are the feature in one block. They are sitting in a public
API, already behind an allowlisted proxy path, and the app renders none of them.

## Data: one call, one trim

`GET /teams/143/roster?rosterType=40Man&season=2026&hydrate=person(stats(type=season,season=2026))&fields=…`

- **`40Man`, not `active`.** The existing `fetchRoster()` uses `rosterType=active`,
  which returns exactly the 26 available players — i.e. it structurally cannot
  contain an injured player. The IL section is the reason this tab exists, so it
  needs the 40-man view. Note the response is **45 entries, not 40**: players on
  the 60-day IL do not count against the 40-man but the API returns them anyway,
  which is the behavior we want.
- **`hydrate=person` supplies `batSide` / `pitchHand`** (verified — the bare
  roster response does not carry them), plus `currentAge`.
- **`hydrate=person(stats(...))` supplies the season line**, and it is
  structurally identical to the existing `BattingStats` / `PitchingStats`
  interfaces — every field those declare is present. That matters for reuse
  (see below); it is not a coincidence worth relying on silently, so the plan
  asserts it at the type level rather than casting.
- **`fields=` takes the payload from 112KB to 31.5KB** (measured). Same trimming
  idiom `fetchLiveFeed` / `fetchBullpenBoxscore` already use.

`fetchRoster()` stays exactly as it is — `BullpenUsage` depends on its
active-only semantics to decide who gets a zero-appearance row. This tab gets a
new sibling, `fetchRosterWithStats()`.

## Load-bearing decision 1: group by roster status first, position second

The obvious layout is one table of 45 players with a status column. That buries
the point. Status is the *primary* fact a reader wants segmented — "who can play
tonight" versus "who is hurt" versus "who is in Lehigh Valley" are three
different questions — and a sortable column makes the reader do the segmenting
themselves.

So: **three sections, in this order** — Active (26), Injured List (7), Minors
(12) — each with its own count in the heading, and within a section, players
grouped by position in scorecard order (C, IF, OF, DH, P).

The IL section keeps each player's *specific* status (`Injured 60-Day`, not a
generic "IL" badge). The difference between a 10-day and a 60-day absence is the
single most informative thing about an injured player, and flattening them to one
badge would throw away the only real information the API gives us here.

## Load-bearing decision 2: no return dates, no injury descriptions

`status.description` is the entire injury vocabulary this endpoint provides. It
says `Injured 60-Day`. It does not say what is injured, how it happened, or when
the player is expected back.

We show exactly that string and nothing more. **No "expected back late August",
no "hamstring", no "out for the season".** Those facts exist in beat reporting,
not in statsapi, and manufacturing them — or letting the chat bot's web search
backfill them into a card that otherwise renders measured API data — is the same
failure mode this codebase has now rejected three times: `MatchupPreview` dropped
its "who has the edge" highlight, `PlayoffPush` refuses to show a playoff
probability, `BullpenUsage` refuses to render an availability verdict. A 60-day
IL designation carries a real, checkable implication (the player has been out at
least 60 days and is not close to returning) and the reader can draw it. A
speculative return date rendered in the same visual register as a measured `.195`
would read as equally authoritative when it is not.

The one derived figure we *do* show is honest arithmetic: nothing. There is no
date field to derive from.

## Load-bearing decision 3: the roster cannot split starters from relievers

Already recorded in `CLAUDE.md` for `BullpenUsage` and re-verified here: every
pitcher on the roster comes back `position.type: "Pitcher"` with
`abbreviation: "P"`. There is no SP/RP field anywhere in this response.

`BullpenUsage` solves this with season splits (`gamesStarted / gamesPlayed >=
0.5`), but it gets those splits handed to it as a prop from `PitchingTable`,
which had already fetched them. This tab has no such donor, and adding a second
`fetchPitchingStats()` call to split one heading into two is not worth it.

**So pitchers are one group, labelled `Pitchers`.** The season line each pitcher
shows already includes `GS`, so a reader who cares can see that Wheeler has 26
starts and Kerkering has none. That is the same "state the fact, let the reader
conclude" posture as decision 2, and it costs one column instead of one fetch.

## Load-bearing decision 4: reuse the row-click modal, do not rebuild it

Clicking a row opens the existing `GameLogModal`, exactly as `BattingTable` and
`PitchingTable` do. It takes `{ id, name, stat }` and renders the season header
from `stat` with no extra fetch — and the hydrated roster stats satisfy that
prop shape directly.

This is why hydrating stats onto the roster call is worth the 31.5KB: it makes
the tab a real entry point into player detail rather than a phone book, and it
does so without a second request or a new modal. `StarButton` is likewise reused,
gated on `signedIn` the same way, so a fan can star a player from the roster —
including an injured one, which the stat tables cannot offer at all.

## Component shape

`src/components/Roster.tsx`, one file, mounted as a fifth tab.

```
Active Roster (26)
  Catchers          # 10  J.T. Realmuto      R/R  35   .257  14 HR  61 RBI  .742
  Infielders        #  3  Bryce Harper       L/R  33   …
  Outfielders       …
  Designated Hitter …
  Pitchers          # 45  Zack Wheeler       R/R  36   11-5  2.71 ERA  26 GS  178 K

Injured List (7)
  Injured 10-Day    # 13  Rafael Marchán     S/R  27   …
  Injured 15-Day    # 56  Caleb Kilian       R/R  29   …
  Injured 60-Day    # 53  Adolis García      R/R  33   .195   7 HR  21 RBI  .599
                    …

Minors (12)
  …
```

Hitters get `AVG / HR / RBI / OPS`; pitchers get `W-L / ERA / GS / K`. Both are
compact — the full lines live one click away in the modal and two clicks away on
the Batting/Pitching tabs.

## Edge cases found in the live data (all real, all hit today)

- **Jersey numbers can be empty.** Five of the twelve minors players have
  `jerseyNumber: ""` (Cairo, Thomas, Hoffmann, Holman, Cortes). Render blank, not
  `#undefined`.
- **Jersey numbers are not unique.** `4` is both Luis Arraez (active) and Otto
  Kemp (minors). **`person.id` is the React key**, never the number.
- **Five players have no `stats` array at all** (Cairo, Holman, Rojas, Chace,
  Cortes) — no 2026 appearances. Render dashes. Note Johan Rojas is on the 60-day
  IL *and* has no stats, so the IL section must handle a fully statless row.
- **`batSide.code` can be `S`** (Marchán, switch-hitter). Not just L/R.
- **A DH's `position.type` is `"Hitter"`, not `"Infielder"`** — Schwarber falls
  into a fifth bucket. Handle it explicitly or he silently lands in an "Other"
  group.
- **A pitcher's hydrated `stat` object contains hitting keys too** (`avg`, `obp`,
  `ops` — those are what he *allowed*). Choose the group by
  `stats[].group.displayName`, never by which keys are present.

## Out of scope

- **Transactions / roster move history.** `/transactions` is not in `MLB_ALLOWED`,
  so it needs a `core.ts` change and a backend image rebuild. Deferred; the IL
  section covers the current-state question that motivated this tab.
- **Depth chart ordering** (`rosterType=depthChart`) — a separate call, and the
  position grouping already gets most of the way there.
- **Minor-league stats for the Reassigned players.** Their MLB line is what this
  endpoint gives; their IronPigs line is a different sportId and a different tab.
- **SP/RP split**, per decision 3.

## Flag

`enableRosterTab`, defaulted `true` in the `useFlags()` destructure, same
kill-switch pattern as `enableBullpenUsage` / `enableOnThisDay`. Because this
adds a **tab**, flag-off must remove the nav entry as well as the panel —
a visible tab that renders an empty `<main>` is worse than no tab.

Note the trap recorded in `CLAUDE.md` for `enable-bullpen-usage`: a flag created
in LaunchDarkly with targeting **off** serves `offVariation` (`false`) to every
connected client, so the `= true` code default only rescues an unreachable LD
client, not an explicitly-off flag. Create this one with targeting **on**, or the
tab will be hidden in production for everyone whose LD client connects.

## Not changing

No backend change, no new allowlist entry, no dependency, no DB change, no
migration, no secret. One new component, one new API function, one new type, one
nav entry, one flag.
