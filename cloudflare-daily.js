/**
 * Server-authoritative daily XP, task completion and streak.
 *
 * WHY THIS EXISTS
 * The daily XP cap and the streak used to be computed entirely on the device
 * (`src/lib/progress/dailyXp.ts` + `src/lib/utils/streak.ts`), which meant the
 * device clock chose the day: moving the clock or the timezone forward granted a
 * fresh day, a fresh cap and another streak step. This module moves the DAY —
 * and therefore the cap and the streak — onto the server.
 *
 * THE TWO RULES (owner-approved)
 *  1. **The offset is locked.** The first sync stores the learner's UTC offset
 *     and every later sync ignores a different one, so changing the device
 *     timezone can never move the day boundary. The day is derived from the
 *     server's own clock plus that fixed offset.
 *  2. **Local-first, server-wins.** The client still counts offline; when it
 *     reconnects it sends what it measured and ADOPTS the server's answer, so a
 *     local number can never outlive the server's truth.
 *
 * WHAT THE SERVER CAN AND CANNOT VERIFY
 * XP is measured on the device (accuracy on the learner's own sentences), so the
 * server does not re-measure it — it re-derives the amount from the reported
 * session inputs with the same rule as the client, then enforces the day and the
 * cap against ITS OWN clock. Nothing about a device clock can widen a day.
 *
 * Storage: one KV record `daily:<sub>` (USER_PROGRESS), matching the rest of the
 * worker's per-account state. The record is small and bounded.
 *
 * HARDENING (after an adversarial probe)
 *  - The ledger is created on EVERY sync, so a client cannot opt out of authority
 *    by withholding the `daily` payload.
 *  - The one-time seed is bounded: `totalXp` is clamped and the seeded day history
 *    is capped, so a hostile first sync cannot mint a lifetime total or a
 *    years-long streak.
 *  - An existing ledger accepts a client total only UPWARD and only as fast as the
 *    daily cap times the elapsed days, so no single request can jump the total.
 *  - Concurrent updates for one account are serialized in-isolate; the residual
 *    cross-isolate KV race (loss, never inflation) is recorded in MEMORY.md.
 */

export const DAILY_XP_CAP = 600;
export const FORGIVEN_DAYS = 1;
/** A corrupted history can never make the streak loop forever. */
const MAX_LOOKBACK_DAYS = 730;
/** Newest completed-day keys kept for the streak; ~2 years of daily use. */
export const MAX_EARNED_DAYS = 800;
/**
 * Idempotency window: retried/replayed event ids inside this many ids are dropped.
 * Raised from 400 after the probe showed an attacker could evict a real id with
 * cheap filler events; a re-credit is still bounded by the daily cap.
 */
export const MAX_SEEN_EVENT_IDS = 2000;
/** Hard cap on events processed from one request. */
export const MAX_EVENTS_PER_SYNC = 60;
/** A first-ever ledger can never be seeded above this lifetime total. */
export const SEED_MAX_TOTAL = 1_000_000;
/**
 * A first-ever ledger can never be seeded with a longer streak than this. Chosen
 * well above any realistic streak (the app launched in 2026) but far below a
 * fabricated years-long history.
 */
export const SEED_MAX_STREAK = 400;

const MIN_OFFSET_MINUTES = -720; // UTC-12
const MAX_OFFSET_MINUTES = 840; // UTC+14

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Clamp a client-reported UTC offset to the real range of inhabited timezones. */
export function clampOffset(minutes) {
  const value = Math.round(Number(minutes));
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_OFFSET_MINUTES, Math.max(MIN_OFFSET_MINUTES, value));
}

/** The server's day key: its own clock shifted by the learner's LOCKED offset. */
export function serverDayKey(nowMs, offsetMinutes = 0) {
  const shifted = new Date(Number(nowMs) + clampOffset(offsetMinutes) * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** A local date key shifted by whole days (mirrors the client's `shiftDateKey`). */
export function shiftDayKey(dayKey, deltaDays) {
  const [year, month, day] = String(dayKey || "").split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

/**
 * XP for one finished conversation — the exact twin of the client's
 * `sessionXp` (src/lib/progress/sessionXp.ts). Kept in lockstep by
 * `tests/dailyAuthority.test.ts` so the two rules cannot drift.
 */
export function sessionXpFor(input) {
  const accuracyPercent = Number(input?.accuracyPercent) || 0;
  const assistedSentences = Math.max(0, Math.floor(Number(input?.assistedSentences) || 0));
  const accuracyXp = Math.round(accuracyPercent * 1.5);
  const independenceBonus = assistedSentences === 0 ? 50 : 25;
  const multiplier = input?.mode === "real" ? 1.5 : 1;
  return Math.round((accuracyXp + independenceBonus) * multiplier);
}

/**
 * The forgiven-day streak — the twin of the client's `dailyTaskStreak`
 * (src/lib/daily/tasks.ts). Walks backwards from today (or yesterday while
 * today is still open), forgiving a single missed day inside the run.
 */
export function dailyStreak(input) {
  const completed = new Set((input?.completedDateKeys || []).filter(Boolean));
  const forgivenDays = Math.max(0, Math.floor(input?.forgivenDays ?? FORGIVEN_DAYS));
  const todayKey = String(input?.todayKey || "");
  let cursor = input?.completedToday ? todayKey : shiftDayKey(todayKey, -1);
  let streakDays = 0;
  let gapsUsed = 0;
  let missedDateKey = null;

  for (let step = 0; step < MAX_LOOKBACK_DAYS; step += 1) {
    if (completed.has(cursor)) {
      streakDays += 1;
      cursor = shiftDayKey(cursor, -1);
      continue;
    }
    let gap = 0;
    let probe = cursor;
    while (gap < forgivenDays && !completed.has(probe)) {
      gap += 1;
      probe = shiftDayKey(probe, -1);
    }
    if (gap > 0 && gapsUsed + gap <= forgivenDays && completed.has(probe)) {
      gapsUsed += gap;
      if (missedDateKey === null) missedDateKey = cursor;
      cursor = probe;
      continue;
    }
    break;
  }
  return { streakDays, forgiving: gapsUsed > 0 && streakDays > 0, missedDateKey: missedDateKey };
}

export function allTasksDone(tasks) {
  return Boolean(tasks && tasks.scenario && tasks.grammar && tasks.review);
}

export function emptyDailyState(now, offsetMinutes, totalXp = 0, earnedDayKeys = []) {
  return {
    v: 1,
    offsetMinutes: clampOffset(offsetMinutes),
    dayKey: serverDayKey(now, offsetMinutes),
    xpToday: 0,
    totalXp: Math.max(0, Math.floor(Number(totalXp) || 0)),
    tasks: { scenario: false, grammar: false, review: false },
    earnedDayKeys: [...new Set((earnedDayKeys || []).filter((key) => DAY_RE.test(String(key))))].slice(-MAX_EARNED_DAYS),
    seenEventIds: [],
    updatedAt: Number(now) || Date.now(),
  };
}

/** A day key is only trusted as migration history when it is real and not in the future. */
function saneHistoryDay(key, todayKey, minKey) {
  const value = String(key || "");
  if (!DAY_RE.test(value)) return false;
  if (value > todayKey) return false; // future day — never
  if (value < minKey) return false; // absurdly old — drop
  return true;
}

/**
 * Applies daily events to a state, in place on a copy. Idempotent by event id,
 * so a retried batch (the client's offline queue resends) credits exactly once.
 * Pure enough to unit-test against a fixed `now`.
 */
export function applyDailyEvents(state, events, now = Date.now()) {
  const next = {
    ...state,
    tasks: { ...(state.tasks || {}) },
    earnedDayKeys: [...(state.earnedDayKeys || [])],
    seenEventIds: [...(state.seenEventIds || [])],
  };

  // Day rollover: the SERVER clock (plus the locked offset) decides it. A client
  // timestamp is never consulted for the day.
  const todayKey = serverDayKey(now, next.offsetMinutes);
  if (todayKey !== next.dayKey) {
    next.dayKey = todayKey;
    next.xpToday = 0;
    next.tasks = { scenario: false, grammar: false, review: false };
  }

  const seen = new Set(next.seenEventIds);
  let awarded = 0;
  let cappedTo = null;

  const list = Array.isArray(events) ? events.slice(0, MAX_EVENTS_PER_SYNC) : [];
  for (const event of list) {
    if (!event || typeof event !== "object") continue;
    const id = typeof event.id === "string" ? event.id.slice(0, 64) : "";
    if (!id || id.length < 4) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    next.seenEventIds.push(id);

    if (event.type === "session") {
      const amount = sessionXpFor(event);
      const remaining = Math.max(0, DAILY_XP_CAP - Math.max(0, next.xpToday || 0));
      const paid = Math.min(amount, remaining);
      next.xpToday = Math.max(0, next.xpToday || 0) + paid;
      next.totalXp = Math.max(0, next.totalXp || 0) + paid;
      awarded += paid;
      const refused = amount - paid;
      if (refused > 0) cappedTo = (cappedTo || 0) + refused;
    } else if (event.type === "task") {
      const kind = event.kind;
      if (kind === "scenario" || kind === "grammar" || kind === "review") {
        next.tasks[kind] = true;
      }
    }
  }

  // Bound the idempotency memory (keep the newest).
  if (next.seenEventIds.length > MAX_SEEN_EVENT_IDS) {
    next.seenEventIds = next.seenEventIds.slice(-MAX_SEEN_EVENT_IDS);
  }

  // A day is "earned" the moment all three tasks are complete, and stays earned.
  if (allTasksDone(next.tasks) && !next.earnedDayKeys.includes(next.dayKey)) {
    next.earnedDayKeys.push(next.dayKey);
    if (next.earnedDayKeys.length > MAX_EARNED_DAYS) {
      next.earnedDayKeys = next.earnedDayKeys.slice(-MAX_EARNED_DAYS);
    }
  }

  next.updatedAt = Number(now) || Date.now();
  return { state: next, awarded, cappedTo };
}

/** The authoritative values the client adopts and renders. */
export function dailyResponse(state) {
  const streak = dailyStreak({
    completedDateKeys: state.earnedDayKeys || [],
    todayKey: state.dayKey,
    completedToday: allTasksDone(state.tasks),
  });
  return {
    dayKey: state.dayKey,
    offsetMinutes: state.offsetMinutes,
    xpToday: Math.max(0, Math.floor(state.xpToday || 0)),
    totalXp: Math.max(0, Math.floor(state.totalXp || 0)),
    streakDays: streak.streakDays,
    tasks: {
      scenario: Boolean(state.tasks?.scenario),
      grammar: Boolean(state.tasks?.grammar),
      review: Boolean(state.tasks?.review),
    },
    earnedToday: allTasksDone(state.tasks),
    cap: DAILY_XP_CAP,
    updatedAt: state.updatedAt || 0,
  };
}

export function dailyKey(sub) {
  return `daily:${sub}`;
}

/** Reads the account's ledger, or null when it has never synced one. */
export async function loadDailyState(env, sub) {
  if (!env?.USER_PROGRESS?.get) return null;
  const raw = await env.USER_PROGRESS.get(dailyKey(sub)).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !DAY_RE.test(String(parsed.dayKey || ""))) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveDailyState(env, sub, state) {
  if (!env?.USER_PROGRESS?.put) return;
  await env.USER_PROGRESS.put(dailyKey(sub), JSON.stringify(state));
}

/**
 * Serializes ledger updates per account WITHIN one isolate. The ledger is a KV
 * read-modify-write, so two requests that both read the old state and then write
 * would let the later write drop the earlier one's events (the lost update the
 * adversarial probe found). Queuing them removes that race for every pair of
 * requests this isolate serves. Two requests to DIFFERENT isolates can still
 * race on KV — the residual limit, recorded in MEMORY.md, whose only real fix is
 * a D1/DO compare-and-swap.
 */
const dailyLocks = new Map();
async function withDailyLock(sub, task) {
  const previous = dailyLocks.get(sub) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  dailyLocks.set(sub, current);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (dailyLocks.get(sub) === current) dailyLocks.delete(sub);
  }
}

/**
 * Processes one sync's daily payload and returns the authoritative response.
 *
 * The ledger is created on FIRST sync (with or without a `daily` payload, so a
 * client cannot opt out of authority). On creation it is seeded from the client's
 * current totals and history — bounded, and only day keys that are real, not
 * future and not absurdly old — so an existing learner's XP and streak are not
 * reset when this feature ships. After that client history is ignored: the server
 * owns the day, and only server-observed events advance it (plus one bounded
 * upward reconciliation of the lifetime total, below).
 */
export async function processDailySync(env, sub, payload, now = Date.now()) {
  return withDailyLock(sub, async () => {
    const offsetInput = clampOffset(payload?.offsetMinutes);
    let state = await loadDailyState(env, sub);
    const firstEver = !state;

    if (!state) {
      const seededTotal = Math.min(SEED_MAX_TOTAL, Math.max(0, Math.floor(Number(payload?.totalXp) || 0)));
      const todayKey = serverDayKey(now, offsetInput);
      const history = Array.isArray(payload?.history)
        ? [...new Set(payload.history.filter((key) => saneHistoryDay(key, todayKey, shiftDayKey(todayKey, -MAX_LOOKBACK_DAYS))))]
            .sort()
            .slice(-SEED_MAX_STREAK)
        : [];
      state = emptyDailyState(now, offsetInput, seededTotal, history);
      // Seed today's already-done tasks without granting the day: only when the
      // client's own day agrees with the server's.
      const today = payload?.today;
      if (today && String(today.dateKey) === todayKey) {
        state.tasks = {
          scenario: Boolean(today.scenario),
          grammar: Boolean(today.grammar),
          review: Boolean(today.review),
        };
        if (allTasksDone(state.tasks) && !state.earnedDayKeys.includes(todayKey)) {
          state.earnedDayKeys.push(todayKey);
        }
      }
    }
    // The offset is LOCKED at creation: a later, different device offset is ignored.
    state.offsetMinutes = firstEver ? offsetInput : state.offsetMinutes;

    const priorUpdatedAt = Number(state.updatedAt) || Number(now) || Date.now();
    const { state: applied, awarded, cappedTo } = applyDailyEvents(state, payload?.events, now);

    // Lifetime XP stays monotonic even when a sync carries no events of its own
    // (an old client, or a batch that already drained) WITHOUT letting one request
    // jump it: accept the client's total upward, but never faster than the daily
    // cap times the whole days it could plausibly have earned since the last
    // update. This closes "omit the daily payload and report any number" while
    // still honouring real offline progress.
    const claimed = Math.max(0, Math.floor(Number(payload?.totalXp) || 0));
    if (claimed > applied.totalXp) {
      const elapsedDays = Math.max(1, Math.ceil((Number(now) - priorUpdatedAt) / 86_400_000));
      applied.totalXp = Math.min(claimed, applied.totalXp + DAILY_XP_CAP * elapsedDays);
    }

    await saveDailyState(env, sub, applied);
    return { ...dailyResponse(applied), awarded, cappedTo, createdToday: firstEver };
  });
}

/**
 * Overlays the authoritative XP/streak onto a legacy stats object.
 * Used by `/progress/get` and `/progress/sync` so a client reporting a larger
 * `total_points`/`streak_days` (e.g. after a clock jump) cannot make it stick.
 * `daily` is the response shape from `dailyResponse`/`processDailySync`.
 */
export function overlayStatsWithDaily(stats, daily) {
  if (!daily) return stats || {};
  return {
    ...(stats || {}),
    total_points: Math.max(0, Math.floor(Number(daily.totalXp) || 0)),
    streak_days: Math.max(0, Math.floor(Number(daily.streakDays) || 0)),
  };
}

/**
 * Reads the ledger for a read-only response (`/progress/get`), creating nothing.
 * Returns null when the account has no ledger yet, so old accounts keep their
 * existing stats until their first sync.
 */
export async function readAuthoritativeDaily(env, sub) {
  const state = await loadDailyState(env, sub);
  return state ? dailyResponse(state) : null;
}
