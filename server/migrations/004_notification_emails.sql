-- Notification emails: the "on this day" opt-in, per-user unsubscribe tokens,
-- and the send ledger that keeps a re-run from mailing anyone twice.
--
-- Apply once via:
--   npx neon psql -- -f server/migrations/004_notification_emails.sql
-- (psql is not installed locally; the Neon CLI ships an embedded psql fallback.)

ALTER TABLE user_profiles
  ADD COLUMN notify_on_this_day BOOLEAN NOT NULL DEFAULT false,
  -- Generated lazily, the first time a user is actually mailed -- an opt-in
  -- that never results in a send never needs a token. Nullable for the same
  -- reason every existing profile row predates this column.
  ADD COLUMN unsubscribe_token TEXT;

-- Partial, unlike user_profiles_user_key: every row that predates this
-- migration (and every profile belonging to a user who has not been mailed)
-- holds NULL here, and a plain unique index would let exactly one of them
-- exist. This one only constrains rows that actually have a token.
CREATE UNIQUE INDEX user_profiles_unsubscribe_token_key
  ON user_profiles (unsubscribe_token)
  WHERE unsubscribe_token IS NOT NULL;

-- Append-only send ledger. Deliberately has no deleted_at, unlike every other
-- table here: soft delete exists so a row can be hidden and later restored,
-- and there is no such thing as un-sending an email. Account deletion leaves
-- these rows in place (they hold a user_id and a date, no profile content) --
-- the account's profile row is soft-deleted, so it stops being selected as a
-- recipient regardless.
CREATE TABLE email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,                -- plain uuid, no FK (repo convention)
  kind TEXT NOT NULL,                   -- 'daily' -- one combined email per day
  send_date DATE NOT NULL,              -- the America/New_York day the content is for
  status TEXT NOT NULL,                 -- 'sending' | 'sent' | 'failed'
  attempts INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The whole point of this table: the send loop claims a row here BEFORE
-- calling SendGrid, so a second run on the same day (a cron retry, a manual
-- curl, both deploy targets firing) finds the conflict and skips instead of
-- mailing the same recap twice.
CREATE UNIQUE INDEX email_sends_user_kind_date_key ON email_sends (user_id, kind, send_date);
