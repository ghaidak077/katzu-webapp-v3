import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_TTL_SECONDS,
  EVENT_NAMES,
  MAX_BODY_BYTES,
  MAX_EVENTS_PER_BATCH,
  PROP_KEYS,
  handleAnalyticsRoute,
  validateAnalyticsEvent,
} from '../cloudflare-analytics';
import { ALLOWED_PROP_KEYS, ANALYTICS_EVENTS } from '../src/lib/analytics/events';

class MemoryKv {
  values = new Map<string, string>();
  options: Array<Record<string, unknown>> = [];
  async get(key: string) {
    return this.values.get(key) || null;
  }
  async put(key: string, value: string, options?: Record<string, unknown>) {
    this.values.set(key, value);
    if (options) this.options.push(options);
  }
}

function json(obj: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

const now = Date.now();

function goodEvent(overrides: Record<string, unknown> = {}) {
  return {
    name: 'demo_started',
    ts: now,
    installId: 'install-abcdefgh',
    appVersion: '1.0.0',
    route: '/demo',
    ...overrides,
  };
}

function post(body: unknown, env: Record<string, unknown>, deps: Record<string, unknown> = {}) {
  const request = new Request('https://worker.test/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.5' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return handleAnalyticsRoute(new URL(request.url), request, env, {}, { json, ...deps });
}

describe('analytics ingest route', () => {
  it('owns only its own path', async () => {
    const request = new Request('https://worker.test/health', { method: 'POST' });
    const response = await handleAnalyticsRoute(new URL(request.url), request, {}, {}, { json });
    expect(response).toBeNull();
  });

  it('rejects anything but POST', async () => {
    const request = new Request('https://worker.test/analytics/events', { method: 'GET' });
    const response = await handleAnalyticsRoute(new URL(request.url), request, {}, {}, { json });
    expect(response?.status).toBe(405);
  });

  it('rejects invalid JSON and malformed batches', async () => {
    const env = { USER_PROGRESS: new MemoryKv() };
    expect((await post('{not json', env))?.status).toBe(400);
    expect((await post({ events: [] }, env))?.status).toBe(400);
    expect(
      (await post({ events: Array.from({ length: MAX_EVENTS_PER_BATCH + 1 }, goodEvent) }, env))?.status,
    ).toBe(400);
  });

  it('caps the body size', async () => {
    const env = { USER_PROGRESS: new MemoryKv() };
    const response = await post('x'.repeat(MAX_BODY_BYTES + 1), env);
    expect(response?.status).toBe(413);
  });

  it('accepts a valid batch, stores it once, and counts rejects per event', async () => {
    const env = { USER_PROGRESS: new MemoryKv() };
    const response = await post(
      { events: [goodEvent(), goodEvent({ name: 'not_a_real_event' }), goodEvent({ ts: 1 })] },
      env,
    );
    expect(response?.status).toBe(200);
    const body = await response!.json();
    expect(body).toEqual({ success: true, accepted: 1, rejected: 2 });

    expect(env.USER_PROGRESS.values.size).toBe(1);
    const [key, value] = [...env.USER_PROGRESS.values.entries()][0];
    expect(key).toMatch(/^analytics:evt:\d{4}-\d{2}-\d{2}:/);
    const stored = JSON.parse(value);
    expect(stored.events).toHaveLength(1);
    expect(stored.events[0].name).toBe('demo_started');
    expect(env.USER_PROGRESS.options[0]).toEqual({ expirationTtl: ANALYTICS_TTL_SECONDS });
  });

  it('never stores learner content, email-shaped install ids, or unknown props', async () => {
    const env = { USER_PROGRESS: new MemoryKv() };
    await post(
      {
        events: [
          goodEvent({
            installId: 'learner@example.com',
            props: { scenarioId: 'doctor_visit', transcript: 'Ich habe Fieber' },
          }),
        ],
      },
      env,
    );
    expect(env.USER_PROGRESS.values.size).toBe(0);

    const withProps = validateAnalyticsEvent(
      goodEvent({ props: { scenarioId: 'doctor_visit', transcript: 'Ich habe Fieber' } }),
      now,
    );
    expect(withProps.ok).toBe(true);
    if (withProps.ok) {
      expect(Object.keys(withProps.event.props || {})).toEqual(['scenarioId']);
    }
  });

  it('honours the injected rate limiter', async () => {
    const env = { USER_PROGRESS: new MemoryKv() };
    const response = await post({ events: [goodEvent()] }, env, {
      checkRateLimit: () => ({ allowed: false }),
    });
    expect(response?.status).toBe(429);
    expect(env.USER_PROGRESS.values.size).toBe(0);
  });

  it('still answers 200 when storage is unavailable', async () => {
    const response = await post({ events: [goodEvent()] }, {});
    expect(response?.status).toBe(200);
  });
});

describe('analytics contract across runtimes', () => {
  it('keeps the worker event allowlist identical to the client list', () => {
    expect([...EVENT_NAMES].sort()).toEqual([...ANALYTICS_EVENTS].sort());
  });

  it('keeps the worker property allowlist identical to the client list', () => {
    expect([...PROP_KEYS].sort()).toEqual([...ALLOWED_PROP_KEYS].sort());
  });
});
