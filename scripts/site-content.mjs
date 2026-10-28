/**
 * The copy for website.katzuai.com — four pages, one design, one set of facts.
 *
 * THE FOUR PAGES
 *   /           what Katzu is for: the situation you are preparing for, one real
 *               correction, how it works, the six situations, who it fits, moving.
 *   /pricing    the free card, the four founding plans, the offer rules once, and
 *               the purchase flow (#pay) with the lost-code path (#restore).
 *   /help       short FAQ answers that LINK instead of restating, then the full
 *               legal text (privacy, terms, refund) and one contact address.
 *   /affiliate  the partner programme; it lives in `site-content-affiliate.mjs`
 *               because its rules are read from `cloudflare-affiliate.js`.
 *
 * WHY IT IS ONE FILE
 * The pages share a nav, a footer and a background, and a fact written on
 * two pages is a fact that can disagree with itself. Every number below is read
 * from `pricing.config.json` — the same file the app and the Worker read — so a
 * price typed into a page cannot survive the next build.
 *
 * WHAT THIS FILE MAY NOT SAY
 * No ratings, testimonials, user counts, awards or official certificates; no
 * "unlimited"; no price on the home page. Those are product claims the repository
 * cannot prove, and `tests/offer.test.ts` scans the built pages for them.
 */

import {
  SITE,
  APP,
  WORKER,
  START,
  SUPPORT,
  UPDATED,
  CTA_LABEL,
  PLANS,
  FOUNDING_CAP,
  REFUND_DAYS,
  ACTIVATION_HOURS,
  FREE_LESSONS_PER_MONTH,
  PRICING_RULES_AR,
  PRICING_HEADLINE_AR,
  BEST_VALUE_AR,
  PAID_FEATURES,
  RESTORE_MAILTO,
  PLAN_ORDER_MAILTO,
  DEFAULT_PLAN_MAILTO,
  escAttr,
  formatUsd,
  planBadge,
  pricingCardsHtml,
  pricingRulesHtml,
  pricingOffersJsonLd,
} from './site-pricing.mjs';

// One import for the builder: the money vocabulary lives in site-pricing.mjs,
// the copy lives here, and nothing in between has to know the difference.
export {
  SITE,
  APP,
  WORKER,
  START,
  SUPPORT,
  UPDATED,
  CTA_LABEL,
  PLANS,
  FOUNDING_CAP,
  REFUND_DAYS,
  ACTIVATION_HOURS,
  FREE_LESSONS_PER_MONTH,
  PRICING_RULES_AR,
  PRICING_HEADLINE_AR,
  BEST_VALUE_AR,
  PAID_FEATURES,
  RESTORE_MAILTO,
  PLAN_ORDER_MAILTO,
  DEFAULT_PLAN_MAILTO,
  escAttr,
  formatUsd,
  planBadge,
  pricingCardsHtml,
  pricingRulesHtml,
  pricingOffersJsonLd,
};

/* ------------------------------------------------------------------ */
/* Nav + footer — one list, printed on every page                      */
/* ------------------------------------------------------------------ */

export const NAV_LINKS = [
  ['/', 'الرئيسية'],
  ['/pricing', 'الأسعار'],
  ['/help', 'المساعدة'],
];

export const FOOTER_LINKS = [
  ['/pricing', 'الأسعار'],
  ['/help', 'المساعدة'],
  ['/affiliate', 'الشركاء'],
  ['/help#privacy', 'الخصوصية'],
  ['/help#terms', 'الشروط'],
  ['/help#refund', 'الاسترداد'],
];

/* ------------------------------------------------------------------ */
/* /pricing                                                            */
/* ------------------------------------------------------------------ */

const pricingBody = () => `
<section class="wrap sec included">
  <h2>ما تحصل عليه في كل باقة مدفوعة</h2>
  <ul class="checks">
${PAID_FEATURES.map((line) => `    <li>${line}</li>`).join('\n')}
  </ul>
</section>

<section class="wrap sec plans-sec">
  <div class="plans">
${pricingCardsHtml()}
  </div>
</section>

${pricingRulesHtml()}

<section id="pay" class="wrap sec pay">
  <h2>كيف تحصل على الكود</h2>
  <ol class="steps three">
    <li><span class="num">1</span><h3>اختر باقة</h3><p>اضغط «اختر هذه الباقة» على المدة المناسبة أعلاه.</p></li>
    <li><span class="num">2</span><h3>راسلنا</h3><p>يفتح الزر رسالة جاهزة بالباقة والمبلغ. أرسلها، ونرسل لك تفاصيل الدفع المتاحة في بلدك.</p></li>
    <li><span class="num">3</span><h3>فعّل الكود</h3><p>يصلك كود التفعيل على بريدك خلال ${ACTIVATION_HOURS} ساعة كحد أقصى، وتُدخله داخل التطبيق.</p></li>
  </ol>
  <p class="codefact">كود واحد يحمل مدة الباقة التي اخترتها، وتُضاف المدة كاملة إلى اشتراكك عند التفعيل.</p>
  <p class="pay-cta"><a class="btn mag big" data-pay-cta href="${escAttr(DEFAULT_PLAN_MAILTO)}">راسلنا لترتيب الدفع</a></p>
  <p class="note">لا نطلب بيانات بطاقتك داخل التطبيق. شروط الاسترداد كاملة في <a class="inline" href="/help#refund">سياسة الاسترداد</a>.</p>

  <div id="restore" class="restore">
    <h3>فقدت كودك؟</h3>
    <p>أرسل من بريد الشراء نفسه، واذكر تاريخ الدفع إن كان لديك. نبحث عن الطلب ونعيد إرسال الكود.</p>
    <p><a class="inline" data-restore-cta href="${escAttr(RESTORE_MAILTO)}">استعادة كود التفعيل</a></p>
  </div>
</section>
`;

export const PRICING = {
  path: '/pricing',
  title: 'الأسعار — كاتزو',
  description:
    'باقة مجانية دائمة وأربع باقات مدفوعة بسعر المؤسسين، من شهر واحد إلى 12 شهراً. الدفع دون بطاقة بنكية، والتفعيل خلال 12 ساعة.',
  h1: 'أسعار المؤسسين',
  lead: 'اختر المدة التي تناسبك. كل ما تحتاجه لتبدأ مذكور هنا، بلا شروط مخفية.',
  body: pricingBody(),
  jsonld: [pricingOffersJsonLd()],
};

/* ------------------------------------------------------------------ */
/* /help                                                               */
/* ------------------------------------------------------------------ */

export const FAQ_AR = [
  {
    q: 'ما هو كاتزو؟',
    a: 'تطبيق تدريب على الألمانية المنطوقة: يضعك في موقف ويصحّح جملتك بالعربية. <a class="inline" href="/#rail">المواقف الستة</a>.',
  },
  {
    q: 'هل أحتاج بطاقة بنكية؟',
    a: `لا. ابدأ من <a class="inline" href="${START}">صفحة الترحيب</a>، وتفاصيل ما تحصل عليه مجاناً في <a class="inline" href="/pricing">صفحة الأسعار</a>.`,
  },
  {
    q: 'كم يكلّف؟',
    a: 'لكل باقة سعرها، والسعر المستقبلي مشطوب بجانبها. <a class="inline" href="/pricing">كل الباقات</a>.',
  },
  {
    q: 'كيف أدفع، وكيف يصلني الكود؟',
    a: `بالتنسيق المباشر معنا، ثم كود تفعيل على بريدك. <a class="inline" href="/pricing#pay">خطوات الشراء</a>.`,
  },
  {
    q: 'هل يمكنني استرداد مالي؟',
    a: 'على باقات 3 و6 و12 شهراً فقط، خلال المدة المعلنة. <a class="inline" href="#refund">سياسة الاسترداد</a>.',
  },
  {
    q: 'هل يغني عن الكورس؟',
    a: 'لا. الكورس يشرح القواعد بالترتيب، وكاتزو يدرّبك على استخدامها في موقف. لا يمنح شهادة رسمية، ولا يستبدل معلّماً بشرياً، ولا يكفي وحده للتحضير لامتحان معتمد.',
  },
  {
    q: 'هل يُحفظ صوتي؟',
    a: 'الجواب في فقرة «عند مزوّد الذكاء الاصطناعي» أدناه. <a class="inline" href="#privacy">الخصوصية</a>.',
  },
  {
    q: 'هل هناك حدّ للاستخدام؟',
    a: 'نعم، والحدّ نفسه ينطبق على الحصة المجانية والمدفوعة. <a class="inline" href="#terms">الشروط</a>.',
  },
  {
    q: 'هل يعمل دون إنترنت؟',
    a: 'المحتوى المحفوظ يعمل دون اتصال؛ المحادثة الحية تحتاج اتصالاً بالإنترنت.',
  },
  {
    q: 'هل يوجد تطبيق Android أصلي؟',
    a: 'لا. المنتج تطبيق ويب قابل للتثبيت على شاشتك الرئيسية.',
  },
  {
    q: 'هل يوجد برنامج شركاء؟',
    a: 'نعم، لمن يعرّف جمهوره بكاتزو. <a class="inline" href="/affiliate">تفاصيل برنامج الشركاء</a>.',
  },
];

export const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_AR.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.a.replace(/<[^>]+>/g, ''),
    },
  })),
};

/**
 * The help page. `legal` is the rendered markup of the three legal pages, which
 * come from `src/lib/trust/content.ts` — the single source for those sentences.
 */
export function helpPage(legal) {
  return {
    path: '/help',
    title: 'المساعدة — كاتزو',
    description:
      'أسئلة قصيرة، وعن كاتزو، والخصوصية والشروط والاسترداد والتواصل — كل النصوص الكاملة في صفحة واحدة.',
    h1: 'المساعدة',
    lead: 'إجابات قصيرة مع روابط للنص الكامل، ونصوص قانونية كاملة، وبريد واحد للتواصل.',
    body: helpBody(legal),
    jsonld: [FAQ_JSONLD],
    anchorNav: [
      ['#faq', 'الأسئلة'],
      ['#about', 'عن كاتزو'],
      ['#privacy', 'الخصوصية'],
      ['#terms', 'الشروط'],
      ['#refund', 'الاسترداد'],
      ['#contact', 'التواصل'],
    ],
    noEndCta: true,
  };
}

function helpBody(legal) {
  return `
<section id="faq" class="wrap sec">
  <h2>الأسئلة</h2>
  <div class="faq">
${FAQ_AR.map(
  (item) => `    <div class="qa"><h3>${item.q}</h3><p>${item.a}</p></div>`,
).join('\n')}
  </div>
</section>

<section id="about" class="wrap sec">
  <h2>عن كاتزو</h2>
  <p>كاتزو أداة تدريب لغوي عربية، بُنيت للناطقين بالعربية الذين يعيشون في ألمانيا أو يستعدّون للانتقال إليها.</p>
  <p>لا نبيع شهادات ولا نَعِد بالطلاقة: نضعك في موقف، ونصحّح جملتك حتى تصبح قابلة للاستخدام.</p>
  <p>فريق صغير، ومنتج واحد يعمل على الويب كتطبيق قابل للتثبيت.</p>
  <p><a class="inline" href="#contact">تواصل معنا</a>.</p>
</section>

<section id="privacy" class="wrap sec legal">
  <h2>الخصوصية والبيانات</h2>
  <p class="stamp">آخر تحديث: ${UPDATED} · النسخة العربية هي المرجع.</p>
${legal.privacy}
  <p>عند وصولك من رابط شريك نضع ملفاً تعريفياً (كوكي) على نطاق katzuai.com لمدة 30 يوماً يحمل كود الشريك فقط، ونربط الكود بحسابك عند التسجيل. لا يحتوي الملف على اسمك أو بريدك، ولا يُستخدم لغير نسبة العمولة.</p>
</section>

<section id="terms" class="wrap sec legal">
  <h2>شروط الاستخدام</h2>
  <p class="stamp">آخر تحديث: ${UPDATED} · النسخة العربية هي المرجع.</p>
${legal.terms}
</section>

<section id="refund" class="wrap sec legal">
  <h2>سياسة الاسترداد</h2>
  <p class="stamp">آخر تحديث: ${UPDATED} · النسخة العربية هي المرجع.</p>
${legal.refund}
</section>

<section id="contact" class="wrap sec">
  <h2>التواصل</h2>
  <p>البريد: <a class="inline" href="mailto:${SUPPORT}">${SUPPORT}</a>. نردّ بأنفسنا على كل رسالة.</p>
  <p>إن كان سؤالك عن الدفع، اذكر بريد الشراء أو كود التفعيل.</p>
  <p class="warn">لا نطلب كلمة مرور ولا رمز دخول. لا ترسلهما إلى أي بريد أو محادثة.</p>
</section>
`;
}
