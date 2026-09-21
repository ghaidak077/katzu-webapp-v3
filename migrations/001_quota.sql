CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  turns INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS trial_sessions (
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  turns INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, session_id)
);
