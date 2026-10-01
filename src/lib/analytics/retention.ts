/**
 * Retention return-events (V24 Phase 7) — deterministic and privacy-safe.
 *
 * The product question: does a learner come back on day 1 and day 7? The event
 * is a bare allow-listed name with no properties — no timestamps leave the
 * device, no identifiers beyond the envelope the analytics contract already
 * carries (anonymous install id, optional account hash).
 *
 * "Day N" is a calendar-day distance in LOCAL time from the anchor (install
 * day or first-activity day), so DST and late-evening sessions cannot produce
 * a false "day 1". Each marker fires at most once — the same localStorage
 * one-shot flag pattern the analytics queue already uses.
 *
 * Pure functions only: everything here is unit-testable without a browser;
 * the two storage-backed helpers (`recordFirstSeen`, `trackRetentionReturns`)
 * are the only imperative surface and never throw.
 */

import { track } from './client';

/** Which day-distances the product tracks (extendable, e.g. day7 later). */
export const RETURN_DAY_MARKERS = [1, 7] as const;

export type ReturnDayMarker = (typeof RETURN_DAY_MARKERS)[number];

/** Local calendar-day key, e.g. "2026-10-01". Not sent anywhere by itself. */
export function localDayKey(ts: number): string {
  const d = new Date(ts);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Whole calendar days from `fromTs` to `toTs` in local time (negative if earlier). */
export function calendarDaysBetween(fromTs: number, toTs: number): number {
  const from = new Date(fromTs);
  const to = new Date(toTs);
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((toMidnight - fromMidnight) / 86_400_000);
}

/**
 * Which return markers does this visit satisfy?
 * A marker fires when the calendar-day distance from the anchor is exactly N
 * or the first missed day after it (a learner who skips day 1 and returns on
 * day 2 still counts as "came back after day 1" once) — but never twice.
 */
export function returnMarkersForVisit(anchorTs: number, visitTs: number, firedMarkers: readonly number[]): ReturnDayMarker[] {
  const fired = new Set(firedMarkers);
  const days = calendarDaysBetween(anchorTs, visitTs);
  const due: ReturnDayMarker[] = [];
  for (const marker of RETURN_DAY_MARKERS) {
    if (fired.has(marker)) continue;
    // The marker's window closes once the NEXT marker's day arrives — day 1 is
    // still "due" on day 2 (the learner came back), but never on day 7+.
    const nextMarker = RETURN_DAY_MARKERS.find((m) => m > marker);
    const windowEnd = nextMarker ?? marker + 1;
    if (days >= marker && days < windowEnd) due.push(marker);
  }
  return due;
}

/** The storage keys for the one-shot flags and the anchor. */
export function returnMarkerFlagKey(marker: ReturnDayMarker): string {
  return `katzu_retention_return_day${marker}_sent`;
}

export const RETURN_ANCHOR_KEY = 'katzu_retention_first_seen';

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
    /* private mode: retention markers silently degrade to no-ops */
  }
}

/**
 * Records the first-seen anchor once. Called from the same install path that
 * mints the analytics install id; an existing anchor is never moved.
 */
export function recordFirstSeen(now = Date.now()): void {
  if (safeRead(RETURN_ANCHOR_KEY)) return;
  safeWrite(RETURN_ANCHOR_KEY, String(now));
}

/**
 * Called on app entry. Fires each due, not-yet-sent return marker exactly
 * once via the standard `track` path (allow-listed names, no properties),
 * then flags it locally. Never throws. The emitter is injectable so tests can
 * observe the emission without the dev-build suppression the real `track`
 * applies inside `vitest`.
 */
export function trackRetentionReturns(
  now = Date.now(),
  emit: (name: 'return_day1' | 'return_day7') => void = track,
): void {
  const anchorRaw = safeRead(RETURN_ANCHOR_KEY);
  if (!anchorRaw) {
    recordFirstSeen(now);
    return;
  }
  const anchor = Number(anchorRaw);
  if (!Number.isFinite(anchor)) return;

  const fired = RETURN_DAY_MARKERS.filter((m) => safeRead(returnMarkerFlagKey(m)) === '1');
  const due = returnMarkersForVisit(anchor, now, fired);
  for (const marker of due) {
    try {
      emit(marker === 1 ? 'return_day1' : 'return_day7');
      safeWrite(returnMarkerFlagKey(marker), '1');
    } catch {
      /* a failed marker is retried on the next visit — never fatal */
    }
  }
}
