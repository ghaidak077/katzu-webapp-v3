/**
 * Which failed turns are worth retrying without asking the learner.
 *
 * A 429, a timeout or a 5xx from the Worker is not a sentence the learner got
 * wrong — it is the service being busy. Showing them an error card and asking
 * them to press «أعد المحاولة» for something that clears in a second is the
 * slowest possible way to say "wait". So the client retries those codes itself
 * with a short backoff, and only after that does it hand control back: the
 * sentence goes back into the composer (never a duplicate bubble, never a
 * counted turn), and one inline retry stays available.
 *
 * A misconfigured build (`WORKER_URL_MISSING`) is included deliberately: the
 * turn cannot succeed, but the learner's sentence must still not be lost.
 */

/** The one wording that distinguishes "busy" from "your sentence broke". */
export const RATE_LIMIT_MESSAGE_AR =
  'الخدمة مزدحمة الآن قليلاً — جملتك محفوظة في صندوق الكتابة. أعد المحاولة بعد لحظات.';

/**
 * ONE silent automatic retry (2026-11-10), with a short backoff, while the
 * typing indicator is on. The learner should not read an error for a hiccup
 * that clears in a second.
 */
export const TURN_RETRY_DELAYS_MS = [900] as const;

/**
 * A busy service gets TWO more attempts, and those are VISIBLE: a countdown in
 * the composer area, so the wait is something the learner can see instead of an
 * unexplained pause. After the second one the button is theirs again.
 */
export const BUSY_RETRY_DELAYS_SECONDS = [3, 5] as const;

const TRANSIENT_CODES = new Set([
  'RATE_LIMIT_EXCEEDED',
  'REQUEST_TIMEOUT',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'STT_UNAVAILABLE',
  'AI_TURN_HTTP_ERROR',
]);

interface CodedError {
  code?: string;
  status?: number;
}

function statusOf(error: unknown): number {
  const status = Number((error as CodedError)?.status);
  return Number.isFinite(status) ? status : 0;
}

function codeOf(error: unknown): string {
  return String((error as CodedError)?.code || '');
}

/**
 * True when sending the same sentence again can plausibly succeed. Only
 * transport/service failures qualify: a schema rejection (`INVALID_AI_RESPONSE`)
 * or an empty model answer (`AI_EMPTY_REPLY`) is not made better by hammering
 * the same endpoint, so those keep their existing one-tap behaviour.
 */
export function isRetryableTransportFailure(error: unknown): boolean {
  const code = codeOf(error);
  const status = statusOf(error);
  if (code === 'AI_EMPTY_REPLY' || code === 'INVALID_AI_RESPONSE') return false;
  if (code === 'RATE_LIMIT_EXCEEDED') return true;
  if (code === 'REQUEST_TIMEOUT' || code === 'NETWORK_ERROR') return true;
  if (code === 'SERVICE_UNAVAILABLE' || code === 'STT_UNAVAILABLE') return true;
  if (code === 'AI_TURN_HTTP_ERROR') return status >= 500;
  if (TRANSIENT_CODES.has(code)) return true;
  return status === 429 || status === 408 || status >= 500;
}

/** Backoff before the next attempt, or null when the budget is spent. */
export function retryDelayFor(attemptIndex: number): number | null {
  return TURN_RETRY_DELAYS_MS[attemptIndex] ?? null;
}

/**
 * True when the failure should leave no bubble, no counted turn and no error
 * card behind: the sentence returns to the composer instead. This is wider
 * than `isRetryableTransportFailure` on purpose — a build with no Worker URL
 * cannot recover by retrying, but the learner still must not lose the text.
 */
export function shouldRestoreDraft(error: unknown): boolean {
  if (isRetryableTransportFailure(error)) return true;
  const code = codeOf(error);
  return (
    code === 'WORKER_URL_MISSING' ||
    code === 'AI_EMPTY_REPLY' ||
    code === 'INVALID_AI_RESPONSE'
  );
}

/** A pure sleep, injectable so tests do not wait in real time. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}
