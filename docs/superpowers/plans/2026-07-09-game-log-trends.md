# Game Log Trend Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The game log modal gains a season trend chart above the last-10-games table — rolling 10-game AVG / cumulative HR for hitters, ERA progression / K's per game for pitchers — with a pill toggle to switch stats.

**Architecture:** `fetchGameLog` stops slicing and returns the full chronological season (verified live: the endpoint sends every split, oldest-first). Pure helpers in a new `src/utils/trends.ts` map splits → `{date, value}[]` per stat. A new hand-rolled SVG `TrendChart` component (2px red line, area wash, hover crosshair + tooltip) renders the selected series. `GameLogModal` owns the stat-toggle state and derives the last-10 table rows locally.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4, MLB Stats API — no chart library, no test runner; verify via webapp-testing.

## Global Constraints

- No new dependencies — the chart is hand-rolled SVG
- One fetch per modal open, same as today (full season instead of 10 games)
- Chart follows the dataviz skill's specs: 2px round-cap line, ~10% opacity area wash, hairline gridlines, end-dot r=4 with 2px surface ring, latest value direct-labeled, hover crosshair + tooltip, all text in gray tokens (never series red), no legend (single series)
- Phillies red `#E81828` validated against the white surface (all palette checks pass)
- Trend math must never emit `NaN`/`Infinity` — skip 0-AB windows and 0-IP prefixes; cap plotted ERA at 20
- Fewer than 2 computed points → "Not enough games yet" placeholder, table unaffected
- CLAUDE.md's description of `fetchGameLog` must be updated in the same feature

---

### Task 1: Return the full season from fetchGameLog; keep the modal's table on last-10

**Files:**
- Modify: `src/api/mlb.ts`
- Modify: `src/components/GameLogModal.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Changes: `fetchGameLog(personId, group)` now resolves to the **full season chronological** `GameLogSplit[]` (oldest first). Sole consumer is `GameLogModal`.

- [ ] **Step 1: Update fetchGameLog in src/api/mlb.ts**

Replace the body's slice/reverse with a plain return, updating the comment to state the new contract (API sends oldest-first; callers wanting "last N most-recent-first" slice/reverse themselves).

- [ ] **Step 2: Derive last-10 in GameLogModal**

Store the full season in state (`const [season, setSeason] = useState<GameLogSplit[]>([])`); compute `const games = [...season].slice(-10).reverse()` for the table. Rendered output must be pixel-identical to today.

- [ ] **Step 3: Update CLAUDE.md**

Rewrite the `src/api/mlb.ts` bullet's `fetchGameLog` note: it returns the full season chronologically; `GameLogModal` slices the last 10 for its table and feeds the whole season to the trend chart.

- [ ] **Step 4: Type-check and lint** — `npm run build && npm run lint`, fix anything before continuing.

---

### Task 2: Trend series helpers (src/utils/trends.ts)

**Files:**
- Create: `src/utils/trends.ts`

**Interfaces:**
- Produces:
  - `export interface TrendPoint { date: string; value: number }`
  - `export function rollingAvg(splits: GameLogSplit[], window?: number): TrendPoint[]`
  - `export function cumulativeHomeRuns(splits: GameLogSplit[]): TrendPoint[]`
  - `export function eraProgression(splits: GameLogSplit[]): TrendPoint[]`
  - `export function strikeoutsPerGame(splits: GameLogSplit[]): TrendPoint[]`

- [ ] **Step 1: Implement the four helpers**

All take chronological splits. Details:
- `rollingAvg` (default window 10): trailing-window `sum(hits)/sum(atBats)`; emit a point only when the window is full and its AB sum > 0
- `cumulativeHomeRuns`: running sum after each game
- `eraProgression`: parse `inningsPitched` `"6.1"` → `6 + 1/3`; after each appearance emit `9 * cumER / cumIP`, skipping while `cumIP === 0`; plotted value capped at 20 (running totals uncapped)
- `strikeoutsPerGame`: per-game K values, not cumulative

- [ ] **Step 2: Type-check and lint** — `npm run build && npm run lint`.

- [ ] **Step 3: Spot-check the math** — quick node script against live API data for one hitter and one pitcher (e.g., final ERA point matches the player's season ERA to rounding; final cumulative HR matches season total).

---

### Task 3: TrendChart component

**Files:**
- Create: `src/components/TrendChart.tsx`

**Interfaces:**
- Produces: `export default function TrendChart({ points, yFormat }: { points: TrendPoint[]; yFormat: (v: number) => string })`

- [ ] **Step 1: Build the SVG chart**

Fixed `viewBox` (~640×180 plus label margins), `className="w-full"`. Layers, back to front: horizontal hairline gridlines (3–4, `#e5e7eb`) with muted-gray `tabular-nums` tick labels on a padded round-number y-domain; month labels along the x-axis at each month's first game; area wash (`#E81828` at 10% opacity, closed to the baseline); 2px round-cap/join polyline in `#E81828`; end dot (r=4, 2px white ring) with the latest value labeled beside it in dark gray.

- [ ] **Step 2: Hover layer**

Transparent full-plot `<rect>` tracking `onPointerMove`/`onPointerLeave` via React state; snap to the nearest point's x; render a vertical hairline crosshair, an emphasized dot on the line, and a small tooltip (date muted, value bold and leading) positioned near the point, flipping sides at the chart edges.

- [ ] **Step 3: Type-check and lint** — `npm run build && npm run lint`.

---

### Task 4: Wire chart + toggle into GameLogModal, verify end-to-end

**Files:**
- Modify: `src/components/GameLogModal.tsx`

**Interfaces:**
- Consumes: `TrendChart`, the four helpers from `../utils/trends`

- [ ] **Step 1: Add stat toggle + chart section**

Between header and table (inside the non-loading, non-error branch): two pill buttons — hitting: `Rolling AVG` / `HR Pace`; pitching: `ERA` / `K's / Game` — active pill `bg-[#E81828] text-white`, inactive gray. `useState` for selection (defaults: Rolling AVG, ERA); `useMemo` the four series from the season splits; matching `yFormat` per stat (`.273` three-decimal for AVG, integers for HR/K, two-decimal for ERA). Under 2 points → centered gray "Not enough games yet."

- [ ] **Step 2: Type-check and lint** — `npm run build && npm run lint`.

- [ ] **Step 3: Verify with webapp-testing**

Playwright script via `scripts/with_server.py`: Batting tab → click a row → screenshot Rolling AVG chart; toggle HR Pace → screenshot; Pitching tab → click a starter → screenshot ERA; toggle K's / Game; hover mid-chart → screenshot tooltip/crosshair; assert no console errors. Confirm visually.
