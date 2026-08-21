# User Profile Implementation Plan

> Spec: docs/superpowers/specs/2026-08-21-user-profile-design.md
> Execution mode: TBD (single-session or multi-agent, decide when work starts)
> Base: `develop` @ deba138 + the uncommitted roster-tab working tree

**Goal:** Signed-in users get a profile — display name, phone, hometown,
favorite player/number, fan-since year, avatar, two notification preferences —
persisted per-account in a new `user_profiles` Neon table and edited in a modal
opened from the header. That modal also hosts change-password and
delete-account. Signed-out visitors see today's app unchanged.

**Architecture:** New framework-agnostic `server/src/profile.ts` (same
`RouteResult` contract as `auth.ts`/`favorites.ts`), called identically from
`server/src/app.ts` (Hono/k8s) and `api/index.ts` (Vercel). Profile state lives
in `App.tsx` next to `user`/`favorites` and is prop-drilled through `Header` →
`AuthWidget` → `ProfileModal`.

**Tech stack:** Hono + `pg` + `node:crypto` (server), React 19 + Tailwind v4
tokens (client). Unchanged from the auth and favorites work.

## Global Constraints

- **No new npm dependencies anywhere** — no image library, no upload SDK, no
  form or validation library, no state library.
- Every profile route requires a valid session — never trust a `userId` from a
  request body.
- Errors stay `{ error: string }`. Do **not** copy `/api/me`'s fail-soft pattern
  (see spec).
- **Never log a request body in `profile.ts`** — it carries a phone number and,
  on two routes, a plaintext password. `auth.ts` already sets this precedent.
- `phillies-*` Tailwind tokens only; no inline hex.
- `image/svg+xml` must never enter the avatar allowlist.
- No git add/commit/push — the user handles git. A push to `develop`
  auto-deploys Vercel production.
- `npm run lint`, `npm run build`, `npm --prefix server run build` must pass
  after every task. **Pre-existing gap:** neither build type-checks
  `api/index.ts` — verify separately (`npx vercel dev`, or a standalone `tsc`
  pass on that file, as the auth and favorites work did).

### Task 1: Database schema

**Files:** `server/migrations/003_user_profiles.sql` (new)

Plain `.sql`, applied once — same as 001/002. Use `npx neon psql` (**`psql` is
not installed on this machine**; the Neon CLI's embedded fallback is what makes
this work).

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,                -- plain uuid, no FK
  display_name TEXT,
  phone TEXT,
  location TEXT,
  favorite_player_id INTEGER,
  favorite_number TEXT,                 -- TEXT: "00" and "0" are different numbers
  fan_since INTEGER,
  avatar_data_url TEXT,                 -- data:image/…;base64,… capped at 200k chars
  notify_daily_briefing BOOLEAN NOT NULL DEFAULT false,
  notify_game_reminders BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- NOT partial, same as favorite_players_user_player_key: saving is a single
-- ON CONFLICT (user_id) upsert and must land on the same row. See spec.
CREATE UNIQUE INDEX user_profiles_user_key ON user_profiles (user_id);
```

- [ ] Write the migration file above.
- [ ] Apply it: `npx neon psql -- -f server/migrations/003_user_profiles.sql`.
- [ ] Verify: `npx neon psql -- -c '\d user_profiles'` shows every column, the
      unique index, and both boolean defaults.
- [ ] Hand-check the upsert against a throwaway uuid: insert → soft-delete →
      re-insert with `ON CONFLICT (user_id) DO UPDATE SET deleted_at = NULL` →
      confirm **one** row. Delete the test row afterward.

### Task 2: Shared `authorize` helper

**Files:** `server/src/authorize.ts` (new), `server/src/favorites.ts` (edit)

Pure refactor — favorites behavior and error strings must not change. Same
shape as the `resolveSessionUser` extraction the favorites plan did to
`auth.ts`.

- [ ] Move the private `authorize()` and its `Authorized` union out of
      `favorites.ts` into `server/src/authorize.ts`, taking a feature name:
      `authorize(sessionToken, feature: string)` → `503 { error: \`${feature} not configured\` }`
      when `getPool()` is null, `401 { error: 'sign in required' }` when
      `resolveSessionUser` returns null, else `{ ok: true, pool, userId }`.
- [ ] `favorites.ts` imports it and calls `authorize(token, 'favorites')` —
      the emitted strings stay byte-identical (`'favorites not configured'`).
- [ ] `npm --prefix server run build` clean.
- [ ] Regression-curl all three favorites routes with a valid cookie, no cookie,
      and (with `DATABASE_URL` unset) a 503 — identical to before the refactor.

### Task 3: `server/src/profile.ts` — read + update + avatar

**Files:** `server/src/profile.ts` (new)

Framework-agnostic: already-parsed bodies and the session token as plain values.
No Hono import. Every route starts with `authorize(sessionToken, 'profile')`.

- [ ] Row/DTO plumbing: a `ProfileRow` **type alias** (not an interface — pg's
      `query<T>` constrains `T` to `QueryResultRow`'s index signature, which
      interfaces don't implicitly satisfy; `favorites.ts` documents this), a
      `Profile` DTO in camelCase, and one `toProfile(row)` mapper. A
      `DEFAULT_PROFILE` constant (all nulls, both booleans `false`) for the
      no-row case.
- [ ] `getProfile(sessionToken)` — `SELECT … WHERE user_id = $1 AND deleted_at IS NULL`;
      `200 { profile: toProfile(row) ?? DEFAULT_PROFILE }`.
- [ ] Validators, each returning `string | null` (the `validateEmail`
      convention): `displayName` ≤ 60; `phone` ≤ 32, only `0-9 + - ( ) . space`,
      7–15 digits total; `location` ≤ 80; `favoriteNumber` ≤ 3, digits only;
      `fanSince` an integer in `[1883, currentSeasonYear]` where the upper bound
      is computed in `America/New_York` (the `chat.ts` idiom — the server has no
      `SEASON` constant and the host clock is UTC); `favoritePlayerId` a
      positive safe integer; both notify fields strict booleans. Trim every text field
      and normalize `''` → `null` so "cleared" has one representation.
- [ ] `updateProfile(requestBody, sessionToken)` — validate the **full** editable
      field set (not a patch), then
      `INSERT INTO user_profiles (…) VALUES (…) ON CONFLICT (user_id) DO UPDATE SET …, deleted_at = NULL, updated_at = now()`
      and return `200 { profile }` re-read through the same mapper. The avatar
      column is **not** in this statement's column list — an update must never
      clobber the avatar.
- [ ] `updateAvatar(requestBody, sessionToken)` — body `{ avatarDataUrl: string | null }`.
      Validate: `null` clears; otherwise the prefix matches
      `^data:image\/(png|jpeg|webp);base64,` (**never** `svg+xml`), total length
      ≤ 200,000 chars, and the payload after the comma is valid base64. Same
      upsert, avatar column only. Returns `200 { profile }`.
- [ ] DB errors → `console.error('<route> failed', err)` (**message and error
      only, never the body**) + `502 { error: 'profile unavailable' }`.
- [ ] `npm --prefix server run build` clean.

### Task 4: Password change + account deletion

**Files:** `server/src/profile.ts` (edit), `server/src/authRateLimit.ts` (edit),
`server/src/auth.ts` (edit — export only)

- [ ] `authRateLimit.ts`: add `checkPasswordChangeLimit(userId)` (5 / 15 min)
      and `clearPasswordChangeLimit(userId)` using the existing
      `prune`/`isOverLimit`/`consume` helpers and a new module-scope Map. Keyed
      by **user id, not IP** — see spec. `429 { error: 'Too many password change attempts — wait 15 minutes and try again.' }`.
- [ ] `auth.ts`: export the existing `SESSION_TTL_SECONDS`-adjacent password
      rules so `profile.ts` reuses them rather than re-deriving the 8/200-char
      bounds — export `validatePassword` (and `MIN_PASSWORD_CHARS` if the
      message needs it). No behavior change to signup/login.
- [ ] `changePassword(requestBody, sessionToken)`:
      authorize → `checkPasswordChangeLimit(userId)` → validate `newPassword`
      via the shared validator → `400` if `newPassword === currentPassword` →
      `SELECT password_hash` → `verifyPassword` → `401 { error: 'current password is incorrect' }`
      → `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2` →
      revoke every **other** session:
      `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND token_hash <> $2 AND revoked_at IS NULL`
      (`hashSessionToken(sessionToken)` for the exclusion, so the caller stays
      signed in) → `clearPasswordChangeLimit(userId)` → `200 { ok: true }`.
- [ ] `deleteAccount(requestBody, sessionToken, isHttps)`:
      authorize → verify `password` → `401` on mismatch → then **one
      transaction** over a single checked-out client:
      ```
      const client = await pool.connect()
      try { await client.query('BEGIN')
            users.deleted_at = now() WHERE id = $1
            sessions.revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL
            favorite_players.deleted_at = now(), updated_at = now() WHERE user_id = $1 AND deleted_at IS NULL
            user_profiles.deleted_at = now(), updated_at = now() WHERE user_id = $1 AND deleted_at IS NULL
            await client.query('COMMIT') }
      catch { await client.query('ROLLBACK'); throw }
      finally { client.release() }
      ```
      Return `200 { ok: true }` **plus the cleared session cookie** —
      `serializeCookie(SESSION_COOKIE_NAME, '', { secure: isHttps, maxAgeSeconds: 0 })`,
      i.e. the same builder `logout` uses. This is the first transaction in this
      backend; `pool.query()` cannot be used for it (each call may land on a
      different client).
- [ ] `npm --prefix server run build` clean.

### Task 5: Wire routes into both runtimes

**Files:** `server/src/app.ts` (edit), `api/index.ts` (edit)

- [ ] `app.ts`: `app.get('/profile', …)` plus `app.post('/profile/update' | '/profile/avatar' | '/profile/password' | '/profile/delete', …)`.
      Each POST needs the same malformed-JSON try/catch → `400` as
      `/signup`/`/favorites/add`. Session token via
      `sessionTokenFrom(c.req.header('cookie'))`; `/profile/delete` also needs
      `isHttpsFrom(c.req.header('x-forwarded-proto'))`. `reply()` already
      appends `result.cookies`, so no change there.
- [ ] `api/index.ts`: branch on `first === 'profile'` with `rest[0]` for the
      sub-route (`rest.length === 0` for the GET) — the same second-segment
      inspection favorites introduced. `req.body` used directly (Vercel
      pre-parses). No `vercel.json` change; the `/api/:path*` rewrite covers it.
- [ ] Confirm the ~150KB avatar body is accepted by both runtimes (well under
      Vercel's 4.5MB request cap and Node's default).
- [ ] `npm --prefix server run build` clean; standalone type-check of
      `api/index.ts` (neither build covers it).

### Task 6: Frontend types, API client, avatar helper

**Files:** `src/types/profile.ts` (new), `src/api/profile.ts` (new),
`src/utils/avatar.ts` (new)

- [ ] `types/profile.ts`: `Profile` — every field nullable except
      `notifyDailyBriefing`/`notifyGameReminders`. Plus a
      `ProfileUpdate` type for the update payload (the `Profile` minus
      `avatarDataUrl`).
- [ ] `api/profile.ts`, mirroring `src/api/favorites.ts` exactly (bare `fetch`,
      `credentials: 'include'`, two-step error handling preferring the backend's
      `{ error }`, with the 401/503 special cases):
      `fetchProfile(): Promise<Profile | null>` fails soft to `null`;
      `updateProfile`, `updateAvatar`, `changePassword`, `deleteAccount` all
      **reject** on failure so the form can show the message.
- [ ] `utils/avatar.ts`: `fileToAvatarDataUrl(file: File): Promise<string>` —
      reject non-`image/*` and > 8MB before decoding, then `createImageBitmap`
      → `<canvas>` scaled so the long edge is ≤ 256 → `toDataURL('image/jpeg', 0.82)`.
      Always `close()` the bitmap. Throws `Error` with a user-facing message.
- [ ] `npm run build` (`tsc -b`) clean.

### Task 7: `ProfileModal` + header wiring

**Files:** `src/components/ProfileModal.tsx` (new),
`src/components/AuthWidget.tsx` (edit), `src/components/Header.tsx` (edit),
`src/App.tsx` (edit)

- [ ] `App.tsx`: `const [profile, setProfile] = useState<Profile | null>(null)`;
      an effect keyed on `user` that sets `null` when signed out and otherwise
      `fetchProfile().then(setProfile)` (never rejects, so no `.catch`); pass
      `profile` and `setProfile` down through `Header`. After a successful
      account deletion, call `setUser(null)` — the existing effects then clear
      favorites and profile in one pass.
- [ ] `Header.tsx`: thread `profile`/`onProfileChange` through to `AuthWidget`,
      exactly as it already threads `user`/`onAuthChange`. No layout change
      beyond the trigger swap below.
- [ ] `AuthWidget.tsx`: in the signed-in branch, replace the bare email `<span>`
      with a button (avatar `<img>` when `profile.avatarDataUrl` is set, else an
      initials circle derived from display name or email; then the display name
      falling back to the email, `hidden sm:inline` as the email is today) that
      opens `ProfileModal`. `aria-label="Open profile"`. **Sign out stays where
      it is.** Signed-out rendering is untouched.
- [ ] `ProfileModal.tsx`: mechanics copied from `AuthWidget`'s modal — backdrop
      click closes, Escape closes via a `useEffect` keydown listener,
      `role="dialog" aria-modal="true"`, `stopPropagation` on the panel, and the
      explicit `text-gray-900` on the panel (load-bearing: it renders inside the
      `text-white` header). Full-screen sheet below `sm`, centered
      `max-w-lg` panel above, body scrollable.
      Sections:
      - **You** — avatar (current image or initials, "Change photo" file input,
        "Remove" when one exists; saves via `updateAvatar` immediately on pick,
        with a "Working…" state), display name, phone, hometown.
      - **Phillies** — favorite player `<select>` populated from `fetchRoster()`
        (fetched once when the modal opens; the select degrades to disabled with
        the current value if that fetch fails), favorite number, fan since.
      - **Notifications** — two checkboxes, under a literal line: *"We don't send
        anything yet — this saves your preference for when we do."* (see spec).
      - **Account** — change-password form (current, new, confirm; confirm is
        client-side only), and a delete-account flow behind a "Delete account"
        button that reveals a confirm block requiring the password **and** the
        typed word `DELETE`, with copy that says what actually happens (account
        closed, email freed, data no longer shown).
      One Save button covers You + Phillies + Notifications; avatar, password,
      and delete each have their own submit and their own `role="alert"` error
      line. On a successful save, replace local form state from the server's
      returned profile (per the frontend rules — no stale form).
- [ ] `npm run lint` and `npm run build` clean.

### Task 8: Docs

**Files:** `CLAUDE.md` (edit), `.superpowers/sdd/progress.md` (edit)

- [ ] `CLAUDE.md`: a "User profile" paragraph at the density of the existing Auth
      and Favorites sections — the `user_profiles` table and why its unique index
      is non-partial *and* why the row is created lazily, the five routes and
      their 401-not-fail-soft contract, why the avatar is a base64 column rather
      than object storage (and why `svg+xml` is excluded), the first-transaction
      note on account deletion, the user-id-keyed password-change limiter, and
      the fact that notification preferences are stored but inert. Update the
      `src/components/` inventory and `api/index.ts`'s route list.
- [ ] `.superpowers/sdd/progress.md`: new `user-profile` ledger entry in the
      established format (Plan/Spec links, base commit, per-task notes,
      deviations, verification summary).

### Task 9: Verification

**curl against `npm run dev:server` on `:8080`, with a cookie jar:**
- [ ] `GET /api/profile` with no cookie → `401` (**not** a default profile —
      proves the deliberate divergence from `/me`).
- [ ] Fresh throwaway account → `GET /api/profile` returns the all-defaults
      profile with **no row** in `user_profiles` (confirm in Neon).
- [ ] `update` with every field set → `200`, row now exists, values round-trip.
- [ ] `update` again with `""` in every text field → all stored as `NULL`, not
      empty strings.
- [ ] Validation matrix, each `400` with the field named: 61-char displayName;
      `phone` of `"abc"`, `"12345"` (too few digits), 20 digits (too many);
      4-char favoriteNumber; non-digit favoriteNumber; `fanSince` of 1882 and
      of next year; `favoritePlayerId` of `0`, `-1`, `"abc"`;
      `notifyDailyBriefing: "yes"`.
- [ ] Avatar: valid small JPEG data URL → `200` and stored; a second `update`
      (no avatar in payload) → avatar **still present** (proves update never
      clobbers it); `{ avatarDataUrl: null }` → cleared; an
      `data:image/svg+xml;base64,…` payload → `400`; a 250k-char payload → `400`.
- [ ] Password: wrong current → `401`; new password of 7 chars → `400`; new ===
      current → `400`; valid change → `200`, **old cookie from a second login
      is rejected while the calling cookie still works** (verify with two cookie
      jars); sixth attempt within 15 min → `429`; a successful change clears the
      bucket.
- [ ] Delete: wrong password → `401`; correct → `200` with a clearing
      `Set-Cookie`, and in Neon: `users.deleted_at` set, all `sessions` revoked,
      all `favorite_players` and the `user_profiles` row soft-deleted. Then
      `GET /api/me` with the old cookie → `{ user: null }`, and **signing up
      again with the same email succeeds** (proves the partial index frees it)
      and starts with a clean, empty favorites list and default profile.
- [ ] Transaction rollback: force a failure mid-delete (temporarily point one
      statement at a non-existent column) and confirm **nothing** was written —
      `users.deleted_at` still null. Revert the sabotage.
- [ ] Cross-account isolation: two accounts, different profiles; each `GET`
      returns only its own, and A's `update` never touches B's row.
- [ ] Fail-soft: restart `dev:server` with `env -u DATABASE_URL` → all five
      routes `503`, and `/health`, `/mlb/*`, `/odds` unaffected.
- [ ] `npx vercel dev` (with `DATABASE_URL` exported into its shell — it does
      **not** read `.env.local`) repeating the happy paths, confirming the
      multi-segment `profile/*` routing works in that router **and** that a
      150KB avatar body survives it.
- [ ] Delete every test account and row afterward.

**webapp-testing (Playwright) — required before this is done, per CLAUDE.md:**
- [ ] Signed out: header identical to today, no profile trigger, no modal
      (screenshot).
- [ ] Sign in → header shows the initials circle and the email; open the modal;
      fill every field; Save → success state, modal reflects saved values.
- [ ] **Full page reload** → header shows the saved display name, and reopening
      the modal shows the saved values (proves the DB round-trip).
- [ ] Upload a large (>1MB) photo → header and modal show it, and the request
      body sent is ≤ 200k chars (proves client-side downscaling actually ran;
      read it off the network request, not from source).
- [ ] Remove the photo → falls back to the initials circle.
- [ ] Change password → succeeds; sign out; old password fails, new password
      works.
- [ ] Delete account → signed out immediately, header back to "Sign In",
      favorites gone; sign up again with the same email → succeeds with an empty
      profile and no stars.
- [ ] Failure path: intercept `/api/profile/update` with a 500 → the modal shows
      the error and does **not** close or claim success.
- [ ] Escape and backdrop click both close the modal; focus is visible on every
      control; the modal's inputs have visible carets (the `text-gray-900`
      trap `AuthWidget` documents).
- [ ] 375px viewport: the modal is a usable full-screen sheet, the header row
      doesn't wrap or overflow with a long display name, 0px horizontal page
      overflow (screenshot).
- [ ] Zero console errors throughout; screenshots reviewed visually, not just
      asserted on.
- [ ] Known trap from the roster-tab run: `wait_until='networkidle'` **never**
      settles on this app (the LaunchDarkly client holds an SSE stream open) —
      use `'domcontentloaded'` plus an explicit wait.
- [ ] Record findings/deviations in `CLAUDE.md` and the ledger (Task 8).
