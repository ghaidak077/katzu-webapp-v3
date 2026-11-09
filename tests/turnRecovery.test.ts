import { describe, expect, it } from 'vitest';
import {
  isRetryableTransportFailure,
  retryDelayFor,
  RATE_LIMIT_MESSAGE_AR,
  shouldRestoreDraft,
} from '@/lib/conversation/turnRecovery';

describe('turn recovery', () => {
  it('retries rate limits, timeouts, network and service failures', () => {
    for (const code of [
      'RATE_LIMIT_EXCEEDED',
      'REQUEST_TIMEOUT',
      'NETWORK_ERROR',
      'SERVICE_UNAVAILABLE',
    ]) {
      expect(isRetryableTransportFailure({ code })).toBe(true);
      expect(shouldRestoreDraft({ code })).toBe(true);
    }
  });

  it('retries 5xx HTTP failures but not a 400', () => {
    expect(isRetryableTransportFailure({ code: 'AI_TURN_HTTP_ERROR', status: 502 })).toBe(true);
    expect(isRetryableTransportFailure({ code: 'AI_TURN_HTTP_ERROR', status: 500 })).toBe(true);
    expect(isRetryableTransportFailure({ code: 'AI_TURN_HTTP_ERROR', status: 400 })).toBe(false);
    expect(isRetryableTransportFailure({ status: 429 })).toBe(true);
  });

  it('does not auto-retry an empty or malformed model answer', () => {
    expect(isRetryableTransportFailure({ code: 'AI_EMPTY_REPLY', status: 502 })).toBe(false);
    expect(isRetryableTransportFailure({ code: 'INVALID_AI_RESPONSE', status: 502 })).toBe(false);
  });

  it('still restores the learner sentence when a retry cannot help', () => {
    // A build without a Worker URL cannot succeed, but the text is not lost.
    expect(shouldRestoreDraft({ code: 'WORKER_URL_MISSING' })).toBe(true);
    expect(shouldRestoreDraft({ code: 'AI_EMPTY_REPLY' })).toBe(true);
    expect(shouldRestoreDraft({ code: 'PAYWALL_REQUIRED' })).toBe(false);
    expect(shouldRestoreDraft({ code: 'UNAUTHENTICATED' })).toBe(false);
  });

  it('spends two backoff delays and then stops', () => {
    expect(retryDelayFor(0)).toBe(1200);
    expect(retryDelayFor(1)).toBe(3200);
    expect(retryDelayFor(2)).toBeNull();
  });

  it('has its own Arabic wording for a busy service', () => {
    expect(RATE_LIMIT_MESSAGE_AR).toContain('مزدحمة');
    expect(RATE_LIMIT_MESSAGE_AR).toContain('جملتك');
  });
});
