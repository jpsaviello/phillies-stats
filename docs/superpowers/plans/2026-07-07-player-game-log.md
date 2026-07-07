# Player Game Log Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a player row in BattingTable or PitchingTable opens a modal showing that player's last 10 games with per-game stats.

**Architecture:** A new `fetchGameLog(personId, group)` in `src/api/mlb.ts` calls the MLB Stats API's `gameLog` stats group and returns the 10 most recent games. A single shared `GameLogModal` component fetches on mount (on-demand, not prefetched) and renders batting or pitching columns depending on a `group` prop. `BattingTable` and `PitchingTable` each track a `selectedPlayer` state set by a row click, and conditionally render the modal.

**Tech Stack:** React 19, TypeScript, Vite, MLB Stats API -- no test runner configured, verify manually via dev server.

## Global Constraints

- No test runner is configured -- verification is done by running the app and inspecting the UI
- Show the 10 most recent games only (API returns full season in reverse-chronological order; slice client-side)
- Fetch on demand when the modal opens, not prefetched for the whole roster
- One shared `GameLogModal` component used by both tables, driven by a `group: 'hitting' | 'pitching'` prop
- Modal closes on backdrop click, X button, or Escape key
- Loading/error states reuse the app's existing text patterns (gray "Loading…", red error text)
- Tailwind v4 (CSS-first, no `tailwind.config.js`)

---

### Task 1: Add game log types and fetchGameLog to the data layer

**Files:**
- Modify: `src/types/mlb.ts`
- Modify: `src/api/mlb.ts`

**Interfaces:**
- Produces:
  - `export interface GameLogSplit` -- one game's date, opponent, home/away flag, and stat line
  - `export interface BattingGameStat`
  - `export interface PitchingGameStat`
  - `export async function fetchGameLog(personId: number, group: 'hitting' | 'pitching'): Promise<GameLogSplit[]>` -- last 10 games, most recent first

- [ ] **Step 1: Add game log types to src/types/mlb.ts**

Add to the end of `src/types/mlb.ts`:

```ts
export interface GameLogOpponent {
  team: { id: number; name: string }
}

export interface BattingGameStat {
  atBats: number
  runs: number
  hits: number
  homeRuns: number
  rbi: number
  baseOnBalls: number
  strikeOuts: number
}

export interface PitchingGameStat {
  inningsPitched: string
  hits: number
  runs: number
  earnedRuns: number
  baseOnBalls: number
  strikeOuts: number
}

export interface GameLogSplit {
  date: string
  opponent: GameLogOpponent
  isHome: boolean
  stat: BattingGameStat | PitchingGameStat
}
```

- [ ] **Step 2: Add fetchGameLog to src/api/mlb.ts**

Add the import at the top of `src/api/mlb.ts` (merge into the existing type import if one exists, otherwise add a new line after the existing imports):

```ts
import type { GameLogSplit } from '../types/mlb'
```

Add this function after `fetchSchedule`:

```ts
export async function fetchGameLog(personId: number, group: 'hitting' | 'pitching') {
  const data = await get<{ stats: { splits: GameLogSplit[] }[] }>(
    `/people/${personId}/stats?stats=gameLog&group=${group}&season=${SEASON}&sportId=1`
  )
  return (data.stats[0]?.splits ?? []).slice(0, 10)
}
```

- [ ] **Step 3: Type-check and lint**

```bash
npm run build
npm run lint
```

Expected: both succeed with no errors. Fix any before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/types/mlb.ts src/api/mlb.ts
git commit -m "feat: add GameLogSplit types and fetchGameLog to mlb.ts"
```

---

### Task 2: Create GameLogModal and wire it into BattingTable

**Files:**
- Create: `src/components/GameLogModal.tsx`
- Modify: `src/components/BattingTable.tsx`

**Interfaces:**
- Consumes:
  - `fetchGameLog(personId: number, group: 'hitting' | 'pitching'): Promise<GameLogSplit[]>` from `../api/mlb`
  - `GameLogSplit`, `BattingGameStat`, `PitchingGameStat` from `../types/mlb`
- Produces:
  - `export default function GameLogModal(props: { personId: number; playerName: string; group: 'hitting' | 'pitching'; onClose: () => void })`

- [ ] **Step 1: Create src/components/GameLogModal.tsx**

```tsx
import { useEffect, useState } from 'react'
import { fetchGameLog } from '../api/mlb'
import type { GameLogSplit, BattingGameStat, PitchingGameStat } from '../types/mlb'

interface Props {
  personId: number
  playerName: string
  group: 'hitting' | 'pitching'
  onClose: () => void
}

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function GameLogModal({ personId, playerName, group, onClose }: Props) {
  const [games, setGames] = useState<GameLogSplit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchGameLog(personId, group)
      .then(setGames)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [personId, group])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{playerName} — Last 10 Games</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-2">
            &times;
          </button>
        </div>
        <div className="p-4">
          {loading && <div className="text-center text-gray-500 py-6">Loading…</div>}
          {error && <div className="text-center text-red-600 py-6">{error}</div>}
          {!loading && !error && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase">
                  <th className="text-left font-medium py-2">Date</th>
                  <th className="text-left font-medium py-2">Opp</th>
                  {group === 'hitting' ? (
                    <>
                      <th className="text-center font-medium py-2">AB</th>
                      <th className="text-center font-medium py-2">R</th>
                      <th className="text-center font-medium py-2">H</th>
                      <th className="text-center font-medium py-2">HR</th>
                      <th className="text-center font-medium py-2">RBI</th>
                      <th className="text-center font-medium py-2">BB</th>
                      <th className="text-center font-medium py-2">K</th>
                    </>
                  ) : (
                    <>
                      <th className="text-center font-medium py-2">IP</th>
                      <th className="text-center font-medium py-2">H</th>
                      <th className="text-center font-medium py-2">R</th>
                      <th className="text-center font-medium py-2">ER</th>
                      <th className="text-center font-medium py-2">BB</th>
                      <th className="text-center font-medium py-2">K</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {games.map((g, i) => (
                  <tr key={i}>
                    <td className="py-2 text-gray-700 whitespace-nowrap">{formatDate(g.date)}</td>
                    <td className="py-2 text-gray-700 whitespace-nowrap">
                      {(g.isHome ? 'vs ' : '@ ') + g.opponent.team.name}
                    </td>
                    {group === 'hitting'
                      ? (() => {
                          const s = g.stat as BattingGameStat
                          return (
                            <>
                              <td className="text-center tabular-nums">{s.atBats}</td>
                              <td className="text-center tabular-nums">{s.runs}</td>
                              <td className="text-center tabular-nums">{s.hits}</td>
                              <td className="text-center tabular-nums">{s.homeRuns}</td>
                              <td className="text-center tabular-nums">{s.rbi}</td>
                              <td className="text-center tabular-nums">{s.baseOnBalls}</td>
                              <td className="text-center tabular-nums">{s.strikeOuts}</td>
                            </>
                          )
                        })()
                      : (() => {
                          const s = g.stat as PitchingGameStat
                          return (
                            <>
                              <td className="text-center tabular-nums">{s.inningsPitched}</td>
                              <td className="text-center tabular-nums">{s.hits}</td>
                              <td className="text-center tabular-nums">{s.runs}</td>
                              <td className="text-center tabular-nums">{s.earnedRuns}</td>
                              <td className="text-center tabular-nums">{s.baseOnBalls}</td>
                              <td className="text-center tabular-nums">{s.strikeOuts}</td>
                            </>
                          )
                        })()}
                  </tr>
                ))}
                {games.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center text-gray-400 py-6">
                      No recent games.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire GameLogModal into BattingTable.tsx**

Open `src/components/BattingTable.tsx`. Add the import after the existing imports:

```ts
import GameLogModal from './GameLogModal'
```

Add state alongside the existing `sort` state declaration:

```ts
const [selectedPlayer, setSelectedPlayer] = useState<{ id: number; name: string } | null>(null)
```

Replace the row `<tr>`:

```tsx
<tr key={player.id} className="hover:bg-red-50 transition-colors">
```

with:

```tsx
<tr
  key={player.id}
  className="hover:bg-red-50 transition-colors cursor-pointer"
  onClick={() => setSelectedPlayer({ id: player.id, name: player.fullName })}
>
```

Replace the final `return (...)` of the component -- wrap the existing `<div className="overflow-x-auto">...</div>` in a fragment and add the modal after it:

```tsx
return (
  <>
    <div className="overflow-x-auto">
      {/* ...existing table markup unchanged... */}
    </div>
    {selectedPlayer && (
      <GameLogModal
        personId={selectedPlayer.id}
        playerName={selectedPlayer.name}
        group="hitting"
        onClose={() => setSelectedPlayer(null)}
      />
    )}
  </>
)
```

(Keep all existing markup inside the `<div className="overflow-x-auto">` exactly as it is today -- only the wrapping fragment and the modal are new.)

- [ ] **Step 3: Type-check and lint**

```bash
npm run build
npm run lint
```

Expected: both succeed with no errors. Fix any before continuing.

- [ ] **Step 4: Verify in dev server**

```bash
npm run dev
```

Open the app, go to the Batting tab, and verify:

1. Hovering a player row shows a pointer cursor
2. Clicking a row opens the modal with that player's name in the header and a table of up to 10 games with columns `Date | Opp | AB | R | H | HR | RBI | BB | K`
3. Clicking the backdrop closes the modal
4. Clicking the X button closes the modal
5. Pressing Escape closes the modal
6. Clicking a different player row while the modal is open shows that player's data (close and reopen, or click a new row directly)

- [ ] **Step 5: Commit**

```bash
git add src/components/GameLogModal.tsx src/components/BattingTable.tsx
git commit -m "feat: add player game log modal, wire into BattingTable"
```

---

### Task 3: Wire GameLogModal into PitchingTable

**Files:**
- Modify: `src/components/PitchingTable.tsx`

**Interfaces:**
- Consumes: `GameLogModal` (default export) from `./GameLogModal`

- [ ] **Step 1: Wire GameLogModal into PitchingTable.tsx**

Open `src/components/PitchingTable.tsx`. Add the import after the existing imports:

```ts
import GameLogModal from './GameLogModal'
```

Add state alongside the existing `sort` state declaration:

```ts
const [selectedPlayer, setSelectedPlayer] = useState<{ id: number; name: string } | null>(null)
```

Replace the row `<tr>`:

```tsx
<tr key={player.id} className="hover:bg-red-50 transition-colors">
```

with:

```tsx
<tr
  key={player.id}
  className="hover:bg-red-50 transition-colors cursor-pointer"
  onClick={() => setSelectedPlayer({ id: player.id, name: player.fullName })}
>
```

Replace the final `return (...)` of the component -- wrap the existing `<div className="overflow-x-auto">...</div>` in a fragment and add the modal after it:

```tsx
return (
  <>
    <div className="overflow-x-auto">
      {/* ...existing table markup unchanged... */}
    </div>
    {selectedPlayer && (
      <GameLogModal
        personId={selectedPlayer.id}
        playerName={selectedPlayer.name}
        group="pitching"
        onClose={() => setSelectedPlayer(null)}
      />
    )}
  </>
)
```

- [ ] **Step 2: Type-check and lint**

```bash
npm run build
npm run lint
```

Expected: both succeed with no errors. Fix any before continuing.

- [ ] **Step 3: Verify in dev server**

```bash
npm run dev
```

Open the app, go to the Pitching tab, and verify:

1. Clicking a row opens the modal with that pitcher's name and a table of up to 10 games with columns `Date | Opp | IP | H | R | ER | BB | K`
2. Backdrop click, X button, and Escape all close the modal
3. Go back to the Batting tab and confirm it still opens the hitting version of the modal (no regression from the shared component)

- [ ] **Step 4: Commit**

```bash
git add src/components/PitchingTable.tsx
git commit -m "feat: wire player game log modal into PitchingTable"
```
