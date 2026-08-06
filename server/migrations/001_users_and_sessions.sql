-- Email/password auth schema. See docs/superpowers/specs/2026-08-06-email-auth-design.md
--
-- Apply once via:
--   npx neon psql -- -f server/migrations/001_users_and_sessions.sql
-- (psql is not installed locally; the Neon CLI ships an embedded psql fallback.)
--
-- gen_random_uuid() is a Postgres 13+ core builtin, no CREATE EXTENSION needed
-- on Neon. No FK constraints anywhere -- relationship integrity is enforced in
-- server/src/auth.ts, per this repo's schema conventions.

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,               -- always stored trim+lowercased by the app
  password_hash TEXT NOT NULL,       -- "<saltHex>:<hashHex>", scrypt
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Partial unique index excludes soft-deleted rows, so a future
-- account-deletion feature could let the email be reused later.
CREATE UNIQUE INDEX users_email_key ON users (email) WHERE deleted_at IS NULL;

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,             -- plain uuid, no FK
  token_hash TEXT NOT NULL,          -- sha256 hex of the raw cookie token
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ             -- set on logout; NULL = still live
);

CREATE UNIQUE INDEX sessions_token_hash_key ON sessions (token_hash);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
