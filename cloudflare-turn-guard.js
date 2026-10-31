/**
 * The bare-greeting guard (V30 FIX 3).
 *
 * MEASURED BEHAVIOUR (before this module)
 * The learner answered the scenario opener with just «hallo» and the partner
 * replied «Hallo! Mir geht es gut.» — an answer to a question nobody had asked.
 * The opener asked «Wie heißen Sie?» / «Was möchten Sie trinken?»; the model
 * treated the greeting as if the scene had asked about wellbeing, and the
 * learner was left answering a question that did not exist in the conversation.
 *
 * THE RULE
 * A reply must never invent a question to answer. When the learner's message
 * carries no content — a bare greeting, or a single word that appears nowhere in
 * the scene — the partner says something short and natural and then gently
 * re-asks, using a line that is inside the level's own caps (word count, tense,
 * connectors) because it is fixed text, not model output.
 *
 * Deliberately NOT guarded: a one-word answer that belongs to the scene
 * («Kaffee», «Ja», «Danke») is a real answer and is left to the model — the
 * guard only fires when the message provably carries nothing to answer.
 */

import { OPENER_GLOSSES } from "./cloudflare-opener-glosses.generated.js";
import { validateGermanAgainstLevel } from "./cloudflare-level-spec.js";

/** Words that make a message a greeting rather than an answer. */
const GREETING_WORDS = new Set([
  'hallo', 'hello', 'hi', 'hey', 'hej', 'servus', 'moin', 'tag', 'guten', 'grüß', 'gruess',
  'gott', 'morgen', 'abend', 'nachmittag', 'tschuess', 'tschüss', 'ciao', 'salut',
  'hallöchen', 'huhu', 'allo', 'moinmoin',
]);

/**
 * Greeting comparison that survives a typo or a held key: «halo», «hello»,
 * «halloooo», «hiiii». Squashing every run of a letter to one turns all of them
 * into a form that is already in the set above. It is only used for greetings,
 * never for scene matching — «Kaffee» must not become «kafe».
 */
const squashLetters = (token) => token.replace(/(\p{L})\1+/gu, '$1');
const SQUASHED_GREETINGS = new Set([...GREETING_WORDS].map((word) => squashLetters(word)));

function isGreetingToken(token) {
  return GREETING_WORDS.has(token) || SQUASHED_GREETINGS.has(squashLetters(token));
}

/** A wave on its own is a greeting; plain punctuation is not. */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

/** Short words that carry no topic on their own. */
const EMPTY_WORDS = new Set([
  'ok', 'okay', 'ja', 'nein', 'doch', 'bitte', 'danke', 'gut', 'hmm', 'hm', 'ach',
  'so', 'na', 'also', 'jawohl', 'klar',
]);

/**
 * Fillers doubled into a word of their own: «Jaja», «okok», «neinnein». They read as
 * an answer, not as a question, so the guard must leave them to the model.
 */
function isDoubledFiller(token) {
  for (let size = 2; size <= 4; size += 1) {
    const chunk = token.slice(0, size);
    if (token.length !== size * 2) continue;
    if (EMPTY_WORDS.has(chunk) && token.slice(size) === chunk) return true;
  }
  return false;
}

const words = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** A message that is only a greeting: «hallo», «Hallo!», «Guten Morgen». */
export function isBareGreeting(text) {
  const raw = String(text || '');
  const tokens = words(raw);
  // No letters at all: an emoji wave is a greeting, plain punctuation is not.
  if (tokens.length === 0) return EMOJI.test(raw);
  if (tokens.length > 4) return false;
  return tokens.every(isGreetingToken);
}

/**
 * A single word that is not a greeting, not a yes/no filler, and appears nowhere
 * in the scene's own German: the learner typed something the partner cannot
 * answer as if it were a reply.
 */
export function isOffTopicSingleWord(text, sceneGerman) {
  const tokens = words(text);
  if (tokens.length !== 1) return false;
  const token = tokens[0];
  if (isGreetingToken(token) || EMPTY_WORDS.has(token) || isDoubledFiller(token)) return false;
  if (/^\d+$/.test(token)) return false;
  const scene = new Set(words(sceneGerman));
  if (scene.has(token)) return false;
  // A short suffix/prefix match still counts as "in the scene" (Kaffee/Kaffees).
  for (const sceneWord of scene) {
    if (sceneWord.length < 4) continue;
    if (sceneWord.startsWith(token) || token.startsWith(sceneWord)) return false;
  }
  return true;
}

/** Sentence boundaries without lookbehind (the worker runs this in every V8). */
function splitSentences(text) {
  return String(text || '')
    .trim()
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) || [];
}

const ARABIC_GREETING = /^(أهلاً|أهلا|نهارك سعيد|صباح الخير|مساء الخير)/;

/**
 * The scene's own last ask, paired with the reviewed Arabic that ships for that
 * opener.
 *
 * WHY THE SCENE'S OWN LINE: a bare «hallo» used to be answered with a fixed
 * «Wie geht es Ihnen?» — a wellbeing question the scene never asked. The learner
 * then had to answer a question that did not exist in the conversation. When the
 * scene is one of the stored openers, the re-ask is the opener's own last
 * sentence (in the missing-luggage scene: «Fehlt Ihr Gepäck?»), so the turn
 * returns to the topic the learner is actually practising.
 *
 * Returns null when the scene is not a stored opener (for example a later model
 * turn), so the caller keeps the fixed, level-safe fallback.
 */
export function sceneTopicReAsk(sceneGerman, level = 'A1') {
  const key = String(sceneGerman || '').replace(/\s+/g, ' ').trim();
  const gloss = OPENER_GLOSSES[key];
  if (!gloss) return null;
  const deParts = splitSentences(key);
  const arParts = splitSentences(gloss);
  if (deParts.length === 0 || arParts.length === 0) return null;
  const ask = deParts[deParts.length - 1];
  const askAr = arParts[arParts.length - 1];
  // The opener usually starts with its own greeting; the ask itself does not.
  const de = /^(hallo|hi|hey|hej|servus|moin|guten)\b/i.test(ask) ? ask : `Hallo! ${ask}`;
  const ar = ARABIC_GREETING.test(askAr) ? askAr : `أهلاً! ${askAr}`;
  // The opener is authored at its level, so this fails only if the pairing is
  // off — in which case the caller's fixed re-ask is safer than an off-spec line.
  if (!validateGermanAgainstLevel(de, level).ok) return null;
  return { de, ar };
}

/**
 * Fixed re-asks, one per level. Inside each level's caps by construction:
 * A0 6 words/sentence, A1 8, A2 10, B1 12, B2 15; Präsens only; and no
 * connector a lower level does not allow.
 */
const RE_ASK = {
  A0: { de: ['Hallo! Wie geht es Ihnen?', 'Hallo! Wie geht es dir?'], ar: 'أهلاً! كيف حالك؟' },
  A1: { de: ['Hallo! Schön, Sie zu sehen. Wie geht es Ihnen?', 'Hallo! Schön, dich zu sehen. Wie geht es dir?'], ar: 'أهلاً! سعيد بلقائك. كيف حالك؟' },
  A2: { de: ['Hallo! Schön, Sie zu sehen. Wie geht es Ihnen heute?', 'Hallo! Schön, dich zu sehen. Wie geht es dir heute?'], ar: 'أهلاً! سعيد بلقائك. كيف حالك اليوم؟' },
  B1: { de: ['Guten Tag! Freut mich, Sie zu sehen. Wie geht es Ihnen heute?', 'Hallo! Freut mich, dich zu sehen. Wie geht es dir heute?'], ar: 'نهارك سعيد! يسعدني لقاؤك. كيف حالك اليوم؟' },
  B2: { de: ['Guten Tag! Freut mich, Sie zu sehen. Wie geht es Ihnen heute?', 'Hallo! Freut mich, dich zu sehen. Wie geht es dir heute?'], ar: 'نهارك سعيد! يسعدني لقاؤك. كيف حالك اليوم؟' },
};

/** The acknowledgement in front of the re-ask when the message was off-topic. */
const ACK = {
  A0: { de: 'Gut. ', ar: 'حسنًا. ' },
  A1: { de: 'Verstanden. ', ar: 'فهمت. ' },
  A2: { de: 'Alles klar. ', ar: 'حسنًا. ' },
  B1: { de: 'Alles klar. ', ar: 'حسنًا. ' },
  B2: { de: 'Alles klar. ', ar: 'حسنًا. ' },
};

/**
 * Applies the guard.
 *
 * @returns the reply unchanged when the message had content, or the fixed
 *   greeting/re-ask pair (German + its own Arabic, so the two bubbles always
 *   agree) when it did not.
 */
export function guardGreetingReply({ learnerText, replyDe, replyAr, sceneGerman = '', level = 'A1' } = {}) {
  const spec = RE_ASK[level] || RE_ASK.A1;
  const ack = ACK[level] || ACK.A1;
  const greeting = isBareGreeting(learnerText);
  // A stored opener can re-ask its own topic; a later turn keeps the fixed
  // fallback below, because no reviewed Arabic ships for model-written lines.
  if (greeting) {
    const topic = sceneTopicReAsk(sceneGerman, level);
    if (topic) return { replyDe: topic.de, replyAr: topic.ar, guarded: true, reason: 'bare_greeting' };
  }
  const offTopic = !greeting && isOffTopicSingleWord(learnerText, sceneGerman);
  if (!greeting && !offTopic) return { replyDe, replyAr, guarded: false, reason: 'has_content' };

  // A greeting has no gender to guess: pick the polite form (the persona speaks
  // to an adult learner) and keep the learner's own register when it is obvious.
  const informal = /\b(du|dir|dich)\b/i.test(String(sceneGerman || ''));
  const de = spec.de[informal ? 1 : 0];
  const text = greeting ? de : `${ack.de}${de}`;
  return {
    replyDe: text,
    replyAr: greeting ? spec.ar : `${ack.ar}${spec.ar}`,
    guarded: true,
    reason: greeting ? 'bare_greeting' : 'off_topic_single_word',
  };
}