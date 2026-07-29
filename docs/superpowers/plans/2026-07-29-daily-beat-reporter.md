# Daily Beat Reporter agent

## Context

The user wants an agent that ties into phillies-stats. Chosen concept (via Q&A): a **Daily Beat Reporter** — a scheduled Claude routine that runs every morning, gathers yesterday's result + box score, standings movement, and today's matchup + odds, writes a short narrative briefing, publishes it into the app, and sends a push notification. Decisions made with the user:

- **Runtime:** Claude Code scheduled cloud routine (cron), like the existing auto-merge-branches routine — no new infrastructure, no Anthropic API key spend (uses plan credits).
- **Storage/publish path:** the routine commits `public/briefing.json` to the repo and pushes — Vercel auto-deploys on push (zero new secrets, durable). The k8s frontend lags until the next `pipeline.sh` run, same as every frontend change (accepted; local cluster is a dev mirror).
- **Delivery:** push notification with headline + score (Gmail integration is drafts-only, so email was dropped).
- **UI:** collapsible narrative card mounted below `HeroStrip` on every tab — headline always visible, tap to expand the full recap.

## Deliverables

### 1. Briefing data contract — `public/briefing.json`

Served statically at `/briefing.json` (public/ already serves favicon.svg at root; the `vercel.json` rewrite only captures `/api/:path*`, so statics pass through untouched).

```json
{
  "date": "2026-07-30",            // ET date the briefing is FOR (drives staleness)
  "generatedAt": "2026-07-30T12:02:11Z",
  "headline": "Turner's big night not enough as Phils drop series opener",
  "recap": [
    "paragraph 1 …",
    "paragraph 2 …"
  ]
}
```

Seed the file during implementation with a real hand-written briefing from today's actual data (use the same statsapi endpoints the chat tools hit) so the UI is verifiable immediately and there's a committed example of the contract.

### 2. Frontend — `src/components/DailyBriefing.tsx` (new), `src/App.tsx` (one-line mount)

- Mount in `App.tsx` directly below `<HeroStrip />`, above `<Nav …>` (src/App.tsx:33-34). Outside tab conditionals like the other strips.
- `useEffect` fetch of `/briefing.json` with `{ cache: 'no-cache' }` (forces etag revalidation so a fresh morning push isn't masked by browser cache). Follow the HeroStrip fail-soft pattern: any fetch/parse failure → render nothing.
- **Staleness rule:** render nothing when `date` is more than 48h behind today (computed in `America/New_York`, same idiom as `server/src/chat.ts` `buildSystemPrompt`). A missed routine run must not show last week's recap as news.
- Collapsed by default: one row with a 📰 glyph, "DAILY BRIEFING — {date}", the headline, and a chevron; click toggles the `recap` paragraphs. Plain `useState`, no persistence.
- Styling: existing Tailwind theme tokens (`bg-phillies-navy`, `text-phillies-red`, `font-display`) — no new hex values, per repo convention.
- Types: local `interface Briefing` in the component file (it's not an MLB API shape, so it doesn't belong in `src/types/mlb.ts`); the canonical contract lives in the routine doc (below).

### 3. Routine definition — `docs/routines/daily-beat-reporter.md` (new)

Source-of-truth prompt for the routine, checked into the repo (new `docs/routines/` dir). Contents:

- **Schedule:** daily, 12:00 UTC (~7-8 AM ET year-round).
- **Steps:**
  1. Compute yesterday/today in `America/New_York`.
  2. Fetch from `statsapi.mlb.com/api/v1` (public, free): schedule for yesterday+today (`hydrate=probablePitcher,decisions`, teamId 143), boxscore for yesterday's `gamePk` (`/game/{pk}/boxscore` — v1, not v1.1), NL standings (`leagueId=104`). Odds from the deployed site's public `https://phillies-stats.vercel.app/api/odds` (shares the 30-min cache; if it 503s, omit odds).
  3. Write the briefing: headline + 2-3 short plain-text paragraphs — last game's story naming actual player lines from the boxscore only (never invent a line; a player absent from the boxscore didn't play), standings movement, tonight's matchup/probables/line. Off-day yesterday → lead with standings + tonight instead.
  4. Overwrite `public/briefing.json` per the contract above; commit with message `briefing: YYYY-MM-DD` and push to the branch Vercel production deploys from.
  5. Push notification: headline + final score one-liner.
  6. Failure rule: if statsapi is unreachable or data is incomplete, do NOT push a malformed/guessy briefing — skip the commit, notify only on error (mirrors the auto-merge-branches "silent no-op" convention in CLAUDE.md).

### 4. Create the routine

Via the `schedule` skill, prompt sourced from the doc in #3. **Before creating it, confirm which branch Vercel production tracks** (`npx vercel project inspect` / dashboard, or check recent deploy commits) — likely `develop`, but the routine must push to whatever branch actually triggers the production deploy.

### 5. Docs

- CLAUDE.md: short additions — `DailyBriefing` in the components list (fail-soft + 48h staleness rule), `public/briefing.json` as routine-written (never hand-edit; contract in docs/routines/), and a bullet under "Automated routines" for daily-beat-reporter (silent-skip failure rule, pushes to the Vercel production branch).
- `.superpowers/sdd/progress.md`: append a ledger entry when done.

## Non-changes
- No backend (`server/`, `api/`) changes at all — the briefing never touches `/api/*`.
- No new secrets or env vars.

## Verification
1. `npm run build` + `npm run lint`.
2. **webapp-testing** (free): with the seeded `briefing.json`, drive the app headless — card renders below HeroStrip on every tab, expands/collapses, zero console errors, screenshot. Then edit the seed's `date` to 3 days ago and confirm the card disappears (Vite serves `public/` live in dev). Restore the seed.
3. Routine dry-run: after creating the routine, trigger one manual run; confirm (a) a `briefing: YYYY-MM-DD` commit lands on the deploy branch with valid JSON naming only players who actually played (cross-check the boxscore), (b) the push notification arrives, (c) the Vercel deploy picks it up and `https://phillies-stats.vercel.app/briefing.json` serves the new file.
4. Deploy notes: Vercel is automatic on push; k8s frontend shows the card only after the user runs `pipeline.sh`. User stages/commits the implementation itself, per their git rules.
