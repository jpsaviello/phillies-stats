# MLB Tiebreaker-Aware Wild Card Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Order the NL Wild Card table by the real MLB tiebreaker rules (head-to-head → intradivision → intraleague) instead of trusting `wildCardRank`, which breaks ties by ascending team ID. Today that puts the Phillies below the playoff cutoff and the Padres above it; the correct order is the reverse.

**Architecture:** A new pure utility (`src/utils/tiebreakers.ts`) does all grouping and ordering. Head-to-head data comes from one trimmed `/schedule` call per tied club (new `fetchSeasonResults` in `src/api/mlb.ts`); intradivision and intraleague records already ride along in the standings response once `hydrate=team(division)` is added. `WildCardStandings.tsx` orchestrates the two fetches, renders the reordered list with positional rank numbers, and falls back to today's exact behavior if the tiebreaker data doesn't arrive.

**Design doc:** `docs/superpowers/specs/2026-08-12-standings-tiebreakers-design.md`

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vite, MLB Stats API

## Global Constraints

- No new dependencies, no backend/server changes (`/standings` and `/schedule` are already allowlisted in `server/src/core.ts` for any query string), no LaunchDarkly flag.
- `src/utils/tiebreakers.ts` stays **pure** — no `fetch`, no React, no module-level state. There is no test runner in this repo, so the correctness of this file rests on being small and readable.
- Any failure in the tiebreaker path degrades to the current behavior: API order, no markers, no footnote. It must never blank the table or surface an error banner.
- `src/components/Standings.tsx` is **not** modified. The NL East table keeps the API's ordering (see Non-Goals in the design doc).
- Tailwind utility classes only; keep the existing `bg-red-50` / `phillies-red` Phillies-row treatment untouched.
- Do not regress the team labels: the table currently shows short names ("Phillies", "D-backs"), and `hydrate=team(division)` changes `team.name` to the full name. Read `team.teamName ?? team.name`.

---

### Task 1: Extend types in `src/types/mlb.ts`

**Files:**
- Modify: `src/types/mlb.ts`

**Interfaces:**
- Produces: `SeasonGameResult`; extended `WildCardRecord`

- [ ] **Step 1: Extend `WildCardRecord`**

The existing interface (around line 68) gains the hydrated team fields and the split records. Everything added is optional so a response without hydration still type-checks:

```ts
export interface WildCardRecord {
  team: {
    id: number
    name: string
    /** Short club name ("Phillies"); present only with hydrate=team(division). */
    teamName?: string
    /** Present only with hydrate=team(division). Needed for the intradivision tiebreaker. */
    division?: { id: number; name: string }
  }
  wins: number
  losses: number
  wildCardRank: string
  wildCardGamesBack: string
  clinchIndicator?: string
  records?: {
    divisionRecords?: { division: { id: number }; wins: number; losses: number }[]
    leagueRecords?: { league: { id: number }; wins: number; losses: number }[]
  }
}
```

- [ ] **Step 2: Add `SeasonGameResult`**

Directly below `WildCardRecord`:

```ts
/** One completed regular-season game, reduced to what a head-to-head tally needs. */
export interface SeasonGameResult {
  opponentId: number
  won: boolean
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/mlb.ts
git commit -m "feat: extend WildCardRecord for tiebreaker inputs"
```

---

### Task 2: Add the pure tiebreaker utility

**Files:**
- Create: `src/utils/tiebreakers.ts`

**Interfaces:**
- Consumes: `SeasonGameResult` from `../types/mlb`
- Produces: `TiebreakerRecord`, `TiebreakerNote`, `teamsNeedingTiebreak()`, `applyTiebreakers()`

- [ ] **Step 1: Write the utility**

Create `src/utils/tiebreakers.ts`. The input type is structural so `WildCardRecord` satisfies it without an import cycle, and so the NL East table could adopt this later:

```ts
import type { SeasonGameResult } from '../types/mlb'

/**
 * MLB's Stats API does NOT apply tiebreakers: `wildCardRank`/`leagueRank`/
 * `sportRank` order tied clubs by ascending team ID. Since 2022 every tie for
 * postseason position is decided mathematically, in this order:
 *   1. head-to-head record among the tied clubs
 *   2. higher winning pct in intradivision games
 *   3. higher winning pct in intraleague games
 *   4. higher winning pct over the last half of intraleague games
 * Criterion 4 needs each club's intraleague game sequence and is not implemented;
 * a group still tied after criterion 3 keeps the API's order.
 */

/** Structural shape shared by WildCardRecord (and, later, StandingsRecord). */
export interface TiebreakerRecord {
  team: { id: number; division?: { id: number } }
  wins: number
  losses: number
  records?: {
    divisionRecords?: { division: { id: number }; wins: number; losses: number }[]
    leagueRecords?: { league: { id: number }; wins: number; losses: number }[]
  }
}

export interface TiebreakerNote {
  /** Hover text naming the criterion and its numbers, e.g. "Head-to-head vs tied clubs: 7-2". */
  detail: string
}

type Pct = { wins: number; losses: number } | null

const pctOf = (r: Pct) => (r && r.wins + r.losses > 0 ? r.wins / (r.wins + r.losses) : null)

/**
 * Equal winning percentage, compared by cross-multiplication. Two clubs with
 * different games played can share a pct, and float equality on w/(w+l) is not
 * reliable — so never compare the divisions directly.
 */
function sameWinPct(a: TiebreakerRecord, b: TiebreakerRecord) {
  return a.wins * (b.wins + b.losses) === b.wins * (a.wins + a.losses)
}

/** Consecutive runs of equal-pct clubs. Runs of one are included; callers filter. */
function tiedGroups<T extends TiebreakerRecord>(records: T[]): T[][] {
  const groups: T[][] = []
  for (const r of records) {
    const last = groups[groups.length - 1]
    if (last && sameWinPct(last[0], r)) last.push(r)
    else groups.push([r])
  }
  return groups
}

/**
 * Team IDs whose head-to-head records are worth fetching: members of a multi-club
 * tie with at least one club inside the rendered window. A group straddling the
 * window boundary qualifies (one member is inside it), which is what keeps the
 * playoff-cutoff row honest.
 */
export function teamsNeedingTiebreak(records: TiebreakerRecord[], windowSize: number): number[] {
  return tiedGroups(records)
    .filter(g => g.length > 1 && records.indexOf(g[0]) < windowSize)
    .flatMap(g => g.map(r => r.team.id))
}

/** Combined record vs the other clubs in `group`, from this club's own schedule. */
function headToHead(record: TiebreakerRecord, group: TiebreakerRecord[], results: Map<number, SeasonGameResult[]>): Pct {
  const games = results.get(record.team.id)
  if (!games) return null
  const rivals = new Set(group.map(r => r.team.id).filter(id => id !== record.team.id))
  let wins = 0
  let losses = 0
  for (const g of games) {
    if (!rivals.has(g.opponentId)) continue
    if (g.won) wins++
    else losses++
  }
  return wins + losses > 0 ? { wins, losses } : null
}

function intradivision(record: TiebreakerRecord): Pct {
  const own = record.team.division?.id
  if (own == null) return null
  return record.records?.divisionRecords?.find(d => d.division.id === own) ?? null
}

function intraleague(record: TiebreakerRecord, leagueId: number): Pct {
  return record.records?.leagueRecords?.find(l => l.league.id === leagueId) ?? null
}

function describe(criterion: string, r: Pct) {
  return r ? `${criterion}: ${r.wins}-${r.losses}` : criterion
}

/**
 * The single best club in `group`, per the criteria chain.
 *
 * When a criterion narrows the group to a smaller subset that is still tied, the
 * chain RESTARTS at criterion 1 for that subset — head-to-head within a subset can
 * separate clubs that combined head-to-head over the wider group could not. This
 * terminates because the recursive call always receives a strictly smaller group.
 *
 * A criterion that returns null for any member (no games played against the rest of
 * the group, or a missing split record) is skipped as inconclusive rather than
 * scored as .000.
 */
function selectBest<T extends TiebreakerRecord>(
  group: T[],
  results: Map<number, SeasonGameResult[]>,
  leagueId: number,
  notes: Map<number, TiebreakerNote>
): T {
  if (group.length === 1) return group[0]

  const criteria: [string, (r: T) => Pct][] = [
    ['Head-to-head vs tied clubs', r => headToHead(r, group, results)],
    ['Intradivision', r => intradivision(r)],
    ['Intraleague', r => intraleague(r, leagueId)],
  ]

  for (const [label, measure] of criteria) {
    const scored = group.map(r => ({ r, raw: measure(r), pct: pctOf(measure(r)) }))
    if (scored.some(s => s.pct === null)) continue
    const max = Math.max(...scored.map(s => s.pct as number))
    const leaders = scored.filter(s => s.pct === max)
    if (leaders.length === 1) {
      const winner = leaders[0]
      notes.set(winner.r.team.id, { detail: describe(label, winner.raw) })
      return winner.r
    }
    if (leaders.length < group.length) {
      return selectBest(leaders.map(s => s.r), results, leagueId, notes)
    }
    // Every member tied on this criterion — fall through to the next.
  }

  return group[0] // still tied after criterion 3: keep the API's order
}

/**
 * Reorder `records` so tied clubs sit in true MLB tiebreaker order, and return a
 * note per club that was part of a multi-club tie (for the row's hover text).
 * Clubs not tied with anyone are untouched and get no note.
 */
export function applyTiebreakers<T extends TiebreakerRecord>(
  records: T[],
  results: Map<number, SeasonGameResult[]>,
  leagueId: number
): { ordered: T[]; notes: Map<number, TiebreakerNote> } {
  const notes = new Map<number, TiebreakerNote>()
  const ordered: T[] = []

  for (const group of tiedGroups(records)) {
    if (group.length === 1) {
      ordered.push(group[0])
      continue
    }
    let remaining = group
    while (remaining.length > 0) {
      const best = selectBest(remaining, results, leagueId, notes)
      if (!notes.has(best.team.id)) {
        notes.set(best.team.id, { detail: describe('Head-to-head vs tied clubs', headToHead(best, group, results)) })
      }
      ordered.push(best)
      remaining = remaining.filter(r => r !== best)
    }
  }

  return { ordered, notes }
}
```

- [ ] **Step 2: Sanity-check the algorithm against the live tie by hand**

No test runner exists, so verify by reasoning against the numbers in the design doc: for the three clubs tied at 64-57, combined head-to-head is Phillies 7-2 (.778), D-backs 7-6 (.538), Padres 5-11 (.313), so `applyTiebreakers` must emit **Phillies, D-backs, Padres**. Confirm the code produces that: criterion 1 has a unique max on the first pass, so `selectBest` returns the Phillies and never reaches intradivision (where the D-backs lead at .634 — if your reasoning lands on the D-backs first, the criteria are in the wrong order).

- [ ] **Step 3: Verify TypeScript compiles and lints**

```bash
npx tsc --noEmit
npm run lint
```
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/utils/tiebreakers.ts
git commit -m "feat: add MLB tiebreaker ordering utility"
```

---

### Task 3: Wire up the API calls

**Files:**
- Modify: `src/api/mlb.ts`

**Interfaces:**
- Consumes: `SeasonGameResult`, `WildCardRecord` from `../types/mlb`
- Produces: `fetchSeasonResults(teamId): Promise<SeasonGameResult[]>`; hydrated `fetchWildCardStandings()`

- [ ] **Step 1: Hydrate the wild card standings call**

Replace the existing `fetchWildCardStandings` body's URL. Keep the existing comment block above it and append the new note:

```ts
// hydrate=team(division) is required for the intradivision tiebreaker (the team
// object is otherwise just {id,name,link}). It also swaps team.name from the short
// club name to the full one, which is why callers display team.teamName ?? team.name.
export async function fetchWildCardStandings() {
  const data = await get<{ records: { teamRecords: import('../types/mlb').WildCardRecord[] }[] }>(
    `/standings?leagueId=104&season=${SEASON}&standingsTypes=wildCard&hydrate=team(division)`
  )
  return data.records[0]?.teamRecords ?? []
}
```

- [ ] **Step 2: Add `fetchSeasonResults`**

Add directly below `fetchWildCardStandings`:

```ts
// One club's completed regular-season games, reduced to opponent + win/loss. Used
// only to compute head-to-head records for standings tiebreakers, which the
// /standings response does not carry at any hydration level. The fields= list keeps
// this to ~25KB for a full season; isWinner means no score comparison is needed.
export async function fetchSeasonResults(teamId: number) {
  const data = await get<{
    dates: {
      games: {
        status: { abstractGameState: string }
        teams: {
          home: { team: { id: number }; isWinner?: boolean }
          away: { team: { id: number }; isWinner?: boolean }
        }
      }[]
    }[]
  }>(
    `/schedule?sportId=1&season=${SEASON}&teamId=${teamId}&gameType=R` +
      `&fields=dates,games,gameType,status,abstractGameState,teams,home,away,team,id,isWinner`
  )

  const results: import('../types/mlb').SeasonGameResult[] = []
  for (const date of data.dates ?? []) {
    for (const game of date.games ?? []) {
      if (game.status.abstractGameState !== 'Final') continue
      const { home, away } = game.teams
      // A tie/suspended game has no isWinner on either side — count it for neither.
      if (home.isWinner === away.isWinner) continue
      const self = home.team.id === teamId ? home : away
      const other = home.team.id === teamId ? away : home
      results.push({ opponentId: other.team.id, won: self.isWinner === true })
    }
  }
  return results
}
```

- [ ] **Step 3: Verify against the live API before moving on**

```bash
curl -s "https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=2026&teamId=143&gameType=R&fields=dates,games,gameType,status,abstractGameState,teams,home,away,team,id,isWinner" \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
g=[x for dt in d['dates'] for x in dt['games'] if x['status']['abstractGameState']=='Final']
sd=[x for x in g if any(x['teams'][s]['team']['id']==135 for s in ('home','away'))]
w=sum(1 for x in sd if next(x['teams'][s] for s in ('home','away') if x['teams'][s]['team']['id']==143)['isWinner'])
print(f'PHI vs SD: {w}-{len(sd)-w}')"
```
Expected as of 2026-08-12: `PHI vs SD: 6-0`. If the shape has drifted (field renamed, `isWinner` absent), fix the parser against reality rather than against this plan.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
npm run lint
```
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/mlb.ts
git commit -m "feat: fetch head-to-head results and hydrate wild card divisions"
```

---

### Task 4: Apply tiebreakers in `WildCardStandings`

**Files:**
- Modify: `src/components/WildCardStandings.tsx`

**Interfaces:**
- Consumes: `fetchWildCardStandings`, `fetchSeasonResults` from `../api/mlb`; `teamsNeedingTiebreak`, `applyTiebreakers`, `TiebreakerNote` from `../utils/tiebreakers`

- [ ] **Step 1: Replace the fetch effect**

The component currently does one fetch and stores the result. It now resolves ties before first paint. Add a `notes` state alongside `records`, and a small helper for the window size (the existing `philliesIndex`/`rowCount` math, lifted so it can run both before and after reordering):

```tsx
const NL_LEAGUE_ID = 104

function windowSize(records: WildCardRecord[]) {
  const philliesIndex = records.findIndex(r => r.team.id === PHILLIES_ID)
  return philliesIndex >= 0 ? Math.max(MIN_ROWS_SHOWN, philliesIndex + 1) : MIN_ROWS_SHOWN
}
```

```tsx
  const [records, setRecords] = useState<WildCardRecord[]>([])
  const [notes, setNotes] = useState<Map<number, TiebreakerNote>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Ties are resolved BEFORE first paint. The table already renders null while
    // loading, so the extra round trip costs a slightly later paint but avoids
    // visibly rearranging the playoff cutoff in front of the user.
    async function load() {
      const wildCard = await fetchWildCardStandings()
      const ids = teamsNeedingTiebreak(wildCard, windowSize(wildCard))
      if (!ids.length) return { ordered: wildCard, notes: new Map<number, TiebreakerNote>() }

      const settled = await Promise.allSettled(ids.map(fetchSeasonResults))
      const results = new Map<number, import('../types/mlb').SeasonGameResult[]>()
      settled.forEach((s, i) => {
        if (s.status === 'fulfilled') results.set(ids[i], s.value)
      })
      // Partial data would order a tie against an incomplete head-to-head picture,
      // which is worse than not reordering at all.
      if (results.size < ids.length) return { ordered: wildCard, notes: new Map<number, TiebreakerNote>() }

      return applyTiebreakers(wildCard, results, NL_LEAGUE_ID)
    }

    load()
      .then(({ ordered, notes }) => {
        setRecords(ordered)
        setNotes(notes)
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [])
```

- [ ] **Step 2: Recompute the visible window from the reordered list**

Replace the existing `philliesIndex`/`rowCount`/`visible` block with a call to the helper. The existing comment about `philliesIndex === -1` stays — it is still true and still load-bearing:

```tsx
  // The Phillies are absent from this response entirely whenever they lead the
  // NL East (the endpoint excludes division leaders), so philliesIndex may be -1.
  const visible = records.slice(0, windowSize(records))
```

- [ ] **Step 3: Render positional rank, the tie marker, and the footnote**

Three changes inside the table:

1. The `#` cell renders `{i + 1}`, **not** `{r.wildCardRank}`. Add a comment saying why, since the swap looks gratuitous otherwise:

```tsx
  {/* Positional, not r.wildCardRank — the API's rank ignores tiebreakers, so
      after reordering its numbers would print out of sequence (2, 4, 3). */}
  <td className="px-4 py-3 text-gray-500 tabular-nums">{i + 1}</td>
```

2. In the team cell, after the existing `clinchIndicator` block, add the tie marker:

```tsx
  {notes.has(r.team.id) && (
    <span className="text-xs font-normal text-gray-400" title={notes.get(r.team.id)!.detail}>
      †
    </span>
  )}
```

3. Below the `</table>`, inside the wrapping `<div>`, render the footnote only when a tie was actually resolved:

```tsx
  {notes.size > 0 && (
    <p className="mt-2 text-xs text-gray-500">
      † Tied on record. Order set by MLB tiebreakers: head-to-head, then
      intradivision, then intraleague record.
    </p>
  )}
```

- [ ] **Step 4: Preserve the short team names**

`hydrate=team(division)` changed `team.name` from `"Phillies"` to `"Philadelphia Phillies"`. In the team cell, render:

```tsx
  {r.team.teamName ?? r.team.name}
```

Do not skip this — without it every row in the table silently gets a longer label and the column wraps on mobile.

- [ ] **Step 5: Verify TypeScript compiles, lints and builds**

```bash
npx tsc --noEmit
npm run lint
npm run build
```
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/WildCardStandings.tsx
git commit -m "fix: order wild card standings by MLB tiebreakers"
```

---

### Task 5: Verify in the running app

**Files:** none (verification only)

- [ ] **Step 1: Drive the app with `webapp-testing`**

Per the project's testing convention, this is what makes the feature "done" — lint and typecheck are not sufficient. Both servers must be running:

```bash
npm run dev:server   # terminal 1
npm run dev          # terminal 2
```

Write a small Playwright script that opens the app, clicks through to the **Standings** tab, waits for the `NL Wild Card Race` heading, and screenshots the table.

Note this app polls (`LiveGameStrip`), so **`wait_for_load_state('networkidle')` never settles** — use `wait_until='domcontentloaded'` plus explicit `page.wait_for_selector(...)`. This feature makes no chat-widget calls, so there are no cost concerns.

- [ ] **Step 2: Confirm the corrected order on screen**

Against live 2026-08-12 data the wild card table must read:

```
1  Cubs      70  50  +6.5
2  Phillies† 64  57   -
3  D-backs†  64  57   -
── Playoff cutoff ──
4  Padres†   64  57   -
5  Marlins   61  59   2.5
...
```

Specifically check:
- The Phillies row is **above** the cutoff divider and the Padres row **below** it.
- The `#` column reads `1, 2, 3, 4, 5…` in sequence (no repeated or skipped numbers).
- The three tied rows carry `†`; hovering the Phillies' marker shows `Head-to-head vs tied clubs: 7-2`.
- The footnote renders once, below the table.
- Team labels are still short (`Phillies`, `D-backs`, `Padres`) — not `Philadelphia Phillies`.
- The Phillies row keeps its red tint and red dot.
- No console errors.

If the live standings have moved on and the tie no longer exists, the table should render with **no** `†` markers and no footnote, and the browser Network tab should show **no** `/api/mlb/schedule` requests from this component — that is the "no ties, no second round trip" path, and it is worth confirming explicitly either way.

- [ ] **Step 3: Confirm the failure path degrades quietly**

In devtools, block `/api/mlb/schedule` (or temporarily make `fetchSeasonResults` throw) and reload the Standings tab. Expected: the table still renders, in the API's order, with no `†` and no footnote — no blank space, no error banner.

---

### Task 6: Document the divergence in `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the `WildCardStandings` entry**

In the `src/components/` bullet, extend the existing `WildCardStandings` description with the tiebreaker behavior. The essential facts to record, because all three will otherwise be re-derived by the next person who touches this:

- MLB's Stats API **does not apply tiebreakers** — `wildCardRank`, `leagueRank` and `sportRank` order tied clubs by ascending team ID. This is why the table's `#` column is positional rather than `r.wildCardRank`, and why our order intentionally differs from MLB.com's own standings page.
- Head-to-head is not in the standings response at any hydration level; it costs one trimmed `/schedule` call per tied club, fetched only for ties inside the rendered window, and only before first paint (never as a re-sort of an already-painted table).
- `hydrate=team(division)` is required for the intradivision criterion and has the side effect of swapping `team.name` to the full club name — hence `team.teamName ?? team.name` in the component.
- Criterion 4 (last half of intraleague games) is not implemented; a group still tied after intraleague keeps the API's order.

- [ ] **Step 2: Add `src/utils/tiebreakers.ts` where utils are described**

Mention it alongside the other `src/utils/` files (`odds.ts`, `date.ts`, `trends.ts`) as the pure implementation of the MLB tiebreaker chain, reusable by `Standings.tsx` if the division table ever needs it.

- [ ] **Step 3: Commit and push**

```bash
git add CLAUDE.md
git commit -m "docs: document MLB tiebreaker ordering in wild card standings"
git push -u origin claude/mlb-standings-tiebreaker-xuhbef
```

---

## Notes for the implementer

- **Verify the live tie still exists before you start.** The whole visible payoff of this change depends on three NL clubs being tied at 64-57 on 2026-08-12. Run the standings curl in the design doc first; if the tie has broken, the code is still correct but Task 5's expected screenshot will not match — verify the "no ties" path instead and say so in the progress ledger.
- `wildCardGamesBack` stays a display-ready string (`"+6.5"`, `"-"`, `"2.5"`) — do not parse it, and do not try to recompute it after reordering. All clubs in a tie share the same GB value, so reordering never makes it inconsistent.
- The playoff-cutoff divider logic needs **no change**. It is drawn after `PLAYOFF_SPOTS` rows; correcting the order is what moves the Padres below it.
- Don't be tempted to sort `records` in place — `applyTiebreakers` returns a new array precisely so a partial-failure path can hand back the original untouched.
- `Promise.allSettled` (not `Promise.all`) is deliberate: one club's schedule failing should leave the table rendering in API order, not reject the whole load and blank it.
- If you find yourself wanting criterion 4, note that `fetchSeasonResults` would need the game date and opponent league added to its `fields=` list. It is out of scope here; leave the util's comment about it in place rather than half-implementing it.
