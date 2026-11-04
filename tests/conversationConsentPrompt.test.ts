import { describe, expect, it, vi } from 'vitest';
import {
  CONSENT_PROMPT_STORAGE_KEY,
  CONSENT_PROMPT_SUPPRESSION_DAYS,
  readConsentPromptRecord,
  recordConsentAnswer,
  shouldOfferConsentPrompt,
} from '../src/lib/consent/prompt';
import { buildReportExchange } from '../src/lib/conversation/reportExchange';
import { reportConversationExchange } from '../src/lib/api/conversationConsent';
import type { ChatMessage } from '../src/types/models';

/**
 * Timing of the one-time conversation-review question.
 *
 * The product promise is narrow: asked once, after the first FULL practice
 * conversation, never while a session is running and never for a report that
 * was rebuilt from storage. "No" (or closing) is a 60-day suppression, not a
 * permanent answer; the server grant is the only permanent "yes".
 */

const DAY_MS = 86_400_000;

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const allowed = {
  fromRecovered: false,
  completedNaturally: true,
  mode: 'practice',
  sessionsCount: 1,
  available: true,
  granted: false,
  record: null,
};

describe('consent prompt timing', () => {
  it('offers the question only on the first full live practice finish', () => {
    expect(shouldOfferConsentPrompt(allowed)).toBe(true);
    expect(shouldOfferConsentPrompt({ ...allowed, fromRecovered: true })).toBe(false);
    expect(shouldOfferConsentPrompt({ ...allowed, completedNaturally: false })).toBe(false);
    expect(shouldOfferConsentPrompt({ ...allowed, completedNaturally: undefined })).toBe(false);
    expect(shouldOfferConsentPrompt({ ...allowed, mode: 'real' })).toBe(false);
    expect(shouldOfferConsentPrompt({ ...allowed, mode: undefined })).toBe(false);
    expect(shouldOfferConsentPrompt({ ...allowed, sessionsCount: 0 })).toBe(false);
    expect(shouldOfferConsentPrompt({ ...allowed, sessionsCount: 2 })).toBe(false);
    expect(shouldOfferConsentPrompt({ ...allowed, sessionsCount: undefined })).toBe(false);
  });

  it('never asks when the operator switch is off or this account already said yes', () => {
    expect(shouldOfferConsentPrompt({ ...allowed, available: false })).toBe(false);
    expect(shouldOfferConsentPrompt({ ...allowed, granted: true })).toBe(false);
  });

  it('keeps a no suppressed for 60 days, then asks again', () => {
    const storage = memoryStorage();
    const decidedAt = 1_000_000;
    const record = recordConsentAnswer('no', storage, decidedAt);

    expect(record.suppressedUntil).toBe(decidedAt + CONSENT_PROMPT_SUPPRESSION_DAYS * DAY_MS);
    expect(CONSENT_PROMPT_SUPPRESSION_DAYS).toBe(60);
    expect(shouldOfferConsentPrompt({ ...allowed, record, now: decidedAt })).toBe(false);
    expect(
      shouldOfferConsentPrompt({
        ...allowed,
        record,
        now: decidedAt + 59 * DAY_MS,
      }),
    ).toBe(false);
    expect(
      shouldOfferConsentPrompt({
        ...allowed,
        record,
        now: decidedAt + 60 * DAY_MS,
      }),
    ).toBe(true);
  });

  it('treats closing the sheet as no, and yes as permanent locally', () => {
    const closed = recordConsentAnswer('close', memoryStorage(), 5000);
    expect(closed.decision).toBe('no');
    expect(closed.suppressedUntil).not.toBeNull();

    const yes = recordConsentAnswer('yes', memoryStorage(), 5000);
    expect(yes.decision).toBe('yes');
    expect(yes.suppressedUntil).toBeNull();
    expect(shouldOfferConsentPrompt({ ...allowed, record: yes, now: Date.now() })).toBe(false);
  });

  it('persists only a usable decision and ignores corrupt storage', () => {
    const storage = memoryStorage();
    recordConsentAnswer('no', storage, 42);
    const stored = JSON.parse(storage.values.get(CONSENT_PROMPT_STORAGE_KEY) || 'null');
    expect(stored).toMatchObject({ decision: 'no', decidedAt: 42 });
    expect(readConsentPromptRecord(storage)).toMatchObject({ decision: 'no', decidedAt: 42 });

    storage.values.set(CONSENT_PROMPT_STORAGE_KEY, '{not json');
    expect(readConsentPromptRecord(storage)).toBeNull();
    storage.values.set(CONSENT_PROMPT_STORAGE_KEY, JSON.stringify({ decision: 'maybe' }));
    expect(readConsentPromptRecord(storage)).toBeNull();
    expect(readConsentPromptRecord(null)).toBeNull();
  });
});

function message(partial: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'sender' | 'germanText'>): ChatMessage {
  return { ...partial };
}

describe('one report is exactly one exchange', () => {
  const transcript: ChatMessage[] = [
    message({ id: 'open', sender: 'KATZU', germanText: 'Willkommen! Wie heißt du?' }),
    message({ id: 'u1', sender: 'USER', germanText: 'Ich heiße Omar.' }),
    message({ id: 'k1', sender: 'KATZU', germanText: 'Freut mich, Omar.' }),
    message({ id: 'u2', sender: 'USER', germanText: 'Ich komme aus Berlin.' }),
    message({ id: 'k2', sender: 'KATZU', germanText: 'Sehr gut!' }),
  ];

  it('pairs the reported reply with the learner sentence that prompted it', () => {
    expect(buildReportExchange(transcript, 'k2')).toEqual({
      learnerText: 'Ich komme aus Berlin.',
      replyText: 'Sehr gut!',
      turnIndex: 3,
    });
  });

  it('cannot report an opener or a turn with no learner sentence', () => {
    expect(buildReportExchange(transcript, 'open')).toBeNull();
    expect(buildReportExchange(transcript, 'missing')).toBeNull();
    expect(
      buildReportExchange(
        [message({ id: 'u1', sender: 'USER', germanText: 'Hallo' }), message({ id: 'k1', sender: 'KATZU', germanText: 'Hi' })],
        'u1',
      ),
    ).toBeNull();
  });

  it('refuses a failed learner turn rather than sending what was never accepted', () => {
    const withFailure: ChatMessage[] = [
      message({ id: 'u1', sender: 'USER', germanText: 'Ich habe...', sendFailed: true }),
      message({ id: 'k1', sender: 'KATZU', germanText: 'Noch einmal?' }),
    ];
    expect(buildReportExchange(withFailure, 'k1')).toBeNull();
  });

  it('does not reach past the nearest learner sentence', () => {
    const many: ChatMessage[] = [
      message({ id: 'u1', sender: 'USER', germanText: 'Erste.' }),
      message({ id: 'k1', sender: 'KATZU', germanText: 'Antwort.' }),
      message({ id: 'u2', sender: 'USER', germanText: '  Zweite.  ' }),
      message({ id: 'k2', sender: 'KATZU', germanText: '  Gut.  ' }),
    ];
    expect(buildReportExchange(many, 'k2')).toEqual({
      learnerText: 'Zweite.',
      replyText: 'Gut.',
      turnIndex: 2,
    });
  });
});

describe('report client', () => {
  const client = {
    getBaseUrl: () => 'https://worker.test',
    getEffectiveAuthToken: async () => 'session-token',
  };

  it('sends exactly one request with only the redactable exchange', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await reportConversationExchange(client, {
      learnerText: 'Ich heiße Omar.',
      replyText: 'Freut mich!',
      scenarioId: 'cafe',
      cefrLevel: 'A1',
      turnIndex: 2,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://worker.test/consent/conversation/report');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      learner_text: 'Ich heiße Omar.',
      reply_text: 'Freut mich!',
      scenario_id: 'cafe',
      cefr_level: 'A1',
      turn_index: 2,
    });
  });

  it('sends nothing when there is no session token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await reportConversationExchange(
      { ...client, getEffectiveAuthToken: async () => '' },
      { learnerText: 'A', replyText: 'B' },
    );
    expect(result).toEqual({ ok: false, error: 'unauthenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
