import { describe, expect, it } from 'vitest';
import { buildBackfillPlan, normalizeKvEntries, toSqlStatements } from '../scripts/backfill-user-registry.mjs';

/**
 * Step 6 backfill tests. These run against an exported-KV FIXTURE, never
 * production: the point is that the plan is computed correctly and that the
 * generated SQL is additive and idempotent.
 */

const kvFixture = [
  // Legacy redeemer: has both an email_index and an account record.
  { key: 'email_index:legacy1@test.dev', value: 'sub-legacy-1' },
  {
    key: 'account:sub-legacy-1',
    value: JSON.stringify({ email: 'legacy1@test.dev', expiresAt: '2027-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }),
  },
  // Legacy redeemer whose email_index exists but whose account record is gone.
  { key: 'email_index:legacy2@test.dev', value: 'sub-legacy-2' },
  // Account record with no email_index (also recoverable).
  { key: 'account:sub-legacy-3', value: JSON.stringify({ email: 'legacy3@test.dev', expiresAt: null }) },
  // Unrelated keys that must be ignored.
  { key: 'code:DE-1M-ABCD1234-SIGVALUE', value: JSON.stringify({ account: 'sub-legacy-1' }) },
  { key: 'referrals:sub-legacy-1', value: '[]' },
  // Malformed / empty values must be reported, not silently dropped.
  { key: 'account:sub-broken', value: '{not json' },
  { key: 'email_index:', value: '' },
];

describe('Step 6: users-registry backfill plan', () => {
  it('merges email_index + account keys into distinct pro candidates', () => {
    const entries = normalizeKvEntries(kvFixture);
    const plan = buildBackfillPlan(entries, { existingUserIds: [] });

    expect(plan.stats.email_index_keys).toBe(2); // legacy1, legacy2 (empty one rejected)
    expect(plan.stats.account_keys_seen).toBe(3); // legacy-1, legacy-3, broken
    // The corrupt record is reported, NOT turned into a fabricated user row.
    expect(plan.stats.account_keys).toBe(2);
    expect(plan.candidates.map((c) => c.id)).not.toContain('sub-broken');
    expect(plan.stats.distinct_candidates).toBe(3);
    expect(plan.stats.would_insert).toBe(3);

    const byId = Object.fromEntries(plan.candidates.map((c) => [c.id, c]));
    expect(byId['sub-legacy-1'].plan).toBe('pro');
    expect(byId['sub-legacy-1'].email).toBe('legacy1@test.dev');
    expect(byId['sub-legacy-1'].plan_expires_at).toBe(Date.parse('2027-01-01T00:00:00.000Z'));
    // email_index-only candidate still recovers, with no expiry known.
    expect(byId['sub-legacy-2'].email).toBe('legacy2@test.dev');
    expect(byId['sub-legacy-2'].plan_expires_at).toBeNull();
    expect(byId['sub-legacy-3'].email).toBe('legacy3@test.dev');
  });

  it('ignores code:* and referral keys entirely', () => {
    const plan = buildBackfillPlan(normalizeKvEntries(kvFixture));
    expect(plan.candidates.every((c) => !c.id.startsWith('code:'))).toBe(true);
    const ids = plan.candidates.map((c) => c.id);
    expect(ids).not.toContain('DE-1M-ABCD1234-SIGVALUE');
  });

  it('reports malformed keys instead of fabricating rows', () => {
    const plan = buildBackfillPlan(normalizeKvEntries(kvFixture));
    const reasons = plan.stats.problems.map((p) => `${p.key}:${p.reason}`);
    expect(reasons).toContain('account:sub-broken:unparseable_account_json');
    expect(reasons).toContain('email_index::empty_email_or_value');
  });

  it('skips candidates that are already in the users table (idempotent re-run)', () => {
    const plan = buildBackfillPlan(normalizeKvEntries(kvFixture), {
      existingUserIds: ['sub-legacy-1', 'sub-legacy-3'],
    });
    expect(plan.stats.already_in_users_table).toBe(2);
    expect(plan.stats.would_insert).toBe(1);
    expect(plan.candidates.map((c) => c.id)).toEqual(['sub-legacy-2']);
  });

  it('states explicitly that never-redeeming free users cannot be backfilled', () => {
    const plan = buildBackfillPlan([]);
    expect(plan.unrecoverable.note).toMatch(/CANNOT be backfilled retroactively/);
    expect(plan.unrecoverable.count_estimable).toBe(false);
  });
});

describe('Step 6: generated SQL is additive and idempotent', () => {
  it('only ever INSERTs with ON CONFLICT merge semantics', () => {
    const plan = buildBackfillPlan(normalizeKvEntries(kvFixture));
    const sql = toSqlStatements(plan.candidates, 1_700_000_000_000);

    expect(sql).toContain('INSERT INTO users');
    expect(sql).toContain('ON CONFLICT(id) DO UPDATE SET');
    expect(sql).toContain('plan = \'pro\'');
    expect(sql).toContain('COALESCE(excluded.email, users.email)');
    // No destructive statements anywhere. Strip the header comment first — it
    // legitimately reads "No DROP / ALTER / DELETE".
    const executable = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(executable).not.toMatch(/\b(DROP|ALTER|RENAME|DELETE)\b/i);
    expect(executable).not.toMatch(/CREATE\s+/i);
  });

  it('escapes quote-bearing emails so the SQL cannot be broken out of', () => {
    const sql = toSqlStatements([{ id: 's1', email: "o'brien@test.dev", plan: 'pro', plan_expires_at: null }]);
    expect(sql).toContain("'o''brien@test.dev'");
    expect(sql).not.toContain("'o'brien");
  });

  it('renders NULL for unknown expiry and a concrete number when known', () => {
    const sql = toSqlStatements([
      { id: 'a', email: 'a@test.dev', plan: 'pro', plan_expires_at: 1800000000000 },
      { id: 'b', email: 'b@test.dev', plan: 'pro', plan_expires_at: null },
    ]);
    expect(sql).toContain('1800000000000');
    expect(sql).toMatch(/NULL, 'backfill'\)|NULL, 'backfill'\)/);
  });
});

describe('Step 6: normalizeKvEntries hardening', () => {
  it('tolerates non-arrays and non-string values', () => {
    expect(normalizeKvEntries(null)).toEqual([]);
    expect(normalizeKvEntries('nope')).toEqual([]);
    expect(normalizeKvEntries([{ key: 'a', value: 1 }, null, { nokey: true }])).toEqual([
      { key: 'a', value: '1' },
    ]);
  });
});
