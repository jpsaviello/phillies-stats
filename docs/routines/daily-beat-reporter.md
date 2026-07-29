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

The routine **cannot work in the stock Default environment.** Both items below are
set in the environment dialog: on the routine's page click the pencil icon, click
the cloud icon showing the environment name, then the settings icon on hover.

**1. Network access → Custom.** `statsapi.mlb.com` is *not* in the Trusted
allowlist (it lists package registries, GitHub, and cloud SDKs — no third-party
REST APIs), so every data fetch would fail with `403 host_not_allowed`. Add, with
**"Also include default list of common package managers" checked** so `npx` can
still reach the npm registry:

```
statsapi.mlb.com
api.vercel.com
*.vercel.com
phillies-stats.vercel.app
```

**2. Environment variables** (`.env` format, one per line):

```
VERCEL_TOKEN=<a Vercel token scoped to this project>
VERCEL_ORG_ID=team_dwcpMVXafZurT7ButbANP6XY
VERCEL_PROJECT_ID=prj_tf2D9AbMpo3rVApPbzjwwfkPw15X
```

The two IDs are needed because `.vercel/` is gitignored, so the cloud checkout has
no project link and the CLI would otherwise try to create a new project. They are
identifiers, not secrets.

`VERCEL_TOKEN` **is** a secret, and cloud environments have **no secrets store** —
the dialog warns that anyone who uses the environment can read its variables. For a
personal environment that means only you, which is why this is acceptable here.
Scope the token to this one project and rotate it if the environment is ever
shared. Create one at <https://vercel.com/account/settings/tokens>.

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

### 6. Deploy to production

**This step is what actually puts the briefing in front of users** — the git push
in step 7 does not deploy anything. Deploy the working directory, which now
contains the new `public/briefing.json`, straight to Vercel production:

```
npx vercel deploy --prod --yes --token="$VERCEL_TOKEN"
```

`VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` from the environment tell the CLI which
project this is, so it links non-interactively instead of creating a new one.
`--yes` skips the confirmation prompt; there is no TTY.

This is a fresh production build, the same thing `npx vercel --prod` does by hand,
so it picks up the project's **production** environment variables (the Anthropic
and odds keys). Do not use `vercel promote` on a preview deployment instead: that
publishes a build made with preview-scoped variables.

Note this deploys whatever is on `develop` at run time, not just the briefing. That
is the same branch the project is deployed from by hand, so it is expected — but if
the build fails, report it and do not treat the run as successful.

Verify afterwards that production is serving the new file:

```
curl -s https://phillies-stats.vercel.app/briefing.json | head -5
```

The `date` in the response must be today's. If the deploy succeeded but the file is
stale, say so in the notification rather than reporting success.

### 7. Commit for durability

```
git add public/briefing.json
git commit -m "briefing: YYYY-MM-DD"
git push origin develop
```

`public/briefing.json` is the only file this routine may touch. Never modify
anything else, and never open a PR.

Cloud sessions guard pushes to branches outside `claude/`: a push to `develop` is
rejected if the branch is protected, someone else has an open PR from it, or it
carries commits authored by someone other than you (it does carry
`Claude <noreply@anthropic.com>` commits). **If the push is rejected, that is not a
run failure** — production is already updated by step 6. Push to
`claude/briefing-YYYY-MM-DD` instead and note it in the notification so the commit
can be picked up by hand.

### 8. Notify

Send one push notification per run: the headline plus a one-line score (for example
`PHI 6, MIA 8 (L)`). Mention it if the deploy failed or the commit had to go to a
`claude/` branch.

### 9. When something goes wrong

If statsapi is unreachable, the boxscore is missing, or the data is too
incomplete to write an accurate briefing: **write nothing, deploy nothing, commit
nothing.** A missing briefing is better than a wrong one — the card hides itself
once the file ages out. Never deploy a briefing you could not verify against the
boxscore.

Do not deploy on a failed build or a failed data fetch, and do not retry a failing
deploy more than once. Notify to report the failure, matching the
auto-merge-branches convention of never notifying about a no-op.

---

## Deployment behavior (read this before wondering why the card is missing)

- **Vercel production** (`phillies-stats.vercel.app`) is updated by the routine
  itself, in step 6, with `npx vercel deploy --prod`. The git push does **not**
  deploy: a push to `develop` only refreshes the *preview* URL, because Vercel's
  production branch is not `develop`. So production is as fresh as the last
  successful routine run, and the card's 48h staleness cutoff should never hide it
  in production unless runs have been failing.
- **k8s** (`phillies-stats.com`) serves a baked nginx image, so it shows the
  briefing only after `pipeline.sh` rebuilds the frontend — same as any other
  frontend change. k8s will therefore lag behind Vercel, and past 48h the card
  disappears there rather than showing an old briefing. That is intended.
- **Local dev** picks up `public/briefing.json` immediately; Vite serves
  `public/` live.

Because step 6 deploys the working directory, production stays current even if the
step 7 push is rejected. The two steps fail independently on purpose.
