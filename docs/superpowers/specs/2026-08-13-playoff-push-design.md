# Design Spec: Playoff Push panel (Standings tab)

## Goal

Answer the one question every Phillies fan is asking in mid-August — **"are we
making it?"** — on the tab where they already go looking.

Today the Standings tab shows two tables of raw W/L. It tells you the Phillies
are 64-58 and where they sit, but not what that *means*: how many games are left,
who's left on the schedule, how close elimination actually is, or what the current
pace projects to. All of that is either already in a response the app throws away
or is one trimmed request away.

Concretely, as of 2026-08-13 the app fetches `eliminationNumber: 32` and
`wildCardEliminationNumber: 41` on every Standings load and discards both.

## Live state this was designed against (2026-08-13)

Not a hypothetical — every number below is from a real response, and the design
is shaped by how awkward this particular situation is:

```
NL East:     ATL 73-48   ·   PHI 64-58  (9.5 GB, elim# 32)
Wild card:   1 CHC 71-50   2 SD 65-57   3 ARI 64-58   4 PHI 64-58   5 MIA 62-59
Remaining:   40 games  ·  19 home / 21 away  ·  opponents' combined W% .520
```

The Phillies are **tied with Arizona on record** for the final wild card spot and
lose the head-to-head 1-2, so they are genuinely on the wrong side of the cutoff
by a tiebreaker alone. A panel that rounded this to "0.0 GB" and left it there
would be actively misleading.

## The load-bearing decision: share the wild-card ordering, don't re-derive it

`WildCardStandings` already solved the hard part. MLB's API does **not** apply
tiebreakers — `wildCardRank` orders tied clubs by ascending team ID — so
`src/utils/tiebreakers.ts` re-sorts them using the real 2022-CBA chain
(head-to-head → intradivision → intraleague), which costs one trimmed
`fetchSeasonResults` call per tied club.

The panel needs that same ordering to state a position. If it fetched and
computed independently, two things go wrong:

1. **Cost** — the tiebreaker fetches (~25KB each, up to 4 of them here) would run twice.
2. **Divergence risk** — the panel and the table sitting directly beneath it would
   be two separate code paths claiming a playoff position. Any future change to
   one silently desyncs them, and "4th" above a table showing 3rd is worse than
   either number alone.

So the fetch + tiebreak moves up into a shared hook, `useWildCardRace()`, owned by
`Standings` and passed to both children as props. `WildCardStandings` changes from
self-fetching to prop-driven; its rendering and self-hide behavior are untouched.

**The independence convention is preserved.** CLAUDE.md notes that
`WildCardStandings` is mounted *outside* the division table's loading/error
branches so a standings failure doesn't take the wild card table down. Same
applies to the panel: it is mounted outside those branches too, receives the
division records as a prop (so it adds **zero** duplicate `fetchStandings` calls),
and renders `null` if they're empty or the Phillies are missing.

## Two new API calls, both trimmed

| Function | Endpoint | Returns |
|---|---|---|
| `fetchRemainingSchedule()` | `/schedule?teamId=143&gameType=R` + `fields=` | `{ opponentId, isHome }[]` for every non-`Final` game |
| `fetchLeagueRecords()` | `/standings?leagueId=103,104` + `fields=` | `Map<teamId, { wins, losses }>` for all 30 clubs |

`fetchRemainingSchedule` mirrors `fetchSeasonResults`' existing shape — same
endpoint, same `fields=` trimming idiom, filtering on `abstractGameState` — but
keeps the games that *haven't* happened instead of the ones that have.

`fetchLeagueRecords` needs **both** leagues (`103,104`, verified to return all 6
divisions / 30 teams in one call) because the remaining schedule includes
interleague games — Twins, Mariners, Angels, Astros and Rays are all on it.

### One trap worth recording

Games played per the standings (64+58 = **122**) does not match the count of
`Final` games on the schedule (**123**) — there's a tie/suspended game in there.
Games remaining is therefore derived from the **schedule** (count of non-`Final`
games), never from `162 - (W+L)`, which would be off by one.

## What the panel shows

Four facts, in descending order of how often a fan wants them:

**1. Wild card position** — the tiebreaker-corrected rank, an IN/OUT pill against
the NL's 3 wild card berths, and the margin to the cutoff (games up on the first
team out if in; games back of the 3rd spot if out). When that margin is 0.0 the
panel says so explicitly and surfaces the tiebreaker note
`applyTiebreakers` already produces — this is the Arizona case above.

**2. Division position** — games back, and the elimination number (or magic
number, if leading). Both already in the fetched payload.

**3. Remaining schedule** — games left, home/away split, and opponents' combined
winning percentage as a strength-of-schedule read (`.520` today — tougher than
average, driven by 7 games left against the 73-48 Braves).

**4. Current pace** — the season winning percentage extrapolated across the games
remaining, e.g. `.525 → 85-77`.

### What it deliberately does NOT show

**No playoff probability.** A "72% to make the postseason" figure requires
simulating the rest of the league, and anything short of that is a made-up number
presented with false precision. Every figure on this panel is either read
directly from MLB's response or is arithmetic the user could redo by hand. This
is the same standard the On This Day and beat-reporter routines are held to.

**No "needs to go 21-19"** framing, for the same reason — it requires assuming a
win total that clinches, which nobody knows in August.

## Edge cases

| Case | Behavior |
|---|---|
| Phillies lead the NL East | They vanish from the wildCard response entirely (it excludes division leaders). Panel shows division magic number and "Leading the NL East" instead of a wild card rank. |
| Division records empty / Phillies absent | Render `null` — same convention as `HeroStrip` / `WildCardStandings`. |
| Wild card fetch or tiebreak fails | Wild card card degrades to hidden; the division / schedule / pace cards still render. |
| `fetchLeagueRecords` fails | Strength-of-schedule figure omitted; games-left and home/away split still render. |
| Season over (0 games remaining) | Remaining and pace cards hide; position cards remain. |
| Clinched | `clinched` / `clinchIndicator` shown in place of the elimination number. |

## Files

**New**
- `src/hooks/useWildCardRace.ts` — the lifted fetch + tiebreak
- `src/utils/playoffPush.ts` — pure math (SOS, pace, cutoff margin, ordinals)
- `src/components/PlayoffPush.tsx`

**Changed**
- `src/api/mlb.ts` — 2 new fetches
- `src/types/mlb.ts` — `StandingsRecord` gains the elimination/magic/clinch fields already present in the response
- `src/components/Standings.tsx` — owns the hook, mounts the panel
- `src/components/WildCardStandings.tsx` — prop-driven instead of self-fetching

No backend change, no new dependency, no DB change. Frontend-only, so a push to
`develop` auto-deploys Vercel production and k8s needs only a frontend rebuild.
