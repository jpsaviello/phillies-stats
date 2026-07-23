---
title: Claude-Powered Chat Widget
date: 2026-07-21
status: approved
---

## Summary

A floating chat widget, available on every tab, that answers natural-language questions about the Phillies — past game results, upcoming games, probable pitchers, player/team stats, standings. Questions are answered by Claude (`claude-opus-4-8`) via a new backend route `POST /api/chat`; Claude fetches live data from the MLB Stats API through server-side tool use. The Anthropic API key lives only in the backend (`server/`), following the exact `ODDS_API_KEY` pattern.

## Motivation

The app shows tables of data but answering a concrete question ("who's pitching tomorrow?", "how has Harper done over the last week?") requires the user to navigate and cross-reference tabs. A dialogue interface answers directly, grounded in the same MLB Stats API the tabs already use. The user explicitly chose a floating widget over a fifth tab so questions can be asked while looking at the data.

## Architecture

```
ChatWidget.tsx ──POST /api/chat {messages}──▶ server/src/chat.ts (Hono route)
                                                │ Claude tool-use loop (@anthropic-ai/sdk)
                                                │ tools ──▶ statsapi.mlb.com/api/v1 (direct fetch)
                ◀────────{ reply: string }──────┘
```

- **Client state is text-only.** The widget keeps `{role: 'user'|'assistant', content: string}[]` and sends the full history each request. The tool-use loop (tool_use/tool_result blocks) runs entirely server-side within a single request; only the final answer text returns. History persists across tab switches (widget mounts once in `App.tsx`) but not across page reloads.
- **Non-streaming v1.** The widget shows a typing indicator while waiting; worst case ~10–30 s for multi-tool questions is accepted.
- **Model:** `claude-opus-4-8` (user-confirmed) with adaptive thinking and `effort: "low"` for chat latency. No sampling params (rejected with 400 on Opus 4.8).
- **Tools** (each fetches `statsapi.mlb.com/api/v1` directly and returns compact, trimmed JSON):
  - `get_schedule(start_date, end_date)` — schedule with `hydrate=probablePitcher,decisions,linescore` → results, scores, probable pitchers.
  - `get_standings()` — NL East standings.
  - `get_batting_stats()` / `get_pitching_stats()` — per-player Phillies season lines (same endpoints as `src/api/mlb.ts`).
  - `get_player_game_log(person_id, group)` — recent per-game stats for one player.
- **Loop bounds:** `max_iterations: 8`; request rejected if history > 20 messages or a message > 2000 chars.

## API contract

- `POST /api/chat` — body `{ messages: [{role, content}] }` (roles `user`/`assistant`, content plain strings, last message `user`). Response `{ reply: string }`.
  - Missing `ANTHROPIC_API_KEY` → 503 `{ error: 'chat not configured' }` (read per request, like `/api/odds`).
  - Malformed body / over limits → 400. Anthropic or MLB upstream failure → 502 with a friendly error.

## Frontend

- `src/components/ChatWidget.tsx`, mounted once in `App.tsx` outside the tab conditionals.
- Closed: fixed bottom-right `bg-phillies-red` circular button. Open: `w-96 max-h-[70vh]` panel bottom-right on ≥sm, full-screen sheet on mobile. `bg-phillies-navy` header with `font-display` title + close.
- Suggested starter questions when empty; Enter submits; input disabled in flight; errors render as an inline assistant-style message; replies rendered as plain text (`whitespace-pre-wrap`), no markdown dependency.
- `src/api/chat.ts` exports `ChatMessage` and `sendChat(messages)`; on error it surfaces the backend's `error` message (503 → "Chat isn't configured").

## Secrets

- Dev: `ANTHROPIC_API_KEY` in the gitignored `.env.local` (already loaded by `tsx --env-file`).
- k8s: Secret `phillies-stats-anthropic`, created imperatively by the user, referenced with `secretKeyRef` + `optional: true` — pod starts keyless, `/api/chat` 503s, widget shows a friendly not-configured message.

## Accepted caveats

- Each question costs real money on the user's Anthropic key (a few cents typical); no response caching in v1.
- No streaming — perceived latency covered by the typing indicator. SSE is future work.
- Conversation history is in-memory component state only; a reload clears it.
- Claude's answers are grounded via tools but can still occasionally misread the data; the system prompt requires tool use for factual claims about games/stats.
- ~~`/api/chat` has no auth/rate limiting beyond history-size caps~~ — **closed** by docs/superpowers/plans/2026-07-21-chat-rate-limit.md: per-IP 10 req / 15 min plus a global 200 req/day cap, both 429. Still no auth/login; the limits bound spend rather than identify callers.
- The rate-limit counters are in-memory, so they're a hard guarantee only on k8s (single long-running replica). On Vercel they're per-instance and reset on cold start — best-effort, same tradeoff as the odds cache. The monthly spend limit on the Anthropic key is the backstop that holds everywhere.
- `x-forwarded-for` is spoofable when the backend is reached directly (k8s NodePort bypass), so the per-IP bucket can be evaded there; the global daily cap can't be. Not an issue behind Vercel, which prepends the real client IP as the first XFF entry — verified in production: a request with a forged `x-forwarded-for` still landed in the caller's real bucket and got the 429.
