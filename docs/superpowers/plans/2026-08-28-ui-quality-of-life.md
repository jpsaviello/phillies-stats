# Implementation Plan: UI quality-of-life pass

Spec: `docs/superpowers/specs/2026-08-28-ui-quality-of-life-design.md`

Seven tasks, all frontend, all render-layer. No backend, no dependency, no
migration, no secret, no feature flag, no deploy step beyond the normal push.

---

## Task 1 — `src/utils/search.ts` (pure)

No React, no fetch, no import from `components/` — same posture as
`roster.ts` / `bullpen.ts` / `tiebreakers.ts`, so it can be exercised without a
browser.

```ts
export function normalize(value: string): string
export function matchesQuery(name: string, query: string): boolean
```

- `normalize`: `NFD` → strip `\p{Diacritic}` → lowercase → collapse whitespace →
  trim. The diacritic strip is the load-bearing part: this roster has Sánchez,
  Suárez and Alvarado, and `sanchez` must match.
- `matchesQuery`: an empty/whitespace query returns `true` (no filter), otherwise
  every whitespace-separated token of the normalized query must be a substring of
  the normalized name.

## Task 2 — `src/components/PlayerSearch.tsx`

```tsx
interface Props {
  value: string
  onChange: (value: string) => void
  shown: number
  total: number
  label: string      // "Search batters" — the accessible name
  placeholder: string
}
```

- Rounded input, magnifier glyph inline, `w-full sm:max-w-xs`.
- Clear (`×`) button only when `value !== ''`; `aria-label="Clear search"`.
- `onKeyDown`: Escape clears (`e.preventDefault()` first, or Safari also
  reverts the field itself).
- Result count `{shown} of {total}` beside the field, only when `value !== ''`,
  in a `<span aria-live="polite">`.
- `type="text"` with `inputMode="search"`, not `type="search"` — the WebKit
  native cancel button would sit next to our own clear button.
- Focus ring: `focus-visible:ring-2 focus-visible:ring-phillies-red/40`, matching
  the sort buttons and `ErrorState`.

## Task 3 — `src/components/ScrollX.tsx`

Wraps content that scrolls horizontally.

```tsx
export default function ScrollX({ children, className }: { children: React.ReactNode; className?: string })
```

- Outer `relative`; inner `ref` div carries `overflow-x-auto` (plus `className`).
- State `more: boolean` = `el.scrollWidth - el.clientWidth - el.scrollLeft > 1`.
- Recompute on: mount, the inner div's `scroll` (passive), and a
  `ResizeObserver` on the inner div. The observer is not optional — the tables
  gain a star column on sign-in, so a mount-time-only measurement goes stale.
- Fade: `absolute inset-y-0 right-0 w-8 pointer-events-none bg-gradient-to-l
  from-white to-transparent`, `aria-hidden="true"`, rendered only when `more`.
- Disconnect the observer and remove the listener in the effect's cleanup.

## Task 4 — Batting and Pitching tables

`src/components/BattingTable.tsx`, `src/components/PitchingTable.tsx`:

1. `const [query, setQuery] = useState('')`.
2. After the existing `sorted` computation, add
   `const rows = sorted.filter(s => matchesQuery(s.player.fullName, query))`.
   Keep `sorted` as the denominator — `shown={rows.length} total={sorted.length}`.
3. Render `<PlayerSearch>` above the table in a `mb-3` row.
4. Replace `<div className="overflow-x-auto">` with `<ScrollX>`.
5. Map over `rows`, not `sorted`.
6. Empty states, in this order:
   - `sorted.length === 0` → the existing "No batters have recorded an at-bat"
     copy, unchanged, and **no** search box (there is nothing to search).
   - `rows.length === 0` → search box still rendered, then an `EmptyState`
     naming the query with a "Clear search" button.

Do **not** change: the fetch, the sort logic, the `selected` lookup (it must
keep reading `splits`, so a `?player=` link opens a player the current query
filters out), `starredIds`, or the sticky-column classes.

`PitchingTable` additionally keeps `BullpenUsage` mounted above the search box
and outside every early return, exactly as today.

## Task 5 — Roster tab

`src/components/Roster.tsx`:

1. `const [query, setQuery] = useState('')`.
2. `const matched = players.filter(p => matchesQuery(p.person.fullName, query))`
   **before** `groupRoster(...)`, so section counts and subgroups describe what
   is rendered.
3. `sections = groupRoster(matched)`; keep the existing
   `players.length === 0` → "No roster is available" empty state keyed on the
   unfiltered list, and add a `sections.length === 0 && query !== ''` →
   "no matches" state below the search box.
4. `shown={matched.length} total={players.length}`.
5. Each section's `<div className="mt-3 overflow-x-auto">` becomes
   `<ScrollX className="mt-3">`.
6. `openPlayer` keeps looking up in `players`, not `matched`.

## Task 6 — Schedule jump-to-today

`src/components/Schedule.tsx`:

1. `const todayRef = useRef<HTMLDivElement | null>(null)`.
2. While mapping rows, attach the ref to the **first** row that is today's, and
   if no row is today's, to the first row whose `date >= today` — one `let
   anchorAssigned = false` guard set inside the map, so it survives the
   `dates.flatMap` shape without a second pass.
3. Button above the list: label `Today` when a today row exists, else
   `Next game`; not rendered when neither exists (`anchor` never assigned).
   Styling matches `ErrorState`'s button (bordered, navy → red on hover).
4. Click: `scrollIntoView({ block: 'center', behavior })` where `behavior` is
   `'smooth'` unless `matchMedia('(prefers-reduced-motion: reduce)').matches`,
   then flash a ring via a `highlight` state cleared on a 1500ms timeout (cleared
   in cleanup so an unmount mid-flash can't set state on a dead component).
5. Do not touch: the fetch window, the odds map, `upcoming`/`MatchupPreview`,
   `clickable`, or the row's right-hand slot.

## Task 7 — Back to top + wiring

New `src/components/BackToTop.tsx`:

- `useEffect` adds a `passive` `scroll` listener setting `visible = scrollY > 600`;
  evaluate once on mount too, since a hash-restored deep scroll position fires no
  scroll event.
- Renders `null` when not visible.
- `fixed bottom-20 right-4 z-30`, 40px circle, white with `border-gray-300` and
  navy chevron, `shadow-lg`, `aria-label="Back to top"`. `z-30`/`bottom-20` keep
  it clear of and under the chat FAB (`bottom-4 right-4`, `h-14`, `z-40`).
- Click: `window.scrollTo({ top: 0, behavior })`, same reduced-motion check as
  Task 6 — factor that check into `src/utils/motion.ts` (`prefersReducedMotion()`)
  so both call sites share one implementation.

`src/App.tsx`: mount `<BackToTop />` next to `<ChatWidget />`, outside the tab
conditionals.

---

## Verification

1. `npm run build` and `npm run lint` clean.
2. `webapp-testing` with both servers up (`npm run dev:server`, `npm run dev`):
   - Batting: type `sanchez` → Cristopher Sánchez matches (the diacritic case);
     type `zzz` → no-match state; Clear restores the full table.
   - Batting at 375px: fade visible at the right edge, gone after scrolling the
     table fully right.
   - Roster: `suarez` narrows the sections and their counts.
   - Schedule: click the jump button, confirm today's row is centred and ringed.
   - Scroll down, confirm the back-to-top button appears clear of the chat FAB
     and returns to the top.
   - Zero console errors on every tab.
3. Screenshots reviewed at 375px and 1280px.
4. `CLAUDE.md` updated: the new shared components, the search matcher, and the
   sticky-header rejection.
