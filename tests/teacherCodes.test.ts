import { describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';

/**
 * V24 Phase 6 — teacher/cohort codes.
 *
 * `POST /admin/generate` grows two optional fields: `label` (a free-text
 * teacher/cohort tag, metadata only — never entitlement) and `count` (mint a
 * batch in one call). Every minted code is recorded in a `generated_codes`
 * ledger, and `GET /admin/codes/report` is a READ-ONLY per-label view of codes
 * created vs activated (activation comes from redeemed_codes_ledger, i.e. real
 * redemptions, not the ledger's own optimism).
 *
 * Hard rules pinned here: the auth gate and throttle are identical to the
 * existing admin routes; the response shape is backward-compatible (single
 * request without label/count returns exactly `{ code }` as before); no code
 * value is ever echoed by the report.
 */

const SECRET = 'unit-test-admin-secret-0123456789abcdef';

/** D1 double that models only the statements the code routes issue. */
class CodesD1 {
  generated = new Map<string, { months: number; label: string | null; created_at: string }>();
  redeemed = new Map<string, { account_id: string; months: number }>();
  tablesReady = true;
  failures = 0;

  prepare(sql: string) {
    const norm = sql.replace(/\s+/g, ' ').trim();
    const self = this;
    return {
      async run() {
        if (self.failures > 0) throw new Error('D1_ERROR: simulated outage');
        if (norm.startsWith('CREATE TABLE')) return { success: true };
        if (norm.startsWith('INSERT INTO generated_codes')) {
          // Direct .run() path (registry tables etc.) — nothing to record.
          return { success: true };
        }
        return { success: true };
      },
      bind(...args: unknown[]) {
        return {
          async run() {
            if (self.failures > 0) throw new Error('D1_ERROR: simulated outage');
            const insGen = norm.match(/^INSERT INTO generated_codes \(code, months, label, created_at\) VALUES \(\?, \?, \?, \?\) ON CONFLICT\(code\) DO NOTHING$/);
            if (insGen) {
              const [code, months, label, createdAt] = args as [string, number, string | null, string];
              if (!self.generated.has(code)) self.generated.set(code, { months, label, created_at: createdAt });
              return { success: true };
            }
            if (norm.startsWith('INSERT INTO redeemed_codes_ledger')) {
              const [code, accountId] = args as [string, string];
              if (self.redeemed.has(code)) throw new Error('UNIQUE constraint failed');
              self.redeemed.set(code, { account_id: accountId, months: 1 });
              return { success: true };
            }
            return { success: true };
          },
        };
      },
      async all() {
        if (self.failures > 0) throw new Error('D1_ERROR: simulated outage');
        if (norm.startsWith('SELECT COALESCE(gc.label')) {
          const rows: Array<Record<string, unknown>> = [];
          const byLabel = new Map<string, { created: Set<string>; activated: Set<string>; first: string; last: string }>();
          for (const [code, row] of self.generated) {
            const key = row.label ?? '';
            const entry = byLabel.get(key) ?? { created: new Set(), activated: new Set(), first: row.created_at, last: row.created_at };
            entry.created.add(code);
            entry.last = entry.last > row.created_at ? entry.last : row.created_at;
            byLabel.set(key, entry);
          }
          for (const code of self.redeemed.keys()) {
            const row = self.generated.get(code);
            if (!row) continue;
            const entry = byLabel.get(row.label ?? '');
            entry?.activated.add(code);
          }
          for (const [label, entry] of byLabel) {
            rows.push({ label, created: entry.created.size, activated: entry.activated.size, first_created_at: entry.first, last_created_at: entry.last });
          }
          return { results: rows, success: true };
        }
        return { results: [], success: true };
      },
    };
  }

  async batch(stmts: Array<Record<string, unknown>>) {
    for (const stmt of stmts) {
      // Statements arrive either pre-bound ({run}) or raw ({bind → run}).
      if (typeof stmt.run === 'function') await (stmt.run as () => Promise<unknown>)();
      else if (typeof stmt.bind === 'function') {
        const bound = (stmt.bind as (...args: unknown[]) => { run: () => Promise<unknown> })();
        await bound.run();
      }
    }
    return [];
  }
}

function adminEnv(d1: CodesD1 | null) {
  return {
    ENVIRONMENT: 'development',
    TEST_MODE: true,
    GOOGLE_CLIENT_ID: 'client-id',
    ADMIN_SECRET: SECRET,
    HMAC_SECRET: 'unit-test-hmac-secret',
    DB: d1,
    USER_PROGRESS: null,
  };
}

function adminReq(path: string, body?: unknown) {
  return new Request(`https://worker.test${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, 'CF-Connecting-IP': '203.0.113.9' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('teacher codes — batch generation with a label (V24 Phase 6)', () => {
  it('keeps the old shape: no label/count → exactly one code, response `{ code }`', async () => {
    const d1 = new CodesD1();
    const res = await worker.fetch(adminReq('/admin/generate', { months: 3 }), adminEnv(d1) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code?: string; codes?: string[] };
    expect(body.code).toMatch(/^DE-3M-[A-Z0-9]+-[A-F0-9]{16}$/);
    expect(body.codes).toBeUndefined();
    expect(d1.generated.size).toBe(1);
    expect(d1.generated.get(body.code!)?.label).toBeNull();
  });

  it('mints `count` distinct codes in one call and returns them as `{ codes }`', async () => {
    const d1 = new CodesD1();
    const res = await worker.fetch(adminReq('/admin/generate', { months: 3, count: 5, label: 'Ustadha Mona — cohort A' }), adminEnv(d1) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code?: string; codes?: string[] };
    expect(body.codes).toHaveLength(5);
    expect(new Set(body.codes).size).toBe(5);
    for (const code of body.codes!) expect(code).toMatch(/^DE-3M-[A-Z0-9]+-[A-F0-9]{16}$/);
    expect(d1.generated.size).toBe(5);
    for (const row of d1.generated.values()) expect(row.label).toBe('Ustadha Mona — cohort A');
  });

  it('clamps count into 1..50 and truncates the label at 64 chars — metadata only', async () => {
    const d1 = new CodesD1();
    const res = await worker.fetch(
      adminReq('/admin/generate', { months: 1, count: 500, label: 'x'.repeat(200) }),
      adminEnv(d1) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { codes?: string[] };
    expect(body.codes).toHaveLength(50);
    expect(d1.generated.size).toBe(50);
    for (const row of d1.generated.values()) expect(row.label).toHaveLength(64);
  });

  it('still mints valid codes when the tracking ledger fails — tracking never blocks minting', async () => {
    const d1 = new CodesD1();
    d1.failures = 1;
    const res = await worker.fetch(adminReq('/admin/generate', { months: 1, count: 2 }), adminEnv(d1) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { codes?: string[] };
    expect(body.codes).toHaveLength(2);
  });

  it('rejects the same bad months as before, with no codes written', async () => {
    const d1 = new CodesD1();
    const res = await worker.fetch(adminReq('/admin/generate', { months: 99, count: 3 }), adminEnv(d1) as never);
    expect(res.status).toBe(400);
    expect(d1.generated.size).toBe(0);
  });
});

describe('teacher codes — the read-only report (V24 Phase 6)', () => {
  it('reports created vs activated per label, from real redemptions', async () => {
    const d1 = new CodesD1();
    const mint = async (count: number, label: string | undefined) => {
      const res = await worker.fetch(adminReq('/admin/generate', { months: 1, count, label }), adminEnv(d1) as never);
      const body = (await res.json()) as { code?: string; codes?: string[] };
      return body.codes ?? [body.code!];
    };
    const cohortA = await mint(3, 'cohort-A');
    await mint(2, 'cohort-B');
    await mint(1, undefined);

    // Two of cohort-A's codes are redeemed for real.
    d1.redeemed.set(cohortA[0], { account_id: 'u1', months: 1 });
    d1.redeemed.set(cohortA[1], { account_id: 'u2', months: 1 });

    const report = await worker.fetch(adminReq('/admin/codes/report'), adminEnv(d1) as never);
    expect(report.status).toBe(200);
    const body = (await report.json()) as {
      labels: Array<{ label: string | null; created: number; activated: number }>;
      totals: { created: number; activated: number };
    };

    const a = body.labels.find((l) => l.label === 'cohort-A');
    const b = body.labels.find((l) => l.label === 'cohort-B');
    const unlabelled = body.labels.find((l) => l.label === null);
    expect(a).toMatchObject({ created: 3, activated: 2 });
    expect(b).toMatchObject({ created: 2, activated: 0 });
    expect(unlabelled).toMatchObject({ created: 1, activated: 0 });
    expect(body.totals).toEqual({ created: 6, activated: 2 });
  });

  it('is admin-gated: no secret → 401, and a wrong secret never sees the report', async () => {
    const d1 = new CodesD1();
    const noAuth = await worker.fetch(new Request('https://worker.test/admin/codes/report'), adminEnv(d1) as never);
    expect(noAuth.status).toBe(401);
    const wrong = await worker.fetch(
      new Request('https://worker.test/admin/codes/report', { headers: { Authorization: `Bearer ${SECRET}x`, 'CF-Connecting-IP': '203.0.113.9' } }),
      adminEnv(d1) as never,
    );
    expect(wrong.status).toBe(401);
  });

  it('answers 503 (not a fake empty report) when the ledger tables are unavailable', async () => {
    const res = await worker.fetch(adminReq('/admin/codes/report'), adminEnv(null) as never);
    expect(res.status).toBe(503);
  });

  it('never echoes code values — the report carries counts only', async () => {
    const d1 = new CodesD1();
    await worker.fetch(adminReq('/admin/generate', { months: 1, count: 2, label: 'L1' }), adminEnv(d1) as never);
    const report = await worker.fetch(adminReq('/admin/codes/report'), adminEnv(d1) as never);
    const text = JSON.stringify(await report.json());
    for (const code of d1.generated.keys()) expect(text).not.toContain(code);
  });
});
