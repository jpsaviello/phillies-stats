# Schedule Page Team Logos

**Date:** 2026-06-30

## Goal

Display a small team logo next to each opponent's name on the Schedule page.

## Data Source

MLB.com serves cap logos at a predictable URL keyed by team ID. The `Game` type already includes `team.id` for both home and away sides, so no additional API calls are needed.

## Changes

### `src/api/mlb.ts`

Add a single exported helper:

```ts
export function teamLogoUrl(teamId: number): string {
  return `https://www.mlb.com/assets/images/teams/logos/team-cap-on-light/${teamId}.svg`
}
```

### `src/components/Schedule.tsx`

- Import `teamLogoUrl` from `../api/mlb`
- Derive `opponentId` from `game.teams.home.team.id` or `game.teams.away.team.id` (whichever is the opponent)
- Render an `<img>` between the "vs"/"@" cell and the opponent name:

```tsx
<img
  src={teamLogoUrl(opponentId)}
  alt={opponent}
  className="w-6 h-6 rounded-full shrink-0"
  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
/>
```

## Layout

Row order (unchanged except logo insertion):

```
[date]  [vs/@]  [logo]  [opponent name]  [score/status]
```

## Error Handling

If a logo URL fails to load (network error or unknown team ID), the `onError` handler hides the `<img>` element. The row falls back to text-only with no layout shift because the logo has fixed dimensions.

## Out of Scope

- Phillies logo (they appear implicitly on every game)
- Caching or local bundling of logos
- Logo for the Phillies themselves in the row
