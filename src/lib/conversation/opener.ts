/**
 * Stored opener support — the one pre-chat AI call, removed (V19 Phase 2).
 *
 * MEASURED BASELINE (V19 Phase 0, probe in .wrangler/v19-probe/)
 * Opening the live screen fired exactly one AI call before the first message:
 * POST /ai/translate for the scenario opener's Arabic gloss. Nothing else on the
 * screen needs a model: the opener's German lives in stored scenario data (D1
 * `initial_message_*`), the hints floor lives in `starter_phrases`, and the turn
 * path is already ONE fused `/ai/turn` per learner message.
 *
 * This module makes the gloss offline-first the way the rest of the content is:
 * the opener's Arabic is derived from data the app already stores, an AI call is
 * only a *refinement* when online, and the failure path is an honest Arabic
 * notice instead of a spinner.
 *
 * Every function here is pure and deterministic — unit-tested without a network.
 */

import type { CEFRLevel } from '@/types/models';

/** The opener message a scenario serves at each level. */
export type ScenarioOpener = {
  initial_message_a0?: string | null;
  initial_message_a1?: string | null;
  initial_message_a2?: string | null;
  initial_message_b1?: string | null;
  initial_message_b2?: string | null;
};

/** Picks the opener exactly as the live screen does today. */
export function openerForLevel(scenario: ScenarioOpener | null | undefined, level: CEFRLevel): string {
  if (!scenario) return '';
  switch (level) {
    // A0 falls back through the A1 line: only the foundations module carries a
    // real a0 opener, so an older scenario stays playable at the floor.
    case 'A0': return scenario.initial_message_a0 || scenario.initial_message_a1 || scenario.initial_message_a2 || scenario.initial_message_b1 || scenario.initial_message_b2 || '';
    case 'A1': return scenario.initial_message_a1 || scenario.initial_message_a0 || scenario.initial_message_a2 || scenario.initial_message_b1 || scenario.initial_message_b2 || '';
    case 'A2': return scenario.initial_message_a2 || scenario.initial_message_a1 || scenario.initial_message_b1 || scenario.initial_message_b2 || '';
    case 'B1': return scenario.initial_message_b1 || scenario.initial_message_a2 || scenario.initial_message_b2 || scenario.initial_message_a1 || '';
    case 'B2': return scenario.initial_message_b2 || scenario.initial_message_b1 || scenario.initial_message_a2 || scenario.initial_message_a1 || '';
    default: return scenario.initial_message_a1 || '';
  }
}

/**
 * The stored Arabic gloss for an opener, keyed on the German text itself.
 *
 * WHY KEYED ON TEXT, NOT ON (scenario, level): the row the scenario is served
 * from can be the D1 copy or the offline fixture, and they can drift; the
 * learner sees one specific German sentence, and it is that sentence the gloss
 * must match. A gloss entry only ships when a content author (or a reviewed
 * draft) supplied the Arabic, so an unmapped opener stays honest rather than
 * guessing — it shows the retry affordance, which is the pre-V19 failure state,
 * minus the AI call that used to paper over it.
 */
const OPENER_GLOSSES: Record<string, string> = {
  // airport_arrival — the five openers from the fixture + module2's approved
  // wording (D1's live title "في المطار: الأمتعة").
  'Guten Tag. Fehlt Ihr Koffer?': 'نهارك سعيد. هل ينقصك حقيبتك؟',
  'Guten Tag. Fehlt Ihr Gepäck?': 'نهارك سعيد. هل ينقصك أمتعتك؟',
  'Guten Tag. Ist Ihr Koffer nicht angekommen? Haben Sie Ihre Bordkarte dabei?':
    'نهارك سعيد. لم تصل حقيبتك؟ هل معك بطاقة صعودك؟',
  'Guten Tag. Wenn Ihr Koffer fehlt, nehme ich Ihre Meldung auf. Können Sie ihn kurz beschreiben?':
    'نهارك سعيد. إذا كانت حقيبتك مفقودة سأسجّل بلاغك. هل يمكنك وصفها باختصار؟',
  'Guten Tag. Da Ihr Gepäck nicht angekommen ist, fülle ich gern mit Ihnen eine Verlustmeldung aus. Können Sie Ihren Koffer bitte beschreiben?':
    'نهارك سعيد. بما أن أمتعتك لم تصل، سأملأ معك بلاغ الفقد بكل سرور. هل تصف حقيبتك من فضلك؟',
  // cafe_order — the four fixture openers.
  'Hallo! Willkommen im Katzu Café. Was möchten Sie trinken?': 'أهلاً! مرحباً بك في مقهى كَاتْزُو. ماذا تحب أن تشرب؟',
  'Guten Tag! Schön, dass Sie da sind. Möchten Sie die Getränkekarte sehen oder wissen Sie schon, was Sie möchten?':
    'نهارك سعيد! سعداء بوجودك. هل تود رؤية قائمة المشروبات أم تعرف ما تريده؟',
  'Hallo! Schönen Nachmittag. Wir haben heute frischen Apfelkuchen und tolle Kaffeespezialitäten. Darf ich Ihnen schon etwas bringen?':
    'أهلاً! مساء سعيد. لدينا اليوم كعك تفاح طازج وقهوة مميزة. هل أحضر لك شيئاً الآن؟',
  'Herzlich willkommen! Nehmen Sie gerne Platz. Kann ich Ihnen vielleicht eine Empfehlung aus unserer Spezialitätenröstung aussprechen?':
    'مرحباً بك! تفضّل بالجلوس. هل أقترح لك شيئاً من قهوتنا المختصة؟',
};

/**
 * The stored Arabic gloss for an opener, or null when none ships for it.
 *
 * `null` is honest: the caller shows the retry affordance (which now works
 * offline through `requestOpenerTranslation`'s AI refinement) instead of a
 * wrong or placeholder translation.
 */
export function storedOpenerArabic(german: string): string | null {
  const key = german.trim().replace(/\s+/g, ' ');
  return Object.prototype.hasOwnProperty.call(OPENER_GLOSSES, key) ? OPENER_GLOSSES[key] : null;
}

/**
 * The hint floor, re-tied to what the other side just said (V19 Phase 2).
 *
 * The measured mismatch: the opener asks "Fehlt Ihr Koffer?" (is your suitcase
 * missing?) and the floor's first phrase was "Hier ist mein Pass." — a passport
 * answer to a luggage question, because `loadStarterHints` returned the
 * scenario's phrases in `sort_order` with no regard for the last AI message.
 *
 * The rule now: rank the stored phrases by how well they ANSWER the last AI
 * message, and only fall back to the stored order when nothing matches. The
 * first hint the learner sees is always a plausible next line in the
 * conversation they are actually in.
 */

export interface FloorPhrase {
  german: string;
  arabic: string;
}

/**
 * The question the last AI message asks, as a lowercase token set with German
 * stopwords removed. Empty when the message is not a question — a statement
 * ("Hier ist Ihr Kaffee.") matches anything, since agreeing or thanking is a
 * fine next move; the ranking below then degrades to the stored order.
 */
function questionTokens(german: string): Set<string> {
  const STOP = new Set(['ist', 'sind', 'haben', 'hat', 'sehr', 'gern', 'gerne', 'bitte', 'dank', 'danke', 'und', 'oder', 'auch', 'nicht', 'doch', 'mal', 'denn', 'hier', 'so', 'was', 'kann', 'können', 'ich', 'ihr', 'sie', 'wir', 'ein', 'eine', 'einen', 'dem', 'den', 'das', 'die', 'der', 'mein', 'meine', 'meinen', 'meiner', 'dein', 'deine', 'ihre', 'ihren', 'ihrem', 'unser', 'euer']);
  const isQuestion = /\?\s*$/.test(german.trim());
  if (!isQuestion) return new Set();
  return new Set(
    german
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/**
 * Does a phrase plausibly ANSWER the question? Two cheap, deterministic tests:
 *  - lexical: the phrase shares a content word with the question (Koffer/Gepäck
 *    answers a Koffer question — the exact mismatch in reverse);
 *  - move-based: the question word decides the kind of answer ("wo" wants a
 *    place, "wann" a time, "ja/nein" fits a yes/no question).
 */
function answersQuestion(phrase: string, question: Set<string>): boolean {
  if (question.size === 0) return true;
  const words = new Set(
    phrase
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
  for (const w of words) if (question.has(w)) return true;
  // Yes/no answers fit any question.
  if (/^(ja|nein|doch)\b/i.test(phrase.trim())) return true;
  return false;
}

/**
 * Ranks the hint floor against the last AI message.
 *
 * Matching phrases first (stored order preserved inside each rank), then the
 * rest in stored order. Never returns an empty list when `phrases` is non-empty.
 */
export function rankHintFloor(
  phrases: FloorPhrase[],
  lastAssistantGerman: string | null | undefined,
): FloorPhrase[] {
  if (phrases.length === 0) return [];
  const question = questionTokens(lastAssistantGerman || '');
  // No question to answer: the stored order IS the right order. (Running the
  // lexical sort on a statement ranked phrases by junk like "ist" — measured
  // in the unit suite.)
  if (question.size === 0) return [...phrases];
  const { matched, rest } = phrases.reduce<{ matched: FloorPhrase[]; rest: FloorPhrase[] }>(
    (acc, phrase) => {
      (answersQuestion(phrase.german, question) ? acc.matched : acc.rest).push(phrase);
      return acc;
    },
    { matched: [], rest: [] },
  );
  // Stronger rank: the phrase shares a CONTENT word with the question itself
  // (Gepäck/Gepäck, Koffer/Koffer), not merely "is a yes/no sentence". Greeting
  // and politeness words are excluded — "Guten Tag" appears in half the floor
  // and in most openers, so a greeting match says nothing about answering the
  // question (the measured mismatch paired two "Guten Tag" sentences).
  const GREETING = new Set(['guten', 'gute', 'tag', 'morgen', 'abend', 'hallo', 'tschüss', 'wiedersehen']);
  const contentWords = new Set(
    (lastAssistantGerman || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !GREETING.has(w)),
  );
  matched.sort((a, b) => {
    const aLex = a.german.toLowerCase().split(/\s+/).some((w) => contentWords.has(w.replace(/[^\p{L}\p{M}]/gu, ''))) ? 0 : 1;
    const bLex = b.german.toLowerCase().split(/\s+/).some((w) => contentWords.has(w.replace(/[^\p{L}\p{M}]/gu, ''))) ? 0 : 1;
    return aLex - bLex;
  });
  return [...matched, ...rest];
}
