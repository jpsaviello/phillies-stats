---
title: Visual Refresh -- Brand Identity + Hero Summary Strip
date: 2026-07-15
status: approved
---

## Summary

Two related upgrades to make the site feel designed rather than default:

1. **Brand identity** — adopt the full Phillies palette (red + navy + cream) as Tailwind v4 theme tokens, add a condensed display font for headings/labels/numbers, restyle the Header (navy with pinstripe texture, red accent) and Nav, and migrate all hardcoded `[#E81828]` arbitrary values to the new tokens.
2. **Hero summary strip** — a new `HeroStrip` component rendered above the Nav on every tab: a row of stat cards showing the team record/standing, last game result, next game (with odds when available), and team leaders with player headshots.

No new backend work; everything uses existing `/api/mlb` and `/api/odds` endpoints and helpers.

## Part 1: Brand Identity

### Theme tokens (`src/index.css`)

Tailwind v4 is CSS-first, so tokens live in an `@theme` block:

```css
@import "tailwindcss";

@theme {
  --color-phillies-red: #E81828;   /* official primary */
  --color-phillies-navy: #002D72;  /* official secondary (midnight blue) */
  --color-phillies-cream: #FAF7F0; /* warm page background, replaces gray-50 */
  --font-display: "Barlow Condensed", ui-sans-serif, system-ui, sans-serif;
}
```

These generate `bg-phillies-navy`, `text-phillies-red`, `font-display`, etc.

### Display font

`@fontsource/barlow-condensed` (npm, weights 500/600/700), imported in `main.tsx`. Self-hosted through the Vite bundle — no runtime request to Google Fonts, so the k8s/nginx deploy needs no new egress and the site works offline. Used for: the header title, nav tab labels, hero card numbers and labels, and table `<th>` labels. Body text stays the default sans.

### Pinstripe texture

A small utility class in `index.css` (the Phillies home-uniform pinstripe, as a faint vertical stripe on navy):

```css
.bg-pinstripe {
  background-image: repeating-linear-gradient(
    90deg, rgb(255 255 255 / 0.05) 0 1px, transparent 1px 16px
  );
}
```

Applied to the Header only. The page background stays untextured (cream) to keep tables readable.

### Header restyle (`Header.tsx`)

- Background: `bg-phillies-navy bg-pinstripe`, with a `border-b-4 border-phillies-red` accent bar.
- Title in `font-display` bold uppercase with wide tracking; subtitle in a light blue (`text-blue-200`-ish) small caps.
- Logo unchanged (white-ring circle behind it so the red cap logo pops on navy).

### Nav restyle (`Nav.tsx`)

Stays a white sticky bar (readability over the tables), but:

- Tab labels in `font-display` font-semibold uppercase tracking-wide, slightly larger.
- Active tab: `text-phillies-navy` with a `border-phillies-red` 2px underline (same mechanic as today, tokenized).
- Inactive: gray, hover to navy.

### Page shell (`App.tsx`)

`bg-gray-50` → `bg-phillies-cream`.

### Token migration

Replace every `[#E81828]` arbitrary value with the `phillies-red` token utilities. Files (from grep): `Header.tsx`, `Nav.tsx`, `BattingTable.tsx`, `PitchingTable.tsx`, `Standings.tsx`, `Schedule.tsx`, `GameLogModal.tsx`, `TrendChart.tsx`. Pure rename — rendered color is identical. `TrendChart.tsx` uses the hex in SVG attributes, not Tailwind classes; it keeps the literal hex but gains a comment pointing at the token.

`AllStarBanner` (yellow) is intentionally left alone — it's a temporary, flag-gated banner.

## Part 2: Hero Summary Strip

### Placement

New `src/components/HeroStrip.tsx`, rendered in `App.tsx` between the Header/AllStarBanner and the Nav, so it shows on every tab and scrolls away as the sticky Nav takes over.

### Data

`HeroStrip` owns its own fetch lifecycle (`useEffect` + `useState`, same as the tab components), issuing one `Promise.all` on mount:

| Need | Source (already exists) |
|---|---|
| Record, division rank, games back | `fetchStandings()` → the Phillies' `StandingsRecord` |
| Last result + next game | `fetchSchedule(today−10d, today+7d)` |
| Odds for next game | `fetchOdds().catch(() => [])` (same fail-soft as Schedule) |
| Batting leaders | `fetchBattingStats()` |
| Pitching leader | `fetchPitchingStats()` |

The batting/pitching fetches duplicate what the tab components fetch on their own mount. Accepted: it matches the repo's "each component owns its fetch" pattern, and the MLB API is free/unmetered through our proxy. No shared cache is introduced.

**Derivations:**

- **Last game**: latest schedule entry with `status.detailedState === 'Final'`.
- **Next game**: earliest entry that is not Final (this naturally shows an in-progress game as "next", labeled with its live `detailedState`).
- **Odds matching**: same sorted home/away name-pair key as `Schedule.tsx`. `getPhilliesOdds` moves out of `Schedule.tsx` into a shared `src/utils/odds.ts` (alongside the existing `src/utils/trends.ts` precedent) and both components import it. Odds render on the Next Game card only when the game is today and not finished — identical policy to the Schedule tab.
- **Leaders** (qualification thresholds, using `teamGames = wins + losses` from the standings record):
  - **AVG**: best `avg` among batters with `atBats >= 2 * teamGames` (approximates the official 3.1 PA/game rule with the fields we have; falls back to min 1 AB if nobody qualifies, e.g. early season).
  - **HR**: max `homeRuns`, no threshold.
  - **ERA**: lowest `era` among pitchers with `parseFloat(inningsPitched) >= teamGames` (the official 1 IP/team-game rule; baseball's `.1/.2` fractional-inning notation makes parseFloat slightly conservative, which is fine for a threshold).

### Layout

A responsive card grid: `grid grid-cols-2 lg:grid-cols-4 gap-3` inside the existing `max-w-7xl` container.

```
┌────────────┬────────────┬────────────┬──────────────────┐
│ RECORD     │ LAST GAME  │ NEXT GAME  │ TEAM LEADERS     │
│ 52–39      │ W 6–3      │ [logo]     │ [👤] AVG .312 T… │
│ 1st NL East│ [logo] vs  │ @ Mets     │ [👤] HR 27 Schw… │
│            │ Braves     │ Wed 7:05PM │ [👤] ERA 2.81 W… │
│            │ Jul 14     │ ML −135    │                  │
└────────────┴────────────┴────────────┴──────────────────┘
```

- Cards: white, `rounded-xl border border-gray-200`, small padding.
- Label row: tiny uppercase gray `font-display` label ("Record", "Last Game", …).
- Big values: `font-display` bold `text-phillies-navy`, ~`text-3xl` (record) / `text-xl` (scores).
- Record card subtitle: `1st NL East` when `gamesBack === '-'`, else `2nd NL East · 3.5 GB` (rank ordinal from `divisionRank`).
- Last Game: W in green / L in red (same colors as Schedule), opponent logo via existing `teamLogoUrl`, short date.
- Next Game: opponent logo + `vs`/`@` + name, `gameDate` formatted as weekday + local time; odds line (`ML −135`) in small gray when available; if the game is live, show the detailedState instead of the time.
- Team Leaders: three compact rows, each a 24px round headshot (`playerHeadshotUrl`, exists in `src/api/mlb.ts`), the stat label, the value in navy `font-display`, and the player's last name. Headshots get `onError` → hide, same pattern as Schedule's logos.

### Loading / error / empty states

- **Loading**: four skeleton cards (`animate-pulse` gray blocks at the same fixed height) so the layout doesn't jump — deliberately nicer than the text loaders used in the tabs; this strip is the first thing seen.
- **Any fetch fails**: the whole strip renders nothing (`return null`). It's a summary of data the tabs already expose, so failing invisible beats a persistent error banner above every tab. (Odds failure alone doesn't count — that's already caught to `[]`.)
- **Empty slots** (no games in window, no qualified leader): the individual card shows an em-dash placeholder; the strip still renders.

## Error Handling

No new error surfaces: HeroStrip fails to `null`, odds fail soft as today, headshot/logo images hide themselves via `onError`.

## Testing

No automated test runner. Verify with the `webapp-testing` skill:

- Header renders navy with pinstripes and red accent bar; nav tabs use the display font; active-tab underline still tracks clicks.
- HeroStrip shows all four cards with real data (record matches the Standings tab, last/next game match the Schedule tab, leader values match the sorted stat tables).
- Headshots render (or hide gracefully on 404).
- Odds line appears on the Next Game card only when there's a today game with odds (same condition as Schedule).
- All four tabs still render below the strip; row-click game-log modal unaffected.
- Zero console errors; screenshot each state reviewed visually.
- Simulate HeroStrip fetch failure (block `/api/mlb/standings*`) → strip disappears, tabs still work.

## Files Changed

- `package.json` — add `@fontsource/barlow-condensed`
- `src/index.css` — `@theme` tokens, `.bg-pinstripe` utility
- `src/main.tsx` — font imports
- `src/App.tsx` — cream background, render `<HeroStrip />`
- `src/components/Header.tsx` — navy/pinstripe/display-font restyle
- `src/components/Nav.tsx` — display-font tabs, tokenized colors
- `src/components/HeroStrip.tsx` — **new**
- `src/utils/odds.ts` — **new**, `getPhilliesOdds` moved from `Schedule.tsx`
- `src/components/Schedule.tsx` — import shared odds helper, tokenized colors
- `src/components/BattingTable.tsx`, `PitchingTable.tsx`, `Standings.tsx`, `GameLogModal.tsx`, `TrendChart.tsx` — token migration only
