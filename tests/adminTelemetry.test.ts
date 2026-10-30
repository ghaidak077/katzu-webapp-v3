import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  TELEMETRY_DDL,
  ensureTelemetryTables,
  resetTelemetryTablesCache,
  createAiTelemetry,
  makeAttemptHook,
  redactText,
  parseUserAgent,
  parseClientContext,
  localTimeString,
  classifyOutcome,
  buildConversationRow,
  recordRouteEvent,
  recordAiCall,
  conversationLoggingEnabled,
  hasLoggingConsent,
  consentKey,
  sweepConversationText,
  isTelemetryRoute,
  releaseOf,
  CONVERSATION_RETENTION_DAYS,
  EVENT_RETENTION_DAYS,
} from '../cloudflare-telemetry';

/**
 * Telemetry is the one place learner text can be written, so the tests here are
 * about the promises, not the plumbing: nothing blocks, nothing throws, nothing
 * secret is stored, and text lives 90 days.
 */

type Statement = { sql: string; args: unknown[] };

class StubDB {
  statements: Statement[] = [];
  fail = false;
  batchCalls = 0;

  prepare(sql: string) {
    const self = this;
    const record = (args: unknown[]): Statement => {
      const statement = { sql, args };
      self.statements.push(statement);
      return statement;
    };
    return {
      bind(...args: unknown[]) {
        return {
          async run() {
            record(args);
            if (self.fail) throw new Error('d1 unavailable');
            return { meta: { changes: 1 }, success: true };
          },
          async first() {
            record(args);
            if (self.fail) throw new Error('d1 unavailable');
            return { ok: 1, n: 0 };
          },
          async all() {
            record(args);
            if (self.fail) throw new Error('d1 unavailable');
            return { results: [] };
          },
        };
      },
      async run() {
        record([]);
        if (self.fail) throw new Error('d1 unavailable');
        return { meta: { changes: 1 }, success: true };
      },
      async first() {
        record([]);
        return { ok: 1, n: 0 };
      },
      async all() {
        record([]);
        return { results: [] };
      },
    };
  }

  async batch(items: Array<{ run: () => Promise<unknown> }>) {
    this.batchCalls += 1;
    return Promise.all(items.map((item) => item.run()));
  }
}

class StubKv {
  values = new Map<string, string>();
  throwOnGet = false;
  async get(key: string) {
    if (this.throwOnGet) throw new Error('kv down');
    return this.values.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.values.set(key, value);
  }
}

function collectCtx() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (promise: Promise<unknown>) => pending.push(promise) },
    async flush() {
      await Promise.allSettled(pending);
    },
    pending,
  };
}

const migrationPath = fileURLToPath(new URL('../migrations/0004_admin_telemetry.sql', import.meta.url));

describe('TELEMETRY_DDL / migration parity', () => {
  it('every runtime statement appears in the reviewable migration file', () => {
    const migration = readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ');
    for (const statement of TELEMETRY_DDL) {
      const normalized = statement.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();
      expect(migration, `missing from migrations/0004_admin_telemetry.sql: ${normalized}`).toContain(normalized);
    }
  });

  it('is additive only: no DROP, DELETE, ALTER or UPDATE', () => {
    for (const statement of TELEMETRY_DDL) {
      expect(statement).not.toMatch(/\b(DROP|ALTER|DELETE|UPDATE|TRUNCATE)\b/i);
    }
  });
});

describe('ensureTelemetryTables', () => {
  beforeEach(() => resetTelemetryTablesCache());

  it('runs the DDL once per isolate and reports success', async () => {
    const db = new StubDB();
    expect(await ensureTelemetryTables({ DB: db })).toBe(true);
    expect(db.batchCalls).toBe(1);
    expect(await ensureTelemetryTables({ DB: db })).toBe(true);
    expect(db.batchCalls).toBe(1);
  });

  it('returns false (never throws) when the database fails, and retries next time', async () => {
    const db = new StubDB();
    db.fail = true;
    expect(await ensureTelemetryTables({ DB: db })).toBe(false);
    expect(await ensureTelemetryTables({ DB: db })).toBe(false);
    expect(db.batchCalls).toBe(2);
  });

  it('is a no-op without a database binding', async () => {
    expect(await ensureTelemetryTables({})).toBe(false);
  });
});

describe('redactText', () => {
  it('removes emails, tokens, keys, phones and card-like numbers', () => {
    const input =
      'mail me at sara.t@example.com or use Bearer abcdefghijklmnop, key AIzaSyD-1234567890abcd, ' +
      'sess_abcdef123456 and call +49 170 1234567 with card 4111111111111111';
    const output = redactText(input) || '';
    expect(output).not.toContain('sara.t@example.com');
    expect(output).not.toContain('abcdefghijklmnop');
    expect(output).not.toContain('AIzaSyD-1234567890abcd');
    expect(output).not.toContain('sess_abcdef123456');
    expect(output).not.toContain('170 1234567');
    expect(output).not.toContain('4111111111111111');
    expect(output).toContain('[email]');
    expect(output).toContain('[phone]');
    expect(output).toContain('[number]');
  });

  it('strips control characters but keeps normal German and Arabic text', () => {
    const output = redactText('Hallo\u0000, ich heiße\u0007 Sara. أهلاً');
    expect(output).toBe('Hallo , ich heiße Sara. أهلاً');
  });

  it('bounds length and returns null when nothing is left', () => {
    expect(redactText('Hallo '.repeat(20), 10)).toBe('Hallo Hall');
    expect(redactText('   ')).toBeNull();
    expect(redactText(null)).toBeNull();
    expect(redactText(undefined)).toBeNull();
  });
});

describe('parseUserAgent / parseClientContext', () => {
  it('classifies the devices the app actually ships to', () => {
    expect(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1').device).toBe('phone');
    expect(parseUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1').device).toBe('tablet');
    expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Edg/120').browser).toBe('edge');
    expect(parseUserAgent('Mozilla/5.0 (X11; Linux x86_64) Firefox/121').os).toBe('linux');
  });

  it('keeps only a two-letter country and a short locale', () => {
    const request = new Request('https://katzu.test/ai/turn', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', 'Accept-Language': 'ar-DE,ar;q=0.9' },
    });
    const context = parseClientContext(request);
    expect(context.os).toBe('windows');
    expect(context.browser).toBe('chrome');
    expect(context.locale).toBe('ar-DE');
    expect(context.country).toBeNull(); // no request.cf in the test runtime
  });

  it('localTimeString returns null rather than throwing on a bad zone', () => {
    expect(localTimeString(Date.now(), 'Europe/Berlin')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(localTimeString(Date.now(), 'Not/AZone')).toBeNull();
  });
});

describe('classifyOutcome', () => {
  it('maps the statuses the panel filters on', () => {
    expect(classifyOutcome({ status: 200, payload: {} })).toBe('ok');
    expect(classifyOutcome({ status: 200, payload: { code: 'ai_empty_reply' } })).toBe('empty');
    expect(classifyOutcome({ status: 429, payload: {} })).toBe('minute');
    expect(classifyOutcome({ status: 429, payload: { error: 'quota exceeded' } })).toBe('day');
    expect(classifyOutcome({ status: 401, payload: {} })).toBe('invalid_key');
    expect(classifyOutcome({ status: 408, payload: {} })).toBe('timeout');
    expect(classifyOutcome({ status: 502, payload: {}, attempts: [{ kind: 'minute' }] })).toBe('minute');
  });
});

describe('conversation logging is off unless the owner turns it on', () => {
  it('treats absent, empty and "off" as off and accepts the documented spellings', () => {
    expect(conversationLoggingEnabled({})).toBe(false);
    expect(conversationLoggingEnabled({ CONVERSATION_LOGGING: '' })).toBe(false);
    expect(conversationLoggingEnabled({ CONVERSATION_LOGGING: 'off' })).toBe(false);
    expect(conversationLoggingEnabled({ CONVERSATION_LOGGING: 'on' })).toBe(true);
    expect(conversationLoggingEnabled({ CONVERSATION_LOGGING: '1' })).toBe(true);
    expect(conversationLoggingEnabled({ CONVERSATION_LOGGING: ' TRUE ' })).toBe(true);
  });

  it('requires an explicit grant: silence and read failures are not consent', async () => {
    const kv = new StubKv();
    kv.throwOnGet = true;
    expect(await hasLoggingConsent({ USER_PROGRESS: kv }, 'user-1')).toBe(false);
    expect(await hasLoggingConsent({ USER_PROGRESS: new StubKv() }, 'user-1')).toBe(false);
    expect(await hasLoggingConsent({}, 'user-1')).toBe(false);
    expect(await hasLoggingConsent({ USER_PROGRESS: new StubKv() }, '')).toBe(false);

    const grant = new StubKv();
    grant.values.set(consentKey('user-1'), 'true');
    expect(await hasLoggingConsent({ USER_PROGRESS: grant }, 'user-1')).toBe(true);
    expect(await hasLoggingConsent({ USER_PROGRESS: grant }, 'user-2')).toBe(false);
  });

  it('uses one namespaced key per learner', () => {
    expect(consentKey('abc')).toBe('consent:logging:abc');
    expect(consentKey('')).toBe('consent:logging:');
  });

  it('keeps the retention windows the policy states', () => {
    expect(CONVERSATION_RETENTION_DAYS).toBe(90);
    expect(EVENT_RETENTION_DAYS).toBe(365);
  });
});

describe('buildConversationRow', () => {
  it('redacts both sides and never stores an empty string', () => {
    const request = new Request('https://katzu.test/ai/turn', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile',
        'Accept-Language': 'ar',
        'X-App-Version': '1.4.0',
      },
    });
    const row = buildConversationRow({
      request,
      body: {
        session_id: 's1',
        turn_index: 3,
        scenario_id: 'cafe',
        cefr_level: 'A1',
        opener_id: 'ask_menu',
        user_message: 'Mein E-Mail ist a@b.de und ich möchte Kaffee',
        word_cards_opened: ['Kaffee', '', null],
      },
      payload: {
        reply_de: 'Gerne! Schreib an x@y.de',
        provider: 'gemini',
        evaluation: { is_correct: false, original_mistake: 'ich möchte', corrected_german: 'Ich möchte', grammar_id: 'g1' },
        hints: [{ german: 'Was kostet das?', translation_ar: 'كم السعر؟' }],
      },
      user: { sub: 'user-1', plan: 'pro' },
      latencyMs: 1200.6,
      turnId: 'turn-1',
      outcome: 'ok',
      guard: 'ok',
    });
    expect(row.learner_text).toContain('[email]');
    expect(row.learner_text).not.toContain('a@b.de');
    expect(row.reply_text).not.toContain('x@y.de');
    expect(row.user_id).toBe('user-1');
    expect(row.turn_no).toBe(3);
    expect(row.latency_ms).toBe(1201);
    expect(row.device).toBe('phone');
    expect(JSON.parse(row.corrections || '{}').is_correct).toBe(false);
    expect(JSON.parse(row.word_cards || '[]')).toEqual(['Kaffee']);
    expect(row.model).toBeNull();
  });

  it('leaves missing text as null', () => {
    const row = buildConversationRow({ request: new Request('https://katzu.test/ai/turn'), body: {}, payload: {}, user: null });
    expect(row.learner_text).toBeNull();
    expect(row.reply_text).toBeNull();
    expect(row.user_id).toBeNull();
    expect(row.hints).toBeNull();
  });
});

describe('recordRouteEvent', () => {
  it('writes one row inside waitUntil and never awaits the caller', async () => {
    const db = new StubDB();
    const { ctx, flush, pending } = collectCtx();
    const request = new Request('https://katzu.test/ai/turn?token=secret', { method: 'POST' });
    const response = new Response('{}', { status: 200 });
    recordRouteEvent({ DB: db, RELEASE: 'r1' }, request, response, Date.now() - 5, ctx);
    expect(pending).toHaveLength(1);
    await flush();
    expect(db.statements).toHaveLength(1);
    expect(db.statements[0].sql).toContain('INSERT INTO route_events');
    expect(db.statements[0].args[1]).toBe('/ai/turn'); // path only, no query string
    expect(db.statements[0].args).not.toContain('secret');
  });

  it('ignores static noise, preflight and non-API paths', () => {
    const db = new StubDB();
    const { ctx, pending } = collectCtx();
    recordRouteEvent({ DB: db }, new Request('https://katzu.test/assets/app.js'), new Response(''), Date.now(), ctx);
    recordRouteEvent({ DB: db }, new Request('https://katzu.test/ai/turn', { method: 'OPTIONS' }), new Response(''), Date.now(), ctx);
    expect(pending).toHaveLength(0);
    expect(isTelemetryRoute('/assets/app.js')).toBe(false);
    expect(isTelemetryRoute('/ai/turn')).toBe(true);
    expect(isTelemetryRoute('/internal/admin/health')).toBe(true);
  });

  it('swallows a database failure', async () => {
    const db = new StubDB();
    db.fail = true;
    const { ctx, flush } = collectCtx();
    expect(() => recordRouteEvent({ DB: db }, new Request('https://katzu.test/ai/turn'), new Response(''), Date.now(), ctx)).not.toThrow();
    await flush();
  });

  it('skips the write when there is no request lifetime to attach it to', () => {
    const db = new StubDB();
    expect(() => recordRouteEvent({ DB: db, RELEASE: 'v9' }, new Request('https://katzu.test/ai/turn'), new Response(''), Date.now())).not.toThrow();
    expect(db.statements).toHaveLength(0);
    expect(releaseOf({ RELEASE: '  v9  ' })).toBe('v9');
    expect(releaseOf({})).toBe('unknown');
  });
});

describe('attempt collector', () => {
  it('caps attempts and never throws on junk', () => {
    const collector = createAiTelemetry();
    const hook = makeAttemptHook(collector);
    for (let i = 0; i < 20; i += 1) hook({ provider: 'p', model: 'm', keyId: 'k1', kind: 'ok', status: 200, latencyMs: 10 });
    expect(collector.attempts).toHaveLength(12);
    expect(() => hook(null)).not.toThrow();
    expect(() => makeAttemptHook(null)?.({})).not.toThrow();
    expect(collector.attempts[0]).toMatchObject({ provider: 'p', model: 'm', key_id: 'k1', kind: 'ok' });
  });
});

describe('recordAiCall', () => {
  it('writes an ai_events row even when conversation logging is off', async () => {
    const db = new StubDB();
    const { ctx, flush } = collectCtx();
    recordAiCall({ DB: db, RELEASE: 'r1' }, ctx, {
      route: 'ai_turn',
      status: 200,
      startedAt: Date.now() - 10,
      collector: { attempts: [{ provider: 'gemini', model: 'g2', key_id: 'k1', kind: 'ok', status: 200, latency_ms: 10 }] },
      user: { sub: 'u1' },
      payload: { provider: 'gemini' },
    });
    await flush();
    const insert = db.statements.find((s) => s.sql.includes('INSERT INTO ai_events'));
    expect(insert).toBeTruthy();
    expect(insert?.args).toContain('ai_turn');
    expect(insert?.args).toContain('gemini');
    expect(insert?.args).toContain('ok');
    expect(db.statements.some((s) => s.sql.includes('INSERT OR IGNORE INTO conversations'))).toBe(false);
  });

  it('writes the conversation row and each attempt only when asked', async () => {
    const db = new StubDB();
    const { ctx, flush } = collectCtx();
    const row = buildConversationRow({
      request: new Request('https://katzu.test/ai/turn'),
      body: { session_id: 's', turn_index: 1 },
      payload: { reply_de: 'Hallo' },
      user: { sub: 'u1' },
      latencyMs: 50,
      turnId: 't1',
      outcome: 'ok',
    });
    recordAiCall({ DB: db }, ctx, {
      route: 'ai_turn',
      status: 200,
      startedAt: Date.now() - 50,
      collector: { attempts: [{ provider: 'p', model: 'm', key_id: 'k', kind: 'ok', status: 200, latency_ms: 20 }] },
      user: { sub: 'u1' },
      payload: { reply_de: 'Hallo' },
      conversation: { logging: true, row },
    });
    await flush();
    expect(db.statements.some((s) => s.sql.includes('INSERT OR IGNORE INTO conversations'))).toBe(true);
    expect(db.statements.some((s) => s.sql.includes('INSERT INTO conversation_attempts'))).toBe(true);
  });

  it('never throws when the database is down', () => {
    const db = new StubDB();
    db.fail = true;
    const { ctx } = collectCtx();
    expect(() =>
      recordAiCall({ DB: db }, ctx, { route: 'ai_turn', status: 500, startedAt: Date.now(), collector: { attempts: [] } }),
    ).not.toThrow();
    expect(() => recordAiCall(null, null, null)).not.toThrow();
  });
});

describe('sweepConversationText', () => {
  it('scrubs text, deletes attempts and ages out events', async () => {
    const db = new StubDB();
    const result = await sweepConversationText({ DB: db });
    expect(result.conversations_scrubbed).toBe(1);
    expect(result.conversation_attempts).toBe(1);
    expect(result.ai_events).toBe(1);
    expect(result.route_events).toBe(1);
    expect(db.statements.some((s) => s.sql.includes('learner_text = NULL'))).toBe(true);
    expect(db.statements.some((s) => s.sql.includes('DELETE FROM conversation_attempts'))).toBe(true);
  });

  it('reports -1 per table instead of throwing', async () => {
    const db = new StubDB();
    db.fail = true;
    const result = await sweepConversationText({ DB: db });
    expect(result).toEqual({
      conversations_scrubbed: -1,
      conversation_attempts: -1,
      ai_events: -1,
      route_events: -1,
    });
  });

  it('skips without a database', async () => {
    expect(await sweepConversationText({})).toEqual({ skipped: 'db_unbound' });
  });
});
