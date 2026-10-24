import type { ReviewDirection, ReviewItemEntity } from '@/types/models';
import { gradeAnswer, normalizeGermanAnswer, type AnswerVerdict } from '@/lib/srs/engine';
import { LEADING_ARTICLE } from '@/lib/utils/germanNoun';

// The production word bank is shared with the other production surfaces, so it
// lives in one place; re-exported here to keep this module's public surface
// unchanged.
export { buildWordBank, buildWordBankFrom } from '@/lib/utils/wordBank';

/**
 * The rules a review card must satisfy to be worth showing.
 *
 * WHY THIS FILE EXISTS (V28 Stage 1): the owner's report from real use was that
 * review "contains many mistakes the learner never made, and many questions are
 * illogical, with no clear question or no clear answer." Both symptoms are the
 * same defect — an item was created from data that cannot form a question, and
 * nothing checked before it was shown. A mistake's prompt used to be the bare
 * grammar-rule label (and `صيغة صحيحة` when even that was missing), so the
 * learner saw an Arabic label and was asked to produce a specific German rewrite
 * that was not derivable from anything on screen.
 *
 * So the item contract is now explicit and enforced in one place:
 *   • a clear Arabic prompt (never a placeholder, never a bare German label),
 *   • one expected German answer,
 *   • a direction label, and
 *   • for a correction, the learner's own original (so the task is legible) and
 *     a change that is actually meaningful — not capitalisation, punctuation or
 *     a transliteration the answer normaliser already folds.
 *
 * Everything here is pure so it can be unit-tested without a database, and so
 * the same rule can run at creation time, at adoption time and on the queue.
 */

/**
 * Arabic prompts that carry no question. These are the exact fallbacks the old
 * mistake builder emitted, kept as a list so a regression that reintroduces one
 * fails a test instead of shipping.
 */
export const BANNED_PROMPT_PLACEHOLDERS = ['صيغة صحيحة', 'قواعد نحوية'];

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

/**
 * Arabic-side normalisation for a German→Arabic answer: folds the alef/ya/waw
 * hamza forms, ta marbuta → ha, and drops harakat and tatweel (which Arabic
 * keyboards add invisibly), plus case, punctuation and whitespace.
 */
export function normalizeArabicAnswer(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Grading for the German→Arabic direction. The Arabic meaning is short, so an
 * exact normalised match is 'correct'; every expected word present in the answer
 * is 'close' (the learner understood it, the wording differs).
 */
export function gradeArabicAnswer(expected: string, actual: string): 'correct' | 'close' | 'wrong' {
  const target = normalizeArabicAnswer(expected);
  const given = normalizeArabicAnswer(actual);
  if (!given) return 'wrong';
  if (target === given) return 'correct';
  const targetWords = target.split(' ').filter(Boolean);
  const givenWords = new Set(given.split(' ').filter(Boolean));
  if (targetWords.length > 0 && targetWords.every((word) => givenWords.has(word))) return 'close';
  return 'wrong';
}

/**
 * Did the correction change anything a learner would call a correction?
 *
 * `normalizeGermanAnswer` already folds case, punctuation, whitespace and umlaut
 * transliteration, so if two strings are equal *after* that folding the only
 * difference was style — a full stop, a capital letter, or `fuer` for `für`.
 * That is not a mistake and must not enter the review queue. A real word change
 * (`fertig` → `fertiggestellt`, or a rebuilt clause) survives normalisation.
 */
export function isMeaningfulCorrection(original: string, corrected: string): boolean {
  const before = normalizeGermanAnswer(original);
  const after = normalizeGermanAnswer(corrected);
  if (!after) return false;
  if (!before) return true;
  return before !== after;
}

/* ------------------------------------------------------------------------- *
 * From stored row to ONE answerable task (V41).
 *
 * The owner's report from real use was not "the card looks wrong" but "I do
 * not know what this card is asking". A row can hold a rule label, a fragment,
 * a full sentence and an answer in any combination, so the screen cannot
 * decide the task from `kind`/`direction` alone. This builder is the single
 * place that decides what the learner is actually being asked, and returns
 * `null` when no honest task exists. Everything below it (validation, the
 * queue, the screen) consumes the same decision, so the header, the cue, the
 * input and the answer can never describe different tasks.
 * ------------------------------------------------------------------------- */

export type ReviewTaskKind = 'vocab' | 'sentence_ar_to_de' | 'sentence_de_to_ar' | 'correction';

export interface ReviewTask {
  kind: ReviewTaskKind;
  /** The one type chip. Level rides beside it, never inside it. */
  chipAr: string;
  /** The instruction for THIS card, repeated above the cue. */
  headerAr: string;
  /** The Arabic meaning (or Arabic word) the learner must express. */
  meaningAr: string;
  /** The German answer for production tasks. */
  answerDe?: string;
  /** The German the learner reads, for a read-and-reveal card. */
  sourceDe?: string;
  /** The learner's previous sentence, for a correction card. */
  wrongDe?: string;
  /** Short Arabic gloss/example, already sanitised. */
  glossAr?: string;
  /** One short Arabic reason, shown after a miss or a reveal. */
  reasonAr?: string;
  /** Article + plural, when the source row knows the plural. */
  pluralDe?: string;
  /** True when the learner types German; false for read-and-reveal cards. */
  typed: boolean;
}

const INSTRUCTION_MARKERS = /(?:اكتب|اكتبي|اكتبوا|صحّح|صحح|أعد|اكمل|أكمل|اختر|ترجم)/;
const GERMAN_TOPIC = /[A-Za-zÄÖÜäöüß]{3,}/;
const GARBLED_TEXT = /\uFFFD|(?:Ã|Â|Ø|Ù|Ú|Ð|Ñ)[\u0080-\u00FF]/;

/**
 * The Arabic meaning of a row, or null when the Arabic is only a rule label or
 * an instruction. Old mistake rows stored `"Perfekt — اكتب الجملة…"`, which is
 * a topic plus a command, never a meaning; treating it as a cue is exactly the
 * bug this release fixes.
 */
export function arabicMeaningFor(
  item: Pick<ReviewItemEntity, 'kind' | 'promptAr' | 'meaningAr'>,
): string | null {
  const explicit = String(item.meaningAr ?? '').trim();
  if (explicit && ARABIC_SCRIPT.test(explicit)) return explicit;
  const prompt = String(item.promptAr ?? '').trim();
  if (!prompt || !ARABIC_SCRIPT.test(prompt)) return null;
  if (item.kind === 'mistake' && (INSTRUCTION_MARKERS.test(prompt) || GERMAN_TOPIC.test(prompt))) {
    return null;
  }
  return prompt;
}

/**
 * A full German sentence, not a fragment copied out of one. `ist jetzt
 * fertiggestellt` is three words but cannot stand as a question or an answer;
 * the capital letter plus three words is the cheapest honest test.
 */
export function isFullGermanSentence(value: string): boolean {
  const text = String(value ?? '').trim();
  if (!text) return false;
  if (!/^[A-ZÄÖÜ]/.test(text)) return false;
  const words = normalizeGermanAnswer(text).split(' ').filter(Boolean);
  return words.length >= 3;
}

/** Drops mojibake and strings with no Arabic at all before they reach the learner. */
export function cleanArabicExplanation(value?: string | null): string | undefined {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  if (GARBLED_TEXT.test(text)) return undefined;
  if (!ARABIC_SCRIPT.test(text)) return undefined;
  return text;
}

/** The decided task for a row, or null when no task can be asked honestly. */
export function buildReviewTask(item: ReviewItemEntity): ReviewTask | null {
  const answer = String(item.answerDe ?? '').trim();
  if (!answer || !normalizeGermanAnswer(answer)) return null;
  const meaning = arabicMeaningFor(item);
  if (!meaning) return null;

  const gloss = cleanArabicExplanation(item.explanationAr);

  if (item.kind === 'mistake') {
    const wrong = String(item.contextDe ?? '').trim();
    const reason =
      cleanArabicExplanation(item.grammarReference?.ruleAr) ??
      cleanArabicExplanation(item.explanationAr);

    if (wrong && isFullGermanSentence(wrong)) {
      // A full previous sentence with no real change is not a mistake.
      if (!isMeaningfulCorrection(wrong, answer)) return null;
      if (!isFullGermanSentence(answer)) return null;
      return {
        kind: 'correction',
        chipAr: 'تصحيح',
        headerAr: 'صحّح جملتك السابقة',
        meaningAr: meaning,
        wrongDe: wrong,
        answerDe: answer,
        reasonAr: reason,
        typed: true,
      };
    }

    // No previous sentence (or only a fragment): the full target is still a
    // clear sentence-production task. A fragment target is never shown.
    if (!isFullGermanSentence(answer)) return null;
    return {
      kind: 'sentence_ar_to_de',
      chipAr: 'جملة',
      headerAr: 'اكتب الجملة بالألمانية',
      meaningAr: meaning,
      answerDe: answer,
      glossAr: reason,
      typed: true,
    };
  }

  if (item.direction === 'de_to_ar') {
    return {
      kind: 'sentence_de_to_ar',
      chipAr: 'جملة',
      headerAr: 'اقرأ الجملة ثم اكشف معناها',
      meaningAr: meaning,
      sourceDe: answer,
      answerDe: answer,
      glossAr: gloss,
      typed: false,
    };
  }

  if (item.kind === 'vocab') {
    return {
      kind: 'vocab',
      chipAr: 'مفردة',
      headerAr: 'اكتب الكلمة الألمانية',
      meaningAr: meaning,
      answerDe: answer,
      glossAr: gloss,
      pluralDe: item.pluralDe,
      typed: true,
    };
  }

  return {
    kind: 'sentence_ar_to_de',
    chipAr: 'جملة',
    headerAr: 'اكتب الجملة بالألمانية',
    meaningAr: meaning,
    answerDe: answer,
    glossAr: gloss,
    typed: true,
  };
}

/**
 * German word matcher for vocabulary. The owner's rule: the noun without its
 * article is right; a wrong article is the one thing worth a "close" note.
 */
export function gradeVocabAnswer(expected: string, actual: string): AnswerVerdict {
  const target = normalizeGermanAnswer(expected);
  const given = normalizeGermanAnswer(actual);
  if (!given) return 'wrong';
  if (target === given) return 'correct';
  const targetBare = target.replace(LEADING_ARTICLE, '');
  const givenBare = given.replace(LEADING_ARTICLE, '');
  if (targetBare === givenBare) return LEADING_ARTICLE.test(given) ? 'close' : 'correct';
  return 'wrong';
}

/** One matcher for every typed German answer on the review screen. */
export function gradeTaskAnswer(task: ReviewTask, actual: string): AnswerVerdict {
  const expected = task.answerDe ?? '';
  return task.kind === 'vocab' ? gradeVocabAnswer(expected, actual) : gradeAnswer(expected, actual);
}

export interface GermanDiffToken {
  text: string;
  /** True when this word of the expected sentence is missing or different. */
  changed: boolean;
}

/**
 * The expected sentence with the words the learner missed highlighted. The
 * feedback shows the correct sentence, never the learner's wrong one, so the
 * last thing they read is right.
 */
export function diffGermanTokens(expected: string, actual: string): GermanDiffToken[] {
  const expectedTokens = String(expected ?? '').trim().split(/\s+/).filter(Boolean);
  const actualTokens = String(actual ?? '').trim().split(/\s+/).filter(Boolean);
  const left = expectedTokens.map((token) => normalizeGermanAnswer(token));
  const right = actualTokens.map((token) => normalizeGermanAnswer(token));

  const table: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        left[i] === right[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const matched = new Array<boolean>(left.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      matched[i] = true;
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return expectedTokens.map((text, index) => ({ text, changed: !matched[index] }));
}

export interface ReviewValidation {
  ok: boolean;
  reasons: string[];
}

/** Checks one item against the contract above. */
export function validateReviewItem(
  item: Pick<ReviewItemEntity, 'kind' | 'promptAr' | 'meaningAr' | 'answerDe' | 'contextDe'>,
): ReviewValidation {
  const reasons: string[] = [];
  const prompt = String(item.promptAr ?? '').trim();
  const answer = String(item.answerDe ?? '').trim();

  if (prompt.length < 2) reasons.push('prompt_missing');
  else if (!ARABIC_SCRIPT.test(prompt)) reasons.push('prompt_not_arabic');
  if (BANNED_PROMPT_PLACEHOLDERS.some((placeholder) => prompt === placeholder || prompt.startsWith(`${placeholder} `))) {
    reasons.push('prompt_placeholder');
  }
  if (!answer || !normalizeGermanAnswer(answer)) reasons.push('answer_missing');

  if (item.kind === 'mistake') {
    // A correction is only a correction when the card can say what the sentence
    // MEANS, what the learner wrote, and what the right sentence is. The old
    // rule label + instruction prompt had no meaning, so it could not be asked.
    if (!arabicMeaningFor(item)) reasons.push('mistake_meaning_missing');
    if (answer && !isFullGermanSentence(answer)) reasons.push('correction_target_fragment');
    const original = String(item.contextDe ?? '').trim();
    // A fragment original is converted to sentence production, not rejected;
    // a full original with no real change is not a mistake at all.
    if (original && isFullGermanSentence(original) && !isMeaningfulCorrection(original, answer)) {
      reasons.push('correction_not_meaningful');
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/** An item is servable when it is not suppressed and passes the contract. */
export function isServableReviewItem(item: ReviewItemEntity): boolean {
  return !item.suppressed && validateReviewItem(item).ok;
}

/**
 * Drops later duplicates so the same question cannot appear twice in a queue,
 * keyed on kind + normalised prompt + normalised answer. Keeps the first (oldest
 * by the queue's own ordering), which is the one with the most history.
 */
export function dedupeReviewItems<T extends ReviewItemEntity>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = `${item.kind}|${normalizeArabicAnswer(item.promptAr)}|${normalizeGermanAnswer(item.answerDe)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * The direction of a word/phrase card, assigned deterministically from its stable
 * refId so the same item keeps the same direction across devices and sessions.
 * Corrections are always produced in German, so callers override this for them.
 */
export function directionFromRefId(refId: string): ReviewDirection {
  let hash = 0;
  for (let index = 0; index < refId.length; index += 1) {
    hash = (hash * 31 + refId.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 2 === 0 ? 'de_to_ar' : 'ar_to_de';
}

/**
 * The context line for a word card: the example sentence with the target word
 * blanked out, so the prompt also shows the word being used (a cloze), never a
 * bare fragment. Returns null when the example does not actually contain the word
 * or the item is not a word with an example.
 */
export function clozeContext(contextDe: string | undefined, answerDe: string): string | null {
  const context = String(contextDe ?? '').trim();
  if (!context) return null;
  const words = normalizeGermanAnswer(answerDe)
    .split(' ')
    .filter((word) => word.length > 1);
  // Blank the longest answer word — the content word, not an article or particle.
  const target = words.sort((a, b) => b.length - a.length)[0];
  if (!target) return null;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}\\w*\\b`, 'i');
  const probe = normalizeGermanAnswer(context);
  if (!new RegExp(`\\b${escaped}`).test(probe)) return null;
  return context.replace(pattern, '______');
}

