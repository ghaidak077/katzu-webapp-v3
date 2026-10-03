import { hashString, seededRng } from '@/lib/grammar/exercises';

/**
 * The tappable word bank for a production task.
 *
 * The owner's report: "it is not obvious what to answer because they lack the
 * vocabulary." For a card that asks the learner to *produce* a German sentence
 * from its Arabic meaning, knowing the meaning is not the same as having the
 * words. The bank hands them the words (article and word as separate chips,
 * because a repeated tap is how the learner writes a repeated word) shuffled
 * deterministically (same sentence ⇒ same order, so nothing moves under the
 * learner) and without duplicates.
 *
 * Deliberately NOT built when the target German IS the prompt (a `de_to_ar`
 * review card) or when the task is to reconstruct a correction, because there a
 * bank of the answer's words would erase the exercise. Returns an empty list when
 * the sentence has nothing worth banking.
 *
 * Shared by Review (`ReviewScreen`) and Guided Practice (`GuidedPracticeScreen`)
 * so "the words are available" means the same thing on every production surface.
 */
export function buildWordBank(answerDe: string, max = 14): string[] {
  const words = String(answerDe || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const unique = [...new Set(words)];
  // One-word answers have no bank; a very long sentence becomes a wall of chips.
  if (unique.length < 2 || unique.length > max) return [];
  const rng = seededRng(hashString(String(answerDe || '')));
  const shuffled = [...unique];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}
