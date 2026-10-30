-- migrations/0004_admin_telemetry.sql
--
-- DOCUMENTATION ONLY — like 0003, this file is not run by a deploy, a test or CI
-- (this database has no `d1_migrations` table, so `wrangler d1 migrations apply`
-- would try to replay 0001-0003). The runtime mechanism is the Worker:
-- `TELEMETRY_DDL` in cloudflare-telemetry.js is executed by
-- `ensureTelemetryTables(env)`, which the internal admin API and the daily cron
-- call once per isolate. This file is the readable, reviewable copy of exactly
-- those statements. `tests/adminTelemetry.test.ts` asserts the two lists agree,
-- because a drift is a column the panel reads and the deploy never created.
--
-- ADDITIVE ONLY. Five new tables and their indexes. Nothing existing is renamed,
-- altered or dropped.

-- 1. One row per AI call (attempts, latency, outcome, never text).
CREATE TABLE IF NOT EXISTS ai_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  route TEXT,
  provider TEXT,
  model TEXT,
  key_id TEXT,
  kind TEXT,
  status INTEGER,
  latency_ms INTEGER,
  fallback INTEGER DEFAULT 0,
  scenario TEXT,
  level TEXT,
  user_id TEXT,
  release TEXT,
  turn_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_events_ts ON ai_events (ts);
CREATE INDEX IF NOT EXISTS idx_ai_events_kind ON ai_events (kind, ts);
CREATE INDEX IF NOT EXISTS idx_ai_events_route ON ai_events (route, ts);
CREATE INDEX IF NOT EXISTS idx_ai_events_turn ON ai_events (turn_id);
CREATE INDEX IF NOT EXISTS idx_ai_events_key ON ai_events (key_id, ts);

-- 2. One row per API request (route, status, latency; no body, no query string).
CREATE TABLE IF NOT EXISTS route_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  route TEXT,
  method TEXT,
  status INTEGER,
  kind TEXT,
  latency_ms INTEGER,
  user_id TEXT,
  release TEXT
);
CREATE INDEX IF NOT EXISTS idx_route_events_ts ON route_events (ts);
CREATE INDEX IF NOT EXISTS idx_route_events_route ON route_events (route, ts);

-- 3. Conversation turns. Text columns stay NULL unless the owner's master switch
--    is ON and the learner has not opted out; text is redacted before it is
--    written and scrubbed at 90 days (metrics survive).
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_id TEXT UNIQUE,
  session_id TEXT,
  turn_no INTEGER,
  ts INTEGER NOT NULL,
  ts_local TEXT,
  user_id TEXT,
  plan TEXT,
  scenario TEXT,
  level TEXT,
  opener_id TEXT,
  learner_text TEXT,
  reply_text TEXT,
  hints TEXT,
  corrections TEXT,
  word_cards TEXT,
  device TEXT,
  os TEXT,
  browser TEXT,
  app_version TEXT,
  locale TEXT,
  country TEXT,
  outcome TEXT,
  guard TEXT,
  latency_ms INTEGER,
  provider TEXT,
  model TEXT,
  flagged INTEGER DEFAULT 0,
  note TEXT,
  redacted INTEGER DEFAULT 0,
  deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_conversations_ts ON conversations (ts);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations (user_id, ts);
CREATE INDEX IF NOT EXISTS idx_conversations_scenario ON conversations (scenario, ts);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations (session_id, turn_no);

-- 4. Every provider attempt behind one turn (rotation/failover evidence).
CREATE TABLE IF NOT EXISTS conversation_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_id TEXT,
  ts INTEGER NOT NULL,
  provider TEXT,
  model TEXT,
  key_id TEXT,
  kind TEXT,
  status INTEGER,
  latency_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_conversation_attempts_turn ON conversation_attempts (turn_id);

-- 5. Every admin mutation (flag, delete, export, provider disable, sweep).
CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  actor TEXT,
  action TEXT,
  target TEXT,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_ts ON admin_audit (ts);
