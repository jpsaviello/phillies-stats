---
title: Favorite Players ("starring")
date: 2026-08-06
status: draft
---

## Summary

Signed-in users can star any player from the Batting and Pitching tables. Stars persist in Neon Postgres against the user's account (new `favorite_players` table) and surface in two places: an inline star inside each table's Player cell, and a "Your Players" card near the top of the page showing each starred player's current season line on every tab. Signed-out visitors see the app exactly as it is today — no stars, no card.

This is the first feature to *use* the account primitive shipped by [email-auth](2026-08-06-email-auth-design.md), which deliberately gated nothing behind sign-in.

## Motivation

The roster tables list ~40 players and the app has no notion of "the players I care about." Now that accounts exist and a shared Neon database is reachable from both deploy targets, per-user state is cheap to add, and favorites are the smallest genuinely useful thing to hang off an account: they give sign-in a reason to exist and give the top-of-page a personalized surface without adding a new tab or a router.

Server-side storage (rather than `localStorage`, which the All-Star banner dismiss flag uses) is the point of the feature as requested — favorites are tied to the user, so they follow the account across browsers and devices.

## Architecture

```
App.tsx ── favorites state (source of truth, survives tab switches)
  │
  ├─ GET  /api/favorites          ──▶ server/src/favorites.ts::listFavorites   ─┐
  ├─ POST /api/favorites/add      ──▶ server/src/favorites.ts::addFavorite      ├─▶ pg.Pool ─▶ Neon
  ├─ POST /api/favorites/remove   ──▶ server/src/favorites.ts::removeFavorite  ─┘   favorite_players
  │        (all three authenticate via the existing session cookie)
  │
  ├─▶ <FavoritesCard favorites={…} />        reads season stats via fetchBattingStats/fetchPitchingStats
  ├─▶ <BattingTable favorites={…} onToggleFavorite={…} signedIn={…} />
  └─▶ <PitchingTable … />                    star rendered inside the existing Player cell
```

- **Favorites state lives in `App.tsx`, next to `user`.** Both tables and the card need it, and the tables unmount on every tab switch — state in a table would be re-fetched (and lost) constantly. Plain prop drilling, no context and no state library, matching how `user` is already threaded into `Header`.
- **Authentication reuses the session cookie.** No new auth mechanism. `server/src/auth.ts` gains one exported helper, `resolveSessionUser(pool, token)`, extracted from the body of the existing `getCurrentUser` — `getCurrentUser` becomes a thin `RouteResult` wrapper over it, and `favorites.ts` uses it to get a `userId`. This is a refactor of existing code, not a new code path, so `/api/me`'s behavior is unchanged.
- **Mutations return the full updated list.** `add` and `remove` both respond with the complete `favorites` array rather than an ack, so the client replaces state from the server response and can never drift out of sync. Lists are bounded (50 per user), so this is cheap.
- **Optimistic updates, per the frontend rules.** `App.tsx` flips the star in local state immediately, fires the request, replaces state with the server's list on success, and rolls back to the pre-click snapshot on failure. A failed toggle reverts visibly rather than lying.
- **The star lives inside the existing Player `<td>`, not in a new column.** Both tables' Player cell is `sticky left-0`; inserting a column to its left would put a non-sticky cell outside the sticky one and break the frozen-column geometry. Rendering the button inside that cell leaves every `<th>`, column count, and the existing `colSpan` math untouched.
- **No new npm dependencies**, no ORM, no migration runner — same hand-rolled style as the auth work.

## Data model

`server/migrations/002_favorite_players.sql`:

```sql
CREATE TABLE favorite_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,            -- plain uuid, no FK (repo convention)
  player_id INTEGER NOT NULL,       -- MLB Stats API personId
  player_name TEXT NOT NULL,        -- display snapshot, see below
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX favorite_players_user_player_key
  ON favorite_players (user_id, player_id);
CREATE INDEX favorite_players_user_active_idx
  ON favorite_players (user_id) WHERE deleted_at IS NULL;
```

Two decisions worth stating outright, because both look like mistakes against the neighbouring `users` table:

- **The unique index is *not* partial**, unlike `users_email_key`'s `WHERE deleted_at IS NULL`. On `users` the partial index exists so a deleted account can free its email for someone else. Here the pair is already scoped to one user, and un-star/re-star must land on the *same* row rather than accumulating tombstones — a full unique index is what lets starring be a single race-safe `INSERT … ON CONFLICT (user_id, player_id) DO UPDATE SET deleted_at = NULL`. A partial index would not conflict against a soft-deleted row, so every re-star would insert a duplicate.
- **`player_name` is a denormalized snapshot.** MLB player names come from the stats endpoints, not from this database. The card prefers the live name whenever the player appears in the current season stats, and falls back to this column only when they don't (traded, released, or a mid-season stats gap) — so a starred player is never rendered as a bare numeric id.

Soft delete (`deleted_at`) is kept for consistency with `users`/`sessions`; every read filters `deleted_at IS NULL`.

## API contract

All three routes require a valid session cookie and follow the existing `{ error: string }` error shape.

- `GET /api/favorites`
  - `200 { favorites: [{ playerId, playerName }] }`, ordered by `created_at` ascending (the order the user starred them).
  - `401 { error: 'sign in required' }` when there's no valid session. **Deliberately not fail-soft**, unlike `/api/me`: `/me` fails soft because it is the thing that *decides* whether you're signed in, so it has nowhere to report an error to. Favorites is only ever called once that's already known, so an expired session is a real error worth being able to see. The client still degrades to an empty list (see Frontend).
  - `503 { error: 'favorites not configured' }` if `DATABASE_URL` is missing.
- `POST /api/favorites/add` — body `{ playerId: number, playerName: string }`.
  - `200 { favorites: [...] }` (the full updated list). Idempotent: starring an already-starred player succeeds and refreshes the stored name.
  - `400` non-integer/non-positive `playerId`, or empty/over-100-char `playerName`.
  - `409 { error: "you can star at most 50 players" }` when the cap is reached.
  - `401` / `503` as above.
- `POST /api/favorites/remove` — body `{ playerId: number }`.
  - `200 { favorites: [...] }`. Idempotent: removing something not starred is a success, not a 404 — the caller's intent ("this should not be starred") is satisfied either way.
  - `400` / `401` / `503` as above.

JSON stays camelCase (`playerId`, `playerName`), matching `{ user: { id, email } }` and `{ allStarBanner }`; the snake_case↔camelCase mapping happens in `favorites.ts` where the rows are read.

## Frontend

- `src/types/favorites.ts` (new) — `export interface Favorite { playerId: number; playerName: string }`.
- `src/api/favorites.ts` (new) — `fetchFavorites`, `addFavorite`, `removeFavorite`, all `credentials: 'include'`, matching `src/api/auth.ts`'s bare-`fetch` + two-step error handling. `fetchFavorites` fails soft to `[]` on any error (mirroring `fetchCurrentUser`'s fail-soft to `null`); the two mutations reject so the caller can roll back the optimistic update and surface the message.
- `src/components/StarButton.tsx` (new) — presentational toggle. Filled `phillies-red` star when starred, gray outline when not. `aria-pressed`, `aria-label={starred ? 'Unstar <name>' : 'Star <name>'}`, and `e.stopPropagation()` in its handler so clicking the star does not also open `GameLogModal` (the whole row is clickable).
- `src/components/FavoritesCard.tsx` (new) — "Your Players", mounted between `HeroStrip` and `DailyBriefing`. Renders `null` when signed out, when the list is empty, or on any stats-fetch failure (the `HeroStrip` precedent: it only summarizes data the tabs already show, so failure means disappear, not error). Fetches `fetchBattingStats()` + `fetchPitchingStats()` once and matches each favorite by `player.id` — hitters show AVG / HR / RBI, pitchers show ERA / K / W–L, unmatched players show the snapshot name and an em dash. Displays at most 8 with a `+N more` tail.
- `src/components/BattingTable.tsx` / `PitchingTable.tsx` (edit) — gain `signedIn`, `favorites`, `onToggleFavorite` props. When `signedIn` is false they render exactly as they do today.
- `src/App.tsx` (edit) — `const [favorites, setFavorites] = useState<Favorite[]>([])`, loaded in an effect keyed on `user` (so it also runs right after sign-in and clears on sign-out), plus a `toggleFavorite` handler doing the optimistic update/rollback.

## Deploy & secrets

Nothing new. `DATABASE_URL` is already wired into `k8s/base/api-deployment.yaml` (`optional: true`) and the Vercel dashboard, and `pg` is already in both `package.json`s. The only out-of-band step is applying the migration against Neon.

## Accepted caveats

- **No favorites star in `GameLogModal`.** Starring happens from the table row only. The modal already receives the player id and name, so adding one later is small, but it would mean threading favorites state through both tables into the modal for marginal gain.
- **No "favorites only" filter and no pinning of starred players to the top of the tables** — the card is the only aggregate view. Explicitly chosen to keep the table changes to a single cell.
- **The card refetches season stats that the visible table already fetched** (up to three copies of the same two responses on the batting tab). This app has no shared fetch cache — `HeroStrip` already double-fetches the same endpoints — and introducing one is a much larger change than this feature warrants.
- **The card renders nothing until both favorites and stats resolve** (no skeleton, unlike `HeroStrip`). A skeleton would flash on every page load for signed-out visitors who will never see the card; pop-in is the better trade.
- **No rate limiter on the favorites routes.** They require a valid session, write a single row, and are bounded at 50 per user; the existing login/signup limiters guard the path to getting a session in the first place. Adding a per-user limiter is the obvious follow-up if this ever gets abused.
- **No feature flag** (user's explicit choice) — same reasoning as email-auth: additive UI that is invisible to signed-out visitors and cannot break an existing feature.
- **Favorites are shared across deployments, sessions are not.** One Neon database backs both k8s and Vercel, so an account's stars are identical on both, but you still sign in separately on each domain (per the auth spec).
- **A starred player who leaves the roster stays starred**, showing the snapshot name and an em dash. No reconciliation job — it's a stats app for one team, and silently un-starring someone's favorite player on a trade is worse than a stale row.
