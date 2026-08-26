# Routine: on-this-day-reporter

Writes a short "on this day in Phillies history" card every morning into
`public/on-this-day.json`, deploys it to Vercel production, and commits it. The
app renders it via `src/components/OnThisDayCard.tsx` as a collapsible card
stacked under `DailyBriefing`.

**This file is the routine's live instructions.** The routine's own prompt is a
thin wrapper that tells the cloud agent to read this file from its checkout and
follow the "Prompt" section, so editing this file changes what the routine does
on its next run — no dashboard edit needed. Keep the routine's stored prompt
limited to invariants, or the two will drift.

**Routine:** `trig_01FRTs8tgq6MA8wRUY1XfrK7` ·
[manage](https://claude.ai/code/routines/trig_01FRTs8tgq6MA8wRUY1XfrK7) ·
daily at 13:00 UTC (≈9 AM ET), model `claude-sonnet-5`.

**Why 13:00 and not 12:00:** `daily-beat-reporter` fires at 12:00 UTC and ends by
pushing to `develop`. Two routines pushing the same branch at the same time race,
and the loser's push is rejected — which both docs correctly treat as a *failed
run*, not a retryable hiccup. The hour of separation keeps them from colliding.
If you ever re-time either routine, keep them apart for this reason.

Because the agent reads this file from the checkout, a change only takes effect
once it is pushed to `develop`.

---

## Prerequisites (one-time, in the cloud environment)

**Already satisfied — no action needed.** This routine runs in the
`phillies-stats` environment (`env_016wMSZpYCdfkt239tXPmaHN`), the *same*
environment as `daily-beat-reporter`, which already has Network access set to
Custom with the hosts below allowlisted.

The routine **cannot work in the stock Default environment.** `statsapi.mlb.com`
is *not* in the Trusted allowlist (it lists package registries, GitHub, and cloud
SDKs — no third-party REST APIs), so every data fetch would fail with
`403 host_not_allowed`. The required hosts are:

```
statsapi.mlb.com
allthingsphils.com
```

`allthingsphils.com` is the custom domain now fronting production (it replaced
`phillies-stats.vercel.app` — same Vercel deployment, different hostname) and
covers the post-push production check (step 7). No Vercel token or
org/project IDs are needed — deploy happens automatically when the routine
pushes to `develop` (see step 6), not via a CLI call.

Allowlists are per-environment and are **not** inherited between environments, so
if this routine is ever moved to a different environment, the hosts above have to
be re-added there. To edit: on the routine's page click the pencil icon, click the
cloud icon showing the environment name, then the settings icon on hover.

---

## Prompt

Write today's "on this day in Phillies history" card for the phillies-stats app.

### 1. Dates

Compute today's date in `America/New_York` (not UTC — a run near midnight would
otherwise pick the wrong calendar day). Extract today's **month and day**; the
year is irrelevant except as the top of the search range.

### 2. Find candidate games

Everything comes from `statsapi.mlb.com` (public, no key). Team id `143`.

Search the **last 60 seasons** — years `today.year - 1` down to
`today.year - 60`. Skip the current year: today's own game is `DailyBriefing`'s
job, not this card's.

For each year, query that year's same month/day:

```
/api/v1/schedule?sportId=1&teamId=143&startDate=<year>-MM-DD&endDate=<year>-MM-DD&hydrate=linescore
```

Collect every game with `status.abstractGameState == "Final"`. Notes:

- Most years return exactly one game, but **doubleheaders return two** and some
  years return none (off day, All-Star break, strike-shortened season). Both are
  normal.
- A returned game can have `null` scores (e.g. a postponed 2020 entry). Skip any
  game without a real final score.
- This is ~60 cheap single-day queries. Do not widen the range to full franchise
  history: older boxscores are thinner and much harder to verify cleanly, which
  is the whole risk this routine is built to avoid.
- Regular season only. `/schedule` defaults to `gameType=R`, which is what we
  want — postseason coverage is deliberately out of scope for now.

### 3. Rank by notability

Score the candidates in this order and take the best one:

1. **No-hitter or perfect game** thrown by or against the Phillies — check the
   linescore's `teams.{away,home}.hits`, not the runs.
2. **Walk-off win** — the Phillies are the home team and scored the winning run
   in the bottom of the final inning. Confirm from the linescore's
   inning-by-inning `innings[]`, never from the final score alone.
3. **Extra innings** — `currentInning > 9`.
4. **Blowout or shutout** — run differential ≥ 8, or either team held to 0.
5. **Anything else.** If no candidate hits tiers 1-4, pick a plain Final game
   anyway. Notability is a *ranking* among real games, not a filter that may
   return nothing while games plainly exist.

Ties within a tier: **prefer the most recent qualifying year.** Older boxscores
are likelier to have gaps.

### 4. Verify the chosen game — read before writing a word

Pull both endpoints for the winning candidate's `gamePk`:

- `/api/v1/game/<gamePk>/boxscore` (this endpoint is `api/v1`; `api/v1.1` is the
  live feed)
- `/api/v1/game/<gamePk>/linescore`

And, when describing *how* a run scored, `/api/v1/game/<gamePk>/playByPlay`.

Accuracy rules, all non-negotiable:

- **Every single-game stat must come from that game's boxscore.** Never from
  season stats, game logs, your own memory, or a web search.
- In the boxscore, `teams.{away,home}.players` lists the **whole roster**. A
  player with an empty `stats.batting` / `stats.pitching` object **did not play** —
  never mention them.
- **Describe how the game turned from the linescore and play-by-play**, not from
  intuition. Do not write "rallied", "walked off", or "blew a lead" unless the
  inning-by-inning runs actually show it.
- **Do not infer a runner situation.** "Bases loaded", "two on", "from second"
  are play-by-play facts. The boxscore's RBI column does not tell you who was on
  base or where they scored from.
- **Check walks before calling anything perfect or clean.** A pitcher with 0
  hits allowed and 1 walk did not throw perfect innings — "hitless" is the
  accurate word.
- **Do not claim a relief order you did not read.** The boxscore's
  `teams.<side>.pitchers[]` array is in appearance order; use it before saying
  who started, who finished, or who "set up" anything.
- **Do not state game duration.** The endpoints above do not carry a reliable
  elapsed time, so "a five-hour marathon" is a guess, not a fact.
- Only cite a season total (e.g. "his 17th home run") if the play-by-play or
  boxscore actually carries it.

### 5. Write the file

Overwrite `public/on-this-day.json` with exactly this shape:

```json
{
  "date": "2026-08-05",
  "historicalDate": "2014-08-05",
  "generatedAt": "2026-08-05T12:02:11Z",
  "headline": "Howard's 15th-inning single walks off the Astros",
  "recap": ["paragraph one", "paragraph two", "paragraph three"]
}
```

- `date` — the ET date the card is **for** (today). Drives the card's staleness
  check.
- `historicalDate` — the date the game actually happened, `YYYY-MM-DD`. The card
  shows its year in the header and the full date above the recap, so **don't
  repeat the year in the headline.**
- `generatedAt` — ISO 8601 UTC with a `Z` suffix.
- `recap` — array of paragraph strings, at least one; 2-3 short ones is the
  target. Suggested order: how the game was decided → the starting pitching
  matchup → the supporting performance (bullpen, big offensive line).

Plain text only — no markdown, no emoji, no headings. The card renders the
strings as-is. Neutral beat-reporter voice, past tense, no hype, no
second-person address. Headline: one line, under ~60 characters.

### 6. Commit and push — this is the deploy

```
git add public/on-this-day.json
git commit -m "on this day: YYYY-MM-DD"
git push origin develop
```

`public/on-this-day.json` is the only file this routine may touch. Never modify
anything else, and never open a PR.

**The push itself puts the card in front of users.** Vercel's Git integration has
`develop` set as this project's production branch, so a successful push
auto-triggers a Production deployment — no CLI step, no token, nothing else to
run. Deploys typically finish within ~20-30 seconds.

Cloud sessions guard pushes to branches outside `claude/`: a push to `develop` is
rejected if the branch is protected, someone else has an open PR from it, or it
carries commits authored by someone other than you (it does carry
`Claude <noreply@anthropic.com>` commits). **If the push is rejected, that IS a run
failure** — nothing reaches production without it. Push to
`claude/on-this-day-YYYY-MM-DD` instead so the work isn't lost, then report in the
run's final summary that the card was **not** published, and why.

### 7. Verify production picked it up

```
curl -s https://allthingsphils.com/on-this-day.json | head -5
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

If statsapi is unreachable, no completed game exists anywhere in the 60-year
window for today's month/day, or the chosen game's boxscore/linescore can't be
fetched or verified: **write nothing, commit nothing, push nothing.** A missing
card is better than a wrong one. Yesterday's file stays in place and keeps
serving until it ages out of the card's staleness window on its own — that
degradation is intended, so do not overwrite a good card with a worse one just to
have written something.

Never push a card you could not verify against the boxscore. Do not retry a
rejected push more than once. Report the failure in the final summary — never via
a notification tool (see step 8).

---

## Deployment behavior (read this before wondering why the card is missing)

- **Vercel production** (`allthingsphils.com`, the custom domain in front of the
  Vercel deployment — no longer `phillies-stats.vercel.app`) is updated automatically when
  the routine's `git push origin develop` (step 6) lands — `develop` is this
  project's configured production branch, so the push itself is the deploy.
  Production is as fresh as the last successful push, so the card's staleness
  cutoff should never hide it there unless pushes have been failing.
- **k8s** (`phillies-stats.com`) serves a baked nginx image, so it shows the card
  only after `pipeline.sh` rebuilds the frontend. k8s will therefore lag behind
  Vercel, and past the cutoff the card disappears there rather than showing an
  old one. That is intended.
- **Local dev** picks up `public/on-this-day.json` immediately; Vite serves
  `public/` live.

Because the push is the deploy, a rejected push is a real publish failure, not a
durability-only concern.
