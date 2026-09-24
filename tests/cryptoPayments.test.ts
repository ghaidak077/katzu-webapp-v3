import { createHmac } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import worker from '../cloudflare-unified-worker';
import {
  canonicalIpnPayload,
  classifyNowPaymentsStatus,
  handleCryptoWebhook,
  getCryptoBaseUrl,
  getCryptoPlan,
  resolveSalesOrigin,
  verifyNowPaymentsSignature,
} from '../cloudflare-crypto';

/**
 * Crypto sales (NOWPayments) tests.
 *
 * The contract under test is the ONLY way a crypto purchase becomes a usable
 * product: signature-verified IPN -> a code minted by the EXISTING generator ->
 * the buyer reads it back with their claim token -> the app redeems it through
 * its untouched /verify endpoint. The last test drives that whole chain.
 *
 * Signatures in this file are produced with node:crypto independently of the
 * module, so a mistake in the module's own signing helper cannot pass the test.
 */

type Row = Record<string, unknown>;

const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();

const PK_OF: Record<string, string> = {
  crypto_orders: 'order_id',
  crypto_events: 'event_key',
  redeemed_codes_ledger: 'code',
  referral_payouts: 'invited_account_id',
  users: 'id',
};

/**
 * D1 stub: implements the statement shapes this flow actually emits — CREATE,
 * INSERT (with and without ON CONFLICT), UPDATE with one or more WHERE
 * conditions, and simple SELECTs — including `meta.changes`, because the
 * fulfillment path uses a conditional UPDATE as its race guard.
 */
class MemoryD1 {
  tables: Record<string, Row[]> = {};

  table(name: string): Row[] {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }

  prepare(sql: string) {
    const s = norm(sql);
    const self = this;
    const exec = (args: unknown[]) => self.exec(s, args);
    return {
      _batch: () => exec([]),
      run: () => exec([]),
      first: () => self.select(s, []).find(() => true) ?? null,
      bind: (...args: unknown[]) => ({
        run: () => exec(args),
        first: () => self.select(s, args)[0] ?? null,
        all: async () => ({ results: self.select(s, args), success: true }),
      }),
      all: async () => ({ results: self.select(s, []), success: true }),
    };
  }

  batch(stmts: Array<{ _batch?: () => unknown }>) {
    return Promise.all(stmts.map((st) => (st && st._batch ? st._batch() : st)));
  }

  private argsOf(values: string, args: unknown[], offset = { at: 0 }): unknown[] {
    return values.split(',').map((token) => {
      const t = token.trim();
      if (t === '?') return args[offset.at++];
      if (/^null$/i.test(t)) return null;
      return t.replace(/^'/, '').replace(/'$/, '');
    });
  }

  exec(s: string, args: unknown[]): { success: true; meta?: { changes: number } } {
    let m: RegExpMatchArray | null;

    if ((m = s.match(/^CREATE TABLE IF NOT EXISTS (\w+)/i))) {
      this.table(m[1]);
      return { success: true };
    }
    if (/^CREATE INDEX/i.test(s)) return { success: true };

    if ((m = s.match(/^INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]*)\)([\s\S]*)$/i))) {
      const [, name, colClause, valueClause, tail] = m;
      const cols = colClause.split(',').map((c) => c.trim());
      const cursor = { at: 0 };
      const values = this.argsOf(valueClause, args, cursor);
      const incoming: Row = {};
      cols.forEach((col, i) => { incoming[col] = values[i] ?? null; });

      const pk = PK_OF[name];
      const rows = this.table(name);
      const existing = pk ? rows.find((r) => r[pk] === incoming[pk]) : undefined;

      if (existing) {
        const upsert = tail.match(/ON CONFLICT[\s\S]*?DO UPDATE SET ([\s\S]+)$/i);
        if (!upsert) throw new Error(`D1_ERROR: UNIQUE constraint failed: ${name}.${pk}`);
        const assignment =
          /(\w+)\s*=\s*(COALESCE\(\s*excluded\.(\w+)\s*,\s*\w+\.(\w+)\s*\)|excluded\.(\w+)|'[^']*'|[\w.]+\s*\+\s*\d+)/gi;
        let a: RegExpExecArray | null;
        while ((a = assignment.exec(upsert[1]))) {
          const col = a[1];
          if (a[3]) existing[col] = incoming[a[3]] ?? existing[a[4]];
          else if (a[5]) existing[col] = incoming[a[5]];
          else if (a[2].startsWith("'")) existing[col] = a[2].replace(/'/g, '');
          else {
            const increment = a[2].match(/\+\s*(\d+)$/);
            const target = a[2].split('+')[0].trim().split('.').pop() as string;
            if (increment) existing[col] = Number(existing[target] ?? 0) + Number(increment[1]);
          }
        }
        return { success: true, meta: { changes: 1 } };
      }
      rows.push(incoming);
      return { success: true, meta: { changes: 1 } };
    }

    if ((m = s.match(/^UPDATE (\w+) SET ([\s\S]+?) WHERE ([\s\S]+)$/i))) {
      const [, name, setClause, whereClause] = m;
      const cursor = { at: 0 };
      const assignments = setClause.split(',').map((part) => {
        const eq = part.indexOf('=');
        const col = part.slice(0, eq).trim();
        const rhs = part.slice(eq + 1).trim();
        const value = rhs === '?' ? args[cursor.at++] : rhs.replace(/^'/, '').replace(/'$/, '');
        return { col, value };
      });

      const conditions = whereClause.split(/\s+AND\s+/i).map((raw) => {
        const cond = raw.trim();
        const eq = cond.match(/^(\w+)\s*(=|!=)\s*(.+)$/);
        if (!eq) return { col: '', op: '=', value: undefined as unknown };
        const value = eq[3].trim() === '?' ? args[cursor.at++] : eq[3].replace(/'/g, '');
        return { col: eq[1], op: eq[2], value };
      });

      let changes = 0;
      for (const row of this.table(name)) {
        const matches = conditions.every(({ col, op, value }) =>
          op === '!=' ? row[col] !== value : row[col] === value
        );
        if (!matches) continue;
        assignments.forEach(({ col, value }) => { row[col] = value; });
        changes += 1;
      }
      return { success: true, meta: { changes } };
    }

    if ((m = s.match(/^DELETE FROM (\w+)(?:\s+WHERE\s+([\s\S]+))?$/i))) {
      const rows = this.table(m[1]);
      if (!m[2]) {
        const removed = rows.length;
        rows.length = 0;
        return { success: true, meta: { changes: removed } };
      }
      let cursor = 0;
      const conditions = m[2].split(/\s+AND\s+/i).map((raw) => {
        const eq = raw.trim().match(/^(\w+)\s*=\s*(.+)$/);
        if (!eq) return { col: '', value: undefined as unknown };
        const value = eq[2].trim() === '?' ? args[cursor++] : eq[2].replace(/'/g, '');
        return { col: eq[1], value };
      });
      const doomed = rows.filter((r) => conditions.every(({ col, value }) => r[col] === value));
      doomed.forEach((row) => rows.splice(rows.indexOf(row), 1));
      return { success: true, meta: { changes: doomed.length } };
    }

    return { success: true };
  }

  select(s: string, args: unknown[]): Row[] {
    const m = s.match(/^SELECT ([\s\S]+?) FROM (\w+)([\s\S]*)$/i);
    if (!m) return [];
    const [, fields, name, rest] = m;
    let rows = [...this.table(name)];

    const where = rest.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER BY|\s+LIMIT|$)/i);
    if (where) {
      let cursor = 0;
      const conditions = where[1].split(/\s+AND\s+/i).map((raw) => {
        const cond = raw.trim();
        const eq = cond.match(/^(\w+)\s*=\s*(.+)$/);
        if (!eq) return { col: '', value: undefined as unknown };
        const value = eq[2].trim() === '?' ? args[cursor++] : eq[2].replace(/'/g, '');
        return { col: eq[1], value };
      });
      rows = rows.filter((r) => conditions.every(({ col, value }) => r[col] === value));
    }

    if (/^COUNT\(\*\) AS c$/i.test(fields.trim())) return [{ c: rows.length }];
    if (fields.trim() === '*') return rows;

    const selected = fields.split(',').map((f) => f.trim().replace(/\s+AS\s+\w+$/i, ''));
    return rows.map((r) => {
      const out: Row = {};
      for (const col of selected) out[col] = r[col] ?? null;
      return out;
    });
  }
}

class MemoryKv {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async put(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

const APP_ORIGIN = 'https://katzu-webapp-v3.pages.dev';
const SALES_ORIGIN = 'https://katzu-sales.pages.dev';
const WORKER_ORIGIN = 'https://worker.test';
const IPN_SECRET = 'katzu-nowpayments-ipn-test-secret';
const API_KEY = 'nowpayments_test_api_key_do_not_leak';
const HMAC_SECRET = 'katzu-hmac-secret';
const ADMIN_SECRET = 'katzu-admin-secret';
const PRICE_USD = 5;

function makeEnv(extra: Record<string, unknown> = {}) {
  return {
    // 'test' keeps TEST_MODE usable so /verify can resolve an account from a
    // crafted token; CORS is still enforced strictly because a valid allowlist
    // is configured, which is what the production deploy does too.
    ENVIRONMENT: 'test',
    TEST_MODE: '1',
    ALLOWED_ORIGINS: `${APP_ORIGIN},${SALES_ORIGIN}`,
    SALES_ORIGIN,
    GOOGLE_CLIENT_ID: 'client-id',
    HMAC_SECRET,
    ADMIN_SECRET,
    NOWPAYMENTS_API_KEY: API_KEY,
    NOWPAYMENTS_IPN_SECRET: IPN_SECRET,
    NOWPAYMENTS_ENVIRONMENT: 'test_mode',
    CRYPTO_PRICE_USD: String(PRICE_USD),
    CRYPTO_MONTHS: '1',
    USER_PROGRESS: new MemoryKv(),
    REDEEMED_CODES: new MemoryKv(),
    DB: new MemoryD1(),
    ...extra,
  };
}

const json = (path: string, body: unknown, origin: string | null = SALES_ORIGIN) =>
  new Request(`${WORKER_ORIGIN}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify(body),
  });

// --- IPN helpers: signed exactly the way NOWPayments documents it ------------

function signIpn(payload: Record<string, unknown>, secret = IPN_SECRET) {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(payload).sort()) sorted[key] = payload[key];
  return createHmac('sha512', secret).update(JSON.stringify(sorted)).digest('hex');
}

function ipnRequest(payload: Record<string, unknown>, { signature, secret = IPN_SECRET, withSignature = true } = {}) {
  const body = JSON.stringify(payload);
  return new Request(`${WORKER_ORIGIN}/crypto/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(withSignature ? { 'x-nowpayments-sig': signature ?? signIpn(payload, secret) } : {}),
    },
    body,
  });
}

function paymentNotification(overrides: Row = {}) {
  return {
    payment_id: 5077125051,
    payment_status: 'finished',
    pay_address: '0xd1cDE08A07cD25adEbEd35c3867a59228C09B606',
    price_amount: PRICE_USD,
    price_currency: 'usd',
    pay_amount: 0.000084,
    actually_paid: 0.000084,
    pay_currency: 'btc',
    order_id: null as unknown,
    order_description: 'Katzu Pro activation code (1 month)',
    ...overrides,
  };
}

/** Runs a real checkout against a stubbed provider and returns the buyer's order. */
async function startOrder(env: ReturnType<typeof makeEnv>) {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ id: 'inv_1', invoice_url: 'https://sandbox.nowpayments.io/invoice/inv_1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  const res = await worker.fetch(json('/crypto/checkout', {}), env as never);
  // Snapshot before restoring: mockRestore() clears the recorded calls.
  const calls = fetchSpy.mock.calls.map((call) => [String(call[0]), call[1] as RequestInit] as const);
  fetchSpy.mockRestore();
  const body = await res.json();
  return { res, body, calls };
}

// ---------------------------------------------------------------------------

describe('NOWPayments IPN signature verification', () => {
  const payload = { payment_id: 1, payment_status: 'finished', order_id: 'kz_1', price_amount: 5, price_currency: 'usd' };
  const body = JSON.stringify(payload);

  const headers = (sig?: string) => new Headers(sig ? { 'x-nowpayments-sig': sig } : {});

  it('accepts a correctly signed payload', async () => {
    const result = await verifyNowPaymentsSignature(body, headers(signIpn(payload)), IPN_SECRET);
    expect(result.ok).toBe(true);
    expect(result.body).toMatchObject({ order_id: 'kz_1' });
  });

  it('rejects a tampered body, a wrong secret, and a missing header', async () => {
    const tampered = JSON.stringify({ ...payload, price_amount: 500 });
    expect((await verifyNowPaymentsSignature(tampered, headers(signIpn(payload)), IPN_SECRET)).reason).toBe('signature_mismatch');
    expect((await verifyNowPaymentsSignature(body, headers(signIpn(payload, 'other-secret')), IPN_SECRET)).reason).toBe('signature_mismatch');
    expect((await verifyNowPaymentsSignature(body, headers(), IPN_SECRET)).reason).toBe('missing_signature');
    expect((await verifyNowPaymentsSignature(body, headers(signIpn(payload)), '')).reason).toBe('missing_secret');
  });

  it('rejects a body that is not JSON', async () => {
    const result = await verifyNowPaymentsSignature('not-json', headers('deadbeef'), IPN_SECRET);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_json');
  });

  it('signs over alphabetically sorted keys, so key order in the delivery is irrelevant', async () => {
    const reordered = { order_id: 'kz_1', payment_status: 'finished', price_currency: 'usd', price_amount: 5, payment_id: 1 };
    const delivered = JSON.stringify(reordered);
    expect(canonicalIpnPayload(delivered)).toBe(canonicalIpnPayload(body));
    // Signed by NOWPayments from their own key order; still verifies here.
    const result = await verifyNowPaymentsSignature(delivered, headers(signIpn(payload)), IPN_SECRET);
    expect(result.ok).toBe(true);
  });
});

describe('payment status semantics', () => {
  it('delivers only on finished, waits on the intermediate states, and fails cleanly', () => {
    expect(classifyNowPaymentsStatus('finished')).toBe('grant');
    ['waiting', 'confirming', 'confirmed', 'sending', 'partially_paid'].forEach((s) =>
      expect(classifyNowPaymentsStatus(s)).toBe('pending')
    );
    ['failed', 'refunded', 'expired'].forEach((s) => expect(classifyNowPaymentsStatus(s)).toBe('fail'));
    expect(classifyNowPaymentsStatus('anything-else')).toBe('unknown');
  });
});

describe('crypto configuration', () => {
  it('defaults to the sandbox host and only moves to live when told to', () => {
    expect(getCryptoBaseUrl({ NOWPAYMENTS_ENVIRONMENT: 'test_mode' })).toBe('https://api-sandbox.nowpayments.io');
    expect(getCryptoBaseUrl({})).toBe('https://api-sandbox.nowpayments.io');
    expect(getCryptoBaseUrl({ NOWPAYMENTS_ENVIRONMENT: 'live_mode' })).toBe('https://api.nowpayments.io');
    expect(getCryptoBaseUrl({ NOWPAYMENTS_ENVIRONMENT: 'live_mode', NOWPAYMENTS_BASE_URL: 'https://proxy.example/' })).toBe('https://proxy.example');
  });

  it('clamps price and duration to sane values', () => {
    expect(getCryptoPlan({})).toEqual({ priceUsd: 5, months: 1 });
    expect(getCryptoPlan({ CRYPTO_PRICE_USD: '4.5', CRYPTO_MONTHS: '3' })).toEqual({ priceUsd: 4.5, months: 3 });
    expect(getCryptoPlan({ CRYPTO_PRICE_USD: '0', CRYPTO_MONTHS: '99' }).months).toBe(12);
    expect(getCryptoPlan({ CRYPTO_PRICE_USD: 'abc', CRYPTO_MONTHS: '0' })).toEqual({ priceUsd: 5, months: 1 });
  });

  it('returns the customer to the sales site, never to the worker that hosts the API', () => {
    const request = new Request(`${WORKER_ORIGIN}/crypto/checkout`, { headers: { Origin: SALES_ORIGIN } });
    expect(resolveSalesOrigin({ SALES_ORIGIN }, request)).toBe(SALES_ORIGIN);
    expect(
      resolveSalesOrigin(
        { ALLOWED_ORIGINS: `${WORKER_ORIGIN},${SALES_ORIGIN}` },
        request
      )
    ).toBe(SALES_ORIGIN);
  });
});

describe('POST /crypto/checkout', () => {
  let env: ReturnType<typeof makeEnv>;
  beforeEach(() => { env = makeEnv(); });

  it('answers 503 without calling the provider when no API key is configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await worker.fetch(json('/crypto/checkout', {}), makeEnv({ NOWPAYMENTS_API_KEY: '' }) as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'crypto_not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('creates a fixed-USD invoice server-side and returns only the checkout URL', async () => {
    const { res, body, calls } = await startOrder(env);

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      checkout_url: 'https://sandbox.nowpayments.io/invoice/inv_1',
      price_usd: PRICE_USD,
      months: 1,
      currency: 'usd',
      environment: 'test_mode',
    });
    expect(body.order_id).toMatch(/^kz_/);
    expect(body.claim_token).toHaveLength(64);
    expect(JSON.stringify(body)).not.toContain(API_KEY);

    const [url, options] = calls[0];
    expect(url).toBe('https://api-sandbox.nowpayments.io/v1/invoice');
    const sent = JSON.parse(String(options.body));
    expect(sent).toMatchObject({
      price_amount: PRICE_USD,
      price_currency: 'usd',
      order_id: body.order_id,
      ipn_callback_url: `${WORKER_ORIGIN}/crypto/webhook`,
      is_fixed_rate: true,
    });
    expect(sent.success_url).toContain(`${SALES_ORIGIN}/success.html`);
    // The API key travels to the provider, never to the browser.
    expect((options.headers as Record<string, string>)['x-api-key']).toBe(API_KEY);

    const order = env.DB.table('crypto_orders')[0];
    expect(order).toMatchObject({ order_id: body.order_id, status: 'created', months: 1, price_usd: PRICE_USD });
  });

  it('surfaces a provider failure without echoing its body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'upstream detail that must not leak' }), { status: 401 })
    );
    const res = await worker.fetch(json('/crypto/checkout', {}), env as never);
    const body = await res.json();
    fetchSpy.mockRestore();

    expect(res.status).toBe(502);
    expect(body).toMatchObject({ error: 'checkout_failed', status: 401 });
    expect(JSON.stringify(body)).not.toContain('upstream detail');
    expect(env.DB.table('crypto_orders')).toHaveLength(0);
  });
});

describe('POST /crypto/webhook', () => {
  it('answers 401 when the IPN secret is not configured, so nothing can be trusted', async () => {
    const res = await worker.fetch(ipnRequest(paymentNotification()), makeEnv({ NOWPAYMENTS_IPN_SECRET: '' }) as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'invalid_signature', reason: 'missing_secret' });
  });

  it('answers 401 to an unsigned call even when the deploy is not configured', async () => {
    // Fail closed, and identically: an unauthenticated caller learns nothing about
    // whether the IPN secret exists.
    const res = await worker.fetch(
      ipnRequest(paymentNotification(), { withSignature: false }),
      makeEnv({ NOWPAYMENTS_IPN_SECRET: '' }) as never
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'invalid_signature', reason: 'missing_signature' });
  });

  it('rejects unsigned and tampered notifications with 401 and mints nothing', async () => {
    const env = makeEnv();
    const { body } = await startOrder(env);
    const payload = paymentNotification({ order_id: body.order_id });

    const unsigned = await worker.fetch(ipnRequest(payload, { withSignature: false }), env as never);
    expect(unsigned.status).toBe(401);

    const tampered = await worker.fetch(
      ipnRequest({ ...payload, price_amount: 0.01 }, { signature: signIpn(payload) }),
      env as never
    );
    expect(tampered.status).toBe(401);

    const wrongSecret = await worker.fetch(ipnRequest(payload, { secret: 'not-the-secret' }), env as never);
    expect(wrongSecret.status).toBe(401);

    expect(env.DB.table('crypto_orders')[0].status).toBe('created');
    expect(env.DB.table('crypto_orders')[0].code ?? null).toBeNull();
  });

  it('mints an activation code through the existing generator on a settled payment', async () => {
    const env = makeEnv();
    const { body } = await startOrder(env);

    const res = await worker.fetch(ipnRequest(paymentNotification({ order_id: body.order_id })), env as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, delivered: true });

    const order = env.DB.table('crypto_orders')[0];
    expect(order.status).toBe('delivered');
    // Same signed format the admin dashboard issues and /verify accepts.
    expect(String(order.code)).toMatch(/^DE-1M-[0-9A-F]{8}-[0-9A-F]{16}$/);

    // The buyer can read it back with the claim token, and only with it.
    const read = await worker.fetch(
      new Request(`${WORKER_ORIGIN}/crypto/order?id=${body.order_id}&token=${body.claim_token}`, { headers: { Origin: SALES_ORIGIN } }),
      env as never
    );
    expect(await read.json()).toMatchObject({ status: 'delivered', delivered: true, code: order.code });

    const wrongToken = await worker.fetch(
      new Request(`${WORKER_ORIGIN}/crypto/order?id=${body.order_id}&token=${'0'.repeat(64)}`, { headers: { Origin: SALES_ORIGIN } }),
      env as never
    );
    expect(wrongToken.status).toBe(404);
  });

  it('is reachable server-to-server (no Origin) even with a strict allowlist', async () => {
    const env = makeEnv();
    const { body } = await startOrder(env);
    const res = await worker.fetch(ipnRequest(paymentNotification({ order_id: body.order_id })), env as never);
    expect(res.status).toBe(200);
  });

  it('never mints a second code for a re-delivered notification', async () => {
    const env = makeEnv();
    const { body } = await startOrder(env);
    const payload = paymentNotification({ order_id: body.order_id });

    const first = await worker.fetch(ipnRequest(payload), env as never);
    expect(await first.json()).toMatchObject({ delivered: true });

    const replay = await worker.fetch(ipnRequest(payload), env as never);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ duplicate: true, delivered: false });

    const codes = env.DB.table('crypto_orders').map((o) => o.code).filter(Boolean);
    expect(codes).toHaveLength(1);
    expect(env.DB.table('crypto_events')).toHaveLength(1);
  });

  it('waits on intermediate statuses and records expiry without delivering', async () => {
    const env = makeEnv();
    const { body } = await startOrder(env);

    for (const status of ['waiting', 'confirming', 'confirmed', 'sending']) {
      const res = await worker.fetch(ipnRequest(paymentNotification({ order_id: body.order_id, payment_status: status })), env as never);
      expect(await res.json()).toMatchObject({ ok: true, delivered: false, classification: 'pending' });
    }
    expect(env.DB.table('crypto_orders')[0].status).toBe('created');

    await worker.fetch(ipnRequest(paymentNotification({ order_id: body.order_id, payment_status: 'expired' })), env as never);
    const order = env.DB.table('crypto_orders')[0];
    expect(order.status).toBe('failed');
    expect(order.code ?? null).toBeNull();
  });

  it('never claws back a delivered purchase when a later status fails', async () => {
    const env = makeEnv();
    const { body } = await startOrder(env);
    await worker.fetch(ipnRequest(paymentNotification({ order_id: body.order_id })), env as never);

    await worker.fetch(
      ipnRequest(paymentNotification({ order_id: body.order_id, payment_status: 'refunded' })),
      env as never
    );
    const order = env.DB.table('crypto_orders')[0];
    expect(order.status).toBe('delivered');
    expect(order.code).toBeTruthy();
  });

  it('acknowledges a payment it cannot match to an order, and mints nothing', async () => {
    const env = makeEnv();
    const res = await worker.fetch(ipnRequest(paymentNotification({ order_id: 'kz_does_not_exist' })), env as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, delivered: false, reason: 'unknown_order' });
    expect(env.DB.table('error_reports').some((e) => e.error_type === 'crypto_unknown_order')).toBe(true);
  });

  it('refuses to deliver when the settled amount does not match the order', async () => {
    const env = makeEnv();
    const { body } = await startOrder(env);
    const res = await worker.fetch(
      ipnRequest(paymentNotification({ order_id: body.order_id, price_amount: 0.5 })),
      env as never
    );
    expect(await res.json()).toMatchObject({ delivered: false, reason: 'price_mismatch' });
    const order = env.DB.table('crypto_orders')[0];
    expect(order.status).toBe('failed');
    expect(order.code ?? null).toBeNull();
  });

  it('asks for a retry instead of charging without a code when the mint is unavailable', async () => {
    const env = makeEnv();
    const { body } = await startOrder(env);
    const payload = paymentNotification({ order_id: body.order_id });

    // The generator is injected by the worker; calling the module directly with no
    // deps is exactly the "mint unavailable" case (a misconfigured deploy).
    const res = await handleCryptoWebhook(ipnRequest(payload), env as never, {}, {});
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: 'fulfillment_failed', reason: 'mint_unavailable', retry: true });

    const order = env.DB.table('crypto_orders')[0];
    expect(order.status).toBe('paid');
    expect(order.code ?? null).toBeNull();
    expect(env.DB.table('error_reports').some((e) => e.error_type === 'crypto_fulfill_failed')).toBe(true);

    // The event claim must be released, otherwise the provider's retry would be
    // deduped into a no-op and the buyer would be charged with nothing delivered.
    expect(env.DB.table('crypto_events')).toHaveLength(0);

    const retry = await worker.fetch(ipnRequest(payload), env as never);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ delivered: true });
    expect(env.DB.table('crypto_orders')[0].status).toBe('delivered');
    expect(env.DB.table('crypto_orders')[0].code).toBeTruthy();
  });
});

describe('GET /crypto/health', () => {
  it('reports readiness as booleans and never echoes a secret', async () => {
    const res = await worker.fetch(
      new Request(`${WORKER_ORIGIN}/crypto/health`, { headers: { Origin: SALES_ORIGIN } }),
      makeEnv() as never
    );
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      provider: 'nowpayments',
      environment: 'test_mode',
      apiKeyConfigured: true,
      ipnSecretConfigured: true,
      salesOrigin: SALES_ORIGIN,
      priceUsd: PRICE_USD,
      months: 1,
      ready: true,
    });
    expect(JSON.stringify(body)).not.toContain(API_KEY);
    expect(JSON.stringify(body)).not.toContain(IPN_SECRET);
  });

  it('is not ready while a credential is missing', async () => {
    const res = await worker.fetch(
      new Request(`${WORKER_ORIGIN}/crypto/health`, { headers: { Origin: SALES_ORIGIN } }),
      makeEnv({ NOWPAYMENTS_IPN_SECRET: '' }) as never
    );
    expect(await res.json()).toMatchObject({ ipnSecretConfigured: false, ready: false });
  });
});

describe('end to end: crypto purchase -> activation code -> app redemption', () => {
  it('a signed payment notification produces a code the app redeems into Pro', async () => {
    const env = makeEnv();

    // 1. The buyer starts a purchase on the sales site.
    const { res: checkoutRes, body: checkout } = await startOrder(env);
    expect(checkoutRes.status).toBe(200);

    // 2. The app account that will redeem the code (Google identity, crafted the
    //    way the other worker tests do it).
    const token = `${Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')}.` +
      `${Buffer.from(JSON.stringify({
        sub: 'buyer-1',
        aud: 'client-id',
        iss: 'https://accounts.google.com',
        email: 'buyer@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })).toString('base64url')}.signature`;

    const before = await worker.fetch(json('/check-status', {}, APP_ORIGIN).clone(), env as never);
    expect(await before.json()).toMatchObject({ active: false });

    // 3. NOWPayments settles the invoice and signs the notification.
    const settled = await worker.fetch(ipnRequest(paymentNotification({ order_id: checkout.order_id })), env as never);
    expect(settled.status).toBe(200);

    // 4. The buyer reads the code from the success page...
    const read = await worker.fetch(
      new Request(`${WORKER_ORIGIN}/crypto/order?id=${checkout.order_id}&token=${checkout.claim_token}`, {
        headers: { Origin: SALES_ORIGIN },
      }),
      env as never
    );
    const delivered = await read.json();
    expect(delivered.delivered).toBe(true);
    const code = delivered.code as string;

    // 5. ...and redeems it in the app through the untouched /verify endpoint.
    const verifyRes = await worker.fetch(
      new Request(`${WORKER_ORIGIN}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: APP_ORIGIN },
        body: JSON.stringify({ code }),
      }),
      env as never
    );
    const verified = await verifyRes.json();
    expect(verified).toMatchObject({ valid: true, months: 1 });

    // 6. The app now reports an active Pro plan.
    const after = await worker.fetch(
      new Request(`${WORKER_ORIGIN}/check-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: APP_ORIGIN },
        body: JSON.stringify({}),
      }),
      env as never
    );
    const status = await after.json();
    expect(status.active).toBe(true);
    expect(status.days_remaining).toBeGreaterThan(25);

    // 7. Re-delivering the same settlement extends nothing and mints no extra code.
    await worker.fetch(ipnRequest(paymentNotification({ order_id: checkout.order_id })), env as never);
    const deliveredCodes = env.DB.table('crypto_orders').map((o) => o.code).filter(Boolean);
    expect(deliveredCodes).toHaveLength(1);

    const statusAgain = await worker.fetch(
      new Request(`${WORKER_ORIGIN}/check-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: APP_ORIGIN },
        body: JSON.stringify({}),
      }),
      env as never
    );
    expect((await statusAgain.json()).expiresAt).toBe(status.expiresAt);
  });
});
