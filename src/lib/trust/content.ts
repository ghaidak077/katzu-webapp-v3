// Relative on purpose: the public-page generator bundles this module with
// esbuild before Vite resolves the `@/` alias, and this module is its only
// legal-text source.
import {
  ACTIVATION_HOURS,
  PLAN_BY_ID,
  REFUND_DAYS,
  REFUND_PLAN_IDS,
  type PlanId,
} from '../offers/foundingPlans';

/**
 * The legal text of the public site, as fields rather than prose.
 *
 * WHY STRUCTURED
 * A legal page written as one paragraph is one paragraph nobody can check. Every
 * section below has an id, a heading and one body, and the build renders them
 * inline in `/help#privacy`, `/help#terms` and `/help#refund`. That keeps one
 * source for the sentences the site publishes and the app links to.
 *
 * WHAT IS NOT HERE
 * The owner's legal choices — governing law, publisher identity and address,
 * registry numbers, a dispute-resolution forum — are NOT invented here. They are
 * open owner items in `docs/AGENT-STATE.md`, not sentences this file makes up.
 * `OWNER_FILL` stays exported so `scripts/check-launch.mjs` can still turn a
 * future placeholder into a release blocker.
 *
 * WHY THE PRIVACY PAGE IS BY CATEGORY
 * "A list of every event we track" was a maintenance tax and a reader could not
 * use it. A privacy page answers four questions — what stays on the device, what
 * reaches the server, what reaches the AI provider, what analytics collects — and
 * one sentence per category is what a person can actually check.
 */

export type TrustPage = 'privacy' | 'terms' | 'refund';

export interface TrustSection {
  id: string;
  /** Arabic heading. */
  headingAr: string;
  /** A real sentence (or several, newline-separated). */
  bodyAr: string;
}

export interface TrustContent {
  titleAr: string;
  updatedAr: string;
  sections: TrustSection[];
}

/**
 * The fields only the owner can answer. Never invented, never guessed.
 * No section currently uses it; the constant is the token the launch check scans
 * for, so adding an owner-only sentence later fails the strict gate immediately.
 */
export const OWNER_FILL = '{{OWNER_FILL}}';

/** The support address the app already prints; not an owner field. */
export const SUPPORT_ADDRESS_AR = 'support@ghaidak.com';

/** The published version label, so a change is visible without a git log. */
export const TRUST_VERSION = '2026-10-28';

/** "3 أشهر و6 أشهر و12 شهراً" — the refundable plans, from the config's id list. */
const REFUND_PLANS_AR = REFUND_PLAN_IDS.map((id) => PLAN_BY_ID[id as PlanId]?.nameAr)
  .filter(Boolean)
  .join(' و');

export const TRUST_CONTENT: Record<TrustPage, TrustContent> = {
  privacy: {
    titleAr: 'الخصوصية والبيانات',
    updatedAr: `آخر تحديث: ${TRUST_VERSION}`,
    sections: [
      {
        id: 'device',
        headingAr: 'على جهازك',
        bodyAr:
          'حسابك، وتقدّمك، والجُمل التي قلتها، وأخطاؤك المصحّحة، ومفرداتك، ومحتوى التعلّم — تُحفظ في متصفحك (IndexedDB) ليعمل التطبيق دون اتصال، وتبقى بعد إغلاقه على الجهاز نفسه.',
      },
      {
        id: 'server',
        headingAr: 'على الخادم',
        bodyAr:
          'معرّف حسابك، وتقدّمك، وأخطاؤك، وسجلات المزامنة — لحفظ تقدّمك عبر أجهزتك واستعادة جلستك. لا نخزّن كلمة مرور، لأن الدخول عبر حساب Google.',
      },
      {
        id: 'ai',
        headingAr: 'عند مزوّد الذكاء الاصطناعي',
        bodyAr:
          'نص رسالتك، أو الجملة التي تطلب تصحيحها أو ترجمتها — وقت الطلب فقط، ويُرسل إلى مزوّد الذكاء الاصطناعي لتوليد الرد. الصوت يُعالَج لفهم كلامك ولا يُخزَّن، والنصوص لا تُستخدم للتسويق.',
      },
      {
        id: 'analytics',
        headingAr: 'القياس',
        bodyAr: 'أسماء أحداث محدودة، ووقتها، ومعرّف تثبيت مجهول — بلا نصوص ولا صوت ولا بريد.',
      },
      {
        id: 'rights',
        headingAr: 'حقوقك',
        bodyAr:
          'تصدير كل بياناتك أو حذف حسابك من الإعدادات في أي وقت. الحذف يشمل بيانات الجهاز والخادم ويلغي جلسات الدخول.',
      },
    ],
  },
  terms: {
    titleAr: 'شروط الاستخدام',
    updatedAr: `آخر تحديث: ${TRUST_VERSION}`,
    sections: [
      {
        id: 'nature',
        headingAr: 'طبيعة الخدمة',
        bodyAr:
          'كاتزو أداة تدريب لغوي. ليست بديلاً عن محامٍ أو طبيب أو جهة حكومية أو مستشار هجرة، ولا تمنح أي شهادة أو درجة رسمية معتمدة.',
      },
      {
        id: 'account',
        headingAr: 'حسابك',
        bodyAr:
          'حسابك شخصي، والدخول عبر Google. أنت مسؤول عن الجهاز الذي تستخدمه وعن حماية حسابك، وعن كل نشاط يحدث من خلاله.',
      },
      {
        id: 'fairuse',
        headingAr: 'الاستخدام العادل',
        bodyAr:
          'الحدود الظاهرة داخل التطبيق سارية على الحصة المجانية والمدفوعة معاً. لا نبيع خدمة بلا سقف، ونوضّح أي حد قبل أن تصل إليه.',
      },
      {
        id: 'codes',
        headingAr: 'أكواد التفعيل',
        bodyAr:
          'كود التفعيل شخصي وغير قابل للتحويل أو إعادة البيع، ويُفعَّل داخل التطبيق فقط، ويضيف مدة الباقة التي اخترتها إلى اشتراكك. الكود الذي حصلت عليه من جهة أخرى ليس مسؤوليتنا.',
      },
      {
        id: 'changes',
        headingAr: 'تغيير الخدمة',
        bodyAr:
          'قد نضيف ميزة أو نوقفها، وقد نحدّث هذه الشروط. إن أوقفنا الخدمة كلياً، نعيد المبلغ المتبقي من اشتراكك.',
      },
      {
        id: 'liability',
        headingAr: 'المسؤولية',
        bodyAr:
          'الخدمة مقدَّمة كما هي. لا نضمن نتيجة امتحان ولا موافقة جهة رسمية، والقرارات التي تتخذها تبقى مسؤوليتك.',
      },
    ],
  },
  refund: {
    titleAr: 'سياسة الاسترداد',
    updatedAr: `آخر تحديث: ${TRUST_VERSION}`,
    sections: [
      {
        id: 'window',
        headingAr: 'المدة والباقات',
        bodyAr: `استرداد كامل خلال أول ${REFUND_DAYS} أيام من تاريخ التفعيل، على باقات ${REFUND_PLANS_AR}. باقة ${PLAN_BY_ID.monthly.nameAr} بلا استرداد.`,
      },
      {
        id: 'how',
        headingAr: 'كيف تطلب الاسترداد',
        bodyAr: `أرسل بريداً إلى ${SUPPORT_ADDRESS_AR} من بريد الشراء نفسه، واذكر كود التفعيل. نعيد المبلغ إلى وسيلة الدفع التي استخدمتها.`,
      },
      {
        id: 'after',
        headingAr: 'بعد انتهاء المدة',
        bodyAr: `بعد أول ${REFUND_DAYS} أيام من التفعيل لا تُسترد المبالغ المدفوعة، ويبقى اشتراكك عاملاً حتى نهايته. إن لم يصل الكود خلال ${ACTIVATION_HOURS} ساعة، راسلنا على العنوان نفسه.`,
      },
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
