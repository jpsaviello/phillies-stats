# Plan: Playoff Picture bracket (Standings tab)

Spec: `docs/superpowers/specs/2026-09-08-playoff-picture-design.md`

## Task 1 — the data, without a new request

- `src/api/mlb.ts`: factor the NL regularSeason URL into one private
  `nlRegularSeason()`; `fetchStandings()` keeps returning the NL East group,
  new `fetchDivisionLeaders()` returns the three leaders with their division id
  (from the group) and name (from a local constant) attached.
- `src/types/mlb.ts`: extract `SplitRecords` (shared by both standings types),
  widen `StandingsRecord` with `records` / `divisionChamp`, add
  `DivisionLeaderRecord`.
- `src/hooks/useDivisionLeaders.ts`: sort by percentage, then run
  `applyTiebreakers` when two leaders are actually tied.

Verify: one `standings?leagueId=104…regularSeason` request on the Standings tab,
not two.

## Task 2 — the seeding, pure

- `src/utils/playoffPicture.ts`: `byRecord`, `buildPlayoffPicture`, `seedOf`.
- `src/utils/__tests__/playoffPicture.test.ts`: the format trap (a wild card that
  out-records a division winner still seeds 4th), the 3v6 / 4v5 pairings and the
  bye pairings, the incomplete-field null, the first-team-out boundary, the
  short-vs-full club name, and the clinch booleans.

## Task 3 — the graphic

- `src/components/PlayoffPicture.tsx`: two bye cards, two series cards, the
  first-team-out line, the tiebreaker footnote. No colour-by-seed.
- `src/components/Standings.tsx`: mount it full width above the existing grid,
  outside every fetch's loading/error branch.
- `src/App.tsx`: `enablePlayoffPicture`, defaulted true.

## Task 4 — verification

- `npm run build`, `npm run lint`, `npm test`.
- `tests/e2e/tabs.spec.ts`: one structural assertion (two byes, two series), since
  a self-hiding panel's failure mode is silence. Suite must stay hermetic — the
  bracket adds no request, so no fixture is re-recorded.
- `webapp-testing`: both themes, 1280 and 375, request accounting, contrast.
- CLAUDE.md.
