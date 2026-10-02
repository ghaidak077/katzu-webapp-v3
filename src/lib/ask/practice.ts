import { gradeAnswer, normalizeGermanAnswer, type AnswerVerdict } from '@/lib/srs/engine';
import type { AskPracticeItem } from '@/types/models';

/**
 * Grading Ask Katzu's practice items (V28 Stage 2A).
 *
 * The worker returns one unambiguous `answerDe` per item, and the client grades
 * it here with the SAME grader the review engine uses (`gradeAnswer`) — so a
 * learner cannot be told "correct" by one screen and "wrong" by another for the
 * same sentence. Reorder compares the word sequence; fill and translate are the
 * shared exact grader (which already accepts the standard umlaut transliteration
 * and gives the article-only mistake its own 'close' verdict).
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

  return gradeAnswer(item.answerDe, given);
}

/** Arabic feedback per verdict — one line, never a score. */
export function askPracticeFeedbackAr(verdict: AnswerVerdict): string {
  if (verdict === 'correct') return 'صحيحة — فهمت الفكرة.';
  if (verdict === 'close') return 'الصيغة قريبة، لكن الأداة أو الشكل يحتاج ضبطاً.';
  return 'ليست الصيغة الصحيحة بعد — انظر الجواب ثم أعد الكتابة.';
}
