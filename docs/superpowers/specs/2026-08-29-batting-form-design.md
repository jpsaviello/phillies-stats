# Design: Hot & Cold (trailing batting form)

Date: 2026-08-29
Status: implemented

## Problem

The Batting tab shows season totals and nothing else, and a season average is
precisely the statistic that cannot answer the question a fan asks in August:
*is he going well right now?* By game 135 a 4-for-4 night moves a season line by
three points. Every other part of the app has some notion of "recently" — the
Pitching tab has `BullpenUsage`, the Schedule tab has `MatchupPreview`, the
Standings tab has `PlayoffPush` — the Batting tab had none, and it is the tab
people open first.

The information already existed in the app, buried: `GameLogModal`'s trend
chart shows one player's rolling form, one player at a time, behind a click. It
answers "how is Harper going" and cannot answer "who is going well."

## What ships

A `Hot & Cold` panel above the Batting table: one row per qualified hitter over
a trailing 15-day window (G, AB, H, HR, RBI, AVG, OPS) plus `±OPS`, the gap
between that stretch and the same hitter's season OPS. Rows are sorted by window
OPS descending and grouped **Heating up / Holding steady / Cooling off** at a
±.100 OPS threshold that the footnote states outright.

## Decisions

**1. `stats=byDateRange`, one request for the whole team.** The obvious
implementations are a game log per player (~15 requests) or a boxscore per game
the way `BullpenUsage` does it (~13). MLB will aggregate a date range server-side
for an entire team in a single call, already sorted by average, already carrying
`player`. The panel costs one request.

**2. A calendar window, not "last N games".** `stats=lastXGames` also exists and
is tempting, but it measures each hitter over a different span: a bench bat's
"last 10" reaches back a month, and he is then compared against a regular's
last week and described with the same word. Fifteen calendar days measures
everyone over the same stretch of the season, which is what makes the rows
comparable to each other.

**3. The baseline is the player's own season line, not the team's or the
league's.** "Cold" has to mean *cold for him*: Trea Turner at .174 and Garrett
Stubbs at .174 are not the same event. This is also why the panel takes
`seasonSplits` as a prop from `BattingTable` rather than fetching season stats
again — the same no-duplicate-fetch arrangement as `BullpenUsage` taking them
from `PitchingTable`, and for the same reason `PlayoffPush` takes
`divisionRecords` from `Standings`. It is usually still `[]` on first render, so
the comparison is a `useMemo` over the prop, not something computed inside the
network effect.

**4. A 10-plate-appearance gate.** Below it the table fills with pitchers who
took one at-bat and September call-ups with three, every one of them rendered as
a .000 or a 1.000 hitter, crowding out the eight regulars the panel exists to
describe. This is a signal gate, not a fairness rule, and the footnote says so.

**5. It describes, it does not predict.** No "due for a hit", no projection, no
color-coding a hitter as good or bad. Same standard `BullpenUsage` holds itself
to in reporting workload rather than availability, and `PlayoffPush` in showing
no playoff probability. Fifteen days is a small sample; the panel's honest
contribution is the measured line and its distance from the player's own
baseline, both of which a reader can recompute by hand. The group labels are
arithmetic against a stated threshold, not a verdict.

**6. Grouping compares the rounded delta.** OPS is published to three decimals,
so the true difference between two OPS figures is a three-decimal quantity — but
in binary floating point `.872 - .772` lands a hair under `.100`. Rounding at
classification time rather than at render time is what keeps a row printed
`+.100` from sitting under "Holding steady" while the footnote says `.100` groups
it as heating up.

## Rejected

**Sparklines per hitter.** A 15-point line in a table cell is unreadable at
phone width, and the game-log modal already owns per-player trend rendering.

**Highlighting the hottest hitter.** Rejected for the same reason
`MatchupPreview` has no "who has the edge" styling: picking a winner per row
editorializes on a panel whose job is to lay the lines out and let the reader
compare them.

**A "last 7 days" toggle.** A second window doubles the requests and halves the
sample; 15 days is roughly 13 games, which is the smallest window where OPS is
worth printing at all.

## Files

- `src/api/mlb.ts` — `fetchBattingByDateRange(startDate, endDate)`
- `src/types/mlb.ts` — `WindowBattingStats`, `HitterForm`
- `src/utils/battingForm.ts` — pure: `buildForms`, `formatDelta`, `parseRate`
- `src/components/BattingForm.tsx` — the panel
- `src/components/BattingTable.tsx` — mounts it; refactored from early returns to
  a single return with inline ternaries so a season-stats failure cannot take the
  panel down (the identical refactor `PitchingTable` needed for `BullpenUsage`)
- `src/App.tsx` — `enableBattingForm` flag, defaulted `true`

No backend, database, dependency, or secret change.
