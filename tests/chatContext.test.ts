import { describe, expect, it } from 'vitest';
import { shapeTurnContents } from '../cloudflare-ai-chat.js';

/**
 * What the model actually sees, per turn.
 *
 * The defect these pin down: the conversation screen sends the visible
 * transcript, which already ends with the message being answered, and the route
 * sends that message again as `user_message`. Concatenating them gave the model
 * the learner's sentence twice in a row, which is why a reply could answer the
 * previous question, restate the input instead of answering it, or drift off the
 * topic the learner had just raised.
 */

const texts = (contents: any[]) => contents.map((c) => c.parts[0].text);
const roles = (contents: any[]) => contents.map((c) => c.role);

describe('shapeTurnContents', () => {
  it('drops the history copy of the message being answered', () => {
    const sentence = 'Ich möchte die Küche sehen.';
    const contents = shapeTurnContents(
      [
        { role: 'model', text: 'Willkommen! Das ist die Wohnung.' },
        { role: 'user', text: 'Die Wohnung ist schön.' },
        { role: 'model', text: 'Freut mich! Möchten Sie die Küche sehen?' },
        { role: 'user', text: sentence },
      ],
      sentence,
    );

    expect(texts(contents).filter((t) => t === sentence)).toHaveLength(1);
    expect(roles(contents).at(-1)).toBe('user');
    expect(texts(contents).at(-1)).toBe(sentence);
  });

  it('matches the duplicate case- and whitespace-insensitively', () => {
    const contents = shapeTurnContents([{ role: 'user', text: '  ich möchte   einen Kaffee  ' }], 'Ich möchte einen Kaffee');
    expect(texts(contents)).toEqual(['Ich möchte einen Kaffee']);
  });

  it('never leaves two learner turns touching', () => {
    const contents = shapeTurnContents(
      [
        { role: 'user', text: 'Hallo' },
        { role: 'user', text: 'Ich heiße Ali' },
        { role: 'model', text: 'Freut mich, Ali.' },
      ],
      'Und Sie?',
    );
    const sequence = roles(contents);
    expect(sequence.some((r, i) => i > 0 && r === sequence[i - 1])).toBe(false);
    // The newest of the run survives: it is the one that has a reply after it.
    expect(texts(contents)[0]).toBe('Ich heiße Ali');
    expect(texts(contents)).not.toContain('Hallo');
  });

  it('keeps the scenario opener, which has no question before it', () => {
    const contents = shapeTurnContents([{ role: 'model', text: 'Hallo! Willkommen.' }], 'Guten Tag');
    expect(texts(contents)).toEqual(['Hallo! Willkommen.', 'Guten Tag']);
  });

  it('drops a reply whose question was trimmed off the top of the window', () => {
    const history = [];
    for (let turn = 1; turn <= 6; turn++) {
      history.push({ role: 'user', text: `Frage ${turn}` }, { role: 'model', text: `Antwort ${turn}` });
    }
    const contents = shapeTurnContents(history, 'Frage 7');
    expect(roles(contents)[0]).toBe('user');
    // roleplay keeps three whole exchanges plus the new message.
    expect(contents).toHaveLength(7);
    expect(texts(contents)).toEqual([
      'Frage 4', 'Antwort 4',
      'Frage 5', 'Antwort 5',
      'Frage 6', 'Antwort 6',
      'Frage 7',
    ]);
  });

  it('keeps a longer window in immersion mode', () => {
    const history = [];
    for (let turn = 1; turn <= 8; turn++) {
      history.push({ role: 'user', text: `Frage ${turn}` }, { role: 'model', text: `Antwort ${turn}` });
    }
    const contents = shapeTurnContents(history, 'Frage 9', 'extended');
    expect(contents).toHaveLength(11);
    expect(texts(contents)[0]).toBe('Frage 4');
    expect(texts(contents).at(-2)).toBe('Antwort 8');
  });

  it('handles the shapes a request can actually carry', () => {
    expect(shapeTurnContents([], 'Hallo')).toEqual([{ role: 'user', parts: [{ text: 'Hallo' }] }]);
    expect(shapeTurnContents(undefined as any, 'Hallo')).toHaveLength(1);
    // The client's pre-normalisation shape still maps, and blank entries are dropped.
    expect(
      shapeTurnContents(
        [{ sender: 'KATZU', text: 'Hallo!' }, { role: 'model', text: '   ' }, { sender: 'USER', text: 'Hi' }],
        'Wie geht es Ihnen?',
      ).map((c) => c.role),
    ).toEqual(['model', 'user', 'user']);
  });
});
