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

/** Words that make a message a greeting rather than an answer. */
const GREETING_WORDS = new Set([
  'hallo', 'hi', 'hey', 'hej', 'servus', 'moin', 'tag', 'guten', 'grüß', 'gruess',
  'gott', 'morgen', 'abend', 'nachmittag', 'tschuess', 'tschüss', 'ciao', 'salut',
]);

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
  const tokens = words(text);
  if (tokens.length === 0 || tokens.length > 4) return false;
  return tokens.every((token) => GREETING_WORDS.has(token));
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
  if (GREETING_WORDS.has(token) || EMPTY_WORDS.has(token) || isDoubledFiller(token)) return false;
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