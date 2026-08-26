# Routine: daily-beat-reporter

Writes a short Phillies beat-reporter briefing every morning into
`public/briefing.json`, deploys it to Vercel production, and commits it. The app
renders it via `src/components/DailyBriefing.tsx` as a collapsible card under the
HeroStrip.

**This file is the routine's live instructions.** The routine's own prompt is a
thin wrapper that tells the cloud agent to read this file from its checkout and
follow the "Prompt" section, so editing this file changes what the routine does
on its next run — no dashboard edit needed. Keep the routine's stored prompt
limited to invariants, or the two will drift.

**Routine:** `trig_01NEVfwEVHov4qXy2D7Wh4j8` ·
[manage](https://claude.ai/code/routines/trig_01NEVfwEVHov4qXy2D7Wh4j8) ·
daily at 12:00 UTC (≈8 AM ET), model `claude-sonnet-5`.

Because the agent reads this file from the checkout, a change only takes effect
once it is pushed to `develop`.

---

## Prerequisites (one-time, in the cloud environment)

The routine **cannot work in the stock Default environment.** This is set in the
environment dialog: on the routine's page click the pencil icon, click the cloud
icon showing the environment name, then the settings icon on hover.

**Network access → Custom.** `statsapi.mlb.com` is *not* in the Trusted
allowlist (it lists package registries, GitHub, and cloud SDKs — no third-party
REST APIs), so every data fetch would fail with `403 host_not_allowed`. Add:

```
statsapi.mlb.com
phillies-stats.vercel.app
```

`phillies-stats.vercel.app` covers the optional odds fetch (step 2, item 6) and the
post-push production check (step 7). No Vercel token or org/project IDs are
needed — deploy happens automatically when the routine pushes to `develop` (see
step 6), not via a CLI call, so there is nothing to authenticate.

---

## Prompt

Write today's Phillies briefing for the phillies-stats app.

### 1. Dates

Compute today's date in `America/New_York` (not UTC — night games would roll the
date over). All dates below are ET.

### 2. Gather data

Everything comes from `statsapi.mlb.com` (public, no key). Team id `143`, season
`2026` (matches `SEASON` in `src/api/mlb.ts` — bump both when the season turns).

1. **Schedule**, from 5 days ago through 3 days ahead:
   `/api/v1/schedule?sportId=1&teamId=143&startDate=<today-5>&endDate=<today+3>&hydrate=probablePitcher,decisions`
   - **Most recent completed game** = the last entry with `status.detailedState == "Final"`. Use this rather than "yesterday's game": off days and day games make yesterday unreliable.
   - **Next game** = the first non-Final entry dated today or later.
   - Each game's `gamePk` feeds the boxscore and linescore below.
2. **Boxscore** of the most recent completed game: `/api/v1/game/<gamePk>/boxscore`
   (this endpoint is `api/v1`; `api/v1.1` is the live feed).
3. **Linescore** of that same game: `/api/v1/game/<gamePk>/linescore` — inning-by-inning runs, for describing how the game actually turned.
4. **Standings:** `/api/v1/standings?leagueId=104&season=2026&standingsTypes=regularSeason`.
   The NL East is division id `204`; `division.name` is often absent, so match on the id.
5. **Season totals**, only if you cite one (e.g. "his 15th home run"):
   `/api/v1/stats?stats=season&group=hitting&teamId=143&season=2026&sportId=1&playerPool=all&limit=100`
6. **Odds** (optional): `https://phillies-stats.vercel.app/api/odds`. Omit the
   betting line if it returns non-200 or has no entry for the matchup — games
   more than a day out are usually not priced yet.

### 3. Accuracy rules — read before writing a word

The chat bot shipped a bug where it credited one player with another's box-score
line, including a player who never appeared in the game. Do not repeat it.

- **Every single-game stat must come from that game's boxscore.** Never from
  season stats, game logs, your own memory, or a web search.
- In the boxscore, `teams.{away,home}.players` lists the **whole 26-man roster**.
  A player with an empty `stats.batting` / `stats.pitching` object **did not play** —
  never mention them.
- **Describe how the game turned from the linescore**, not from intuition. Do not
  write "rallied", "held on", or "blew a lead" unless the inning-by-inning runs
  actually show it.
- Only cite a season total (home run number, ERA, record) that you fetched.
- If the most recent completed game is more than 2 days old (a long break), say so
  plainly instead of presenting it as fresh news.

### 4. Write the briefing

- **Headline:** one line, under ~60 characters, no clickbait.
- **Recap:** 2-3 short plain-text paragraphs, in this order:
  1. The most recent completed game — final score, how it turned, the batters and pitchers who actually decided it.
  2. Where the team stands: record, NL East position, games back, current streak.
  3. What's next — opponent, date, ET first-pitch time, probable starters, betting line if available. Mention an off day if there is one before the next game.
- Plain text only — no markdown, no emoji, no headings. The card renders the
  strings as-is.
- Neutral beat-reporter voice. No hype, no second-person address.
- If the team had no completed game in the lookback window (All-Star break, long
  layoff), lead with standings and the next game instead.

### 5. Write the file

Overwrite `public/briefing.json` with exactly this shape:

```json
{
  "date": "2026-07-30",
  "generatedAt": "2026-07-30T12:02:11Z",
  "headline": "Blown lead in Miami completes Marlins sweep",
  "recap": ["paragraph one", "paragraph two", "paragraph three"]
}
```

- `date` — the ET date the briefing is **for** (today). Drives the card's staleness check.
- `generatedAt` — ISO 8601 UTC with a `Z` suffix.
- `recap` — array of paragraph strings, at least one.

### 6. Commit and push — this is the deploy

```
git add public/briefing.json
git commit -m "briefing: YYYY-MM-DD"
git push origin develop
```

`public/briefing.json` is the only file this routine may touch. Never modify
anything else, and never open a PR.

**The push itself puts the briefing in front of users.** Vercel's Git integration
has `develop` set as this project's production branch, so a successful push
auto-triggers a Production deployment (confirmed in the Vercel dashboard's
deployment list, tagged "Production", built from the new commit) — no CLI step,
no token, nothing else to run. Deploys typically finish within ~20-30 seconds.

Cloud sessions guard pushes to branches outside `claude/`: a push to `develop` is
rejected if the branch is protected, someone else has an open PR from it, or it
carries commits authored by someone other than you (it does carry
`Claude <noreply@anthropic.com>` commits). **If the push is rejected, that IS a run
failure** — nothing reaches production without it. Push to
`claude/briefing-YYYY-MM-DD` instead so the work isn't lost, then report in the
run's final summary that the briefing was **not** published, and why.

### 7. Verify production picked it up

```
curl -s https://phillies-stats.vercel.app/briefing.json | head -5
```

The `date` in the response must be today's. The deploy build can still be running
right after the push — if the first check shows yesterday's `date`, wait a short
moment and check again before concluding the deploy failed. If it's still stale
after that, say so in the final summary rather than reporting success.

### 8. No push notifications

This routine must **never** call a notification tool (e.g. `PushNotification`) —
not on success, not on failure. The only report of what happened is the run's own
final text summary (step 9's three lines), which nobody's phone sees. This is
deliberate: the user reads this in the routine's run history when they choose to,
not as an interrupt.

### 9. When something goes wrong

If statsapi is unreachable, the boxscore is missing, or the data is too
incomplete to write an accurate briefing: **write nothing, commit nothing, push
nothing.** A missing briefing is better than a wrong one — the card hides itself
once the file ages out. Never push a briefing you could not verify against the
boxscore.

Do not retry a rejected push more than once. Report the failure in the final
summary — never via a notification tool (see step 8).

---

## Deployment behavior (read this before wondering why the card is missing)

- **Vercel production** (`phillies-stats.vercel.app`) is updated automatically when
  the routine's `git push origin develop` (step 6) lands — `develop` is this
  project's configured production branch, so the push itself is the deploy. There
  is no separate CLI step. Production is as fresh as the last successful push, so
  the card's 48h staleness cutoff should never hide it in production unless pushes
  have been failing.
- **k8s** (`phillies-stats.com`) serves a baked nginx image, so it shows the
  briefing only after `pipeline.sh` rebuilds the frontend — same as any other
  frontend change. k8s will therefore lag behind Vercel, and past 48h the card
  disappears there rather than showing an old briefing. That is intended.
- **Local dev** picks up `public/briefing.json` immediately; Vite serves
  `public/` live.

Because the push is the deploy, a rejected push is a real publish failure, not a
durability-only concern — there is no independent step 6 to fall back on anymore.
