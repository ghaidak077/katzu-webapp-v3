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

  'welcome.badge': 'Katzu AI • رفيقك الذكي',
  'welcome.headline': 'تحدث الألمانية بدون خوف',
  'welcome.subline':
    'تعلّم المحادثة الواقعية مع كَاتْزُو — رفيقك الذي يصحّح نطقك وقواعدك داخل مواقف حقيقية.',
  'welcome.demoLabel': 'مثال من محادثة حقيقية',
  'welcome.demoCaption': 'مثال — في المقهى',
  'welcome.demoSceneGloss': 'طاب يومك! ماذا تريد؟',
  'welcome.demoLearnerLine': 'أريد قهوة، من فضلك.',
  'welcome.demoSpeaker': 'كَاتْزُو:',
  'welcome.demoCoach': 'قريب جداً — «einen Kaffee» بعد «möchte» في حالة النصب. قل:',
  'welcome.start': 'إنشاء حساب جديد وابدأ',
  'welcome.quickDivider': 'أو المتابعة السريعة',
  'welcome.continueWithGoogle': 'المتابعة باستخدام Google',
  'welcome.haveAccount': 'لديك حساب بالفعل؟',
  'welcome.signIn': 'تسجيل الدخول إلى حسابي',
  'welcome.attribution': 'صُنع بواسطة غيدق علوش — ghaidak.com',
  'welcome.defaultName': 'متعلم',

  'signin.modeSignin': 'تسجيل الدخول',
  'signin.modeSignup': 'إنشاء حساب جديد',
  'signin.welcomeBackTitle': 'مرحباً بك مجدداً في كَاتْزُو',
  'signin.joinTitle': 'انضم إلى عائلة كَاتْزُو',
  'signin.welcomeBackBody':
    'سجل دخولك بحساب Google لمزامنة تقدمك السحابي واشتراكك وبنك أخطائك بأمان.',
  'signin.joinBody':
    'سجل بحساب Google لحفظ كل محادثة، كلمة جديدة، وتقرير تقدم تتقنه عبر كافة أجهزتك.',
  'signin.googleSignup': 'التسجيل السريع باستخدام Google',
  'signin.checking': 'جارٍ التحقق من الحساب...',
  'signin.errorGoogle': 'فشل التحقق من تسجيل الدخول عبر Google، يرجى المحاولة ثانية.',
  'signin.errorPopup':
    'لم تظهر نافذة Google. اسمح بالنوافذ المنبثقة لهذا الموقع أو حاول مرة أخرى.',
  'signin.noticePreparing': 'جارٍ تجهيز خدمة Google… انتظر لحظة ثم اضغط مرة أخرى.',
  'signin.errorLoad': 'تعذر تحميل خدمة Google الآن. تحقق من الاتصال وحاول مجدداً.',
  'signin.unavailableTitle': 'تسجيل الدخول غير متاح الآن',
  'signin.unavailableBody':
    'لا يمكن إكمال تسجيل الدخول بحساب Google في هذه النسخة. يمكنك متابعة التعلم بدون حساب الآن، وسنعيد فتح تسجيل الدخول لاحقاً.',
  'signin.unavailableAction': 'العودة والمتابعة بدون حساب',
  'signin.privacyShort': 'حسابك وبياناتك محمية عبر Google Identity Services.',
  'signin.privacyFull': 'حسابك وبياناتك محمية ومشفرة عبر Google Identity Services.',
  'signin.defaultName': 'مستخدم كَاتْزُو',
  'signin.defaultStudentName': 'طالب كَاتْزُو',
  'signin.successSignup': 'تم إنشاء حسابك بنجاح! جاري الدخول...',
  'signin.successSignin': 'تم تسجيل الدخول بنجاح! مرحباً بعودتك...',
  'signin.errorSession':
    'تعذر تأمين جلسة الدخول. تحقق من اتصالك وحاول تسجيل الدخول مرة أخرى.',
  'signin.errorCredential': 'تعذر استلام بيانات الاعتماد من Google.',

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

  'welcome.badge': 'Katzu AI • your sharp-witted companion',
  'welcome.headline': 'Speak German without fear',
  'welcome.subline':
    'Learn the conversation people actually have, with Katzu — the companion that fixes your pronunciation and grammar inside situations that really happen.',
  'welcome.demoLabel': 'A real exchange',
  'welcome.demoCaption': 'Example — at the café',
  'welcome.demoSceneGloss': 'Good day! What can I get you?',
  'welcome.demoLearnerLine': 'A coffee, please.',
  'welcome.demoSpeaker': 'Katzu:',
  'welcome.demoCoach': 'Almost — «einen Kaffee» is accusative after «möchte». Say:',
  'welcome.start': 'Create an account and start',
  'welcome.quickDivider': 'or jump straight in',
  'welcome.continueWithGoogle': 'Continue with Google',
  'welcome.haveAccount': 'Already have an account?',
  'welcome.signIn': 'Sign in to my account',
  'welcome.attribution': 'Built by Ghaidak — ghaidak.com',
  'welcome.defaultName': 'learner',

  'signin.modeSignin': 'Sign in',
  'signin.modeSignup': 'Create account',
  'signin.welcomeBackTitle': 'Welcome back to Katzu',
  'signin.joinTitle': 'Join the Katzu family',
  'signin.welcomeBackBody':
    'Sign in with Google to sync your progress, your subscription and your error bank securely.',
  'signin.joinBody':
    'Sign up with Google to keep every conversation, every new word and a progress report across all your devices.',
  'signin.googleSignup': 'Sign up quickly with Google',
  'signin.checking': 'Checking your account…',
  'signin.errorGoogle': 'Google sign-in could not be verified. Please try again.',
  'signin.errorPopup': 'Google did not open its window. Allow pop-ups for this site, or try again.',
  'signin.noticePreparing': 'Google is still starting up — wait a moment, then tap again.',
  'signin.errorLoad': 'Google could not be loaded right now. Check your connection and try again.',
  'signin.unavailableTitle': 'Sign-in is unavailable right now',
  'signin.unavailableBody':
    'Google sign-in cannot be completed in this build. You can keep learning without an account now, and we will reopen sign-in later.',
  'signin.unavailableAction': 'Go back and continue without an account',
  'signin.privacyShort': 'Your account and data are protected by Google Identity Services.',
  'signin.privacyFull':
    'Your account and data are protected and encrypted through Google Identity Services.',
  'signin.defaultName': 'Katzu learner',
  'signin.defaultStudentName': 'Katzu student',
  'signin.successSignup': 'Your account is created — signing you in…',
  'signin.successSignin': 'Signed in — welcome back…',
  'signin.errorSession': 'We could not secure your session. Check your connection and sign in again.',
  'signin.errorCredential': 'Google credentials could not be received.',

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

  'welcome.badge': 'Katzu AI • teman cerdasmu',
  'welcome.headline': 'Bicara bahasa Jerman tanpa takut',
  'welcome.subline':
    'Pelajari percakapan yang benar-benar terjadi bersama Katzu — teman yang membetulkan pelafalan dan tata bahasamu di situasi nyata.',
  'welcome.demoLabel': 'Contoh percakapan nyata',
  'welcome.demoCaption': 'Contoh — di kafe',
  'welcome.demoSceneGloss': 'Selamat siang! Mau pesan apa?',
  'welcome.demoLearnerLine': 'Kopi, tolong.',
  'welcome.demoSpeaker': 'Katzu:',
  'welcome.demoCoach': 'Hampir — «einen Kaffee» memakai akusatif setelah «möchte». Ucapkan:',
  'welcome.start': 'Buat akun dan mulai',
  'welcome.quickDivider': 'atau langsung masuk',
  'welcome.continueWithGoogle': 'Lanjutkan dengan Google',
  'welcome.haveAccount': 'Sudah punya akun?',
  'welcome.signIn': 'Masuk ke akun saya',
  'welcome.attribution': 'Dibuat oleh Ghaidak — ghaidak.com',
  'welcome.defaultName': 'pelajar',

  'signin.modeSignin': 'Masuk',
  'signin.modeSignup': 'Buat akun',
  'signin.welcomeBackTitle': 'Selamat datang kembali di Katzu',
  'signin.joinTitle': 'Bergabung dengan keluarga Katzu',
  'signin.welcomeBackBody':
    'Masuk dengan Google untuk menyinkronkan kemajuan, langganan, dan bank kesalahanmu dengan aman.',
  'signin.joinBody':
    'Daftar dengan Google supaya setiap percakapan, kata baru, dan laporan kemajuan tersimpan di semua perangkatmu.',
  'signin.googleSignup': 'Daftar cepat dengan Google',
  'signin.checking': 'Memeriksa akun…',
  'signin.errorGoogle': 'Login Google tidak bisa diverifikasi. Coba lagi.',
  'signin.errorPopup': 'Jendela Google tidak muncul. Izinkan pop-up untuk situs ini, atau coba lagi.',
  'signin.noticePreparing': 'Google masih disiapkan — tunggu sebentar, lalu ketuk lagi.',
  'signin.errorLoad': 'Layanan Google belum bisa dimuat. Periksa koneksimu dan coba lagi.',
  'signin.unavailableTitle': 'Login belum tersedia',
  'signin.unavailableBody':
    'Login dengan Google belum bisa diselesaikan di versi ini. Kamu bisa lanjut belajar tanpa akun sekarang, dan login akan kami buka lagi nanti.',
  'signin.unavailableAction': 'Kembali dan lanjut tanpa akun',
  'signin.privacyShort': 'Akun dan datamu dilindungi Google Identity Services.',
  'signin.privacyFull':
    'Akun dan datamu dilindungi serta dienkripsi lewat Google Identity Services.',
  'signin.defaultName': 'Pelajar Katzu',
  'signin.defaultStudentName': 'Pelajar Katzu',
  'signin.successSignup': 'Akunmu sudah dibuat — sedang masuk…',
  'signin.successSignin': 'Berhasil masuk — selamat datang kembali…',
  'signin.errorSession': 'Sesi masuk belum bisa diamankan. Periksa koneksimu lalu coba masuk lagi.',
  'signin.errorCredential': 'Kredensial Google tidak bisa diterima.',

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
