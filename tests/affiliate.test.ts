import { describe, expect, it } from 'vitest';
import pricingConfig from '../pricing.config.json';
import worker from '../cloudflare-unified-worker';
import {
  AFFILIATE_CONFIG,
  AFFILIATE_TABLES,
  approveAfterIso,
  approveDueCommissions,
  attachReferral,
  buildPayoutBatch,
  commissionCents,
  handleAffiliateRoutes,
  isApprovalDue,
  isSelfReferral,
  netAmountForMonths,
  nextPayoutDate,
  normalizeAffiliateCode,
  partnerCodeFromEmail,
  payoutCsv,
  recordAffiliateCommission,
  voidCommission,
} from '../cloudflare-affiliate';
import { AffiliateD1 } from './helpers/affiliateD1';

/**
 * The affiliate programme, as rules.
 *
 * WHY THIS SUITE EXISTS
 * The programme pays real money out of a ledger nobody looks at until payout
 * day. Every rule in `cloudflare-affiliate.js` is a sentence the owner promised
 * a partner — 20% of net, first order only, approved on day 14, $20 minimum
 * carried over, refunds voided or deducted — so each one is asserted here rather
 * than trusted to a manual check on the admin screen.
 *
 * WHAT IT DOES NOT PROVE
 * `AffiliateD1` is an in-memory double: it proves the code paths and the SQL
 * shapes, not D1's atomicity. Two racing signups are still guaranteed by the
 * real `PRIMARY KEY` / `ON CONFLICT DO NOTHING`, which a fake cannot demonstrate
 * (AGENTS §2). That stays UNPROVEN until exercised on a live database.
 */

const CORS = { 'Access-Control-Allow-Origin': 'https://website.katzuai.com' };
const SECRET = 'admin-secret-0123456789abcdef';

function freshDb(): AffiliateD1 {
  const db = new AffiliateD1();
  db.createAffiliateTables(AFFILIATE_TABLES);
  return db;
}

function seedAffiliate(db: AffiliateD1, overrides: Record<string, unknown> = {}): number {
  db.seed('affiliates', {
    code: 'SARA10',
    name: 'Sara',
    contact: 'sara@example.com',
    payout_method: 'Wise',
    payout_details: 'sara@example.com',
    status: 'active',
    created_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  });
  return Number(db.rows('affiliates').at(-1)?.id);
}

function seedCommission(db: AffiliateD1, overrides: Record<string, unknown> = {}): number {
  db.seed('commissions', {
    affiliate_id: 1,
    referred_account_id: 'acc-1',
    order_ref: 'KZ-ORDER-1',
    net_amount: 4999,
    rate: 0.2,
    amount: 1000,
    status: 'pending',
    activated_at: '2026-10-01T00:00:00.000Z',
    approve_after: '2026-10-15T00:00:00.000Z',
    paid_at: null,
    payout_ref: null,
    ...overrides,
  });
  return Number(db.rows('commissions').at(-1)?.id);
}

const refRequest = (body: unknown, method = 'POST') =>
  new Request('https://worker.test/affiliate/ref', {
    method,
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });

describe('a partner code', () => {
  it('is trimmed and upper-cased, never "cleaned"', () => {
    expect(normalizeAffiliateCode('  sara10 ')).toBe('SARA10');
    expect(normalizeAffiliateCode('Omar-2026')).toBeNull();
    expect(normalizeAffiliateCode('سارة')).toBeNull();
  });

  it('can be derived from the account, stably and within the pattern', () => {
    expect(partnerCodeFromEmail('new@example.com')).toBe('NEW');
    expect(partnerCodeFromEmail('  New@Example.com ')).toBe('NEW');
    expect(partnerCodeFromEmail('new@example.com', 1)).toBe('NEW1');
    expect(partnerCodeFromEmail('a@example.com')).toBe('AKZ');
    expect(partnerCodeFromEmail('', 0, 'sub')).toBe('SUB');
    expect(partnerCodeFromEmail('a'.repeat(30) + '@x.com')).toBe('A'.repeat(12));
    expect(partnerCodeFromEmail('سارة@example.com')).toBe('KATZU');
  });

  it('must be 3–20 upper-case letters or digits', () => {
    expect(normalizeAffiliateCode('AB')).toBeNull();
    expect(normalizeAffiliateCode('A'.repeat(20))).toBe('A'.repeat(20));
    expect(normalizeAffiliateCode('A'.repeat(21))).toBeNull();
    expect(normalizeAffiliateCode(null)).toBeNull();
    expect(normalizeAffiliateCode(42)).toBeNull();
    expect(AFFILIATE_CONFIG.codePattern).toBe('^[A-Z0-9]{3,20}$');
  });
});

describe('the money', () => {
  it('pays 20% of the net amount, rounded once, never negative', () => {
    expect(commissionCents(4999)).toBe(1000); // $49.99 → $10.00
    expect(commissionCents(1499)).toBe(300);
    expect(commissionCents(9999)).toBe(2000);
    expect(commissionCents(0)).toBe(0);
    expect(commissionCents(-4999)).toBe(0);
    expect(AFFILIATE_CONFIG.rate).toBe(0.2);
    expect(AFFILIATE_CONFIG.minPayoutCents).toBe(2000);
  });

  it('reads net amounts from the same plan table the paywall sells', () => {
    // The table is derived from `pricing.config.json` here, the same way
    // `cloudflare-pricing.js` shapes it for the Worker — so this test fails if
    // the module stops agreeing with the file learners are charged from.
    const planTable = pricingConfig.plans.map((plan: { months: number; foundingUsd: number }) => ({
      months: plan.months,
      amountCents: Math.round(plan.foundingUsd * 100),
    }));
    expect(netAmountForMonths(1, planTable)).toBe(1499);
    expect(netAmountForMonths(3, planTable)).toBe(2999);
    expect(netAmountForMonths(6, planTable)).toBe(4999);
    expect(netAmountForMonths(12, planTable)).toBe(9999);
    // A duration nobody sells earns nothing rather than a guessed amount.
    expect(netAmountForMonths(2, planTable)).toBe(0);
    expect(netAmountForMonths(6, [])).toBe(0);
  });
});

describe('the approval clock', () => {
  it('approves on day 14, not on day 13 and not at activation', () => {
    const activated = '2026-10-01T00:00:00.000Z';
    expect(approveAfterIso(activated)).toBe('2026-10-15T00:00:00.000Z');

    const pending = { status: 'pending', approve_after: '2026-10-15T00:00:00.000Z' };
    expect(isApprovalDue(pending, new Date('2026-10-13T23:59:59.000Z'))).toBe(false);
    expect(isApprovalDue(pending, new Date('2026-10-14T23:59:59.000Z'))).toBe(false);
    expect(isApprovalDue(pending, new Date('2026-10-15T00:00:00.000Z'))).toBe(true);
    expect(isApprovalDue({ ...pending, status: 'paid' }, new Date('2026-10-20T00:00:00.000Z'))).toBe(false);
    expect(isApprovalDue({ status: 'pending', approve_after: null })).toBe(false);
  });

  it('keeps payouts on one fixed weekday, strictly in the future', () => {
    // 2026-10-28 is a Wednesday; the next Monday is 2026-11-02.
    expect(nextPayoutDate(new Date('2026-10-28T12:00:00.000Z')).toISOString()).toBe(
      '2026-11-02T00:00:00.000Z',
    );
    expect(nextPayoutDate(new Date('2026-11-02T00:00:00.000Z')).toISOString()).toBe(
      '2026-11-09T00:00:00.000Z',
    );
  });
});

describe('GET /affiliate/ref', () => {
  it('answers whether an active code exists and nothing else', async () => {
    const db = freshDb();
    seedAffiliate(db);
    const res = await handleAffiliateRoutes(
      new URL('https://worker.test/affiliate/ref'),
      refRequest({ code: 'sara10' }),
      { DB: db } as never,
      CORS,
    );
    expect(res?.status).toBe(200);
    expect(await res?.json()).toEqual({ ok: true });
  });

  it('refuses an unknown or paused partner without naming anyone', async () => {
    const db = freshDb();
    seedAffiliate(db, { code: 'PAUSED1', status: 'paused' });
    const unknown = await handleAffiliateRoutes(
      new URL('https://worker.test/affiliate/ref'),
      refRequest({ code: 'NOBODY' }),
      { DB: db } as never,
      CORS,
    );
    expect(unknown?.status).toBe(404);
    expect(await unknown?.json()).toEqual({ ok: false, error: 'unknown_code' });

    const paused = await handleAffiliateRoutes(
      new URL('https://worker.test/affiliate/ref'),
      refRequest({ code: 'PAUSED1' }),
      { DB: db } as never,
      CORS,
    );
    expect(paused?.status).toBe(404);
  });

  it('refuses a malformed code, a GET, and a flood', async () => {
    const db = freshDb();
    seedAffiliate(db);
    const malformed = await handleAffiliateRoutes(
      new URL('https://worker.test/affiliate/ref'),
      refRequest({ code: 'not a code' }),
      { DB: db } as never,
      CORS,
    );
    expect(malformed?.status).toBe(400);

    const get = await handleAffiliateRoutes(
      new URL('https://worker.test/affiliate/ref'),
      refRequest(null, 'GET'),
      { DB: db } as never,
      CORS,
    );
    expect(get?.status).toBe(405);

    const limited = await handleAffiliateRoutes(
      new URL('https://worker.test/affiliate/ref'),
      refRequest({ code: 'SARA10' }),
      { DB: db } as never,
      CORS,
      { checkGlobalRateLimit: async () => ({ allowed: false, retryAfter: 42 }) },
    );
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get('Retry-After')).toBe('42');
    expect(await limited?.json()).toMatchObject({ ok: false, error: 'rate_limited' });
  });

  it('answers unavailable instead of throwing when there is no database', async () => {
    const res = await handleAffiliateRoutes(
      new URL('https://worker.test/affiliate/ref'),
      refRequest({ code: 'SARA10' }),
      {} as never,
      CORS,
    );
    expect(res?.status).toBe(503);
  });
});

describe('POST /affiliate/me', () => {
  const meRequest = (token?: string, method = 'POST') =>
    new Request('https://worker.test/affiliate/me', {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  const meUrl = new URL('https://worker.test/affiliate/me');
  const signedIn = (email: string) => async () => ({ sub: 'sub-1', email });

  it('refuses a caller with no session, and any method but POST', async () => {
    const db = freshDb();
    const anonymous = await handleAffiliateRoutes(meUrl, meRequest(), { DB: db } as never, CORS);
    expect(anonymous?.status).toBe(401);
    expect(db.rows('affiliates')).toHaveLength(0);

    const get = await handleAffiliateRoutes(meUrl, meRequest(undefined, 'GET'), { DB: db } as never, CORS, {
      authenticate: signedIn('new@example.com'),
    });
    expect(get?.status).toBe(405);
  });

  it('issues one partner link for a signed-in learner and returns no private data', async () => {
    const db = freshDb();
    const deps = { authenticate: signedIn('new@example.com') };

    const first = await handleAffiliateRoutes(meUrl, meRequest(), { DB: db } as never, CORS, deps);
    expect(first?.status).toBe(201);
    const body = await first?.json();
    expect(body).toMatchObject({
      ok: true,
      code: 'NEW',
      status: 'active',
      rate: 0.2,
      approvalDays: 14,
      minPayoutCents: 2000,
    });
    expect(body.payoutMethods).toContain('Wise');
    expect(body).not.toHaveProperty('contact');
    expect(body).not.toHaveProperty('payout_details');
    expect(body).not.toHaveProperty('payout_method');
    expect(db.rows('affiliates')).toHaveLength(1);
    expect(db.rows('affiliates')[0]).toMatchObject({
      contact: 'new@example.com',
      payout_method: 'Wise',
      payout_details: 'new@example.com',
    });

    const again = await handleAffiliateRoutes(meUrl, meRequest(), { DB: db } as never, CORS, deps);
    expect(again?.status).toBe(200);
    expect(await again?.json()).toMatchObject({ ok: true, code: 'NEW' });
    expect(db.rows('affiliates')).toHaveLength(1);
  });

  it('returns the existing partner row, matching the email case-insensitively', async () => {
    const db = freshDb();
    seedAffiliate(db);
    const res = await handleAffiliateRoutes(meUrl, meRequest(), { DB: db } as never, CORS, {
      authenticate: signedIn('Sara@Example.com'),
    });
    expect(res?.status).toBe(200);
    expect(await res?.json()).toMatchObject({ code: 'SARA10' });
    expect(db.rows('affiliates')).toHaveLength(1);
  });

  it('steps the code aside when the plain one belongs to someone else', async () => {
    const db = freshDb();
    seedAffiliate(db, { code: 'NEW', contact: 'someone@else.com' });
    const res = await handleAffiliateRoutes(meUrl, meRequest(), { DB: db } as never, CORS, {
      authenticate: signedIn('new@example.com'),
    });
    expect(res?.status).toBe(201);
    expect(await res?.json()).toMatchObject({ code: 'NEW1' });
    expect(db.rows('affiliates')).toHaveLength(2);
  });

  it('works through the worker with a session token, without leaking the email', async () => {
    const db = freshDb();
    const token = 'sess_abc123';
    const store = new Map<string, string>([
      [
        `session:${token}`,
        JSON.stringify({ sub: 'sub-9', email: 'learner@example.com', expires_at: Date.now() + 60000 }),
      ],
    ]);
    const env = {
      ADMIN_SECRET: SECRET,
      GOOGLE_CLIENT_ID: 'client',
      DB: db,
      USER_PROGRESS: {
        get: async (key: string) => store.get(key) ?? null,
        put: async () => {},
        delete: async () => {},
      },
    } as never;

    const res = await worker.fetch(meRequest(token), env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, code: 'LEARNER' });
    expect(JSON.stringify(body)).not.toContain('@');

    const anonymous = await worker.fetch(meRequest(), env);
    expect(anonymous.status).toBe(401);
  });
});

describe('attribution at signup', () => {
  it('attaches the first valid partner and keeps them', async () => {
    const db = freshDb();
    const sara = seedAffiliate(db);
    const omar = seedAffiliate(db, { code: 'OMAR20', contact: 'omar@example.com' });

    const first = await attachReferral(
      { DB: db } as never,
      { accountId: 'acc-1', email: 'learner@example.com', code: 'sara10' },
    );
    expect(first).toMatchObject({ attached: true, code: 'SARA10', affiliateId: sara });

    const second = await attachReferral(
      { DB: db } as never,
      { accountId: 'acc-1', email: 'learner@example.com', code: 'OMAR20' },
    );
    expect(second).toEqual({ attached: false, reason: 'already_attributed' });
    expect(db.rows('referrals')).toHaveLength(1);
    expect(db.rows('referrals')[0].affiliate_id).toBe(sara);
    expect(db.rows('referrals')[0].affiliate_id).not.toBe(omar);
  });

  it('ignores an unknown or paused code, and a missing one', async () => {
    const db = freshDb();
    seedAffiliate(db, { code: 'PAUSED1', status: 'paused' });
    const env = { DB: db } as never;

    expect(await attachReferral(env, { accountId: 'a', email: 'x@example.com', code: 'NOBODY' })).toEqual({
      attached: false,
      reason: 'unknown_code',
    });
    expect(await attachReferral(env, { accountId: 'a', email: 'x@example.com', code: 'PAUSED1' })).toEqual({
      attached: false,
      reason: 'unknown_code',
    });
    expect(await attachReferral(env, { accountId: 'a', code: '' })).toEqual({
      attached: false,
      reason: 'invalid',
    });
    expect(db.rows('referrals')).toHaveLength(0);
  });

  it('blocks a partner referring themselves, by email or payment sender', async () => {
    const db = freshDb();
    seedAffiliate(db, { contact: 'Sara@Example.com' });
    const env = { DB: db } as never;

    expect(
      await attachReferral(env, {
        accountId: 'acc-sara',
        email: 'sara@example.com',
        code: 'SARA10',
      }),
    ).toEqual({ attached: false, reason: 'self_referral' });

    expect(
      await attachReferral(env, {
        accountId: 'acc-sara-2',
        email: 'other@example.com',
        paymentEmail: 'SARA@example.com',
        code: 'SARA10',
      }),
    ).toEqual({ attached: false, reason: 'self_referral' });

    expect(
      isSelfReferral({ affiliateContact: 'sara@example.com', accountEmail: 'someone@example.com' }),
    ).toBe(false);
    expect(db.rows('referrals')).toHaveLength(0);
  });
});

describe('the commission', () => {
  it('books exactly one pending 20% row for the first paid order', async () => {
    const db = freshDb();
    seedAffiliate(db);
    const env = { DB: db } as never;
    await attachReferral(env, { accountId: 'acc-1', email: 'learner@example.com', code: 'SARA10' });

    const row = await recordAffiliateCommission(env, {
      accountId: 'acc-1',
      netAmountCents: 4999,
      orderRef: 'KZ-ORDER-1',
    });
    expect(row).toMatchObject({
      affiliate_id: 1,
      referred_account_id: 'acc-1',
      order_ref: 'KZ-ORDER-1',
      net_amount: 4999,
      rate: 0.2,
      amount: 1000,
      status: 'pending',
      paid_at: null,
    });
    expect(row?.approve_after).toBe(approveAfterIso(String(row?.activated_at)));

    // A second activation of the same account, and a replay of the same order,
    // both book nothing.
    expect(
      await recordAffiliateCommission(env, { accountId: 'acc-1', netAmountCents: 9999, orderRef: 'KZ-ORDER-2' }),
    ).toBeNull();
    expect(
      await recordAffiliateCommission(env, { accountId: 'acc-1', netAmountCents: 4999, orderRef: 'KZ-ORDER-1' }),
    ).toBeNull();
    expect(db.rows('commissions')).toHaveLength(1);
  });

  it('books nothing without a referral, without a sold duration, or without an order', async () => {
    const db = freshDb();
    seedAffiliate(db);
    const env = { DB: db } as never;

    expect(
      await recordAffiliateCommission(env, { accountId: 'nobody', netAmountCents: 4999, orderRef: 'KZ-X' }),
    ).toBeNull();

    await attachReferral(env, { accountId: 'acc-1', email: 'learner@example.com', code: 'SARA10' });
    expect(
      await recordAffiliateCommission(env, { accountId: 'acc-1', netAmountCents: 0, orderRef: 'KZ-Y' }),
    ).toBeNull();
    expect(await recordAffiliateCommission(env, { accountId: 'acc-1', netAmountCents: 4999 })).toBeNull();
    expect(db.rows('commissions')).toHaveLength(0);
  });

  it('approves only the rows whose day has come', async () => {
    const db = freshDb();
    seedAffiliate(db);
    const due = seedCommission(db, { id: 1, order_ref: 'DUE', approve_after: '2026-10-10T00:00:00.000Z' });
    seedCommission(db, { order_ref: 'FUTURE', approve_after: '2026-11-10T00:00:00.000Z' });

    const approved = await approveDueCommissions(
      { DB: db } as never,
      new Date('2026-10-20T00:00:00.000Z'),
    );
    expect(approved).toBe(1);
    const byId = new Map(db.rows('commissions').map((row) => [row.id, row]));
    expect(byId.get(due)?.status).toBe('approved');
    expect(byId.get(2)?.status).toBe('pending');
  });
});

describe('a refund', () => {
  it('voids a commission that has not been paid yet', async () => {
    const db = freshDb();
    seedAffiliate(db);
    seedCommission(db);
    const env = { DB: db } as never;

    expect(await voidCommission(env, { orderRef: 'KZ-ORDER-1' })).toEqual({ ok: true, voided: true });
    expect(db.rows('commissions')[0].status).toBe('void');
    // Idempotent: a second refund of the same order is not an error.
    expect(await voidCommission(env, { orderRef: 'KZ-ORDER-1' })).toEqual({ ok: true, already: true });
    expect(db.rows('commissions')).toHaveLength(1);
    expect(await voidCommission(env, { orderRef: 'MISSING' })).toEqual({ ok: false, error: 'not_found' });
  });

  it('deducts from the next payout when the money was already sent', async () => {
    const db = freshDb();
    seedAffiliate(db);
    seedCommission(db, {
      status: 'paid',
      paid_at: '2026-10-10T00:00:00.000Z',
      payout_ref: 'WISE-1',
    });
    const env = { DB: db } as never;

    const result = await voidCommission(env, { orderRef: 'KZ-ORDER-1', reason: 'learner refund' });
    expect(result).toEqual({ ok: true, deducted: true, refund_ref: 'refund:KZ-ORDER-1' });

    const rows = db.rows('commissions');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      order_ref: 'refund:KZ-ORDER-1',
      net_amount: -4999,
      amount: -1000,
      status: 'approved',
      paid_at: null,
      payout_ref: 'refund:learner refund',
    });

    // One deduction per refunded order, no matter how often it is reported.
    await voidCommission(env, { orderRef: 'KZ-ORDER-1' });
    expect(db.rows('commissions')).toHaveLength(2);
    expect(buildPayoutBatch(db.rows('commissions')).batches).toEqual([]);
  });
});

describe('a payout batch', () => {
  const approved = (id: number, amount: number, extra: Record<string, unknown> = {}) => ({
    id,
    affiliate_id: 1,
    status: 'approved',
    amount,
    paid_at: null,
    ...extra,
  });

  it('pays a balance at the $20 minimum and carries anything smaller', () => {
    const { batches, carried } = buildPayoutBatch([approved(1, 1999), approved(2, 1000, { affiliate_id: 2 })]);
    expect(batches).toEqual([]);
    expect(carried.map((entry) => entry.total_cents).sort()).toEqual([1000, 1999]);

    const paid = buildPayoutBatch([approved(1, 1200), approved(2, 800)]);
    expect(paid.batches).toEqual([{ affiliate_id: 1, commission_ids: [1, 2], total_cents: 2000 }]);
    expect(paid.carried).toEqual([]);
  });

  it('ignores pending and already-paid rows and nets out a refund', () => {
    const rows = [
      approved(1, 1000),
      approved(2, 2000),
      approved(3, -1000, { order_ref: 'refund:KZ-1' }),
      approved(4, 900, { paid_at: '2026-10-10T00:00:00.000Z' }),
      { id: 5, affiliate_id: 1, status: 'pending', amount: 5000, paid_at: null },
    ];
    const { batches } = buildPayoutBatch(rows);
    expect(batches).toEqual([{ affiliate_id: 1, commission_ids: [1, 2, 3], total_cents: 2000 }]);
  });
});

describe('the payout CSV', () => {
  it('states the total of exactly the rows above it', () => {
    const csv = payoutCsv({
      affiliate: {
        code: 'SARA10',
        name: 'Sara, DE',
        payout_method: 'Wise',
        payout_details: 'sara@example.com',
      },
      rows: [
        {
          order_ref: 'KZ-ORDER-1',
          referred_account_id: 'acc-1',
          net_amount: 4999,
          rate: 0.2,
          amount: 1000,
          status: 'approved',
          activated_at: '2026-10-01T00:00:00.000Z',
          paid_at: null,
          payout_ref: null,
        },
        {
          order_ref: 'KZ-ORDER-2',
          referred_account_id: 'acc-2',
          net_amount: 1499,
          rate: 0.2,
          amount: 300,
          status: 'approved',
          activated_at: '2026-10-02T00:00:00.000Z',
          paid_at: null,
          payout_ref: null,
        },
      ],
    });
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(
      'affiliate_code,affiliate_name,payout_method,payout_details,order_ref,referred_account_id,net_amount_usd,rate,amount_usd,status,activated_at,paid_at,payout_ref',
    );
    expect(lines[1]).toContain('"Sara, DE"');
    expect(lines[1]).toContain(',49.99,0.2,10.00,approved,');
    expect(lines[2]).toContain(',14.99,0.2,3.00,approved,');
    expect(lines[3]).toBe('TOTAL,,,,,,,,13.00,,,,');
    expect(lines).toHaveLength(4);
  });
});

describe('the admin surface', () => {
  function env(db: AffiliateD1) {
    return {
      ADMIN_SECRET: SECRET,
      DB: db,
      USER_PROGRESS: { get: async () => null, put: async () => {}, delete: async () => {} },
    } as never;
  }

  it('refuses every affiliate endpoint without the admin secret', async () => {
    const db = freshDb();
    for (const path of [
      '/admin/api/affiliates',
      '/admin/api/affiliates/commissions',
      '/admin/api/affiliates/payout.csv?affiliate_id=1',
    ]) {
      const res = await worker.fetch(new Request(`https://worker.test${path}`), env(db));
      expect(res.status, path).toBe(401);
    }

    const create = await worker.fetch(
      new Request('https://worker.test/admin/api/affiliates/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'HACKER1',
          name: 'Nobody',
          contact: 'nobody@example.com',
          payout_method: 'Wise',
          payout_details: 'nobody@example.com',
        }),
      }),
      env(db),
    );
    expect(create.status).toBe(401);
    expect(db.rows('affiliates')).toHaveLength(0);
  });

  it('creates a partner, refuses a taken code, and never opens a second door', async () => {
    const db = freshDb();
    const body = {
      code: 'sara10',
      name: 'Sara',
      contact: 'sara@example.com',
      payout_method: 'Wise',
      payout_details: 'sara@example.com',
    };
    const created = await worker.fetch(
      new Request('https://worker.test/admin/api/affiliates/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env(db),
    );
    expect(created.status).toBe(201);
    const payload = (await created.json()) as { affiliate: Record<string, unknown> };
    expect(payload.affiliate).toMatchObject({ code: 'SARA10', name: 'Sara', status: 'active' });

    const clash = await worker.fetch(
      new Request('https://worker.test/admin/api/affiliates/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env(db),
    );
    expect(clash.status).toBe(409);

    const badMethod = await worker.fetch(
      new Request('https://worker.test/admin/api/affiliates/create', {
        headers: { Authorization: `Bearer ${SECRET}` },
      }),
      env(db),
    );
    expect(badMethod.status).toBe(404);
    expect(db.rows('affiliates')).toHaveLength(1);
  });

  it('lists partners with their ledger totals, then pays a batch once', async () => {
    const db = freshDb();
    const id = seedAffiliate(db);
    seedCommission(db, { id: 1, order_ref: 'A', status: 'approved', amount: 1000 });
    seedCommission(db, { id: 2, order_ref: 'B', status: 'approved', amount: 1000 });
    seedCommission(db, { id: 3, order_ref: 'C', status: 'pending', amount: 500, approve_after: '2099-01-01T00:00:00.000Z' });

    const list = await worker.fetch(
      new Request('https://worker.test/admin/api/affiliates', {
        headers: { Authorization: `Bearer ${SECRET}` },
      }),
      env(db),
    );
    expect(list.status).toBe(200);
    const listed = (await list.json()) as { affiliates: Array<Record<string, number>> };
    expect(listed.affiliates[0]).toMatchObject({
      id,
      approved_cents: 2000,
      pending_cents: 500,
      paid_cents: 0,
    });
    // Nothing partner-private leaks into a ledger response that is not the CSV.
    expect(listed.affiliates[0]).not.toHaveProperty('secret');

    const csv = await worker.fetch(
      new Request(`https://worker.test/admin/api/affiliates/payout.csv?affiliate_id=${id}`, {
        headers: { Authorization: `Bearer ${SECRET}` },
      }),
      env(db),
    );
    expect(csv.status).toBe(200);
    expect(csv.headers.get('Content-Type')).toContain('text/csv');
    const text = await csv.text();
    expect(text).toContain('TOTAL,,,,,,,,20.00,,,,');

    const paid = await worker.fetch(
      new Request('https://worker.test/admin/api/affiliates/payout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ affiliate_id: id, payout_ref: 'WISE-42' }),
      }),
      env(db),
    );
    expect(paid.status).toBe(200);
    expect(await paid.json()).toMatchObject({ paid: true, total_cents: 2000, commission_ids: [1, 2] });

    const rows = db.rows('commissions');
    expect(rows.filter((row) => row.status === 'paid')).toHaveLength(2);
    expect(rows.find((row) => row.id === 3)?.status).toBe('pending');

    // A second payout has nothing to send, and says so instead of paying again.
    const again = await worker.fetch(
      new Request('https://worker.test/admin/api/affiliates/payout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ affiliate_id: id, payout_ref: 'WISE-43' }),
      }),
      env(db),
    );
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: 'below_minimum', total_cents: 0 });
  });

  it('carries a balance under $20 instead of paying it early', async () => {
    const db = freshDb();
    const id = seedAffiliate(db);
    seedCommission(db, { id: 1, order_ref: 'A', status: 'approved', amount: 1999 });

    const payout = await worker.fetch(
      new Request('https://worker.test/admin/api/affiliates/payout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ affiliate_id: id, payout_ref: 'WISE-1' }),
      }),
      env(db),
    );
    expect(payout.status).toBe(409);
    expect(await payout.json()).toMatchObject({
      error: 'below_minimum',
      total_cents: 1999,
      min_cents: 2000,
    });
    expect(db.rows('commissions')[0].status).toBe('approved');

    const csv = await worker.fetch(
      new Request(`https://worker.test/admin/api/affiliates/payout.csv?affiliate_id=${id}`, {
        headers: { Authorization: `Bearer ${SECRET}` },
      }),
      env(db),
    );
    expect(csv.status).toBe(409);
  });

  it('voids a commission from the admin surface', async () => {
    const db = freshDb();
    seedAffiliate(db);
    seedCommission(db);
    const voided = await worker.fetch(
      new Request('https://worker.test/admin/api/affiliates/void', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_ref: 'KZ-ORDER-1', reason: 'self-referral' }),
      }),
      env(db),
    );
    expect(voided.status).toBe(200);
    expect(await voided.json()).toMatchObject({ ok: true, voided: true });
    expect(db.rows('commissions')[0].status).toBe('void');
  });
});
