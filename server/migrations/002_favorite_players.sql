-- Per-user starred players. See docs/superpowers/specs/2026-08-06-favorite-players-design.md
--
-- Apply once via:
--   npx neon psql -- -f server/migrations/002_favorite_players.sql
-- (psql is not installed locally; the Neon CLI ships an embedded psql fallback.)
--
-- No FK on user_id -- relationship integrity is enforced in server/src/favorites.ts,
-- same convention as sessions.user_id.

CREATE TABLE favorite_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,            -- plain uuid, no FK
  player_id INTEGER NOT NULL,       -- MLB Stats API personId
  player_name TEXT NOT NULL,        -- display snapshot; live name preferred when available
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Deliberately NOT partial, unlike users_email_key's WHERE deleted_at IS NULL.
-- On users that predicate exists so a deleted account frees its email for
-- someone else. Here the pair is already scoped to one user, and un-star /
-- re-star has to land on the SAME row: a partial index would not conflict
-- against a soft-deleted row, so every re-star would insert a duplicate. A full
-- unique index is what lets starring be a single race-safe
-- INSERT ... ON CONFLICT (user_id, player_id) DO UPDATE SET deleted_at = NULL.
CREATE UNIQUE INDEX favorite_players_user_player_key
  ON favorite_players (user_id, player_id);

CREATE INDEX favorite_players_user_active_idx
  ON favorite_players (user_id) WHERE deleted_at IS NULL;
