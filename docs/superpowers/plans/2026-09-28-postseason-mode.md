# Postseason Mode — Implementation Plan

Spec: `docs/superpowers/specs/2026-09-28-postseason-mode-design.md`

## Task 1: Data layer and pure logic

- `src/api/mlb.ts`: extend `Game` with optional `gameType`, `seriesGameNumber`,
  `gamesInSeries`, `seriesDescription`, `description`, `ifNecessary`,
  `officialDate`. Add `fetchPostseasonGames()` (trimmed, SCHEDULE cache) returning
  `Game[]` with `officialDate`. Add optional `gameType: 'R' | 'P'` to
  `fetchBattingStats`/`fetchPitchingStats`, appending `&gameType=P` only for `P`.
- `src/utils/postseason.ts`: `MLB_CLUB_IDS`, `isClub`, `ROUND_NAMES`, `winsNeeded`,
  `seriesBetween`, `seriesOfGame`, `isMoot`, `clubName`, `seriesStatusText`,
  `seriesContext`, `buildLiveLeague`, `buildWorldSeries`.
- `src/utils/__tests__/postseason.test.ts`.
- Verify: `npm test`, `npm run build`.

## Task 2: Live bracket

- `PlayoffPicture.tsx`: fetch `fetchPostseasonGames()` (catch → `[]`), build a
  `LiveLeague` per league; league is live when `buildLiveLeague` returns non-null.
- Bracket: team boxes take optional series wins/eliminated state; WC-winner slot
  and CS/pennant slots render compact team boxes once decided; WS status in the
  gutter.
- Stacked: live rounds as cards; World Series card.
- Hide First Out in live mode; live heading hint.
- Verify: unit tests, e2e (projection mode unchanged), browser at 1280/375.

## Task 3: Series context on Today and Schedule

- `today.ts`: none of `pickHeadline`'s contract changes; Today filters moot games
  before calling it.
- `Today.tsx`: context line + stakes chip on the headline, round/status on the
  last-game card.
- `Schedule.tsx`: drop moot games, context second line, `Postseason` divider.
- Verify: browser against live data (the WC games are in the window).

## Task 4: Stats split toggle

- `useRoute.ts`: `split: 'post' | null` parsed/formatted; `setTab` clears it.
- `src/hooks/usePhilliesInPostseason.ts`.
- `src/components/SplitToggle.tsx` (segmented control, `aria-pressed`).
- `BattingTable`/`PitchingTable`: regular splits always fetched (modal, Hot & Cold,
  Bullpen Usage); postseason splits fetched when `split=post`; table shows the
  chosen set; heading follows; empty state before the first postseason game.
- Verify: browser with 2025-style check that the P call works (live, returns empty
  before 2026-09-29).

## Task 5: Fixtures, docs, ship

- Add the postseason-schedule e2e fixture (recorded through the proxy URL shape).
- `npm run lint && npm run build && npm test && npm run test:e2e`.
- `webapp-testing` pass with screenshots.
- CLAUDE.md section; progress ledger; commit; push.
