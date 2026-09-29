import { describe, expect, it } from 'vitest';
import { openerForLevel, rankHintFloor, storedOpenerArabic } from '../src/lib/conversation/opener';

/**
 * V19 Phase 2 — the opener gloss and the hint floor, both offline and pure.
 *
 * Two measured defects live here as regression cases:
 *  1. The opener's Arabic cost an AI call per screen-open (Phase 0 probe: one
 *     POST /ai/translate before any learner message). The gloss is now stored
 *     data; the tests pin the lookup and the honest-null fallback.
 *  2. The hint floor ignored the last AI message (the opener asked
 *     "Fehlt Ihr Koffer?" and the floor offered "Hier ist mein Pass."). The
 *     ranking must put a plausible ANSWER first — the exact observed pair is
 *     the first regression case below.
 */

describe('openerForLevel', () => {
  const scenario = {
    initial_message_a1: 'A1 text',
    initial_message_a2: 'A2 text',
    initial_message_b1: 'B1 text',
    initial_message_b2: 'B2 text',
  };

  it('serves the level the episode runs at', () => {
    expect(openerForLevel(scenario, 'A1')).toBe('A1 text');
    expect(openerForLevel(scenario, 'B2')).toBe('B2 text');
  });

  it('falls back down the level ladder instead of serving an empty opener', () => {
    expect(openerForLevel({ initial_message_a1: 'only A1' }, 'B2')).toBe('only A1');
    expect(openerForLevel(null, 'A1')).toBe('');
  });
});

describe('storedOpenerArabic', () => {
  it('answers from stored data for the shipped openers (no AI call needed)', () => {
    expect(storedOpenerArabic('Guten Tag. Fehlt Ihr Koffer?')).toBe('نهارك سعيد. هل ينقصك حقيبتك؟');
    expect(storedOpenerArabic('Hallo! Willkommen im Katzu Café. Was möchten Sie trinken?')).toContain('مقهى');
  });

  it('normalises whitespace so a D1 row with a stray space still hits', () => {
    expect(storedOpenerArabic('Guten Tag.  Fehlt Ihr Koffer?')).toBe('نهارك سعيد. هل ينقصك حقيبتك؟');
  });

  it('returns null (not a guess) for an opener no review supplied', () => {
    expect(storedOpenerArabic('Etwas ganz anderes.')).toBeNull();
  });
});

describe('rankHintFloor — the measured mismatch as a regression case', () => {
  const FLOOR = [
    { german: 'Guten Tag. Hier ist mein Pass.', arabic: 'نهارك سعيد. هذا جواز سفري.' },
    { german: 'Ich bin zum ersten Mal in Deutschland.', arabic: 'هذه أول مرة لي في ألمانيا.' },
    { german: 'Wo ist mein Koffer, bitte?', arabic: 'أين حقيبتي، من فضلك؟' },
    { german: 'Seit meiner Ankunft fehlt mein Gepäck.', arabic: 'أمتعتي مفقودة منذ وصولي.' },
    { german: 'Ja, das stimmt.', arabic: 'نعم، هذا صحيح.' },
  ];

  it('no longer offers the passport line to a luggage question (the observed bug)', () => {
    // The opener asks whether luggage is missing. The old floor answered with
    // the passport statement — sort_order[0], unrelated to the question.
    const ranked = rankHintFloor(FLOOR, 'Guten Tag. Fehlt Ihr Gepäck?');
    expect(ranked[0].german).not.toBe('Guten Tag. Hier ist mein Pass.');
    // The first suggestion must share the question's subject (Gepäck/Koffer) —
    // a plausible next line in THIS conversation.
    expect(ranked[0].german).toMatch(/[Gg]epäck|[Kk]offer/);
  });

  it('keeps the stored order when the last AI message is not a question', () => {
    const ranked = rankHintFloor(FLOOR, 'Hier ist Ihr Kaffee.');
    expect(ranked.map((p) => p.german)).toEqual(FLOOR.map((p) => p.german));
  });

  it('prefers a lexical match (Koffer) over a generic yes/no answer', () => {
    const ranked = rankHintFloor(FLOOR, 'Wo ist mein Koffer?');
    expect(ranked[0].german).toBe('Wo ist mein Koffer, bitte?');
  });

  it('allows a yes/no phrase to answer a yes/no question, after lexical matches', () => {
    const ranked = rankHintFloor(FLOOR, 'Fehlt Ihr Gepäck?');
    const yesNo = ranked.find((p) => p.german === 'Ja, das stimmt.');
    expect(yesNo).toBeDefined();
    // ...but never ahead of a phrase that actually names the subject.
    expect(ranked.indexOf(yesNo!)).toBeGreaterThan(ranked.indexOf(FLOOR[3]));
  });

  it('never returns an empty list from a non-empty floor', () => {
    expect(rankHintFloor(FLOOR, '')).toHaveLength(FLOOR.length);
    expect(rankHintFloor([], 'Was?')).toEqual([]);
  });
});
