/**
 * The UI dictionary: every string the app says to the learner, in the three
 * languages it ships in.
 *
 * Why keys and not "translate the Arabic literal": a key names the *meaning*
 * (`language.uiTitle`), so a screen never depends on the exact wording of
 * another language, and a copy change in Arabic does not silently orphan the
 * English. `UiStringKey` is derived from the Arabic table, and the other two are
 * typed `Record<UiStringKey, string>` — so a missing English or Indonesian line
 * is a TypeScript error, not an Arabic sentence appearing in an English screen.
 * `tests/languages.test.ts` holds the same rule at runtime, for the case where
 * someone edits the table through a cast.
 *
 * Arabic stays the reference: it is the product's first language, not a
 * translation. English and Indonesian are written as native copy, not as
 * literal renderings of the Arabic.
 *
 * Scope: this table grows screen by screen (see
 * `docs/plans/010-multilanguage-master-plan.md`, Phase 1b). A key exists here
 * only once its screen actually reads it; the plan's coverage script is what
 * measures the remaining surface, so nothing claims full coverage early.
 */

import type { UiLanguage } from './languages';

const AR = {
  'common.cancel': 'إلغاء',
  'common.close': 'إغلاق',

  'nav.trail': 'الرحلة',
  'nav.practice': 'التدريب',
  'nav.progress': 'التقدم',
  'nav.profile': 'الملف',
  'nav.lockedHint': '{label} — مقفل حتى أول محادثة',
  'shell.checkingAccount': 'جاري التحقق من الحساب...',

  'language.sectionTitle': 'اللغة',
  'language.sectionHint': 'لغة الواجهة واللغة التي تتعلّمها',
  'language.uiTitle': 'لغة التطبيق',
  'language.uiBody': 'كل ما يخاطبك به التطبيق — العناوين والأزرار والملاحظات والتصحيح — بهذه اللغة.',
  'language.uiRowLabel': 'لغة الواجهة',
  'language.targetTitle': 'اللغة التي تتعلّمها',
  'language.targetBody': 'المحادثات والقواعد والكلمات التي تتدرب عليها تكون بهذه اللغة.',
  'language.targetRowLabel': 'أتعلّم',
  'language.currentBadge': 'الحالية',
  'language.chooseUiTitle': 'اختر لغة التطبيق',
  'language.chooseTargetTitle': 'اختر اللغة التي تتعلّمها',
  'language.savedNotice': 'تم حفظ اختيار اللغة.',
  'language.soonBadge': 'قريباً',
  'language.dutchSoon':
    'الهولندية قيد الإعداد: المحادثات والقواعد الهولندية لم تُنشر بعد، لذلك لا يمكن اختيارها الآن. اختيارك الحالي بالألمانية وسيبقى محفوظاً.',
  'language.nativeNote': 'تُشرح لك الأخطاء والملاحظات بلغتك هذه.',
} as const;

export type UiStringKey = keyof typeof AR;

const EN: Record<UiStringKey, string> = {
  'common.cancel': 'Cancel',
  'common.close': 'Close',

  'nav.trail': 'Journey',
  'nav.practice': 'Practice',
  'nav.progress': 'Progress',
  'nav.profile': 'Profile',
  'nav.lockedHint': '{label} — locked until your first conversation',
  'shell.checkingAccount': 'Checking your account…',

  'language.sectionTitle': 'Language',
  'language.sectionHint': 'The app language and the language you are learning',
  'language.uiTitle': 'App language',
  'language.uiBody': 'Everything the app says to you — headings, buttons, notes and corrections — appears in this language.',
  'language.uiRowLabel': 'App language',
  'language.targetTitle': 'Language you are learning',
  'language.targetBody': 'The conversations, grammar and vocabulary you practise are in this language.',
  'language.targetRowLabel': 'Learning',
  'language.currentBadge': 'Current',
  'language.chooseUiTitle': 'Choose the app language',
  'language.chooseTargetTitle': 'Choose the language you are learning',
  'language.savedNotice': 'Your language choice has been saved.',
  'language.soonBadge': 'Soon',
  'language.dutchSoon':
    'Dutch is in preparation: the Dutch conversations and grammar are not published yet, so it cannot be selected today. Your current choice stays German and is kept.',
  'language.nativeNote': 'Corrections and notes are explained to you in this language.',
};

const ID: Record<UiStringKey, string> = {
  'common.cancel': 'Batal',
  'common.close': 'Tutup',

  'nav.trail': 'Perjalanan',
  'nav.practice': 'Latihan',
  'nav.progress': 'Kemajuan',
  'nav.profile': 'Profil',
  'nav.lockedHint': '{label} — terkunci sampai percakapan pertamamu',
  'shell.checkingAccount': 'Memeriksa akun…',

  'language.sectionTitle': 'Bahasa',
  'language.sectionHint': 'Bahasa aplikasi dan bahasa yang kamu pelajari',
  'language.uiTitle': 'Bahasa aplikasi',
  'language.uiBody': 'Semua yang dikatakan aplikasi kepadamu — judul, tombol, catatan, dan koreksi — tampil dalam bahasa ini.',
  'language.uiRowLabel': 'Bahasa aplikasi',
  'language.targetTitle': 'Bahasa yang kamu pelajari',
  'language.targetBody': 'Percakapan, tata bahasa, dan kosakata yang kamu latih memakai bahasa ini.',
  'language.targetRowLabel': 'Mempelajari',
  'language.currentBadge': 'Saat ini',
  'language.chooseUiTitle': 'Pilih bahasa aplikasi',
  'language.chooseTargetTitle': 'Pilih bahasa yang kamu pelajari',
  'language.savedNotice': 'Pilihan bahasamu sudah disimpan.',
  'language.soonBadge': 'Segera',
  'language.dutchSoon':
    'Bahasa Belanda sedang disiapkan: percakapan dan tata bahasanya belum terbit, jadi belum bisa dipilih sekarang. Pilihanmu tetap Jerman dan tetap tersimpan.',
  'language.nativeNote': 'Koreksi dan catatan dijelaskan kepadamu dalam bahasa ini.',
};

export const UI_STRINGS: Record<UiLanguage, Record<UiStringKey, string>> = {
  ar: AR,
  en: EN,
  id: ID,
};

/**
 * The largest value any `{placeholder}` may be given. Numbers and short names
 * qualify; an object or a stack trace does not, and must never be stringified
 * into the sentence a learner reads.
 */
type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined || value === null ? match : String(value);
  });
}

/**
 * One translation. Falls back to Arabic rather than to the key: a learner who
 * sees "language.uiTitle" on a button has been shown the implementation, and an
 * Arabic sentence in an English screen is at least a sentence.
 */
export function translate(language: UiLanguage, key: UiStringKey, vars?: Vars): string {
  const table = UI_STRINGS[language] || UI_STRINGS.ar;
  const template = table[key] ?? UI_STRINGS.ar[key] ?? key;
  return interpolate(template, vars);
}

/** For a caller that has a key it cannot prove at compile time (a server payload). */
export function isUiStringKey(value: unknown): value is UiStringKey {
  return typeof value === 'string' && value in UI_STRINGS.ar;
}
