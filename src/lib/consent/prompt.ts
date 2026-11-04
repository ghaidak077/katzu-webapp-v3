/**
 * When the conversation-review consent sheet is allowed to appear.
 *
 * The sheet is offered exactly once, after the learner's first FULL practice
 * conversation has finished and the report screen is on screen. It must never
 * appear during a conversation, before the finish line, or after a session that
 * was rebuilt from storage rather than finished live.
 *
 * Saying "no" (or closing the sheet, which is the same answer) is not permanent:
 * it suppresses the question for 60 days. Saying "yes" is permanent — the grant
 * itself lives on the server, so this record only stops the question repeating.
 *
 * Kept pure so the timing and the 60-day rule are unit-tested independently of
 * React. Storage is injected for the same reason; a browser without usable
 * storage simply falls back to "no record", and the caller must still gate the
 * sheet on the server's own consent state.
 */

export const CONSENT_PROMPT_STORAGE_KEY = 'katzu:conversation-consent-prompt:v1';
export const CONSENT_PROMPT_SUPPRESSION_DAYS = 60;
const DAY_MS = 86_400_000;

export type ConsentPromptAnswer = 'yes' | 'no' | 'close';

export interface ConsentPromptRecord {
  decision: 'yes' | 'no';
  decidedAt: number;
  /** Only set for "no"/close: the question may return after this timestamp. */
  suppressedUntil: number | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Storage can throw (privacy mode, blocked cookies). No record is honest.
    return null;
  }
}

/** Read the stored decision, or null when there is none or it is unusable. */
export function readConsentPromptRecord(
  storage: StorageLike | null = defaultStorage(),
): ConsentPromptRecord | null {
  if (!storage?.getItem) return null;
  try {
    const raw = storage.getItem(CONSENT_PROMPT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentPromptRecord> | null;
    if (!parsed || (parsed.decision !== 'yes' && parsed.decision !== 'no')) return null;
    if (!Number.isFinite(parsed.decidedAt)) return null;
    const suppressedUntil =
      typeof parsed.suppressedUntil === 'number' && Number.isFinite(parsed.suppressedUntil)
        ? parsed.suppressedUntil
        : null;
    return { decision: parsed.decision, decidedAt: Number(parsed.decidedAt), suppressedUntil };
  } catch {
    return null;
  }
}

/** Persist the learner's answer. Never throws: the sheet must still close. */
export function recordConsentAnswer(
  answer: ConsentPromptAnswer,
  storage: StorageLike | null = defaultStorage(),
  now = Date.now(),
): ConsentPromptRecord {
  const record: ConsentPromptRecord =
    answer === 'yes'
      ? { decision: 'yes', decidedAt: now, suppressedUntil: null }
      : {
          decision: 'no',
          decidedAt: now,
          suppressedUntil: now + CONSENT_PROMPT_SUPPRESSION_DAYS * DAY_MS,
        };
  try {
    storage?.setItem?.(CONSENT_PROMPT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // The server remains the source of truth; a failed local write only means
    // the question might be asked again, never that anything was stored.
  }
  return record;
}

export interface ConsentPromptConditions {
  /** The report was rebuilt from storage, not reached by finishing live. */
  fromRecovered: boolean;
  /** True only when the live conversation reached its full turn target. */
  completedNaturally: boolean | undefined;
  /** Practice mode, not the unaided REAL mode. */
  mode: string | undefined;
  /** Number of saved sessions, or undefined while the count is still loading. */
  sessionsCount: number | undefined;
  /** The operator switch; false means the product cannot honour a yes. */
  available: boolean;
  /** This account's existing grant — a yes is never asked for twice. */
  granted: boolean;
  record: ConsentPromptRecord | null;
  now?: number;
}

/**
 * The single gate. Anything uncertain (count still loading, consent status not
 * read, a recovered report) is "no": an extra question is worse than a missing
 * one, and the Settings toggle is always available as the explicit path.
 */
export function shouldOfferConsentPrompt({
  fromRecovered,
  completedNaturally,
  mode,
  sessionsCount,
  available,
  granted,
  record,
  now = Date.now(),
}: ConsentPromptConditions): boolean {
  if (fromRecovered) return false;
  if (sessionsCount !== 1) return false;
  if (completedNaturally !== true) return false;
  if (mode !== 'practice') return false;
  if (!available || granted) return false;
  if (!record) return true;
  if (record.decision === 'yes') return false;
  return record.suppressedUntil === null ? false : now >= record.suppressedUntil;
}
