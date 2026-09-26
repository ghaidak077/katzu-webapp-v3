import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerClient, mapRedemptionReasonToArabic } from '../src/lib/api/workerClient';

describe('WorkerClient API Contract Integration', () => {
  let client: WorkerClient;
  const mockBaseUrl = 'https://mock-worker.test';

  beforeEach(() => {
    client = new WorkerClient(mockBaseUrl);
    vi.restoreAllMocks();
  });

  it('maps redemption error codes to localized Arabic messages', () => {
    expect(mapRedemptionReasonToArabic('missing_id_token')).toContain('تسجيل الدخول');
    expect(mapRedemptionReasonToArabic('invalid_signature')).toContain('غير صالح');
    expect(mapRedemptionReasonToArabic('already_redeemed')).toContain('مسبقاً');
    expect(mapRedemptionReasonToArabic('malformed')).toContain('DE-1M-');
  });

  it('formats /ai/turn payload to snake_case matching cloudflare-unified-worker.js', async () => {
    let capturedBody: any = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      if (url.endsWith('/ai/turn')) {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            reply_de: 'Guten Tag! Wie kann ich Ihnen helfen?',
            reply_ar: 'يوم سعيد! كيف يمكنني مساعدتك؟',
            evaluation: {
              is_correct: false,
              original_mistake: 'Ich will ein Kaffee',
              corrected_german: 'Ich möchte einen Kaffee, bitte.',
              grammar_rule: 'Akkusativ mit möchten',
              explanation_ar: 'القهوة اسم مذكر (der Kaffee) ويأتي مفعولاً به منصباً في حالة الأكوزاتيف (einen Kaffee).',
              positive_note_ar: 'محاولة ممتازة! طلب القهوة من أهم المهارات اليومية.',
            },
          }),
        };
      }
      return { ok: false };
    });

    const response = await client.sendTurn({
      scenarioId: 'cafe_order',
      scenarioTitle: 'Im Café bestellen',
      persona: 'Barista katze',
      cefrLevel: 'A1',
      userMessage: 'Ich will ein Kaffee',
      history: [
        { sender: 'KATZU', text: 'Hallo!' },
        { sender: 'USER', text: 'Hallo Barista' },
      ],
    });

    // Check payload structure sent to worker
    expect(capturedBody).toBeDefined();
    expect(capturedBody.scenario_id).toBe('cafe_order');
    expect(capturedBody.scenario_title).toBe('Im Café bestellen');
    expect(capturedBody.cefr_level).toBe('A1');
    expect(capturedBody.user_message).toBe('Ich will ein Kaffee');
    expect(capturedBody.mode).toBe('roleplay');
    expect(capturedBody.history).toEqual([
      { role: 'model', text: 'Hallo!' },
      { role: 'user', text: 'Hallo Barista' },
    ]);

    // Check returned response parsing
    expect(response.germanReply).toBe('Guten Tag! Wie kann ich Ihnen helfen?');
    expect(response.arabicTranslation).toBe('يوم سعيد! كيف يمكنني مساعدتك؟');
    expect(response.isCorrect).toBe(false);
    expect(response.mistakeSegment).toBe('Ich will ein Kaffee');
    expect(response.correctedSegment).toBe('Ich möchte einen Kaffee, bitte.');
    expect(response.grammarRule).toBe('Akkusativ mit möchten');
    expect(response.explanationAr).toContain('الأكوزاتيف');
    expect(response.positiveNoteAr).toContain('محاولة ممتازة');
  });

  it('formats /ai/hints payload and returns mapped hints', async () => {
    let capturedBody: any = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      if (url.endsWith('/ai/hints')) {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            hints: [
              { german: 'Einen Kaffee, bitte.', translation_ar: 'فنجان قهوة من فضلك.' },
              { german: 'Was kostet das?', translation_ar: 'كم سعر هذا؟' },
            ],
          }),
        };
      }
      return { ok: false };
    });

    const hints = await client.fetchHints({
      scenarioTitle: 'Im Café',
      cefrLevel: 'A1',
      lastAiReply: 'Was darf es sein?',
      history: [
        { role: 'model', text: 'one' },
        { role: 'user', text: 'two' },
        { role: 'model', text: 'three' },
        { role: 'user', text: 'four' },
        { role: 'model', text: 'five' },
      ],
    });

    expect(capturedBody).toEqual({
      scenario_title: 'Im Café',
      cefr_level: 'A1',
      last_ai_reply: 'Was darf es sein?',
      history: [
        { role: 'user', text: 'two' },
        { role: 'model', text: 'three' },
        { role: 'user', text: 'four' },
        { role: 'model', text: 'five' },
      ],
      mode: 'hints',
    });

    expect(hints.length).toBe(2);
    expect(hints[0]).toEqual({
      german: 'Einen Kaffee, bitte.',
      arabic: 'فنجان قهوة من فضلك.',
    });
  });

  it('handles /verify code redemption accurately', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      if (url.endsWith('/verify')) {
        const body = JSON.parse(options.body);
        if (body.code === 'DE-6M-ABCD1234-5678EFGH') {
          return {
            ok: true,
            json: async () => ({
              valid: true,
              months: 6,
              expiresAt: '2026-10-01T00:00:00.000Z',
              email: 'user@example.com',
            }),
          };
        }
        return {
          ok: false,
          json: async () => ({
            valid: false,
            reason: 'invalid_signature',
          }),
        };
      }
      return { ok: false };
    });

    // Phase 1.1b: credentials are session tokens (sess_*) — raw ID tokens are refused.
    const validRes = await client.verifyCode('de-6m-abcd1234-5678efgh', 'sess_valid_session_token');
    expect(validRes.success).toBe(true);
    expect(validRes.valid).toBe(true);
    expect(validRes.months).toBe(6);
    expect(validRes.expiresAt).toBe('2026-10-01T00:00:00.000Z');

    const invalidRes = await client.verifyCode('INVALID_CODE', 'sess_valid_session_token');
    expect(invalidRes.success).toBe(false);
    expect(invalidRes.reason).toBe('invalid_signature');
    expect(invalidRes.error).toBeDefined();
  });

  it('handles /check-status subscription endpoint', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/check-status')) {
        return {
          ok: true,
          json: async () => ({
            active: true,
            days_remaining: 45,
            server_time: '2026-04-15T12:00:00.000Z',
            expiresAt: '2026-05-30T12:00:00.000Z',
          }),
        };
      }
      return { ok: false };
    });

    const status = await client.checkSubscriptionStatus('sess_user_session_token');
    expect(status.active).toBe(true);
    expect(status.daysRemaining).toBe(45);
    expect(status.expiresAt).toBe('2026-05-30T12:00:00.000Z');
  });

  it('handles edge-cached translation via /ai/translate', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      if (url.endsWith('/ai/translate')) {
        return {
          ok: true,
          json: async () => ({ translation_ar: 'شكراً جزيلاً' }),
        };
      }
      return { ok: false };
    });

    const translation = await client.translateText('Vielen Dank');
    expect(translation).toBe('شكراً جزيلاً');
  });

  it('recovers an opener translation whose first attempt raced the session token', async () => {
    let calls = 0;
    const sentAuth: Array<string | undefined> = [];
    // The scenario opener's Arabic is fetched at mount, and the session-token
    // exchange can still be in flight. The retry is what covers that: it
    // re-resolves the credential, so the second call carries the token the first
    // one left without — which is the difference between a translated first
    // bubble and "no translation" on every fresh conversation.
    let storedToken: string | undefined;
    vi.spyOn(await import('../src/lib/db/katzuDb'), 'db', 'get').mockReturnValue({
      users: { get: async () => ({ sessionToken: storedToken }) },
    } as any);

    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      if (!url.endsWith('/ai/translate')) return { ok: false };
      sentAuth.push(options.headers.Authorization);
      calls += 1;
      if (calls === 1) {
        storedToken = 'sess_minted_at_mount';
        return { ok: false, status: 401 };
      }
      return { ok: true, json: async () => ({ translation_ar: 'مرحباً! أهلاً بك. هذه هي الشقة.' }) };
    });

    const translation = await client.translateTextReliable('Hallo! Willkommen. Das ist die Wohnung.', { delays: [0, 0] });
    expect(calls).toBe(2);
    expect(sentAuth[0]).toBeUndefined();
    expect(sentAuth[1]).toBe('Bearer sess_minted_at_mount');
    expect(translation).toBe('مرحباً! أهلاً بك. هذه هي الشقة.');
  });

  it('gives up after the configured attempts and reports a failure instead of inventing one', async () => {
    let calls = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (!url.endsWith('/ai/translate')) return { ok: false };
      calls += 1;
      return { ok: false, status: 502 };
    });

    // A wrong translation is worse than none, and a stalled one is worse than a
    // retry button — so the attempts are bounded.
    expect(await client.translateTextReliable('Hallo!', { delays: [0, 0] })).toBe('');
    expect(calls).toBe(3);
  });

  it('keeps queued progress when the worker answers 200 with an error body', async () => {
    const deleted: number[] = [];
    const queued = [{ id: 7, payload: { stats: { level: 'A1' } }, attempts: 0, nextRetryAt: 0 }];
    vi.spyOn(await import('../src/lib/db/katzuDb'), 'db', 'get').mockReturnValue({
      users: { get: async () => ({ sessionToken: 'sess_stored_session_token' }) },
      sync_queue: {
        where: () => ({ belowOrEqual: () => ({ toArray: async () => queued }) }),
        delete: async (id: number) => { deleted.push(id); },
        update: async () => 1,
      },
    } as any);

    // The legacy worker said 200 + { error: "invalid_id_token" } for an expired
    // session. `res.ok` alone made this look like a stored payload.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: 'invalid_id_token' }),
    });
    await client.flushPendingSync();
    expect(deleted).toEqual([]);

    // A genuinely stored payload is still cleared, so the guard is not a leak.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, updated_at: Date.now() }),
    });
    await client.flushPendingSync();
    expect(deleted).toEqual([7]);
  });

  it('exchanges Google ID token for session token via /auth/session', async () => {
    let capturedUrl = '';
    let capturedBody: any = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      capturedUrl = url;
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          session_token: 'mock_jwt_session_token_xyz',
          expires_in: 2592000,
        }),
      };
    });

    const result = await client.exchangeGoogleToken('google_credential_id_token_123');
    expect(capturedUrl).toBe('https://mock-worker.test/auth/session');
    expect(capturedBody).toEqual({ id_token: 'google_credential_id_token_123' });
    expect(result).toEqual({
      session_token: 'mock_jwt_session_token_xyz',
      expires_in: 2592000,
    });
  });

  it('attaches Authorization Bearer header and session_id on /ai/turn', async () => {
    // Phase 1.1b: credential comes from the stored session token (never a raw ID token).
    vi.spyOn(await import('../src/lib/db/katzuDb'), 'db', 'get').mockReturnValue({
      users: { get: async () => ({ sessionToken: 'sess_stored_session_token' }), update: async () => 1 },
    } as any);
    let capturedHeaders: any = null;
    let capturedBody: any = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      capturedHeaders = options.headers;
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          reply_de: 'Hallo!',
          reply_ar: 'مرحباً!',
          evaluation: { is_correct: true },
        }),
      };
    });

    await client.sendTurn({
      scenarioId: 'cafe',
      scenarioTitle: 'Im Café',
      userMessage: 'Guten Tag',
      history: [],
      cefrLevel: 'A1',
      sessionId: 'sess_123456789_abcdef',
      isFinalTurn: true,
    });

    expect(capturedHeaders['Authorization']).toBe('Bearer sess_stored_session_token');
    expect(capturedBody.session_id).toBe('sess_123456789_abcdef');
    expect(capturedBody.id_token).toBeUndefined();
    expect(capturedBody.is_final_turn).toBe(true);
  });
});
