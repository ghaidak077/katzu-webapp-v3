import { describe, expect, it } from 'vitest';
import { askPracticeFeedbackAr, gradeAskPractice } from '../src/lib/ask/practice';
import type { AskPracticeItem } from '../src/types/models';

/**
 * Practice is graded by the SAME grader the review engine uses, and reorder
 * compares the word sequence. These tests pin that the client cannot disagree
 * with the rest of the app about the same German sentence.
 */
const item = (overrides: Partial<AskPracticeItem> = {}): AskPracticeItem => ({
  type: 'translate',
  promptAr: 'أشتري التفاحة.',
  answerDe: 'Ich kaufe den Apfel.',
  ...overrides,
});

describe('gradeAskPractice', () => {
  it('accepts the correct translation and the standard umlaut transliteration', () => {
    expect(gradeAskPractice(item(), 'Ich kaufe den Apfel.')).toBe('correct');
    expect(gradeAskPractice(item({ answerDe: 'Ich möchte für dich' }), 'ich moechte fuer dich')).toBe('correct');
  });

  it('gives an article-only mistake its own "close" verdict, not "wrong"', () => {
    expect(gradeAskPractice(item({ answerDe: 'der Termin' }), 'Termin')).toBe('close');
    expect(gradeAskPractice(item({ answerDe: 'der Termin' }), 'die Termin')).toBe('close');
  });

  it('grades a fill answer through the shared grader', () => {
    const fill = item({ type: 'fill', answerDe: 'den' });
    expect(gradeAskPractice(fill, 'den')).toBe('correct');
    expect(gradeAskPractice(fill, 'dem')).toBe('wrong');
  });

  it('grades reorder by the word sequence, ignoring case and punctuation', () => {
    const reorder = item({ type: 'reorder', answerDe: 'Ich kaufe den Kaffee' });
    expect(gradeAskPractice(reorder, 'ich kaufe den kaffee')).toBe('correct');
    expect(gradeAskPractice(reorder, 'den kaffee kaufe ich')).toBe('wrong');
  });

  it('treats an empty answer as wrong rather than correct', () => {
    expect(gradeAskPractice(item(), '')).toBe('wrong');
    expect(gradeAskPractice(item(), '   ')).toBe('wrong');
  });

  it('has one Arabic feedback line per verdict', () => {
    for (const verdict of ['correct', 'close', 'wrong'] as const) {
      expect(askPracticeFeedbackAr(verdict)).toMatch(/[\u0600-\u06FF]/);
    }
  });
});
