# Schedule Team Logos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display a small MLB team logo next to each opponent's name on the Schedule page.

**Architecture:** Add a `teamLogoUrl(teamId)` helper to the existing API module, then render an `<img>` in the Schedule component using the opponent's team ID, which is already present in the fetched `Game` data.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vite, MLB.com-hosted SVG logos

## Global Constraints

- No new dependencies
- No new API calls -- team ID is already in `Game` data
- Logo image must degrade gracefully (hide on error, no layout shift)
- Tailwind utility classes only for styling

---

### Task 1: Add `teamLogoUrl` helper to `src/api/mlb.ts`

**Files:**
- Modify: `src/api/mlb.ts`

**Interfaces:**
- Produces: `export function teamLogoUrl(teamId: number): string`

- [ ] **Step 1: Add the helper function**

Open `src/api/mlb.ts` and append this export after the existing exports (after `fetchSchedule` and the `Game` interface):

```ts
export function teamLogoUrl(teamId: number): string {
  return `https://www.mlb.com/assets/images/teams/logos/team-cap-on-light/${teamId}.svg`
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from `phillies-stats/`:
```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/api/mlb.ts
git commit -m "feat: add teamLogoUrl helper to mlb api"
```

---

### Task 2: Render team logo in Schedule component

**Files:**
- Modify: `src/components/Schedule.tsx`

**Interfaces:**
- Consumes: `teamLogoUrl(teamId: number): string` from `../api/mlb`

- [ ] **Step 1: Import `teamLogoUrl`**

At the top of `src/components/Schedule.tsx`, update the existing import line:

```ts
import { fetchSchedule, teamLogoUrl } from '../api/mlb'
```

- [ ] **Step 2: Derive `opponentId` in the game row**

Inside the `.map()` callback (after the existing `const won = ...` line), add:

```ts
const opponentId = isHome ? game.teams.away.team.id : game.teams.home.team.id
```

- [ ] **Step 3: Render the logo `<img>`**

In the JSX, between the `vs`/`@` cell and the opponent name `<div>`, insert:

```tsx
<img
  src={teamLogoUrl(opponentId)}
  alt={opponent}
  className="w-6 h-6 rounded-full shrink-0"
  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
/>
```

The full row should now look like this (for reference):

```tsx
<div key={game.gamePk} className={`flex items-center gap-4 px-4 py-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-colors ${isToday ? 'border-l-4 border-l-[#E81828]' : ''}`}>
  <div className="text-sm text-gray-500 w-24 shrink-0">
    {formatDate(date)}
    {isToday && <span className="ml-2 text-xs font-bold text-[#E81828] uppercase">Today</span>}
  </div>
  <div className="text-sm text-gray-400 w-6 text-center">{isHome ? 'vs' : '@'}</div>
  <img
    src={teamLogoUrl(opponentId)}
    alt={opponent}
    className="w-6 h-6 rounded-full shrink-0"
    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
  />
  <div className="font-medium text-gray-900 flex-1">{opponent}</div>
  {isFinished ? (
    <div className={`text-sm font-semibold tabular-nums ${won ? 'text-green-600' : 'text-red-600'}`}>
      {won ? 'W' : 'L'} {philliesScore}–{oppScore}
    </div>
  ) : (
    <div className="text-sm text-gray-400">{game.status.detailedState}</div>
  )}
</div>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Run the dev server and visually verify**

```bash
npm run dev
```

Open `http://localhost:5173`, navigate to the Schedule tab. Each game row should show a small circular logo between the `vs`/`@` text and the opponent name. Confirm logos load and the row layout looks clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/Schedule.tsx
git commit -m "feat: show opponent team logo on schedule page"
```
