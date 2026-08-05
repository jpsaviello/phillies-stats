# Design Spec: On This Day in Phillies History

## Goal

Add a second collapsible editorial card, alongside the existing `DailyBriefing`, that surfaces a notable Phillies game from today's calendar month/day in a past season. Content is produced by a new daily cloud routine that follows the same boxscore-verification discipline as `daily-beat-reporter` — every fact must trace back to a real game's boxscore/linescore, never model recall.

## Data Source

No new API/backend work. The client reads a new static file, `public/on-this-day.json`, the same way `DailyBriefing` reads `public/briefing.json` — `fetch('/on-this-day.json', { cache: 'no-cache' })`, no proxy involved. The file is written and committed by a new daily routine (registration out of scope for this spec/plan — see below).

The routine itself queries `statsapi.mlb.com` directly (bypassing the app's own `/api/mlb` proxy, same as `daily-beat-reporter` does), using the already-allowlisted `/schedule` and `/game/` path prefixes in `server/src/core.ts`'s `MLB_ALLOWED` — no server changes needed, since the routine never goes through the app's proxy anyway.

## JSON Schema — `public/on-this-day.json`

```json
{
  "date": "2026-08-05",
  "historicalDate": "1980-08-05",
  "generatedAt": "2026-08-05T12:15:00Z",
  "headline": "Schmidt's walk-off homer sinks the Expos in 1980 pennant chase",
  "recap": [
    "paragraph one",
    "paragraph two"
  ]
}
```

- `date` — the ET date this card was *generated for* (today, when the routine ran). Drives staleness the same way `Briefing.date` does for `DailyBriefing` — a `daysBehind(date, easternToday()) > MAX_AGE_DAYS` check hides the card if the routine has stopped running.
- `historicalDate` — the actual date the historical game happened (`YYYY-MM-DD`), which can be decades before `date`. This is the one concept `Briefing` doesn't need, since a beat-reporter recap's subject game and "today" are only a day apart; here they're intentionally far apart. Exposed as its own field so the UI can format it without parsing it out of prose.
- `generatedAt`, `headline`, `recap` — same shape/role as `Briefing`.

Type guard `isOnThisDay()` checks `date`/`historicalDate`/`headline` are strings and `recap` is a non-empty string array — a shape check only, matching `isBriefing`'s existing looseness (no semantic validation that `historicalDate` predates `date`, no check on `generatedAt`).

## Component Design — `OnThisDayCard.tsx`

Structurally identical to `DailyBriefing.tsx`:
- `useState<OnThisDay | null>` (no loading state — invisible or fully rendered) + `expanded: boolean`.
- Single mount `useEffect`: fetch → `isOnThisDay` guard → staleness check against `date` (not `historicalDate`, which is always old by design) → `.catch(() => setOnThisDay(null))`.
- Renders `null` entirely on any fetch/parse/stale failure — no wrapper div, no error UI.
- Same card chrome (`bg-white rounded-xl border border-gray-200 overflow-hidden`), same collapsible `<button aria-expanded>` pattern.
- Visually distinct from `DailyBriefing` so the two don't read as duplicates: different icon (🕰️ instead of 📰), label reads `On This Day — {year parsed from historicalDate}` instead of `Daily Briefing — {short date}`.
- Expanded body: same `max-w-3xl` prose treatment as `DailyBriefing`, maps `recap` to `<p>` tags; leads with the formatted historical date before the paragraphs.

### Shared date-utility extraction

`DailyBriefing.tsx` currently inlines `easternToday()`, `daysBehind()`, and a noon-anchor date formatter. Both cards now need identical staleness math and date formatting, so these get extracted to `src/utils/date.ts` (following the existing pattern of small shared helpers like `src/utils/odds.ts`):
- `easternToday()`, `daysBehind(a, b)`, `formatShortDate(date: string)` — moved verbatim, no generalization.
- `DailyBriefing.tsx` updated to import them (pure refactor, no behavior change).

## Placement

Mounted in `src/App.tsx` immediately after `DailyBriefing`, stacked below it — fully independent (own expand/collapse state, own self-hide-on-failure), matching how `HeroStrip`/`LiveGameStrip`/`DailyBriefing` already coexist as independent top-level widgets. Gated by a new LaunchDarkly flag `enableOnThisDay`, defaulted `true` via `useFlags()` destructuring — same kill-switch pattern as `enableDailyBriefing`.

## States

| State | Behavior |
|-------|----------|
| Loading | No loading UI — component renders `null` until the fetch resolves (matches `DailyBriefing`) |
| Missing file (404) | Renders `null` |
| Malformed JSON / wrong shape | Renders `null` (caught by `isOnThisDay` guard) |
| Stale (`date` more than `MAX_AGE_DAYS` behind today) | Renders `null` |
| Valid data | Collapsed card with headline; expands on click to show historical date + recap paragraphs |

## Out of Scope

- Registering the actual cron routine (via the `schedule` skill) and its stored prompt.
- Setting the new routine's cloud environment network allowlist — manual follow-up action.
- Creating the `enableOnThisDay` LaunchDarkly flag itself (via `launchdarkly-flag-create`).
- Postseason-game coverage — v1 searches regular season only (`/schedule` defaults to `gameType=R`).
- Any backend/proxy changes — `/schedule` and `/game/` are already allowlisted, and the routine calls `statsapi.mlb.com` directly anyway.
- Historical stats/standings beyond a single game's boxscore/linescore (no season-level historical stats needed for this feature).
