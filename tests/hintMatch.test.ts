import { describe, expect, it } from 'vitest';
import { sentenceMatchesHint } from '../src/lib/conversation/hintMatch';

describe('hint-assisted detection', () => {
  it('matches the offered sentence exactly, ignoring case and punctuation', () => {
    expect(sentenceMatchesHint('Ich heiße Ghaidak', 'Ich heiße Ghaidak.')).toBe(true);
    expect(sentenceMatchesHint('ich heisse ghaidak', 'Ich heiße Ghaidak.')).toBe(false);
  });

  it('matches a blank hint only when the learner filled the blank', () => {
    expect(sentenceMatchesHint('Ich heiße Ghaidak.', 'Ich heiße ___.')).toBe(true);
    expect(sentenceMatchesHint('Ich heiße ___.', 'Ich heiße ___.')).toBe(false);
    expect(sentenceMatchesHint('Ich komme aus Syrien.', 'Ich heiße ___.')).toBe(false);
  });

  it('rejects an empty sentence', () => {
    expect(sentenceMatchesHint('', 'Ich heiße Ghaidak.')).toBe(false);
    expect(sentenceMatchesHint('   ', 'Ich heiße ___.')).toBe(false);
  });

  it('handles a blank in the middle without accepting a different tail', () => {
    expect(sentenceMatchesHint('Zwei Stück bitte', 'Zwei ___, bitte.')).toBe(true);
    expect(sentenceMatchesHint('Zwei Stück danke', 'Zwei ___, bitte.')).toBe(false);
  });
});
