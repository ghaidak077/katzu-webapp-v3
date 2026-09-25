import { describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';

/**
 * A client crash used to be invisible: the diagnostics buffer lives on the
 * device that crashed, and the admin dashboard cannot see a device it does not
 * own. These tests pin the two things that make the new report route safe to
 * leave unauthenticated — it is rate-limited, and credentials are stripped
 * before anything is stored.
 */

class MemoryKv {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) || null; }
  async put(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

/** Captures the binds of every INSERT so the stored text can be asserted on. */
class RecordingD1 {
  inserts: unknown[][] = [];
  prepare(sql: string) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    return {
      bind: (...args: unknown[]) => ({
        run: async () => {
          if (/^INSERT/i.test(normalized)) this.inserts.push(args);
          return { success: true };
        },
        first: async () => null,
      }),
      run: async () => ({ success: true }),
    };
  }
}

function report(env: any, body: unknown, ip = '203.0.113.7') {
  return worker.fetch(new Request('https://worker.test/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  }), env as never);
}

describe('client crash reports (/client-error)', () => {
  it('rejects a report with no message', async () => {
    const env = { DB: new RecordingD1(), USER_PROGRESS: new MemoryKv() };
    const res = await report(env, { scope: 'window' });
    expect(res.status).toBe(400);
    expect(env.DB.inserts).toHaveLength(0);
  });

  it('stores an uncaught crash with the scope and page, under no account', async () => {
    const env = { DB: new RecordingD1(), USER_PROGRESS: new MemoryKv() };
    const res = await report(env, {
      scope: 'window',
      message: "Uncaught TypeError: Cannot read properties of null (reading 'user')",
      page: '/app/review',
    });
    expect(res.status).toBe(200);
    expect((await res.json() as { success: boolean }).success).toBe(true);

    const [userId, errorType, endpoint, message] = env.DB.inserts[0];
    expect(userId).toBeNull();
    expect(errorType).toBe('client_window');
    expect(endpoint).toBe('/app/review');
    expect(String(message)).toContain('Cannot read properties of null');
  });

  it('strips credential-shaped text before storing anything', async () => {
    const env = { DB: new RecordingD1(), USER_PROGRESS: new MemoryKv() };
    await report(env, {
      scope: 'promise',
      message: 'sync failed for sess_abcdefgh12345678 and key AIzaSyABCDEFGH1234567890',
      page: '/app/trail',
    });

    const stored = env.DB.inserts[0].map(String).join(' ');
    expect(stored).not.toContain('sess_abcdefgh12345678');
    expect(stored).not.toContain('AIzaSyABCDEFGH1234567890');
    expect(stored).toContain('[redacted]');
  });

  it('rate-limits a flood from one address instead of filling the table', async () => {
    const env = { DB: new RecordingD1(), USER_PROGRESS: new MemoryKv() };
    const ip = '198.51.100.9';
    for (let i = 0; i < 8; i++) {
      expect((await report(env, { scope: 'window', message: `crash ${i}` }, ip)).status).toBe(200);
    }
    const blocked = await report(env, { scope: 'window', message: 'crash 9' }, ip);
    expect(blocked.status).toBe(429);
    expect((await blocked.json() as { error: string }).error).toBe('rate_limited');
    expect(env.DB.inserts).toHaveLength(8);
  });
});
