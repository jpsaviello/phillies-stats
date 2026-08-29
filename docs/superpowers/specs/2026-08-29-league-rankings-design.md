# Design: League Rankings

Date: 2026-08-29
Status: implemented

## Problem

Everything on the Standings tab measures the season in wins — the division
table, the wild card race, `PlayoffPush`'s magic and elimination numbers. None
of it says whether this is a *good team*. A club can sit four games up while
scoring less than everyone around it, and a fan looking at 75-60 has no way to
tell from this app whether the offense or the pitching is carrying it.

The app knows a great deal about individual Phillies and nothing at all about
the Phillies as one of thirty clubs. "Are we a top-10 offense?" was
unanswerable here.

## What ships

A `League Rankings` block at the foot of the Standings tab: two cards, Offense
and Pitching, each listing eight team categories with the club's season total
and its placement among all 30 teams (`.313` · `22nd of 30`).

Offense: Runs, Home Runs, Batting Avg, On-Base, Slugging, OPS, Stolen Bases,
Strikeouts. Pitching: ERA, WHIP, Strikeouts, Walks, Opponent Avg, HR Allowed,
Runs Allowed, Saves.

## Decisions

**1. Ranks are computed client-side, not read from the response.**
`/teams/stats` does carry a `rank` field, but it is one overall figure per team,
not a per-category placement — there is no "rank in home runs" anywhere in the
payload. Two requests (one per group) return all 30 clubs' season totals, and
`utils/rankings.ts` ranks them. Verified against the live API on 2026-08-29: all
nine spot-checked categories, including the lower-is-better ones, match.

**2. Every category declares which end is good.** ERA and strikeouts-at-the-plate
are better low; runs and OPS are better high. Getting that backwards would
silently report a first-place staff as last — the failure is invisible in the
rendered output, which is exactly why the direction is a required field on every
category rather than a special case in the ranking function.

**3. Ties share the better rank (1, 2, 2, 4).** Two clubs with an identical ERA
are genuinely tied. Breaking that by team id is what MLB's own standings endpoint
does and the reason `utils/tiebreakers.ts` had to be written; inventing a
placement here would be the same mistake in a smaller place.

**4. The two groups fetch independently.** Separate `.then` chains rather than a
`Promise.all`, so a pitching failure leaves the offense card standing — the same
arrangement `PlayoffPush` uses for its two fetches. The whole block self-hides
only when both come back empty.

**5. MLB rank, not NL rank.** "12th of 30" is how these numbers are cited
everywhere. A league-only rank would need a team→league map and a second source
of truth about which clubs count, for a figure nobody quotes.

**6. No composite grade, no chart.** No "offense: B−", no index. Every figure is
either a number MLB published or a count of how many clubs are ahead of it.

## Rejected

**A rank meter or bar per row.** Thirty-two small meters is a lot of visual
weight for a value the text already states exactly, and a bar invites reading
distance where only order exists — the gap between 1st and 2nd in ERA is not the
gap between 21st and 22nd.

**Its own tab.** A new tab costs a nav entry and a route for two cards, and this
is the answer to "where do we stand", which is the question the Standings tab
already exists to answer.

**Rate stats normalized per game.** MLB's own totals are what fans quote and
what every other site prints; recomputing them would produce numbers that match
nothing.

## Files

- `src/api/mlb.ts` — `fetchTeamStats(group)`
- `src/utils/rankings.ts` — pure: `rankCategories`, `HITTING_CATEGORIES`,
  `PITCHING_CATEGORIES`
- `src/components/LeagueRankings.tsx` — the panel
- `src/components/Standings.tsx` — mounts it below `WildCardStandings`, outside
  the standings fetch's branches
- `src/App.tsx` — `enableLeagueRankings` flag, defaulted `true`

No backend, database, dependency, or secret change.
