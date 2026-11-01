import { beforeEach, describe, expect, it } from 'vitest';
import {
  acquireUpdateHold,
  applyPendingUpdate,
  dismissUpdate,
  getUpdatePromptSnapshot,
  resetUpdatePromptForTests,
  subscribeUpdatePrompt,
} from '../src/lib/pwa/updatePrompt';

/**
 * The update banner is the only thing standing between a deploy and an
 * in-progress conversation, which lives in React state until the session ends.
 * These tests pin the two rules that protect it: the store starts hidden, and a
 * hold blocks the update until every holder has released.
 */
describe('service-worker update prompt', () => {
  beforeEach(() => resetUpdatePromptForTests());

  it('starts hidden, with nothing to apply', async () => {
    expect(getUpdatePromptSnapshot()).toEqual({
      available: false,
      applying: false,
      held: false,
      dismissed: false,
    });
    await expect(applyPendingUpdate()).resolves.toBe(false);
  });

  it('blocks the update while a conversation holds it', () => {
    const release = acquireUpdateHold();
    expect(getUpdatePromptSnapshot().held).toBe(true);
    // The banner's only action must refuse while the hold is live, even if a
    // worker were waiting: a reload here would discard unsent messages.
    return expect(applyPendingUpdate()).resolves.toBe(false).then(() => {
      release();
      expect(getUpdatePromptSnapshot().held).toBe(false);
    });
  });

  it('keeps the hold until the last holder releases', () => {
    const first = acquireUpdateHold();
    const second = acquireUpdateHold();
    first();
    first(); // idempotent: a double effect cleanup must not release someone else
    expect(getUpdatePromptSnapshot().held).toBe(true);
    second();
    expect(getUpdatePromptSnapshot().held).toBe(false);
    second();
    expect(getUpdatePromptSnapshot().held).toBe(false);
  });

  it('tells subscribers about every change', () => {
    let calls = 0;
    const unsubscribe = subscribeUpdatePrompt(() => {
      calls += 1;
    });
    const release = acquireUpdateHold();
    release();
    dismissUpdate();
    expect(calls).toBe(3);
    unsubscribe();
    acquireUpdateHold()();
    expect(calls).toBe(3);
  });
});
