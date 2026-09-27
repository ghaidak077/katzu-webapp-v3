import { db } from '@/lib/db/katzuDb';
import { WORKER_BASE_URL } from '@/lib/api/workerUrl';
import {
  ALLOWED_PROP_KEYS,
  dedupeEvents,
  isRetryDue,
  MAX_ATTEMPTS,
  MAX_BATCH_SIZE,
  MAX_QUEUE_SIZE,
  planAnalyticsBatch,
  purgeExpiredEvents,
  shouldTrackAnalytics,
  validateAnalyticsEvent,
  type AnalyticsEvent,
  type AnalyticsEventName,
  type AnalyticsPropKey,
} from './events';

/**
 * The analytics client: small, local-first, and impossible to break the app.
 *
 * Every send is best-effort. Events are written to a bounded localStorage queue
 * first, batched 20 at a time, retried with backoff while offline, and dropped
 * after MAX_ATTEMPTS. Nothing here ever throws into a screen, and a learner who
 * opts out has their queue deleted, not just muted.
 */

const QUEUE_KEY = 'katzu_analytics_queue_v1';
const OPTOUT_KEY = 'katzu_analytics_opt_out';
const INSTALL_KEY = 'katzu_install_id';

interface AnalyticsQueue {
  events: AnalyticsEvent[];
  attempts: number;
  nextRetryAt: number;
}

const EMPTY_QUEUE: AnalyticsQueue = { events: [], attempts: 0, nextRetryAt: 0 };

function isDevBuild(): boolean {
  try {
    return !!(import.meta as any).env?.DEV;
  } catch {
    return false;
  }
}

function forceInDev(): boolean {
  try {
    return !!(import.meta as any).env?.VITE_ANALYTICS_DEV;
  } catch {
    return false;
  }
}

export function appVersion(): string {
  try {
    return String((import.meta as any).env?.VITE_APP_VERSION || 'dev').slice(0, 32);
  } catch {
    return 'dev';
  }
}

function safeRead(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    /* private mode: analytics silently degrades to per-session memory */
  }
}

function safeRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Random, stable, anonymous. Never derived from anything personal. */
export function installationId(): string {
  const existing = safeRead(INSTALL_KEY);
  if (existing) return existing;
  const generated =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  safeWrite(INSTALL_KEY, generated);
  return generated;
}

/**
 * A non-reversible account handle for signed-in events. The app must not send
 * an email address, and it must still be able to tell two accounts apart; a
 * short djb2 digest does exactly that.
 */
export function hashAccountId(accountEmail: string): string {
  const value = String(accountEmail || '').trim().toLowerCase();
  if (!value) return '';
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  }
  return `acct_${hash.toString(36)}`;
}

export function isAnalyticsOptedOut(): boolean {
  return safeRead(OPTOUT_KEY) === '1';
}

/** Opt-out deletes the pending queue: muted is not the same as deleted. */
export function setAnalyticsOptOut(optedOut: boolean): void {
  if (optedOut) {
    safeWrite(OPTOUT_KEY, '1');
    safeRemove(QUEUE_KEY);
  } else {
    safeRemove(OPTOUT_KEY);
  }
}

function readQueue(): AnalyticsQueue {
  const raw = safeRead(QUEUE_KEY);
  if (!raw) return { ...EMPTY_QUEUE };
  try {
    const parsed = JSON.parse(raw) as AnalyticsQueue;
    if (!parsed || !Array.isArray(parsed.events)) return { ...EMPTY_QUEUE };
    return {
      events: parsed.events,
      attempts: Number(parsed.attempts) || 0,
      nextRetryAt: Number(parsed.nextRetryAt) || 0,
    };
  } catch {
    return { ...EMPTY_QUEUE };
  }
}

function writeQueue(queue: AnalyticsQueue): void {
  safeWrite(QUEUE_KEY, JSON.stringify(queue));
}

/** Visible for tests: the queue never grows past its cap. */
export function enqueueEvent(event: AnalyticsEvent, now = Date.now()): void {
  const queue = readQueue();
  const events = purgeExpiredEvents([...queue.events, ...dedupeEvents(queue.events, [event])], now).slice(-MAX_QUEUE_SIZE);
  writeQueue({ ...queue, events });
}

/**
 * Records one product event. Synchronous and side-effect limited: it validates,
 * dedupes, queues, and schedules a flush. A dropped event is a non-event.
 */
export function track(
  name: AnalyticsEventName,
  props?: Partial<Record<AnalyticsPropKey, string | number>>,
): void {
  if (!shouldTrackAnalytics({ optedOut: isAnalyticsOptedOut(), isDev: isDevBuild(), forceInDev: forceInDev() })) return;
  if (!WORKER_BASE_URL) return;

  const route = typeof location !== 'undefined' ? location.pathname : '/';
  const candidate = {
    name,
    ts: Date.now(),
    installId: installationId(),
    appVersion: appVersion(),
    route,
    props: props ? pickProps(props) : undefined,
  };
  const result = validateAnalyticsEvent(candidate);
  if (!result.ok) return;
  enqueueEvent(result.event);
  scheduleFlush();
}

function pickProps(props: Partial<Record<AnalyticsPropKey, string | number>>) {
  const picked: Partial<Record<AnalyticsPropKey, string | number>> = {};
  for (const key of ALLOWED_PROP_KEYS) {
    const value = props[key];
    if (typeof value === 'number' || typeof value === 'string') picked[key] = value;
  }
  return picked;
}

export function queueSnapshot(): AnalyticsEvent[] {
  return readQueue().events;
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;

function scheduleFlush(delayMs = 2000): void {
  if (typeof setTimeout === 'undefined' || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAnalytics();
  }, delayMs);
}

/**
 * Sends one batch. Enrichment happens here rather than at track time: reading
 * the profile per event would be a database hit per tap, and the batch is the
 * natural place to attach the level/goal once it is known.
 */
export async function flushAnalytics(now = Date.now()): Promise<boolean> {
  if (inFlight) return false;
  if (!WORKER_BASE_URL) return false;
  if (isAnalyticsOptedOut()) {
    safeRemove(QUEUE_KEY);
    return false;
  }
  if (!shouldTrackAnalytics({ optedOut: false, isDev: isDevBuild(), forceInDev: forceInDev() })) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

  const queue = readQueue();
  if (queue.events.length === 0) return false;
  if (!isRetryDue({ nextRetryAt: queue.nextRetryAt, attempts: queue.attempts }, now)) return false;

  const { batch, rest } = planAnalyticsBatch(queue.events, MAX_BATCH_SIZE);
  const enriched = await enrichEvents(batch);

  inFlight = true;
  try {
    const response = await fetch(`${WORKER_BASE_URL}/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ events: enriched }),
    });
    if (!response.ok) throw new Error(`analytics_${response.status}`);
    writeQueue({ events: rest, attempts: 0, nextRetryAt: 0 });
    return true;
  } catch {
    // Re-queue the same events with backoff. After MAX_ATTEMPTS they are
    // dropped — an undeliverable event is not worth retrying forever.
    const attempts = queue.attempts + 1;
    if (attempts > MAX_ATTEMPTS) {
      writeQueue({ events: rest, attempts: 0, nextRetryAt: 0 });
      return false;
    }
    writeQueue({ events: [...batch, ...rest], attempts, nextRetryAt: now + Math.min(30_000 * 2 ** (attempts - 1), 15 * 60_000) });
    return false;
  } finally {
    inFlight = false;
  }
}

async function enrichEvents(events: AnalyticsEvent[]): Promise<AnalyticsEvent[]> {
  try {
    const user = await db.users.get('current_user');
    const accountId = user?.isLoggedIn ? hashAccountId(user.email || '') : '';
    return events.map((event) => ({
      ...event,
      userId: accountId || undefined,
      level: user?.cefrLevel || undefined,
      goal: user?.primaryGoal || undefined,
    }));
  } catch {
    // Offline-first app: a user-row read failure must never lose the batch.
    return events;
  }
}

/**
 * Flushes when connectivity returns. Installed once from main.tsx; safe to call
 * repeatedly (the flag guards the listener).
 */
export function installAnalyticsLifecycle(): void {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__katzuAnalyticsInstalled) return;
  w.__katzuAnalyticsInstalled = true;
  window.addEventListener('online', () => void flushAnalytics());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAnalytics();
  });
}
