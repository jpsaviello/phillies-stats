# Implementation Plan: Roster tab

Design spec: `docs/superpowers/specs/2026-08-21-roster-tab-design.md`

## Task 1 — Types (`src/types/mlb.ts`)

Add `RosterStatusCode = 'A' | 'D10' | 'D15' | 'D60' | 'RM'` plus a widening
`(string & {})` escape so an unseen code (paternity list, suspension,
restricted list) does not fail to type — it must fall through to a default
group, not crash.

Add `RosterPlayer`:
- `person: { id, fullName, primaryNumber?, currentAge?, batSide?, pitchHand?, stats? }`
- `jerseyNumber: string` (**can be empty** — see spec edge cases)
- `position: { abbreviation, name, type }`
- `status: { code, description }`

`stats` is `{ group: { displayName: 'hitting' | 'pitching' }, splits: [{ stat }] }[]`
where `stat` is `BattingStats | PitchingStats`. Verified structurally identical
to the existing interfaces — declare it that way rather than casting.

Leave the existing `RosterEntry` untouched; `BullpenUsage` depends on it.

## Task 2 — API (`src/api/mlb.ts`)

`fetchRosterWithStats(): Promise<RosterPlayer[]>` hitting
`/teams/143/roster?rosterType=40Man&season=2026&hydrate=person(stats(type=season,season=2026))&fields=…`

The `fields=` list is measured at 31.5KB vs 112KB untrimmed. Same idiom as
`fetchBullpenBoxscore`. Do **not** touch `fetchRoster()`.

## Task 3 — Pure grouping (`src/utils/roster.ts`)

No React, no fetch — same posture as `bullpen.ts` / `playoffPush.ts` /
`tiebreakers.ts`, so it can be replayed against real JSON without a browser.

- `seasonStat(p)` → `{ group: 'hitting' | 'pitching', stat } | null`. Chooses by
  `stats[].group.displayName`, **never** by which keys are present (a pitcher's
  hydrated stat object carries `avg`/`obp`/`ops` — those are what he allowed).
  Returns `null` for the five statless players.
- `positionGroup(p)` → `'C' | 'IF' | 'OF' | 'DH' | 'P'`. Maps `position.type`;
  `"Hitter"` (the DH) is its own bucket, not silently "Other".
- `groupRoster(players)` → the three ordered sections (Active / Injured List /
  Minors), each an ordered list of `{ label, players }` position groups, with
  the IL section subdivided by `status.description` (10-Day before 15-Day before
  60-Day) rather than flattened to one badge.
- Sort inside a group: position order, then jersey number ascending (numeric,
  blanks last), then name.

## Task 4 — Component (`src/components/Roster.tsx`)

Follows `BattingTable`'s shape: `loading` → `TableSkeleton`, `error` →
`ErrorState` with the `reloadKey` retry, empty → `EmptyState`.

- Section headings with counts; position sub-headings as full-width `<tr>` rows
  inside one table per section so columns stay aligned.
- Sticky-left Player cell, `min-w-44` when `signedIn` else `min-w-36` — same
  reasoning already recorded in `BattingTable`.
- `StarButton` inside the Player cell (not its own column — it would sit outside
  the frozen region).
- Row click / Enter / Space → `GameLogModal` with `seasonStat` from the hydrated
  line and `group` from `seasonStat(p).group`. A statless row is **not**
  clickable — the modal would open onto nothing.
- `person.id` as the React key (jersey `4` is two different players today).
- Hitters: `AVG / HR / RBI / OPS`. Pitchers: `W-L / ERA / GS / K`. Dashes when
  statless.
- B/T rendered from `batSide.code`/`pitchHand.code`; handles `S`.

## Task 5 — Wiring

- `Nav.tsx`: add `'roster'` to the `Tab` union and a `Roster` entry. The nav is
  data-driven off a `tabs` array, so the flag has to filter that array — a
  visible tab rendering an empty `<main>` is worse than no tab.
- `App.tsx`: `enableRosterTab = true` in the `useFlags()` destructure, pass to
  `Nav`, mount `<Roster signedIn favorites onToggleFavorite />`.
- Guard the case where the flag turns off while `tab === 'roster'` — fall back
  to `batting` rather than rendering nothing.

## Task 6 — Verification

1. Replay `roster.ts` against live JSON with `node --experimental-strip-types`
   (pure module, no node_modules needed) — assert 26/7/12 split, Schwarber in DH,
   the five statless players, and that no pitcher is classified as a hitter.
2. `npx tsc -b`, `npm run lint`, `npm run build`.
3. `webapp-testing` per CLAUDE.md: both servers up, click the Roster tab,
   screenshot Active + IL sections, confirm no console errors, confirm the IL
   section shows all seven with their specific designations.

## Not doing

Transactions feed, depth-chart ordering, minor-league stat lines, SP/RP split.
No backend, dependency, DB, or secret change.
