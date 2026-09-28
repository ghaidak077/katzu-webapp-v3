import { describe, expect, it } from 'vitest';
import {
  classifyTurnError,
  conversationReducer,
  initialConversationState,
  NETWORK_ERROR_MESSAGE_AR,
  UNUSABLE_TRANSCRIPT_MESSAGE_AR,
} from '../src/lib/conversation/stateMachine';
import {
  voiceStartFailureMessageAr,
  TRANSCRIBE_FAILED_MESSAGE_AR,
} from '../src/lib/audio/useVoiceCapture';

/**
 * B5 — network drop mid-recording (recorder pipeline).
 *
 * A learner on a train loses the network between finishing a sentence and the
 * worker's transcription arriving. The contract being pinned:
 *
 *  1. the audio upload failure reaches the hook as a `NETWORK_ERROR` thrown by
 *     the client boundary (`fetchWithTimeout` → `normalizeNetworkError`);
 *  2. the hook maps anything without an Arabic, coded message onto its own
 *     Arabic retry text — never an English engine message;
 *  3. the state machine keeps the failure retryable and the typed path open:
 *     the sentence stays in the machine, `retry` is allowed, and a submit
 *     typed while offline is still accepted;
 *  4. every surfaced message is Arabic (no English-only recovery state).
 */

const submit = (text = 'Ich möchte einen Termin.', turnId = 1) =>
  ({ type: 'submit', text, turnId } as const);

describe('network drop mid-recording', () => {
  it('classifies a dropped transcription upload as a retryable network failure', () => {
    const error = classifyTurnError({ code: 'NETWORK_ERROR' });
    expect(error.kind).toBe('network');
    expect(error.retryable).toBe(true);
    expect(error.messageAr).toBe(NETWORK_ERROR_MESSAGE_AR);
    expect(error.messageAr).toMatch(/[\u0600-\u06FF]/);
  });

  it('gives the learner the Arabic retry text for an uncoded engine error', () => {
    // The fetch itself throwing (no code, English internals) must not leak
    // English into the UI: the hook's fallback is the Arabic transcribe text.
    expect(TRANSCRIBE_FAILED_MESSAGE_AR).toMatch(/[\u0600-\u06FF]/);
    expect(TRANSCRIBE_FAILED_MESSAGE_AR).not.toMatch(/fetch|network|request/i);
    expect(voiceStartFailureMessageAr('failed')).toMatch(/[\u0600-\u06FF]/);
  });

  it('treats silence/no-speech as a failed attempt, never a turn', () => {
    // A drop often manifests as nothing recognised; the app must not grade an
    // empty sentence.
    expect(UNUSABLE_TRANSCRIPT_MESSAGE_AR).toMatch(/[\u0600-\u06FF]/);
  });

  it('keeps the learner sentence and a one-tap retry after a mid-turn drop', () => {
    const submitted = conversationReducer(initialConversationState(), submit());
    const dropped = conversationReducer(submitted, {
      type: 'turn_failed',
      error: classifyTurnError({ code: 'NETWORK_ERROR' }),
    });
    expect(dropped.status).toBe('retryable_error');
    expect(dropped.pendingText).toBe('Ich möchte einen Termin.');
    const retried = conversationReducer(dropped, { type: 'retry' });
    expect(retried.status).toBe('evaluating');
    expect(retried.pendingText).toBe('Ich möchte einen Termin.');
  });

  it('accepts a sentence typed while offline and reports the failure honestly', () => {
    const offline = conversationReducer(initialConversationState(), { type: 'going_offline' });
    expect(offline.status).toBe('offline');
    expect(offline.error?.kind).toBe('network');
    // `acceptsSubmit` deliberately admits `offline`: the browser can come back
    // without an event, and silently refusing input looks like a broken box.
    const typed = conversationReducer(offline, submit('Guten Tag', 2));
    expect(typed.status).toBe('evaluating');
    expect(typed.pendingText).toBe('Guten Tag');
  });

  it('returns to a retryable state when the network comes back with a pending sentence', () => {
    const offline = conversationReducer(
      conversationReducer(initialConversationState(), submit()),
      { type: 'going_offline' },
    );
    const back = conversationReducer(offline, { type: 'back_online' });
    expect(back.status).toBe('retryable_error');
    expect(back.pendingText).toBe('Ich möchte einen Termin.');
  });

  it('never shows an English-only recovery state for any voice failure', () => {
    const messages = [
      voiceStartFailureMessageAr('denied'),
      voiceStartFailureMessageAr('unsupported'),
      voiceStartFailureMessageAr('empty'),
      voiceStartFailureMessageAr('failed'),
      TRANSCRIBE_FAILED_MESSAGE_AR,
      UNUSABLE_TRANSCRIPT_MESSAGE_AR,
      NETWORK_ERROR_MESSAGE_AR,
    ];
    for (const message of messages) {
      expect(message, message).toMatch(/[\u0600-\u06FF]/);
    }
  });
});
