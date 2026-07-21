# SDD Progress Ledger

Merge base: 71e7c2c
Plan: docs/superpowers/plans/2026-06-30-odds.md

Task 2: complete (commits 71e7c2c..776a808, review clean)
Task 3: complete (commits 776a808..19d4444, review clean)
Minor: bookmakers[0] assumed DraftKings -- no self-enforcing guard
Warning: team name matching between Odds API and MLB API unverifiable until runtime
Fix: corrupted cache bug (882424a, review confirmed)
Minor (accepted): doubleheader odds dedup, whitespace collapse in odds separator, in-progress games show cached odds during 30-min window
All tasks complete.
# Progress Ledger: all-star-banner

Task 1: complete (uncommitted working-tree diff, base a7ff632, review clean — Approved, 2 Minor nits only)
Task 2: complete (uncommitted working-tree diff, CLAUDE.md, review clean — Approved, no issues)
All tasks complete.
# Progress Ledger: player-game-log

Plan: docs/superpowers/plans/2026-07-07-player-game-log.md
Base: 860dd54

Task 1: complete (uncommitted working-tree changes, review clean)
Task 2: complete (uncommitted working-tree changes, review clean)
  - Note: fixed a Task-1 bug found during verification -- GameLogOpponent shape (types/mlb.ts) was nested {team:{id,name}}, live API returns flat {id,name}. Verified via grep, only consumer updated (GameLogModal.tsx). Reviewer confirmed fix is correct and complete.
  - Minor carried to Task 3: GameLogModal.tsx colSpan={9} on empty-state row is hitting-only (9 cols); pitching has 8 cols. Inert until Task 3 wires group="pitching". Fix as part of Task 3.
Task 3: complete (uncommitted working-tree changes, review clean -- colSpan fix verified correct: 9 for hitting, 8 for pitching)
All tasks complete.
Final whole-branch review: Ready to merge = Yes. No Critical/Important issues; 5 Minor notes (all accepted, none blocking).
# Progress Ledger: game-log-trends

Plan: docs/superpowers/plans/2026-07-09-game-log-trends.md
Base: 08fb428

Task 1: complete (uncommitted working-tree changes; fetchGameLog now returns full season chronological, modal derives last-10, CLAUDE.md updated)
Task 2: complete (src/utils/trends.ts; math spot-checked against live API — final ERA matches season ERA 5.87 for Nola, cum HR matches season total 11 for Bohm)
Task 3: complete (src/components/TrendChart.tsx; palette validated via dataviz skill, all checks pass)
Task 4: complete (toggle + chart wired into GameLogModal; verified end-to-end with webapp-testing, screenshots reviewed, no console errors)
  - Bug found & fixed during visual review: niceTicks could stop below the data max, clipping the line outside the plot (seen on a 6.52 ERA vs 5.00 top tick). Loop now extends until top tick >= max; re-verified.
  - Polish from visual review: partial first-month label dropped when it crowds the next ("Mar"/"Apr" collision); tooltip text given a white halo (paintOrder=stroke) so the line can't strike through it.
All tasks complete.
# Progress Ledger: api-proxy

Plan: docs/superpowers/plans/2026-07-10-api-proxy.md
Base: 867d812

Task 1: complete (server/ scaffold — Hono basePath /api, /health; verified via tsx and tsc-built output. Note: local node 26 rejects --env-file-if-missing, dev script uses --env-file=../.env.local so .env.local is required for dev)
Task 2: complete (/api/mlb/* allowlisted passthrough; standings 200 matches upstream, /api/mlb/evil 403)
Task 3: complete (/api/odds — key from ODDS_API_KEY, 30-min in-memory cache; first call 0.66s upstream, second <1ms cached, keyless 503; .env.local migrated from VITE_ODDS_API_KEY to ODDS_API_KEY)
Task 4: complete (BASE=/api/mlb, fetchOdds → /api/odds, localStorage cache + import.meta.env removed; vite server+preview proxy; CLAUDE.md updated; build+lint clean; bundle grep clean — no upstream hosts/key; webapp-testing: all 4 tabs render through proxy, odds line visible for today's Tigers game, zero console errors)
Task 5: complete (server/Dockerfile two-stage + .dockerignore; root Dockerfile VITE_ODDS_API_KEY ARG/ENV removed; both images build; api container smoke: health 200, keyless odds 503, mlb 200)
Task 6: complete (manifests kustomize-validated; user restarted Docker Desktop k8s, created secret phillies-stats-odds with rotated key, and deployed — both pods Running)
Task 7: complete (key rotated by user; ingress curls all pass: health 200, roster JSON, odds 200 cached 0.27s->0.005s, /api/mlb/evil 403, / serves index.html; served bundle contains no key/upstream hosts; browser check via Playwright at phillies-stats.com — all 4 tabs render, odds line live for today's Tigers game, zero console errors)
All tasks complete.
# Progress Ledger: ops-trend

Plan: docs/superpowers/plans/2026-07-14-ops-trend.md
Spec: docs/superpowers/specs/2026-07-14-ops-trend-design.md (approved — user chose trend pill over table column)

Key finding from spec research: gameLog per-game stat.ops is season-to-date (verified vs official formula, .001 rounding), so the helper parses it rather than recomputing.

Task 1: complete (uncommitted working-tree changes; ops on BattingGameStat + opsProgression in trends.ts; build+lint clean; spot-check vs live API — last point .862 equals Harper's season OPS .862, 88 points starting 2026-04-06)
Task 2: complete (OPS pill in TREND_STATS.hitting; build+lint clean; webapp-testing verified — batting modal shows 3 pills, OPS chart end label .862 matches Harper's OPS column in the table, hover tooltip works, pitching modal still exactly 2 pills, zero console errors; screenshots reviewed)
Post-ship finding (accepted as designed): traded players' chart OPS is full-season (gameLog spans prior team; endpoint ignores teamId) and can differ from the table's Phillies-only OPS — e.g. Derek Hill .749 vs .890. User decided to keep full-season scope; documented in spec + trends.ts comment. Same scope as all other trends and the last-10 table.
All tasks complete.
# Progress Ledger: visual-refresh

Plan: docs/superpowers/plans/2026-07-15-visual-refresh.md
Base: 07c66e4
Execution mode: multi-agent (implementation subagents per task, separate review + webapp-testing agents)

Task 1: complete (subagent; uncommitted working-tree changes — @fontsource/barlow-condensed installed, @theme tokens + .bg-pinstripe in index.css, font imports in main.tsx, 7 components migrated to token utilities, TrendChart keeps SVG hex literal w/ comment; build+lint clean; grep E81828 hits only index.css + TrendChart)
Task 2: complete (subagent, ran parallel w/ Task 3; navy pinstriped Header + red accent + display font, Nav tab restyle, App bg-phillies-cream; build+lint clean, no deviations)
Task 3: complete (subagent, ran parallel w/ Task 2; getPhilliesOdds moved verbatim to src/utils/odds.ts, Schedule.tsx imports it; build+lint clean, no deviations)
Task 4: complete (subagent; HeroStrip.tsx + App.tsx wiring; build+lint clean. Accepted deviation: pre-game detection via ['Scheduled','Pre-Game','Warmup'] list so Delayed/Postponed/Suspended show state text instead of a misleading time)
Review: complete (separate review agent; verdict no Critical/Important code issues. Verified: token migration pure rename, restyles match plan, odds extraction verbatim, fail-to-null airtight, date/edge cases clean. 2 Minor findings fixed by Task-4 agent: nextGame now prefers first non-Final dated today+ (stale postponed game can't hog the card), leader thresholds floored at 1 AB / 1 IP for teamGames=0; build+lint re-verified clean)
Task 5: complete (verification agent; webapp-testing PASS on all 7 checks — computed styles confirm navy #002D72 pinstriped header + #E81828 accent + Barlow Condensed + cream bg; hero cards cross-checked vs tabs: record 54-43/2nd NL East 2.0 GB matches Standings, last W 5-0 @ Tigers Jul 12 and next vs Mets Thu 7:10 PM match Schedule, leaders qualification-correct (AVG .301 Marsh 339 AB — correctly skips Hill .327@52 AB; HR 32 Schwarber; ERA 2.62 Sánchez 127.1 IP — correctly skips 0/low-IP arms); tab underline follows clicks, GameLogModal opens/Escape-closes; no game today so no odds row (today-gate confirmed working, Odds API had the Mets line); standings-blocked failure path renders no strip + tabs fine; zero uncaught console errors. Screenshots in job tmp dir. CLAUDE.md updated: HeroStrip in components list, theme-token styling section, getPhilliesOdds moved to src/utils/odds.ts)
All tasks complete. Uncommitted working tree on base 07c66e4; user stages/commits.
# Progress Ledger: player-detail

Plan: docs/superpowers/plans/2026-07-20-player-detail.md
Spec: docs/superpowers/specs/2026-07-20-player-detail-design.md (approved — expanded modal, splits + season line)
Execution mode: plan mode (single-session), retroactively documented

Task 1: complete (uncommitted working-tree changes; StatSplit in types/mlb.ts + fetchSplits in api/mlb.ts, same /people/ path — no proxy change; build+lint clean)
Task 2: complete (GameLogModal: seasonStat prop, StatTile + season-line grid, independent splits useEffect + orderedSplits memo, splits table, panel max-w-2xl->3xl; build+lint clean)
Task 3: complete (BattingTable + PitchingTable: selectedPlayer widened to {id,name,stat}, seasonStat passed; build+lint clean)
Task 4: complete (webapp-testing PASS both tabs — batting modal shows AVG/OBP/SLG/OPS/HR/RBI/SB header + vs LHP/RHP/Home/Away splits + trend + last-10; pitching modal shows ERA/W-L/IP/K/WHIP/SV + ERA/WHIP splits; zero console errors; screenshots reviewed; CLAUDE.md updated)
  - Graceful-degradation confirmed live: Bryse Wilson 0.1 IP vs LHP returned no ERA; cell rendered blank, no NaN/crash. Two fetches are independent so a splits failure never blanks trend/table.
  - Known caveat (accepted, same as ops-trend): season line is Phillies-only table stat; can differ from full-season splits/chart for traded players since gameLog/statSplits span prior team.
All tasks complete. Uncommitted working tree; user stages/commits.
# Progress Ledger: chat-bot

Plan: docs/superpowers/plans/2026-07-21-chat-bot.md
Spec: docs/superpowers/specs/2026-07-21-chat-bot-design.md (approved — floating widget, claude-opus-4-8, both user-confirmed)
Base: 08531e5
Execution mode: multi-agent (implementation subagent, separate review + webapp-testing agents)

Task 1: complete (subagent; server/src/chat.ts — 5 betaTool MLB tools + toolRunner claude-opus-4-8 adaptive/effort-low, /api/chat registered; @anthropic-ai/sdk 0.112.4; server build clean; curls: keyless 503, six 400 validation cases, dummy-key 502 with logged authentication_error. Note: key check runs before validation, mirroring /odds. Happy-path curl NOT run — no real key in .env.local yet)
Task 2: complete (subagent; src/api/chat.ts + ChatWidget.tsx + App.tsx mount; build+lint clean)
Task 3: complete (subagent; ANTHROPIC_API_KEY secretKeyRef optional:true in api-deployment.yaml, ANTHROPIC_API_KEY= placeholder appended to .env.local; kustomize base+overlay validate)
Review: complete (separate review agent; verdict "Changes required" — 2 Important + 6 Minor, all fixed: client-side history cap slice(-20) + maxLength=2000 + error bubbles tagged error:true and excluded from payloads (Important — caps could permanently wedge the conversation); system-prompt date now ET via Intl en-CA America/New_York not UTC (Important — rolled to tomorrow at 8 PM ET); messages sanitized to role/content before Anthropic call; empty-reply fallback; encodeURIComponent on tool inputs; standings include division name; dialog role/aria-label + aria-live on the widget. Fixes applied by orchestrator — both original subagent transcripts were lost to an MCP reconnect; fresh review agent re-verified all 8 fixes and found 1 new Medium: slice(-20) could put an assistant message first in the payload (API requires first=user) → fixed by trimming leading assistant entries client-side + first-is-user validation server-side; reviewer confirmed "Fix review: clean". Builds+lint clean throughout)
Task 4: complete (live-reply run after user added real key: curl 200 in 5s — next game today Jul 21 vs Dodgers, Wheeler vs Wrobleski, matches Schedule tab/HeroStrip; browser starter question replied in 6.6s; multi-turn follow-up "How has he been pitching lately?" resolved the pronoun to Wheeler and returned per-game log detail in 9.1s (2.13 ERA, cited Jul 7 Reds 7IP/14K + Jul 12 Tigers 6IP/10K starts — both match Schedule results), confirming the game-log tool chain; zero console errors; exactly 3 paid interactions, no retries; screenshots live-step2/3 in job tmp dir. Earlier no-key run: PASS 8/8 — button persists on all 4 tabs, panel open/close, starter question → typing indicator → exact "Chat isn't configured" bubble, Enter-to-send + input re-enable, history survives close/reopen and tab switches, 375px full-screen sheet with pinned header/input, z-40 widget correctly under z-50 GameLogModal, only console entries are the expected 503 network logs; screenshots in job tmp dir. CLAUDE.md updated: chat.ts in server list, ChatWidget in components list, Chat bot section)
All tasks complete. Uncommitted working tree; user stages/commits. Deploy still pending: create k8s secret phillies-stats-anthropic + rebuild backend image (pipeline.sh) before chat works in-cluster.
