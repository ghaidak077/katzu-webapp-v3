/**
 * Turn-quality validators for the live conversation (V28 Stage 1C).
 *
 * The owner's report from real use: "Chat is sometimes illogical, hints are
 * sometimes unsuitable, and the questions and answers do not follow a logical
 * sequence." Each symptom has one deterministic cause, and each is fixed here as
 * a pure function so it is unit-testable without a provider and runs in CI:
 *
 *   • Hints: the embedded `next_hint` was accepted whenever it was non-empty, so
 *     a hint could answer a different question than the one just asked (the
 *     observed "Fehlt Ihr Gepäck?" answered with "Hier ist mein Pass").
 *   • Corrections: a correction was shipped whenever `is_correct` was false —
 *     including corrections that changed nothing, or that "corrected" a sentence
 *     the learner had already written correctly.
 *   • Obstacles: the persona's repeat/follow-up behaviours fired on a fixed cycle
 *     with no gate, so they appeared on the first turn and immediately after the
 *     learner asked for a repetition.
 *
 * This module owns no worker state; the handler imports the three functions.
 */

/** A learner asking the partner to repeat or rephrase. */
const REPEAT_ASK_RE = /\b(wiederhol\w*|nochmal|noch mal|wie bitte|nicht verstanden|langsamer|bitte wiederholen)\b/i;

/**
 * A German question is a yes/no question unless it opens with a question word —
 * so detecting the question word is the whole rule. The word is searched in the
 * first few tokens because a line may lead with a greeting ("Guten Tag, was …").
 */
const WH_WORD = /\b(wer|wen|wem|wessen|was|wo|wann|warum|wieso|weshalb|wie viel|wie viele|wie oft|wie|wohin|woher|welch\w*)\b/i;

/** Wh-questions that ask for a specific slot, so the answer must fill it. */
const SLOT_WH = /^(wann|wo|wohin|woher|wer|wen|wem|wessen|wie viel|wie viele|wie oft|warum|wieso|weshalb)\b/i;

const TIME_MARKERS = /\b(heute|morgen|gestern|jetzt|nachher|spaeter|später|frueh|früh|abends|morgens|taeglich|täglich|monatlich|uhr|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|um \w+)\b/i;
const PLACE_MARKERS = /\b(hier|dort|da|zuhause|hause|bahnhof|strasse|straße|platz|buero|büro|zuhause)\b/i;
const NUMBER_MARKERS = /\b(ein|eine|einen|einem|zwei|drei|vier|fuenf|fünf|sechs|sieben|acht|neun|zehn|viele|wenige)\b|\d/;

/** Words a sentence supplies anyway; they never carry the topic. */
const FUNCTION_WORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mich', 'dich', 'sich', 'uns', 'euch', 'mir', 'dir', 'ihm', 'ihnen', 'man',
  'ist', 'sind', 'bist', 'seid', 'war', 'waren', 'sein', 'gewesen', 'bin',
  'habe', 'hast', 'hat', 'haben', 'habt', 'hatte', 'hatten',
  'werde', 'wirst', 'wird', 'werden', 'werdet', 'wurde', 'wurden',
  'und', 'oder', 'aber', 'doch', 'nicht', 'kein', 'keine', 'keinen', 'ja', 'nein', 'bitte', 'mal',
  'hier', 'dort', 'da', 'so', 'sehr', 'auch', 'noch', 'schon', 'denn', 'dann', 'zu', 'in', 'im', 'am', 'an', 'auf', 'mit', 'von', 'bei',
]);

function normalizeGerman(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The content words of a German line: normalised, function words removed. */
export function contentWords(line) {
  return normalizeGerman(line)
    .split(' ')
    .filter((word) => word.length > 1 && !FUNCTION_WORDS.has(word));
}

/**
 * The question type of a line, so an answer can be checked against it:
 * `yesno` (ist/kann/hast …), `wh` (wer/was/wo …), `none` (not a question) or
 * `other` (a question that does not start with a recognised opener).
 */
export function questionType(line) {
  const text = String(line || '').trim().replace(/^["«»]+|["«»]+$/g, '').trim();
  if (!text.endsWith('?')) return 'none';
  const head = text.split(/[\s,;]+/).slice(0, 5).join(' ');
  return WH_WORD.test(head) ? 'wh' : 'yesno';
}

/**
 * Does the hint plausibly answer the last AI message?
 *
 * A yes/no question needs a polarity answer or a reply that echoes its topic; a
 * wh-question needs a statement that echoes its topic (another bare question does
 * not answer it). When the last line is not a question there is nothing to match,
 * so anything readable passes. This is a floor, not a judge: a failing hint is
 * dropped and the validated on-demand hint floor takes over.
 */
export function hintMatchesQuestion(lastAiReply, hintGerman) {
  const type = questionType(lastAiReply);
  if (type === 'none') return true;
  const hint = String(hintGerman || '').trim();
  if (!hint) return false;
  const questionWords = new Set(contentWords(lastAiReply));
  const overlap = contentWords(hint).some((word) => questionWords.has(word));
  if (type === 'yesno') {
    const polarity = /^(ja|nein|doch|genau|klar|sicher|natuerlich|natürlich|leider|vielleicht)\b/i.test(hint);
    return polarity || overlap;
  }
  // wh: a slot question needs the topic or the slot filled; an open question
  // (was/wie) accepts any statement that is not itself another question.
  if (SLOT_WH.test(String(lastAiReply || ''))) {
    if (/^wann\b/i.test(lastAiReply)) return overlap || TIME_MARKERS.test(hint);
    if (/^(wo|wohin|woher)\b/i.test(lastAiReply)) return overlap || PLACE_MARKERS.test(hint);
    if (/^wie (viel|viele|oft)\b/i.test(lastAiReply)) return overlap || NUMBER_MARKERS.test(hint);
    return overlap || !hint.endsWith('?');
  }
  return overlap || !hint.endsWith('?');
}

/**
 * Is this evaluation safe to show as a correction?
 *
 * Rejects an incomplete correction, a correction that changes nothing once case,
 * punctuation and umlaut transliteration are folded, and one that "corrects" a
 * sentence the learner already wrote correctly.
 */
export function evaluateCorrection({ isCorrect, originalMistake, correctedGerman, learnerSentence }) {
  if (isCorrect) return { ok: true, reasons: [] };
  const original = String(originalMistake || '').trim();
  const corrected = String(correctedGerman || '').trim();
  if (!original || !corrected) return { ok: false, reasons: ['correction_incomplete'] };
  const before = normalizeGerman(original);
  const after = normalizeGerman(corrected);
  if (!after || before === after) return { ok: false, reasons: ['correction_no_change'] };
  const learner = normalizeGerman(learnerSentence);
  if (learner && learner === after) return { ok: false, reasons: ['learner_already_correct'] };
  return { ok: true, reasons: [] };
}

/** True when the learner's most recent message in the history asks for a repeat. */
export function learnerAskedRepeat(history) {
  return REPEAT_ASK_RE.test(latestLearnerText(history));
}

/** The text of the learner's most recent message in a shaped history array. */
export function latestLearnerText(history) {
  if (!Array.isArray(history)) return '';
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    const role = message?.role || message?.sender;
    if (role === 'user' || role === 'USER') {
      return String(message?.content ?? message?.text ?? message?.germanText ?? message?.userMessage ?? '').trim();
    }
  }
  return '';
}

/**
 * The rotating live-conversation behaviours, kept as data so the gating rule and
 * the wording live together.
 */
export const OBSTACLE_CYCLE = [
  'ask exactly one natural follow-up question about what the learner just said, as a curious real person would',
  "check one detail you half-caught ('Wie bitte?' or a short paraphrase question) and let the learner restate it before moving on",
  'react with a brief natural emotion (surprise, relief, amusement) before you continue, then keep your goal in the scene moving forward',
  "carry the scene's own goal one concrete step forward (time, place, amount, next action) as the counterpart would",
];

const DIRECT_ANSWER_ONLY =
  "LIVE-CONVERSATION BEHAVIOUR: answer the learner's sentence directly and keep your goal in the scene moving forward.";

const OBSTACLE_TAIL =
  "The learner's sentence always gets a direct answer first. Never reveal, confirm or solve the learner's intended meaning for them — if their German was unclear, ask them to rephrase instead of guessing for them.";

/**
 * The obstacle instruction for a turn, or a plain direct-answer instruction when
 * no obstacle applies. An obstacle is withheld on the first turn (the learner has
 * not been heard yet) and whenever the learner just asked for a repetition (that
 * request IS the move; piling a second obstacle on it is what made the chat feel
 * illogical).
 */
export function obstacleApplies(turnIndex, { learnerAskedRepeat: askedRepeat = false } = {}) {
  const index = Number.isFinite(Number(turnIndex)) ? Math.max(0, Number(turnIndex)) : 0;
  return index > 0 && !askedRepeat;
}

export function obstacleInstructionForTurn(turnIndex, { learnerAskedRepeat: askedRepeat = false } = {}) {
  const index = Number.isFinite(Number(turnIndex)) ? Math.max(0, Number(turnIndex)) : 0;
  if (!obstacleApplies(index, { learnerAskedRepeat: askedRepeat })) {
    return `${DIRECT_ANSWER_ONLY} ${OBSTACLE_TAIL}`;
  }
  return `LIVE-CONVERSATION BEHAVIOUR (rotate; do not announce it): this turn, ${OBSTACLE_CYCLE[index % OBSTACLE_CYCLE.length]}. ${OBSTACLE_TAIL}`;
}
