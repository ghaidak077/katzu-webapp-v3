/**
 * The local German checker.
 *
 * WHY THIS EXISTS
 * Before this module every correction came from one fused AI call, and the model
 * returned only the broken PART of the sentence (`corrected_german` /
 * `original_mistake`). The card therefore showed a fragment instead of the
 * sentence, and a multi-word or capitalisation-only error could be dropped
 * entirely by `evaluateCorrection` when the fragment did not change after
 * folding case. It also meant spelling and noun-capitalisation rules cost a
 * model call and were worded differently every turn.
 *
 * This checker runs locally, before the model's evaluation is trusted, and:
 *   • returns the FULL corrected sentence;
 *   • emits one structured error per problem, with a German chip label and a
 *     short Arabic reason from a fixed rule library;
 *   • orders errors by what a learner must fix first: meaning → grammar →
 *     spelling → capitalisation;
 *   • never makes a network request.
 *
 * It is deliberately conservative: it only corrects a word when it is certain
 * (a shipped noun, a known spelling after an ie/ei or ß/ss swap, a clear
 * greeting/vocative comma, a time-adverb V2 inversion). A missed error is safer
 * than teaching a wrong correction.
 */

import { KNOWN_WORDS, MASS_NOUNS, NOUNS, PROPER_NOUNS } from './germanLexicon.generated';
import type { LexiconNoun } from './germanLexicon.generated';
import type { CEFRLevel } from '@/types/models';

export type CorrectionCategory = 'meaning' | 'grammar' | 'spelling' | 'capitalisation';

export interface CorrectionError {
  category: CorrectionCategory;
  /** Short German chip label, e.g. «Nomen großschreiben». */
  label: string;
  /** Short Arabic reason shown under the chip. */
  reasonAr: string;
  /** What the learner wrote for this point. */
  from: string;
  /** What the corrected sentence uses. */
  to: string;
}

export interface GermanCheckResult {
  /** The learner's sentence with every confident correction applied. */
  corrected: string;
  /** Ordered meaning → grammar → spelling → capitalisation. */
  errors: CorrectionError[];
  ok: boolean;
  /**
   * A missing final punctuation mark is NOT an error: a learner typing in a chat
   * box is not failing a punctuation exercise. It is offered as this optional
   * note only, and the corrected sentence never gains a mark the learner did not
   * write.
   */
  softNoteAr?: string;
}

/** Deterministic rules, so the chip and the Arabic explanation cannot disagree. */
export const RULE_LIBRARY = {
  meaningGift: {
    category: 'meaning' as const,
    label: 'Bedeutung: Gift ≠ Geschenk',
    reasonAr: '«Gift» تعني السُّم؛ الهدية هي «Geschenk».',
  },
  meaningWerden: {
    category: 'meaning' as const,
    label: 'Bedeutung: werden + alt',
    reasonAr: 'العمر يُقال بـ «werden»: Ich werde 20 Jahre alt.',
  },
  nounCapital: {
    category: 'capitalisation' as const,
    label: 'Nomen großschreiben',
    reasonAr: 'كل الأسماء في الألمانية تُكتب بحرف أول كبير.',
  },
  sentenceStart: {
    category: 'capitalisation' as const,
    label: 'Satzanfang groß',
    reasonAr: 'أول كلمة في الجملة تُكتب بحرف كبير.',
  },
  properName: {
    category: 'capitalisation' as const,
    label: 'Name großschreiben',
    reasonAr: 'أسماء الأشخاص تُكتب بحرف أول كبير.',
  },
  greetingComma: {
    category: 'grammar' as const,
    label: 'Komma nach Anrede',
    reasonAr: 'بعد التحية أو الاسم المنادى تأتي فاصلة قبل بقية الجملة.',
  },
  articleMissing: {
    category: 'grammar' as const,
    label: 'Artikel ergänzen',
    reasonAr: 'الاسم المفرد يحتاج أداة تنكير: ein / eine / einen.',
  },
  articleGender: {
    category: 'grammar' as const,
    label: 'Artikel: der / die / das',
    reasonAr: 'أداة التعريف يجب أن تطابق جنس الاسم.',
  },
  articleCase: {
    category: 'grammar' as const,
    label: 'Artikel: richtiger Fall',
    reasonAr: 'بعد أفعال مثل «haben / brauchen / lieben» يأتي المفعول في حالة النصب: den / einen.',
  },
  verbSecond: {
    category: 'grammar' as const,
    label: 'Verb an Position 2',
    reasonAr: 'إذا بدأت الجملة بظرف زمان، يأتي الفعل في الموضع الثاني.',
  },
  spellingIeEi: {
    category: 'spelling' as const,
    label: 'Schreibung: ie statt ei',
    reasonAr: 'الكتابة الصحيحة لهذه الكلمة فيها «ie» وليس «ei».',
  },
  spellingSharpS: {
    category: 'spelling' as const,
    label: 'Schreibung: ß statt ss',
    reasonAr: 'هذه الكلمة تُكتب بـ «ß» وليس «ss».',
  },
  spellingUmlaut: {
    category: 'spelling' as const,
    label: 'Umlaut fehlt',
    reasonAr: 'تحتاج هذه الكلمة إلى حرف أملاوت (ä/ö/ü) وليست كتابتها بدون نقاط.',
  },
} satisfies Record<string, Omit<CorrectionError, 'from' | 'to'>>;

/**
 * ASCII spellings of words whose correct form carries an umlaut.
 *
 * Only unambiguous forms are listed: «schon» (already), «mochte» (past of
 * mögen), «wurde» and «zahlen» are real German words themselves, so correcting
 * them would teach a wrong rule. These entries are words a learner cannot mean
 * without the umlaut.
 */
const UMLAUT_WORDS: Record<string, string> = {
  gefallt: 'gefällt',
  gefaellt: 'gefällt',
  konnen: 'können',
  koennen: 'können',
  uber: 'über',
  ueber: 'über',
  fur: 'für',
  fuer: 'für',
  zuruck: 'zurück',
  zurueck: 'zurück',
  gluck: 'Glück',
  glueck: 'Glück',
  wunsche: 'wünsche',
  wuensche: 'wünsche',
  moechte: 'möchte',
  mogen: 'mögen',
  moegen: 'mögen',
  naturlich: 'natürlich',
  natuerlich: 'natürlich',
  personlich: 'persönlich',
  hoeren: 'hören',
  horen: 'hören',
  fruh: 'früh',
  frueh: 'früh',
  schuler: 'Schüler',
  schueler: 'Schüler',
  moglich: 'möglich',
  moeglich: 'möglich',
};

const CATEGORY_ORDER: Record<CorrectionCategory, number> = {
  meaning: 0,
  grammar: 1,
  spelling: 2,
  capitalisation: 3,
};

interface Token {
  pre: string;
  core: string;
  post: string;
}

const WORD_TOKEN = /^([^\p{L}\p{N}]*)([\p{L}\p{N}ß-]*)([^\p{L}\p{N}]*)$/u;

function tokenize(text: string): Token[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      const match = raw.match(WORD_TOKEN);
      if (!match) return { pre: '', core: raw, post: '' };
      return { pre: match[1], core: match[2], post: match[3] };
    });
}

function render(tokens: Token[]): string {
  return tokens.map((token) => `${token.pre}${token.core}${token.post}`).join(' ');
}

const lower = (value: string) => value.toLowerCase();
const isUpperFirst = (value: string) => /^[A-ZÄÖÜ]/.test(value);
const capitalize = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : value);

/** Words that can carry the finite verb in a simple A0–A1 sentence. */
const VERB_FORMS = new Set([
  'bin', 'bist', 'ist', 'sind', 'seid', 'habe', 'hast', 'hat', 'haben', 'habt',
  'werde', 'wirst', 'wird', 'werden', 'werdet', 'bekomme', 'bekommst', 'bekommt',
  'liebe', 'liebst', 'liebt', 'heiße', 'heißt', 'heissen', 'heisst',
  'komme', 'kommst', 'kommt', 'gehe', 'gehst', 'geht', 'wohne', 'wohnst', 'wohnt',
  'trinke', 'trinkst', 'trinkt', 'esse', 'isst', 'lerne', 'lernst', 'lernt',
  'spreche', 'sprichst', 'spricht', 'mache', 'machst', 'macht', 'kaufe', 'kaufst',
  'kauft', 'gebe', 'gibst', 'gibt', 'nehme', 'nimmst', 'nimmt', 'sehe', 'siehst',
  'sieht', 'möchte', 'möchtest', 'möchtet', 'kann', 'kannst', 'könnt', 'muss',
  'musst', 'müsst', 'brauche', 'brauchst', 'braucht', 'besuche', 'besuchst', 'besucht',
]);

const DETERMINERS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'kein', 'keine', 'keinen', 'keinem', 'keiner', 'mein', 'meine', 'meinen', 'meinem', 'meiner',
  'dein', 'deine', 'deinen', 'deinem', 'deiner', 'sein', 'seine', 'seinen', 'seinem', 'seiner',
  'ihr', 'ihre', 'ihren', 'ihrem', 'ihrer', 'unser', 'unsere', 'unseren', 'unserem', 'unserer',
  'euer', 'eure', 'euren', 'eurem', 'eurer', 'dieser', 'diese', 'dieses', 'diesen', 'diesem',
]);

/**
 * Case clues. A0–A1 learners meet accusative objects after these verbs long
 * before they meet a case table, so a wrong article here is a real error that
 * can be corrected without guessing: «Ich habe der Hund» must become «den Hund»,
 * never be left as a grammatically wrong sentence that the checker calls clean.
 */
const ACCUSATIVE_VERBS = new Set([
  'habe', 'hast', 'hat', 'haben', 'habt', 'hatte', 'hatten',
  'brauche', 'brauchst', 'braucht', 'kaufe', 'kaufst', 'kauft',
  'möchte', 'möchtest', 'möchtet', 'trinke', 'trinkst', 'trinkt',
  'esse', 'isst', 'liebe', 'liebst', 'liebt', 'sehe', 'siehst', 'sieht',
  'nehme', 'nimmst', 'nimmt', 'suche', 'suchst', 'sucht', 'finde', 'findest', 'findet',
  'besuche', 'besuchst', 'besucht', 'verstehe', 'verstehst', 'versteht',
  // Plural forms: «wir trinken ein Tee» is the same error as «ich trinke …».
  'trinken', 'essen', 'lieben', 'sehen', 'nehmen', 'kaufen', 'brauchen', 'besuchen',
  'suchen', 'finden', 'verstehen', 'mögen', 'möchtet', 'wollen', 'wollt',
]);
const ACCUSATIVE_PREPOSITIONS = new Set(['für', 'fuer', 'ohne', 'gegen', 'durch', 'um']);
const DATIVE_PREPOSITIONS = new Set(['mit', 'bei', 'nach', 'aus', 'von', 'zu', 'seit']);

/** The case a determiner at `index` most likely has, when the clue is certain. */
function nounCase(tokens: Token[], index: number): 'accusative' | 'dative' | 'unknown' {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const word = lower(tokens[cursor].core);
    // A sentence-initial finite verb opens a yes/no question and the noun
    // phrase after it is the SUBJECT: «Hat der Zug Verspätung?» is nominative.
    // Reading it as an object turned a correct question into «den Zug».
    if (cursor === 0 && VERB_FORMS.has(word)) return 'unknown';
    if (WEAK_PREPOSITIONS.has(word)) return 'unknown';
    if (ACCUSATIVE_PREPOSITIONS.has(word)) return 'accusative';
    if (DATIVE_PREPOSITIONS.has(word)) return 'dative';
    if (ACCUSATIVE_VERBS.has(word)) return 'accusative';
    if (VERB_FORMS.has(word)) return 'unknown';
    if (SUBJECT_PRONOUNS.has(word) || word === 'nicht' || TIME_ADVERBS.has(word)) continue;
    if (DETERMINERS.has(word)) continue;
    break;
  }
  return 'unknown';
}

const POSSESSIVE_DETERMINER = /^(mein|dein|sein|ihr|unser|euer|kein)(e|en|em|er|es)?$/;

/**
 * A gender mismatch the checker can prove without knowing the case.
 *
 * Case-marked forms (den/dem/einen/einem/einer/…), «der» (which is also dative
 * feminine) and every possessive are left alone when the case is unknown: the
 * measured false corrections were «den Mietvertrag» → «der Mietvertrag» and
 * «einen Kurs» → «ein Kurs», both correct German. Only the plain nominative
 * forms can be wrong for gender on their own.
 */
function certainGenderMismatch(nounArticle: LexiconNoun['article'], written: string): boolean {
  if (!nounArticle) return false;
  if (POSSESSIVE_DETERMINER.test(written)) return false;
  // «der» is the correct feminine dative/genitive article, so it is only
  // certain to be wrong in front of a neuter noun («der Auto» → «das Auto»).
  if (written === 'der') return nounArticle === 'das';
  if (written === 'die') return nounArticle !== 'die';
  if (written === 'das') return nounArticle !== 'das';
  if (written === 'ein') return nounArticle === 'die';
  if (written === 'eine') return nounArticle !== 'die';
  return false;
}

/** The determiner a noun needs for its gender and the sentence's likely case. */
function expectedArticle(noun: LexiconNoun, written: string, grammaticalCase: 'accusative' | 'dative' | 'unknown'): string {
  const base = noun.article;
  if (!base) return written;

  const possessive = written.match(POSSESSIVE_DETERMINER);
  if (possessive) {
    const stem = possessive[1];
    let ending: string;
    if (grammaticalCase === 'dative') ending = base === 'die' ? 'er' : 'em';
    else if (grammaticalCase === 'accusative') ending = base === 'der' ? 'en' : base === 'die' ? 'e' : '';
    else ending = base === 'die' ? 'e' : '';
    // «euer» loses its middle e as soon as it takes an ending: eure / eurem.
    const root = stem === 'euer' && ending ? 'eur' : stem;
    return `${root}${ending}`;
  }

  const definite = /^(der|die|das|den|dem)$/.test(written);
  if (definite) {
    if (grammaticalCase === 'dative') return base === 'die' ? 'der' : 'dem';
    if (grammaticalCase === 'accusative') return base === 'der' ? 'den' : base;
    return base;
  }
  if (/^(ein|eine|einen|einem|einer)$/.test(written)) {
    if (grammaticalCase === 'dative') return base === 'die' ? 'einer' : 'einem';
    if (grammaticalCase === 'accusative') return base === 'der' ? 'einen' : base === 'die' ? 'eine' : 'ein';
    return base === 'der' ? 'ein' : base === 'die' ? 'eine' : 'ein';
  }
  return written;
}

const GREETING_PHRASES = [
  'guten morgen', 'guten tag', 'guten abend', 'gute nacht', 'hallo', 'hi', 'hey', 'servus',
  'moin', 'tschüss', 'tschuss', 'auf wiedersehen',
];

const TIME_ADVERBS = new Set(['heute', 'morgen', 'gestern', 'jetzt', 'dann', 'manchmal', 'oft', 'danach', 'später', 'spaeter']);
const SUBJECT_PRONOUNS = new Set(['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr']);
/**
 * Pronouns are never person names. Modern German writes the informal ones
 * lowercase — «Wie heißt du nochmal?» is correct — and the formal «Sie / Ihnen»
 * is always capitalised. This set exists because the proper-name rule after
 * «heißen» used to capitalise the word that followed it, which turned the app's
 * own hint into a false correction.
 */
const PERSONAL_PRONOUNS = new Set([
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'euch',
  'mich', 'dich', 'mir', 'dir', 'uns', 'ihm', 'ihn', 'ihnen',
]);
/** Words that can follow «heißen» without being a name. */
const NAME_STOPWORDS = new Set([
  ...PERSONAL_PRONOUNS,
  'bitte', 'nochmal', 'noch', 'mal', 'doch', 'auch', 'denn', 'eigentlich',
  'nicht', 'sehr', 'gern', 'gerne', 'so', 'ja', 'nein', 'wie', 'wer', 'was',
  // Function words that can follow «heißen» in a normal sentence:
  // «Teamfähigkeit heißt für mich: …» is not a person's name.
  'für', 'fuer', 'mit', 'ohne', 'in', 'im', 'am', 'an', 'auf', 'aus', 'bei',
  'nach', 'von', 'zu', 'zum', 'zur', 'über', 'ueber', 'unter', 'vor', 'hinter',
  'neben', 'zwischen', 'dass', 'wenn', 'weil', 'aber', 'und', 'oder', 'als',
  'das', 'der', 'die', 'dem', 'den', 'des', 'ein', 'eine', 'einen', 'einem',
  'einer', 'eines', 'man', 'hier', 'da', 'dort', 'jetzt', 'heute', 'morgen',
]);
/**
 * Prepositions whose case cannot be inferred without a full grammar parse.
 * Two-way prepositions («in», «auf», «an» …) take accusative OR dative, so the
 * checker must not guess and "correct" a correct article.
 */
const WEAK_PREPOSITIONS = new Set(['in', 'an', 'auf', 'über', 'ueber', 'unter', 'vor', 'hinter', 'neben', 'zwischen']);
/**
 * Finite plural verb forms. If «die X <plural verb>» appears, X is a plural
 * noun and its article is correct: «die Brötchen kommen gerade aus dem Ofen».
 * Without this the gender rule read the plural «Brötchen» as the singular
 * neuter noun and "corrected" a correct sentence.
 */
const PLURAL_VERB_FORMS = new Set([
  'sind', 'haben', 'werden', 'kommen', 'gehen', 'wohnen', 'trinken', 'essen',
  'lernen', 'sprechen', 'machen', 'kaufen', 'geben', 'nehmen', 'sehen', 'möchten',
  'können', 'müssen', 'brauchen', 'besuchen', 'suchen', 'finden', 'verstehen',
  'lieben', 'heißen', 'heissen', 'arbeiten', 'spielen', 'stehen',
]);
/**
 * Infinitives that are also nouns («das Essen»). After «zu» they are verbs and
 * stay lowercase: «etwas zu essen», «zu trinken».
 */
const INFINITIVES = new Set([
  'essen', 'trinken', 'gehen', 'kommen', 'lernen', 'sprechen', 'machen',
  'kaufen', 'geben', 'nehmen', 'sehen', 'arbeiten', 'spielen', 'stehen',
  'wohnen', 'suchen', 'finden', 'verstehen', 'lieben', 'heißen', 'heissen',
  'sein', 'haben', 'werden', 'bleiben', 'fahren', 'lesen', 'schreiben',
  'kochen', 'schlafen', 'helfen', 'zahlen', 'bezahlen', 'warten',
]);
/** Nouns that normally appear without an article: «Sie haben Erfahrung». */
const UNCOUNTABLE_NOUNS = new Set([
  'erfahrung', 'zeit', 'hunger', 'durst', 'stress', 'musik', 'sport',
  'unterricht', 'information', 'angst',
  // Everyday mass/abstract uses that read naturally without an article:
  // «Ich brauche Hilfe», «Ich habe Fieber», «Mein Flug hatte Verspätung».
  'hilfe', 'zucker', 'fieber', 'verspätung', 'verspaetung', 'joghurt',
  'verantwortung', 'sonne', 'regen', 'schnee', 'urlaub',
]);
/** Days and months read without an article after «haben»: «Wir haben Montag frei». */
const CALENDAR_WORDS = new Set([
  'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag',
  'januar', 'februar', 'märz', 'maerz', 'april', 'mai', 'juni', 'juli', 'august',
  'september', 'oktober', 'november', 'dezember',
]);
/** A sentence that opens with one of these is a question even without «?». */
const QUESTION_WORDS = new Set(['wo', 'wohin', 'woher', 'was', 'wie', 'wer', 'wen', 'wann', 'warum', 'welche', 'welcher', 'welches']);

/** Add an error once per (category, from, to); never repeat a cascade. */
function pushError(errors: CorrectionError[], error: CorrectionError): void {
  if (errors.some((e) => e.category === error.category && lower(e.from) === lower(error.from) && lower(e.to) === lower(error.to))) {
    return;
  }
  errors.push(error);
}

/**
 * Correct the sentence deterministically.
 *
 * `_level` is accepted so the signature is stable when level-specific policy is
 * added; A0–A1 already share this one strictness policy, as the product requires
 * a single policy per level band.
 */
export function checkGerman(input: string, _level: CEFRLevel = 'A1'): GermanCheckResult {
  const original = String(input || '').trim();
  if (!original) return { corrected: '', errors: [], ok: true };

  const tokens = tokenize(original);
  const errors: CorrectionError[] = [];

  // 1. Meaning traps. These outrank everything else: a sentence can be spelled
  //    perfectly and still say the opposite of what the learner meant.
  for (const token of tokens) {
    if (lower(token.core) === 'gift' && /\b(für dich|fuer dich|für sie|fuer sie|habe|hab|schenk|mitbring)\b/i.test(original)) {
      pushError(errors, {
        ...RULE_LIBRARY.meaningGift,
        from: token.core,
        to: 'Geschenk',
      });
      token.core = isUpperFirst(token.core) ? 'Geschenk' : 'Geschenk';
    }
  }
  // "Ich bekomme 20 Jahre alt" — age uses werden, not bekommen.
  const ageBekomme = tokens.findIndex(
    (token, index) =>
      /^(bekomme|bekommst|bekommt|bekommen)$/i.test(token.core) &&
      tokens.slice(index + 1).some((next) => /^(jahre|jahr|alt)$/i.test(next.core)),
  );
  if (ageBekomme !== -1) {
    const written = tokens[ageBekomme].core;
    const replacement = /^bekomme$/i.test(written)
      ? 'werde'
      : /^bekommst$/i.test(written)
        ? 'wirst'
        : /^bekommt$/i.test(written)
          ? 'wird'
          : 'werden';
    pushError(errors, { ...RULE_LIBRARY.meaningWerden, from: written, to: replacement });
    tokens[ageBekomme].core = replacement;
  }

  // 2. Spelling: ie/ei and ß/ss swaps, only when the swapped form is a shipped
  //    word. This is what turns «leibe» into «liebe» without guessing.
  for (const token of tokens) {
    const word = token.core;
    if (!word || !/^[A-Za-zÄÖÜäöüß-]+$/.test(word)) continue;
    if (KNOWN_WORDS.has(lower(word))) continue;

    const ieEi = word.includes('ei')
      ? word.replace(/ei/g, 'ie')
      : word.includes('ie')
        ? word.replace(/ie/g, 'ei')
        : null;
    if (ieEi && KNOWN_WORDS.has(lower(ieEi))) {
      pushError(errors, {
        ...RULE_LIBRARY.spellingIeEi,
        from: word,
        to: ieEi,
      });
      token.core = ieEi;
      continue;
    }

    const sharp = word.includes('ss') ? word.replace(/ss/g, 'ß') : word.includes('ß') ? word.replace(/ß/g, 'ss') : null;
    if (sharp && KNOWN_WORDS.has(lower(sharp))) {
      pushError(errors, {
        ...RULE_LIBRARY.spellingSharpS,
        from: word,
        to: sharp,
      });
      token.core = sharp;
      continue;
    }

    // Umlaut restoration: «Es gefallt mir» is a spelling error, not a
    // punctuation preference. The table only holds forms that cannot be a
    // different valid word (see UMLAUT_WORDS).
    const umlaut = UMLAUT_WORDS[lower(word)];
    if (umlaut && lower(umlaut) !== lower(word)) {
      const correctedWord = isUpperFirst(word) ? capitalize(umlaut) : umlaut;
      pushError(errors, {
        ...RULE_LIBRARY.spellingUmlaut,
        from: word,
        to: correctedWord,
      });
      token.core = correctedWord;
    }
  }

  // 3. Article gender, then a missing indefinite article for a singular count
  //    noun directly after a finite verb.
  for (let index = 0; index < tokens.length; index += 1) {
    const noun = NOUNS[lower(tokens[index].core)];
    if (!noun) continue;

    // The determiner may be one adjective away from its noun («ein neues Auto»,
    // «ein neue Wohnung»). Scan back only over words that cannot start a clause,
    // so a determiner from an earlier phrase is never borrowed.
    let determinerIndex = -1;
    for (let back = 1; back <= 2 && index - back >= 0; back += 1) {
      const candidate = tokens[index - back];
      if (DETERMINERS.has(lower(candidate.core))) {
        determinerIndex = index - back;
        break;
      }
      if (VERB_FORMS.has(lower(candidate.core)) || NOUNS[lower(candidate.core)]) break;
    }

    const previous = determinerIndex >= 0 ? tokens[determinerIndex] : tokens[index - 1];
    if (determinerIndex >= 0) {
      if (!noun.article) continue;
      const written = lower(previous.core);
      // «die Brötchen kommen» — a plural verb proves the noun is plural, so the
      // article is right even though it differs from the singular gender.
      if (written === 'die' && PLURAL_VERB_FORMS.has(lower(tokens[index + 1]?.core || ''))) continue;
      const grammaticalCase = nounCase(tokens, determinerIndex);
      // «die Schlüssel» / «die Brötchen»: a plural article in front of a noun
      // whose singular is masculine/neuter is correct German. With no case
      // clue the written form is ambiguous, so it is never "corrected" to the
      // singular article.
      if (written === 'die' && noun.article !== 'die' && grammaticalCase === 'unknown') continue;
      const expected = expectedArticle(noun, written, grammaticalCase);
      if (expected === written) continue;
      // A clear case clue (object after «haben/brauchen», dative preposition)
      // outranks a bare gender mismatch, because the written article can be the
      // right gender in the wrong case: «Ich habe der Hund» → «den Hund».
      if (grammaticalCase === 'unknown' && !certainGenderMismatch(noun.article, written)) continue;
      const rule = grammaticalCase !== 'unknown' ? RULE_LIBRARY.articleCase : RULE_LIBRARY.articleGender;
      const displayNoun = isUpperFirst(tokens[index].core) ? tokens[index].core : capitalize(tokens[index].core);
      pushError(errors, {
        ...rule,
        from: `${previous.core} ${displayNoun}`,
        to: `${expected} ${displayNoun}`,
      });
      previous.core = isUpperFirst(previous.core) ? capitalize(expected) : expected;
      continue;
    }

    if (
      previous &&
      ACCUSATIVE_VERBS.has(lower(previous.core)) &&
      noun.article &&
      !noun.plural &&
      !MASS_NOUNS.has(lower(tokens[index].core)) &&
      !UNCOUNTABLE_NOUNS.has(lower(tokens[index].core)) &&
      !CALENDAR_WORDS.has(lower(tokens[index].core))
    ) {
      const article = expectedArticle(noun, 'eine', 'accusative');
      const displayNoun = isUpperFirst(tokens[index].core) ? tokens[index].core : capitalize(tokens[index].core);
      pushError(errors, {
        ...RULE_LIBRARY.articleMissing,
        from: tokens[index].core,
        to: `${article} ${displayNoun}`,
      });
      tokens.splice(index, 0, { pre: '', core: article, post: '' });
      index += 1;
    }
  }

  // 4. Noun capitalisation. Runs after article insertion so the inserted word
  //    and its noun are treated as one phrase.
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    const proper = PROPER_NOUNS[lower(token.core)];
    if (proper) {
      if (token.core !== proper) {
        pushError(errors, { ...RULE_LIBRARY.properName, from: token.core, to: proper });
        token.core = proper;
      }
      continue;
    }
    const noun = NOUNS[lower(token.core)];
    if (!noun) continue;
    if (isUpperFirst(token.core)) continue;
    // «morgen» is an adverb in «heute oder morgen», not the noun «Morgen».
    // Time adverbs carry their own lowercase spelling; never noun-capitalise them.
    // The greeting «Guten Morgen» is the exception the rule must keep.
    if (TIME_ADVERBS.has(lower(token.core)) && lower(tokens[tokenIndex - 1]?.core || '') !== 'guten') continue;
    // «etwas zu essen»: an infinitive after «zu» is a verb, not the noun «Essen».
    if (lower(tokens[tokenIndex - 1]?.core || '') === 'zu' && INFINITIVES.has(lower(token.core))) continue;
    const corrected = capitalize(token.core);
    pushError(errors, { ...RULE_LIBRARY.nounCapital, from: token.core, to: corrected });
    token.core = corrected;
  }

  // 5. A proper name after "heißen" (ich heiße ghaidak).
  for (let index = 1; index < tokens.length; index += 1) {
    if (!/^(heiße|heisst|heißt|heisse)$/i.test(tokens[index - 1].core)) continue;
    const token = tokens[index];
    if (!/^[A-Za-zÄÖÜäöüß-]+$/.test(token.core) || isUpperFirst(token.core)) continue;
    const word = lower(token.core);
    // «Wie heißt du nochmal?» is correct German. A pronoun or a known non-name
    // word after «heißen» is not a missing capital; the formal «Sie / Ihnen»
    // already ships capitalised. Only an unknown word is treated as a name.
    if (NAME_STOPWORDS.has(word)) continue;
    if (KNOWN_WORDS.has(word) && !PROPER_NOUNS[word]) continue;
    const corrected = capitalize(token.core);
    pushError(errors, { ...RULE_LIBRARY.properName, from: token.core, to: corrected });
    token.core = corrected;
  }

  // 6. V2 inversion: "Heute ich gehe" → "Heute gehe ich".
  if (
    tokens.length >= 3 &&
    TIME_ADVERBS.has(lower(tokens[0].core)) &&
    SUBJECT_PRONOUNS.has(lower(tokens[1].core)) &&
    VERB_FORMS.has(lower(tokens[2].core))
  ) {
    const subject = tokens[1].core;
    const verb = tokens[2].core;
    pushError(errors, { ...RULE_LIBRARY.verbSecond, from: `${subject} ${verb}`, to: `${verb} ${subject}` });
    tokens[1].core = verb;
    tokens[2].core = subject;
  }

  // 7. Greeting / vocative comma. German wants a comma between the address and
  //    the rest of the sentence: "Hallo Frau Meier, ich heiße …".
  const startsWithGreeting = GREETING_PHRASES.some((greeting) => {
    const parts = greeting.split(' ');
    return parts.every((part, index) => lower(tokens[index]?.core || '') === part);
  });
  if (startsWithGreeting) {
    const greetingWords = GREETING_PHRASES.find((greeting) =>
      greeting.split(' ').every((part, index) => lower(tokens[index]?.core || '') === part),
    )!.split(' ').length;
    const afterGreeting = tokens[greetingWords];
    // "Hallo Frau Meier, …" — the vocative is the greeting's address.
    if (afterGreeting && /^(frau|herr)$/i.test(afterGreeting.core) && tokens[greetingWords + 1]) {
      const nameToken = tokens[greetingWords + 1];
      // A surname is a proper name: «hallo frau meier» → «Hallo Frau Meier».
      if (!isUpperFirst(nameToken.core)) {
        const corrected = capitalize(nameToken.core);
        pushError(errors, { ...RULE_LIBRARY.properName, from: nameToken.core, to: corrected });
        nameToken.core = corrected;
      }
      // The comma separates the address from a following clause. A bare
      // greeting plus vocative is a complete line and needs no comma; a line
      // that already ends in «.» / «!» / «?» is complete too.
      if (tokens[greetingWords + 2] && !/[,;:!?.]/.test(nameToken.post)) {
        pushError(errors, { ...RULE_LIBRARY.greetingComma, from: `${afterGreeting.core} ${nameToken.core}`, to: `${afterGreeting.core} ${nameToken.core},` });
        nameToken.post = `,${nameToken.post}`;
      }
    } else if (
      afterGreeting &&
      !/[,;:!?.]/.test(tokens[greetingWords - 1].post) &&
      // «Hallo Denis, ich …» already separates the address; adding a comma
      // right after «Hallo» would double it. Any separator in the next two
      // tokens means the line is already punctuated.
      !tokens.slice(greetingWords, greetingWords + 2).some((token) => /[,;:!?]/.test(token.post))
    ) {
      pushError(errors, { ...RULE_LIBRARY.greetingComma, from: tokens[greetingWords - 1].core, to: `${tokens[greetingWords - 1].core},` });
      tokens[greetingWords - 1].post = `,${tokens[greetingWords - 1].post}`;
    }
  }

  // 8. Sentence-start capital, after every word-level correction.
  if (tokens[0] && tokens[0].core && !isUpperFirst(tokens[0].core)) {
    const corrected = capitalize(tokens[0].core);
    pushError(errors, { ...RULE_LIBRARY.sentenceStart, from: tokens[0].core, to: corrected });
    tokens[0].core = corrected;
  }

  // Terminal punctuation is optional. A learner typing in a chat box is not
  // failing a punctuation exercise, so a missing final mark is never added to
  // their sentence; it is offered as a soft note only.
  let softNoteAr: string | undefined;
  if (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    if (!/[.!?]/.test(last.post)) {
      const isQuestion = QUESTION_WORDS.has(lower(tokens[0]?.core || ''));
      softNoteAr = isQuestion
        ? 'ملاحظة اختيارية: السؤال في الألمانية يُنهى بعلامة استفهام «؟».'
        : 'ملاحظة اختيارية: الجملة في الألمانية تُنهى بنقطة.';
    }
  }

  errors.sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]);

  return {
    corrected: render(tokens),
    errors,
    ok: errors.length === 0,
    ...(softNoteAr ? { softNoteAr } : {}),
  };
}

/**
 * The worker returns the broken PART only. Rebuild the full sentence by
 * replacing that part in what the learner actually wrote. When the part cannot
 * be found (the model paraphrased it), the fragment is returned unchanged so the
 * card never invents a sentence.
 */
export function mergeAiCorrection(
  learnerText: string,
  originalMistake?: string,
  correctedGerman?: string,
): string | null {
  const original = String(learnerText || '').trim();
  const mistake = String(originalMistake || '').trim();
  const corrected = String(correctedGerman || '').trim();
  if (!corrected) return null;
  if (!mistake) return corrected;

  const index = lower(original).indexOf(lower(mistake));
  if (index === -1) return corrected;

  const merged = `${original.slice(0, index)}${corrected}${original.slice(index + mistake.length)}`;
  return merged
    .replace(/\s+([,.!?])/g, (_match, punct: string) => punct)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** The neutral line shown under a correction. «أحسنت» belongs only to a correct sentence. */
export function correctionNoteAr(errorCount: number): string {
  if (errorCount <= 0) return '';
  return errorCount === 1 ? 'قريب! بقي تصحيح واحد.' : `قريب! بقيت ${errorCount} تصحيحات.`;
}
