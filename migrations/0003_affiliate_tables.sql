-- migrations/0003_affiliate_tables.sql
--
-- DOCUMENTATION ONLY — there is no migration runner, and this file is not run by
-- a deploy, a test or CI. The runtime mechanism is the Worker: `AFFILIATE_TABLES`
-- in cloudflare-affiliate.js is appended to `ensureLedgerTables`, which runs
-- `CREATE TABLE IF NOT EXISTS` on the first request after a deploy. This file is
-- the readable, reviewable copy of exactly those statements — one place to see
-- the affiliate schema without reading a 700-line module.
--
-- ADDITIVE ONLY. Three new tables and one partial unique index. Nothing in the
-- existing ledger, registry or curriculum schema is renamed, altered or dropped;
-- the in-app referral rewards (`REF-` codes, `referral_payouts`,
-- `referral_lesson_payouts`) are a different system and stay untouched.

-- SECTION 1 — the DDL (verbatim from AFFILIATE_TABLES)
-- ====================================================

CREATE TABLE IF NOT EXISTS affiliates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  payout_method TEXT NOT NULL,
  payout_details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referrals (
  referred_account_id TEXT PRIMARY KEY,
  affiliate_id INTEGER NOT NULL,
  attributed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER NOT NULL,
  referred_account_id TEXT NOT NULL,
  order_ref TEXT NOT NULL UNIQUE,
  net_amount INTEGER NOT NULL,
  rate REAL NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  activated_at TEXT,
  approve_after TEXT,
  paid_at TEXT,
  payout_ref TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS commissions_one_per_referral
  ON commissions (referred_account_id)
  WHERE order_ref NOT LIKE 'refund:%';

-- SECTION 2 — why each table is shaped this way
-- =============================================
--
-- affiliates      One row per approved partner. `code` is the public handle,
--                 stored upper-case (the Worker normalises, never "cleans");
--                 `contact` is the email the self-referral check compares
--                 against, `payout_method` one of the four strings in
--                 AFFILIATE_CONFIG, `payout_details` the free-text account the
--                 owner pays to. `status` is `active` | `paused`.
--
-- referrals       `referred_account_id` is the PRIMARY KEY, which is what makes
--                 "first valid ref wins" true under a race: the signup path uses
--                 INSERT … ON CONFLICT(referred_account_id) DO NOTHING, so the
--                 first attribution is the one that survives. Attribution is by
--                 account, never by browser.
--
-- commissions     One original row per referred account (`order_ref` UNIQUE plus
--                 the partial index above), plus negative `refund:<order_ref>`
--                 rows when money was already paid out. `amount` and
--                 `net_amount` are integer cents: 20% of what was actually
--                 received, rounded once. `status` walks
--                 pending → approved → paid, or pending → void on a refund
--                 before payout. `approve_after` is activation + 14 days; the
--                 daily cron and the lazy admin read flip due rows.
--
-- The partial index deliberately excludes `refund:` rows so a refunded order can
-- be recorded as a deduction without colliding with the one-original rule.

-- SECTION 3 — live state
-- ======================
--
-- These tables are created automatically by the Worker on the first request after
-- the deploy that ships cloudflare-affiliate.js. To confirm what production has
-- (owner, read-only):
--
--   npx wrangler d1 execute katzu-content --remote \
--     --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('affiliates','referrals','commissions')"
--
-- Expected: three rows. The affiliate endpoints answer 503 `unavailable` (ref
-- check) or `affiliate_ledger_unavailable` (admin) until the tables exist, so a
-- missing table is visible rather than a silent empty ledger.
