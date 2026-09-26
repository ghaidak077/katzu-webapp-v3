import { describe, expect, it } from 'vitest';
import { handleHintsRoute, selectDistinctHints, HINT_INTENTS, MAX_HINTS } from '../cloudflare-hints';

/**
 * Multi-move hints (Call C).
 *
 * The old behaviour was ONE suggestion. The upgrade asks the model for 2-4
 * DISTINCT conversational moves, and this module is what guarantees "distinct"
 * is real: duplicate sentences and two options making the same move are dropped
 * before the client ever sees them. These tests pin exactly that guarantee,
 * plus the honest `belowTarget` signal when the model could not deliver.
 */

describe('selectDistinctHints', () => {
  it('keeps options that make genuinely different moves', () => {
    const kept = selectDistinctHints([
      { german: 'Ja, gerne.', translation_ar: 'نعم، بكل سرور.', intent: 'agree' },
      { german: 'Nein, leider nicht.', translation_ar: 'لا، للأسف.', intent: 'disagree' },
      { german: 'Wann denn?', translation_ar: 'متى إذن؟', intent: 'ask_followup' },
    ]);
    expect(kept.map((h) => h.intent)).toEqual(['agree', 'disagree', 'ask_followup']);
  });

  it('drops a second option that makes the same move (no rephrasings of one idea)', () => {
    const kept = selectDistinctHints([
      { german: 'Ja, das stimmt.', translation_ar: 'نعم، هذا صحيح.', intent: 'agree' },
      { german: 'Ja, genau so ist es.', translation_ar: 'نعم، الأمر كذلك تماماً.', intent: 'agree' },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].german).toBe('Ja, das stimmt.');
  });

  it('drops duplicate sentences regardless of punctuation and case', () => {
    const kept = selectDistinctHints([
      { german: 'Das ist zu teuer.', translation_ar: 'هذا غالٍ جداً.', intent: 'disagree' },
      { german: 'das ist zu teuer!', translation_ar: 'هذا مكلف جداً.', intent: 'add_detail' },
    ]);
    expect(kept).toHaveLength(1);
  });

  it('requires a readable Arabic translation and a non-empty German option', () => {
    const kept = selectDistinctHints([
      { german: 'Ich verstehe nicht.', translation_ar: 'لا أفهم.', intent: 'clarify' },
      { german: 'Könnten Sie das wiederholen?', translation_ar: 'Could you repeat?', intent: 'ask_followup' },
      { german: '', translation_ar: 'نعم', intent: 'answer' },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].intent).toBe('clarify');
  });

  it('never returns more than the phone-sized ceiling', () => {
    const many = HINT_INTENTS.map((intent, i) => ({
      german: `Satz Nummer ${i}.`,
      translation_ar: `جملة رقم ${i}.`,
      intent,
    }));
    expect(selectDistinctHints(many)).toHaveLength(MAX_HINTS);
    expect(MAX_HINTS).toBe(4);
  });

  it('falls back to the `answer` intent when the model sends something unknown', () => {
    const kept = selectDistinctHints([{ german: 'Guten Tag.', translation_ar: 'نهارك سعيد.', intent: 'smalltalk' }]);
    expect(kept[0].intent).toBe('answer');
  });
});

// ---------------------------------------------------------------------------
// Route behaviour with worker internals stubbed in (the real ones are injected
// by cloudflare-unified-worker.js at the call site).
// ---------------------------------------------------------------------------

const CORS = { 'Access-Control-Allow-Origin': '*' };

function deps(modelReply: string) {
  const hintsCache = new Map<string, unknown>();
  let calls = 0;
  return {
    cache: hintsCache,
    callCount: () => calls,
    value: {
      authenticateAiRequest: async () => ({}),
      boundedHistory: (history: unknown) => (Array.isArray(history) ? history.slice(-4) : []),
      hasUsableProvider: () => true,
      // Stubs for the shared KV-backed cache: the same get/set contract the
      // worker's readAiCache / writeAiCache expose, keyed by namespace.
      readAiCache: async (_env: unknown, ns: string, key: string) => hintsCache.get(`${ns}:${key}`) ?? null,
      writeAiCache: async (_env: unknown, ns: string, key: string, value: unknown) => {
        hintsCache.set(`${ns}:${key}`, value);
      },
      callAiRouter: async () => {
        calls += 1;
        return modelReply;
      },
      // Mirrors the worker's tolerant `cleanJson`: code fences stripped, then
      // direct parse, then the largest {...} slice, then an empty object.
      cleanJson: (raw: unknown) => {
        if (!raw) return {};
        if (typeof raw === 'object') return raw;
        const text = String(raw).replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        try {
          return JSON.parse(text);
        } catch {
          /* fall through to brace extraction */
        }
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end > start) {
          try {
            return JSON.parse(text.slice(start, end + 1));
          } catch {
            /* reported as no options, recovered from the raw string below */
          }
        }
        return {};
      },
      json: (body: unknown, status: number, cors: unknown) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json', ...(cors as Record<string, string>) },
        }),
    },
  };
}

function hintsRequest(body: Record<string, unknown>) {
  return new Request('https://katzu.test/ai/hints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const MODEL_REPLY = JSON.stringify({
  hints: [
    { german: 'Ja, gerne.', translation_ar: 'نعم، بكل سرور.', intent: 'agree' },
    { german: 'Nein, das geht nicht.', translation_ar: 'لا، هذا غير ممكن.', intent: 'disagree' },
    { german: 'Wann hätten Sie Zeit?', translation_ar: 'متى يكون لديك وقت؟', intent: 'ask_followup' },
    { german: 'Ja, gerne!', translation_ar: 'نعم، بكل سرور!', intent: 'answer' },
  ],
});

describe('handleHintsRoute', () => {
  it('returns distinct moves and tags each with its intent', async () => {
    const d = deps(MODEL_REPLY);
    const res = await handleHintsRoute(
      hintsRequest({ last_ai_reply: 'Möchten Sie einen Kaffee?', cefr_level: 'A1' }),
      {},
      CORS,
      d.value
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    // The 4th is a duplicate sentence of the 1st, so it is dropped.
    expect(body.hints).toHaveLength(3);
    expect(body.hints.map((h: { intent: string }) => h.intent)).toEqual(['agree', 'disagree', 'ask_followup']);
    expect(body.belowTarget).toBe(false);
    expect(body.distinctIntents).toBe(3);
  });

  it('serves the cached set without a second model call', async () => {
    const d = deps(MODEL_REPLY);
    const req = () => hintsRequest({ last_ai_reply: 'Möchten Sie einen Kaffee?', cefr_level: 'A1' });
    await handleHintsRoute(req(), {}, CORS, d.value);
    const second = await (await handleHintsRoute(req(), {}, CORS, d.value)).json();
    expect(second.cached).toBe(true);
    expect(d.callCount()).toBe(1);
  });

  it('flags belowTarget honestly when the model only rephrased one idea', async () => {
    const d = deps(
      JSON.stringify({
        hints: [
          { german: 'Ja, das stimmt.', translation_ar: 'نعم، هذا صحيح.', intent: 'agree' },
          { german: 'Ja, genau so ist es.', translation_ar: 'نعم، الأمر كذلك تماماً.', intent: 'agree' },
        ],
      })
    );
    const body = await (await handleHintsRoute(hintsRequest({ last_ai_reply: 'Stimmt das?' }), {}, CORS, d.value)).json();
    expect(body.hints).toHaveLength(1);
    expect(body.belowTarget).toBe(true);
  });

  it('recovers usable options from a loosely-framed model reply', async () => {
    const d = deps(
      'Here you go: {"hints": [{"german": "Ich verstehe nicht.", "translation_ar": "لا أفهم.", "intent": "clarify"}'
    );
    const body = await (await handleHintsRoute(hintsRequest({ last_ai_reply: 'Verstehen Sie?' }), {}, CORS, d.value)).json();
    expect(body.hints).toHaveLength(1);
    expect(body.hints[0].intent).toBe('clarify');
  });

  it('authenticates before doing any work', async () => {
    const d = deps(MODEL_REPLY);
    const rejecting = {
      ...d.value,
      authenticateAiRequest: async () => ({ response: new Response('{"error":"unauthorized"}', { status: 401 }) }),
    };
    const res = await handleHintsRoute(hintsRequest({ last_ai_reply: 'Hallo' }), {}, CORS, rejecting);
    expect(res.status).toBe(401);
    expect(d.callCount()).toBe(0);
  });
});
