---
title: Sortable Column Toggle -- Batting and Pitching Tables
date: 2026-07-01
status: approved
---

## Summary

Add ascending/descending sort toggling to the column headers in `BattingTable` and `PitchingTable`. Clicking a column sorts by it in its default direction; clicking the same column again reverses direction.

## State

Replace the existing `sortKey` state with a single state object:

```ts
type SortState<K> = { key: K; dir: 'asc' | 'desc' }
```

Initial value uses the column's `defaultDir`.

## Column Definitions

Each column gains a `defaultDir: 'asc' | 'desc'` field.

- **BattingTable:** all columns default to `'desc'` (higher is better)
- **PitchingTable:** `era` and `whip` default to `'asc'` (lower is better); all other columns default to `'desc'`

## Click Behavior

```
onClick(col):
  if col.key === sort.key → flip sort.dir
  else → { key: col.key, dir: col.defaultDir }
```

## Sort Logic

The sort function reads `sort.dir` instead of hardcoded direction. The ERA/WHIP special-case in `PitchingTable` is replaced by the `defaultDir` on each column (the toggle handles direction).

## Visual

No changes to visuals. Active column continues to highlight red. No arrow indicator.

## Files Changed

- `src/components/BattingTable.tsx`
- `src/components/PitchingTable.tsx`
