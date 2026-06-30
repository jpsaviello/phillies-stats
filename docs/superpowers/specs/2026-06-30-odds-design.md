# Schedule Page Betting Odds

**Date:** 2026-06-30

## Goal

Display DraftKings moneyline and run line odds for upcoming Phillies games as a second line beneath each game row on the Schedule tab. Finished games are unaffected.

## Data Source

The Odds API (`https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/`) returns all upcoming MLB games with odds in a single call. Params: `regions=us`, `markets=h2h,spreads`, `bookmakers=draftkings`.

API key stored in `.env.local` as `VITE_ODDS_API_KEY`. The file is covered by the existing `*.local` gitignore rule and will not be committed.

## Caching

Odds are cached in `localStorage` under the key `phillies_odds_cache` as `{ timestamp: number, data: OddsGame[] }`. TTL is 30 minutes. On load, if a fresh cache entry exists it is used directly; otherwise a new fetch is made and the result stored. This keeps free-tier usage well within the 500 requests/month limit.

## Changes

### `src/api/mlb.ts`

Add a `OddsGame` type and two exports:

```ts
export interface OddsGame {
  id: string
  home_team: string
  away_team: string
  bookmakers: {
    markets: {
      key: 'h2h' | 'spreads'
      outcomes: { name: string; price: number; point?: number }[]
    }[]
  }[]
}

export async function fetchOdds(): Promise<OddsGame[]> {
  // check localStorage cache first (30 min TTL)
  // on miss: fetch from The Odds API, store result, return
}
```

### `src/components/Schedule.tsx`

- Fire `fetchSchedule()` and `fetchOdds()` in parallel via `Promise.all`. If odds fetch fails, treat as empty array (schedule still renders).
- After both resolve, build a `Map<string, OddsGame>` keyed by a `"${awayTeam}|${homeTeam}"` string for O(1) lookup.
- Match each MLB schedule game to an odds game by comparing both team names regardless of home/away order. For doubleheaders, match in order of appearance.
- For upcoming (non-finished) games with a match, render a second line beneath the opponent name:

```tsx
<div className="text-xs text-gray-400 mt-0.5">
  ML {formatOdds(ml)}  |  RL {point > 0 ? '+' : ''}{point} ({formatOdds(rlJuice)})
</div>
```

`formatOdds` formats American odds: positive values get a `+` prefix, negative are left as-is.

## Layout

```
Mon, Jun 30   @   [logo]   New York Mets        Scheduled
                           ML -145  |  RL -1.5 (-115)
```

The odds line is left-aligned under the opponent name, `text-xs`, `text-gray-400`. Only rendered for upcoming games that have a DraftKings odds match. No placeholder shown when odds are unavailable.

## Error Handling

- Odds fetch failure: caught silently, treated as empty array. Schedule renders normally without odds.
- No odds match for a game: odds line simply not rendered.
- `VITE_ODDS_API_KEY` missing: fetch will fail and be caught silently.

## Out of Scope

- Other bookmakers
- Totals (over/under)
- Historical odds
- Server-side API key proxying
