# Favorite Players Implementation Plan

> Spec: docs/superpowers/specs/2026-08-06-favorite-players-design.md
> Execution mode: TBD (single-session or multi-agent, decide when work starts)

**Goal:** Signed-in users can star players from the Batting/Pitching tables; stars persist per-account in a new `favorite_players` Neon table and surface in a "Your Players" card above the tabs. Signed-out visitors see today's app unchanged.

**Architecture:** New framework-agnostic `server/src/favorites.ts` (same `RouteResult` contract as `auth.ts`/`chat.ts`), called identically from `server/src/app.ts` (Hono/k8s) and `api/index.ts` (Vercel). Authentication reuses the existing session cookie via a helper extracted out of `getCurrentUser`. Favorites state lives in `App.tsx` alongside `user` and is prop-drilled into the two tables and the new card.

**Tech stack:** Hono + `pg` + `node:crypto` (server), React 19 + Tailwind v4 tokens (client). Unchanged from the auth work.

## Global Constraints

- No new npm dependencies anywhere. No ORM, no migration runner, no state library, no fetch cache.
- Every favorites route requires a valid session — never trust a `userId` from the request body.
- Errors stay `{ error: string }`. Do not copy `/api/me`'s fail-soft pattern here (see spec for why).
- `phillies-*` Tailwind tokens only; no inline hex.
- Do not add a column to either stats table — the star goes **inside** the existing `sticky left-0` Player cell, so `<th>` counts and `colSpan` math stay untouched.
- No git add/commit/push — user handles git. Note that a push to `develop` auto-deploys Vercel production.
- `npm run lint`, `npm run build`, `npm --prefix server run build` must pass after every task. **Pre-existing gap:** neither build type-checks `api/index.ts` — verify with `npx vercel dev` (or a standalone `tsc --ignoreConfig` pass on that file, as the auth work did).

### Task 1: Database schema

**Files:** `server/migrations/002_favorite_players.sql` (new)

Plain `.sql`, applied once — same as `001_users_and_sessions.sql`. Use `npx neon psql` (**`psql` is not installed on this machine**; the Neon CLI's embedded fallback is what makes this work).

```sql
CREATE TABLE favorite_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,            -- plain uuid, no FK
  player_id INTEGER NOT NULL,       -- MLB Stats API personId
  player_name TEXT NOT NULL,        -- display snapshot; live name preferred when available
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- NOT partial, unlike users_email_key. Re-starring must land on the same row via
-- ON CONFLICT; a partial index wouldn't conflict against a soft-deleted row and
-- every re-star would insert a duplicate. See spec.
CREATE UNIQUE INDEX favorite_players_user_player_key
  ON favorite_players (user_id, player_id);

CREATE INDEX favorite_players_user_active_idx
  ON favorite_players (user_id) WHERE deleted_at IS NULL;
```

- [ ] Write the migration file above.
- [ ] Apply it: `npx neon psql -- -f server/migrations/002_favorite_players.sql`.
- [ ] Verify: `npx neon psql -- -c '\d favorite_players'` shows both indexes and all columns.
- [ ] Sanity-check the upsert by hand against a throwaway uuid: insert → soft-delete → re-insert with `ON CONFLICT` → confirm **one** row with `deleted_at IS NULL`. Delete the test row afterward.

### Task 2: Session helper extraction in `auth.ts`

**Files:** `server/src/auth.ts` (edit)

Pure refactor — `/api/me` behavior must not change.

- [ ] Extract the body of `getCurrentUser` into `export async function resolveSessionUser(pool: Pool, sessionToken: string | undefined): Promise<{ id: string; email: string } | null>` — same two queries (session by `token_hash` with `revoked_at IS NULL AND expires_at > now()`, then user with `deleted_at IS NULL`), same `console.error` + null on DB failure.
- [ ] Reduce `getCurrentUser` to: `getPool()` → null-check → `resolveSessionUser` → `signedOut()` or `{ status: 200, body: { user } }`.
- [ ] `npm --prefix server run build` clean.
- [ ] Regression-curl `/api/me` with a valid cookie, no cookie, and a revoked token — all three identical to before the refactor.

### Task 3: `server/src/favorites.ts`

**Files:** `server/src/favorites.ts` (new)

Three exports, all `Promise<RouteResult>`, taking an already-parsed body and the session token as plain values (same framework-agnostic contract as `handleChat`/`signup`). No Hono import.

Shared preamble for all three: `getPool()` → `503 { error: 'favorites not configured' }` if null → `resolveSessionUser` → `401 { error: 'sign in required' }` if null. Factor this into one private helper that returns either a `RouteResult` to short-circuit on or a `{ pool, userId }`.

- [ ] `listFavorites(sessionToken)` — `SELECT player_id, player_name FROM favorite_players WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC`. Map rows to camelCase `{ playerId, playerName }`.
- [ ] `addFavorite(requestBody, sessionToken)`:
  - Validate: `playerId` is a positive safe integer, `playerName` is a non-empty string ≤ 100 chars after trim → `400 { error: <problem> }`. Hand-rolled helpers returning `string | null`, matching `auth.ts`'s `validateEmail` convention.
  - Cap check: count live rows for the user; `>= 50` **and the player isn't already starred** → `409 { error: 'you can star at most 50 players' }`. (Ordering matters — re-starring an existing favorite at the cap must still succeed.)
  - Upsert: `INSERT INTO favorite_players (user_id, player_id, player_name) VALUES ($1,$2,$3) ON CONFLICT (user_id, player_id) DO UPDATE SET deleted_at = NULL, player_name = EXCLUDED.player_name, updated_at = now()`.
  - Return `200 { favorites: [...] }` by re-running the list query in the same function.
- [ ] `removeFavorite(requestBody, sessionToken)` — validate `playerId`; `UPDATE favorite_players SET deleted_at = now(), updated_at = now() WHERE user_id = $1 AND player_id = $2 AND deleted_at IS NULL`; return the refreshed list. Zero rows updated is still `200` (idempotent, see spec).
- [ ] DB errors → `console.error` + `502 { error: 'favorites unavailable' }`.
- [ ] `npm --prefix server run build` clean.

### Task 4: Wire routes into both runtimes

**Files:** `server/src/app.ts` (edit), `api/index.ts` (edit)

- [ ] `app.ts`: `app.get('/favorites', …)`, `app.post('/favorites/add', …)`, `app.post('/favorites/remove', …)`. The two POSTs need the same malformed-JSON try/catch → `400` as `/signup`/`/login`. Session token via `sessionTokenFrom(c.req.header('cookie'))`. No cookies are set by these routes, so `reply()` needs no change.
- [ ] `api/index.ts`: the router matches on `segments[0]`, so these are the **first multi-segment non-mlb routes** — branch on `first === 'favorites'` plus `rest[0] === 'add' | 'remove'` (and `rest.length === 0` for the GET). `req.body` used directly (Vercel pre-parses). No `vercel.json` change — the `/api/:path*` rewrite already covers these.
- [ ] `npm --prefix server run build` clean; standalone type-check of `api/index.ts` (neither build covers it).

### Task 5: Frontend types + API client

**Files:** `src/types/favorites.ts` (new), `src/api/favorites.ts` (new)

- [ ] `types/favorites.ts`: `export interface Favorite { playerId: number; playerName: string }`.
- [ ] `api/favorites.ts`, mirroring `src/api/auth.ts` exactly (bare `fetch`, `credentials: 'include'`, two-step error handling that reads the backend's `{ error }` before falling back to a generic message):
  - `fetchFavorites(): Promise<Favorite[]>` — fails soft to `[]` on any error/non-2xx (mirrors `fetchCurrentUser`). A 401 here means the session expired; empty is the right render.
  - `addFavorite(playerId, playerName): Promise<Favorite[]>` and `removeFavorite(playerId): Promise<Favorite[]>` — both **reject** on failure so the caller can roll back the optimistic update; both resolve with the server's full list.
- [ ] `npm run build` (`tsc -b`) clean.

### Task 6: `StarButton` + table wiring

**Files:** `src/components/StarButton.tsx` (new), `src/components/BattingTable.tsx` (edit), `src/components/PitchingTable.tsx` (edit)

- [ ] `StarButton.tsx`: props `{ starred: boolean; playerName: string; onToggle: () => void }`. Inline SVG star — filled `text-phillies-red` when starred, `text-gray-300 hover:text-gray-400` outline when not. `aria-pressed={starred}`, `aria-label={starred ? \`Unstar ${playerName}\` : \`Star ${playerName}\`}`, `title` the same. Handler calls `e.stopPropagation()` **first** — the whole `<tr>` opens `GameLogModal`, so without it every star click also pops the modal.
- [ ] Both tables: add props `{ signedIn: boolean; favorites: Favorite[]; onToggleFavorite: (playerId: number, playerName: string) => void }`. Derive a `Set<number>` of starred ids once per render rather than `.some()` per row.
- [ ] Render the button **inside** the existing Player `<td>`: wrap its contents in `<span className="flex items-center gap-1.5">`, star first, name second. Only when `signedIn` — otherwise the cell is byte-identical to today. Widen the cell's `min-w-36` if the star crowds long names at narrow widths.
- [ ] Leave the `<thead>` untouched: no new `<th>`, no column-count change.
- [ ] `npm run lint` and `npm run build` clean.

### Task 7: `FavoritesCard` + `App.tsx` state

**Files:** `src/components/FavoritesCard.tsx` (new), `src/App.tsx` (edit)

- [ ] `App.tsx`:
  - `const [favorites, setFavorites] = useState<Favorite[]>([])`.
  - `useEffect(() => { if (user === null) { setFavorites([]); return } fetchFavorites().then(setFavorites) }, [user])` — keyed on `user` so it also runs immediately after sign-in and clears on sign-out. `fetchFavorites` never rejects, so no `.catch`.
  - `toggleFavorite(playerId, playerName)`: snapshot current list → set the optimistic next list → `await addFavorite/removeFavorite` → `setFavorites(serverList)`; on rejection, restore the snapshot. (Per the frontend rules: optimistic update with rollback, no full refetch.)
  - Mount `<FavoritesCard favorites={favorites} signedIn={user !== null} />` between `HeroStrip` and `DailyBriefing`; pass `signedIn`/`favorites`/`onToggleFavorite` into both tables.
- [ ] `FavoritesCard.tsx`:
  - Returns `null` when `!signedIn`, when `favorites.length === 0`, when the stats fetch failed, or before data resolves (no skeleton — see spec).
  - One `useEffect` doing `Promise.all([fetchBattingStats(), fetchPitchingStats()])`, `.catch(() => setFailed(true))`. Re-runs only on mount, not on every favorites change — match by `player.id` from the already-loaded arrays.
  - Per favorite: headshot (`playerHeadshotUrl`, with `HeroStrip`'s `hideOnError`), live `player.fullName` when matched else the stored `playerName`, then AVG / HR / RBI for hitters, ERA / K / W–L for pitchers, em dash when unmatched.
  - Card chrome matches `HeroStrip`'s tiles (`bg-white rounded-xl border border-gray-200 px-4 py-3`, `font-display text-xs uppercase tracking-wider text-gray-400` heading reading "Your Players"), wrapped in `max-w-7xl mx-auto px-4 pt-3`. Responsive grid inside; render at most 8 entries with a `+N more` tail.
- [ ] `npm run lint` and `npm run build` clean.

### Task 8: Docs

**Files:** `CLAUDE.md` (edit), `.superpowers/sdd/progress.md` (edit)

- [ ] `CLAUDE.md`: a "Favorites" paragraph at the density of the existing Auth section — the `favorite_players` table and why its unique index is non-partial, the three routes and their 401-not-fail-soft contract (contrasted with `/api/me`), favorites state living in `App.tsx`, and the star-inside-the-sticky-Player-cell constraint. Also update the `src/components/` inventory and `api/index.ts`'s route list.
- [ ] `.superpowers/sdd/progress.md`: new `favorite-players` ledger entry in the established format (Plan/Spec links, base commit, per-task notes, deviations, verification summary).

### Task 9: Verification

**curl against `npm run dev:server` on `:8080`, with a cookie jar:**
- [ ] `GET /api/favorites` with no cookie → `401` (**not** `{ favorites: [] }` — proves the deliberate divergence from `/me`).
- [ ] Sign up a throwaway account, then `GET /api/favorites` → `200 { favorites: [] }`.
- [ ] `add` → `200` with the player present; `add` the same player again → `200`, still exactly one entry (idempotent upsert).
- [ ] `remove` → `200` with an empty list; `remove` again → `200`, still empty (idempotent).
- [ ] Re-`add` a previously removed player → present again, and `SELECT count(*)` for that (user, player) pair in Neon is **1**, not 2 (proves the non-partial index + `ON CONFLICT` resurrection).
- [ ] `playerId: "abc"` / `0` / `-1`, empty `playerName`, 200-char `playerName` → `400` each.
- [ ] Cross-account isolation: two accounts, different stars, each `GET` returns only its own.
- [ ] Cap: add 50, then a 51st → `409`; re-adding one of the existing 50 while at the cap → still `200`.
- [ ] Session revocation: `logout`, then `add` with the stale cookie → `401`.
- [ ] Fail-soft: restart `dev:server` with `env -u DATABASE_URL` → all three routes `503`, and the rest of the app (`/health`, `/mlb/*`, `/odds`) unaffected.
- [ ] `npx vercel dev` (with `DATABASE_URL` exported into its shell — it does **not** read `.env.local`) repeating the happy paths, confirming the multi-segment `favorites/add` routing works in that router.
- [ ] Delete all test accounts and favorite rows afterward.

**webapp-testing (Playwright) — required before this is done, per CLAUDE.md:**
- [ ] Signed out: no stars in either table, no "Your Players" card, layout unchanged (screenshot).
- [ ] Sign in → stars appear; click one → it fills, and the card appears with that player's stat line (screenshot).
- [ ] Clicking a star does **not** open `GameLogModal`; clicking elsewhere in the same row still does.
- [ ] Star from the Pitching tab → card shows the pitcher's ERA/K/W–L line, not a hitter line.
- [ ] Switch tabs and back → stars and card persist (proves state lives in `App`, not the table).
- [ ] **Full page reload** → stars and card survive (proves the DB round-trip, not in-memory state).
- [ ] Sign out → stars and card disappear; sign back in → they return.
- [ ] Rollback path: block `/api/favorites/add` with a route intercept → the star reverts after the failure instead of staying filled.
- [ ] 375px viewport: sticky Player column still frozen and readable with the star inline; card not clipped; 0px horizontal overflow (screenshot).
- [ ] Zero console errors throughout; screenshots reviewed visually, not just asserted on.
- [ ] Record findings/deviations in `CLAUDE.md` and the ledger (Task 8).
