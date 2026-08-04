# NL Wild Card Standings on Schedule Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact NL Wild Card standings table to the Schedule tab, above the game list, so users can see the Phillies' postseason position without leaving the tab.

**Architecture:** Add a `fetchWildCardStandings()` API call (new `standingsTypes=wildCard` query against the already-allowlisted `/standings` proxy route — no backend change), a `WildCardRecord` type, and a new self-contained `WildCardStandings` component that owns its own fetch/loading/error state (same pattern as `HeroStrip`) and renders above the game list in `Schedule.tsx`.

**Design doc:** `docs/superpowers/specs/2026-08-04-schedule-wildcard-standings-design.md`

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vite, MLB Stats API

## Global Constraints

- No new dependencies
- No backend/server changes — `/standings` is already allowlisted for any query string
- Component fails silently (renders `null`) on fetch error or empty data — matches `HeroStrip`/`DailyBriefing` convention, no error banner on a secondary widget
- The Phillies' row must always be visible in the rendered list, even if that means showing more rows than the default cutoff
- Tailwind utility classes only, reuse the `phillies-red` / `bg-red-50` treatment already used in `Standings.tsx` for the Phillies row

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

### Task 4: Render `WildCardStandings` on the Schedule tab

**Files:**
- Modify: `src/components/Schedule.tsx`

**Interfaces:**
- Consumes: `WildCardStandings` default export from `./WildCardStandings`

- [ ] **Step 1: Import the component**

At the top of `src/components/Schedule.tsx`, add:

```ts
import WildCardStandings from './WildCardStandings'
```

- [ ] **Step 2: Render it above the game list**

Inside the returned JSX, immediately after the opening `<div className="max-w-2xl space-y-2">`, add the component before `{dates.map(...)}`:

```tsx
return (
  <div className="max-w-2xl space-y-2">
    <WildCardStandings />
    {dates.map(({ date, games }) =>
      ...
```

Note: `WildCardStandings` manages its own loading/error/empty state independently of the Schedule's `loading`/`error`/`!dates.length` early returns above it — it must still render even if, e.g., the schedule fetch is mid-flight. Since it's a sibling component, confirm it is NOT placed inside any of the early-return branches (`if (loading) return ...`, `if (error) return ...`, `if (!dates.length) return ...`) — those all still apply only to the game list.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Visually verify with the dev server**

Requires both servers running:
```bash
npm run dev:server   # terminal 1
npm run dev          # terminal 2
```

Open the app, go to the Schedule tab. Confirm:
- "NL Wild Card Race" table renders above the game list
- Phillies row is visible and highlighted (red tint + red dot), regardless of their current rank
- A dashed divider line appears after the 3rd-ranked team
- Any `clinchIndicator` badges render sensibly (may be absent depending on time of season)
- No console errors

Per the project's testing convention, prefer using the `webapp-testing` skill (Playwright) to drive this instead of manual clicking, since it can screenshot the result and check for console errors automatically. This feature makes no chat-widget calls, so no cost concerns — verify freely.

- [ ] **Step 5: Commit**

```bash
git add src/components/Schedule.tsx
git commit -m "feat: show NL wild card standings on schedule tab"
```

---

### Task 5: Update `CLAUDE.md` component inventory

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add `WildCardStandings` to the component list**

In the `src/components/` bullet in `CLAUDE.md`, add `WildCardStandings` (NL wild card race table shown above the game list on the Schedule tab, self-contained fetch, fails silently) alongside the other one-off components (`HeroStrip`, `LiveGameStrip`, `DailyBriefing`, etc.) so the file stays an accurate map of the codebase.

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
- If, during implementation, the live API shape has drifted from what's documented in the design doc (field renamed/removed), re-verify with a live `curl` against `https://statsapi.mlb.com/api/v1/standings?leagueId=104&season=2026&standingsTypes=wildCard` before writing code against stale assumptions.
