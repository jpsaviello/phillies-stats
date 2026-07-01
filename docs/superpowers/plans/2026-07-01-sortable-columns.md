# Sortable Column Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to toggle sort direction on column headers in BattingTable and PitchingTable -- first click sorts by default direction, second click reverses it.

**Architecture:** Replace the single `sortKey: string` state in each table component with a `sort: { key, dir }` object. Each column definition gains a `defaultDir` field. The click handler sets a new column to its default direction or flips direction on the active column. The sort function reads `sort.dir` to determine order.

**Tech Stack:** React 19, TypeScript, no test runner configured -- verify manually via dev server.

## Global Constraints

- No visual direction indicator (no arrow); active column highlight stays red as-is
- Batting: all columns default to `'desc'`
- Pitching: `era` and `whip` default to `'asc'`; all other columns default to `'desc'`
- Do not change any other behavior (filtering, layout, styling)

---

### Task 1: Update BattingTable sort state and logic

**Files:**
- Modify: `src/components/BattingTable.tsx`

**Interfaces:**
- Produces: `BattingTable` component with toggling sort

- [ ] **Step 1: Replace sort state**

Replace:
```ts
const [sortKey, setSortKey] = useState<keyof BattingStats>('avg')
```
With:
```ts
const [sort, setSort] = useState<{ key: keyof BattingStats; dir: 'asc' | 'desc' }>({ key: 'avg', dir: 'desc' })
```

- [ ] **Step 2: Add `defaultDir` to column definitions**

Replace the `cols` array type and values:
```ts
const cols: { key: keyof BattingStats; label: string; defaultDir: 'asc' | 'desc' }[] = [
  { key: 'gamesPlayed', label: 'G', defaultDir: 'desc' },
  { key: 'atBats', label: 'AB', defaultDir: 'desc' },
  { key: 'runs', label: 'R', defaultDir: 'desc' },
  { key: 'hits', label: 'H', defaultDir: 'desc' },
  { key: 'doubles', label: '2B', defaultDir: 'desc' },
  { key: 'triples', label: '3B', defaultDir: 'desc' },
  { key: 'homeRuns', label: 'HR', defaultDir: 'desc' },
  { key: 'rbi', label: 'RBI', defaultDir: 'desc' },
  { key: 'stolenBases', label: 'SB', defaultDir: 'desc' },
  { key: 'baseOnBalls', label: 'BB', defaultDir: 'desc' },
  { key: 'strikeOuts', label: 'K', defaultDir: 'desc' },
  { key: 'avg', label: 'AVG', defaultDir: 'desc' },
  { key: 'obp', label: 'OBP', defaultDir: 'desc' },
  { key: 'slg', label: 'SLG', defaultDir: 'desc' },
  { key: 'ops', label: 'OPS', defaultDir: 'desc' },
]
```

- [ ] **Step 3: Update sort logic**

Replace:
```ts
const sorted = [...splits]
  .filter(s => s.stat.atBats > 0)
  .sort((a, b) => {
    const av = parseFloat(String(a.stat[sortKey])) || 0
    const bv = parseFloat(String(b.stat[sortKey])) || 0
    return bv - av
  })
```
With:
```ts
const sorted = [...splits]
  .filter(s => s.stat.atBats > 0)
  .sort((a, b) => {
    const av = parseFloat(String(a.stat[sort.key])) || 0
    const bv = parseFloat(String(b.stat[sort.key])) || 0
    return sort.dir === 'desc' ? bv - av : av - bv
  })
```

- [ ] **Step 4: Update click handler on `<th>`**

Replace:
```tsx
onClick={() => setSortKey(c.key)}
```
With:
```tsx
onClick={() =>
  setSort(prev =>
    prev.key === c.key
      ? { key: c.key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key: c.key, dir: c.defaultDir }
  )
}
```

- [ ] **Step 5: Update active-column references from `sortKey` to `sort.key`**

In the `<th>` className:
```tsx
className={`... ${sort.key === c.key ? 'text-[#E81828]' : ''}`}
```

In the `<td>` className:
```tsx
className={`... ${sort.key === c.key ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
```

- [ ] **Step 6: Verify in dev server**

Run: `npm run dev`

- Click any column header -- confirm table sorts in default direction (descending for all batting stats)
- Click the same header again -- confirm sort reverses
- Click a different header -- confirm it resets to that column's default direction
- Confirm the red highlight follows the active column

- [ ] **Step 7: Commit**

```bash
git add src/components/BattingTable.tsx
git commit -m "feat: toggle sort direction on batting table column headers"
```

---

### Task 2: Update PitchingTable sort state and logic

**Files:**
- Modify: `src/components/PitchingTable.tsx`

**Interfaces:**
- Produces: `PitchingTable` component with toggling sort

- [ ] **Step 1: Replace sort state**

Replace:
```ts
const [sortKey, setSortKey] = useState<keyof PitchingStats>('era')
```
With:
```ts
const [sort, setSort] = useState<{ key: keyof PitchingStats; dir: 'asc' | 'desc' }>({ key: 'era', dir: 'asc' })
```

- [ ] **Step 2: Add `defaultDir` to column definitions**

Replace the `cols` array type and values:
```ts
const cols: { key: keyof PitchingStats; label: string; defaultDir: 'asc' | 'desc' }[] = [
  { key: 'gamesPlayed', label: 'G', defaultDir: 'desc' },
  { key: 'gamesStarted', label: 'GS', defaultDir: 'desc' },
  { key: 'wins', label: 'W', defaultDir: 'desc' },
  { key: 'losses', label: 'L', defaultDir: 'desc' },
  { key: 'saves', label: 'SV', defaultDir: 'desc' },
  { key: 'inningsPitched', label: 'IP', defaultDir: 'desc' },
  { key: 'hits', label: 'H', defaultDir: 'desc' },
  { key: 'homeRuns', label: 'HR', defaultDir: 'desc' },
  { key: 'baseOnBalls', label: 'BB', defaultDir: 'desc' },
  { key: 'strikeOuts', label: 'K', defaultDir: 'desc' },
  { key: 'era', label: 'ERA', defaultDir: 'asc' },
  { key: 'whip', label: 'WHIP', defaultDir: 'asc' },
]
```

- [ ] **Step 3: Update sort logic**

Replace:
```ts
const sorted = [...splits]
  .filter(s => parseFloat(s.stat.inningsPitched) > 0)
  .sort((a, b) => {
    const av = parseFloat(String(a.stat[sortKey])) || 0
    const bv = parseFloat(String(b.stat[sortKey])) || 0
    const lowerIsBetter = sortKey === 'era' || sortKey === 'whip'
    return lowerIsBetter ? av - bv : bv - av
  })
```
With:
```ts
const sorted = [...splits]
  .filter(s => parseFloat(s.stat.inningsPitched) > 0)
  .sort((a, b) => {
    const av = parseFloat(String(a.stat[sort.key])) || 0
    const bv = parseFloat(String(b.stat[sort.key])) || 0
    return sort.dir === 'asc' ? av - bv : bv - av
  })
```

- [ ] **Step 4: Update click handler on `<th>`**

Replace:
```tsx
onClick={() => setSortKey(c.key)}
```
With:
```tsx
onClick={() =>
  setSort(prev =>
    prev.key === c.key
      ? { key: c.key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key: c.key, dir: c.defaultDir }
  )
}
```

- [ ] **Step 5: Update active-column references from `sortKey` to `sort.key`**

In the `<th>` className:
```tsx
className={`... ${sort.key === c.key ? 'text-[#E81828] ' : ''}`}
```

In the `<td>` className:
```tsx
className={`... ${sort.key === c.key ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
```

- [ ] **Step 6: Verify in dev server**

- Click ERA -- confirm pitchers with lowest ERA sort to top
- Click ERA again -- confirm pitchers with highest ERA sort to top
- Click WHIP -- confirm sorts ascending (lowest WHIP first)
- Click K -- confirm sorts descending (most strikeouts first)
- Click K again -- confirm flips to ascending

- [ ] **Step 7: Commit**

```bash
git add src/components/PitchingTable.tsx
git commit -m "feat: toggle sort direction on pitching table column headers"
```
