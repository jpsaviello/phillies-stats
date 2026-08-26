# Phillies Stats

A personal project — a stats site for the Philadelphia Phillies. Batting/pitching leaders, standings (with a real wild-card tiebreaker calculation), schedule with live odds, a daily AI-written beat report, an "on this day" historical card, pregame matchup previews, bullpen workload tracking, and a Claude-powered chat bot you can ask about the team. Built almost entirely with [Claude Code](https://claude.com/claude-code).

**Live site: [allthingsphils.com](https://allthingsphils.com/)**

<img width="1686" height="1002" alt="Phillies Stats screenshot" src="https://github.com/user-attachments/assets/0f62af44-dad8-4b2e-b56a-273650de7c74" />

## Features

- **Batting & Pitching tables** — sortable season stats, click a player row for a game log modal (last 10 games, rolling trend chart, situational splits vs LHP/RHP and home/away)
- **Standings** — NL East table plus a wild-card race table with an actual head-to-head/intradivision tiebreaker implementation (MLB's API doesn't apply real tiebreakers, so this app does)
- **Playoff Push** — wild card and division position, magic/elimination numbers, games left, strength of remaining schedule, pace projection
- **Schedule** — upcoming/past games with live betting odds (moneyline + run line) for the next game
- **Matchup Preview** — pregame probable-starter comparison (season lines, last-3-starts, head-to-head) for the next scheduled game
- **Bullpen Usage** — trailing 7-day reliever/rotation workload: appearances, pitch counts, days of rest, "3 straight days" style flags
- **Live Game Strip** — score, inning, count, and current matchup while a Phillies game is in progress
- **Daily Briefing** & **On This Day** — auto-generated cards written by scheduled AI routines each morning, sourced only from verified box scores
- **Chat bot** — ask questions about the Phillies; a Claude tool-use agent that pulls real stats, schedules, box scores, and odds (with web search as a fallback) rather than guessing
- **Accounts** — email/password sign-in, favorite players ("star" a player, see them in a "Your Players" card), and a profile (avatar, hometown, fan-since, notification prefs)

## Tech Stack

- **Frontend:** React 19 + TypeScript, Vite, Tailwind CSS v4
- **Backend:** Node + [Hono](https://hono.dev/), a thin proxy in `server/` that holds all API keys and never exposes them to the client
- **Data sources:** the public [MLB Stats API](https://statsapi.mlb.com), [The Odds API](https://the-odds-api.com/), the [Anthropic API](https://www.anthropic.com/api) (chat bot + the two daily routines)
- **Database:** Postgres (Neon) for accounts, sessions, and favorites
- **Feature flags:** LaunchDarkly
- **Linting:** Oxlint

## Running Locally

Requires **two** servers running at once:

```bash
npm install
npm --prefix server install

npm run dev:server   # backend proxy on :8080 — needed for any data to load
npm run dev          # frontend dev server with HMR (proxies /api to :8080)
```

Then open the URL Vite prints (typically `http://localhost:5173`).

Other commands:

```bash
npm run build     # type-check then bundle (tsc -b && vite build)
npm run lint       # Oxlint
npm run preview    # serve the production build locally
```

Optional local env vars (`.env.local`, gitignored) unlock extra features — the app degrades gracefully without them:

| Var | Enables |
|---|---|
| `ODDS_API_KEY` | Betting odds on the Schedule tab |
| `ANTHROPIC_API_KEY` | The chat bot |
| `DATABASE_URL` | Sign-in, favorites, profiles |

No automated test runner is configured; features are verified with a Playwright-based browser-testing workflow instead.

## Deployment

Runs in two places simultaneously:

- **Vercel** — production, auto-deployed on every push to `develop`
- **Local Kubernetes** (Docker Desktop) — deployed manually via `pipeline.sh`; also runs Prometheus/Grafana monitoring

<img width="1677" height="977" alt="Grafana monitoring dashboard" src="https://github.com/user-attachments/assets/676a5926-06a2-4159-be96-43b003284404" />
