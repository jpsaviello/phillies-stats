# NL Wild Card Standings on Schedule Tab

**Date:** 2026-08-04

## Goal

Show the NL Wild Card race on the Schedule tab, so users can see the Phillies' postseason position alongside the game list without switching tabs.

## Data Source

MLB Stats API's `/standings` endpoint (already allowlisted in `server/src/core.ts` — `/standings` prefix, no backend change needed) supports `standingsTypes=wildCard`. For `leagueId=104` (NL) this returns a **single** record group — not split by division — containing every team in the league that is *not* a division leader (12 teams for a 15-team league), pre-sorted by `wildCardRank`.

Verified against the live API (season 2025 shape, `2026-08-04`):

```
GET https://statsapi.mlb.com/api/v1/standings?leagueId=104&season=2025&standingsTypes=wildCard
```

```json
{
  "records": [
    {
      "standingsType": "wildCard",
      "teamRecords": [
        {
          "team": { "id": 112, "name": "Cubs" },
          "wins": 92,
          "losses": 70,
          "wildCardRank": "1",
          "wildCardGamesBack": "+9.0",
          "clinchIndicator": "w"
        },
        ...
      ]
    }
  ]
}
```

Key fields used:
- `wildCardRank` — 1-indexed position in the wild card race (string)
- `wildCardGamesBack` — games back from the last playoff spot; `+N.O` for teams currently in, `-` for the WC leader on some formats, numeric string otherwise
- `clinchIndicator` — optional string (`"w"` = clinched wild card, `"y"` = clinched division/bye, etc.) — present only when clinched, otherwise absent
- `wins` / `losses` — same shape as regular standings

Since 2022 the NL sends the **top 3** wild card teams to the postseason. The response is already ranked, so the UI draws a divider after rank 3 to mark the cutoff line.

## API Changes (`src/api/mlb.ts`)

Add one exported function, following the existing `fetchStandings` pattern:

```ts
export async function fetchWildCardStandings() {
  const data = await get<{ records: { teamRecords: import('../types/mlb').WildCardRecord[] }[] }>(
    `/standings?leagueId=104&season=${SEASON}&standingsTypes=wildCard`
  )
  return data.records[0]?.teamRecords ?? []
}
```

No new backend route or allowlist entry required — `/standings` is already forwarded to `api/v1` for any query string.

## Type Changes (`src/types/mlb.ts`)

Add a new interface (kept separate from `StandingsRecord` since the field sets barely overlap and mixing optional wild-card-only fields into the division-standings type would make `Standings.tsx` harder to reason about):

```ts
export interface WildCardRecord {
  team: { id: number; name: string }
  wins: number
  losses: number
  wildCardRank: string
  wildCardGamesBack: string
  clinchIndicator?: string
}
```

## New Component: `src/components/WildCardStandings.tsx`

A compact, self-contained widget (owns its own fetch, same lifecycle pattern as `HeroStrip`/`DailyBriefing` — fails silently, no error banner) rendered above the game list in `Schedule.tsx`.

```
NL Wild Card Race
┌─────────────────────────────────────┐
│ #  Team              W   L   GB     │
│ 1  Cubs             92  70  +9.0    │
│ 2  Padres           90  72  +7.0    │
│ 3  Reds             85  77   —      │  ← in the playoff line
│ ── playoff cutoff ──────────────    │
│ 4  Mets              -   -   —      │
│ 5  Giants             ...           │
│ ...                                 │
└─────────────────────────────────────┘
```

- Rows 1–3 rendered normally (or with a subtle "in" tint, e.g. `bg-green-50`)
- A `<tr>` divider (thin border, no data) inserted between rank 3 and rank 4 to mark the cutoff
- The Phillies row (`team.id === PHILLIES_ID`) gets the same `bg-red-50 font-semibold` + red-dot treatment used in `Standings.tsx`, for visual consistency and to be findable regardless of rank
- `clinchIndicator` (when present) renders as a small badge/letter next to the team name (e.g. a `(w)` superscript or a small checkmark with title="Clinched wild card") — keep this minimal, it's a nice-to-have not a layout-critical element
- `wildCardGamesBack` displayed as-is (string) — no numeric parsing needed, matches how `Standings.tsx` already treats `gamesBack`

### Truncation

Showing all 12 teams keeps the Schedule tab focused on the schedule. Cap the rendered list to the top 7–8 teams (through a couple past the cutoff) unless the Phillies rank lower — in that case extend the list to include the Phillies' row so they're never scrolled off. Exact cutoff count is an implementation detail; the important constraint is: **the Phillies' row must always be visible**, even if that means showing more than 7 rows.

## Placement in `src/components/Schedule.tsx`

Render `<WildCardStandings />` once, above the existing `dates.map(...)` game list, inside the same `max-w-2xl` wrapper. It does not participate in the Schedule's own `loading`/`error` state — it manages its own loading/error/empty internally and renders nothing on failure (consistent with `HeroStrip`).

## Loading / Error / Empty States

| State | Behavior |
|-------|----------|
| Loading | Render nothing (avoid a layout-shifting skeleton for a secondary widget) — or a minimal one-line "Loading wild card standings…" placeholder, implementer's choice |
| Fetch error | Render nothing (fail silently, matches `HeroStrip`/`DailyBriefing` convention) |
| Empty response (`teamRecords` is empty) | Render nothing |

## Responsive

Same table layout as `Standings.tsx` — no special mobile treatment beyond what Tailwind's default table/text sizing already gives the existing Standings table on narrow viewports.

## Out of Scope

- AL Wild Card standings (Phillies are NL-only relevant)
- Adding this widget to the Standings tab (could be a future follow-up, not requested)
- Historical/past-date wild card standings (always current season, current date — same as `fetchStandings`)
- Magic number / elimination number display
- Any change to `server/src/core.ts` (no backend change needed)
