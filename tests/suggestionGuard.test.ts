import { describe, expect, it } from 'vitest';
import { suggestionFitsContext } from '@/lib/conversation/suggestionGuard';
import { buildWordBank } from '@/lib/utils/wordBank';

/**
 * The suggestion sheet is a promise: this line answers the last thing Katzu
 * said, in this conversation. The measured failure was the café phrase
 * «Ich möchte einen Kaffee.» offered after the learner said «Ich liebe meine
 * Katze». These tests pin the guard that keeps an unmentioned topic out.
 */

const CAT_CONTEXT = [
  'Erzähl mir von deiner Katze. Was macht sie gern?',
  'Ich liebe meine Katze.',
  'Meine Katze',
  'meine Katze',
];

describe('suggestionFitsContext — topic anchors', () => {
  it('rejects a coffee suggestion after a cat conversation', () => {
    expect(suggestionFitsContext('Ich möchte einen Kaffee.', CAT_CONTEXT)).toBe(false);
    expect(suggestionFitsContext('Einen Kaffee, bitte.', CAT_CONTEXT)).toBe(false);
    expect(suggestionFitsContext('Ich trinke gern Tee.', CAT_CONTEXT)).toBe(false);
  });

  it('keeps a suggestion about a topic the conversation did introduce', () => {
    const context = ['Was möchten Sie trinken?', 'Einen Kaffee bitte.', 'Café'];
    expect(suggestionFitsContext('Ich möchte einen Kaffee.', context)).toBe(true);
  });

  it('keeps a self-introduction that answers the last question', () => {
    const context = ['Wie heißen Sie?', '', 'Kennenlernen'];
    expect(suggestionFitsContext('Ich heiße Ghaidak.', context)).toBe(true);
    expect(suggestionFitsContext('Ich bin aus Syrien.', context)).toBe(true);
  });

  it('rejects a canned statement when the last line asks a different question', () => {
    const context = ['Wo wohnen Sie?', 'Ich heiße Ali.', 'Wohnung'];
    expect(suggestionFitsContext('Das Wetter ist heute schön.', context)).toBe(false);
  });

  it('keeps yes/no answers to a yes/no question', () => {
    const context = ['Möchten Sie einen Kaffee?', 'Kaffee'];
    expect(suggestionFitsContext('Ja, gern.', context)).toBe(true);
    expect(suggestionFitsContext('Nein, danke.', context)).toBe(true);
  });

  it('rejects an empty suggestion', () => {
    expect(suggestionFitsContext('', CAT_CONTEXT)).toBe(false);
    expect(suggestionFitsContext('   ', CAT_CONTEXT)).toBe(false);
  });
});

describe('the reply word bank is shuffled but stable', () => {
  it('offers every word of the answer in a different order', () => {
    const answer = 'Ich möchte einen Kaffee bitte';
    const bank = buildWordBank(answer);
    expect(bank.length).toBeGreaterThan(1);
    expect([...bank].sort()).toEqual(answer.split(' ').sort());
    expect(bank.join(' ')).not.toBe(answer);
  });

  it('returns the same order for the same answer, so nothing moves under the learner', () => {
    const answer = 'Ich heiße Ghaidak und komme aus Syrien';
    expect(buildWordBank(answer)).toEqual(buildWordBank(answer));
  });

  it('returns no bank for a single word or an empty answer', () => {
    expect(buildWordBank('Hallo')).toEqual([]);
    expect(buildWordBank('')).toEqual([]);
  });
});
