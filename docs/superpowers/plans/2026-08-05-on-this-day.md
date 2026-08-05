# Implementation Plan: On This Day in Phillies History

Spec: `docs/superpowers/specs/2026-08-05-on-this-day-design.md`

## Confirmed Decisions

- Placement: `OnThisDayCard` mounts stacked directly below `DailyBriefing` in `App.tsx`, fully independent.
- Routine search depth: bounded to the **last 60 years** (~1966–present) when hunting for a candidate game on today's month/day.
- Shared date-utility extraction: `easternToday`, `daysBehind`, and the noon-anchor date formatter move from `DailyBriefing.tsx` to `src/utils/date.ts`.
- Component name: `OnThisDayCard`. LaunchDarkly flag: `enableOnThisDay`, defaulted `true`.
- Postseason games: out of scope for v1 (regular season only).
- Notability tie-break: prefer the most recent qualifying year among ties.

## Tasks

### Task 0: Design spec doc
Already written: `docs/superpowers/specs/2026-08-05-on-this-day-design.md`.

### Task 1: Extract shared date helpers
**Files:** create `src/utils/date.ts`; modify `src/components/DailyBriefing.tsx`

Move `easternToday()`, `daysBehind(a, b)`, and `formatShortDate(date: string)` (the `new Date(\`${date}T12:00:00\`).toLocaleDateString(...)` noon-anchor formatter) out of `DailyBriefing.tsx` verbatim into `src/utils/date.ts`. Update `DailyBriefing.tsx` to import them. Pure refactor — no behavior change expected.

**Verify:** `npx tsc --noEmit` clean; visually confirm `DailyBriefing` still renders identically.

### Task 2: Type + type guard
**Files:** `src/components/OnThisDayCard.tsx` (new)

```ts
interface OnThisDay {
  date: string           // ET date generated for (staleness anchor)
  historicalDate: string // YYYY-MM-DD of the actual historical game
  generatedAt: string
  headline: string
  recap: string[]
}

function isOnThisDay(data: unknown): data is OnThisDay { ... }
```

Shape-only validation (strings for `date`/`historicalDate`/`headline`, non-empty string array for `recap`) — matches `isBriefing`'s existing looseness. Define inline in the component file, same as `Briefing`/`isBriefing` live inline in `DailyBriefing.tsx` (this is an app-owned contract, not an MLB API response type — doesn't belong in `src/types/mlb.ts`).

### Task 3: Build `OnThisDayCard.tsx`
**Files:** `src/components/OnThisDayCard.tsx` (new)

Structurally identical to `DailyBriefing.tsx`:
- `useState<OnThisDay | null>` + `expanded`, single mount `useEffect` fetching `/on-this-day.json` with `{ cache: 'no-cache' }`.
- Staleness check: `daysBehind(data.date, easternToday()) > MAX_AGE_DAYS` (against `date`, never against `historicalDate`, which is always old by design).
- Renders `null` entirely on any fetch/parse/stale failure.
- Visually distinct from `DailyBriefing`: 🕰️ icon instead of 📰, label reads `On This Day — {year from historicalDate}` instead of `Daily Briefing — {short date}`. Same card chrome, same collapsible button pattern, same `max-w-3xl` expanded-body prose. Expanded body leads with the formatted historical date before the recap paragraphs.

**Verify:** `npx tsc --noEmit` clean.

### Task 4: Mount in `App.tsx`
**Files:** `src/App.tsx`

Add `const { enableOnThisDay = true } = useFlags()` alongside the existing `enableDailyBriefing` destructure. Mount `{enableOnThisDay && <OnThisDayCard />}` immediately after the `DailyBriefing` line.

**Verify:** `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.

### Task 5: Seed `public/on-this-day.json`
**Files:** `public/on-this-day.json` (new)

Query `statsapi.mlb.com`'s schedule/boxscore/linescore endpoints directly to find and hand-verify one real historical Phillies Aug-5 game (within the last 60 years). Write the file with today's `date`, the real `historicalDate`, and a headline/recap verified against that game's actual boxscore — not a plausible-sounding paragraph from memory. Mirrors `public/briefing.json` already carrying a real entry rather than a placeholder, so the card renders something true immediately instead of staying `null` until the first cron run.

### Task 6: Visual verification
Use the `webapp-testing` skill with both dev servers running (`npm run dev:server`, `npm run dev`). Confirm: seeded card renders collapsed with correct headline, expands on click to show historical recap, coexists cleanly with `DailyBriefing` stacked above it (both independently collapsible) at mobile and desktop widths, zero console errors. Don't wait on `networkidle` (`LiveGameStrip` polling never settles it) — use `domcontentloaded` + explicit selector waits.

### Task 7: Routine doc
**Files:** `docs/routines/on-this-day-reporter.md` (new)

Mirror `docs/routines/daily-beat-reporter.md`'s structure:
- Thin-wrapper convention note (the routine's stored prompt just points here — edit this doc to change behavior).
- Prerequisite: Custom network allowlist (`statsapi.mlb.com`, `phillies-stats.vercel.app`) on this routine's cloud environment (separate from `daily-beat-reporter`'s — needs its own setup).
- **Candidate search**: loop years `(today.year - 1)` down to `(today.year - 60)`, querying `/schedule?teamId=143&startDate=<year>-MM-DD&endDate=<year>-MM-DD` for today's exact month/day each year; collect every `Final` game found.
- **Notability ranking** (highest to lowest): no-hitter/perfect game thrown by or against the Phillies → walk-off win (linescore shows home team scoring the winning run in the bottom of the final inning) → extra innings (>9 innings) → blowout/shutout (run differential ≥ 8, or either team held to 0) → any other Final game as fallback (only fail closed when literally no completed game exists anywhere in the 60-year window for that date). Ties: prefer the most recent qualifying year.
- **Mandatory verification**: pull `/game/<gamePk>/boxscore` and `/game/<gamePk>/linescore` for the chosen candidate; every stated fact (names, stat lines, final score, narrative claims like "walked off" or "no-hit") must trace back to those two responses. Empty `stats.batting`/`stats.pitching` means that player didn't play — identical rule to `daily-beat-reporter`.
- **Commit-nothing rule**: if no Final game exists in the window, or the candidate's boxscore/linescore can't be fetched/verified — write nothing, commit nothing, push nothing, leave the previous day's still-valid file in place. "A missing card is better than a wrong one."
- **Deploy mechanism**: `git add public/on-this-day.json`, commit, `git push origin develop` (push IS the production deploy). On rejected push: fall back to `claude/on-this-day-YYYY-MM-DD`, report non-publication as a failed run, don't retry more than once. Verify via `curl https://phillies-stats.vercel.app/on-this-day.json`.
- State plainly: `public/on-this-day.json` is the only file this routine may touch.

### Task 8: `CLAUDE.md` update
**Files:** `CLAUDE.md`

- Add `OnThisDayCard` to the `src/components/` inventory bullet (self-hides on failure/stale, reads `public/on-this-day.json`, gated by `enableOnThisDay`).
- Add an "On this day" paragraph analogous to the existing "Daily briefing" paragraph, covering the `date` vs `historicalDate` distinction and staleness semantics.
- Mention `src/utils/date.ts` alongside the other `src/utils/` entries.
- Once the routine is registered with a routine ID, add a bullet under "Automated routines" analogous to the `daily-beat-reporter routine` one.

## Explicitly Out of Scope

- Registering the actual cron routine (via the `schedule` skill) and writing its thin stored prompt.
- Setting the new routine's cloud environment network allowlist to Custom.
- Creating the `enableOnThisDay` LaunchDarkly flag (via `launchdarkly-flag-create`).
- Postseason-game coverage.

## Verification Summary

1. `npx tsc --noEmit`, `npm run lint`, `npm run build` clean after each task.
2. `webapp-testing` pass per Task 6.
3. Manually spot-check the seeded `public/on-this-day.json` entry (Task 5) against the real MLB Stats API boxscore/linescore before committing.
4. After the routine is registered (follow-up), verify its first real run's committed JSON traces back to the actual boxscore it cites.

## Critical Files

- `src/components/DailyBriefing.tsx` — template being mirrored
- `src/components/OnThisDayCard.tsx` — new
- `src/utils/date.ts` — new
- `src/App.tsx` — mount point
- `public/on-this-day.json` — new, seeded
- `docs/routines/daily-beat-reporter.md` — template being mirrored
- `docs/routines/on-this-day-reporter.md` — new
- `CLAUDE.md` — documentation update
