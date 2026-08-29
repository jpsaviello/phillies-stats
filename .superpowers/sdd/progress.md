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
# Progress Ledger: chat-rate-limit

Plan: docs/superpowers/plans/2026-07-21-chat-rate-limit.md
Spec: closes the "no auth/rate limiting" accepted caveat in docs/superpowers/specs/2026-07-21-chat-bot-design.md
Base: dc62087
Execution mode: single-session

Plan drift noted: the plan names the Vercel wrapper `api/[[...route]].ts`; that file no longer exists — it's now `api/index.ts` (vercel.json rewrite), per CLAUDE.md. Wired the helper there instead.

Task 1: complete (server/src/rateLimit.ts — IP_LIMIT 10 / IP_WINDOW_MS 15min / DAILY_CAP 200, ET day via Intl en-CA America/New_York; checkChatLimit returns 429 RouteResult or null, counters consumed only when BOTH limits pass; per-IP checked before daily so a fresh IP gets the correct "daily limit" message. chat.ts: handleChat(body, clientIp), checkChatLimit first — before key check and validation; max_tokens 4096 -> MAX_TOKENS 1024. server build clean)
Task 2: complete (clientIpFrom shared in rateLimit.ts — first XFF entry trimmed, else 'unknown'; wired in server/src/app.ts via c.req.header() and in api/index.ts via req.headers['x-forwarded-for'] with string|string[] normalization. server build + root build + oxlint clean; api/index.ts typechecked separately since the root tsconfig only includes src/ and vite.config.ts — it does NOT cover api/)
Task 3: complete (verification, ZERO paid requests — backend run with `env -u ANTHROPIC_API_KEY` throughout so no chat request could reach Anthropic)
  - Per-IP (Hono/k8s path): 11 rapid POSTs from one XFF -> first 10 keyless 503, 11th 429 with the "too quickly" message; a different XFF and a no-XFF request both still 503 (separate buckets). Invalid body `{"messages":[]}` from the exhausted IP also 429, proving limit-before-validation.
  - Daily cap verified with the REAL constants instead of the plan's suggested lowered-constant scratch edit: 20 IPs x 10 requests = exactly 200 allowed (503) / 0 limited, then two further fresh IPs both 429 with the "daily limit" message. No scratch edit needed.
  - Window expiry / pruning / ET rollover verified against the compiled module with a stubbed Date.now (no source edits): 11th in-window 429 -> ALLOW after window+1ms; 5000 one-shot IPs then a prune sweep still responsive; daily 429 -> ALLOW after a 25h jump. clientIpFrom cases: 'a, b'->'a', ['a','b']->'a', undefined/''/'   '/',x' -> 'unknown'.
  - webapp-testing (keyless): 11 sends through the widget -> 10 "Chat isn't configured" bubbles then the "too quickly" bubble rendered as an inline error, input re-enabled, no JS exceptions (the only console entries are the browser's automatic non-2xx resource logs for the intentional 503s/429 — expected, not app errors). Screenshot reviewed.
  - Vercel path: verified under `npx vercel dev` (real vercel.json rewrite routing) with ANTHROPIC_API_KEY temporarily stripped from .env.local, restored after. Routing reaches handleChat and IP extraction is correct (probe: '8.8.8.8, 10.1.1.1,::1' -> '8.8.8.8'; '203.0.113.7,::1' -> '203.0.113.7'; bare -> '::1'). The limiter never fires under `vercel dev` because it spawns a FRESH PROCESS PER INVOCATION (proved via a temporary pid/counter probe: distinct pid, counter stuck at 1 across 4 calls) — emulation artifact, not a bug; all probe edits reverted from api/index.ts and verified clean.
  - Docs: spec accepted-caveats updated (caveat struck through + Vercel best-effort + XFF-spoofable notes); CLAUDE.md Chat bot section gained a rate-limit paragraph (limits, check order, 429-not-503 rationale, clientIpFrom, pruning, k8s-hard vs Vercel-best-effort, the `vercel dev` gotcha).
Task 4: partially complete — Vercel prod deploy DONE (below); the two remaining items are user steps, see Open.

  - Real Vercel PRODUCTION verified (user chose promote-to-prod after a preview deploy proved untestable — previews sit behind Vercel Authentication, 401 before reaching the function, and the project has no VERCEL_AUTOMATION_BYPASS_SECRET). Deployed via `npx vercel --prod`; alias phillies-stats.vercel.app. 14 sequential POSTs with `{"messages":[]}` -> exactly ten 400s then four 429s with the per-IP message, i.e. the warm instance DID hold module-scope counters across invocations. Zero paid requests (limit runs before validation, so 400s consume budget but never call Anthropic). Regression sweep on the live deploy: / 200, /api/config 200 {"allStarBanner":false}, /api/mlb/standings 200, /api/odds 200.
  - New finding: on Vercel the per-IP bucket is SPOOF-RESISTANT — a request with a forged `x-forwarded-for: 8.8.8.8` still got the 429 rather than a fresh bucket, because Vercel prepends the real client IP as the first XFF entry. The spoofing caveat in the spec therefore applies only to hitting the k8s backend directly via NodePort. Spec + CLAUDE.md updated with this.

Open:
  - Task 4 user steps outstanding: (a) set a monthly spend limit on the Anthropic key in console.anthropic.com; (b) k8s backend image rebuild + rollout via pipeline.sh so the in-cluster backend gets the limiter (Vercel is already live with it). No manifest/env changes needed.
Uncommitted working tree; user stages/commits.
# Progress Ledger: chat-odds-tool

Feature: add a get_odds tool to the chatbot so the LLM can answer betting-line questions.
Base: after chat-rate-limit (uncommitted working tree).
Execution mode: single-session, direct implementation (one-tool addition, no separate spec/plan).

Implementation: server/src/chat.ts — new betaTool `get_odds` (empty input schema). Reuses `getOdds()` from core.ts rather than re-fetching, so the Odds API key and the shared 30-min cache stay in one place and it works identically on the k8s and Vercel paths (both call the same handleChat). Trims each game to home/away, commenceTime, bookmaker (DraftKings), and homeOdds/awayOdds = {moneyline, runLine:{point,price}} from the h2h + spreads markets. Non-200 from getOdds (keyless 503 or upstream fail) throws inside runTool -> tool returns {"error":"odds unavailable (<status>)"}. Registered in the tools array; system prompt updated to require the tool for odds/betting claims and to say "not posted yet" when the asked matchup isn't priced.

Verification:
  - Builds: server build + root build + api/index.ts standalone typecheck + oxlint all clean.
  - Transformation logic validated for FREE against live cached odds (5 games): mapping yields the intended compact shape (~1260 bytes/5 games); sample Braves -850 / Padres +491, run lines correct.
  - Keyless fallback validated for FREE via the compiled getOdds with ODDS_API_KEY unset: returns 503 -> tool would surface {"error":"odds unavailable (503)"}. No crash.
  - End-to-end PAID test (user approved 1, used 2 — first re-run was only a bad transcript selector, server-side reply succeeded both times): asked via the local widget "Is there a Phillies game with odds posted right now? If not, who's the biggest favorite tonight and their moneyline?" -> LLM called get_odds, correctly answered no Phillies game is priced AND named the real biggest favorite "Atlanta Braves ... -850" matching live DraftKings data. Zero JS errors; screenshot reviewed. Proves both the empty-matchup graceful path and real-line rendering in one answer. (No Phillies game was on the current odds slate at test time — expected, odds only cover ~next day.)
  - Deploy: both targets (user chose both). k8s via pipeline.sh (Docker Desktop had to be started first — daemon+cluster came up, rebuild+rollout clean, both Deployments fresh pods). Vercel prod via `npx vercel --prod`. Post-deploy free checks on both http://phillies-stats.com and https://phillies-stats.vercel.app: index 200, health 200, odds 200, chat invalid-body -> 400 (proves redeployed chat route runs; zero paid). The odds tool itself was proven locally on byte-identical source, so prod wasn't re-tested with a paid request.
  - Docs: CLAUDE.md Chat bot section updated ("Five tools" -> "Six tools", describing get_odds + its getOdds reuse + graceful fallback).

Note: This session also started Docker Desktop and ran the chat-rate-limit k8s rollout earlier in the same session; both k8s Deployments are now on images that include both the rate limiter AND the odds tool.
All implementation + testing complete. Uncommitted working tree; user stages/commits.
# Progress Ledger: chat-web-search-odds-fallback

Feature: add Anthropic hosted web_search as the chatbot's odds fallback so the LLM can answer odds questions get_odds can't (no game priced, or futures/division/championship odds the statsapi data doesn't cover). Follow-on to chat-odds-tool.
Base: after chat-odds-tool (uncommitted working tree).
Execution mode: single-session, direct implementation. Loaded the claude-api skill first to ground the exact server-tool spec.

Implementation (server/src/chat.ts):
  - Added the web_search server tool: `{type:'web_search_20260209', name:'web_search', max_uses:3}` (WEB_SEARCH_MAX_USES const). `_20260209` is the current variant for Opus 4.8 (per claude-api skill); it has built-in dynamic filtering, so code_execution is NOT separately declared. No local run handler — Anthropic executes it.
  - System prompt: call get_odds first; fall back to web_search when it has no line or the question is futures/division/championship odds get_odds doesn't cover; cite findings; if web_search also finds nothing, say odds aren't available. Scoped: only use web_search for Phillies/MLB questions the other tools can't answer, never unrelated topics (keeps the decline boundary + bounds abuse surface).
  - CRITICAL pause_turn fix: converted the toolRunner from a direct `await client.beta.messages.toolRunner(...)` into a `for await (const message of runner)` loop that calls `runner.pushMessages({role:'assistant', content: message.content})` on `stop_reason === 'pause_turn'`. The claude-api skill flags that the beta toolRunner does NOT auto-resume pause_turn (which a server tool can emit when its internal loop hits its cap) — awaiting directly would silently return a truncated web-search answer. Final non-paused message's text becomes the reply.

Verification:
  - Builds: server build + root build + api/index.ts standalone typecheck + oxlint all clean. The server tool typed fine mixed with the betaTool custom tools in the runner's tools array; pushMessages/stop_reason compiled.
  - End-to-end PAID test (user approved; web search is billed per query ON TOP of tokens): asked "What are the Phillies' current World Series championship odds?" through the local widget — futures aren't in statsapi get_odds at all. The model said verbatim "The odds tool only covers upcoming game lines, not futures, so let me search online.", ran web_search, and answered with cited real futures odds (~+1200 to +1300, DraftKings/BetMGM, framed vs the NL board). Zero JS errors; screenshot reviewed. Proves get_odds-empty -> web_search fallback -> cited answer, and the pause_turn loop handles a real multi-step server-tool turn.
  - Deploy: both targets (user chose both). k8s via pipeline.sh (Docker already running from the earlier odds/rate-limit rollouts; rebuild+rollout clean, both Deployments fresh pods). Vercel prod via `npx vercel --prod`. Post-deploy FREE checks on http://phillies-stats.com and https://phillies-stats.vercel.app: index 200, health 200, odds 200, chat invalid-body -> 400 (redeployed chat route runs; zero paid). Web search itself proven locally on byte-identical source, so prod wasn't re-tested with a paid+web-search request.
  - Docs: CLAUDE.md Chat bot section updated ("Six tools" -> six custom tools + the web_search server tool, the get_odds-first/web_search-fallback flow, the pause_turn iterate-not-await requirement, and the per-query cost note).

Note: k8s Deployments now carry rate limiter + get_odds tool + web_search fallback (three features shipped this session).
All implementation + testing complete. Uncommitted working tree; user stages/commits.

# Progress Ledger: chat-boxscore-tool

Feature: fix the chatbot fabricating single-game player lines. Bug report (2026-07-29): asked who led the team in hits in the 8-6 loss at Miami, it answered "Justin Crawford and Kyle Schwarber tied with 2 hits each... Schwarber went 2-for-5 with a home run and an RBI" — Schwarber did not play. That 2-for-5/HR/RBI line is Trea Turner's, verified against `/api/v1/game/823837/boxscore`.
Base: after chat-web-search-odds-fallback (uncommitted working tree).
Execution mode: single-session, direct implementation (bug fix, no separate spec/plan doc; plan file only).

Root cause: no tool returned a per-game boxscore. get_schedule gave team scores only, get_player_game_log gave one player's last 10 games. With no ground truth for "who did what in game X", the model produced real numbers attached to the wrong player.

Implementation (server/src/chat.ts only — no client changes):
  - New `get_game_boxscore` tool: input `{game_pk}`, fetches `/game/{pk}/boxscore` off the existing MLB_BASE (`api/v1`) via the shared mlbGet + runTool helpers. Returns `{away, home}`, each `{team, batters[], pitchers[]}`. Batting fields: atBats, hits, homeRuns, rbi, baseOnBalls, runs, strikeOuts. Pitching: inningsPitched, hits, runs, earnedRuns, baseOnBalls, strikeOuts. ~3.4KB trimmed for a full game.
  - Non-participant filter: `teams.{away,home}.players` holds the whole 26-man roster with EMPTY stats.batting/stats.pitching objects for anyone who didn't appear, so the trim keeps only entries where `Object.keys(...).length > 0`. Without this, Schwarber (and 13 others) would still show up with blank lines and invite the same mistake.
  - get_schedule now emits `gamePk` per game (added to the ScheduleGame interface + the trim), which is how the model gets from a date to a boxscore. Its description mentions the gamePk is for get_game_boxscore.
  - System prompt hardening: single-game player questions must go schedule -> get_game_boxscore, never inferred from season stats / game logs / web search; a player absent from the boxscore did not play; game-log entries carry dates so the newest is not necessarily today's game.
  - Note: chat.ts calls statsapi directly, so the `/game/` -> `api/v1.1` mapping in core.ts MLB_ALLOWED does not apply here — the boxscore endpoint is v1 (v1.1 is the live-feed version).

Verification:
  - `npm --prefix server run build` clean.
  - FREE tool-level check first: replayed the exact trim logic in python against the real game 823837 JSON — 26 away roster entries reduce to 9 batters + 3 pitchers, Schwarber correctly dropped (0-key batting object), sample lines match the real box score, 3450 bytes.
  - End-to-end PAID test (1 request, user approved): local widget asked "Who led the Phillies in hits today?" -> "Justin Crawford and Trea Turner tied for the team lead with 2 hits each in today's 8-6 loss to the Marlins. Turner's two hits included a home run." Correct, no Schwarber, HR attributed right. Zero console errors; screenshot reviewed.
  - Docs: CLAUDE.md Chat bot section updated (six -> seven custom tools, why get_game_boxscore exists, the empty-stat-object roster gotcha, the v1-not-v1.1 note) plus a new Testing paragraph on the cost of verifying chat changes and how to drive the widget from Playwright.

Deploy: NOT deployed. Needs the backend image rebuild via pipeline.sh for k8s (same-tag images need rebuild+rollout); Vercel picks it up on push. Uncommitted working tree; user stages/commits.

# Progress Ledger: daily-beat-reporter

Feature: a Daily Beat Reporter agent — a scheduled Claude cloud routine that each morning writes a short Phillies briefing (most recent game from the boxscore, standings, next matchup) and publishes it into the app as a collapsible card under the HeroStrip.
Plan: docs/superpowers/plans/2026-07-29-daily-beat-reporter.md
Base: after chat-boxscore-tool (committed as 63d8116).
Execution mode: single-session, direct implementation.

Decisions made with the user during planning:
  - Runtime: Claude Code scheduled cloud routine (plan credits, no Anthropic key spend, no new infra) over an Agent SDK service or a backend cron.
  - Delivery: push notification only. Gmail was dropped — the connector can only create drafts, not send.
  - UI: collapsible card under HeroStrip (not a fifth tab).
  - Publish path: the routine commits public/briefing.json to develop and pushes. NOTHING AUTO-DEPLOYS — see the finding below.

MID-IMPLEMENTATION FINDING (changed the plan): the plan assumed a push to develop auto-deploys Vercel production. It does not. The develop-tagged deploy at 18:27 today was target=preview; production (phillies-stats.vercel.app) is a separate manual `npx vercel --prod`, matching CLAUDE.md's documented flow. Offered the user three fixes (flip Vercel's production branch to develop / store a VERCEL_TOKEN so the routine deploys / push-only). User chose PUSH-ONLY: production shows a briefing only after their next manual deploy, and since the card hides briefings older than 48h, a late deploy shows nothing. Accepted deliberately to avoid storing a token; documented in CLAUDE.md and the routine doc.

Implementation:
  - public/briefing.json — seeded with a real hand-written briefing built from live statsapi data (game 823837), so the contract has a committed example and the UI was verifiable immediately. Ships in dist/ (verified), so it is baked into the nginx image like any other static asset.
  - src/components/DailyBriefing.tsx (new) — fetches /briefing.json with cache:'no-cache' (a cached copy would mask the morning push), validates the shape, and renders a collapsible card. Fail-soft like HeroStrip: missing file, malformed JSON, or wrong shape all render nothing. Staleness: hides briefings whose date is >2 days behind today's America/New_York date (same ET idiom as buildSystemPrompt in chat.ts) so a skipped run degrades to an absent card. Recap prose capped at max-w-3xl — unconstrained it ran ~150 characters a line on desktop.
  - src/App.tsx — mounted between <HeroStrip /> and <Nav>, outside the tab conditionals.
  - docs/routines/daily-beat-reporter.md (new, new docs/routines/ dir) — the routine's LIVE instructions, not just a record: the stored prompt is a thin wrapper that tells the agent to read this file from the checkout and follow it, so behavior changes by editing the doc and pushing. Encodes the endpoints, the accuracy rules, the JSON contract, the commit, the notification, and the failure rule.
  - Routine created: trig_01NEVfwEVHov4qXy2D7Wh4j8, cron `0 12 * * *` (≈8 AM ET), claude-sonnet-5, repo jpsaviello/phillies-stats, tools Bash/Read/Write/Edit/Glob/Grep/PushNotification. First run 2026-07-30T12:02Z.
  - Accuracy design carried over from the chat-boxscore-tool bug: the doc and the routine prompt both state that every single-game stat must come from that game's boxscore, that an empty stats.batting/stats.pitching object means the player did not play, and that the game narrative must come from the linescore rather than intuition. Incomplete data => commit nothing.

Verification:
  - npm run build + npm run lint clean. briefing.json confirmed present in dist/.
  - webapp-testing, 8 assertions, zero console errors: card renders collapsed with recap hidden; DOM order HeroStrip -> DailyBriefing -> Nav; expands showing all 3 paragraphs with aria-expanded=true; collapses again; still present after switching to the Standings tab; a 3-day-old date hides the card; a 2-day-old date still shows it (boundary); malformed JSON hides the card without breaking the rest of the page. Test restores the seed in a finally block.
  - Note for future runs: Tailwind's `uppercase` class means innerText returns "DAILY BRIEFING", so substring assertions must be case-insensitive — a case-sensitive `not in` check passes vacuously and looks like a green test.
  - Responsive: 375px and 1280px both render with 0px horizontal overflow; recap paragraph measures 309px / 736px.
  - Routine spec dry-run (free, no cloud session): executed the doc's data-gathering steps against live statsapi and cross-checked the seed. Most recent Final correctly resolved to gamePk 823837; 26 roster entries reduced to 9 batters + 3 pitchers with 14 non-participants excluded; linescore (2+1+3 through five vs 3 in the 5th, 3 in the 7th, 2 in the 8th) matches the seed's narrative exactly; standings 57-52 / 2nd / 6.0 GB / L3 matches; Turner's 15 HR matches the "15th home run" claim; odds returned 21 priced games with none involving PHI, corroborating the seed's "no line posted this far out". No player named in the seed is in the did-not-play set.

NOT YET VERIFIED (blocked on the user's commit): the cloud plumbing — checkout, reading the doc, git push permission, and push-notification delivery. A dry run was deliberately NOT triggered because docs/routines/daily-beat-reporter.md is not yet on origin/develop, so the run would either report the spec missing or improvise a push to develop. Push the implementation first, then trigger one manual run from the routine URL (or let the 8 AM run do it) and confirm a `briefing: YYYY-MM-DD` commit lands with valid JSON naming only players who actually appeared.

Deploy: nothing deployed. Vercel production needs a manual `npx vercel --prod`; k8s needs pipeline.sh to rebuild the frontend image. Uncommitted working tree; user stages/commits.

## Amendment (same day): routine deploys production itself

User asked for the briefing to reach Vercel production daily rather than waiting on a manual deploy — reversing the push-only decision recorded above. Researched the routines/cloud-environments docs before changing anything, which turned up two blockers that would have broken the routine as originally created:

1. NETWORK. Cloud environments default to "Trusted" network access, whose allowlist covers package registries, GitHub, and cloud SDKs — `statsapi.mlb.com` is NOT on it, so every data fetch would have failed with `403 host_not_allowed`. The routine as created yesterday could never have worked in the Default environment, independent of the deploy question. Requires Network access → Custom with statsapi.mlb.com + the Vercel hosts, "also include defaults" checked so npx still reaches npm.
2. SECRETS. Cloud environments have NO secrets store; env vars are readable by anyone using the environment (the dialog says so outright). Acceptable here only because it is a personal environment. VERCEL_TOKEN must be project-scoped.

Also found: `.vercel/` is gitignored, so the cloud checkout has no project link — `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` must be set or the CLI would try to create a NEW Vercel project. And `develop` carries `Claude <noreply@anthropic.com>` commits, which a cloud session's push protection may treat as "commits authored by someone other than you" and reject.

Design change that falls out of this: `vercel deploy --prod` publishes the working DIRECTORY, so production no longer depends on the git push succeeding at all. Steps reordered to deploy first (step 6), then commit for durability (step 7), and the two are documented to fail independently — a rejected push falls back to a `claude/` branch and the run still counts as a success because production is already updated. This also retires the "production is usually stale" caveat: production is now as fresh as the last successful run.

Chose `vercel deploy --prod` over `vercel promote` deliberately: per the Vercel docs, promoting a preview deployment creates a new production deployment from a build made with PREVIEW-scoped environment variables, which would leave production's /api/chat and /api/odds without their keys. `deploy --prod` is a fresh production build, identical to the user's manual `npx vercel --prod`.

Changed: docs/routines/daily-beat-reporter.md (new Prerequisites section with exact env values and allowlist; new step 6 deploy with post-deploy curl verification; step 7 commit with the claude/ fallback; steps renumbered to 9; Deployment behavior section rewritten). Routine prompt updated via RemoteTrigger (invariant 3 previously said "nothing auto-deploys from this push", now the deploy is the point; added the independent-failure invariant). CLAUDE.md Daily briefing + Automated routines paragraphs updated.

STILL BLOCKED ON THE USER, and now on two things, not one: (a) commit+push the implementation so the cloud checkout has the spec, and (b) configure the environment's Custom network allowlist and the three env vars. Until (b) the routine fails at the first fetch. Nothing about the deploy path has been executed or verified — no cloud run has happened yet.

## Amendment 2 (same day): Vercel production branch set to develop

User changed the Vercel project's production branch to `develop`, so a push to develop now auto-deploys production. This is strictly better than Amendment 1's design and reverses most of it:

  - REMOVED the `npx vercel deploy --prod` step and the VERCEL_TOKEN / VERCEL_ORG_ID / VERCEL_PROJECT_ID environment variables. No credential is stored anywhere, which matters because cloud environments have no secrets store. Also dropped api.vercel.com / *.vercel.com from the required network allowlist.
  - The environment now needs only Network access -> Custom with `statsapi.mlb.com` and `phillies-stats.vercel.app` (defaults still included). The statsapi blocker from Amendment 1 stands and is still the one thing that must be configured before the routine can work at all.
  - The push became load-bearing again: it is now the publish mechanism, so a rejected push means nothing reached users. Reversed Amendment 1's rule that a rejected push is tolerable — it is now a FAILED run: save the commit to claude/briefing-YYYY-MM-DD so the work survives, and report that the briefing was not published.
  - Verified the two push-rejection conditions we can check: the repo is public, `develop` is NOT branch-protected, and there are no open PRs (so no PR from develop). The remaining unknown is whether a cloud session's push protection counts develop's `Claude <noreply@anthropic.com>` commits as "commits authored by someone other than you". That is the only untested leg of the pipeline.
  - Step 7 is now "confirm production picked it up" — the push triggers a Vercel build, so it polls https://phillies-stats.vercel.app/briefing.json for up to ~3 minutes and reports "pushed but not yet rebuilt" rather than claiming success.

Also noted, because it affects the user beyond this feature: production now follows the integration branch, so ANY push to develop goes live, including unfinished work. Documented in CLAUDE.md's Deploy section.

Changed: docs/routines/daily-beat-reporter.md (Prerequisites simplified to one network setting, deploy step replaced by commit+push as the publish step, new production-confirmation step, Deployment behavior rewritten), routine prompt via RemoteTrigger (invariant 3 is now "the push is the deploy, do not invoke the Vercel CLI"; invariant 4 inverted to "a rejected push is a failed run"), CLAUDE.md (Deploy section, Daily briefing, Automated routines), memory (vercel_deploy_is_manual.md renamed to vercel_production_tracks_develop.md — the old note was now actively wrong).

Still blocked on the user: (a) commit+push so the cloud checkout has the spec, (b) set the environment's Custom network allowlist. No cloud run has executed yet.

## First real run: 2026-07-29 19:23 ET

The user created the new cloud environment, set Network access -> Custom with statsapi.mlb.com + phillies-stats.vercel.app, and re-pointed the routine at it (environment_id now env_016wMSZpYCdfkt239tXPmaHN). The routine then ran (on the 12:00 UTC schedule or a manual trigger) and the user got a push notification.

What actually happened, reconstructed from git history and production:
  - Network access fix worked: no 403 host_not_allowed, all statsapi fetches succeeded.
  - Routine wrote public/briefing.json and committed "briefing: 2026-07-29" (73ad877) DIRECTLY to develop -- no push-protection rejection, no claude/ branch fallback needed. This resolves the one untested leg flagged in Amendment 2: a cloud session CAN push directly to develop despite it carrying prior Claude-authored commits.
  - Vercel auto-deployed from that push; https://phillies-stats.vercel.app/briefing.json confirmed serving the routine's real content (not the seed), verified via curl and a live Playwright check of the rendered card.
  - A second cloud session (branch claude/zen-ramanujan-9w1iac, commit c8e47ed "docs: correct daily-beat-reporter deploy mechanism") independently arrived at nearly the same doc/CLAUDE.md corrections as this session's uncommitted Amendment-2 edits (removing the VERCEL_TOKEN/CLI-deploy language, marking a rejected push as a real failure). The user merged it as PR #10. Net effect: HEAD now matches what this session already had staged locally, so nothing was lost, but the two sessions did overlapping work independently -- worth being aware of when multiple sessions touch the same docs.

PLAYER-STAT ACCURACY HELD: cross-checked the live briefing against the real boxscore. Turner 2-for-5 with a HR, Crawford 2 hits, Stott 2 RBI on a double, Luzardo charged with all 6 runs over 6.1 IP, Bowlan credited with the loss after allowing the 8th-inning runs -- all match statsapi exactly. No player was misattributed and no non-participant was mentioned. This was the original bug the whole feature exists to prevent, and it did not recur.

GAME-FLOW NARRATIVE BUG FOUND (currently live in production, not yet fixed): the briefing's headline ("Phillies blow 6-0 lead, swept by Marlins") and first recap paragraph ("built a 6-0 lead through five innings... Marlins answered with three runs in the fifth to cut the deficit") misstate the linescore. Actual per-inning: PHI 0,0,2,1,3,0,0,0,0 / MIA 0,0,0,0,3,0,3,2,0 -- Philadelphia led 3-0 after four innings, and BOTH teams scored 3 runs in the same fifth inning, making it 6-3 after five, never 6-0. The Marlins' fifth-inning runs happened in the same inning as, not in response to, a completed 6-0 lead. Verified independently via a fresh curl of the linescore endpoint before writing this entry.

Root cause: docs/routines/daily-beat-reporter.md step 3 (Accuracy rules) says "Describe how the game turned from the linescore, not from intuition" but doesn't explicitly warn about the case where both teams score in the same inning -- the model appears to have attributed the Phillies' 5th-inning runs and the Marlins' 5th-inning runs as sequential events (lead built, then answered) rather than reading them as simultaneous per-inning totals. The player-stat guardrails (empty stats object = did not play) don't cover this narrative-sequencing failure mode; it's a new gap, not a recurrence of the original chat-boxscore-tool bug.

NOT YET FIXED: this entry documents the finding for the next session. Candidate fix: tighten step 3 to require restating the linescore's per-inning columns explicitly before narrating, and to warn that both teams can score in the same inning (a lead described as "through N innings" must be the score at the END of inning N, after both halves). Left as a known issue rather than patched immediately since the user is done for the day; production is currently serving the inaccurate framing until the next successful run (2026-07-30 12:00 UTC) or a manual fix.

# Progress Ledger: schedule-wildcard-standings

Plan: docs/superpowers/plans/2026-08-04-schedule-wildcard-standings.md
Spec: docs/superpowers/specs/2026-08-04-schedule-wildcard-standings-design.md
Base: 6021239 (develop)

Task 1 (WildCardRecord type): complete — uncommitted working-tree change
Task 2 (fetchWildCardStandings): complete — uncommitted
Task 3 (WildCardStandings component): complete — uncommitted
Task 4 (wire into Schedule.tsx): complete — uncommitted
Task 5 (CLAUDE.md docs): complete — uncommitted

Verified with webapp-testing (Playwright, both servers up): heading renders, 7 team
rows + cutoff divider, Phillies row highlighted w/ red dot at WC rank 3, cutoff row
lands directly after them, 26 game rows still render below, zero console errors,
375px mobile has no horizontal overflow. tsc/oxlint/vite build all clean.
Row data matched a live curl of the wildCard endpoint exactly.

Two deliberate deviations from the plan's sample code (both improvements):
  - Cutoff marker is a labeled "Playoff cutoff" row rather than the plan's bare
    aria-hidden dashed <td>. Matches the design doc's own sketch and is readable
    by screen readers instead of hidden from them.
  - Skipped the spec's optional bg-green-50 tint on the top-3 rows: it collides
    with the Phillies' bg-red-50 highlight whenever they hold a wild card spot
    (which they do right now, rank 3). Spec offered the tint as an "or", and the
    labeled divider already communicates the line.

Also restructured Schedule.tsx's three early returns (loading/error/!dates.length)
into one nested ternary so <WildCardStandings /> sits ABOVE them and still renders
while the schedule fetch is in flight or has failed. The plan's Step 2 note asked
for that independence but its placement instruction (inside the final return only)
would not have delivered it — the widget would have vanished on any schedule error.

KNOWN BEHAVIOR (not a bug, documented in CLAUDE.md): standingsTypes=wildCard
excludes division leaders, so the Phillies disappear from this table entirely if
they take over the NL East. Component handles philliesIndex === -1 by falling back
to the plain 7-row cutoff. Currently untriggered (Phillies are 2nd, 7.5 GB), so
this path is unexercised at runtime — worth a look if they climb to 1st.

All tasks complete. NOT committed: the user stages/commits themselves, and develop
auto-deploys Vercel production, so this is deliberately left in the working tree.

## Amendment 1: moved Schedule tab -> Standings tab (2026-08-04, post-deploy)

Plan/spec renamed to drop the now-wrong "schedule" prefix:
  docs/superpowers/specs/2026-08-04-standings-wildcard-design.md
  docs/superpowers/plans/2026-08-04-standings-wildcard.md
(git mv, so history follows.)

WHAT HAPPENED: the user committed the original work (508cec8) and pushed to develop,
which auto-deployed Vercel production, then reported not seeing the wild card table.
It was NOT a deploy failure — verified the deployed bundle
(assets/index-DyQO33IG.js) contained both "standingsTypes=wildCard" and
"NL Wild Card Race", and prod /api/mlb/standings?...standingsTypes=wildCard returned
HTTP 200 with real teamRecords. The feature was live and working the whole time; it
was just on the SCHEDULE tab, and the user went looking on the STANDINGS tab.

Root cause is a spec-authoring miss, not an implementation bug: I chose the Schedule
tab in the design doc without asking, and "show me the NL wildcard standings" plainly
implies the Standings tab — that's where a standings table belongs and where anyone
would look. Worth remembering: when a feature is "show X somewhere in the UI" and the
repo already has an obviously-matching tab, put it there rather than picking a novel
placement for adjacency reasons.

CHANGES:
  - Schedule.tsx fully reverted (git checkout b290d12 -- src/components/Schedule.tsx).
    Confirmed beforehand that 508cec8's only change to that file was my wiring, so the
    revert lost nothing. The early-return -> nested-ternary restructure is gone from
    Schedule entirely; that file is byte-identical to its pre-feature state.
  - Standings.tsx now renders <WildCardStandings /> below the NL East table, with the
    same early-return restructure applied there instead (so a division-standings
    error can't blank the wild card table).
  - WildCardStandings root div lost its mb-4; spacing is the parent's space-y-8, which
    collapses correctly when the component returns null.
  - CLAUDE.md, spec, and plan Task 4 all rewritten for the new placement.

RE-VERIFIED with webapp-testing after the move: Standings tab renders 2 tables in the
right order (NL East above Wild Card, asserted via bounding_box y-comparison), Phillies
highlighted in BOTH (2 x tr.bg-red-50), cutoff row directly after their rank-3 row,
Schedule tab now has zero wild card markup with its 26 game rows intact, no console
errors, 375px mobile clean. tsc/oxlint/build all pass.

TESTING GOTCHA worth keeping: this app polls (LiveGameStrip), so Playwright's
wait_for_load_state('networkidle') NEVER settles and times out at 30s. Use
wait_until='domcontentloaded' + explicit wait_for_selector instead. Cost me one failed
run; now recorded in the plan's Task 4 Step 5.

Amendment complete. Again NOT committed — user stages/commits, and develop
auto-deploys production.

# Progress Ledger: on-this-day

Plan: docs/superpowers/plans/2026-08-05-on-this-day.md
Spec: docs/superpowers/specs/2026-08-05-on-this-day-design.md
Base: 6aeb707
Execution mode: plan mode (single session)

Task 1: complete (src/utils/date.ts — easternToday/daysBehind extracted verbatim from
DailyBriefing; formatDate parameterized on Intl options since OnThisDayCard needs a
full "August 5, 2014" label vs the briefing's "Aug 5". Pure refactor, tsc clean.)
Task 2+3: complete (OnThisDayCard.tsx — OnThisDay type + isOnThisDay guard inline,
mirrors DailyBriefing structurally. Staleness measured against `date`, never
`historicalDate`. Visually differentiated: 🕰️ vs 📰, "On This Day — <year>" label,
red full-date line above the recap.)
Task 4: complete (App.tsx — enableOnThisDay flag defaulted true, mounted stacked
below DailyBriefing.)
Task 5: complete (public/on-this-day.json seeded with a REAL verified game.)
  - Ran the routine's own algorithm by hand: 60 single-day /schedule queries
    (1966-2025 Aug 5) returned 57 Finals. No no-hitters (min hits was 2), so tier 2
    won: 2014-08-05, PHI 2 HOU 1 in 15 innings — walk-off AND extra innings.
  - ACCURACY FINDINGS — my first draft had three fabrications, all caught by going
    back to the API. These are now encoded as explicit rules in the routine doc:
    (a) wrote "bases-loaded single" — play-by-play shows 1st and 2nd, two outs.
        RBI columns don't tell you the runner situation; only playByPlay does.
    (b) wrote Bastardo threw "two perfect frames" — he had 0 H but 1 BB. Hitless
        != perfect. Check walks before using either word.
    (c) wrote "Papelbon, Giles and De Fratus finished it off" — boxscore
        pitchers[] shows Neris actually pitched the 15th. Don't guess relief order.
    (d) also cut "five-hour marathon": duration isn't in these endpoints at all.
  This is exactly the failure mode the beat-reporter doc was written to prevent,
  reproduced on the first try. Worth remembering that plausible-sounding baseball
  prose is the default output unless every clause is traced back.
Task 6: complete (webapp-testing PASS — both cards render stacked in correct DOM
order, expand independently (both open simultaneously, neither collapses the other),
historical date line renders, 375px mobile clean, zero console errors. Screenshots
reviewed.)
Task 7: complete (docs/routines/on-this-day-reporter.md — mirrors daily-beat-reporter
structure; encodes the 60-year bounded search, the 5-tier notability ranking with
most-recent tie-break, and the Task-5 accuracy findings above.)
Task 8: complete (CLAUDE.md — component inventory, "On this day" paragraph covering
the date vs historicalDate distinction, src/utils/date.ts, routine bullet.)

All tasks complete. NOT committed — user stages/commits, and develop auto-deploys
production.

FOLLOW-UPS (deliberately out of scope, need user action):
  - Register the cron routine via the `schedule` skill, then fill its trigger id
    into docs/routines/on-this-day-reporter.md and CLAUDE.md.
  - Set that routine's cloud env Network access to Custom (statsapi.mlb.com,
    phillies-stats.vercel.app) — NOT inherited from daily-beat-reporter's env.
  - Create the `enableOnThisDay` LaunchDarkly flag (launchdarkly-flag-create).
    Until it exists the useFlags() default of true keeps the card visible.

FOLLOW-UP STATUS (updated same session):
  - Routine REGISTERED: trig_017HYfmZPpHAyXVde2QcQWb7, daily 13:00 UTC.
    Scheduled at 13:00, NOT 12:00 as the plan said: daily-beat-reporter fires at
    12:00 and ends by pushing develop. Two routines pushing the same branch
    concurrently means one push is rejected, which both docs treat as a FAILED
    RUN, not a retryable hiccup. Keep them an hour apart.
  - Network allowlist: NO ACTION NEEDED after all. The new routine reuses the
    same phillies-stats environment (env_016wMSZpYCdfkt239tXPmaHN) as the beat
    reporter, which already has Custom network access with statsapi.mlb.com.
    Allowlists are per-ENVIRONMENT, not per-routine. My earlier claim in
    CLAUDE.md and the routine doc that it "needs its own allowlist" was wrong in
    context and has been corrected in both places.
  - LD flag CREATED: enable-on-this-day (boolean, temporary, clientSideAvailability
    usingEnvironmentId=true so the React SDK receives it). Mirrors
    enable-daily-briefing's naming/description conventions.
    !! It is on:false in BOTH production and test, which INVERTS current behavior:
    with no flag, useFlags() returns undefined and the code default of true shows
    the card; now LD actively serves false and HIDES it. Needs toggling on in
    production to preserve intent. Not done unilaterally — per .claude/rules/
    launchdarkly.md, production toggles get confirmed with the user first.
  - BLOCKER for the first run: the routine reads docs/routines/on-this-day-reporter.md
    from the develop checkout, and nothing here is committed or pushed yet. If
    develop doesn't have it before 2026-08-06T13:00Z, the first run does nothing
    and reports "routine spec is missing" (the wrapper prompt handles this
    explicitly). Push is the user's call.

# Progress Ledger: email-auth

Plan: docs/superpowers/plans/2026-08-06-email-auth.md
Spec: docs/superpowers/specs/2026-08-06-email-auth-design.md
Base: 0455d93
Execution mode: single-session, direct implementation

Context: first stateful feature in the app and its first database user. Neon
Postgres ("Phillies" project, free tier) was provisioned earlier the same
session; DATABASE_URL/DATABASE_URL_UNPOOLED already in .env.local, pg already
installed in server/, but zero app code touched it before this.

Task 1: complete (server/migrations/001_users_and_sessions.sql; applied with
  `npx neon psql -- -f ...` -- psql is NOT installed locally, the Neon CLI's
  embedded TypeScript psql fallback is what makes this work. \d users and
  \d sessions verified: all columns, the partial unique email index, and both
  sessions indexes present.)
Task 2: complete (RouteResult.cookies?: string[]; cookies.ts / db.ts /
  crypto.ts; reply() appends via c.header(...,{append:true}), send() passes the
  array to res.setHeader. Regression-curled all five pre-existing routes
  (health/config/mlb/odds/chat-400 + mlb allowlist 403) -- byte-identical
  behavior, confirming the shared-wrapper change is non-breaking.)
Task 3: complete (auth.ts + authRateLimit.ts; server build clean)
Task 4: complete (four routes in app.ts, four branches in api/index.ts;
  server build clean + standalone `tsc --ignoreConfig` on api/index.ts clean,
  since neither project build covers that file)
Task 5: complete (DATABASE_URL secretKeyRef optional:true in api-deployment.yaml,
  kustomize-validated; pg added to root package.json, npm install clean)
Task 6: complete (src/types/auth.ts + src/api/auth.ts)
Task 7: complete (AuthWidget.tsx modal, Header.tsx props + justify-between,
  App.tsx user state; lint + build clean)
Task 8 (docs): complete (CLAUDE.md -- three new paragraphs plus server/,
  components, and Vercel-routing inventory updates; this ledger entry)

DELIBERATE DEVIATION FROM THE PLAN (one, an improvement): the plan specified a
flat "5 attempts / 15 min" login limit. Implemented that PLUS clearLoginLimit()
on a successful password verification, which clears that IP's and that email's
buckets. Without it a legitimate user who signs in and out a few times locks
themselves out for 15 minutes, while a brute-force run is unaffected either way
(it never produces a correct password, so it never reaches the clear). Scoped
per-email deliberately: an attacker who owns one valid account can clear their
own IP bucket but NOT the victim's email bucket, so the two-key design still
holds. Verified explicitly (TEST C below).

Verification -- curl against dev:server, cookie jar, 16 checks all passing:
  - signup 201 + Set-Cookie with HttpOnly/SameSite=Lax/Max-Age=2592000 and
    correctly NO Secure over plain http://localhost (proves isHttpsFrom derives
    from x-forwarded-proto rather than hardcoding, which is what keeps the
    cookie usable on the TLS-less k8s ingress).
  - duplicate 409; short password 400; malformed email 400; malformed JSON 400.
  - /api/me with cookie -> user; without -> {"user":null}.
  - login 200 + fresh cookie; wrong password 401; unregistered email IDENTICAL
    401 (no enumeration leak); "  UPPERCASE@... " normalizes to the same account.
  - logout 200 {"ok":true} + Max-Age=0, and REPLAYING the revoked token then
    returns user:null (proves server-side revocation is real, not just a cleared
    cookie). A second, unrelated session stayed live -- logout is per-session.
  - logout with no cookie at all still 200.
  - TEST A (IP key): one IP, six DIFFERENT emails -> 401 x5 then 429.
  - TEST B (email key): one email, six DIFFERENT spoofed x-forwarded-for -> 401
    x5 then 429. This is the one that proves the email bucket catches
    distributed credential stuffing that IP-only limiting would miss.
  - TEST C (clear-on-success): 4 wrong, then correct -> 200, then a 6th wrong ->
    401 NOT 429, proving the deviation above works.
  - TEST D: signup limiter 201 x5 then 429.
  - Fail-soft: server started with `env -u DATABASE_URL` on :8099 -> /signup and
    /login 503 "auth not configured", /api/me 200 {"user":null} (the deliberate
    convention break), /logout 200, /health 200. Pod would start clean.

Verification -- Vercel path (api/index.ts gets no local typecheck from either
build, so this is load-bearing): `npx vercel dev` on :3009. First run showed
503s for BOTH auth and odds -- `vercel dev` does not load .env.local. Re-ran
with DATABASE_URL exported into its shell: signup 201 + Set-Cookie, /me
round-trip, login 200, wrong password 401, duplicate 409, logout 200 +
clearing cookie, /me -> null. Pre-existing routes still 200/404 as before.
Recorded the .env.local gap in CLAUDE.md so it isn't re-diagnosed as a bug.

Verification -- webapp-testing (Playwright), 19/19 passing, zero console errors:
  header shows "Sign In" signed out; modal opens and toggles both modes; wrong
  credentials render the inline role="alert" error with the form still usable;
  signup closes the modal and the header shows the email; FULL PAGE RELOAD keeps
  the user signed in (proves the httpOnly cookie + /api/me round-trip, not just
  SPA state); sign out reverts the header and a reload confirms it stuck (cookie
  really cleared); log back in with the same account works; all four tabs and the
  ChatWidget still fine under the new justify-between Header; 375px has 0px
  horizontal overflow and the modal fits (x=16 w=343); Escape closes the modal.
  Screenshots reviewed visually, not just asserted on.
  TEST-ONLY GOTCHA worth keeping: the modal's close button is labelled "Close
  sign in", which SUBSTRING-matches a get_by_role(name="Sign in") lookup and
  makes it ambiguous with the mode-toggle link. Use exact=True (it is also
  case-sensitive, which is what separates the "Sign in" toggle from the "Sign In"
  submit button). Cost one failed run.

Test data: all 8 accounts created during verification were deleted afterwards
(13 sessions + 8 users); users and sessions are both back to 0 rows.

NOT DONE -- user steps, deliberately not scripted:
  (a) kubectl create secret generic phillies-stats-db \
        --from-literal=DATABASE_URL='<Neon pooled string>'
      then kubectl rollout restart deploy/phillies-stats-api
  (b) add DATABASE_URL to the Vercel project dashboard
  (c) k8s also needs pipeline.sh to rebuild the backend image (same-tag images
      need rebuild+rollout, not just restart)
Until (a)/(b), sign-in 503s in those environments and the header just shows
"Sign In" -- nothing else breaks.

Uncommitted working tree; user stages/commits. NOTE: develop auto-deploys Vercel
production, so pushing this ships sign-in to production -- do (b) first or the
feature will 503 for real users.

# Progress Ledger: favorite-players

Plan: docs/superpowers/plans/2026-08-06-favorite-players.md
Spec: docs/superpowers/specs/2026-08-06-favorite-players-design.md
Base: b563b7b
Execution mode: single-session, direct implementation

Context: first feature to USE the account primitive from email-auth (which
deliberately gated nothing). Second migration against the same Neon "Phillies"
project; DATABASE_URL and pg were already wired for auth, so this needed no
deploy or secret change at all.

Task 1: complete (server/migrations/002_favorite_players.sql, applied with
  `npx neon psql -- -f ...`. \d verified: all columns + both indexes. Also
  hand-verified the resurrection path against a throwaway uuid -- insert ->
  soft-delete -> ON CONFLICT re-insert leaves exactly ONE row, live, with the
  name refreshed. That check is the whole reason the unique index is NOT
  partial; a partial index wouldn't conflict against the soft-deleted row and
  would have silently accumulated duplicates.)
Task 2: complete (resolveSessionUser extracted from getCurrentUser in auth.ts;
  server build clean; /api/me regression-curled with a valid cookie, no cookie,
  and a REVOKED cookie -- all three byte-identical to pre-refactor.)
Task 3: complete (server/src/favorites.ts; server build clean)
Task 4: complete (three routes in app.ts, one `first === 'favorites'` block in
  api/index.ts; server build clean + standalone `tsc --ignoreConfig` on
  api/index.ts, which neither project build covers)
Task 5: complete (src/types/favorites.ts + src/api/favorites.ts)
Task 6: complete (StarButton.tsx + both tables; lint + build clean)
Task 7: complete (FavoritesCard.tsx + App.tsx favorites state, effect keyed on
  `user`, optimistic toggle with rollback; lint + build clean)
Task 8 (docs): complete (CLAUDE.md -- new "Favorite players" paragraph plus
  server/, components, and Vercel-routing inventory updates; this entry)

DEVIATION FROM THE PLAN (one, found by verification): the plan said to widen the
sticky Player column's min-w-36 "if the star crowds long names". It does --
measured at 375px, signed-out wraps 1/12 player cells to two lines, signed-in
wrapped most of them. Fixed by making the width CONDITIONAL (min-w-44 only when
signedIn, min-w-36 otherwise) rather than widening it unconditionally, so the
signed-out layout stays byte-identical, which the spec calls for explicitly.
Re-measured after: cell height 60.5px -> 40.5px, no wrapping.

Verification -- curl against dev:server, cookie jar:
  - GET /favorites with no cookie -> 401 (NOT fail-soft; the deliberate split
    from /api/me, which still returns {"user":null} on the same server).
  - list empty -> add -> add again: one entry both times (idempotent upsert).
  - remove -> empty; remove again -> 200 empty (idempotent).
  - re-add a removed player -> present, and Neon shows exactly 1 row for that
    (user, player) pair, not 2.
  - 400s: playerId "abc" / 0 / -1, whitespace-only name, missing name, 101-char
    name, malformed JSON body.
  - Cross-account isolation: two accounts, each GET returns only its own stars.
  - Cap: 50 accepted, 51st NEW player -> 409, but re-adding one of the existing
    50 while AT the cap -> 200 and the name refreshes (the ordering edge case
    the plan called out).
  - Session revocation: logout, then add/list with the stale cookie -> 401.
  - Fail-soft: server started without DATABASE_URL on :8099 -> all three
    favorites routes 503, while /me 200 {"user":null}, /health, /config and
    /mlb/standings were untouched.

Verification -- Vercel path (api/index.ts gets no local typecheck, so this leg
is load-bearing): `npx vercel dev` on :3009. Signup/list/add/idempotent-add/
bad-id-400/remove/401-no-cookie all correct, /me and /mlb/* unregressed, and
/api/favorites/bogus + POST /api/favorites (no sub-path) both 404 -- confirming
the multi-segment matching works in that router, which was the one genuinely
new routing shape here.
  GOTCHA worth keeping: a first run showed signup 502 "getaddrinfo ENOTFOUND
  base". That was MY shell quoting, not the code -- .env.local wraps
  DATABASE_URL in double quotes, and `export $(grep ...)` passes them through
  literally. Strip them: export DATABASE_URL="$(... | sed 's/^"//; s/"$//')".
  (vercel dev still does not read .env.local at all -- known, already in
  CLAUDE.md.)

Verification -- webapp-testing (Playwright), 24/24 passing, zero console errors:
  signed out has no stars and no card; signing up makes stars appear on every
  row with no card until the first star; starring a hitter shows AVG/HR/RBI and
  a pitcher shows ERA/K/W-L; star click does NOT open the game log modal while a
  row click still does; card and stars survive a tab round trip AND a full page
  reload (the DB round trip, not SPA state); unstar clears; a forced 502 on
  /favorites/add rolls the optimistic star back; sign out clears both surfaces
  and signing back in restores them; 375px has 0px horizontal overflow with the
  sticky column intact. Screenshots reviewed visually, not just asserted on --
  that's what surfaced the name-wrapping issue above.
  TWO TEST-ONLY GOTCHAS, both of which cost a run:
  (a) GameLogModal is a plain fixed-inset div with NO role="dialog" (unlike
      AuthWidget's modal), so get_by_role("dialog") silently never matches it
      and BOTH modal assertions were measuring nothing -- one false pass and one
      false fail. Use the "Last 10 Games" heading instead.
  (b) networkidle NEVER settles on this app, even on first load: LiveGameStrip
      polls on a timer from mount. Wait on selectors, not load state.

Test data: all 6 accounts created during verification (favtest1-3, favui*) plus
their 58 favorites and 11 sessions were deleted afterwards. The one remaining
users row is the owner's real account, left untouched; favorite_players is back
to 0 rows.

NOT DONE -- user steps, deliberately not scripted:
  (a) k8s needs pipeline.sh to rebuild the backend image (same-tag images need
      rebuild+rollout, not just restart).
  (b) Nothing else: no new secret, no k8s manifest change, no Vercel env var,
      no npm dependency, no feature flag.
The migration is ALREADY APPLIED to the shared Neon database, which both deploy
targets read -- so the schema is live for production right now while the code
is not. That ordering is safe (an unused table), but note the reverse would not
be: pushing the code before applying the migration would 502 every favorites
call.

Uncommitted working tree; user stages/commits. NOTE: develop auto-deploys Vercel
production, so pushing this ships starring to production immediately.
# Progress Ledger: standings-tiebreakers

Plan: docs/superpowers/plans/2026-08-12-standings-tiebreakers.md
Design: docs/superpowers/specs/2026-08-12-standings-tiebreakers-design.md
Base: 4c97a08 (branch claude/mlb-standings-tiebreaker-xuhbef)

Status: Tasks 1-4 and 6 complete (commits a5c01ee..1467520). Task 5 (webapp-testing
live-app verification) NOT DONE -- see below.

Verified during planning (live API, 2026-08-12):
- MLB's `standingsTypes=wildCard` orders tied clubs by ascending team ID, not by
  tiebreaker: ranks 2/3/4 are D-backs(109)/Padres(135)/Phillies(143), all 64-57.
  Same pattern in `leagueRank` (5/6/7) and `sportRank` (8/9/10).
- Head-to-head among the tied clubs (from /schedule, Final games only):
  D-backs 5-5 Padres, D-backs 2-1 Phillies, Padres 0-6 Phillies.
  Combined: Phillies 7-2 (.778) > D-backs 7-6 (.538) > Padres 5-11 (.313).
  Criterion 1 alone decides it -> Phillies WC2, D-backs WC3, Padres WC4.
- Intradivision/intraleague are already in the standings response under
  `records.divisionRecords` / `records.leagueRecords`; head-to-head is not, at any
  hydration level.
- `hydrate=team(division)` supplies `team.division.id` but swaps `team.name` to the
  full club name; `team.teamName` preserves the current short labels.
- Trimmed /schedule for one club: 163 games, ~25KB, carries `isWinner`.

Re-verified at implementation time (2026-08-12, same day): live tie unchanged
(D-backs/Padres/Phillies still 64-57), so the numbers above still hold.

Task 1 (types), Task 2 (src/utils/tiebreakers.ts), Task 3 (fetchSeasonResults +
hydrated fetchWildCardStandings), Task 4 (WildCardStandings.tsx wiring), and
Task 6 (CLAUDE.md) implemented exactly per plan, one commit per task.

Task 2's algorithm was NOT just reasoned about by hand -- it was executed. This
session's node_modules could not be installed (see below), so `src/utils/
tiebreakers.ts` (pure, no framework imports) was run directly via
`node --experimental-strip-types` against live `/standings` and `/schedule`
JSON pulled with curl. Output matched the design doc exactly: Phillies WC2
(note "Head-to-head vs tied clubs: 7-2"), D-backs WC3 (note "Intradivision:
26-15" -- their 2-way head-to-head vs Padres alone is a 5-5 wash, so the
restart-the-chain logic correctly falls through to intradivision), Padres WC4.
This also validated the multi-way-tie "remove winner, restart at criterion 1"
recursion, which the 2-team live examples elsewhere in this codebase never
exercise.

BLOCKED, not skipped -- Task 5 and the tsc/lint/build verification steps in
Tasks 1-4:
This session's network egress policy does not allow registry.npmjs.org (agent
proxy status confirms it: "Host not in allowlist"), and no local/offline npm
cache satisfies this project's dependency tree either (`npm install --offline`
fails on the first transitive package). node_modules could not be installed at
all, so `npm run dev`, `npm run build`, `npm run lint`, and `npx tsc -b` are
all unavailable in this session -- confirmed this is an environment gap, not a
code issue, by running `tsc -b --force` against the pre-change commit and
getting the identical "Cannot find type definition file for 'vite/client'/
'node'" failure. (statsapi.mlb.com IS reachable -- that's a separately
allowlisted host per the daily-beat-reporter/on-this-day-reporter setup notes
in CLAUDE.md -- so all the live-API verification above was unaffected.)
In place of the plan's Step 5 tsc/lint/build checks, each file was manually
checked against tsconfig.app.json's strict settings (verbatimModuleSyntax,
noUnusedLocals/Parameters, erasableSyntaxOnly) and against the structural
compatibility between `WildCardRecord` and the generic `TiebreakerRecord`
`applyTiebreakers`/`teamsNeedingTiebreak` are written against.
Task 5's Playwright/webapp-testing run (dev server + browser screenshot of the
corrected order, hover tooltip, and the blocked-schedule failure path) could
not run for the same node_modules reason and is the one item genuinely left
for a human or a session with npm registry access -- run `npm install && npm
run dev:server` / `npm run dev` and drive the Standings tab per Task 5's
checklist before merging.

Not done, out of scope per the plan (unchanged from planning):
- Criterion 4 (last half of intraleague games).
- `Standings.tsx` / NL East division table ordering (same flaw, no cutoff line,
  deliberately deferred -- `tiebreakers.ts` is written so it could adopt it).
- No LaunchDarkly flag (correctness fix; failure path already matches today's
  behavior).
# Progress Ledger: roster-tab

Plan: docs/superpowers/plans/2026-08-21-roster-tab.md
Spec: docs/superpowers/specs/2026-08-21-roster-tab-design.md
Base: deba138 (develop)

Task 1 (types): complete -- RosterStatusCode + RosterPlayer added to src/types/mlb.ts.
  Existing RosterEntry left untouched (BullpenUsage depends on its active-only shape).
Task 2 (api): complete -- fetchRosterWithStats() added. rosterType=40Man (NOT a change
  to fetchRoster, whose active-only semantics BullpenUsage relies on). fields= trim
  measured at 31.5KB vs 112KB untrimmed. Also exported the existing SEASON const so the
  component's "2026 Season" header and "No 2026 appearances" label derive from one source
  instead of a literal and a local-clock getFullYear() (caught during implementation --
  the clock version would disagree with SEASON in January).
Task 3 (utils/roster.ts): complete -- pure, replayed against live 40-man JSON with
  `node --experimental-strip-types`. 13/13 assertions pass: 26/7/12 split, all 45 players
  appear exactly once, Schwarber classified DH (position.type "Hitter") not IF, no pitcher
  classified as a hitter, all 5 statless players handled, Rojas correctly IL-and-statless,
  IL subgroups ordered 10->15->60, switch-hitter renders S/R, blank jersey numbers sort
  last, jersey "4" confirmed to be two different players (Arraez + Kemp) so person.id is
  the React key.
Task 4 (component): complete.
  DESIGN CHANGE FROM PLAN: the plan specified separate hitter (AVG/HR/RBI/OPS) and pitcher
  (W-L/ERA/GS/K) stat columns. That cannot work in the IL section, which groups by injury
  tier -- "Injured 60-Day" holds Adolis García and Brad Keller in the same subgroup, so
  shared headers would have to label a hitter's AVG and a pitcher's W-L as the same column.
  Replaced with a single "2026 Season" column formatted per row (formatSeasonLine), which
  stays honest in mixed groups and is more compact on mobile.
  Statless rows are deliberately NOT clickable -- GameLogModal would open onto an empty
  season header and an empty trend chart.
Task 5 (wiring): complete -- Nav gained a `hidden` prop so flag-off removes the tab entry
  rather than leaving a tab that clicks through to an empty <main>. App has a guard effect
  for the flag flipping off live while the roster tab is the active one.
Task 6 (verification): complete.
  - npx tsc -b: clean. npm run lint (oxlint): clean. npm run build: clean.
  - webapp-testing (real Chromium, both servers up): 27/27 assertions pass, zero console
    errors. Covered all three sections, all seven IL players by name with their specific
    designations, no "undefined"/"NaN" in the DOM, statless label, S/R switch-hitter,
    DH group, row-click opens GameLogModal on the right player, statless row has no
    role="button", and no horizontal page overflow at 375px.
  - Flag-off path verified for real (temporarily defaulted the flag false, reloaded):
    Roster removed from the nav, other four tabs intact, default tab still renders,
    no page errors. Reverted.
  - Note for future browser runs: wait_until='networkidle' NEVER settles on this app --
    the LaunchDarkly client holds an SSE stream open. Use 'domcontentloaded' + a wait.
  - Note: subgroup labels carry text-transform:uppercase, so Playwright inner_text()
    returns them uppercased; compare case-insensitively or the assertions false-fail.

OUTSTANDING -- not done, needs the user:
  The LaunchDarkly flag `enable-roster-tab` has NOT been created. Creating/targeting a
  flag is a shared external-state change, so it was left for the user to confirm. Until it
  exists, useFlags() returns undefined and the `= true` code default renders the tab, so
  current behavior is correct either way. IF IT IS CREATED, IT MUST BE CREATED WITH
  TARGETING ON: per the enable-bullpen-usage trap already recorded in CLAUDE.md, a flag
  created with targeting off serves offVariation (false) to every connected client, which
  would hide the tab in production for everyone whose LD client connects successfully.

Not committed -- per the user's standing rule, staging/committing/pushing is theirs.

# Progress Ledger: user-profile

Plan: docs/superpowers/plans/2026-08-21-user-profile.md
Spec: docs/superpowers/specs/2026-08-21-user-profile-design.md
Base: develop @ deba138 + uncommitted roster-tab working tree

Task 1 (migration): complete -- server/migrations/003_user_profiles.sql applied via
  npx neon psql. Verified \d user_profiles (all columns, non-partial unique index on
  user_id) and the upsert-resurrection sanity check (insert -> soft-delete -> re-insert
  with ON CONFLICT DO UPDATE SET deleted_at = NULL -> exactly one live row).
Task 2 (authorize extraction): complete -- server/src/authorize.ts holds the shared
  authorize(sessionToken, feature) preamble, lifted out of favorites.ts's former private
  helper. favorites.ts now imports it, passing 'favorites' so its error strings
  (`'favorites not configured'`) are byte-identical to before. Regression-curled all
  three favorites routes post-refactor -- unchanged.
Task 3 (profile.ts read/update/avatar): complete -- getProfile/updateProfile/updateAvatar
  in server/src/profile.ts. DEFAULT_PROFILE returned when no row exists (signup never
  creates one). updateProfile's INSERT/ON CONFLICT column list deliberately excludes
  avatar_data_url so a field save can never clobber the photo -- verified by curl (see
  Task 9). fan_since upper bound computed via Intl.DateTimeFormat in America/New_York,
  not a bare Date().getFullYear() (host clock is UTC in both containers).
Task 4 (password change + deletion): complete -- changePassword and deleteAccount added
  to profile.ts. New user-id-keyed rate-limit bucket in authRateLimit.ts (5/15min,
  distinct from every IP-keyed bucket in that file). deleteAccount is the first
  multi-statement transaction in this backend (explicit pool.connect() + BEGIN/COMMIT/
  ROLLBACK + client.release() in finally) across users/sessions/favorite_players/
  user_profiles. auth.ts's validatePassword and MIN_PASSWORD_CHARS exported (pure
  refactor, no behavior change) so profile.ts reuses the same rules rather than
  re-deriving them.
Task 5 (wiring): complete -- five /profile routes added to both server/src/app.ts (Hono)
  and api/index.ts (Vercel's segments/rest router, following the favorites precedent).
  Confirmed clean with a standalone `tsc --ignoreConfig` pass on api/index.ts (neither
  build type-checks that file on its own).
Task 6 (frontend types/api/avatar util): complete -- src/types/profile.ts,
  src/api/profile.ts (mirrors favorites.ts's fetch/error-handling shape exactly),
  src/utils/avatar.ts (createImageBitmap -> canvas -> JPEG q0.82 downscale, no dependency).
Task 7 (ProfileModal + wiring): complete -- src/components/ProfileModal.tsx (You /
  Phillies / Notifications / Account sections); AuthWidget.tsx's signed-in branch now
  shows an avatar-or-initials + display-name button (was a bare email span) that opens
  the modal; Header.tsx and App.tsx thread profile/onProfileChange through exactly as
  they already thread user/onAuthChange. Extracted a shared `profileInitials()` helper
  into src/utils/profileDisplay.ts rather than duplicating the initials logic between
  AuthWidget's header trigger and ProfileModal's avatar fallback.
  DEVIATION FROM PLAN: plan didn't call out a shared initials helper explicitly --
  added during implementation once the same logic was about to be written twice.
Task 8 (docs): complete -- CLAUDE.md gained a "User profile" paragraph (density-matched
  to the Auth/Favorites paragraphs) covering the separate-table decision, lazy row
  creation, the non-partial unique index, the avatar-not-object-storage tradeoff and why
  svg+xml is excluded, the user-id-keyed password rate limiter, the first-transaction
  note on deletion, and the inert notification prefs. Updated the src/components/
  inventory and api/index.ts's route list.
Task 9 (verification): complete.
  - npx tsc -b: clean. npm --prefix server run build: clean. npm run lint (oxlint): clean.
    npm run build: clean. Standalone tsc --ignoreConfig on api/index.ts: clean.
  - curl matrix against npm run dev:server (:8080), cookie jars, throwaway accounts:
    * No-cookie GET /api/profile and all four POSTs -> 401 (not a default profile,
      confirming the deliberate divergence from /api/me).
    * Fresh signup -> GET /api/profile returns DEFAULT_PROFILE with no DB row.
    * Full-field update round-trips correctly; re-update with "" in every text field
      normalizes to NULL (not empty string) in the response.
    * All 12 validation-matrix cases rejected 400 with the correct field named:
      61-char displayName, phone "abc"/too-few-digits/too-many-digits, 4-char
      favoriteNumber, non-digit favoriteNumber, fanSince 1882 and 2027 (next year),
      favoritePlayerId 0/-1/"abc", notifyDailyBriefing as a string.
    * Avatar: valid small JPEG data URL saved; a subsequent /update (no avatar in
      payload) left the avatar untouched -- proves the column-list exclusion works;
      { avatarDataUrl: null } cleared it; image/svg+xml payload -> 400; 250k-char
      payload -> 400 (200k cap).
    * Password change: wrong current -> 401; 7-char new -> 400; new === current -> 400;
      valid change succeeded, the calling session stayed authenticated, a second
      concurrently-logged-in session was revoked (verified via /api/me on that cookie
      returning { user: null }); 6th attempt within the window -> 429 (limit is 5,
      cleared by the earlier successful change).
    * Account deletion: wrong password -> 401; correct password -> 200 with a clearing
      Set-Cookie; confirmed in Neon directly that users.deleted_at, all sessions
      (revoked_at), favorite_players, and user_profiles all moved in one shot. Old
      cookie -> /api/me returns { user: null }. Re-signup with the freed email
      succeeded and started with an empty favorites list and a default profile.
    * Transaction rollback: temporarily sabotaged the favorite_players UPDATE statement
      (nonexistent column) mid-deleteAccount, rebuilt, hit the route -> 502, then
      confirmed in Neon that users.deleted_at was still NULL and the session was still
      live -- BEGIN/ROLLBACK genuinely reverted the whole transaction, not just the
      failing statement. Reverted the sabotage, rebuilt clean, reconfirmed tsc/build.
    * Cross-account isolation: two independent accounts, each GET /api/profile returned
      only its own saved display name.
    * Fail-soft: DATABASE_URL= (empirically had to override with an empty value, not
      `env -u`, because tsx --env-file=../.env.local reloads it from the file otherwise)
      -> all five profile routes 503, /api/health, /api/me, /api/mlb/* unaffected.
    * npx vercel dev --listen 3210 (DATABASE_URL etc. exported into its shell first --
      it does not read .env.local): confirmed the multi-segment /api/profile/* router
      branch works there too, and a 150KB avatar payload round-tripped successfully
      through Vercel's request handling.
    * All throwaway test accounts created during this pass were deleted via
      /api/profile/delete afterward.
  - webapp-testing (Playwright, real Chromium, both servers up): delegated to a
    dedicated subagent per the user's standing multi-agent-SDD preference, so browser
    tool noise stays out of the orchestrator's context. Full pass, 12/12, zero bugs:
    signed-out baseline, sign-up -> modal open, field save with correct persistence
    (no reset to stale values), full page reload preserving both session and saved
    profile fields (proves the DB round-trip, not just React state), avatar upload of
    a 7.69MB source image producing a 48,967-byte request body (proves the client-side
    canvas/JPEG downscale actually ran), avatar removal reverting to initials, password
    change with old-password-now-fails/new-password-works verified by actually signing
    out and back in, a forced-500 failure path showing an inline error and never a false
    "Saved.", Escape/backdrop-click/focus-visibility/caret-color all correct, 0px
    horizontal overflow at 375px, and account deletion + same-email re-signup producing
    a genuinely clean new profile. Two console messages logged were both the expected
    401/500 artifacts of the deliberate negative-path tests, not spontaneous bugs.

Review: a phase-reviewer subagent did a full Gate-3.5-style read of every changed file
  against the spec, in parallel with the webapp-testing pass. Initial verdict: NEEDS
  CHANGES, four real findings (backend contract compliance and the security-relevant
  pieces -- routes, status codes, the avatar prefix/length checks, the transaction shape,
  the authorize()/auth.ts refactors -- were all confirmed to match the spec exactly; the
  findings were in gaps the curl matrix and the plan's own checklist didn't specifically
  walk).
  1. [HIGH, fixed] ProfileModal.tsx's form-hydration effect re-ran on EVERY `profile`
     prop change, not just the first. Since updateAvatar's response also flows through
     onProfileChange, saving a new avatar while other form fields had unsaved edits
     silently reverted those edits to the last-saved values -- a real data-loss bug.
     Fix: a `hydratedRef` so the form only hydrates from the server once per modal
     mount; the modal already fully unmounts on close (`{profileModalOpen && <ProfileModal
     .../>}` in AuthWidget.tsx), so a fresh open still re-hydrates correctly.
  2. [MEDIUM, fixed] profile.ts's four normalizeText-based validators (displayName,
     phone, location, favoriteNumber) validated the already-coerced value rather than
     the raw request-body value, so e.g. `{"displayName": 123}` silently normalized to
     NULL (a silent "clear this field") instead of a 400 -- inconsistent with how
     favoritePlayerId/fanSince/the booleans validate the raw body value. Fixed by
     rewriting all four to type-check the raw value first (`'<field> must be a string'`,
     matching the snake_case field-naming convention the other 400s already use), with
     the length/format checks unchanged. Verified via curl with number/boolean/array
     payloads for all four fields -> 400 with the right message; sanity-checked a legit
     multi-field update still round-trips correctly afterward.
  3. [MEDIUM, fixed] changePassword's two writes (password hash update, then session
     revocation) were NOT transactional, unlike deleteAccount -- if the hash update
     succeeded but the revocation query then failed, the caller would be told the whole
     operation failed (502) despite their password having actually changed, their
     rate-limit bucket not being cleared, and stolen/borrowed sessions on other devices
     staying live despite the UI's "your other devices have been signed out" claim.
     Fixed by wrapping both statements in the same pool.connect()/BEGIN/COMMIT/ROLLBACK/
     finally-release pattern deleteAccount already uses. Re-verified end-to-end via curl:
     caller session survives, a second concurrently-logged-in session is revoked, cleanup
     still succeeds.
  4. [MEDIUM, fixed] ProfileModal rendered `profile === null` as an unconditional,
     permanent "Loading your profile..." with no error state and no retry -- if the
     initial GET /api/profile failed after a successful sign-in (fetchProfile's
     documented fail-soft-to-null contract), the modal was a dead end. Fixed by having
     the modal retry the fetch itself when it mounts with `profile === null`. distinguishing
     "still in flight" from "failed" via a `profileLoadFailed` flag, and showing a
     "Couldn't load your profile" message with a "Try again" button instead of an
     infinite spinner.
  All four fixes verified: tsc -b, server build, oxlint, and full vite build clean after
  each; the two backend fixes re-verified with a targeted curl pass (type-confused
  payloads for all four affected fields -> 400 with the field named; password-change
  transaction re-run end-to-end confirming session revocation still works). The frontend
  fixes (#1 and #4) were not re-run through webapp-testing after the review landed --
  they're logic-level fixes to code paths the earlier full Playwright pass didn't happen
  to exercise (editing a field then changing the avatar in the same session; a forced
  failure specifically on the initial GET rather than on a POST), so they're verified by
  code reading and the type checker rather than a second full browser pass. Worth a spot
  check by the user if it matters before shipping.

OUTSTANDING -- not done, needs the user:
  None required to ship. Two optional follow-ups noted by the reviewer but not acted on
  (both pre-existing risk patterns, not regressions introduced by this feature):
  - `signup` (auth.ts, unchanged by this plan) has the same two-statement-without-a-
    transaction shape changePassword had before this review's fix (insert user, then
    insert session) -- not fixed here since it's out of this feature's diff, but worth
    hardening the same way if it's ever revisited.
  - No LaunchDarkly flag (deliberate, matching auth/favorites -- see spec's Feature flag
    section).

All tasks complete. Not committed -- per the user's standing rule, staging/committing/
  pushing is theirs.

================================================================================
FEATURE: startup-performance (2026-08-28)
  Spec: docs/superpowers/specs/2026-08-28-startup-performance-design.md
  Plan: docs/superpowers/plans/2026-08-28-startup-performance.md

Part 1 -- unblock first paint (Tasks 1-2): DONE
  src/main.tsx: asyncWithLDProvider -> withLDProvider, plus bootstrap:'localStorage'.
  Task 2 re-verified the no-flicker claim against LD production before building:
  enable-daily-briefing / enable-on-this-day / enable-game-detail / enable-bullpen-usage
  all targeting-on; enable-matchup-preview and enable-roster-tab still don't exist in LD.
  Every flag's served value matches its code default, so there is nothing to flicker.

Part 2 -- survive a refresh (Tasks 3-8): DONE
  src/utils/cache.ts: sessionStorage persistence under `phl:cache:v1:`, lazy per-key
  restore, ttl<=0 never persisted, invalidate() clears storage, all access try/caught.
  server/src/core.ts: RouteResult.cacheControl + mlbCachePolicy() + resolveCacheControl().
  server/src/app.ts + api/index.ts: both wrappers emit, before the contentType return.

DEVIATIONS FROM THE PLAN (all deliberate, all verified):
  1. Task 1 -- `bootstrap` is NOT a top-level ProviderConfig field as the plan wrote it;
     it lives under `options`. Plan was wrong, code is right.
  2. Task 8 -- centralized in core.ts's resolveCacheControl() keyed on the first path
     segment, rather than editing every return site in auth/favorites/profile/chat as
     the plan said. Those four modules return from ~40 places; one missed return would
     be silent and would be exactly the case that leaks on a shared edge cache.
     api/index.ts routes all responses through one `reply` closure so the segment is
     always supplied. (Self-inflicted bug caught mid-edit: the textual replacement hit
     the closure's own body and made it infinitely recursive -- fixed before typecheck.)
  3. Task 6 -- the plan's `/game/**/boxscore` 60s row describes a path this app never
     requests. fetchBoxscore and fetchBullpenBoxscore use the SAME /game/{pk}/feed/live
     path as the live strip, differing only by `fields=`, so they take the no-store
     branch. Conservative on purpose; the /game/ 60s branch is now unreachable and kept
     only for a future non-live game path. Spec table corrected to match.
  4. Task 9 step 5 assumed retry buttons call invalidate(). They don't -- they bump a
     `reloadKey`, and since only successes are stored a failure left nothing cached, so
     retry reaches the network by construction. Verified anyway (error state -> click ->
     1 network request -> table renders). invalidate() is currently unused app-wide; its
     stale "Used by retry buttons" docstring was corrected rather than left misleading.

VERIFICATION (Task 9) -- all passed, nothing paid for:
  Headers, by curl against the live backend: /feed/live -> no-store; /schedule -> 60s+SWR;
    /stats + /standings -> 300s+SWR; /config -> 60s; me/favorites/profile -> private,
    no-store; 403 and 502 -> no header at all.
  Browser (Playwright, dev server on :5175):
    - LD blackholed (route left unresolved, i.e. a hang not a fast-fail): first paint
      0.11s, all 5 nav tabs present, full app renders. This is the Part 1 result.
    - Cold load 14 API requests -> reload 8.
    - 6 keys persisted; ZERO live-feed keys on disk (the critical safety assertion).
    - Live strip with ?liveGamePk: 3 feed requests in 38s, i.e. still on its ~15s
      cadence and not frozen -- the top regression risk for both parts.
    - sessionStorage forced to throw: app still renders, degrades to memory-only.
  Builds: tsc -b, server tsc, oxlint, full vite build all clean.
  Pre-existing and unrelated: /api/odds returns 502 upstream (key/quota), which surfaces
    as one console 502; Schedule.tsx already catches it and renders no odds.

DOCS (Task 10): CLAUDE.md updated -- cache section (three problems, persistence layer and
  its three traps, the no-user-data invariant), a new RouteResult.cacheControl paragraph,
  a new paragraph on LD not blocking first paint, and two stale facts corrected:
  enable-bullpen-usage targeting is ON in production (docs said OFF), and enable-roster-tab
  has no LD flag (previously unmentioned).

OUTSTANDING -- needs the user:
  - Not committed. Per the standing rule, staging/committing/pushing is the user's.
  - k8s needs pipeline.sh to pick up the backend change; Vercel gets both on push.
  - Out of scope but confirmed this session: the k8s nginx serves dist/ UNCOMPRESSED
    (stock nginx:alpine ships `#gzip on;` commented) -- index.js 374,055 B vs ~110.9 KB
    gzipped, CSS 36,004 B vs ~7.2 KB, and no Cache-Control on content-hashed assets.
    ~292 KB wasted per cold load on phillies-stats.com only; Vercel handles both itself.
    Larger than either part of this feature. Worth one curl against the live ingress to
    confirm the ingress controller isn't compressing on its own, then its own spec.
# Progress Ledger: ui-quality-of-life

Plan: docs/superpowers/plans/2026-08-28-ui-quality-of-life.md
Spec: docs/superpowers/specs/2026-08-28-ui-quality-of-life-design.md
Base: b9913d6 (develop)

Task 1: complete (src/utils/search.ts — normalize + matchesQuery, diacritic strip via NFD)
Task 2: complete (src/components/PlayerSearch.tsx)
Task 3: complete (src/components/ScrollX.tsx — right-edge fade, ResizeObserver)
  - Also added Feedback.tsx `NoMatches`, kept distinct from EmptyState (clearable filter vs empty data)
Task 4: complete (BattingTable + PitchingTable — filter after sort, unfiltered `selected` lookup preserved)
Task 5: complete (Roster — filter before groupRoster so section counts match what renders)
Task 6: complete (Schedule jump-to-today/next-game, ring flash, no auto-scroll)
Task 7: complete (BackToTop + src/utils/motion.ts, mounted in App beside ChatWidget)

Verification (webapp-testing, both servers, 1280x900 + 375x700):
  - Batting `kyle sch` -> Kyle Schwarber only, "1 of 20"; `zzzz` -> NoMatches; Clear and Escape both restore 20 rows
  - Pitching `sanchez` and `SÁNCHEZ` both -> Cristopher Sánchez (diacritic case proven both directions)
  - Roster `sanchez` -> ACTIVE ROSTER (1) / Pitchers / Cristopher Sánchez, "1 of 45"; other sections drop out
  - Schedule: "Jump to today" centers Aug 28 @ Angels row with ring (1 ringed row)
  - ScrollX at 375px: fade present (scrollWidth 905 vs client 343), gone at full-right, returns on scroll back
  - BackToTop: absent at scrollY 0, present at 1500, no vertical overlap with chat FAB (btt y 780-820, chat y 828-884)
  - build + oxlint clean
Pre-existing, unrelated: `/api/odds` 502 `{"error":"Odds API 401"}` — the local ODDS_API_KEY is rejected upstream.
  Schedule already does fetchOdds().catch(() => []), so odds simply don't render. Not touched by this work.
All tasks complete. Uncommitted working-tree changes (user stages/commits).
# Progress Ledger: batting-form + league-rankings

Plan: docs/superpowers/plans/2026-08-29-batting-form-and-league-rankings.md
Base: 1fb2dd3

Task 1 (data layer): complete — fetchBattingByDateRange + fetchTeamStats, both on already-allowlisted proxy prefixes (/stats, /teams/), so no MLB_ALLOWED change.
Task 2 (pure logic): complete — utils/battingForm.ts, utils/rankings.ts.
Task 3 (Hot & Cold): complete — BattingForm.tsx; BattingTable refactored off early returns to the single-return shape (same refactor PitchingTable needed for BullpenUsage).
  - Bug found and fixed during browser verification: a row printed "+.100" grouped under "Holding steady". Both OPS figures are 3-decimal, but .872 - .772 is a hair under .100 in float; the delta is now rounded at classification time so grouping and the printed number cannot disagree.
Task 4 (League Rankings): complete — LeagueRankings.tsx mounted below WildCardStandings.
Task 5 (flags + docs): complete — enableBattingForm / enableLeagueRankings default true in App.tsx; CLAUDE.md + README updated; two design specs + one plan written.
  - Known gap (accepted, matches enable-matchup-preview / enable-roster-tab): neither LD flag exists in LaunchDarkly, so both always serve the `= true` code default. The LD MCP server is unauthenticated in this session, so the flags could not be created here.
Task 6 (verification): complete — tsc -b + oxlint clean; webapp-testing against live MLB data at 1280px and 375px.
  - Ranks cross-checked against statsapi directly: runs 12th, HR 11th, OBP 22nd, K 16th (hitting); ERA 12th, K 1st, HR allowed 21st, SV 14th, BB 8th (pitching) — all match the panel, lower-is-better categories included.
  - Failure paths driven by aborting each request in turn: byDateRange fails -> panel hides, table keeps its 20 rows; season stats fail -> panel still renders (dashes in ±OPS) and the table shows its error state; teams/stats pitching fails -> Offense card stands alone; both fail -> block hides and the standings are untouched.
  - Regression check: the game-log modal still opens from a batting row and Back still closes it after the single-return refactor.
All tasks complete.
