import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import worker from '../cloudflare-unified-worker';
import {
  applyDodoEvent,
  classifyDodoEvent,
  resolveAppOrigin,
  resolvePeriodEndMs,
  verifyDodoSignature,
} from '../cloudflare-dodo';

/**
 * Dodo Payments billing tests.
 *
 * The contract under test is the ONLY way a learner becomes Pro by card:
 *   signature-verified webhook -> KV `account:<sub>` + the `users` registry row
 * which is exactly what `/check-status` reads. The last test proves that path
 * end to end (signed webhook in, /check-status reports Pro out) rather than
 * asserting on internals.
 */

type Row = Record<string, unknown>;

class MemoryKv {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async put(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

const PK_OF: Record<string, string> = {
  billing_events: 'event_id',
  subscriptions: 'subscription_id',
  users: 'id',
};

/**
 * D1 stub: parses the specific statement shapes this module emits (INSERT with a
 * primary-key conflict, upsert-on-conflict, and the handful of SELECTs) so the
 * idempotency and max()-entitlement semantics are genuinely exercised.
 */
class BillingD1 {
  tables: Record<string, Row[]> = {};

  table(name: string): Row[] {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }

  prepare(sql: string) {
    const norm = sql.replace(/\s+/g, ' ').trim();
    const self = this;
    const run = (args: unknown[]) => self.exec(norm, args);
    return {
      _batch: () => run([]),
      run: () => run([]),
      bind: (...args: unknown[]) => ({
        run: () => run(args),
        first: () => self.first(norm, args),
        all: async () => ({ results: self.select(norm, args), success: true }),
      }),
    };
  }

  batch(stmts: Array<{ _batch?: () => unknown }>) {
    return Promise.all(stmts.map((s) => (s && s._batch ? s._batch() : s)));
  }

  private columnsOf(clause: string): string[] {
    return clause.replace(/[()]/g, '').split(',').map((c) => c.trim()).filter(Boolean);
  }

  private rowFrom(cols: string[], tokens: string[], args: unknown[]): Row {
    const row: Row = {};
    let cursor = 0;
    cols.forEach((col, i) => {
      const token = (tokens[i] || '').trim();
      if (token === '?') row[col] = args[cursor++];
      else if (/^null$/i.test(token)) row[col] = null;
      else row[col] = token.replace(/^'/, '').replace(/'$/, '');
    });
    return row;
  }

  exec(norm: string, args: unknown[]) {
    let m: RegExpMatchArray | null;

    if ((m = norm.match(/^CREATE TABLE IF NOT EXISTS (\w+)/i))) {
      this.table(m[1]);
      return { success: true };
    }
    if (/^CREATE INDEX/i.test(norm)) return { success: true };

    if ((m = norm.match(/^INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)(.*)$/i))) {
      const [, name, colClause, valueClause, tail] = m;
      const cols = this.columnsOf(colClause);
      const tokens = valueClause.split(',').map((t) => t.trim());
      const incoming = this.rowFrom(cols, tokens, args);
      const pk = PK_OF[name];
      const rows = this.table(name);
      const existing = pk ? rows.find((r) => r[pk] === incoming[pk]) : undefined;

      if (existing) {
        const onConflict = tail.match(/ON CONFLICT\s*\([^)]*\)\s*DO UPDATE SET ([\s\S]+)$/i);
        if (!onConflict) throw new Error(`D1_ERROR: UNIQUE constraint failed: ${name}.${pk}`);
        // Scanned with one regex, NOT split on commas: `COALESCE(excluded.email,
        // users.email)` contains a comma of its own.
        const assignmentRe =
          /(\w+)\s*=\s*(COALESCE\(\s*excluded\.(\w+)\s*,\s*\w+\.(\w+)\s*\)|excluded\.(\w+)|'[^']*')/gi;
        let a: RegExpExecArray | null;
        while ((a = assignmentRe.exec(onConflict[1]))) {
          const col = a[1];
          if (a[3] !== undefined) existing[col] = incoming[a[3]] ?? existing[a[4]];
          else if (a[5] !== undefined) existing[col] = incoming[a[5]];
          else existing[col] = a[2].replace(/'/g, '');
        }
        return { success: true };
      }
      rows.push(incoming);
      return { success: true, meta: { changes: 1 } };
    }

    if ((m = norm.match(/^UPDATE (\w+) SET ([\s\S]+?) WHERE (\w+) = \?$/i))) {
      const [, name, assignments, whereCol] = m;
      const target = args[args.length - 1];
      for (const row of this.table(name)) {
        if (row[whereCol] !== target) continue;
        let cursor = 0;
        for (const assignment of assignments.split(/,/)) {
          const a = assignment.match(/^\s*(\w+)\s*=\s*(.+?)\s*$/);
          if (!a) continue;
          const [, col, expr] = a;
          if (expr === '?') row[col] = args[cursor++];
          else if (new RegExp(`^${col}$`, 'i').test(expr)) continue; // col = col
          else row[col] = expr.replace(/'/g, '');
        }
      }
      return { success: true };
    }

    return { success: true };
  }

  select(norm: string, args: unknown[]): Row[] {
    const m = norm.match(/^SELECT ([\s\S]+?) FROM (\w+)([\s\S]*)$/i);
    if (!m) return [];
    const [, fields, name, rest] = m;
    let rows = [...this.table(name)];

    const where = rest.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER BY|\s+LIMIT|$)/i);
    if (where) {
      const cond = where[1].trim();
      const lowerEmail = cond.match(/lower\(\s*email\s*\)\s*=\s*\?/i);
      const equality = cond.match(/(\w+)\s*=\s*\?/);
      const value = args[0];
      if (lowerEmail) {
        rows = rows.filter((r) => String(r.email ?? '').toLowerCase() === String(value).toLowerCase());
      } else if (equality) {
        rows = rows.filter((r) => r[equality[1]] === value);
      }
    }

    const order = rest.match(/ORDER BY (\w+)\s*(DESC|ASC)?/i);
    if (order) {
      const [, col, dir] = order;
      rows.sort((a, b) => {
        const av = a[col] as number; const bv = b[col] as number;
        return dir && dir.toUpperCase() === 'DESC' ? (bv ?? 0) - (av ?? 0) : (av ?? 0) - (bv ?? 0);
      });
    }
    const limit = rest.match(/LIMIT (\d+)/i);
    if (limit) rows = rows.slice(0, Number(limit[1]));

    if (/^COUNT\(\*\) AS c$/i.test(fields.trim())) return [{ c: rows.length }];
    if (fields.trim() === '*') return rows;

    const selected = fields.split(',').map((f) => f.trim().replace(/\s+AS\s+\w+$/i, ''));
    return rows.map((r) => {
      const out: Row = {};
      for (const col of selected) out[col] = r[col] ?? null;
      return out;
    });
  }

  first(norm: string, args: unknown[]) {
    return this.select(norm, args)[0] ?? null;
  }
}

// ---------------------------------------------------------------------------
// Signature helpers — the test signs with the same key the worker derives from
// the `whsec_<base64>` secret Dodo's dashboard hands out.
// ---------------------------------------------------------------------------

const WEBHOOK_KEY = Buffer.from('katzu-dodo-webhook-test-key');
const WEBHOOK_SECRET = `whsec_${WEBHOOK_KEY.toString('base64')}`;

function signatureHeaders(body: string, { id = 'evt_1', timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const sig = createHmac('sha256', WEBHOOK_KEY).update(`${id}.${timestamp}.${body}`).digest('base64');
  return {
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${sig}`,
  };
}

function subscriptionEvent(overrides: Row = {}, data: Row = {}) {
  return {
    business_id: 'biz_test',
    timestamp: new Date().toISOString(),
    type: 'subscription.active',
    ...overrides,
    data: {
      subscription_id: 'sub_test_1',
      product_id: 'pdt_monthly',
      status: 'active',
      next_billing_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      customer: { customer_id: 'cus_1', email: 'learner@example.com' },
      metadata: { user_sub: 'user-1', user_email: 'learner@example.com' },
      ...data,
    },
  };
}

const APP_ORIGIN = 'https://app.example';

function makeEnv(extra: Record<string, unknown> = {}) {
  return {
    // 'test' (not 'production') so the fetch-entry guard does not strip TEST_MODE
    // and /check-status can resolve an account from a crafted token. CORS is
    // unaffected: a valid allowlist is enforced strictly in either mode. The
    // production deploy is covered explicitly further down.
    ENVIRONMENT: 'test',
    ALLOWED_ORIGINS: APP_ORIGIN,
    GOOGLE_CLIENT_ID: 'client-id',
    TEST_MODE: '1',
    USER_PROGRESS: new MemoryKv(),
    REDEEMED_CODES: new MemoryKv(),
    DB: new BillingD1(),
    ...extra,
  };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://worker.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const webhookRequest = (body: string, headers: Record<string, string>) =>
  new Request('https://worker.test/billing/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });

describe('Dodo webhook signature verification', () => {
  it('accepts a correctly signed payload', async () => {
    const body = JSON.stringify(subscriptionEvent());
    const result = await verifyDodoSignature(body, signatureHeaders(body), WEBHOOK_SECRET);
    expect(result.ok).toBe(true);
    expect(result.eventId).toBe('evt_1');
  });

  it('rejects a tampered body, a wrong secret, and missing headers', async () => {
    const body = JSON.stringify(subscriptionEvent());
    const headers = signatureHeaders(body);

    expect((await verifyDodoSignature(body.replace('active', 'cancelled'), headers, WEBHOOK_SECRET)).ok).toBe(false);
    expect(
      (await verifyDodoSignature(body, headers, `whsec_${Buffer.from('wrong-key').toString('base64')}`)).ok,
    ).toBe(false);
    expect((await verifyDodoSignature(body, {}, WEBHOOK_SECRET)).ok).toBe(false);
    expect((await verifyDodoSignature(body, { 'webhook-id': 'evt_1' }, WEBHOOK_SECRET)).ok).toBe(false);
  });

  it('rejects a stale timestamp (replay window) and accepts several candidates', async () => {
    const body = JSON.stringify(subscriptionEvent());
    const stale = signatureHeaders(body, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect((await verifyDodoSignature(body, stale, WEBHOOK_SECRET)).ok).toBe(false);

    const fresh = signatureHeaders(body);
    const multi = { ...fresh, 'webhook-signature': `v1,AAAA ${fresh['webhook-signature']}` };
    expect((await verifyDodoSignature(body, multi, WEBHOOK_SECRET)).ok).toBe(true);
  });
});

describe('Dodo event classification', () => {
  it('maps the subscription lifecycle to grant/keep/cancel/end', () => {
    expect(classifyDodoEvent('subscription.active')).toBe('grant');
    expect(classifyDodoEvent('subscription.renewed')).toBe('grant');
    expect(classifyDodoEvent('subscription.plan_changed')).toBe('grant');
    expect(classifyDodoEvent('subscription.on_hold')).toBe('keep');
    expect(classifyDodoEvent('subscription.past_due')).toBe('keep');
    expect(classifyDodoEvent('subscription.cancelled')).toBe('cancel');
    // Dodo documents subscription.failed as a mandate-creation failure: it must
    // neither grant nor revoke.
    expect(classifyDodoEvent('subscription.failed')).toBe('deny');
    expect(classifyDodoEvent('subscription.expired')).toBe('end');
    expect(classifyDodoEvent('subscription.update_payment_method')).toBe('ignore');
    // subscription.updated fires on ANY change, so only an active status grants.
    expect(classifyDodoEvent('subscription.updated', { status: 'active' })).toBe('grant');
    expect(classifyDodoEvent('subscription.updated', { status: 'cancelled' })).toBe('keep');
    // A one-off payment must not create an entitlement.
    expect(classifyDodoEvent('payment.succeeded', {})).toBe('ignore');
    expect(classifyDodoEvent('payment.succeeded', { subscription_id: 'sub_1' })).toBe('grant');
    expect(classifyDodoEvent('payment.failed')).toBe('ignore');
  });

  it('reads the period end from next_billing_date, falling back to expires_at', () => {
    const when = '2026-11-01T00:00:00.000Z';
    expect(resolvePeriodEndMs({ next_billing_date: when })).toBe(Date.parse(when));
    expect(resolvePeriodEndMs({ expires_at: when })).toBe(Date.parse(when));
    expect(resolvePeriodEndMs({})).toBeNull();
  });

  it('derives the return origin from config when no override is set', () => {
    expect(resolveAppOrigin({ ALLOWED_ORIGINS: 'https://a.example,https://b.example' })).toBe('https://a.example');
    expect(resolveAppOrigin({ CHECKOUT_RETURN_ORIGIN: 'https://katzu.app/', ALLOWED_ORIGINS: 'https://a.example' }))
      .toBe('https://katzu.app');
  });

  it('never returns the paying customer to the worker\'s own host', () => {
    // ALLOWED_ORIGINS lists the worker host first (the admin dashboard lives
    // there). Returning a customer to it would strand them on a JSON 404.
    const request = new Request('https://worker.example/billing/checkout');
    expect(
      resolveAppOrigin({ ALLOWED_ORIGINS: 'https://worker.example, https://app.example' }, request),
    ).toBe('https://app.example');
    // If every entry is the worker itself, fall back rather than return nothing.
    expect(resolveAppOrigin({ ALLOWED_ORIGINS: 'https://worker.example' }, request)).toBe('https://worker.example');
  });
});

describe('Dodo webhook -> entitlement', () => {
  it('grants Pro on subscription.active and writes both entitlement stores', async () => {
    const env = makeEnv({ DODO_WEBHOOK_SECRET: WEBHOOK_SECRET });
    const body = JSON.stringify(subscriptionEvent());
    const res = await worker.fetch(webhookRequest(body, signatureHeaders(body)), env);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, action: 'grant', active: true });

    const record = JSON.parse((await env.REDEEMED_CODES.get('account:user-1')) as string);
    expect(record.source).toBe('dodo');
    expect(Date.parse(record.expiresAt)).toBeGreaterThan(Date.now());

    const user = env.DB.table('users').find((u) => u.id === 'user-1');
    expect(user?.plan).toBe('pro');
    expect(user?.plan_expires_at).toBeGreaterThan(Date.now());
    // The primary key is the sub, so email→sub resolution works for admin lookups.
    expect(await env.REDEEMED_CODES.get('email_index:learner@example.com')).toBe('user-1');
  });

  it('rejects an unsigned webhook with 401 and grants nothing', async () => {
    const env = makeEnv({ DODO_WEBHOOK_SECRET: WEBHOOK_SECRET });
    const body = JSON.stringify(subscriptionEvent());
    const res = await worker.fetch(webhookRequest(body, { 'webhook-id': 'evt_x' }), env);

    expect(res.status).toBe(401);
    expect(await env.REDEEMED_CODES.get('account:user-1')).toBeNull();
    expect(env.DB.table('users')).toHaveLength(0);
  });

  it('grants under ENVIRONMENT=production, where the TEST_MODE shortcut is stripped', async () => {
    const env = makeEnv({ DODO_WEBHOOK_SECRET: WEBHOOK_SECRET, ENVIRONMENT: 'production' });
    const body = JSON.stringify(subscriptionEvent());
    const res = await worker.fetch(webhookRequest(body, signatureHeaders(body)), env);
    expect(res.status).toBe(200);
    // Billing must not depend on any test-only auth shortcut being available.
    expect(await res.json()).toMatchObject({ received: true, active: true });
    expect(env.DB.table('users').find((u) => u.id === 'user-1')?.plan).toBe('pro');
  });

  it('answers 503 when the webhook secret is not configured on the deploy', async () => {
    const env = makeEnv();
    const body = JSON.stringify(subscriptionEvent());
    const res = await worker.fetch(webhookRequest(body, signatureHeaders(body)), env);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'billing_not_configured' });
  });

  it('is idempotent: replaying the same event id never extends access twice', async () => {
    const env = makeEnv({ DODO_WEBHOOK_SECRET: WEBHOOK_SECRET });
    const body = JSON.stringify(subscriptionEvent());
    const headers = signatureHeaders(body);

    await worker.fetch(webhookRequest(body, headers), env);
    const first = JSON.parse((await env.REDEEMED_CODES.get('account:user-1')) as string).expiresAt;

    const replay = await worker.fetch(webhookRequest(body, headers), env);
    const replayBody = await replay.json();
    expect(replay.status).toBe(200); // 2xx so Dodo stops retrying
    expect(replayBody.duplicate).toBe(true);

    const second = JSON.parse((await env.REDEEMED_CODES.get('account:user-1')) as string).expiresAt;
    expect(second).toBe(first);
  });

  it('never shortens paid access when an out-of-order event arrives late', async () => {
    const env = makeEnv({ DODO_WEBHOOK_SECRET: WEBHOOK_SECRET });
    const far = new Date(Date.now() + 90 * 86400000).toISOString();
    const near = new Date(Date.now() + 5 * 86400000).toISOString();

    const first = JSON.stringify(subscriptionEvent({}, { next_billing_date: far }));
    await worker.fetch(webhookRequest(first, signatureHeaders(first, { id: 'evt_early' })), env);
    const farExpiry = JSON.parse((await env.REDEEMED_CODES.get('account:user-1')) as string).expiresAt;

    const second = JSON.stringify(subscriptionEvent({}, { next_billing_date: near }));
    await worker.fetch(webhookRequest(second, signatureHeaders(second, { id: 'evt_late' })), env);

    const after = JSON.parse((await env.REDEEMED_CODES.get('account:user-1')) as string).expiresAt;
    expect(after).toBe(farExpiry);
  });

  it('keeps access on on_hold, ends it on expired, and never grants on failed', async () => {
    const env = makeEnv({ DODO_WEBHOOK_SECRET: WEBHOOK_SECRET });
    const active = JSON.stringify(subscriptionEvent());
    await worker.fetch(webhookRequest(active, signatureHeaders(active, { id: 'evt_active' })), env);
    const granted = JSON.parse((await env.REDEEMED_CODES.get('account:user-1')) as string).expiresAt;

    const hold = JSON.stringify(subscriptionEvent({ type: 'subscription.on_hold' }, { status: 'on_hold' }));
    await worker.fetch(webhookRequest(hold, signatureHeaders(hold, { id: 'evt_hold' })), env);
    expect(JSON.parse((await env.REDEEMED_CODES.get('account:user-1')) as string).expiresAt).toBe(granted);

    const failed = JSON.stringify(
      subscriptionEvent({ type: 'subscription.failed' }, { status: 'failed', next_billing_date: null }),
    );
    const failedRes = await worker.fetch(webhookRequest(failed, signatureHeaders(failed, { id: 'evt_failed' })), env);
    expect(await failedRes.json()).toMatchObject({ action: 'deny' });
    // A creation failure must not revoke the period already paid for.
    expect(JSON.parse((await env.REDEEMED_CODES.get('account:user-1')) as string).expiresAt).toBe(granted);
    expect(env.DB.table('users').find((u) => u.id === 'user-1')?.plan).toBe('pro');

    const expired = JSON.stringify(
      subscriptionEvent({ type: 'subscription.expired' }, { status: 'expired', next_billing_date: null }),
    );
    await worker.fetch(webhookRequest(expired, signatureHeaders(expired, { id: 'evt_expired' })), env);

    const record = JSON.parse((await env.REDEEMED_CODES.get('account:user-1')) as string);
    expect(Date.now() - Date.parse(record.expiresAt)).toBeGreaterThanOrEqual(0);
    expect(env.DB.table('users').find((u) => u.id === 'user-1')?.plan).toBe('free');
  });

  it('a failed card never revokes an activation-code entitlement', async () => {
    const env = makeEnv({ DODO_WEBHOOK_SECRET: WEBHOOK_SECRET });
    // A code redemption writes `account:<sub>` with no `source` marker and a
    // longer expiry than the subscription period.
    const codeExpiry = new Date(Date.now() + 180 * 86400000).toISOString();
    await env.REDEEMED_CODES.put(
      'account:user-1',
      JSON.stringify({ email: 'learner@example.com', expiresAt: codeExpiry }),
    );

    const expired = JSON.stringify(
      subscriptionEvent({ type: 'subscription.expired' }, { status: 'expired', next_billing_date: null }),
    );
    const res = await worker.fetch(webhookRequest(expired, signatureHeaders(expired, { id: 'evt_code_guard' })), env);

    expect((await res.json()).preserved).toBe(true);
    const record = JSON.parse((await env.REDEEMED_CODES.get('account:user-1')) as string);
    expect(record.expiresAt).toBe(codeExpiry);
  });

  it('acknowledges but does not grant when the event cannot be tied to an account', async () => {
    const env = makeEnv({ DODO_WEBHOOK_SECRET: WEBHOOK_SECRET });
    const orphan = JSON.stringify(
      subscriptionEvent({}, { metadata: {}, customer: { customer_id: 'cus_x' } }),
    );
    const res = await worker.fetch(webhookRequest(orphan, signatureHeaders(orphan, { id: 'evt_orphan' })), env);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ handled: false, reason: 'unmatched_account' });
    expect(env.DB.table('users')).toHaveLength(0);
  });

  it('resolves the account from the customer email when metadata is absent', async () => {
    const env = makeEnv({ DODO_WEBHOOK_SECRET: WEBHOOK_SECRET });
    await env.DB.table('users').push({ id: 'user-by-email', email: 'learner@example.com', plan: 'free' });

    const event = JSON.stringify(subscriptionEvent({}, { metadata: {} }));
    const result = await applyDodoEvent(env, { eventId: 'evt_email', event: JSON.parse(event) });

    expect(result).toMatchObject({ handled: true, active: true });
    expect(await env.REDEEMED_CODES.get('account:user-by-email')).toBeTruthy();
  });
});

describe('Dodo checkout + status routes', () => {
  const sessionEnv = () => {
    const env = makeEnv({ DODO_API_KEY: 'dodo_test_key', DODO_PRODUCT_ID_MONTHLY: 'pdt_monthly' });
    env.USER_PROGRESS.put('session:sess_abc', JSON.stringify({
      sub: 'user-1',
      email: 'learner@example.com',
      created_at: Date.now(),
      expires_at: Date.now() + 3600000,
    }));
    return env;
  };

  it('requires a signed-in learner', async () => {
    const env = sessionEnv();
    const res = await worker.fetch(post('/billing/checkout', { plan: 'monthly' }), env);
    expect(res.status).toBe(401);
  });

  it('answers 503 (not a crash) when the API key is missing', async () => {
    const env = sessionEnv();
    delete (env as Record<string, unknown>).DODO_API_KEY;
    const res = await worker.fetch(
      post('/billing/checkout', { plan: 'monthly' }, { Authorization: 'Bearer sess_abc' }),
      env,
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('billing_not_configured');
  });

  it('creates a hosted session bound to the caller and returns only the URL', async () => {
    const env = sessionEnv();
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const upstream = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push({ url: String(url), init: init as RequestInit });
      return new Response(
        JSON.stringify({
          session_id: 'cks_1',
          checkout_url: 'https://test.checkout.dodopayments.com/session/cks_1',
        }),
        { status: 200 },
      );
    });

    try {
      const res = await worker.fetch(
        post('/billing/checkout', { plan: 'monthly' }, { Authorization: 'Bearer sess_abc' }),
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.checkout_url).toBe('https://test.checkout.dodopayments.com/session/cks_1');

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('https://test.dodopayments.com/checkouts');
      const headers = calls[0].init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer dodo_test_key');
      const sent = JSON.parse(String(calls[0].init.body));
      expect(sent.product_cart).toEqual([{ product_id: 'pdt_monthly', quantity: 1 }]);
      // The account binding must come from the session, never from the client.
      expect(sent.metadata.user_sub).toBe('user-1');
      expect(sent.return_url).toBe(`${APP_ORIGIN}/app/profile?checkout=success`);
      expect(JSON.stringify(body)).not.toContain('dodo_test_key');
    } finally {
      upstream.mockRestore();
    }
  });

  it('surfaces billing health without leaking the key', async () => {
    const env = sessionEnv();
    const res = await worker.fetch(
      new Request('https://worker.test/billing/health', { headers: { Origin: APP_ORIGIN } }),
      env,
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      provider: 'dodo',
      environment: 'test_mode',
      apiKeyConfigured: true,
      webhookSecretConfigured: false,
      monthlyProductConfigured: true,
      ready: false,
    });
    expect(JSON.stringify(body)).not.toContain('dodo_test_key');
  });

  it('reports plan state to the app', async () => {
    const env = sessionEnv({});
    const res = await worker.fetch(
      post('/billing/status', {}, { Authorization: 'Bearer sess_abc' }),
      env,
    );
    expect(await res.json()).toMatchObject({ active: false, plan: 'free', provider: 'dodo' });
  });
});

describe('end to end: test payment -> plan update', () => {
  it('a signed webhook makes /check-status report an active Pro plan', async () => {
    const env = makeEnv({ DODO_WEBHOOK_SECRET: WEBHOOK_SECRET });

    // 1. The learner is free to begin with.
    const token = (payload: Record<string, unknown>) =>
      `${Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')}.` +
      `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
    const idToken = token({
      sub: 'user-1',
      aud: 'client-id',
      iss: 'https://accounts.google.com',
      email: 'learner@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const before = await worker.fetch(post('/check-status', {}, { Authorization: `Bearer ${idToken}` }), env);
    expect(await before.json()).toMatchObject({ active: false });

    // 2. Dodo delivers a signed payment confirmation for this account.
    const body = JSON.stringify(subscriptionEvent());
    const webhook = await worker.fetch(webhookRequest(body, signatureHeaders(body)), env);
    expect(webhook.status).toBe(200);

    // 3. The learner's plan is now Pro, read through the normal client path.
    const after = await worker.fetch(post('/check-status', {}, { Authorization: `Bearer ${idToken}` }), env);
    const status = await after.json();
    expect(status.active).toBe(true);
    expect(status.days_remaining).toBeGreaterThan(25);
    expect(status.expiresAt).toBeTruthy();

    // ...and the admin registry agrees, so support can see the purchase.
    const user = env.DB.table('users').find((u) => u.id === 'user-1');
    expect(user?.plan).toBe('pro');
  });
});
