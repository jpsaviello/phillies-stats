# Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the site a real Phillies visual identity (navy + red + cream tokens, condensed display font, pinstriped header) and add a `HeroStrip` of summary cards (record, last game, next game with odds, team leaders with headshots) above the Nav on every tab.

**Design spec:** `docs/superpowers/specs/2026-07-15-visual-refresh-design.md`

**Architecture:** Tailwind v4 `@theme` tokens in `src/index.css` replace the hardcoded `[#E81828]` arbitrary values everywhere. `@fontsource/barlow-condensed` is bundled via imports in `main.tsx` (no runtime font CDN). A new `HeroStrip` component owns its own fetch lifecycle (standings + schedule + batting + pitching + odds via `Promise.all`) and renders four cards; `getPhilliesOdds` moves from `Schedule.tsx` to a shared `src/utils/odds.ts`.

**Tech stack:** React 19, TypeScript, Vite, Tailwind v4 (CSS-first) — no test runner; verify with the `webapp-testing` skill.

## Global Constraints

- No git add/commit/push — the user stages and commits everything themselves.
- Rendered brand red must not change: `phillies-red` token is exactly `#E81828`.
- No new backend endpoints; all data from existing `fetchStandings`, `fetchSchedule`, `fetchBattingStats`, `fetchPitchingStats`, `fetchOdds`, `teamLogoUrl`, `playerHeadshotUrl`.
- HeroStrip fails to `null` on any MLB-API error (odds excepted — they already fail soft to `[]`); it must never block the tabs.
- `AllStarBanner` styling is out of scope — leave it untouched.
- Every task ends with `npm run build` + `npm run lint` clean; the feature isn't done until the final `webapp-testing` pass (Task 5).

---

### Task 1: Theme foundation — tokens, font, pinstripes, color migration

**Files:**
- Modify: `src/index.css`, `src/main.tsx`, `package.json` (via npm install)
- Modify (token migration): `src/components/Header.tsx`, `Nav.tsx`, `BattingTable.tsx`, `PitchingTable.tsx`, `Standings.tsx`, `Schedule.tsx`, `GameLogModal.tsx`, `TrendChart.tsx`

**Interfaces:**
- Produces: Tailwind utilities `bg-phillies-{red,navy,cream}`, `text-phillies-*`, `border-phillies-*`, `font-display`; CSS class `bg-pinstripe`.

- [x] **Step 1: Install the display font**

```bash
npm install @fontsource/barlow-condensed
```

- [x] **Step 2: Add theme tokens and pinstripe utility to `src/index.css`**

```css
@import "tailwindcss";

@theme {
  --color-phillies-red: #E81828;
  --color-phillies-navy: #002D72;
  --color-phillies-cream: #FAF7F0;
  --font-display: "Barlow Condensed", ui-sans-serif, system-ui, sans-serif;
}

/* Phillies home-uniform pinstripe, for navy surfaces */
.bg-pinstripe {
  background-image: repeating-linear-gradient(
    90deg, rgb(255 255 255 / 0.05) 0 1px, transparent 1px 16px
  );
}
```

- [x] **Step 3: Import font weights in `src/main.tsx`** (before the CSS import)

```ts
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
```

- [x] **Step 4: Migrate hardcoded hex to tokens**

In every file listed above, replace Tailwind arbitrary values with token utilities — `bg-[#E81828]` → `bg-phillies-red`, `text-[#E81828]` → `text-phillies-red`, `border-[#E81828]` → `border-phillies-red`, `border-l-[#E81828]` → `border-l-phillies-red`. This is a pure rename; no visual change. `TrendChart.tsx` uses the hex as SVG attribute values (`stroke`/`fill`), not classes — leave the literals but add a one-line comment that the canonical token is `--color-phillies-red`.

Afterwards `grep -rn 'E81828' src/` should only hit `index.css` and `TrendChart.tsx`.

- [x] **Step 5: Type-check and lint**

```bash
npm run build && npm run lint
```

Expected: clean. Visually the app is unchanged except fonts are now available (nothing uses `font-display` yet).

---

### Task 2: Header, Nav, and page-shell restyle

**Files:**
- Modify: `src/components/Header.tsx`, `src/components/Nav.tsx`, `src/App.tsx`

- [x] **Step 1: Restyle `Header.tsx`**

Navy pinstriped band with a red accent bar; title in display font:

```tsx
export default function Header() {
  return (
    <header className="bg-phillies-navy bg-pinstripe text-white border-b-4 border-phillies-red">
      <div className="max-w-7xl mx-auto px-4 py-5 flex items-center gap-4">
        <div className="bg-white rounded-full p-1.5 shadow">
          <img
            src="https://www.mlbstatic.com/team-logos/143.svg"
            alt="Phillies"
            className="w-11 h-11"
          />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide leading-none">
            Philadelphia Phillies
          </h1>
          <p className="font-display text-blue-200 text-sm uppercase tracking-widest mt-1">
            2026 Season Statistics
          </p>
        </div>
      </div>
    </header>
  )
}
```

- [x] **Step 2: Restyle `Nav.tsx` tab buttons**

Keep the white sticky bar and the border-underline mechanic; change the button classes:

```tsx
className={`px-5 py-3 font-display text-base font-semibold uppercase tracking-wide border-b-2 transition-colors ${
  active === tab.id
    ? 'border-phillies-red text-phillies-navy'
    : 'border-transparent text-gray-500 hover:text-phillies-navy'
}`}
```

- [x] **Step 3: Page background in `App.tsx`**

`bg-gray-50` → `bg-phillies-cream` on the root div.

- [x] **Step 4: Type-check, lint, eyeball**

```bash
npm run build && npm run lint
```

Then start both servers (`npm run dev:server` + `npm run dev`) and confirm: navy pinstriped header with red bar, condensed uppercase title, restyled tabs, cream page background, all four tabs still render.

---

### Task 3: Shared odds helper (`src/utils/odds.ts`)

**Files:**
- Create: `src/utils/odds.ts`
- Modify: `src/components/Schedule.tsx`

**Interfaces:**
- Produces: `export function getPhilliesOdds(oddsGame: OddsGame): { ml: number; rlPoint: number; rlJuice: number } | null`
- Consumes: `OddsGame` type from `../api/mlb`

- [x] **Step 1: Create `src/utils/odds.ts`**

Move `getPhilliesOdds` verbatim from `Schedule.tsx` (it reads `bookmakers[0]`, finds the `h2h` and `spreads` markets, returns `null` when either leg is missing):

```ts
import type { OddsGame } from '../api/mlb'

export function getPhilliesOdds(oddsGame: OddsGame) {
  const dk = oddsGame.bookmakers[0]
  if (!dk) return null
  const h2h = dk.markets.find(m => m.key === 'h2h')
  const spreads = dk.markets.find(m => m.key === 'spreads')
  const ml = h2h?.outcomes.find(o => o.name === 'Philadelphia Phillies')?.price
  const rl = spreads?.outcomes.find(o => o.name === 'Philadelphia Phillies')
  if (ml === undefined || !rl) return null
  return { ml, rlPoint: rl.point ?? -1.5, rlJuice: rl.price }
}
```

- [x] **Step 2: Update `Schedule.tsx`** — delete the local function, add `import { getPhilliesOdds } from '../utils/odds'`.

- [x] **Step 3: Type-check and lint**

```bash
npm run build && npm run lint
```

---

### Task 4: HeroStrip component

**Files:**
- Create: `src/components/HeroStrip.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `fetchStandings`, `fetchSchedule`, `fetchBattingStats`, `fetchPitchingStats`, `fetchOdds`, `teamLogoUrl`, `playerHeadshotUrl`, `formatOdds`, `Game`, `OddsGame` from `../api/mlb`; `BattingStats`, `PitchingStats`, `Player`, `StandingsRecord` from `../types/mlb`; `getPhilliesOdds` from `../utils/odds`.
- Produces: `export default function HeroStrip()` — no props.

- [x] **Step 1: Create `src/components/HeroStrip.tsx`**

Structure (see the design spec for exact card copy and thresholds):

- State: `data: HeroData | null`, `loading: boolean`, `failed: boolean`.
- One `useEffect` on mount: `Promise.all([fetchStandings(), fetchSchedule(start, end), fetchBattingStats(), fetchPitchingStats(), fetchOdds().catch(() => [])])` where `start` = today−10d, `end` = today+7d (reuse Schedule's date-format approach).
- Derivations, computed after fetch into a single `HeroData` object:
  - `record`: the `StandingsRecord` with `team.id === 143` (PHILLIES_ID = 143, declared locally like Schedule does). `teamGames = wins + losses`.
  - `lastGame`: last schedule game with `status.detailedState === 'Final'` (flatten `dates[].games[]` in order).
  - `nextGame`: first game not Final.
  - `odds`: for `nextGame`, if its date is today and it isn't Final — sorted name-pair lookup then `getPhilliesOdds`, same as Schedule.
  - Leaders (skip any that don't resolve): AVG = best `avg` where `atBats >= 2 * teamGames` (fallback `atBats >= 1` if none qualify); HR = max `homeRuns`; ERA = lowest `era` where `parseFloat(inningsPitched) >= teamGames`.
- Render:
  - `loading` → four `animate-pulse` skeleton cards in the same grid (fixed `h-28`), inside `max-w-7xl mx-auto px-4 pt-6`.
  - `failed` or no record → `return null`.
  - Otherwise the four-card grid per the spec layout: **Record** (big `W–L` in `font-display text-phillies-navy`, subtitle `1st NL East` / `2nd NL East · 3.5 GB` — ordinal from `divisionRank`, GB omitted when `gamesBack === '-'`); **Last Game** (green `W` / red `L` + score, opponent logo, `vs`/`@`, short date); **Next Game** (logo, `vs`/`@` + name, weekday+time from `gameDate`, live `detailedState` when in progress, `ML {formatOdds(ml)}` in small gray when odds resolve); **Team Leaders** (three rows: 24px rounded headshot with `onError` hide, uppercase stat label, navy display-font value, player last name; em dash row when a leader is missing).
  - Card shell: `bg-white rounded-xl border border-gray-200 px-4 py-3`; labels `font-display text-xs uppercase tracking-wider text-gray-400`.

- [x] **Step 2: Wire into `App.tsx`**

```tsx
{showAllStarBanner && <AllStarBanner />}
<HeroStrip />
<Nav active={tab} onChange={setTab} />
```

Note: HeroStrip sits above the sticky Nav, so it scrolls away naturally — no z-index changes needed (Nav is already `sticky top-0 z-10`).

- [x] **Step 3: Type-check and lint**

```bash
npm run build && npm run lint
```

- [x] **Step 4: Quick manual check** — with both dev servers running, confirm the strip renders four cards with plausible data, then cross-check: record vs Standings tab, last/next game vs Schedule tab, leader values vs the sorted Batting/Pitching tables.

---

### Task 5: Full verification pass (webapp-testing)

**Files:** none (verification only; fix regressions found)

- [x] **Step 1: Drive the app with the `webapp-testing` skill** (use `scripts/with_server.py` for the dev-server lifecycle; the backend must also be running for data)

Script the real user flow and screenshot each state:

1. Load the app → screenshot. Verify: navy pinstriped header, red accent bar, condensed title, cream background, HeroStrip's four cards populated.
2. Assert HeroStrip numbers against the API-backed tabs: record string matches the Standings tab row, leaders match the top of the sorted Batting (AVG w/ qualification) and Pitching (ERA w/ qualification) tables.
3. Click each of the four tabs → screenshot each; tables/schedule render with tokenized colors, active-tab underline follows.
4. Click a batting row → GameLogModal still opens and closes (Escape).
5. Odds: if there's a Phillies game today, the Next Game card shows the ML line and the Schedule tab shows the same line; if not, the card shows the game time with no odds row (both acceptable — record which occurred).
6. Failure path: reroute/block `/api/mlb/standings*` (Playwright `route.abort()`), reload → HeroStrip renders nothing, tabs still load, no console errors.
7. Check console output for errors on every step — must be zero (a hidden headshot 404 via `onError` is acceptable network noise, but no uncaught errors).

- [x] **Step 2: Update `CLAUDE.md`** — add `HeroStrip` to the components list in the Architecture section and note the theme tokens (`phillies-red/navy/cream`, `font-display`) now defined in `src/index.css`, replacing the "Phillies red is used inline as `text-[#E81828]`" sentence.

- [x] **Step 3: Update the progress ledger** (`.superpowers/sdd/progress.md`) with per-task outcomes as tasks complete, per repo convention.
