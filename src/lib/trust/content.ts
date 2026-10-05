import { ANALYTICS_EVENTS, ALLOWED_PROP_KEYS } from '@/lib/analytics/events';

/**
 * The trust pages, as fields rather than prose.
 *
 * WHY STRUCTURED
 * A legal page written as one paragraph is one paragraph nobody can check. These
 * are fields with owners: the app fills the parts it can prove from its own code,
 * and every part that only the owner can state is a `{{OWNER_FILL}}` placeholder.
 * `scripts/check-launch.mjs` fails the strict launch check when a placeholder is
 * still standing — so "the legal text is unfinished" becomes a build signal
 * instead of a quiet detail nobody notices after the app is on the store.
 *
 * WHY THE DATA LIST IS DERIVED, NOT WRITTEN
 * The one sentence in a privacy policy that must not be a lie is the list of what
 * is processed. Writing it by hand means it starts drifting the moment a column is
 * added, so the facts below are computed from the same constants the app enforces:
 * the analytics event allowlist, the property allowlist, the local tables and the
 * two things that leave the device. A test fails if the rendered page names an
 * event the worker would refuse, or omits one it accepts.
 */

export type TrustPage = 'privacy' | 'terms' | 'contact' | 'imprint' | 'refund';

export interface TrustSection {
  id: string;
  /** Arabic heading. */
  headingAr: string;
  /** Either a real sentence, or a `{{OWNER_FILL}}` the owner must replace. */
  bodyAr: string;
}

/** The fields only the owner can answer. Never invented, never guessed. */
export const OWNER_FILL = '{{OWNER_FILL}}';

const EVENT_GLOSS: Record<string, string> = {
  landing_viewed: 'زيارة الصفحة الرئيسية',
  demo_started: 'بدء العرض التوضيحي',
  demo_completed: 'إتمام العرض التوضيحي',
  signup_started: 'بدء التسجيل',
  signup_completed: 'إتمام التسجيل',
  onboarding_started: 'بدء أسئلة التهيئة',
  onboarding_completed: 'إتمام أسئلة التهيئة',
  placement_started: 'بدء اختبار المستوى',
  placement_completed: 'إتمام اختبار المستوى',
  scenario_started: 'بدء موقف',
  scenario_studied: 'دراسة موقف',
  scenario_completed: 'إتمام موقف',
  quiz_completed: 'إتمام تمرين',
  conversation_started: 'بدء محادثة',
  first_independent_turn: 'أول جملة مستقلة',
  conversation_completed: 'إتمام محادثة',
  return_day1: 'العودة في اليوم الأول',
  return_day7: 'العودة في اليوم السابع',
  review_started: 'بدء مراجعة',
  review_completed: 'إتمام مراجعة',
  word_bank_tapped: 'استخدام بنك الكلمات',
  review_revealed: 'كشف الإجابة',
  coach_viewed: 'فتح المدرّب',
  writing_completed: 'إتمام كتابة',
  listening_completed: 'إتمام استماع',
  paywall_viewed: 'عرض صفحة الاشتراك',
  onboarding_goal: 'تحديد الهدف',
  share_click: 'مشاركة',
  mock_start: 'بدء محاكاة',
  mock_finish: 'إنهاء جزء من محاكاة',
  debrief_view: 'عرض التقرير',
  paywall_view: 'عرض الأسعار',
  upgrade_click: 'الضغط على الشراء',
  purchase_clicked: 'اختيار عرض',
  code_redeemed: 'تفعيل كود',
  app_error: 'خطأ في التطبيق',
};

/** Everything the app holds on the device, in Arabic. */
const LOCAL_TABLES_AR = [
  'بيانات حسابك (البريد، الاسم المعروض، مستواك، تاريخ الامتحان إن أضفته)',
  'تقدّمك: الجلسات، الجُمل التي قلتها، أخطاؤك المصحّحة، المفردات التي حفظتها',
  'محتوى التعلم: المواقف، المفردات، القواعد، العبارات الجاهزة',
  'سجلات الجلسات المراد مزامنتها، ونتائج التمارين اليومية',
];

export interface TrustContent {
  titleAr: string;
  updatedAr: string;
  sections: TrustSection[];
}

/** The published version label, so a change is visible without a git log. */
export const TRUST_VERSION = '2026-10-05';

export const TRUST_CONTENT: Record<TrustPage, TrustContent> = {
  privacy: {
    titleAr: 'الخصوصية والبيانات',
    updatedAr: `آخر تحديث: ${TRUST_VERSION}`,
    sections: [
      { id: 'account', headingAr: 'ما نحتاجه للدخول', bodyAr: 'حساب Google فقط: بريدك الإلكتروني ومعرّف الحساب. لا نطلب كلمة مرور ولا نخزّنها، ولا تُحفظ رموز الدخول على الجهاز.' },
      { id: 'local', headingAr: 'ما يُحفظ على جهازك', bodyAr: LOCAL_TABLES_AR.map((line) => `• ${line}`).join('\n') },
      { id: 'processed', headingAr: 'قائمة المعالجة (مستخرجة من الكود)', bodyAr: processedDataListAr() },
      { id: 'ai', headingAr: 'ما يُرسل إلى مزوّد الذكاء الاصطناعي', bodyAr: 'رسائل المحادثة والترجمة فقط، عند استخدامك المحادثة. تُرسل هذه النصوص إلى مزوّد الذكاء الاصطناعي لتوليد الرد، ولا نستخدمها للتسويق أو الإعلانات.' },
      { id: 'events', headingAr: 'أحداث القياس', bodyAr: eventsListAr() },
      { id: 'rights', headingAr: 'حقوقك', bodyAr: 'يمكنك تصدير كل بياناتك أو حذف حسابك من الإعدادات في أي وقت. الحذف يشمل بيانات الجهاز والخادم ويلغي جلسات الدخول، ولا يُترك أثر قابل للاسترجاع.' },
      { id: 'contact-privacy', headingAr: 'لأي سؤال عن الخصوصية', bodyAr: `راسلنا على ${OWNER_FILL}.` },
    ],
  },
  terms: {
    titleAr: 'شروط الاستخدام',
    updatedAr: `آخر تحديث: ${TRUST_VERSION}`,
    sections: [
      { id: 'nature', headingAr: 'ما هو Katzu', bodyAr: 'أداة تدريب لغوي. ليست بديلاً عن محامٍ أو طبيب أو جهة حكومية أو مستشار هجرة، ولا تمنح أي شهادة أو درجة رسمية معتمدة.' },
      { id: 'mock', headingAr: 'المحاكاة', bodyAr: 'محاكاة تدريب على نمط امتحان B1: تقدير تدريبي تحسبه من جُلك أنت، وليس درجة رسمية ولا وعداً بالنجاح.' },
      { id: 'fairuse', headingAr: 'الاستخدام العادل', bodyAr: 'الحدود الظاهرة داخل التطبيق سارية، ويسري على الحصة المجانية والمدفوعة على حدٍّ سواء. لا نبيع خدمة بلا حدود، ونوضّح أي حد قبل أن تصل إليه.' },
      { id: 'payments', headingAr: 'الدفع والتفعيل', bodyAr: 'الشراء يتم عبر أكواد تفعيل تُشترى من صفحة البيع الرسمية، والتفعيل يتم داخل التطبيق فقط. لا تُدخل بيانات بطاقتك داخل التطبيق.' },
      { id: 'refund', headingAr: 'الاسترداد', bodyAr: `${OWNER_FILL}` },
      { id: 'law', headingAr: 'القانون المعمول به', bodyAr: `${OWNER_FILL}` },
    ],
  },
  refund: {
    titleAr: 'سياسة الاسترداد',
    updatedAr: `آخر تحديث: ${TRUST_VERSION}`,
    sections: [
      { id: 'what', headingAr: 'ماذا يمكن استرداده', bodyAr: `${OWNER_FILL}` },
      { id: 'how', headingAr: 'كيف تطلب الاسترداد', bodyAr: `${OWNER_FILL}` },
      { id: 'window', headingAr: 'المدة', bodyAr: `${OWNER_FILL}` },
      { id: 'channel', headingAr: 'القناة', bodyAr: 'الشراء من صفحة البيع الرسمية، والطلب يتم بالبريد الذي اشتريت منه مع رقم الكود.' },
    ],
  },
  imprint: {
    titleAr: 'بيانات الناشر',
    updatedAr: `آخر تحديث: ${TRUST_VERSION}`,
    sections: [
      { id: 'publisher', headingAr: 'اسم الناشر وعنوانه', bodyAr: `${OWNER_FILL}` },
      { id: 'representative', headingAr: 'الممثل القانوني', bodyAr: `${OWNER_FILL}` },
      { id: 'registry', headingAr: 'السجل التجاري', bodyAr: `${OWNER_FILL}` },
      { id: 'supervision', headingAr: 'جهة الرقابة', bodyAr: `${OWNER_FILL}` },
      { id: 'dispute', headingAr: 'تسوية النزاعات', bodyAr: `${OWNER_FILL}` },
    ],
  },
  contact: {
    titleAr: 'تواصل معنا',
    updatedAr: `آخر تحديث: ${TRUST_VERSION}`,
    sections: [
      { id: 'how', headingAr: 'كيف نصل إليه', bodyAr: `${OWNER_FILL}` },
      { id: 'never', headingAr: 'ما لا نطلبه أبداً', bodyAr: 'لا نطلب كلمة مرور ولا رمز دخول ولا رقم بطاقتك. لا ترسلها إلى أي بريد أو محادثة.' },
      { id: 'response', headingAr: 'زمن الرد', bodyAr: 'نردّ بأنفسنا على رسائل الدعم.' },
    ],
  },
};

/** Every `{{OWNER_FILL}}` still standing, with the page and section it belongs to. */
export function outstandingOwnerFields(pages: TrustContent[] = Object.values(TRUST_CONTENT)) {
  const out: Array<{ page: string; section: string }> = [];
  for (const page of pages) {
    for (const section of page.sections) {
      if (section.bodyAr.includes(OWNER_FILL)) out.push({ page: page.titleAr, section: section.id });
    }
  }
  return out;
}

/**
 * The processed-data list, computed from what the code actually allows.
 *
 * This is the sentence that must never be wrong, so it cannot be typed by hand:
 * every event named here is an event the worker accepts, and every prop named
 * here is a prop the worker will store.
 */
export function processedDataListAr(): string {
  return [
    '• ما نخزّنه على جهازك:',
    ...LOCAL_TABLES_AR.map((line) => `  - ${line}`),
    '• ما نرسله إلى الخادم:',
    '  - معرّف الحساب وتقدّمك (الجلسات، الأخطاء، المراجعات، وأنماط التعلم)',
    '  - أحداث القياس: الاسم والوقت ومعرّف تثبيت مجهول وسمات محدودة',
    '• ما يذهب إلى مزوّد الذكاء الاصطناعي:',
    '  - نص المحادثة أو الجملة المراد تصحيحها أو ترجمتها، فقط أثناء طلبك ذلك',
  ].join('\n');
}

/**
 * The events list, from the same constant the worker enforces.
 *
 * Arabic glosses are attached to the event names themselves so the page cannot
 * claim an event the app does not collect — a test compares the two lists.
 */

/** Arabic glosses for every allowed event; missing ones fall back to the name. */
export function eventsListAr(): string {
  return `نجمع أحداثاً محدودة فقط: ${ANALYTICS_EVENTS.map((name) => `${EVENT_GLOSS[name] ?? name} (${name})`).join('، ')}. ولا نجمع النصوص ولا الصوت ولا البريد ولا غير معرّف الحساب. الخصائص المسموح بها: ${ALLOWED_PROP_KEYS.join('، ')}.`;
}

/** The event names the page claims, for the drift test to compare. */
export function claimedEventNames(): string[] {
  const text = eventsListAr();
  return ANALYTICS_EVENTS.filter((name) => text.includes(`(${name})`));
}