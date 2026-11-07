/**
 * Deterministic suggestion guard.
 *
 * WHY THIS EXISTS
 * The suggestion sheet must offer a line that ANSWERS the last thing Katzu said
 * in THIS conversation. Two measured failures:
 *  - the café floor kept offering «Ich möchte einen Kaffee.» after the learner
 *    said «Ich liebe meine Katze», because the starter phrases are stored per
 *    scenario and the ranking only compared content words;
 *  - an unvalidated model hint could introduce a topic nobody mentioned.
 *
 * The guard rejects a suggestion when it names a topic anchor (coffee, luggage,
 * doctor, rent …) that the conversation has not introduced. It never requires a
 * word overlap in the opposite direction — a plain yes/no or a self-introduction
 * is a valid answer and must survive.
 *
 * Pure, offline, no model call.
 */

/** Topic words that must already exist in the conversation to appear in a suggestion. */
const TOPIC_ANCHORS: ReadonlyArray<ReadonlyArray<string>> = [
  ['kaffee', 'tee', 'kuchen', 'getränk', 'getraenk', 'cappuccino', 'latte', 'espresso', 'saft', 'wasser', 'frühstück', 'fruehstueck'],
  ['koffer', 'gepäck', 'gepaeck', 'flug', 'flughafen', 'bordkarte', 'zoll', 'terminal', 'abflug'],
  ['arzt', 'arztpraxis', 'termin', 'schmerz', 'schmerzen', 'medikament', 'rezept', 'krankenhaus'],
  ['wohnung', 'miete', 'zimmer', 'vermieter', 'nachbar', 'schlüssel', 'schluessel', 'umzug'],
  ['rechnung', 'bezahlen', 'karte', 'bar', 'kasse', 'preis', 'euro'],
];

/**
 * Openers that are answer-shaped on their own. Demonstratives («das/der/die»)
 * are deliberately absent: «Das Wetter ist heute schön.» would otherwise pass as
 * an answer to any question, which is the exact off-topic failure this guard
 * exists to stop. A demonstrative answer still survives through the shared-stem
 * check below when it talks about the asked topic.
 */
const ANSWER_OPENERS = /^(ja|nein|doch|ich|wir|mein|meine|meinen|gern|gerne|bitte|danke|entschuldigung|nicht)\b/i;

/** Strip punctuation and lowercase, so «Kaffee.» and «kaffee» compare equal. */
function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A coarse stem: the first four letters, enough for heißen/heiße/heißt to meet. */
function stem(word: string): string {
  return word.length >= 4 ? word.slice(0, 4) : word;
}

function contentWords(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(' ')
      .filter((word) => word.length > 2)
      .map(stem),
  );
}

/**
 * True when `hint` stays inside the conversation's own topic.
 *
 * `contextTexts` should include the last Katzu line, the learner's last line and
 * the scenario title/goal — the three places a topic can legitimately come from.
 */
export function suggestionFitsContext(hint: string, contextTexts: Array<string | null | undefined>): boolean {
  const hintText = normalize(hint);
  if (!hintText) return false;

  const context = contextTexts.filter(Boolean).join(' ');
  const contextNormalized = normalize(context);
  if (!contextNormalized) return true;

  const contextWords = contentWords(context);

  // 1. No topic the conversation has not introduced.
  for (const group of TOPIC_ANCHORS) {
    const hinted = group.find((anchor) => hintText.includes(anchor));
    if (!hinted) continue;
    const introduced = group.some((anchor) => contextNormalized.includes(anchor));
    if (!introduced) return false;
  }

  // 2. When the last line asks a question, the suggestion must at least make an
  //    answer-shaped move: share a content stem, or open like an answer. This
  //    rejects a canned statement that has nothing to do with the question while
  //    keeping yes/no and self-introductions.
  const lastLine = String(contextTexts[0] || '').trim();
  if (/\?\s*$/.test(lastLine)) {
    if (ANSWER_OPENERS.test(hintText.trim())) return true;
    for (const word of hintText.split(' ')) {
      if (word.length > 2 && contextWords.has(stem(word))) return true;
    }
    return false;
  }

  return true;
}
