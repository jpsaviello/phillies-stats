---
title: 2026 All-Star Selections Banner
date: 2026-07-06
status: approved
---

## Summary

Add a dismissible banner congratulating the Phillies' 2026 All-Star selections. It appears on every tab, between the Header and Nav.

## Data

New file `src/data/allStars.ts`, exporting a hardcoded array (static roster data, not an API call, so kept separate from `mlb.ts`):

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

## Component & Placement

New file `src/components/AllStarBanner.tsx`. Takes no props -- reads `ALL_STARS_2026` directly.

Rendered in `App.tsx` between `<Header />` and `<Nav />`:

```
<Header />
<AllStarBanner />
<Nav active={tab} onChange={setTab} />
```

Renders one row: a star icon, a label ("2026 NL All-Stars:"), the five "Name (POS)" entries separated by dots, and a close button on the right.

## Dismiss Behavior

- Component holds `dismissed` state, initialized from `localStorage.getItem('phillies_allstar_banner_dismissed_2026')`.
- Clicking the close (X) button sets that localStorage key and updates state to hide the banner immediately.
- The key includes the year (`_2026`) so next season's banner automatically reappears for everyone once `ALL_STARS_2026` is updated -- no migration logic needed, it's just a new key.
- If the key isn't set, the banner always shows on load. No auto-expiry within the season.

## Visual

- Background: gold/yellow (`bg-yellow-400`), dark text (`text-gray-900`) for contrast against the red Header/Nav.
- A star icon (★) precedes the label.
- Single row layout; horizontally scrollable on narrow screens (`overflow-x-auto`, `whitespace-nowrap`) rather than wrapping.
- Close button: plain "×", same dark text color, `aria-label="Dismiss"`.

## Files Changed

- `src/data/allStars.ts` (new)
- `src/components/AllStarBanner.tsx` (new)
- `src/App.tsx` (insert `<AllStarBanner />`)
- `phillies-stats/CLAUDE.md` (add instruction to run the webapp-testing skill whenever a feature is complete)

## Testing

No test runner is configured for this project (per `phillies-stats/CLAUDE.md`). Verification is manual via the webapp-testing skill: confirm the banner renders with all five names, confirm dismiss hides it and persists across reload, confirm it appears on every tab.
