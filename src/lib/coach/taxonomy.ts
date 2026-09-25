import { normalizeGermanAnswer } from '@/lib/srs/engine';

/**
 * What kind of German is this learner actually getting wrong?
 *
 * The conversation engine already returns a `grammar_rule` with every correction,
 * but it was never aggregated — so the app could tell a learner *that* they were
 * wrong and then forget it. A coach's real value is the opposite: noticing that
 * someone has made the same class of mistake eleven times and going after it.
 *
 * Classification is keyword-based and deterministic on purpose. Routing this
 * through the AI would cost a call per mistake, be non-reproducible, and fail
 * offline — for a decision this coarse, words are enough.
 */

export type MistakeCategory =
  | 'articles'
  | 'case'
  | 'word_order'
  | 'verb_forms'
  | 'prepositions'
  | 'spelling'
  | 'vocabulary'
  | 'other';

export const MISTAKE_CATEGORIES: MistakeCategory[] = [
  'articles',
  'case',
  'word_order',
  'verb_forms',
  'prepositions',
  'spelling',
  'vocabulary',
  'other',
];

/**
 * Rules are ordered most-specific first: "الفعل في المركز الثاني" (the verb in
 * second position) mentions both a verb and word order, and word order is the
 * useful answer because that is what the learner has to change.
 */
const CATEGORY_PATTERNS: Array<{ category: MistakeCategory; pattern: RegExp }> = [
  { category: 'case', pattern: /akkusativ|dativ|genitiv|\bkasus\b|حالة|منصوب|مجرور|إعراب|حالات الإعراب/ },
  {
    category: 'prepositions',
    // Arabic writes these with or without the definite article, so both forms
    // must match: "حرف الجر" and "حرف جر" are the same rule to a learner.
    pattern: /pr(ä|ae)position|حرف[s]?\s*(ال)?جر/,
  },
  {
    category: 'word_order',
    pattern: /wortstellung|verbposition|nebensatz|\bposition\b|ترتيب|المركز الثاني|موقع الفعل|الجملة الثانوية|جملة ثانوية|المكان الثاني/,
  },
  {
    category: 'articles',
    pattern: /artikel|أداة|الأداة|أدوات التعريف|التعريف|جنس الاسم|مذكر|مؤنث|محايد|\bder\/die\/das\b/,
  },
  {
    category: 'verb_forms',
    pattern: /konjugation|partizip|perfekt|pr(ä|ae)teritum|tempus|\bverb\b|تصريف|زمن|الفعل|الأفعال|فعل مساعد/,
  },
  {
    category: 'vocabulary',
    pattern: /wortschatz|vokabel|bedeutung|word choice|مفردات|مفردة|كلمة|معنى|المفردات/,
  },
];

/** Folds umlauts to their base letter, for comparing only the words themselves. */
function looseFold(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Folds case and Arabic diacritics so one rule cannot be missed by a vowel mark. */
function fold(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A correction that only changes capitalisation or umlaut spelling is a spelling
 * miss, whatever the rule text says — the learner knew the word and mistyped it,
 * and sending them to a grammar drill would waste their time.
 */
export function isSpellingOnly(original: string, corrected: string): boolean {
  if (!original || !corrected) return false;
  if (original === corrected) return false;
  // Two ways to write the same umlaut are both spelling, not grammar: the
  // transliterated form (fuer) and dropping the umlaut on a keyboard that has
  // none (fur). Neither means the learner picked the wrong word or the wrong case.
  return (
    normalizeGermanAnswer(original) === normalizeGermanAnswer(corrected) ||
    looseFold(original) === looseFold(corrected)
  );
}

export function classifyMistake(ruleText: string, original = '', corrected = ''): MistakeCategory {
  if (isSpellingOnly(original, corrected)) return 'spelling';

  const haystack = fold(ruleText);
  if (!haystack) return 'other';

  for (const { category, pattern } of CATEGORY_PATTERNS) {
    if (pattern.test(haystack)) return category;
  }
  return 'other';
}

export interface CategoryCopy {
  labelAr: string;
  adviceAr: string;
}

/**
 * Learner-facing wording. Advice has to be something a person can actually do in
 * the next five minutes — "study grammar" is not advice.
 */
export const CATEGORY_COPY: Record<MistakeCategory, CategoryCopy> = {
  articles: {
    labelAr: 'أدوات التعريف (der / die / das)',
    adviceAr: 'احفظ كل اسم جديد مع أداته من أول مرة — اللون في البطاقة يساعدك.',
  },
  case: {
    labelAr: 'حالات الإعراب (Akkusativ / Dativ)',
    adviceAr: 'اسأل نفسك: من يقوم بالفعل؟ ولمن؟ هذا يحدد الحالة.',
  },
  word_order: {
    labelAr: 'ترتيب الجملة وموقع الفعل',
    adviceAr: 'في الجملة الخبرية الفعل دائماً في المركز الثاني، حتى لو بدأت بالزمان.',
  },
  verb_forms: {
    labelAr: 'تصريف الأفعال والأزمنة',
    adviceAr: 'راجع تصريف الفعل مع كل ضمير، ثم Perfekt مع sein أو haben.',
  },
  prepositions: {
    labelAr: 'حروف الجر',
    adviceAr: 'احفظ حرف الجر مع الفعل نفسه، لا منفصلاً عنه.',
  },
  spelling: {
    labelAr: 'إملاء (ä / ö / ü / ß)',
    adviceAr: 'الكلمة صحيحة عندك — تحتاج فقط ضبط الحروف الخاصة.',
  },
  vocabulary: {
    labelAr: 'اختيار المفردة',
    adviceAr: 'الكلمة غير المناسبة تُشعر المستمع بالغموض — راجع المفردات بهذا الموضوع.',
  },
  other: {
    labelAr: 'أخطاء متنوعة',
    adviceAr: 'تحدث أكثر، وسأتمكن من تحديد نمط أوضح لأخطائك.',
  },
};
