/**
 * What a failed turn says — the ONLY three sentences, one per cause.
 *
 * The persona never speaks when the model did not. These are the only fixed
 * strings a failed turn may show, and none of them is in character: they sit in
 * the composer area, under the sentence the learner still has, and offer a next
 * action. The owner's exact wording, one line each (see the 2026-11-10
 * amendment): offline, busy, other.
 *
 * `failureCauseOf` is deliberately small and deterministic: it decides which of
 * the three sentences is true, and nothing else. It never decides what the
 * persona says — there is nothing authored for the persona to say.
 */

export const OFFLINE_MESSAGE_AR =
  'لا يوجد اتصال بالإنترنت. المحادثة تحتاج إنترنت. اتصل ثم اضغط إعادة المحاولة.';

export const BUSY_MESSAGE_AR = 'الخدمة مشغولة الآن. سنعيد المحاولة بعد لحظات.';

export const OTHER_MESSAGE_AR = 'تعذّر الرد. أعد المحاولة.';

export type TurnFailureCause = 'offline' | 'busy' | 'other';

interface CodedFailure {
  code?: string;
  status?: number;
}

/**
 * offline: there is no network at all (browser offline, or the transport could
 *          not reach the Worker).
 * busy:    the service answered "not now" (429 / rate limit / 503).
 * other:   everything else — a timeout past the budget, an invalid model
 *          answer, a provider failure.
 */
export function failureCauseOf(error: unknown): TurnFailureCause {
  const offline =
    typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline) return 'offline';
  const code = String((error as CodedFailure)?.code || '');
  const status = Number((error as CodedFailure)?.status) || 0;
  if (code === 'NETWORK_ERROR' || code === 'WORKER_URL_MISSING') return 'offline';
  if (
    code === 'RATE_LIMIT_EXCEEDED' ||
    code === 'SERVICE_UNAVAILABLE' ||
    status === 429 ||
    status === 503
  ) {
    return 'busy';
  }
  return 'other';
}

/** The one sentence for a cause. */
export function messageForCause(cause: TurnFailureCause): string {
  switch (cause) {
    case 'offline':
      return OFFLINE_MESSAGE_AR;
    case 'busy':
      return BUSY_MESSAGE_AR;
    default:
      return OTHER_MESSAGE_AR;
  }
}
