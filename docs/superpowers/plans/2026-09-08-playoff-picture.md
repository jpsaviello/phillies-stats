# Plan: Playoff Picture bracket (Standings tab)

Spec: `docs/superpowers/specs/2026-09-08-playoff-picture-design.md`

## Task 1 — the data, one league per request

- `src/api/mlb.ts`: factor the regularSeason URL into one private
  `regularSeason(leagueId)`; `fetchStandings()` keeps returning the NL East group
  from the NL call, new `fetchDivisionLeaders(leagueId)` returns that league's
  three leaders with their division id (from the group) and name (from a local
  constant) attached. `fetchWildCardStandings(leagueId)` gains the same parameter,
  defaulting to the NL so every existing call site and URL is unchanged.
  Deliberately NOT `leagueId=103,104`: that response is 81KB against 40KB and
  `fetchStandings` is HeroStrip's, which runs on every tab.
- `src/types/mlb.ts`: extract `SplitRecords` (shared by both standings types),
  widen `StandingsRecord` with `records` / `divisionChamp`, add
  `DivisionLeaderRecord`.
- `src/hooks/useDivisionLeaders.ts`: sort by percentage, then run
  `applyTiebreakers` when two leaders are actually tied.
- `src/hooks/useWildCardRace.ts`: options for `leagueId` and `tiebreakWindow`,
  both defaulting to today's behaviour.

Verify: four standings requests on the tab (NL/AL x regularSeason/wildCard), with
the NL regularSeason one shared with `fetchStandings` rather than duplicated.

## Task 2 — the seeding, pure

- `src/utils/playoffPicture.ts`: `byRecord`, `buildPlayoffPicture`, `seedOf`.
- `src/utils/__tests__/playoffPicture.test.ts`: the format trap (a wild card that
  out-records a division winner still seeds 4th), the 3v6 / 4v5 pairings and the
  bye pairings, the incomplete-field null, the first-team-out boundary, the
  short-vs-full club name, the clinch booleans, and every division id resolving
  to a name.

## Task 3 — the graphic

- `src/components/PlayoffPicture.tsx`: per league a byes card, two series cards
  and a first-team-out line; the two leagues side by side from `lg`, each
  resolving and failing on its own. The AL's two hooks are owned here, since
  nothing else in the app wants that data. No colour-by-seed.
- `src/components/Standings.tsx`: mount it full width above the existing grid,
  outside every fetch's loading/error branch.
- `src/App.tsx`: `enablePlayoffPicture`, defaulted true.

## Task 4 — verification

- `npm run build`, `npm run lint`, `npm test`.
- `tests/e2e/tabs.spec.ts`: one structural assertion (both league headings, two
  byes cards, four series), since a self-hiding panel's failure mode is silence.
  Suite must stay hermetic: record the AL's two standings fixtures only, rather
  than re-recording every fixture against a clock frozen five days back.
- `webapp-testing`: both themes, 1280 and 375, request accounting, contrast.
- CLAUDE.md.
