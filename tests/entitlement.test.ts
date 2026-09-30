import { describe, expect, it } from 'vitest';
import { completedEpisodeCount, isLevelFree, servedLevel, shouldOfferPro } from '../src/lib/entitlement/trial';
import type { CEFRLevel, SessionEntity } from '../src/types/models';

const session = (sentencesSpoken: number): Pick<SessionEntity, 'sentencesSpoken'> => ({ sentencesSpoken });

describe('completedEpisodeCount', () => {
  it('counts only conversations the learner actually spoke in', () => {
    expect(completedEpisodeCount([session(3), session(0), session(1)])).toBe(2);
    expect(completedEpisodeCount([])).toBe(0);
    // A malformed row must not be counted as a finished episode.
    expect(completedEpisodeCount([{ sentencesSpoken: Number.NaN }])).toBe(0);
  });
});

describe('shouldOfferPro', () => {
  // The regression this rule exists for: a learner on day one must never meet a
  // wall before they have experienced the product once.
  it('never offers before a real episode, at any level', () => {
    expect(shouldOfferPro({ isPro: false, completedEpisodes: 0 })).toBe(false);
  });

  it('offers after the first completed episode', () => {
    expect(shouldOfferPro({ isPro: false, completedEpisodes: 1 })).toBe(true);
    expect(shouldOfferPro({ isPro: false, completedEpisodes: 7 })).toBe(true);
  });

  it('never offers to someone who already pays', () => {
    expect(shouldOfferPro({ isPro: true, completedEpisodes: 5 })).toBe(false);
  });
});

describe('isLevelFree', () => {
  // The boundary belongs to the Worker (`checkUserEntitlement`), which serves
  // the free floor (A0 and A1) and refuses every other level — so anything this
  // answers `true` for is a promise the server has to keep.
  it('covers exactly the levels the trial serves', () => {
    expect(isLevelFree('A0', false)).toBe(true);
    expect(isLevelFree('A1', false)).toBe(true);
    expect(isLevelFree('A2', false)).toBe(false);
    expect(isLevelFree('B1', false)).toBe(false);
    expect(isLevelFree('B2', false)).toBe(false);
  });

  it('opens every level to Pro', () => {
    expect(isLevelFree('B2', true)).toBe(true);
    expect(isLevelFree('A0', true)).toBe(true);
    expect(isLevelFree('A1', true)).toBe(true);
  });
});

describe('servedLevel', () => {
  it('gives a free learner an A1 episode even when the placement measured higher', () => {
    expect(servedLevel('A2', false)).toBe('A1');
    expect(servedLevel('B2', false)).toBe('A1');
  });

  // V21 Phase 1: the free floor is A0 AND A1. Serving A1 to a learner the
  // placement measured at A0 would hand them German above their measurement —
  // exactly the wall this function exists to prevent, just from below.
  it('serves a measured-A0 learner at A0 instead of pushing them up to A1', () => {
    expect(servedLevel('A0', false)).toBe('A0');
    expect(servedLevel('A0', true)).toBe('A0');
  });

  it('runs a Pro learner at their own level', () => {
    expect(servedLevel('B1', true)).toBe('B1');
    // Nothing measured yet is the one case A1 is the honest answer for.
    expect(servedLevel(undefined, true)).toBe('A1');
  });

  /**
   * The invariant that keeps a first episode finishable: whatever level an AI
   * session is built at, entitlement allows it. A free A2 learner used to be
   * scheduled an A2 episode the Worker refuses, which put the paywall on the first
   * turn of their first mission — and made writing unusable for them.
   */
  it('never builds a session at a level the entitlement check would refuse', () => {
    const levels: CEFRLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2'];
    for (const level of levels) {
      expect(isLevelFree(servedLevel(level, false), false)).toBe(true);
    }
  });
});
