# NL Wild Card Standings on Standings Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact NL Wild Card standings table to the Standings tab, below the NL East division table, so the division race and the postseason race read together in one place.

> **Amended 2026-08-04:** originally targeted the Schedule tab; moved to the Standings tab after the user went looking for it there. Task 4 below is the corrected version. `Schedule.tsx` is not touched by this plan at all.

**Architecture:** Add a `fetchWildCardStandings()` API call (new `standingsTypes=wildCard` query against the already-allowlisted `/standings` proxy route — no backend change), a `WildCardRecord` type, and a new self-contained `WildCardStandings` component that owns its own fetch/loading/error state (same pattern as `HeroStrip`) and renders below the NL East table in `Standings.tsx`.

**Design doc:** `docs/superpowers/specs/2026-08-04-standings-wildcard-design.md`

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vite, MLB Stats API

## Global Constraints

- No new dependencies
- No backend/server changes — `/standings` is already allowlisted for any query string
- Component fails silently (renders `null`) on fetch error or empty data — matches `HeroStrip`/`DailyBriefing` convention, no error banner on a secondary widget
- The wild card table must render independently of the NL East fetch: a division-standings error must not take the wild card table down with it
- The Phillies' row must always be visible in the rendered list, even if that means showing more rows than the default cutoff
- Tailwind utility classes only, reuse the `phillies-red` / `bg-red-50` treatment already used in `Standings.tsx` for the Phillies row
- Spacing between the two tables lives on the parent (`space-y-8`), not as a margin inside `WildCardStandings`, so it collapses when the widget renders `null`

---

### Task 1: Add `WildCardRecord` type

**Files:**
- Modify: `src/types/mlb.ts`

**Interfaces:**
- Produces: `export interface WildCardRecord`

- [ ] **Step 1: Add the type**

Append to `src/types/mlb.ts`, near the existing `StandingsRecord` interface:

```ts
export interface WildCardRecord {
  team: { id: number; name: string }
  wins: number
  losses: number
  wildCardRank: string
  wildCardGamesBack: string
  clinchIndicator?: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/types/mlb.ts
git commit -m "feat: add WildCardRecord type for NL wild card standings"
```

---

### Task 2: Add `fetchWildCardStandings` to `src/api/mlb.ts`

**Files:**
- Modify: `src/api/mlb.ts`

**Interfaces:**
- Consumes: `WildCardRecord` from `../types/mlb`
- Produces: `export async function fetchWildCardStandings(): Promise<WildCardRecord[]>`

- [ ] **Step 1: Add the function**

Add directly after the existing `fetchStandings` function in `src/api/mlb.ts`:

```ts
export async function fetchWildCardStandings() {
  // leagueId=104 (NL) + standingsTypes=wildCard returns a single record
  // group (not split by division) containing every non-division-leader
  // team in the league, pre-sorted by wildCardRank.
  const data = await get<{ records: { teamRecords: import('../types/mlb').WildCardRecord[] }[] }>(
    `/standings?leagueId=104&season=${SEASON}&standingsTypes=wildCard`
  )
  return data.records[0]?.teamRecords ?? []
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/api/mlb.ts
git commit -m "feat: add fetchWildCardStandings api call"
```

---

### Task 3: Create `WildCardStandings` component

**Files:**
- Create: `src/components/WildCardStandings.tsx`

**Interfaces:**
- Consumes: `fetchWildCardStandings()` from `../api/mlb`, `WildCardRecord` from `../types/mlb`

- [ ] **Step 1: Write the component**

Create `src/components/WildCardStandings.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { fetchWildCardStandings } from '../api/mlb'
import type { WildCardRecord } from '../types/mlb'

const PHILLIES_ID = 143
const PLAYOFF_SPOTS = 3
const MIN_ROWS_SHOWN = 7

export default function WildCardStandings() {
  const [records, setRecords] = useState<WildCardRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchWildCardStandings()
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null
  if (!records.length) return null

  const philliesIndex = records.findIndex(r => r.team.id === PHILLIES_ID)
  const rowsToShow = philliesIndex >= 0 ? Math.max(MIN_ROWS_SHOWN, philliesIndex + 1) : MIN_ROWS_SHOWN
  const visible = records.slice(0, Math.min(rowsToShow, records.length))

  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">NL Wild Card Race</h2>
      <table className="w-full text-sm bg-white rounded-lg border border-gray-100 overflow-hidden">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
            <th className="px-4 py-3 text-left font-medium">#</th>
            <th className="px-4 py-3 text-left font-medium">Team</th>
            <th className="px-4 py-3 text-center font-medium">W</th>
            <th className="px-4 py-3 text-center font-medium">L</th>
            <th className="px-4 py-3 text-center font-medium">GB</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visible.map((r, i) => {
            const isPhillies = r.team.id === PHILLIES_ID
            const rows = [
              <tr
                key={r.team.id}
                className={isPhillies ? 'bg-red-50 font-semibold' : 'hover:bg-gray-50'}
              >
                <td className="px-4 py-3 text-gray-500 tabular-nums">{r.wildCardRank}</td>
                <td className="px-4 py-3 text-gray-900 flex items-center gap-2">
                  {isPhillies && <span className="w-1.5 h-1.5 rounded-full bg-phillies-red inline-block" />}
                  {r.team.name}
                  {r.clinchIndicator && (
                    <span
                      className="text-xs text-green-600 font-normal"
                      title="Clinched"
                    >
                      ({r.clinchIndicator})
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center tabular-nums">{r.wins}</td>
                <td className="px-4 py-3 text-center tabular-nums">{r.losses}</td>
                <td className="px-4 py-3 text-center tabular-nums">{r.wildCardGamesBack}</td>
              </tr>,
            ]
            if (i === PLAYOFF_SPOTS - 1 && i < visible.length - 1) {
              rows.push(
                <tr key="cutoff" aria-hidden="true">
                  <td colSpan={5} className="border-t-2 border-dashed border-gray-300 p-0" />
                </tr>
              )
            }
            return rows
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/WildCardStandings.tsx
git commit -m "feat: add WildCardStandings component"
```

---

### Task 4: Render `WildCardStandings` on the Standings tab

**Files:**
- Modify: `src/components/Standings.tsx`

**Interfaces:**
- Consumes: `WildCardStandings` default export from `./WildCardStandings`

- [ ] **Step 1: Import the component**

At the top of `src/components/Standings.tsx`, add:

```ts
import WildCardStandings from './WildCardStandings'
```

- [ ] **Step 2: Restructure the early returns and render below the NL East table**

`Standings.tsx` currently bails out before its `return` on loading/error:

```tsx
if (loading) return <div className="p-8 text-center text-gray-500">Loading standings…</div>
if (error) return <div className="p-8 text-center text-red-600">{error}</div>
```

Those returns would also hide the wild card table, which has nothing to do with the
division fetch. Replace them with a single conditional body so the wild card table
always renders. Wrap the existing NL East `<h2>` + `<table>` in a plain `<div>` as
the final branch, add `space-y-8` to the outer wrapper, and put
`<WildCardStandings />` after the conditional:

```tsx
  // The wild card table owns its own fetch and fails silently, so it renders
  // alongside the division table rather than inside its loading/error states.
  return (
    <div className="max-w-2xl space-y-8">
      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading standings…</div>
      ) : error ? (
        <div className="p-8 text-center text-red-600">{error}</div>
      ) : (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">NL East Standings</h2>
          <table className="w-full text-sm">
            {/* ...existing thead/tbody unchanged, just re-indented... */}
          </table>
        </div>
      )}
      <WildCardStandings />
    </div>
  )
```

Order matters: division table first, wild card second. The rest of the NL East
table body is unchanged apart from indentation.

- [ ] **Step 3: Drop the component's own bottom margin**

Since spacing now comes from the parent's `space-y-8`, change the root element of
`src/components/WildCardStandings.tsx` from `<div className="mb-4">` to `<div>`.
(If you built Task 3 fresh after this amendment, it should already be `<div>`.)

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
npm run lint
npm run build
```
Expected: all clean

- [ ] **Step 5: Visually verify with the dev server**

Requires both servers running:
```bash
npm run dev:server   # terminal 1
npm run dev          # terminal 2
```

Open the app, go to the **Standings** tab. Confirm:
- "NL East Standings" table renders first, "NL Wild Card Race" below it with clear separation
- Phillies row highlighted (red tint + red dot) in **both** tables
- A "Playoff cutoff" divider row appears after the 3rd-ranked wild card team
- The **Schedule** tab has no wild card table (this feature does not appear there)
- No console errors

Per the project's testing convention, use the `webapp-testing` skill (Playwright)
to drive this — it can screenshot the result and check console errors automatically.
Note that this app polls (`LiveGameStrip`), so **`wait_for_load_state('networkidle')`
never settles** — use `wait_until='domcontentloaded'` plus explicit
`page.wait_for_selector(...)` calls instead, or the script will time out at 30s.
This feature makes no chat-widget calls, so there are no cost concerns.

- [ ] **Step 6: Commit**

```bash
git add src/components/Standings.tsx src/components/WildCardStandings.tsx
git commit -m "feat: show NL wild card standings on standings tab"
```

---

### Task 5: Update `CLAUDE.md` component inventory

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add `WildCardStandings` to the component list**

In the `src/components/` bullet in `CLAUDE.md`, add `WildCardStandings` (NL wild card race table shown below the NL East table on the Standings tab, self-contained fetch, fails silently) alongside the other one-off components (`HeroStrip`, `LiveGameStrip`, `DailyBriefing`, etc.) so the file stays an accurate map of the codebase.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document WildCardStandings component"
```

---

## Notes for the implementer

- `wildCardGamesBack` is already a display-ready string from the API (e.g. `"+9.0"`, `"-"`, `"2.0"`) — do not attempt to parse it as a number, same convention as `gamesBack` in `Standings.tsx`.
- The wild card endpoint returns teams **already sorted** by `wildCardRank` — no client-side sorting needed.
- Double check current-season behavior early in the season: if very few games have been played, `wildCardGamesBack` values and `clinchIndicator` will look different (mostly absent) than the mid/late-season example in the design doc — that's expected, not a bug.
- `standingsTypes=wildCard` **excludes division leaders**, so the Phillies vanish from this table entirely if they take over the NL East. `philliesIndex === -1` must not crash or blank the table — it falls back to the plain 7-row cutoff. This path is unexercised while they trail in the division.
- If, during implementation, the live API shape has drifted from what's documented in the design doc (field renamed/removed), re-verify with a live `curl` against `https://statsapi.mlb.com/api/v1/standings?leagueId=104&season=2026&standingsTypes=wildCard` before writing code against stale assumptions.
