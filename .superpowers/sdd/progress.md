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
