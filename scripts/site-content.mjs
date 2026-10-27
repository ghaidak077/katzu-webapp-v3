/**
 * The copy for website.katzuai.com's generated pages.
 *
 * This is the successor of the deleted `src/lib/seo/publicContent.ts`: the app
 * no longer renders any public page, so the topic pages, the English pages and
 * their facts live here and are written out by `scripts/build-website.mjs`.
 *
 * FACTS (single source, matching the live landing page `website/index.html`):
 *   - free tier: 3 AI lessons per month after a free Google sign-up, no card
 *   - Pro: one year for 60 dollars with coupon KATZU26, all levels A0–B2
 *   - refund: full within the first 7 days, none afterwards
 *   - activation code arrives within 12 hours, activated inside the app
 *   - voice is processed, never stored; export/delete from inside the app
 *   - fair daily AI ceiling, stated inside the app before it is reached
 * Nothing here may claim ratings, testimonials, user counts, awards, an
 * official certificate, or an end date for the limited offer (none published).
 */

export const SITE = 'https://website.katzuai.com';
export const APP = 'https://katzuai.com';
/** Where every "ابدأ مجاناً" CTA goes: the demo lesson was removed. */
export const START = `${APP}/welcome`;
export const SUBSCRIBE = `${APP}/subscription`;
export const UPDATED = '2026-10-27';
export const COUPON = 'KATZU26';
export const SUPPORT = 'support@ghaidak.com';

export const NAV_AR = [
  ['/how-it-works', 'كيف يعمل'],
  ['/who-its-for', 'لمن يناسب'],
  ['/compare', 'المقارنة'],
  ['/use-cases/moving-to-germany', 'الانتقال'],
  ['/pricing', 'الأسعار'],
  ['/faq', 'الأسئلة'],
  ['/about', 'عن كاتزو'],
];

export const NAV_EN = [
  ['/en/how-it-works', 'How it works'],
  ['/en/who-its-for', 'Who it is for'],
  ['/en/compare', 'Compare'],
  ['/en/use-cases/moving-to-germany', 'Moving'],
  ['/en/pricing', 'Pricing'],
  ['/en/faq', 'FAQ'],
  ['/en/about', 'About'],
];

/** The footer link row, shared by every page (the landing uses the same list). */
export const FOOTER_AR = [
  ...NAV_AR,
  ['/trust/privacy', 'الخصوصية'],
  ['/trust/terms', 'الشروط'],
  ['/trust/refund', 'الاسترداد'],
  ['/trust/contact', 'تواصل معنا'],
  ['/en', 'English'],
];

export const FOOTER_EN = [
  ...NAV_EN,
  ['/en', 'Home'],
  ['/trust/privacy', 'Privacy (Arabic)'],
  ['/trust/terms', 'Terms (Arabic)'],
  ['/trust/refund', 'Refunds (Arabic)'],
  ['/', 'العربية'],
];

/** Trust pages: meta descriptions (the body comes from src/lib/trust/content.ts). */
export const TRUST_META = {
  privacy: {
    ar: {
      title: 'الخصوصية والبيانات — كاتزو',
      description: 'كيف يتعامل كاتزو مع البيانات: ما يُحفظ على جهازك، ما يُرسل للخادم، وما يذهب إلى مزوّد الذكاء الاصطناعي، وحقوقك في التصدير والحذف.',
    },
  },
  terms: {
    ar: {
      title: 'شروط الاستخدام — كاتزو',
      description: 'شروط استخدام كاتزو: طبيعة الأداة، حدود الاستخدام العادل، الدفع والتفعيل، والاسترداد.',
    },
  },
  refund: {
    ar: {
      title: 'سياسة الاسترداد — كاتزو',
      description: 'سياسة الاسترداد في كاتزو: استرداد كامل خلال أول 7 أيام من الاشتراك، وكيف تطلب الاسترداد.',
    },
  },
  imprint: {
    ar: {
      title: 'بيانات الناشر — كاتزو',
      description: 'بيانات ناشر كاتزو ومعلومات التواصل والمسؤولية.',
    },
  },
  contact: {
    ar: {
      title: 'تواصل معنا — كاتزو',
      description: 'كيف تتواصل مع دعم كاتزو بخصوص الحساب أو الخصوصية أو الدفع، وما لا نطلبه أبداً.',
    },
  },
};

/* ------------------------------------------------------------------ */
/* Arabic FAQ — the landing's six items, plus what visitors actually ask */
/* ------------------------------------------------------------------ */

export const FAQ_AR = [
  {
    q: 'ما هو كاتزو؟',
    a: 'كاتزو تطبيق ذكاء اصطناعي لتعلّم الألمانية بالتحدّث، مبني للناطقين بالعربية من A0 إلى B2. تختار موقفاً من حياتك في ألمانيا، وتتحدث أو تكتب جملك، ويصحّح لك كاتزو بالعربية.',
  },
  {
    q: 'كيف أبدأ؟ وهل أحتاج بطاقة بنكية؟',
    a: `ابدأ مجاناً من <a class="inline" href="${START}">صفحة الترحيب</a>: تسجيل بحساب Google فقط، بلا بطاقة بنكية، وتحصل على 3 دروس بالذكاء الاصطناعي كل شهر تتجدد.`,
  },
  {
    q: 'ماذا يحدث بعد الدروس الثلاثة المجانية؟',
    a: 'تتجدد دروسك المجانية كل شهر، ويمكنك الاشتراك متى أردت.',
  },
  {
    q: 'ما المجاني، وما الذي يضيفه Pro؟',
    a: `المجاني يعطيك 3 دروس بالذكاء الاصطناعي كل شهر بعد التسجيل، مع المهمة اليومية والمراجعة المتباعدة واختبار المستوى وبنك الأخطاء. و<span class="de">Pro</span> — بسعر سنة كاملة <b>60 دولاراً</b> بوكوبون <span class="de">${COUPON}</span> — يفتح كل المستويات من A0 إلى B2 وكل المواقف، مع بنك المفردات والقواعد ومحادثة يومية بحدّ عادل للاستخدام.`,
  },
  {
    q: 'كيف أدفع؟ وهل أدخل بطاقتي داخل التطبيق؟',
    a: 'الشراء من صفحة الاشتراك الرسمية داخل التطبيق، والدفع يعمل دون بطاقة بنكية. يصلك كود التفعيل خلال 12 ساعة كحد أقصى، وتُفعّله داخل التطبيق — لا نطلب بيانات بطاقتك داخل التطبيق أبداً.',
  },
  {
    q: 'هل يمكنني الإلغاء واسترداد مالي؟',
    a: 'نعم. خلال أول 7 أيام من اشتراكك تستردّ مبلغك كاملاً إن لم يناسبك كاتزو. بعد ذلك لا تُسترد المبالغ المدفوعة. التفاصيل في <a class="inline" href="/trust/refund">صفحة الاسترداد</a>.',
  },
  {
    q: 'ما المستويات المتاحة؟',
    a: 'من الصفر (<span class="de">A0</span>) حتى <span class="de">B2</span>. وإن كنت مبتدئاً تماماً فلا بأس: كاتزو يشرح لك كل تصحيح بالعربية.',
  },
  {
    q: 'هل أستطيع الكتابة بدل الكلام؟',
    a: 'نعم. تجيب كتابةً أو بصوتك، والميكروفون اختياري. التحدث أنفع للطفلاقة، لكنه ليس شرطاً للبدء.',
  },
  {
    q: 'هل يُحفظ صوتي؟',
    a: 'لا. يُعالَج لفهم كلامك فقط ولا يُخزَّن، وأخطاؤك ومحادثاتك تبقى على جهازك.',
  },
  {
    q: 'ماذا يحدث لبياناتي؟',
    a: 'تقدّمك وأخطاؤك محفوظة لحسابك، ويمكنك تصدير بياناتك أو حذف حسابك من داخل التطبيق في أي وقت. التفاصيل في <a class="inline" href="/trust/privacy">صفحة الخصوصية</a>.',
  },
  {
    q: 'هل هناك حد للاستخدام العادل؟',
    a: 'نعم، سقف استخدام عادل يومي يحمي الخدمة من الإساءة. هو حدّ معلن تراه داخل التطبيق قبل أن تصل إليه، وليس قفلاً مفاجئاً.',
  },
  {
    q: 'هل يعمل بدون إنترنت؟',
    a: 'باترويب قابل للتثبيت (PWA) يخزّن محتواه للاستخدام دون اتصال بعد أول زيارة. المحادثة الحية تحتاج اتصالاً بالإنترنت لأن الرد يأتي من الخادم.',
  },
  {
    q: 'هل يُغني كاتزو عن الكورس؟',
    a: 'لا. تتعلّم القواعد في كورسك، وتتدرّب عليها هنا.',
  },
  {
    q: 'هل يحضّرني لامتحان Goethe أو telc؟',
    a: 'كاتزو أداة تدريب مستقلة، ليست منتجاً رسمياً لـGoethe أو telc ولا تمنح شهادة أو درجة رسمية. نعمل حالياً على تدريب صيغة الامتحانات (Goethe · telc · DTZ من A1 إلى B2)، ونُطلقها فقط عندما تكون جاهزة وقابلة للقياس.',
  },
  {
    q: 'هل يوجد تطبيق Android أصلي؟',
    a: 'المنتج الحي هو تطبيق الويب/PWA في المتصفح، ويمكن تثبيته على شاشتك الرئيسية. لا يوجد تطبيق Android أصلي منشور من هذا المستودع.',
  },
];

export const FAQ_EN = [
  {
    q: 'What is Katzu?',
    a: 'Katzu is an AI German-learning app built around speaking, for Arabic speakers from A0 to B2. You pick a real situation from life in Germany, speak or type your sentences, and Katzu corrects you in Arabic.',
  },
  {
    q: 'How do I start? Do I need a card?',
    a: `Start free from the <a class="inline" href="${START}">welcome page</a>: sign-in with a Google account only, no bank card, and you get 3 AI lessons per month that refresh monthly.`,
  },
  {
    q: 'What happens after the three free lessons?',
    a: 'Your free lessons refresh every month, and you can subscribe whenever you want.',
  },
  {
    q: 'What is free, and what does Pro add?',
    a: `Free gives you 3 AI lessons per month after sign-up, plus the daily mission, spaced review, placement test and mistake bank. <span class="de">Pro</span> — a full year for <b>60 dollars</b> with coupon <span class="de">${COUPON}</span> — opens every level from A0 to B2 and every situation, with the vocabulary and grammar banks and a daily conversation under a fair-use ceiling.`,
  },
  {
    q: 'How do I pay? Is my card stored in the app?',
    a: 'You buy through the official subscription page, and payment works without a bank card. Your activation code arrives within 12 hours at the latest and is redeemed inside the app — we never ask for card details inside the app.',
  },
  {
    q: 'Can I cancel and get my money back?',
    a: `Yes. Within the first 7 days of your subscription you get a full refund if Katzu does not suit you. After that, paid amounts are not refunded. Details on the <a class="inline" href="/trust/refund">refund page</a>.`,
  },
  {
    q: 'Which levels are available?',
    a: 'From zero (<span class="de">A0</span>) to <span class="de">B2</span>. If you are a complete beginner that is fine: Katzu explains every correction in Arabic.',
  },
  {
    q: 'Can I type instead of speaking?',
    a: 'Yes. Answer by text or by voice; the microphone is optional. Speaking builds fluency faster, but it is not required to start.',
  },
  {
    q: 'Is my voice stored?',
    a: 'No. It is processed only to understand what you said and is never stored; your mistakes and conversations stay on your device.',
  },
  {
    q: 'What happens to my data?',
    a: `Your progress and mistakes belong to your account, and you can export your data or delete your account from inside the app at any time. Details on the <a class="inline" href="/trust/privacy">privacy page</a>.`,
  },
  {
    q: 'Is there a fair-use limit?',
    a: 'Yes, a fair daily ceiling that protects the service from abuse. It is announced inside the app before you reach it — not a hidden lock.',
  },
  {
    q: 'Does it work offline?',
    a: 'It is an installable web app (PWA) that stores its content for offline use after the first visit. A live conversation needs an internet connection because the reply comes from the server.',
  },
  {
    q: 'Does Katzu replace a course?',
    a: 'No. You learn the rules in your course, and practise them here.',
  },
  {
    q: 'Does it prepare me for a Goethe or telc exam?',
    a: 'Katzu is an independent training tool, not an official Goethe or telc product, and it issues no certificate or official result. We are currently building exam-format practice (Goethe · telc · DTZ from A1 to B2) and will launch it only when it is ready and measurable.',
  },
  {
    q: 'Is there a native Android app?',
    a: 'The live product is the installable web app (PWA) in your browser — it can be added to your home screen. There is no native Android build published from this repository.',
  },
];

/* ------------------------------------------------------------------ */
/* The seven Arabic topic pages                                        */
/* ------------------------------------------------------------------ */

export const AR_PAGES = [
  {
    path: '/how-it-works',
    title: 'كيف يعمل كاتزو — تدريب محادثة الألمانية خطوة بخطوة',
    description:
      'كيف يعمل كاتزو: اختر مواقفاً من حياتك في ألمانيا، ادرس العبارات، تحدّث أو اكتب، ثم راجع تصحيحاً بالعربية وبنك أخطاء. من A0 إلى B2.',
    h1: 'كيف يعمل كاتزو',
    lead:
      'من موقف حقيقي إلى جملة تقولها بنفسك: تدرس العبارات، تتأكد من فهمك، تتحدّث أو تكتب، ثم تراجع ما يحتاج إصلاحاً. لا تحفظ قائمة كلمات بلا سياق.',
    body: `
<div class="wrap prose">
  <ol class="co">
    <li class="reveal"><b>اختر موقفاً</b><p>ستة مواقف من حياتك في ألمانيا: السفارة، الطبيب، مقابلة العمل، معاينة الشقة، المطار، والمقهى. كل موقف يبدأ من مستواك.</p></li>
    <li class="reveal"><b>اسمع الجملة وترجمها عند الحاجة</b><p>اضغط السماعة لتسمع النطق الصحيح، والترجمة العربية تحت الجملة ولا تحتاجها إلا إن علقت.</p></li>
    <li class="reveal"><b>تحدّث أو اكتب</b><p>سجل جملتك بالألمانية بصوتك أو اكتبها. الميكروفون اختياري، والتصحيح يعود بالعربية فوراً — الخطأ يُشرح لا يُسخر منه.</p></li>
    <li class="reveal"><b>خذ تصحيحاً لا تخميناً</b><p>كاتزو يعطيك الصيغة الصحيحة مع سببه: لماذا <span lang="de" class="de">zum Arzt</span> لا <span lang="de" class="de">nach Arzt</span>، ولماذا العمر بفعل <span lang="de" class="de">sein</span> لا <span lang="de" class="de">haben</span>.</p></li>
    <li class="reveal"><b>كل خطأ يعود إليك</b><p>خطأ واحد أربعة محطات مراجعة: اليوم، بعد أيام، بعد أسبوع، وبعد شهر. إن قلتها صحيحة عند المحطة الأخيرة فقد أتقنتها.</p></li>
    <li class="reveal"><b>حافظ على العادة</b><p>مهمة يومية قصيرة تبقى مفتوحة لك مجاناً — المراجعة وبنك الأخطاء لا تُقفل حتى وإن لم تشترك.</p></li>
  </ol>

  <div class="callout reveal"><h2>ابدأ مجاناً بلا بطاقة</h2><p>المجاني يعطيك 3 دروس بالذكاء الاصطناعي كل شهر بعد التسجيل، مع المهمة اليومية والمراجعة المتباعدة واختبار المستوى وبنك الأخطاء. و<span class="de">Pro</span> يفتح كل المستويات من A0 إلى B2 بسعر سنة كاملة <b>60 دولاراً</b> بوكوبون <span class="de">${COUPON}</span>.</p></div>

  <div class="callout reveal"><h2>ما لا يفعله كاتزو</h2><p>ليس دورة امتحان رسمية، ولا يمنح شهادة أو درجة رسمية، وليس بديلاً عن محامٍ أو طبيب أو مستشار هجرة. نعمل حالياً على تدريب صيغة الامتحانات (Goethe · telc · DTZ من A1 إلى B2) ونُطلقها فقط عندما تكون جاهزة وقابلة للقياس.</p></div>

  <p class="reveal" style="margin-top:30px"><a class="btn" href="${START}">ابدأ مجاناً</a> <a class="btn gh" href="/pricing">شاهد المجاني وPro</a></p>
</div>`,
  },
  {
    path: '/who-its-for',
    title: 'لمن يناسب كاتزو — ولمن لا يناسب',
    description:
      'كاتزو مناسب للناطقين بالعربية الذين يستعدون للحياة في ألمانيا ويحتاجون تدريب محادثة من A0 إلى B2. تعرّف بصراحة على من يناسبه ومن لا يناسبه.',
    h1: 'لمن يناسب كاتزو — ولمن لا يناسب',
    lead: 'لا نبيعه للجميع. هذه المقارنة الصادقة: إن أنت في القائمة الأولى، سيفيدك. وإن كنت في الثانية، لن نقول لك غير ذلك.',
    body: `
<div class="wrap prose">
  <div class="cols2">
    <section class="pane reveal"><h2>مناسب لك إذا…</h2><ul>
      <li>أنت ناطق بالعربية وتستعد للانتقال إلى ألمانيا للعمل أو الدراسة أو الحياة، وتحتاج أن تتكلّم لا أن تحفظ فقط.</li>
      <li>وصلت حديثاً وتواجه مواقف مثل السفارة والطبيب والعمل والشقة، وتريد تدريباً قبل الموقف الحقيقي.</li>
      <li>مستواك بين A0 وB2، وتفضّل شرحاً بالعربية بدل دورة كاملة بالألمانية.</li>
      <li>تريد محادثة قصيرة يومية بالصوت أو الكتابة، مع تصحيح صريح وأربع محطات مراجعة لكل خطأ.</li>
      <li>تريد أن تعرف ما تحصل عليه قبل الدفع: 3 دروس شهرياً مجاناً، وسنة Pro بسعر معلن، والاسترداد خلال 7 أيام.</li>
    </ul></section>
    <section class="pane reveal"><h2>قد لا يناسبك إذا…</h2><ul>
      <li>تبحث عن كتاب قواعد شامل أو منهج أكاديمي طويل؛ كاتزو يبدأ من المواقف لا من فصول النحو.</li>
      <li>تريد شهادة رسمية أو ضمان نجاح في Goethe أو telc أو DTZ؛ لا تمنح أي شهادة أو درجة رسمية.</li>
      <li>تحتاج استشارة قانونية أو طبية أو هجرة؛ استخدم مختصاً مرخصاً.</li>
      <li>تريد مدرّساً بشرياً أو شبكة اجتماعية؛ كاتزو أداة تدريب فردية.</li>
      <li>تريد فقط بطاقات حفظ بلا محادثة؛ المراجعة موجودة، لكن جوهر المنتج هو إنتاجك أنت.</li>
    </ul></section>
  </div>
  <div class="callout reveal"><h2>ما هو مدعوم الآن فعلاً</h2><p>ستة مواقف من حياتك في ألمانيا — السفارة، الطبيب، مقابلة العمل، معاينة الشقة، المطار، والمقهى — بمستويات من A0 إلى B2، ومحادثة بالصوت أو الكتابة. ما عدا ذلك من الخطط غير منشور، ولا نعد به هنا.</p></div>
  <p class="reveal" style="margin-top:30px"><a class="btn" href="${START}">ابدأ مجاناً</a> <a class="btn gh" href="/how-it-works">كيف يعمل؟</a></p>
</div>`,
  },
  {
    path: '/compare',
    title: 'كاتزو مقارنةً بتطبيقات البطاقات والدورات والمدرّس',
    description:
      'مقارنة صادقة بين كاتزو وتطبيقات البطاقات والدورات العامة والمدرّس البشري ودورات الامتحانات: ما يفعله كاتزو، وما لا يدّعيه.',
    h1: 'كاتزو مقارنةً بالبدائل',
    lead: 'لا نقول إن كاتزو أفضل من كل شيء. لكل أداة وظيفة مختلفة، وهذه مقارنة بما نعرفه فعلاً عن منتجنا.',
    body: `
<div class="wrap prose">
  <div class="compare-grid">
    <section class="pane reveal"><h2>مقابل تطبيقات البطاقات</h2><p>البطاقات ممتازة للتذكّر السريع، لكنها غالباً تختبر إن كنت تتعرّف على الكلمة. كاتزو يطلب منك أن تنتج الألمانية في موقف، بالصوت أو الكتابة، ثم يصحح لك ويحول الخطأ إلى تمرين مراجعة.</p></section>
    <section class="pane reveal"><h2>مقابل دورة عامة</h2><p>الدورة العامة تبني تقدماً منهجياً واسعاً. كاتزو يبدأ من المواقف التي تلي الانتقال إلى ألمانيا، ويشرح بالعربية. إذا كنت تريد نحوًا شاملاً أو منهجاً أكاديمياً طويلاً، فالدورة العامة أنسب.</p></section>
    <section class="pane reveal"><h2>مقابل مدرّس بشري</h2><p>المدرّس البشري يقدّم علاقة وملاحظة إنسانية لا يستطيعها تطبيق. كاتزو يقدّم تدريباً متاحاً في أي وقت بسعر اشتراك سنوي واحد، لكنه ليس بديلاً عن مدرّس ولا يمنح شهادة.</p></section>
    <section class="pane reveal"><h2>مقابل دورات الامتحانات</h2><p>دورات الامتحانات تتدرّب على الصيغة والشروط الرسمية. كاتزو يبني الأساس من A0 إلى B2 بالمحادثة، وتدريب صيغة الامتحانات قيد العمل — وحين يُنشر سيكون قابلاً للقياس، لا وعوداً.</p></section>
  </div>
  <div class="callout reveal"><h2>ما لا ندّعيه</h2><p>لا نعرض تقييمات أو شهادات مستخدمين أو أعداداً أو جوائز. لا نضمن لك النجاح في امتحان أو القبول في وظيفة. نعرض فقط ما يمكن التحقق منه في التطبيق وسياساته.</p></div>
  <p class="reveal" style="margin-top:30px"><a class="btn" href="/pricing">شاهد ما تحصل عليه</a> <a class="btn gh" href="/who-its-for">لمن يناسب؟</a></p>
</div>`,
  },
  {
    path: '/use-cases/moving-to-germany',
    title: 'الألمانية للانتقال إلى ألمانيا — مواقف حقيقية',
    description:
      'تدرّب على الألمانية للمواقف التي تلي الانتقال إلى ألمانيا: السفارة، الطبيب، مقابلة العمل، معاينة الشقة، المطار، والمقهى. من A0 إلى B2 بواجهة عربية.',
    h1: 'الألمانية للانتقال إلى ألمانيا',
    lead:
      'الانتقال إلى ألمانيا يضعك في مواقف تحتاج فيها ألمانية واضحة وسريعة، لا ألمانية الامتحان فقط. كاتزو يتدرّب على هذه المواقف بالصوت أو الكتابة، مع شرح عربي لما يقوله الطرف الآخر.',
    body: `
<div class="wrap prose">
  <div class="callout reveal"><h2>المواقف الستة المنشورة الآن</h2><ul>
    <li><b>السفارة:</b> موعد السفارة مع موظف الاستقبال — <span lang="de" class="de">Warum möchten Sie nach Deutschland?</span></li>
    <li><b>عند الطبيب:</b> حوار في عيادة ألمانية — <span lang="de" class="de">Wo genau tut es weh?</span></li>
    <li><b>مقابلة العمل:</b> مقابلة مع مدير توظيف ألماني — <span lang="de" class="de">Erzählen Sie etwas über sich.</span></li>
    <li><b>معاينة الشقة:</b> حوار مع المالك أثناء المعاينة — <span lang="de" class="de">Wann können Sie einziehen?</span></li>
    <li><b>المطار:</b> الوصول وإجراءات الدخول — <span lang="de" class="de">Was ist der Zweck Ihrer Reise?</span></li>
    <li><b>المقهى:</b> الطلب في مقهى ألماني — <span lang="de" class="de">Ich möchte bitte einen Kaffee.</span></li>
  </ul></div>

  <div class="callout reveal"><h2>كيف تستخدمه للانتقال؟</h2><p>اختر الموقف الأقرب لموعدك القادم، اسمع الجملة، ثم تحدّث. بعد الجلسة يعود كل خطأ إليك في أربع محطات مراجعة: اليوم، بعد أيام، بعد أسبوع، وبعد الشهر — حتى تقلّها صحيحة دون تفكير.</p></div>

  <div class="callout reveal"><h2>حدود واضحة</h2><p>كاتزو ليس مكتب هجرة ولا محامياً ولا مستشاراً قانونياً، ولا يتعامل معك بدلاً من الجهات الرسمية. لا يمنح شهادة أو تأشيرة أو عقد عمل. للقرارات الرسمية استخدم الجهة المختصة.</p></div>

  <p class="reveal" style="margin-top:30px"><a class="btn" href="${START}">ابدأ مجاناً</a> <a class="btn gh" href="/faq">اقرأ الأسئلة الشائعة</a></p>
</div>`,
  },
  {
    path: '/pricing',
    title: 'أسعار كاتزو — المجاني وPro',
    description:
      'ما يفتحه المجاني في كاتزو (3 دروس كل شهر)، وما يضيفه Pro (سنة كاملة بسعر 60 دولاراً بوكوبون)، وكيف يعمل الكود. استرداد كامل خلال أول 7 أيام.',
    h1: 'ابدأ مجاناً. واشترك حين تريد أكثر.',
    lead: 'المجاني ليس عرضاً تجريبياً ينتهي بعد يومين: تجدد دروسك كل شهر. والإتقان يحتاج حديثاً كل يوم.',
    body: `
<div class="wrap prose" style="max-width:860px">
  <div class="tiers reveal" style="text-align:start">
    <article class="tier glass"><h3>مجاناً دائماً</h3><p style="font:900 1.8rem Cairo">0 دولار</p><ul>
      <li>3 دروس بالذكاء الاصطناعي كل شهر بعد التسجيل.</li>
      <li>المهمة اليومية والمراجعة المتباعدة.</li>
      <li>اختبار المستوى وبنك الأخطاء.</li>
      <li>بلا بطاقة بنكية.</li>
    </ul><a class="btn gh" href="${START}">ابدأ مجاناً</a></article>
    <article class="tier f glass"><span class="save">عرض لفترة محدودة — ينتهي 31 يناير 2027</span><h3>سنة كاملة</h3><p style="font:900 1.8rem Cairo">60 دولاراً</p><ul>
      <li>أقل من 17 سنتاً في اليوم.</li>
      <li>كل المواقف والمستويات من A0 إلى B2.</li>
      <li>بنك المفردات والقواعد.</li>
      <li>محادثة يومية بحدّ عادل للاستخدام، دون قفل مفاجئ.</li>
      <li>استرداد كامل خلال أول 7 أيام.</li>
    </ul><button class="cp" type="button" data-copy="${COUPON}">الكوبون <span class="de">${COUPON}</span> · انسخه</button><a class="btn mag" href="${SUBSCRIBE}">اشترك سنوياً</a></article>
  </div>

  <div class="callout reveal"><h2>الدفع والكود</h2><p>الدفع يعمل دون بطاقة بنكية، ويصلك كود التفعيل خلال 12 ساعة كحد أقصى، وتُفعّله داخل التطبيق. لا نطلب بيانات بطاقتك داخل التطبيق أبداً، ولا يوجد تجديد تلقائي مفاجئ.</p></div>

  <div class="callout reveal"><h2>الاسترداد</h2><p>خلال أول 7 أيام من اشتراكك تستردّ مبلغك كاملاً إن لم يناسبك كاتزو؛ بعد ذلك لا تُسترد المبالغ المدفوعة. <a class="inline" href="/trust/refund">اقرأ صفحة الاسترداد</a> كاملة.</p></div>

  <div class="callout reveal"><h2>حدّ الاستخدام العادل</h2><p>سقف استخدام يومي يحمي الخدمة من الإساءة ولا يمسّ استخدامك المعتاد؛ تراه داخل التطبيق قبل أن تصل إليه — حدّ معلن، لا قفلاً مخفياً.</p></div>

  <p class="reveal" style="margin-top:30px"><a class="btn" href="${START}">ابدأ مجاناً</a> <a class="btn gh" href="/faq">أسئلة قبل أن تدفع</a></p>
</div>`,
  },
  {
    path: '/faq',
    title: 'أسئلة شائعة عن كاتزو',
    description:
      'أسئلة شائعة عن كاتزو: البدء المجاني، المجاني وPro، الصوت والكتابة، الخصوصية، الدفع والاسترداد، والامتحانات.',
    h1: 'أسئلة قبل أن تبدأ',
    lead: 'أسئلة نُسأل عنها فعلاً، بإجابات قصيرة وصادقة. إن لم تجد سؤالك، راسل الدعم.',
    faq: 'ar',
    body: `<div class="wrap faq-block reveal"><p class="notice">سؤالك غير موجود؟ <a href="mailto:${SUPPORT}">${SUPPORT}</a></p></div>`,
  },
  {
    path: '/about',
    title: 'عن كاتزو — من نحن وكيف تتواصل معنا',
    description:
      'عن كاتزو: تطبيق عربي لتعلم الألمانية بالتحدّث، من تطوير Ghaidak Alloush. الدعم والخصوصية والشروط وروابط التواصل.',
    h1: 'عن كاتزو',
    lead:
      'كاتزو تطبيق عربي لتعلّم الألمانية بالتحدّث، مبني للناطقين بالعربية الذين يحتاجون اللغة في الحياة اليومية في ألمانيا. المنتج مستقل، والواجهة عربية أولاً، والألمانية هي لغة التدريب.',
    body: `
<div class="wrap prose">
  <div class="cols2">
    <section class="pane reveal"><h2>من يبني كاتزو؟</h2><p>كاتزو من تطوير <b>Ghaidak Alloush</b> (<a class="inline" href="https://ghaidak.com" rel="noopener">ghaidak.com</a>). لا نعرض تقييمات أو شهادات مستخدمين أو أعداداً أو جوائز، لأننا لم نجمعها ولا نستطيع إثباتها.</p></section>
    <section class="pane reveal"><h2>كيف تتواصل؟</h2><p>للدعم والأسئلة: <a class="inline" href="mailto:${SUPPORT}">${SUPPORT}</a>. لا نطلب كلمة مرور ولا رمز دخول ولا رقم بطاقة عبر البريد أبداً.</p></section>
  </div>
  <div class="callout reveal"><h2>روابط مهمة</h2><ul class="link-list">
    <li><a class="inline" href="/how-it-works">كيف يعمل التطبيق</a></li>
    <li><a class="inline" href="/who-its-for">لمن يناسب كاتزو</a></li>
    <li><a class="inline" href="/compare">مقارنة صادقة</a></li>
    <li><a class="inline" href="/pricing">المجاني وPro</a></li>
    <li><a class="inline" href="/faq">الأسئلة الشائعة</a></li>
    <li><a class="inline" href="/trust/privacy">الخصوصية والبيانات</a></li>
    <li><a class="inline" href="/trust/terms">شروط الاستخدام</a></li>
    <li><a class="inline" href="/trust/contact">تواصل معنا</a></li>
  </ul></div>
  <p class="notice reveal">آخر تحديث للصفحة: ${UPDATED}.</p>
</div>`,
  },
];
