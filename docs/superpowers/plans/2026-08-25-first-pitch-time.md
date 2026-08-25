# Implementation Plan: First pitch time on the Schedule tab

Spec: `docs/superpowers/specs/2026-08-25-first-pitch-time-design.md`

Five tasks, all frontend. No backend, no API route, no dependency, no migration,
no secret, no feature flag, no deploy step beyond the normal push.

---

## Task 1 — Type

`src/api/mlb.ts`, the `Game` interface (~line 243):

```ts
status: { abstractGameState: string; detailedState: string; startTimeTBD?: boolean }
```

Optional, so no existing call site breaks. `gameDate` is already declared on the
interface and already arrives on the wire — `fetchSchedule` passes no `fields=`
parameter, so **do not add one**, and do not touch the request string.

Verify nothing else redefines this status shape:
`grep -rn "abstractGameState" src/` — expect `api/mlb.ts` (definition),
`Schedule.tsx`, `HeroStrip.tsx`, `LiveGameStrip.tsx`, `GameDetailModal.tsx` as
readers only.

---

## Task 2 — Pure util

New `src/utils/gameTime.ts`. No React, no fetch, no import from `components/`.

```ts
import type { Game } from '../api/mlb'

const ET = 'America/New_York'

// Statuses where gameDate still holds the ORIGINAL slot but the game is not
// happening then. Verified against the 2026 season: a Postponed game keeps its
// gameDate and adds a sibling rescheduleDate, so printing gameDate here would
// state a first pitch that will never occur.
const VOID_STATES = ['Postponed', 'Cancelled', 'Suspended']

export function firstPitch(game: Game): string | null
```

Logic, in order:

1. `if (game.status.startTimeTBD) return 'TBD'` — before any date parsing.
2. `if (VOID_STATES.some(s => game.status.detailedState.startsWith(s))) return null`
   — `startsWith`, because MLB emits variants like `Postponed`, `Suspended: Rain`.
3. `if (game.status.abstractGameState !== 'Preview') return null` — this is the
   gate. **Never** branch on `detailedState === 'Scheduled'`; tonight's game reads
   `Pre-Game` and would be missed. See the spec's load-bearing-detail section.
4. Parse `new Date(game.gameDate)`; `if (Number.isNaN(d.getTime())) return null`.
5. Format `{ hour: 'numeric', minute: '2-digit' }`, matching
   `HeroStrip.tsx:242` and `MatchupPreview.tsx:152`.
6. Append the zone only when the viewer is not in ET:
   ```ts
   const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
   ```
   If `zone !== ET`, re-format with `timeZoneName: 'short'` instead of
   concatenating strings — locale-correct placement is the formatter's job.
   Wrap the `resolvedOptions()` read in try/catch defaulting to ET-assumed
   (i.e. no abbreviation), matching the repo's fail-open `localStorage` idiom
   in `AllStarBanner`.

Returning `null` rather than throwing or returning `''` is what keeps the call
site a one-line `?? game.status.detailedState`.

---

## Task 3 — Wire into `Schedule.tsx`

`src/components/Schedule.tsx`, the final ternary in the row (~line 155):

```tsx
) : (
  <div className="text-sm text-gray-500 tabular-nums">
    {firstPitch(game) ?? game.status.detailedState}
  </div>
)}
```

Add `tabular-nums` so a column of times aligns the way the score column above it
already does.

Do **not** change:
- the `isFinished` branch (score rendering),
- the `clickable` computation,
- the `upcoming` pick that feeds `MatchupPreview`,
- the `oddsMap` / `philliesOdds` logic,
- the row `className`, the `w-24` date column, or any spacing.

This task is a single-expression swap. If the diff grows past ~6 lines, something
has gone wrong.

---

## Task 4 — Verify the pure branches (free, deterministic)

The live ±14-day window contains no TBD, no postponed, and no doubleheader game
on a typical day, so these branches are unreachable in a browser. Exercise them
against captured JSON instead — the real 2026 responses cited in the spec:

| Fixture | Expect |
|---|---|
| `gameDate: 2026-08-26T01:40:00Z`, `Pre-Game`, `Preview` | `9:40 PM` in ET |
| `gameDate: 2026-08-26T20:10:00Z`, `Scheduled`, `Preview` | `4:10 PM` in ET |
| `startTimeTBD: true` | `TBD` |
| `Postponed` + `gameDate: 2026-04-29T22:10:00Z` | `null` |
| `Final` | `null` |
| `In Progress` | `null` |
| `gameDate: 'garbage'`, `Preview` | `null` |
| DH pair `2026-04-30T16:35:00Z` / `T21:35:00Z` | `12:35 PM` / `5:35 PM` |

Also re-run the zone branch with `TZ=America/Denver` to confirm the abbreviation
appears, and unset to confirm it does not.

There is no test runner in this repo — run these as a throwaway `tsx` script or
inline in the browser console. The point is that the assertions are cheap and
repeatable, not that they get committed.

---

## Task 5 — Browser verification + docs

Per CLAUDE.md, `webapp-testing` is required before this counts as done.

1. `npm run dev:server` and `npm run dev` (both needed, or the schedule is empty).
2. Playwright: navigate, click the **Schedule** tab, screenshot at 1440px and 375px.
3. Confirm:
   - tonight's Mariners row reads a time, **not** `Pre-Game`;
   - future rows read times, not `Scheduled`;
   - past rows are unchanged (`W 5–3` / `L 2–4`);
   - the `MatchupPreview` panel above still renders and still shows its own
     date+time (duplication with the row below is expected and fine);
   - no console errors;
   - at 375px the time does not push the opponent name into a second line —
     the opponent column is `truncate`d, so watch for over-truncation rather
     than for wrapping.
4. Update `CLAUDE.md`'s `Schedule` bullet in the components list: note that the
   right-hand slot shows first pitch for `Preview` games, that the gate is
   `abstractGameState` (with the `Pre-Game` trap spelled out), and that
   postponed games deliberately keep their status word because `gameDate`
   survives a postponement.

---

## Risk notes

- **Lowest-risk change in recent memory.** One optional type field, one pure
  function, one swapped expression. Worst case on any unexpected input is
  `null` → today's exact output.
- **No cost.** No chat request, no Odds API call, no new upstream request.
- **Ordering:** Tasks 1→2→3 are strictly sequential; 4 needs 2; 5 needs 3.
- **Do not** convert `fetchSchedule` to a trimmed `fields=` request "while in
  there." `MatchupPreview` relies on the full `hydrate=probablePitcher` payload,
  and narrowing the response is a separate change with its own blast radius.
