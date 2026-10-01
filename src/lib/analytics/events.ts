/**
 * First-party product analytics — the rules, as values.
 *
 * WHY SO SMALL
 * The product questions this must answer are specific and countable: where do
 * visitors quit, does anyone finish a first lesson, does anyone speak, does
 * anyone come back to review, which paywall appears before a purchase, and
 * which goal/level combinations retain. Anything beyond that is data the app
 * has no right to collect from a learner who came here to practise German.
 *
 * WHAT NEVER LEAVES THE DEVICE
 * No transcripts, no microphone audio, no mistakes, no email, no tokens, no
 * immigration/medical/financial detail. The event record below is closed: a
 * value that is not in the allowlist is dropped, not stored.
 *
 * Pure by design so the privacy rules are unit-testable without a browser.
 */

export const ANALYTICS_EVENTS = [
  'landing_viewed',
  'demo_started',
  'demo_completed',
  'signup_started',
  'signup_completed',
  'onboarding_started',
  'onboarding_completed',
  'placement_started',
  'placement_completed',
  'scenario_started',
  'scenario_studied',
  'scenario_completed',
  'quiz_completed',
  'conversation_started',
  'first_independent_turn',
  'conversation_completed',
  'return_day1',
  'return_day7',
  'review_started',
  'review_completed',
  'coach_viewed',
  'writing_completed',
  'listening_completed',
  'paywall_viewed',
  'purchase_clicked',
  'code_redeemed',
  'app_error',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

/** Property keys the envelope may carry. Anything else is discarded. */
export const ALLOWED_PROP_KEYS = [
  'scenarioId',
  'skill',
  'category',
  'source',
  'kind',
  'state',
  'reason',
  'count',
] as const;

export type AnalyticsPropKey = (typeof ALLOWED_PROP_KEYS)[number];

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  /** Epoch ms, assigned on the device. */
  ts: number;
  /** Random anonymous installation id (no account required). */
  installId: string;
  /** Authenticated learner id hash, when signed in (never an email). */
  userId?: string;
  appVersion: string;
  route: string;
  level?: string;
  goal?: string;
  props?: Partial<Record<AnalyticsPropKey, string | number>>;
}

const LEVELS = ['A1', 'A2', 'B1', 'B2'];
const GOALS = ['daily_life', 'work', 'university', 'exam'];
export const MAX_BATCH_SIZE = 20;
export const MAX_QUEUE_SIZE = 200;
export const MAX_ATTEMPTS = 3;

/** Events older than this are dropped rather than back-filled weeks later. */
export const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

/**
 * Validates one event. Returns the stored shape or a machine-readable reason —
 * the worker runs the same allowlist, so a buggy client cannot widen the
 * contract on its own.
 */
export function validateAnalyticsEvent(
  input: unknown,
  now = Date.now(),
): { ok: true; event: AnalyticsEvent } | { ok: false; reason: string } {
  if (!isPlainObject(input)) return { ok: false, reason: 'not_object' };
  const name = input.name;
  if (typeof name !== 'string' || !(ANALYTICS_EVENTS as readonly string[]).includes(name)) {
    return { ok: false, reason: 'unknown_event' };
  }
  const ts = Number(input.ts);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_EVENT_AGE_MS) return { ok: false, reason: 'bad_timestamp' };
  const installId = clampText(input.installId, 64);
  if (!installId || installId.length < 8) return { ok: false, reason: 'bad_install_id' };

  const event: AnalyticsEvent = {
    name: name as AnalyticsEventName,
    ts: Math.round(ts),
    installId,
    appVersion: clampText(input.appVersion, 32) || 'unknown',
    route: clampText(input.route, 200) || '/',
  };

  const userId = clampText(input.userId, 64);
  if (userId) event.userId = userId;
  const level = clampText(input.level, 4);
  if (level && LEVELS.includes(level)) event.level = level;
  const goal = clampText(input.goal, 24);
  if (goal && GOALS.includes(goal)) event.goal = goal;

  if (isPlainObject(input.props)) {
    const props: Partial<Record<AnalyticsPropKey, string | number>> = {};
    for (const key of ALLOWED_PROP_KEYS) {
      const value = input.props[key];
      if (typeof value === 'number' && Number.isFinite(value)) props[key] = Math.round(value * 100) / 100;
      else if (typeof value === 'string' && value.trim()) props[key] = value.trim().slice(0, 64);
    }
    if (Object.keys(props).length) event.props = props;
  }

  return { ok: true, event };
}

/** Stable identity for dedupe: the same event must not be counted twice. */
export function analyticsEventKey(event: AnalyticsEvent): string {
  return [event.name, event.ts, event.installId, event.props?.scenarioId ?? '', event.props?.source ?? ''].join('|');
}

/** Drops anything the queue already holds. Returns the new, unique tail. */
export function dedupeEvents(existing: AnalyticsEvent[], incoming: AnalyticsEvent[]): AnalyticsEvent[] {
  const seen = new Set(existing.map(analyticsEventKey));
  const tail: AnalyticsEvent[] = [];
  for (const event of incoming) {
    const key = analyticsEventKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    tail.push(event);
  }
  return tail;
}

export function purgeExpiredEvents(queue: AnalyticsEvent[], now = Date.now()): AnalyticsEvent[] {
  return queue.filter((event) => Number.isFinite(event.ts) && now - event.ts <= MAX_EVENT_AGE_MS);
}

export function planAnalyticsBatch(queue: AnalyticsEvent[], max = MAX_BATCH_SIZE): { batch: AnalyticsEvent[]; rest: AnalyticsEvent[] } {
  const safe = Array.isArray(queue) ? queue : [];
  return { batch: safe.slice(0, max), rest: safe.slice(max) };
}

/**
 * Retry planning. A failed send re-queues its events with exponential backoff,
 * and after MAX_ATTEMPTS they are dropped rather than retried forever: an event
 * that cannot be delivered within its freshness window is not worth the
 * learner's battery.
 */
export function planAnalyticsRetry(
  failed: AnalyticsEvent[],
  previousAttempts = 0,
  now = Date.now(),
): { events: AnalyticsEvent[]; attempts: number; nextRetryAt: number } | null {
  if (!Array.isArray(failed) || failed.length === 0) return null;
  const attempts = Math.max(0, previousAttempts) + 1;
  if (attempts > MAX_ATTEMPTS) return null;
  const delay = Math.min(30_000 * 2 ** (attempts - 1), 15 * 60_000);
  return { events: failed, attempts, nextRetryAt: now + delay };
}

export function isRetryDue(entry: { nextRetryAt: number; attempts: number }, now = Date.now()): boolean {
  return entry.attempts < MAX_ATTEMPTS && entry.nextRetryAt <= now;
}

/** Opt-out wins over everything: no queueing, no sending, no scraping. */
export function shouldTrackAnalytics(input: {
  optedOut: boolean;
  isDev: boolean;
  forceInDev?: boolean;
}): boolean {
  if (input.optedOut) return false;
  if (input.isDev && !input.forceInDev) return false;
  return true;
}
