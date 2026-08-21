---
title: User Profile
date: 2026-08-21
status: draft
---

## Summary

Signed-in users get a profile: a display name, phone number, hometown, a few
Phillies-fan details (favorite player, favorite jersey number, fan-since year),
an avatar, and two notification preferences. Everything persists per-account in
a new `user_profiles` Neon table. The profile is edited in a modal opened from
the header — the same surface that today shows nothing but the raw email
address — and that modal is also where the account itself is managed: change
password, and delete account.

Signed-out visitors see the app exactly as it is today. This is the second
feature to *use* the account primitive from
[email-auth](2026-08-06-email-auth-design.md), after
[favorite-players](2026-08-06-favorite-players-design.md).

## Motivation

Sign-in currently produces one visible artifact: `savielloj@gmail.com` rendered
in the header, truncated at 14rem. The account has no identity attached to it,
so there is nothing to *be* signed in as. A profile turns the account from a
key into a person, and it's the natural home for the account-management
operations (password change, deletion) that auth shipped without.

Deleting an account is also the feature `001_users_and_sessions.sql` was already
written for: its `users_email_key` index is partial (`WHERE deleted_at IS NULL`)
specifically so "a future account-deletion feature could free the address." This
is that feature.

## Architecture

```
App.tsx ── user + profile state (both cleared on sign-out)
  │
  ├─ GET  /api/profile           ──▶ server/src/profile.ts::getProfile        ─┐
  ├─ POST /api/profile/update    ──▶ server/src/profile.ts::updateProfile      │
  ├─ POST /api/profile/avatar    ──▶ server/src/profile.ts::updateAvatar       ├─▶ pg.Pool ─▶ Neon
  ├─ POST /api/profile/password  ──▶ server/src/profile.ts::changePassword     │   user_profiles
  └─ POST /api/profile/delete    ──▶ server/src/profile.ts::deleteAccount     ─┘   (+ users, sessions,
           (all five authenticate via the existing session cookie)                  favorite_players)
  │
  └─▶ <Header profile={…}> ──▶ <AuthWidget> ──▶ <ProfileModal profile={…} onProfileChange={…} />
           avatar + display name replace the bare email span
```

- **New framework-agnostic `server/src/profile.ts`**, same `RouteResult`
  contract as `auth.ts`/`favorites.ts`/`chat.ts`: already-parsed bodies and the
  session token as plain values, no Hono import, called identically from
  `server/src/app.ts` (k8s) and `api/index.ts` (Vercel).
- **Profile state lives in `App.tsx`, next to `user` and `favorites`**, loaded
  by an effect keyed on `user` so it also runs right after sign-in and clears on
  sign-out — byte-for-byte the arrangement favorites already uses. The header
  needs it (avatar + name) and the modal needs it, and the modal unmounts every
  time it closes.
- **Mutations return the full saved profile**, not an ack, so the client
  replaces state from one authoritative response and can never drift. Same rule
  as the favorites routes.
- **Authentication reuses the session cookie.** No new mechanism. The
  `authorize()` preamble currently private to `favorites.ts` is lifted into a
  shared `server/src/authorize.ts` (parameterized by feature name so the
  existing `'favorites not configured'` string is unchanged) — a refactor of
  existing code, exactly like the `resolveSessionUser` extraction that favorites
  did to `auth.ts`.
- **No new npm dependencies.** No image library, no upload SDK, no form library,
  no validation library. Hand-rolled validators returning `string | null`,
  matching `auth.ts`'s `validateEmail`.

## Data model

`server/migrations/003_user_profiles.sql`:

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,                -- plain uuid, no FK (repo convention)
  display_name TEXT,
  phone TEXT,
  location TEXT,
  favorite_player_id INTEGER,           -- MLB Stats API personId
  favorite_number TEXT,                 -- jersey number; TEXT, see below
  fan_since INTEGER,                    -- season year
  avatar_data_url TEXT,                 -- data:image/…;base64,… see below
  notify_daily_briefing BOOLEAN NOT NULL DEFAULT false,
  notify_game_reminders BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX user_profiles_user_key ON user_profiles (user_id);
```

Five decisions worth stating outright:

- **A separate table, not columns on `users`.** `users` is the credential row —
  it is read by `resolveSessionUser` on every authenticated request, and its
  only two other columns are the email and the scrypt hash. Profile data is
  read on exactly one route, is nullable throughout, and includes a ~30KB
  avatar. Keeping them apart means a profile write can never touch a
  credential row, and account deletion can drop profile data independently of
  the row that owns the email.
- **The unique index is *not* partial**, same as `favorite_players_user_player_key`
  and for the same reason: saving a profile is a single race-safe
  `INSERT … ON CONFLICT (user_id) DO UPDATE`, and a partial index would not
  conflict against a soft-deleted row, so a user who deleted and re-created a
  profile would accumulate duplicates. (`users_email_key` is partial for the
  opposite reason — there, freeing the value for reuse is the point.)
- **The row is created lazily, on first save.** Signup is untouched: no profile
  insert, no transaction, no new failure mode on the one path that must keep
  working. `GET /api/profile` returns an all-defaults profile when no row
  exists, so the client never has to distinguish "no profile yet" from "empty
  profile."
- **`favorite_number` is TEXT, not INTEGER.** `"00"` and `"0"` are different
  jersey numbers and both are real; an integer column silently collapses them.
- **`fan_since` is bounded at 1883**, the year the Phillies were founded — the
  earliest honest answer to "fan since." The upper bound is the current season
  year computed in `America/New_York`, the same idiom `buildSystemPrompt` in
  `chat.ts` uses — the server has no `SEASON` constant (that lives in
  `src/api/mlb.ts`, client-side), and a bare `new Date().getFullYear()` reads
  the host clock, which is UTC in both containers.

Soft delete (`deleted_at`) is kept for consistency with `users`/`sessions`/
`favorite_players`; every read filters `deleted_at IS NULL`, and every write
sets `updated_at = now()` explicitly (there is no trigger in this schema).

### Avatar storage

The avatar is a base64 `data:` URL in a TEXT column, capped at 200,000
characters (~150KB decoded). The browser downscales any picked file to at most
256×256 and re-encodes it as JPEG at q0.82 before it is ever sent, which lands
around 15–25KB in practice.

This is deliberately not object storage. Neon object storage or S3 would mean a
new service, a new credential in two deploy targets and a k8s Secret, a signed
URL scheme, and an orphan-cleanup story — for one small square image per user
on a single-team stats app. A TOASTed TEXT column costs nothing and deletes
itself with the row. The accepted price is that `GET /api/profile` carries the
image (see caveats).

The server validates the prefix (`data:image/png|jpeg|webp;base64,`) and the
length, and re-checks that the payload is valid base64 — it does **not** decode
and re-encode the image. That means a hostile client can store bytes that are
not really a JPEG. Those bytes are only ever handed back to the same user's own
browser inside an `<img src>`, which will simply fail to render, so the blast
radius is a broken avatar for the person who uploaded it. An SVG data URL would
be a real problem (scriptable), which is exactly why `image/svg+xml` is not in
the allowlist.

## API contract

All five routes require a valid session cookie and use the existing
`{ error: string }` error shape. `401 { error: 'sign in required' }` when the
session is missing/expired and `503 { error: 'profile not configured' }` when
`DATABASE_URL` is absent — the favorites contract, deliberately **not**
`/api/me`'s fail-soft one (`/me` fails soft because it is the thing that
*decides* sign-in state; these are only ever called once that is known).

- `GET /api/profile` → `200 { profile: Profile }`. Returns defaults (all nulls,
  both notification prefs `false`) when the user has no row yet.
- `POST /api/profile/update` — body is the full editable field set (not a
  patch): `{ displayName, phone, location, favoritePlayerId, favoriteNumber,
  fanSince, notifyDailyBriefing, notifyGameReminders }`. Every text field
  accepts `null` or `""` to clear; `""` is normalized to `null` on write so
  "cleared" has exactly one representation in the database.
  → `200 { profile }` with the saved row. `400 { error }` naming the offending
  field on any validation failure.
  **The avatar is not in this payload** — a name edit is a ~200-byte request,
  not a 150KB one, and the two have completely different validation.
- `POST /api/profile/avatar` — body `{ avatarDataUrl: string | null }`, where
  `null` clears the avatar. → `200 { profile }`, `400 { error }` on a bad prefix
  or over-length payload.
- `POST /api/profile/password` — body `{ currentPassword, newPassword }`.
  → `200 { ok: true }`. `401 { error: 'current password is incorrect' }`,
  `400` when the new password fails `auth.ts`'s existing rules or is identical
  to the current one, `429` when rate-limited.
  On success it revokes **every other session for that user** (`token_hash <>`
  the caller's) and leaves the caller signed in. It does not return the profile
  — nothing about the profile changed.
- `POST /api/profile/delete` — body `{ password }`. → `200 { ok: true }` plus a
  clearing session cookie, so the browser is signed out in the same response.
  `401` on a wrong password.

Field limits (all enforced server-side, mirrored as `maxLength` in the form):
`displayName` ≤ 60, `phone` ≤ 32 and must contain 7–15 digits with only
`0-9 + - ( ) . space` present, `location` ≤ 80, `favoriteNumber` ≤ 3 and digits
only, `fanSince` an integer in `[1883, currentSeasonYear]`, `favoritePlayerId` a
positive safe integer, both notification fields strict booleans.

JSON stays camelCase (`displayName`, `favoritePlayerId`), matching
`{ playerId, playerName }` and `{ user: { id, email } }`; the snake_case↔camelCase
mapping happens in `profile.ts` where the rows are read.

### Account deletion

Deletion is a **soft delete across four tables**, in one transaction:

```
users.deleted_at             = now()   -- frees the email via the partial index
sessions.revoked_at          = now()   -- for every live session of that user
favorite_players.deleted_at  = now()
user_profiles.deleted_at     = now()
```

This is the first transaction anywhere in this backend. Every other write is a
single statement where a partial failure is harmless; here a partial failure
leaves an account that is signed out but still owns its email, or a deleted
account with live sessions. It uses an explicit `pool.connect()` +
`BEGIN`/`COMMIT`/`ROLLBACK` with `client.release()` in a `finally` — the pool
hands out one client per checkout, and running `BEGIN` through `pool.query()`
would put the transaction on an arbitrary client and the next statement on a
different one.

Soft rather than hard delete, matching every other table: the email is freed
immediately by the partial unique index (so the user can sign up again with the
same address and get a fresh user id, which is why the non-partial
`favorite_players` index causes no conflict on a second signup), while the rows
stay recoverable if someone deletes by mistake. The UI must not promise more
than that — it says the account is closed and its data will no longer appear,
not that every byte has been shredded.

## Rate limiting

`server/src/authRateLimit.ts` gains one more fixed-window bucket in the same
module-scope Map idiom: **5 password-change attempts per 15 minutes, keyed by
user id.** The threat is not an anonymous attacker (these routes need a valid
session) — it is someone holding a stolen or borrowed session cookie
brute-forcing the current password in order to change it and lock the real owner
out. Keying by user id rather than IP is deliberate: the session is the thing
being abused, and the attacker controls their own IP. A successful change clears
the bucket, matching `clearLoginLimit`.

Same k8s-hard / Vercel-best-effort caveat as every other limiter here.
No limiter on `GET /api/profile` or `/update` (a valid session, a single row).

## Frontend

- `src/types/profile.ts` (new) — the `Profile` interface, all fields nullable
  except the two booleans.
- `src/api/profile.ts` (new) — `fetchProfile`, `updateProfile`, `updateAvatar`,
  `changePassword`, `deleteAccount`. Same bare-`fetch` + `credentials: 'include'`
  + two-step error handling as `src/api/favorites.ts`. `fetchProfile` fails soft
  to `null` (mirroring `fetchCurrentUser`); the four mutations reject so the form
  can surface the backend's message.
- `src/utils/avatar.ts` (new) — `fileToAvatarDataUrl(file)`. Rejects
  non-`image/*` and files over 8MB *before* decoding, then
  `createImageBitmap` → `<canvas>` at ≤256px on the long edge → `toDataURL('image/jpeg', 0.82)`.
  No dependency; `createImageBitmap` and canvas are both baseline in every
  browser this app already requires.
- `src/components/ProfileModal.tsx` (new) — the profile page. Full-screen sheet
  below `sm`, centered panel above, following `AuthWidget`'s modal mechanics
  exactly (backdrop click closes, Escape closes, `role="dialog" aria-modal`,
  `stopPropagation` on the panel, and the explicit `text-gray-900` that
  `AuthWidget` documents as load-bearing — this modal also renders inside the
  white-on-navy header). Four sections: **You** (avatar, display name, phone,
  hometown), **Phillies** (favorite player, favorite number, fan since),
  **Notifications** (two checkboxes), **Account** (change password, delete
  account). One Save button covers the first three sections; the avatar saves on
  pick, and password/delete are their own forms with their own buttons and their
  own error lines.
- `src/components/AuthWidget.tsx` (edit) — the signed-in branch's bare email
  span becomes a button (avatar circle or initials, plus the display name
  falling back to the email, name hidden below `sm`) that opens `ProfileModal`.
  Sign out stays where it is; moving it into the modal would turn a one-click
  action into three.
- `src/components/Header.tsx` (edit) — threads `profile`/`onProfileChange`
  through to `AuthWidget`, exactly as it already threads `user`/`onAuthChange`.
- `src/App.tsx` (edit) — `const [profile, setProfile] = useState<Profile | null>(null)`,
  an effect keyed on `user` that clears it on sign-out and calls `fetchProfile()`
  otherwise, and `onAuthChange(null)` after a successful account deletion so the
  header, favorites, and profile all reset in one pass.

The favorite-player field is a `<select>` populated from the existing
`fetchRoster()`, not a free-text box: the column stores an MLB `personId`, and
a text field would either store an unresolvable string or need a search
endpoint that doesn't exist.

## Deploy & secrets

Nothing new. `DATABASE_URL` is already wired into
`k8s/base/api-deployment.yaml` (`optional: true`) and the Vercel dashboard, and
`pg` is already in both `package.json`s. The only out-of-band step is applying
the migration against Neon. k8s still needs `pipeline.sh` to pick up the backend
change; a push to `develop` deploys Vercel production automatically.

## Feature flag

**None** — same call as email-auth and favorite-players, and for the same
reason: this is additive UI that is invisible to signed-out visitors and cannot
break an existing feature. If one is wanted anyway, note the trap already
recorded in `CLAUDE.md` for `enable-bullpen-usage`: a LaunchDarkly flag created
with targeting **off** serves `offVariation` (`false`) to every client that
connects successfully, so it must be created with targeting **on** or it hides
the feature in production for everyone.

## Accepted caveats

- **Notification preferences are stored but do nothing.** This app sends no
  email and no push, and adding a mail provider is a much larger feature. The
  section carries an explicit line saying so ("We don't send anything yet — this
  saves your preference for when we do") rather than implying a toggle has an
  effect it doesn't. Storing the intent now is cheap; pretending it works would
  be the same class of error as fabricating a playoff probability.
- **`GET /api/profile` carries the avatar**, so a signed-in page load costs one
  extra ~20KB request (alongside `/config`, `/me`, `/favorites`). That is
  smaller than the 31KB 40-man roster fetch the Roster tab already makes. A
  separate binary avatar route would avoid it, but `RouteResult` is JSON-only
  in both runtimes and adding binary support is a larger change than this saves.
- **No email verification and no phone verification.** Nothing is sent to either
  value, so neither can be verified; the phone number is a note to self, not a
  contact channel. Email remains unchangeable in this feature — changing it
  needs a verification flow to be worth anything.
- **Validation errors are one message at a time**, not a per-field map, matching
  the existing `{ error: string }` contract. The message names the field
  ("phone must contain 7 to 15 digits") and the modal shows it above Save.
- **The avatar is not re-encoded server-side**, so its bytes are trusted only to
  the extent described in the storage section above. `image/svg+xml` is
  excluded from the allowlist for exactly this reason.
- **Deletion is soft.** Rows remain in Neon with `deleted_at` set. The email is
  freed immediately; the data is not shredded. The confirmation copy says what
  actually happens.
- **No avatar on the favorites card, the chat widget, or anywhere else.** The
  header and the modal are the only two places identity is rendered.
- **Profiles are shared across deployments, sessions are not** — one Neon
  database backs both k8s and Vercel, but you still sign in separately on each
  domain, per the auth spec.
