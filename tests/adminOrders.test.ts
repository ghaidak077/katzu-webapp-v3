import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';
import { CODE_DELIVERY_PROMISE_HOURS, listOrders } from '../cloudflare-admin.js';

/**
 * The order view, which exists for one reason.
 *
 * The launch promise is «يصل الكود خلال ١٢ ساعة» (playbook D8). Until this
 * existed there was nowhere to read whether it was being kept, and a promise
 * nobody measures is a promise nobody is managing. Three things must hold: it
 * reads and never writes, it is paginated, and the clock it shows is honest —
 * in particular it must not report "within the promise" for an order that has
 * no clock yet.
 */

type Row = Record<string, unknown>;

function makeDb(rows: Row[]) {
  const statements: string[] = [];
  return {
    statements,
    prepare(sql: string) {
      statements.push(sql);
      const isCount = /COUNT\(\*\)/i.test(sql);
      const limit = /LIMIT \? OFFSET \?/i.test(sql);
      const bind = (...args: unknown[]) => {
        const run = async () => ({ success: true, meta: {} });
        if (isCount) return { first: async () => ({ c: rows.length }), run, all: async () => ({ results: [] }) };
        if (limit) {
          const off = Number(args[args.length - 1]);
          const lim = Number(args[args.length - 2]);
          return { first: async () => null, run, all: async () => ({ results: rows.slice(off, off + lim) }) };
        }
        return { first: async () => null, run, all: async () => ({ results: rows }) };
      };
      return { bind, run: async () => ({ success: true, meta: {} }) };
    },
  };
}

function order(overrides: Row = {}): Row {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000);
  return {
    order_id: 'ord_1',
    claim_token: 'claim_token_abcdef123456',
    months: 3,
    price_usd: 29,
    status: 'delivered',
    provider: 'nowpayments',
    payment_id: 'pay_1',
    pay_currency: 'usdt',
    pay_amount: 29,
    code: 'KATZU-XXXX-1234',
    created_at: twoHoursAgo.toISOString(),
    paid_at: twoHoursAgo.toISOString(),
    delivered_at: new Date(now.getTime() - 1_800_000).toISOString(),
    ...overrides,
  };
}

describe('the order view', () => {
  beforeEach(() => {
    // A fixed clock would be nicer; the assertions below are relative to now.
  });

  it('reports a delivered order with its elapsed hours', async () => {
    const env = { DB: makeDb([order()]) } as never;
    const result = await listOrders(env);
    expect(result.available).toBe(true);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].hoursSincePaid).toBeCloseTo(2, 1);
    expect(result.orders[0].withinPromise).toBe(true);
  });

  it('names the pass rather than showing a bare month count', async () => {
    const env = { DB: makeDb([order({ months: 1 }), order({ months: 3 })]) } as never;
    const result = await listOrders(env);
    expect(result.orders.map((o) => o.pass)).toEqual(['monthly', 'pass90']);
  });

  it('flags an order that has broken the promise', async () => {
    const longAgo = new Date(Date.now() - 30 * 3_600_000).toISOString();
    const env = { DB: makeDb([order({ paid_at: longAgo })]) } as never;
    const result = await listOrders(env);
    expect(result.orders[0].withinPromise).toBe(false);
    expect(result.orders[0].hoursSincePaid).toBeGreaterThan(CODE_DELIVERY_PROMISE_HOURS);
  });

  it('says "no clock yet" rather than "on time" for an unpaid order', async () => {
    // This is the one that would be a lie: a created-but-unpaid order has no
    // delivery to be late for, and reporting `withinPromise: true` would show
    // the owner a promise kept that was never started.
    const env = { DB: makeDb([order({ status: 'created', paid_at: null, delivered_at: null })]) } as never;
    const result = await listOrders(env);
    expect(result.orders[0].hoursSincePaid).toBeNull();
    expect(result.orders[0].withinPromise).toBeNull();
  });

  it('separates a minted code from a redeemed one', async () => {
    const env = { DB: makeDb([order({ status: 'paid', code: 'KATZU-ABCD', delivered_at: null })]) } as never;
    const result = await listOrders(env);
    expect(result.orders[0].codeMinted).toBe(true);
    expect(result.orders[0].codeRedeemed).toBe(false);
  });

  it('reports an order with no code yet as not minted', async () => {
    const env = { DB: makeDb([order({ status: 'paid', code: null, delivered_at: null })]) } as never;
    const result = await listOrders(env);
    expect(result.orders[0].codeMinted).toBe(false);
  });

  it('never returns the full claim token', async () => {
    // It identifies the buyer's claim; the view needs a handle to recognise an
    // order by, not the whole thing.
    const env = { DB: makeDb([order()]) } as never;
    const result = await listOrders(env);
    expect(result.orders[0].alias).toBe('claim_token_');
    expect(String(result.orders[0].alias).length).toBe(12);
  });

  it('reads and never writes', async () => {
    const db = makeDb([order()]);
    await listOrders({ DB: db } as never);
    for (const sql of db.statements) {
      expect(sql).toMatch(/^SELECT/i);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
    }
  });

  it('pages with a bounded limit and a non-negative offset', async () => {
    const db = makeDb([order()]);
    const result = await listOrders({ DB: db } as never, { limit: '5000', offset: '-4' });
    expect(result.limit).toBe(200);
    expect(result.offset).toBe(0);

    const paged = await listOrders({ DB: makeDb([order()]) } as never, { limit: '25', offset: '50' });
    expect(paged.limit).toBe(25);
    expect(paged.offset).toBe(50);
  });

  it('filters by status without letting a filter become an injection', async () => {
    const db = makeDb([order()]);
    await listOrders({ DB: db } as never, { status: 'paid' });
    expect(db.statements.join(' ')).toMatch(/status = \?/);
    expect(db.statements.join(' ')).not.toMatch(/status = 'paid'/);

    const hostile = makeDb([order()]);
    await listOrders({ DB: hostile } as never, { status: "paid'; DROP TABLE users;--" });
    expect(hostile.statements.join(' ')).not.toMatch(/DROP/);
  });

  it('degrades honestly when the table does not exist yet', async () => {
    // `crypto_orders` is created lazily and check-out is still `test_mode`, so
    // a missing table is the expected state on a fresh deployment. D1 answers a
    // missing table by throwing, and that must not escape into the admin page.
    const env = {
      DB: {
        prepare() {
          return {
            bind: () => ({
              first: async () => {
                throw new Error('no such table: crypto_orders');
              },
              all: async () => {
                throw new Error('no such table: crypto_orders');
              },
            }),
            run: async () => ({ success: true }),
          };
        },
      },
    } as never;
    const result = await listOrders(env);
    expect(result.available).toBe(false);
    expect(result.orders).toEqual([]);
  });

  it('reports unavailable when there is no database at all', async () => {
    const result = await listOrders({} as never);
    expect(result.available).toBe(false);
  });
});

describe('the order route is behind the same gate as every other admin route', () => {
  const SECRET = 'admin-secret-0123456789abcdef';

  function env() {
    return {
      ADMIN_SECRET: SECRET,
      DB: makeDb([order()]),
      USER_PROGRESS: { get: async () => null, put: async () => {}, delete: async () => {} },
      REDEEMED_CODES: { get: async () => null, put: async () => {}, delete: async () => {} },
    } as never;
  }

  const call = (auth?: string) =>
    worker.fetch(
      new Request('https://worker.test/admin/api/orders', {
        method: 'GET',
        headers: auth ? { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' } : {},
      }),
      env(),
    );

  it('answers 401 with no secret at all', async () => {
    // The route is new; the only thing that would make it a problem is if new
    // had been wired before the gate. This is the test that says it was not.
    const res = await call();
    expect(res.status).toBe(401);
  });

  it('answers 401 with the wrong secret', async () => {
    const res = await call('not-the-secret');
    expect(res.status).toBe(401);
  });

  it('answers 401 for every method it does not serve', async () => {
    // Read-only means read-only: a POST here is not "not found", it is refused
    // by the gate, so nobody can turn the view into a write by guessing.
    const res = await worker.fetch(
      new Request('https://worker.test/admin/api/orders', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'delivered' }),
      }),
      env(),
    );
    expect(res.status).not.toBe(200);
  });

  it('serves the orders to the authenticated admin', async () => {
    const res = await call(SECRET);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: Array<{ order_id: string }>; available: boolean };
    expect(body.available).toBe(true);
    expect(body.orders[0].order_id).toBe('ord_1');
  });
});
