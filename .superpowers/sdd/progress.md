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
