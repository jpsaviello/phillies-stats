# All-Star Selections Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dismissible gold banner congratulating the Phillies' 2026 All-Star selections, shown on every tab between the Header and Nav.

**Architecture:** A static data file (`src/data/allStars.ts`) feeds a new presentational component (`src/components/AllStarBanner.tsx`) that is inserted into `App.tsx`. Dismiss state is a year-scoped `localStorage` key, so no backend or API call is involved.

**Tech Stack:** React 19 + TypeScript, Tailwind v4 (CSS-first, no `tailwind.config.js`), Vite. No test runner is configured for this repo.

## Global Constraints

- No test runner is configured (per `phillies-stats/CLAUDE.md`) — verification is manual, via the webapp-testing skill, not automated tests.
- Never run `git add`, `git commit`, or `git push` — the user stages and commits. Steps below stop short of committing; do not add commit steps.
- Tailwind v4 is CSS-first — use utility classes inline, do not create or edit a `tailwind.config.js`.
- Match existing component conventions: functional components, no external state library, one file per component (see `src/components/Header.tsx`, `src/components/Nav.tsx`).
- The dismiss localStorage key must be `phillies_allstar_banner_dismissed_2026` exactly (year-scoped so next season's roster update naturally reshows the banner).

---

### Task 1: All-Star data, banner component, and wiring

**Files:**
- Create: `src/data/allStars.ts`
- Create: `src/components/AllStarBanner.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `AllStarSelection` interface (`{ name: string; position: string }`) and `ALL_STARS_2026: AllStarSelection[]` from `src/data/allStars.ts`.
- Produces: `AllStarBanner` default export (no props) from `src/components/AllStarBanner.tsx`.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Create the data file**

`src/data/allStars.ts`:

```ts
export interface AllStarSelection {
  name: string
  position: string
}

export const ALL_STARS_2026: AllStarSelection[] = [
  { name: 'Jhoan Duran', position: 'RHP' },
  { name: 'Bryce Harper', position: '1B' },
  { name: 'Brandon Marsh', position: 'LF' },
  { name: 'Cristopher Sánchez', position: 'LHP' },
  { name: 'Kyle Schwarber', position: 'DH' },
]
```

- [ ] **Step 2: Create the banner component**

`src/components/AllStarBanner.tsx`:

```tsx
import { useState } from 'react'
import { ALL_STARS_2026 } from '../data/allStars'

const DISMISS_KEY = 'phillies_allstar_banner_dismissed_2026'

export default function AllStarBanner() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === 'true'
  )

  if (dismissed) return null

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, 'true')
    setDismissed(true)
  }

  return (
    <div className="bg-yellow-400 text-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 overflow-x-auto whitespace-nowrap">
        <span aria-hidden="true">★</span>
        <span className="font-semibold">2026 NL All-Stars:</span>
        <span>
          {ALL_STARS_2026.map((player, i) => (
            <span key={player.name}>
              {i > 0 && ' · '}
              {player.name} ({player.position})
            </span>
          ))}
        </span>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="ml-auto text-gray-900 hover:text-gray-700 font-bold px-2"
        >
          ×
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire the banner into App.tsx**

Modify `src/App.tsx` — add the import and insert the component between `<Header />` and `<Nav />`:

```tsx
import { useState } from 'react'
import Header from './components/Header'
import AllStarBanner from './components/AllStarBanner'
import Nav, { type Tab } from './components/Nav'
import BattingTable from './components/BattingTable'
import PitchingTable from './components/PitchingTable'
import Standings from './components/Standings'
import Schedule from './components/Schedule'

export default function App() {
  const [tab, setTab] = useState<Tab>('batting')

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <AllStarBanner />
      <Nav active={tab} onChange={setTab} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'batting' && <BattingTable />}
        {tab === 'pitching' && <PitchingTable />}
        {tab === 'standings' && <Standings />}
        {tab === 'schedule' && <Schedule />}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Type-check and build**

Run: `npm run build`
Expected: completes with no TypeScript errors (build runs `tsc -b && vite build`).

- [ ] **Step 5: Verify in the browser with the webapp-testing skill**

Use the webapp-testing skill to drive the app (start with `npm run dev`) and confirm:
- The gold banner appears below the Header on load, showing all five names: Jhoan Duran (RHP), Bryce Harper (1B), Brandon Marsh (LF), Cristopher Sánchez (LHP), Kyle Schwarber (DH).
- The banner is visible on every tab (Batting, Pitching, Standings, Schedule), not just one.
- Clicking the × button hides the banner immediately.
- After clicking ×, reloading the page keeps the banner hidden (check `localStorage.getItem('phillies_allstar_banner_dismissed_2026')` is `'true'` via dev tools or the skill's console access).
- Clearing that localStorage key and reloading brings the banner back.

Do not commit — leave changes staged in the working tree for the user to review.

---

### Task 2: Document the webapp-testing convention

**Files:**
- Modify: `phillies-stats/CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (documentation only).

- [ ] **Step 1: Add the instruction**

Add a new section to `phillies-stats/CLAUDE.md` (after the existing `## Architecture` section, or wherever the file's structure best fits — check the current file contents first since this plan does not assume its exact current layout beyond what was read during brainstorming):

```markdown
## Testing

No automated test runner is configured. Whenever a feature is complete, use the webapp-testing skill to verify it manually in the browser before considering the work done.
```

- [ ] **Step 2: Confirm the file reads correctly**

Read the file back and confirm the new section is present, correctly formatted, and doesn't duplicate or contradict the existing "No test runner is configured." line under `## Commands`.

Do not commit — leave changes staged in the working tree for the user to review.

---

## Self-Review Notes

- **Spec coverage:** Data file ✓ (Task 1, Step 1), component + placement ✓ (Task 1, Steps 2-3), dismiss behavior ✓ (Task 1, Step 2), visual styling ✓ (Task 1, Step 2 — gold background, star icon, scrollable row, × button), CLAUDE.md update ✓ (Task 2), verification via webapp-testing ✓ (Task 1, Step 5).
- **Placeholder scan:** none found — all steps contain complete code or exact instructions.
- **Type consistency:** `AllStarSelection` and `ALL_STARS_2026` names match between the data file (Task 1, Step 1) and their only consumer, `AllStarBanner` (Task 1, Step 2). `AllStarBanner` default export name matches its import in `App.tsx` (Task 1, Step 3).
