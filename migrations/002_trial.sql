-- Run once, after 001_quota.sql.
CREATE TABLE IF NOT EXISTS accounts (
  user_id TEXT PRIMARY KEY,
  trial_started_at INTEGER NOT NULL
);

ALTER TABLE trial_sessions ADD COLUMN day TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_trial_sessions_user_day ON trial_sessions(user_id, day);
