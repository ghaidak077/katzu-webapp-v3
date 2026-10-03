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
 * the sentence has nothing worth banking (a single word: one chip would be the
 * whole answer).
 *
 * Every surface that asks the learner to produce German shares this so "the words
 * are available" means the same thing everywhere:
 *   • Review (`ReviewScreen`) and Guided Practice (`GuidedPracticeScreen`),
 *   • the live chat's hint chips (`ConversationDock` — the words of the offered
 *     reply, so the learner can build it themselves instead of sending it),
 *   • the Listening dictation (`ListeningScreen` — the audio is the prompt and the
 *     German is the answer, the same shape as an `ar_to_de` review card), and
 *   • Writing (`WritingScreen` — no single answer exists, so the bank is
 *     assembled from the scenario's own vocabulary and phrases with
 *     `buildWordBankFrom`).
 */

/** Tokenise, dedupe, seed from `seed`, and shuffle — the shared core. */
function shuffledUniqueWords(words: string[], seed: string): string[] {
  const unique = [...new Set(words.filter(Boolean))];
  const rng = seededRng(hashString(seed || unique.join(' ')));
  const shuffled = [...unique];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

export function buildWordBank(answerDe: string, max = 14): string[] {
  const sentence = String(answerDe || '');
  const words = sentence.trim().split(/\s+/).filter(Boolean);
  const bank = shuffledUniqueWords(words, sentence);
  // One word is not a bank; a very long sentence becomes a wall of chips.
  return bank.length < 2 || bank.length > max ? [] : bank;
}

/**
 * The same bank assembled from several candidate strings rather than one answer
 * sentence — for a task like Writing that has no single correct sentence to take
 * words from. Unlike `buildWordBank`, an over-long pool is CAPPED at `max`
 * (a topic legitimately ships dozens of words) instead of returning nothing.
 */
export function buildWordBankFrom(parts: string[], max = 24): string[] {
  const text = (parts || []).filter(Boolean).join(' ');
  const words = text.trim().split(/\s+/).filter(Boolean);
  const bank = shuffledUniqueWords(words, text);
  return bank.length < 2 ? [] : bank.slice(0, max);
}
