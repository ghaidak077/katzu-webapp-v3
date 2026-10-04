import { db } from '@/lib/db/katzuDb';
import { DAILY_EVENT_QUEUE_KEY as QUEUE_KEY } from '@/lib/progress/dailyQueueKey';
import { localDateKey } from '@/lib/utils/streak';
import type { DailyAuthority } from '@/types/models';
import type { SessionMode } from '@/types/models';

/**
 * The client half of the server-authoritative daily ledger (V29).
 *
 * The server owns the DAY — and therefore the daily XP cap and the streak — so a
 * device clock or timezone change can no longer grant a fresh day. The client
 * stays local-first: it counts offline and tells the server what it measured, then
 * ADOPTS the server's answer. Nothing here decides the day; it only carries the
 * two things the server cannot see (the learner's UTC offset, once, and what
 * happened on this device) and stores the authoritative result.
 *
 * Events are durable (localStorage) so a learner who finishes a session offline
 * still gets it credited on the next sync, and each event carries a stable id so
 * the server can dedupe a replayed batch exactly once.
 */

// Re-exported for callers that only need the shape.
export type { DailyAuthority };

export interface DailySyncEvent {
  /** Stable id — the server dedupes retries by it. */
  id: string;
  type: 'session' | 'task';
  // session
  accuracyPercent?: number | null;
  assistedSentences?: number;
  mode?: SessionMode;
  // task
  kind?: 'scenario' | 'grammar' | 'review';
}

export interface DailyPayload {
  /** `-getTimezoneOffset()`; locked server-side on the first sync. */
  offsetMinutes: number;
  /** The learner's current lifetime total, used to seed the ledger once. */
  totalXp: number;
  /** Completed day keys (all three tasks), used to seed the streak once. */
  history: string[];
  /** Today's local task row, used to seed today once. */
  today?: { dateKey: string; scenario: boolean; grammar: boolean; review: boolean };
  events: DailySyncEvent[];
}

const MAX_QUEUE = 120;

function safeRead(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(QUEUE_KEY);
  } catch {
    return null;
  }
}

function safeWrite(value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(QUEUE_KEY, value);
  } catch {
    /* private mode: the queue degrades to this session only */
  }
}

/** A stable id for one finished session — unique per completion, never reused. */
export function sessionEventId(timestamp: number): string {
  return `sess:${timestamp}:${Math.random().toString(36).slice(2, 10)}`;
}

export function readDailyEventQueue(): DailySyncEvent[] {
  const raw = safeRead();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((event) => event && typeof event.id === 'string') : [];
  } catch {
    return [];
  }
}

/** Queues one event for the next sync. Bounded: oldest are dropped first. */
export function enqueueDailyEvent(event: DailySyncEvent): void {
  if (!event || typeof event.id !== 'string' || event.id.length < 4) return;
  const queue = readDailyEventQueue();
  if (queue.some((existing) => existing.id === event.id)) return;
  queue.push(event);
  safeWrite(JSON.stringify(queue.slice(-MAX_QUEUE)));
}

/** Removes events the server has accepted. */
export function clearDailyEvents(ids: readonly string[]): void {
  const drop = new Set(ids);
  if (drop.size === 0) return;
  safeWrite(JSON.stringify(readDailyEventQueue().filter((event) => !drop.has(event.id))));
}

/**
 * Assembles the `daily` section of a progress sync: the durable session queue,
 * today's task completions (replayed as idempotent events), the completed-day
 * history (used once, to seed the streak), and the device offset (used once, to
 * lock the day).
 */
export async function buildDailyPayload(): Promise<DailyPayload> {
  const events = readDailyEventQueue();
  const [rows, user] = await Promise.all([
    db.daily_tasks.toArray().catch(() => []),
    db.users.get('current_user').catch(() => undefined),
  ]);
  const todayKey = localDateKey();
  const todayRow = rows.find((row) => row.dateKey === todayKey) ?? null;

  if (todayRow) {
    for (const kind of ['scenario', 'grammar', 'review'] as const) {
      if (todayRow[kind]) events.push({ id: `task:${todayKey}:${kind}`, type: 'task', kind });
    }
  }

  const history = rows
    .filter((row) => row.scenario && row.grammar && row.review)
    .map((row) => row.dateKey)
    .slice(-400);

  return {
    offsetMinutes: -new Date().getTimezoneOffset(),
    totalXp: Math.max(0, Math.floor(user?.totalXp || 0)),
    history,
    today: todayRow
      ? { dateKey: todayRow.dateKey, scenario: todayRow.scenario, grammar: todayRow.grammar, review: todayRow.review }
      : undefined,
    events,
  };
}

/**
 * Adopts the server's authoritative day/XP/streak. This is the point where the
 * server WINS: whatever the device computed locally, this overwrites the total
 * and the streak with the server's values so a clock jump cannot outlive a sync.
 */
export async function adoptDailyAuthority(daily: DailyAuthority | null | undefined, sessionToken?: string): Promise<void> {
  if (!daily || typeof daily.totalXp !== 'number') return;
  try {
    await db.users.where('id').equals('current_user').modify((user) => {
      if (sessionToken && user.sessionToken !== sessionToken) return;
      Object.assign(user, {
      totalXp: Math.max(0, Math.floor(daily.totalXp)),
      streakDays: Math.max(0, Math.floor(daily.streakDays || 0)),
      dailyAuthority: {
        dayKey: String(daily.dayKey || ''),
        offsetMinutes: Number(daily.offsetMinutes) || 0,
        xpToday: Math.max(0, Math.floor(daily.xpToday || 0)),
        totalXp: Math.max(0, Math.floor(daily.totalXp)),
        streakDays: Math.max(0, Math.floor(daily.streakDays || 0)),
        cap: Number(daily.cap) || 600,
        earnedToday: !!daily.earnedToday,
        tasks: {
          scenario: !!daily.tasks?.scenario,
          grammar: !!daily.tasks?.grammar,
          review: !!daily.tasks?.review,
        },
        updatedAt: Number(daily.updatedAt) || Date.now(),
      },
      });
    });
  } catch {
    /* a failed adopt is non-fatal: the next sync re-sends the same truth */
  }
}
