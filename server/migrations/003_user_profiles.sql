-- Per-user profile data. See docs/superpowers/specs/2026-08-21-user-profile-design.md
--
-- Apply once via:
--   npx neon psql -- -f server/migrations/003_user_profiles.sql
-- (psql is not installed locally; the Neon CLI ships an embedded psql fallback.)
--
-- No FK on user_id -- relationship integrity is enforced in server/src/profile.ts,
-- same convention as sessions.user_id and favorite_players.user_id. Separate
-- table from users (rather than columns on it) so profile writes never touch
-- the credential row and account deletion can soft-delete this independently.

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,                -- plain uuid, no FK
  display_name TEXT,
  phone TEXT,
  location TEXT,
  favorite_player_id INTEGER,           -- MLB Stats API personId
  favorite_number TEXT,                 -- TEXT: "00" and "0" are different numbers
  fan_since INTEGER,
  avatar_data_url TEXT,                 -- data:image/{png,jpeg,webp};base64,... capped at 200k chars
  notify_daily_briefing BOOLEAN NOT NULL DEFAULT false,
  notify_game_reminders BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Deliberately NOT partial, unlike users_email_key. Saving a profile is a
-- single race-safe INSERT ... ON CONFLICT (user_id) DO UPDATE SET deleted_at =
-- NULL; a partial index would not conflict against a soft-deleted row, so a
-- user who deleted their account and signed up again with a new user_id would
-- never collide anyway, but a resurrected profile save (deleted_at cleared on
-- the same row) needs the pair to always resolve to one row. Same reasoning as
-- favorite_players_user_player_key.
CREATE UNIQUE INDEX user_profiles_user_key ON user_profiles (user_id);
