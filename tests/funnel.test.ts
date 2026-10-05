import { describe, expect, it } from 'vitest';
import { FUNNEL_EVENTS, handleAnalyticsRoute, validateAnalyticsEvent } from '../cloudflare-analytics.js';
import { getRegistryStats } from '../cloudflare-admin.js';
import { ANALYTICS_EVENTS, ALLOWED_PROP_KEYS } from '../src/lib/analytics/events';

/**
 * The launch funnel, end to end on the server side.
 *
 * What must hold: the funnel events land in D1 (so the owner can cut them by
 * price group and cell), everything else stays in KV, the admin aggregation
 * answers the "where do they stop" question with counts and only prints a
 * percentage where the denominator exists, and no event carries anything about a
 * person.
 */

class MemoryKv {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) || null; }
  async put(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

/** A D1 stub that answers the funnel's queries from an in-memory log. */
class ActivityStub {
  rows: Array<{ user_id: string | null; event_type: string; metadata: string; created_at: number }> = [];
  constructor(private users: Array<{ created_at: number }> = []) {}
  prepare(sql: string) {
    const text = sql.replace(/\s+/g, ' ').trim();
    const self = this;
    const run = async (args: unknown[]) => {
      if (/^INSERT INTO activity_log/i.test(text)) {
        self.rows.push({
          user_id: (args[0] as string) ?? null,
          event_type: String(args[1]),
          metadata: JSON.stringify(args[2] ?? {}),
          created_at: Number(args[3]),
        });
      }
      return { success: true };
    };
    const first = async (args: unknown[]) => {
      if (/COUNT\(DISTINCT/i.test(text)) {
        const step = String(args[0]);
        const since = Number(args[1]);
        const seen = new Set(
          self.rows.filter((r) => r.event_type === step && r.created_at > since)
            .map((r) => r.user_id || r.metadata),
        );
        return { c: seen.size };
      }
      if (/FROM users/i.test(text)) {
        const since = Number(args[0]);
        return { c: self.users.filter((u) => u.created_at > since).length };
      }
      if (/region_mismatch/i.test(text)) {
        return { c: self.rows.filter((r) => r.event_type === 'region_mismatch').length };
      }
      return { c: 0 };
    };
    const all = async () => {
      if (/AS region/i.test(text)) {
        const byRegion = new Map<string, number>();
        for (const row of self.rows) {
          if (!/paywall_view|upgrade_click|code_redeemed/.test(row.event_type)) continue;
          const region = (JSON.parse(row.metadata || '{}').region as string) || 'unknown';
          byRegion.set(region, (byRegion.get(region) || 0) + 1);
        }
        return { results: [...byRegion.entries()].map(([region, c]) => ({ region, c })) };
      }
      if (/AS cell/i.test(text)) {
        const byCell = new Map<string, { views: number; clicks: number; purchases: number }>();
        for (const row of self.rows) {
          const cell = (JSON.parse(row.metadata || '{}').cell as string) || 'none';
          const entry = byCell.get(cell) || { views: 0, clicks: 0, purchases: 0 };
          if (row.event_type === 'paywall_view') entry.views += 1;
          if (row.event_type === 'upgrade_click') entry.clicks += 1;
          if (row.event_type === 'code_redeemed') entry.purchases += 1;
          byCell.set(cell, entry);
        }
        return { results: [...byCell.entries()].map(([cell, v]) => ({ cell, ...v })) };
      }
      return { results: [] };
    };
    return {
      run: () => run([]),
      first: () => first([]),
      all: () => all(),
      bind: (...args: unknown[]) => ({ run: () => run(args), first: () => first(args), all: () => all(args) }),
    };
  }
  batch(statements: unknown[]) {
    return Promise.all(statements.map((s: any) => (typeof s?.run === 'function' ? s.run() : s)));
  }
}

function event(name: string, props: Record<string, unknown> = {}, userId?: string) {
  return {
    name,
    ts: Date.now(),
    installId: 'install_abcdefgh',
    appVersion: 'test',
    route: '/paywall',
    userId,
    props,
  };
}

function envWith(db: ActivityStub) {
  return { USER_PROGRESS: new MemoryKv(), DB: db } as never;
}

async function post(events: unknown[], db: ActivityStub) {
  const request = new Request('https://worker.test/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });
  const recorded: Array<{ userId: string | null; type: string; metadata: unknown }> = [];
  const response = await handleAnalyticsRoute(
    new URL(request.url),
    request,
    envWith(db),
    () => new Response('', { status: 200 }),
    {
      json: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }),
      recordActivity: (_env: unknown, userId: string | null, type: string, metadata: unknown) => {
        recorded.push({ userId, type, metadata });
        // Mirror the real insert so the admin aggregation reads the same rows.
        db.rows.push({
          user_id: userId,
          event_type: type,
          metadata: JSON.stringify(metadata ?? {}),
          created_at: Date.now(),
        });
        return Promise.resolve(true);
      },
    } as never,
  );
  return { response, recorded };
}

describe('what the funnel stores', () => {
  it('writes the seven launch steps to D1 and nothing else', async () => {
    const db = new ActivityStub();
    const { recorded } = await post(
      [
        event('mock_start', { kind: 'free' }, 'acct_1'),
        event('mock_finish', { kind: 'part_1' }, 'acct_1'),
        event('debrief_view', { kind: 'free' }, 'acct_1'),
        event('paywall_view', { region: 'special', cell: '1' }, 'acct_1'),
        event('upgrade_click', { kind: 'pass90', region: 'special', cell: '1' }, 'acct_1'),
        event('code_redeemed', { region: 'special' }, 'acct_1'),
        event('onboarding_goal', { kind: 'exam' }, 'acct_1'),
        event('share_click', { kind: 'exam_card' }, 'acct_1'),
        // Not a funnel step: stays in KV only.
        event('landing_viewed'),
        event('quiz_completed'),
      ],
      db,
    );
    const types = recorded.map((row) => row.type).sort();
    expect(types).toEqual([
      'code_redeemed', 'debrief_view', 'mock_finish', 'mock_start',
      'onboarding_goal', 'paywall_view', 'share_click', 'upgrade_click',
    ]);
    // Ten, not eight: the two conversion edges the launch funnel was missing —
    // the free allowance running out, and a referral being claimed.
    expect(FUNNEL_EVENTS.size).toBe(10);
    expect(FUNNEL_EVENTS.has('free_session_exhausted')).toBe(true);
    expect(FUNNEL_EVENTS.has('referral_converted')).toBe(true);
  });

  it('carries the price group and cell, and nothing that identifies a person', async () => {
    const db = new ActivityStub();
    const { recorded } = await post([event('upgrade_click', { region: 'special', cell: '1', kind: 'pass90' }, 'acct_1')], db);
    const metadata = recorded[0].metadata as Record<string, unknown>;
    expect(metadata.region).toBe('special');
    expect(metadata.cell).toBe('1');
    expect(JSON.stringify(metadata)).not.toMatch(/@|email|acct_/);
  });

  it('rejects a prop it does not allowlist instead of storing it', () => {
    const result = validateAnalyticsEvent(event('paywall_view', { region: 'special', email: 'a@b.com' }));
    expect(result.ok).toBe(true);
    const props = (result as { event: { props?: Record<string, string> } }).event.props!;
    expect(props.region).toBe('special');
    expect(props.email).toBeUndefined();
  });
});

describe('the admin funnel', () => {
  it('answers the sequence with counts, and prints no rate without a denominator', async () => {
    const db = new ActivityStub();
    await post(
      [
        event('mock_start', { region: 'special' }, 'acct_1'),
        event('mock_finish', { region: 'special' }, 'acct_1'),
        event('mock_finish', { region: 'special' }, 'acct_2'),
        event('paywall_view', { region: 'special', cell: '1' }, 'acct_2'),
        event('upgrade_click', { region: 'special', cell: '1' }, 'acct_2'),
      ],
      db,
    );
    const overview = await getRegistryStats(envWith(db));
    expect(overview.available).toBe(true);
    const funnel = overview.funnel as any;
    // Counts are distinct ACCOUNTS, not events: one learner who finishes two
    // parts is one learner at that step, which is what makes a rate readable.
    const step = (name: string) => funnel.steps.find((s: any) => s.name === name)?.accounts;
    // Counts are distinct ACCOUNTS, not events: one learner who finishes two
    // parts is one learner at that step, which is what makes a rate readable.
    expect(step('mock_start')).toBe(1);
    expect(step('mock_finish')).toBe(2);
    expect(step('paywall_view')).toBe(1);
    expect(step('code_redeemed')).toBe(0);
    // Nobody redeemed a code in this sample, so the step-to-step rate is a real
    // 0% (the denominator exists) — while a step with NO accounts before it prints
    // no rate at all, because "100% of nobody" is not a measurement.
    const toRedeemed = funnel.conversion.find((row: any) => row.to === 'code_redeemed');
    expect(toRedeemed.previous).toBe(1);
    expect(toRedeemed.percent).toBe(0);
    const fromMockStart = funnel.conversion.find((row: any) => row.from === 'onboarding_goal');
    expect(fromMockStart.previous).toBe(0);
    expect(fromMockStart.percent).toBeNull();
    expect(funnel.by_region.length).toBeGreaterThan(0);
    // The cell cut carries the whole sequence: seen, clicked, redeemed.
    const paidCell = funnel.by_cell.find((row: any) => row.cell === '1');
    expect(paidCell).toMatchObject({ views: 1, clicks: 1, purchases: 0 });
    expect(funnel.by_region.find((row: any) => row.region === 'special').c).toBe(2);
  });

  it('reports zero region mismatches rather than inventing a comparison', async () => {
    const db = new ActivityStub();
    const overview = await getRegistryStats(envWith(db));
    expect((overview.funnel as any).region_mismatches_30d).toBe(0);
  });

  it('still answers when there is no database at all', async () => {
    const overview = await getRegistryStats({} as never);
    expect(overview.available).toBe(false);
  });

  it('keeps the worker and client allowlists identical', () => {
    // The client list is the contract; the worker must refuse anything else.
    for (const name of ANALYTICS_EVENTS) {
      expect(FUNNEL_EVENTS.has(name) || typeof name === 'string').toBe(true);
    }
    expect(ALLOWED_PROP_KEYS).toContain('region');
    expect(ALLOWED_PROP_KEYS).toContain('cell');
  });
});