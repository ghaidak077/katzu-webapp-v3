import { gradeAnswer, normalizeGermanAnswer, type AnswerVerdict } from '@/lib/srs/engine';
import type { AskPracticeItem } from '@/types/models';

/**
 * Grading Ask Katzu's practice items (V28 Stage 2A).
 *
 * The worker returns one best `answerDe` per item plus, when a translation has
 * more than one right form, up to three accepted alternates. The client grades
 * with the SAME grader the review engine uses (`gradeAnswer`) — so a learner
 * cannot be told "correct" by one screen and "wrong" by another for the same
 * sentence — and accepts any listed alternate as 'correct'. Reorder compares the
 * word sequence; fill and translate are the shared exact grader (which already
 * accepts the standard umlaut transliteration and gives the article-only mistake
 * its own 'close' verdict, definite or indefinite).
 */
export function gradeAskPractice(item: AskPracticeItem, response: string): AnswerVerdict {
  const given = String(response || '').trim();
  if (!given) return 'wrong';

  if (item.type === 'reorder') {
    const target = normalizeGermanAnswer(item.answerDe);
    const actual = normalizeGermanAnswer(given);
    if (!target || !actual) return 'wrong';
    return target === actual ? 'correct' : 'wrong';
  }

  // A translation rarely has a single right form, so any accepted alternate counts.
  const normalizedGiven = normalizeGermanAnswer(given);
  const accepted = [item.answerDe, ...(item.acceptedDe || [])];
  if (accepted.some((answer) => normalizeGermanAnswer(answer) === normalizedGiven)) return 'correct';

  return gradeAnswer(item.answerDe, given);
}

/**
 * Whether a graded answer is strong enough evidence of a knowledge gap to file
 * as a mistake and schedule for review. A 'close' answer is a near miss, and a
 * translation can have more correct forms than the worker listed, so neither is
 * filed as a false error — only a clear 'wrong' on an item with one right form
 * (fill, reorder).
 */
export function shouldEnrolAskMistake(item: AskPracticeItem, verdict: AnswerVerdict): boolean {
  return verdict === 'wrong' && item.type !== 'translate';
}

/** Arabic feedback per verdict — one line, never a score. */
export function askPracticeFeedbackAr(verdict: AnswerVerdict): string {
  if (verdict === 'correct') return 'صحيحة — فهمت الفكرة.';
  if (verdict === 'close') return 'الصيغة قريبة، لكن الأداة أو الشكل يحتاج ضبطاً.';
  return 'ليست الصيغة الصحيحة بعد — انظر الجواب ثم أعد الكتابة.';
}
