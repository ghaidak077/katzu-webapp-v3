import { describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';

/**
 * GET /health is unauthenticated. It used to report masked Gemini key fragments
 * ("Key #1: AQ.Ab8RN...U3xA") and the number of configured keys — an information
 * disclosure that fingerprints the secret set. These tests lock in the public
 * contract: 200 + system health, and neither a key fragment nor a key count.
 */

const FAKE_KEYS = [
  'AQ.Ab8RN6J1fakeKeyAAA111bbb222ccc333ddd444eee555',
  'AIzaSyFAKEkeyBBB222ccc333ddd444eee555fff666gg',
  'AQ.Ab8RN6J2fakeKeyCCC333ddd444eee555fff666ggg777',
];

// Any 8-char prefix of a key is enough to recognise it; assert none appear.
const KEY_FRAGMENTS = FAKE_KEYS.map((k) => k.slice(0, 8));

// Fields that exposed key details or counts and must never be public again.
const FORBIDDEN_FIELDS = [
  'keysConfigured',
  'rawKeysFound',
  'uniqueCount',
  'rawCount',
  'hasDuplicateKeys',
  'duplicateWarning',
  'healthyKeys',
  'coolingDownKeys',
  'registeredKeysMasked',
  'previews',
  'duplicates',
];

async function getHealth(path = '/health', env: Record<string, unknown> = {}) {
  const res = await worker.fetch(new Request(`https://worker.test${path}`), env as never);
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* leave null; assertions surface it */
  }
  return { res, text, body };
}

describe('GET /health privacy', () => {
  it('returns 200 with system health and no key material or counts', async () => {
    const { res, text, body } = await getHealth('/health', {
      GEMINI_API_KEYS: FAKE_KEYS.join(','),
      AI: {},
    });

    expect(res.status).toBe(200);
    expect(body?.status).toBe('healthy');
    expect(typeof body?.ready).toBe('boolean');
    expect(body?.ready).toBe(true);

    // No part of any configured key appears anywhere in the body.
    for (const fragment of KEY_FRAGMENTS) {
      expect(text).not.toContain(fragment);
    }
    // No "Key #1: …" style preview and no masked-key pattern at all.
    expect(text).not.toMatch(/Key #\d/);
    expect(text).not.toMatch(/[A-Za-z0-9_-]{6,}\.\.\.[A-Za-z0-9_-]{4}/);

    // No field that counted or identified keys.
    for (const field of FORBIDDEN_FIELDS) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it('never leaks key material even when duplicate keys are configured', async () => {
    const { res, text, body } = await getHealth('/health', {
      // Same key three times: the internal warning used to embed a masked key.
      GEMINI_API_KEYS: [FAKE_KEYS[0], FAKE_KEYS[0], FAKE_KEYS[1]].join(','),
      AI: {},
    });

    expect(res.status).toBe(200);
    expect(body?.status).toBe('healthy');
    for (const fragment of KEY_FRAGMENTS) {
      expect(text).not.toContain(fragment);
    }
    expect(body).not.toHaveProperty('duplicateWarning');
    expect(body).not.toHaveProperty('hasDuplicateKeys');
  });

  it('reports not-ready honestly when nothing is configured, still without counts', async () => {
    const { res, text, body } = await getHealth('/health', {});

    expect(res.status).toBe(200);
    expect(body?.ready).toBe(false);
    expect(text).not.toMatch(/Key #\d/);
    for (const field of FORBIDDEN_FIELDS) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it('applies the same protection to the /ai/health alias', async () => {
    const { res, text, body } = await getHealth('/ai/health', {
      GEMINI_API_KEY_1: FAKE_KEYS[0],
      AI: {},
    });

    expect(res.status).toBe(200);
    expect(body?.status).toBe('healthy');
    expect(text).not.toContain(FAKE_KEYS[0].slice(0, 8));
    expect(body).not.toHaveProperty('keysConfigured');
  });
});
