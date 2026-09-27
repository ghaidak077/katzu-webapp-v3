import { describe, expect, it } from 'vitest';
import {
  classifyTurnError,
  conversationReducer,
  initialConversationState,
  isTurnInFlight,
  isUsableTranscript,
  type ConversationEvent,
  type ConversationState,
} from '../src/lib/conversation/stateMachine';

function run(events: ConversationEvent[], from: ConversationState = initialConversationState()): ConversationState {
  return events.reduce(conversationReducer, from);
}

const submit = (text = 'Ich möchte einen Termin.', turnId = 1): ConversationEvent => ({ type: 'submit', text, turnId });

describe('conversation state machine', () => {
  it('starts idle with nothing pending', () => {
    const state = initialConversationState();
    expect(state.status).toBe('idle');
    expect(state.pendingText).toBeNull();
    expect(isTurnInFlight(state)).toBe(false);
  });

  it('runs a turn: submit → evaluating → feedback', () => {
    const state = run([submit(), { type: 'turn_ok' }]);
    expect(state.status).toBe('showing_feedback');
    expect(state.pendingText).toBeNull();
  });

  it('ignores a second submit while a turn is in flight (double-click safety)', () => {
    const first = run([submit('Erster Satz.', 1)]);
    const second = conversationReducer(first, submit('Zweiter Satz.', 2));
    expect(second.status).toBe('evaluating');
    expect(second.pendingText).toBe('Erster Satz.');
    expect(second.turnId).toBe(1);
    expect(second.attempts).toBe(1);
  });

  it('ignores an empty submit', () => {
    expect(run([submit('   ')]).status).toBe('idle');
  });

  it('preserves the learner’s sentence across a retryable failure', () => {
    const failed = run([
      submit('Ich habe 25 Jahre.'),
      { type: 'turn_failed', error: classifyTurnError({ code: 'REQUEST_TIMEOUT' }) },
    ]);
    expect(failed.status).toBe('retryable_error');
    expect(failed.pendingText).toBe('Ich habe 25 Jahre.');
    expect(failed.error?.kind).toBe('network');
    expect(failed.error?.retryable).toBe(true);

    const retried = conversationReducer(failed, { type: 'retry' });
    expect(retried.status).toBe('evaluating');
    expect(retried.pendingText).toBe('Ich habe 25 Jahre.');
    expect(retried.attempts).toBe(2);
  });

  it('does not allow a retry when no turn is pending', () => {
    expect(conversationReducer(initialConversationState(), { type: 'retry' }).status).toBe('idle');
  });

  it('does not auto-retry a terminal quota failure', () => {
    const failed = run([submit(), { type: 'turn_failed', error: classifyTurnError({ code: 'PAYWALL_REQUIRED' }) }]);
    expect(failed.status).toBe('retryable_error');
    expect(failed.error?.retryable).toBe(false);
    expect(conversationReducer(failed, { type: 'retry' }).status).toBe('retryable_error');
  });

  it('marks quota exhaustion as terminal for the session', () => {
    const state = run([submit(), { type: 'quota_exhausted' }]);
    expect(state.status).toBe('quota_exhausted');
    expect(isTurnInFlight(state)).toBe(false);
    // The sentence that triggered it is still available to the screen.
    expect(state.pendingText).toBe('Ich möchte einen Termin.');
    expect(conversationReducer(state, submit('Noch eins.', 9)).status).toBe('quota_exhausted');
  });

  it('reports a denied microphone as retryable, with typing still available', () => {
    const state = run([{ type: 'start_recording' }, { type: 'mic_denied' }]);
    expect(state.status).toBe('retryable_error');
    expect(state.error?.kind).toBe('mic_permission');
    expect(state.error?.messageAr).toContain('اكتب');
  });

  it('reports a speech-recognition timeout without losing the turn', () => {
    const state = run([{ type: 'start_recording' }, { type: 'stop_recording' }, { type: 'speech_failed' }]);
    expect(state.status).toBe('retryable_error');
    expect(state.error?.kind).toBe('speech_recognition');
    expect(conversationReducer(state, { type: 'dismiss_error' }).status).toBe('idle');
  });

  it('survives going offline mid-turn and returns to a retryable state', () => {
    const offline = run([submit(), { type: 'going_offline' }]);
    expect(offline.status).toBe('offline');
    expect(offline.pendingText).toBe('Ich möchte einen Termin.');
    const back = conversationReducer(offline, { type: 'back_online' });
    expect(back.status).toBe('retryable_error');
    expect(conversationReducer(back, { type: 'retry' }).status).toBe('evaluating');
  });

  it('accepts a sentence typed while offline and reports the network failure honestly', () => {
    const offline = conversationReducer(initialConversationState(), { type: 'going_offline' });
    expect(offline.status).toBe('offline');
    expect(offline.error?.kind).toBe('network');
    const submitted = conversationReducer(offline, submit('Entschuldigung, wo ist der Bahnhof?'));
    expect(submitted.status).toBe('evaluating');
    const backOnline = conversationReducer(
      { ...submitted, status: 'offline' },
      { type: 'back_online' },
    );
    expect(backOnline.status).toBe('retryable_error');
  });

  it('returns straight to idle when connectivity returns with nothing pending', () => {
    const offline = conversationReducer(initialConversationState(), { type: 'going_offline' });
    expect(conversationReducer(offline, { type: 'back_online' }).status).toBe('idle');
  });

  it('keeps the in-flight turn after the browser backgrounds the page', () => {
    const state = run([submit('Guten Tag!'), { type: 'backgrounded' }]);
    expect(state.status).toBe('evaluating');
    expect(state.backgrounded).toBe(true);
    // A failed request while hidden still surfaces a retry with the text kept.
    const failed = conversationReducer(state, {
      type: 'turn_failed',
      error: classifyTurnError({ code: 'NETWORK_ERROR' }),
    });
    expect(failed.status).toBe('retryable_error');
    expect(failed.pendingText).toBe('Guten Tag!');
    expect(conversationReducer(failed, { type: 'foregrounded' }).backgrounded).toBe(false);
  });

  it('completes a session and refuses further turns', () => {
    const done = run([submit(), { type: 'turn_ok' }, { type: 'complete' }]);
    expect(done.status).toBe('completed');
    expect(conversationReducer(done, submit('Noch eine Frage.', 3)).status).toBe('completed');
  });

  it('classifies worker errors into actionable kinds', () => {
    expect(classifyTurnError({ code: 'PAYWALL_REQUIRED' }).kind).toBe('quota');
    expect(classifyTurnError({ code: 'invalid_id_token' }).kind).toBe('invalid_session');
    expect(classifyTurnError({ code: 'NETWORK_ERROR' }).retryable).toBe(true);
    expect(classifyTurnError({ code: 'AI_EMPTY_REPLY' }).kind).toBe('ai_service');
    expect(classifyTurnError(new Error('boom')).retryable).toBe(true);
  });
});

describe('isUsableTranscript', () => {
  it('rejects what recognition returns when it fires on noise', () => {
    // Sending any of these as a turn would spend a model call evaluating a
    // sentence the learner never said.
    expect(isUsableTranscript('')).toBe(false);
    expect(isUsableTranscript(undefined)).toBe(false);
    expect(isUsableTranscript('   ')).toBe(false);
    expect(isUsableTranscript('a')).toBe(false);
    expect(isUsableTranscript('-')).toBe(false);
    expect(isUsableTranscript('...')).toBe(false);
  });

  it('accepts a real attempt, in either language the learner may speak', () => {
    expect(isUsableTranscript('Ja')).toBe(true);
    expect(isUsableTranscript('Ich möchte einen Termin')).toBe(true);
    expect(isUsableTranscript('Guten Tag!')).toBe(true);
    expect(isUsableTranscript('نعم')).toBe(true);
  });
});
