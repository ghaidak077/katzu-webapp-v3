import { FAIR_USE_AI_PER_DAY } from '../offers/pricing';
import {
  OWNER_FILL,
  SUPPORT_ADDRESS_AR,
  TRUST_CONTENT,
  TRUST_VERSION,
  type TrustPage,
} from '../trust/content';

/**
 * The public, crawlable product copy.
 *
 * WHY THIS IS DATA, NOT JSX
 * The app is a client-rendered SPA. A crawler that does not run JavaScript used
 * to see one nine-word sentence and nothing else, so the product could not be
 * described or recommended from the page it actually publishes. The build now
 * writes these pages as real HTML, and this module is the single source for
 * their text. It imports only relative paths so `vite.config.ts` can load it
 * before Vite has resolved the `@/` alias.
 *
 * Every fact below is taken from `docs/PRODUCT-SPEC.md`, the entitlement code,
 * the pricing table, the trust content, or the published sales page. There are
 * deliberately no ratings, reviews, testimonials, user counts or awards.
 */

export type PageLang = 'ar' | 'en';

export const PUBLIC_CONTENT_UPDATED = '2026-10-24';
export const SHARE_IMAGE = '/assets/share/katzu-share-ar.png';
export const SALES_URL = 'https://katzu-sales.pages.dev';
export const FREE_AI_SESSIONS = 3;

export interface FaqItem {
  q: string;
  a: string;
}

export interface LandingCopy {
  path: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  facts: string[];
}

export interface ContentDef {
  id: string;
  pathAr: string;
  pathEn?: string;
  updated: string;
  titleAr: string;
  titleEn?: string;
  descriptionAr: string;
  descriptionEn?: string;
  h1Ar: string;
  h1En?: string;
  bodyAr: string;
  bodyEn?: string;
  faqAr?: FaqItem[];
  faqEn?: FaqItem[];
}

const PENDING_AR =
  'لم يُنشر هذا البند بعد. لم نكتب هنا وعداً لا نستطيع الوفاء به، ويمكنك سؤال الدعم قبل الدفع.';

/** The landing page is the SPA's own index; the English one is generated. */
export const LANDING_AR: LandingCopy = {
  path: '/',
  title: 'Katzu — تدريب محادثة الألمانية للناطقين بالعربية',
  description:
    'تدريب محادثة ألمانية للناطقين بالعربية من A0 إلى B2: مواقف حقيقية بالصوت أو الكتابة، تصحيح عربي وإنجليزية مساندة، تطبيق ويب/PWA، مجاني A0–A1 وPro بكود تفعيل.',
  h1: 'تحدّث الألمانية التي تحتاجها فعلاً — لا كلمات تحفظها وتنساها',
  intro:
    `كاتزو تطبيق ويب وPWA عربي لتدريب محادثة الألمانية للناطقين بالعربية، من A0 إلى B2. تتدرّب على مواقف حقيقية في ألمانيا — السفارة، المقهى، مقابلة العمل، الطبيب، معاينة الشقة — وتتحدّث بصوت عالٍ أو كتابةً، مع تصحيح بالعربية وترجمة إنجليزية مساندة. المجاني يفتح A0–A1 مع ${FREE_AI_SESSIONS} محادثات، وPro كود تفعيل لمرة واحدة بدون تجديد تلقائي.`,
  facts: [
    'واجهة عربية أولاً، والألمانية هي لغة التدريب، والإنجليزية ترجمة مساندة.',
    'تطبيق ويب يعمل في المتصفح ويمكن تثبيته كـPWA.',
    'المستويات من A0 إلى B2؛ المجاني يفتح A0–A1، وPro يفتح A2–B2.',
    'المحادثة بالصوت أو الكتابة، والميكروفون اختياري.',
    'Pro كود تفعيل لمرة واحدة؛ لا تجديد تلقائي ولا بطاقة محفوظة داخل التطبيق.',
  ],
};

export const LANDING_EN: LandingCopy = {
  path: '/en',
  title: 'Katzu — Arabic-first German conversation practice',
  description:
    'Katzu is an Arabic-first German conversation-practice web app and installable PWA for Arabic speakers, from A0 to B2. Practise real-life German by voice or text with Arabic corrections; free A0–A1, Pro via a one-off activation code.',
  h1: 'Speak the German you actually need — not words you memorise and forget',
  intro:
    `Katzu is an Arabic-first German conversation-practice web app and installable PWA for Arabic speakers, from A0 to B2. You practise real situations in Germany — the embassy, a café, a job interview, the doctor, viewing an apartment — by speaking aloud or typing, with corrections in Arabic and English as a secondary translation. The free tier covers A0–A1 with ${FREE_AI_SESSIONS} AI conversations; Pro is a one-off activation code with no automatic renewal.`,
  facts: [
    'Arabic-first interface; German is the target language; English is a secondary translation.',
    'A web app that runs in the browser and can be installed as a PWA.',
    'Levels A0–B2; free covers A0–A1, Pro unlocks A2–B2.',
    'Conversation by voice or text; the microphone is optional.',
    'Pro is a one-off activation code — no automatic renewal and no card stored in the app.',
  ],
};

export const FAQ_AR: FaqItem[] = [
  {
    q: 'ما هو Katzu؟',
    a: 'كاتزو تطبيق ويب عربي لتدريب محادثة الألمانية للناطقين بالعربية، من A0 إلى B2. يتدرّب المتعلّم على مواقف واقعية بالصوت أو الكتابة، ويأخذ تصحيحاً بالعربية ومراجعة لأخطائه.',
  },
  {
    q: 'لمن صُمم Katzu؟',
    a: 'للناطقين بالعربية الذين يستعدون للانتقال إلى ألمانيا أو وصلوا حديثاً ويحتاجون مواقف مثل السفارة والطبيب والعمل والشقة. يناسب المستويات من A0 إلى B2، وليس بديلاً عن محامٍ أو طبيب أو مستشار هجرة.',
  },
  {
    q: 'كيف يعمل التطبيق؟',
    a: 'تختار موقفاً، تدرس العبارات والمفردات، تمر باختبار قصير، ثم تخوض محادثة حية مع شخصية كاتزو. بعدها تحصل على تقرير صادق وبنك أخطاء ومراجعة، ومهمة يومية تحافظ على العادة.',
  },
  {
    q: 'هل أحتاج حساباً لأجرّب؟',
    a: 'لا. الدرس التجريبي يعمل بلا حساب وبلا بطاقة، وبعدها فقط يُطلب منك حساب مجاني يحفظ تقدّمك. تسجيل الدخول يتم بحساب Google.',
  },
  {
    q: 'هل يمكنني الكتابة بدل الكلام؟',
    a: 'نعم. يمكنك الرد كتابةً أو بصوتك، والميكروفون اختياري. المحادثة الصوتية مفيدة أكثر للطلاقة، لكنها ليست شرطاً لبدء التدريب.',
  },
  {
    q: 'ما المستويات المتاحة، وما المجاني؟',
    a: 'التطبيق يغطي A0–B2. المجاني يفتح A0–A1، وPro يفتح A2–B2. المراجعة وبنك الأخطاء والمفردات لا تُغلق أمامك حتى لو لم تكن مشتركاً.',
  },
  {
    q: 'كم محادثة مجانية أحصل عليها؟',
    a: `تحصل على ${FREE_AI_SESSIONS} محادثات ذكاء اصطناعي مجانية، محسوبة على الخادم لا على جهازك. المهمة اليومية والمراجعة والاختبار التحديدي متاحة أيضاً في المستوى المجاني.`,
  },
  {
    q: 'كيف يتم الدفع؟',
    a: 'Pro يُباع ككود تفعيل لمرة واحدة، ويُفعّل داخل التطبيق فقط. التطبيق لا يستلم بطاقتك ولا يجدّد الاشتراك تلقائياً. السعر الحالي يظهر في التطبيق قبل الشراء، وصفحة البيع الرسمية تعرض عرضاً منفصلاً.',
  },
  {
    q: 'هل هناك حد للاستخدام العادل؟',
    a: `نعم، حتى ${FAIR_USE_AI_PER_DAY} طلب ذكاء اصطناعي في اليوم لحماية الخدمة. هذا سقف استخدام عادل، وليس حداً مخفياً؛ نكتبه قبل أن تصل إليه.`,
  },
  {
    q: 'هل Katzu يحضّرني لامتحان Goethe أو telc؟',
    a: 'كاتزو أداة تدريب مستقلة، وليس منتجاً رسمياً لـGoethe أو telc، ولا يمنح شهادة. يوجد تدريب على نمط امتحان B1، لكن صيغ امتحانات A1/A2 الكاملة ليست منشورة بعد.',
  },
  {
    q: 'ماذا يحدث لبياناتي وصوتي؟',
    a: 'الصوت يُستخدم لتحويل الكلام إلى نص عند استخدام المحادثة، والنص يُرسل إلى مزوّد الذكاء الاصطناعي لتوليد الرد. لا نبيع البيانات ولا نستخدمها للإعلانات، ويمكنك تصدير بياناتك أو حذف حسابك من الإعدادات.',
  },
  {
    q: 'هل يعمل بدون إنترنت؟',
    a: 'كاتزو تطبيق ويب قابل للتثبيت كـPWA، ويمكنه تخزين المحتوى للاستخدام دون اتصال بعد أول زيارة. المحادثة الحية تحتاج اتصالاً بالإنترنت لأن الرد يأتي من الخادم.',
  },
  {
    q: 'هل يوجد تطبيق Android أصلي؟',
    a: 'المنتج الحي هو تطبيق الويب/PWA في المتصفح. لا يوجد تطبيق Android أصلي منشور من هذا المستودع، والنسخة الأصلية المذكورة تاريخياً تعيش في مستودع منفصل.',
  },
];

export const FAQ_EN: FaqItem[] = [
  {
    q: 'What is Katzu?',
    a: 'Katzu is an Arabic-first web app for German conversation practice, built for Arabic speakers from A0 to B2. Learners practise real situations by voice or text and receive corrections in Arabic plus a review of their mistakes.',
  },
  {
    q: 'Who is Katzu for?',
    a: 'Arabic speakers preparing to move to Germany, or who have just arrived and need situations such as the embassy, a doctor, work and an apartment. It covers A0–B2 and is not a replacement for a lawyer, doctor or immigration adviser.',
  },
  {
    q: 'How does it work?',
    a: 'You choose a situation, study the phrases and vocabulary, take a short quiz, then hold a live conversation with the Katzu persona. Afterwards you get an honest report, a mistake bank, review cards and a daily mission.',
  },
  {
    q: 'Do I need an account to try it?',
    a: 'No. The demo lesson works without an account or a card; only afterwards are you asked for a free account so your progress can be saved. Sign-in uses a Google account.',
  },
  {
    q: 'Can I type instead of speaking?',
    a: 'Yes. You can answer by text or by voice, and the microphone is optional. Speaking is better for fluency, but it is not a requirement to start.',
  },
  {
    q: 'Which levels are available, and what is free?',
    a: 'The app covers A0–B2. The free tier opens A0–A1, and Pro unlocks A2–B2. Review, the mistake bank and vocabulary are not taken away from you even without a subscription.',
  },
  {
    q: 'How many free conversations do I get?',
    a: `You get ${FREE_AI_SESSIONS} free AI conversations, counted on the server rather than on your device. The daily mission, review and placement test are also available on the free tier.`,
  },
  {
    q: 'How does payment work?',
    a: 'Pro is sold as a one-off activation code and is redeemed inside the app only. The app never takes your card details and never renews automatically. The current price is shown in the app before purchase, and the official sales page lists a separate offer.',
  },
  {
    q: 'Is there a fair-use limit?',
    a: `Yes: up to ${FAIR_USE_AI_PER_DAY} AI requests per day to protect the service. It is a fair-use ceiling, not a hidden limit, and it is stated before you reach it.`,
  },
  {
    q: 'Does Katzu prepare me for a Goethe or telc exam?',
    a: 'Katzu is an independent training tool, not an official Goethe or telc product, and it does not issue a certificate. There is B1-style mock practice, but full A1/A2 exam formats are not published yet.',
  },
  {
    q: 'What happens to my data and my voice?',
    a: 'Voice is used to turn speech into text when you use conversation, and the text is sent to the AI provider to generate a reply. We do not sell data or use it for advertising, and you can export your data or delete your account from Settings.',
  },
  {
    q: 'Does it work offline?',
    a: 'Katzu is an installable PWA and can store content for offline use after the first visit. A live conversation needs an internet connection because the reply comes from the server.',
  },
  {
    q: 'Is there a native Android app?',
    a: 'The live product is the web app/PWA in the browser. There is no native Android build published from this repository; the historical native build lives in a separate repository.',
  },
];

export const CONTENT_DEFS: ContentDef[] = [
  {
    id: 'how-it-works',
    pathAr: '/how-it-works',
    pathEn: '/en/how-it-works',
    updated: PUBLIC_CONTENT_UPDATED,
    titleAr: 'كيف يعمل Katzu — تدريب محادثة الألمانية خطوة بخطوة',
    titleEn: 'How Katzu works — German conversation practice, step by step',
    descriptionAr:
      'كيف يعمل Katzu: اختر موقفاً، ادرس العبارات، اختبر فهمك، تحدّث أو اكتب، ثم راجع تقريراً صادقاً وبنك أخطاء. المستويات A0–B2.',
    descriptionEn:
      'How Katzu works: choose a situation, study the phrases, check your understanding, speak or type, then review an honest report and mistake bank. Levels A0–B2.',
    h1Ar: 'كيف يعمل Katzu',
    h1En: 'How Katzu works',
    bodyAr: howItWorksAr(),
    bodyEn: howItWorksEn(),
  },
  {
    id: 'who-its-for',
    pathAr: '/who-its-for',
    pathEn: '/en/who-its-for',
    updated: PUBLIC_CONTENT_UPDATED,
    titleAr: 'لمن صُمم Katzu — ولمن لا يناسب',
    titleEn: 'Who Katzu is for — and who it is not for',
    descriptionAr:
      'Katzu مناسب للناطقين بالعربية الذين يستعدون للحياة في ألمانيا ويحتاجون تدريب محادثة من A0 إلى B2. تعرّف على من يناسبه ومن لا يناسبه بصراحة.',
    descriptionEn:
      'Katzu is for Arabic speakers preparing for life in Germany who need conversation practice from A0 to B2. See honestly who it fits and who it does not.',
    h1Ar: 'لمن صُمم Katzu — ولمن لا يناسب',
    h1En: 'Who Katzu is for — and who it is not for',
    bodyAr: whoItsForAr(),
    bodyEn: whoItsForEn(),
  },
  {
    id: 'compare',
    pathAr: '/compare',
    pathEn: '/en/compare',
    updated: PUBLIC_CONTENT_UPDATED,
    titleAr: 'Katzu مقارنةً بتطبيقات البطاقات والدورات والمدرّس',
    titleEn: 'Katzu compared with flashcards, courses and a human tutor',
    descriptionAr:
      'مقارنة صادقة بين Katzu وتطبيقات البطاقات والدورات العامة والمدرّس البشري ودورات الامتحانات. ما يفعله Katzu، وما لا يدّعيه.',
    descriptionEn:
      'An honest comparison of Katzu with flashcard apps, general courses, a human tutor and exam-prep courses: what Katzu does and what it does not claim.',
    h1Ar: 'Katzu مقارنةً بالبدائل',
    h1En: 'Katzu compared with the alternatives',
    bodyAr: compareAr(),
    bodyEn: compareEn(),
  },
  {
    id: 'moving-to-germany',
    pathAr: '/use-cases/moving-to-germany',
    pathEn: '/en/use-cases/moving-to-germany',
    updated: PUBLIC_CONTENT_UPDATED,
    titleAr: 'الألمانية للانتقال إلى ألمانيا — مواقف حقيقية',
    titleEn: 'German practice for moving to Germany — real situations',
    descriptionAr:
      'تدرّب على الألمانية للمواقف التي تلي الانتقال إلى ألمانيا: السفارة، المقهى، مقابلة العمل، الطبيب، معاينة الشقة. من A0 إلى B2 وبواجهة عربية.',
    descriptionEn:
      'Practise German for the situations that follow a move to Germany: embassy, café, job interview, doctor and apartment viewing. A0–B2 with an Arabic-first interface.',
    h1Ar: 'الألمانية للانتقال إلى ألمانيا',
    h1En: 'German practice for moving to Germany',
    bodyAr: movingToGermanyAr(),
    bodyEn: movingToGermanyEn(),
  },
  {
    id: 'faq',
    pathAr: '/faq',
    pathEn: '/en/faq',
    updated: PUBLIC_CONTENT_UPDATED,
    titleAr: 'أسئلة شائعة عن Katzu',
    titleEn: 'Katzu FAQ',
    descriptionAr:
      'أسئلة شائعة عن Katzu: المستويات، المجاني وPro، المحادثة بالصوت أو الكتابة، الخصوصية، الامتحانات، والعمل دون اتصال.',
    descriptionEn:
      'Frequently asked questions about Katzu: levels, free and Pro, voice or text conversation, privacy, exams and offline use.',
    h1Ar: 'أسئلة شائعة عن Katzu',
    h1En: 'Katzu FAQ',
    bodyAr: faqBody('ar', FAQ_AR),
    bodyEn: faqBody('en', FAQ_EN),
    faqAr: FAQ_AR,
    faqEn: FAQ_EN,
  },
  {
    id: 'pricing',
    pathAr: '/pricing',
    pathEn: '/en/pricing',
    updated: PUBLIC_CONTENT_UPDATED,
    titleAr: 'سعر Katzu — المجاني وPro',
    titleEn: 'Katzu pricing — free tier and Pro',
    descriptionAr:
      'ما يفتحه المجاني في Katzu، وما يضيفه Pro، وكيف يعمل كود التفعيل لمرة واحدة. لا تجديد تلقائي ولا بطاقة محفوظة داخل التطبيق.',
    descriptionEn:
      'What the free Katzu tier includes, what Pro adds, and how the one-off activation code works. No automatic renewal and no card stored in the app.',
    h1Ar: 'سعر Katzu — المجاني وPro',
    h1En: 'Katzu pricing — free tier and Pro',
    bodyAr: pricingAr(),
    bodyEn: pricingEn(),
  },
  {
    id: 'about',
    pathAr: '/about',
    pathEn: '/en/about',
    updated: PUBLIC_CONTENT_UPDATED,
    titleAr: 'عن Katzu — من نحن وكيف تتواصل معنا',
    titleEn: 'About Katzu — who we are and how to contact us',
    descriptionAr:
      'عن Katzu: تطبيق عربي لتدريب محادثة الألمانية، من تطوير Ghaidak Alloush. الدعم والخصوصية والشروط وروابط التواصل.',
    descriptionEn:
      'About Katzu: an Arabic-first German conversation-practice app built by Ghaidak Alloush. Support, privacy, terms and contact links.',
    h1Ar: 'عن Katzu',
    h1En: 'About Katzu',
    bodyAr: aboutAr(),
    bodyEn: aboutEn(),
  },
  ...trustPageDefs(),
];

function trustPageDefs(): ContentDef[] {
  const descriptions: Record<TrustPage, string> = {
    privacy: 'كيف يتعامل Katzu مع البيانات: ما يُجمع، ولماذا، وكيف يمكنك تصديره أو حذفه.',
    terms: 'شروط استخدام Katzu: ما يسمح به التطبيق، وحدود المسؤولية، وحقوقك.',
    refund: 'حالة سياسة الاسترداد في Katzu، وما يجب معرفته قبل شراء كود Pro.',
    imprint: 'بيانات ناشر Katzu ومعلومات التواصل والمسؤولية.',
    contact: 'كيف تتواصل مع دعم Katzu بخصوص الحساب أو الخصوصية أو الدفع.',
  };
  return (['privacy', 'terms', 'refund', 'imprint', 'contact'] as TrustPage[]).map((page) => {
    const content = TRUST_CONTENT[page];
    return {
      id: `trust-${page}`,
      pathAr: `/trust/${page}`,
      updated: TRUST_VERSION,
      titleAr: `${content.titleAr} — Katzu`,
      descriptionAr: descriptions[page],
      h1Ar: content.titleAr,
      bodyAr: trustBody(page),
    };
  });
}

function trustBody(page: TrustPage): string {
  const content = TRUST_CONTENT[page];
  const sections = content.sections.map((section) => {
    let body = section.bodyAr;
    if (body.includes(OWNER_FILL)) {
      body = page === 'contact' && section.id === 'how'
        ? `راسلنا على ${SUPPORT_ADDRESS_AR}.`
        : PENDING_AR;
    }
    return `<section class="prose-block" id="${section.id}">
      <h2>${section.headingAr}</h2>
      <p class="preline">${escapeHtml(body)}</p>
    </section>`;
  });

  const pending = content.sections.filter((section) =>
    section.bodyAr.includes(OWNER_FILL) && !(page === 'contact' && section.id === 'how'),
  ).length;
  const notice = pending
    ? `<p class="notice">هذه الصفحة غير مكتملة بعد: ${pending} بنود تنتظر استكمال الناشر. لن نكتب وعداً لا نستطيع الوفاء به.</p>`
    : '';

  return `<p class="lead">${escapeHtml(content.updatedAr)} · الصفحة الرسمية بالعربية، والنسخة العربية هي المرجع.</p>
    ${notice}
    ${sections.join('\n')}
    <p class="notice">للتواصل: <a href="mailto:${SUPPORT_ADDRESS_AR}">${SUPPORT_ADDRESS_AR}</a></p>`;
}

function howItWorksAr(): string {
  return `<p class="lead">Katzu يحوّل موقفاً واقعياً إلى حلقة قصيرة: تدرس العبارات، تتأكد من فهمك، تتحدّث أو تكتب، ثم تراجع ما يحتاج إصلاحاً. لا تحفظ قائمة كلمات بلا سياق.</p>
  <ol class="steps">
    <li><h2>1. اختر موقفاً</h2><p>من مكتبة السيناريوهات: السفارة، المقهى، مقابلة العمل، زيارة الطبيب، أو معاينة الشقة. كل سيناريو يمكن لعبه بمستوى يناسبك.</p></li>
    <li><h2>2. ادرس العبارات والمفردات</h2><p>تتعرّف على العبارات التي ستستخدمها فعلاً، مع شرح بالعربية وترجمة إنجليزية مساندة. الألمانية هي لغة التدريب، والعربية هي لغة الشرح.</p></li>
    <li><h2>3. اختبر فهمك</h2><p>اختبار قصير يتأكد أنك تعرف ما ستحتاجه في المحادثة، لا أنك مررت على النص فقط.</p></li>
    <li><h2>4. تحدّث أو اكتب</h2><p>تدخل محادثة حية مع شخصية كاتزو. يمكنك الرد بصوتك أو كتابةً؛ الميكروفون اختياري. التصحيح يأتي بالعربية، والخطأ يُشرح لا يُسخر منه.</p></li>
    <li><h2>5. راجع التقرير وبنك الأخطاء</h2><p>بعد الجلسة تحصل على تقرير صادق، وبنك أخطاء، ومراجعة. التقرير لا يمنحك إتقاناً مقابل تلميح أو إجابة اختيار واحد.</p></li>
    <li><h2>6. حافظ على العادة</h2><p>مهمة يومية قصيرة ومراجعة متباعدة تحافظان على ما تعلّمته. المراجعة وبنك الأخطاء والمفردات لا تُغلق أمامك حتى لو لم تكن مشتركاً.</p></li>
  </ol>
  <div class="callout"><h2>المستويات والمجاني</h2><p>التطبيق يغطي A0–B2. المجاني يفتح A0–A1 مع ${FREE_AI_SESSIONS} محادثات ذكاء اصطناعي محسوبة على الخادم. Pro يفتح A2–B2 ويزيل حد المحادثات، مع سقف استخدام عادل ${FAIR_USE_AI_PER_DAY} طلباً في اليوم.</p></div>
  <div class="callout"><h2>ما لا يفعله Katzu</h2><p>ليس دورة امتحان رسمية، ولا يمنح شهادة، وليس بديلاً عن محامٍ أو طبيب أو مستشار هجرة. صيغ امتحانات A1/A2 الكاملة ليست منشورة بعد؛ الموجود تدريب على نمط B1.</p></div>
  <p><a class="btn btn-primary" href="/demo">جرّب درساً بدون حساب</a> <a class="btn btn-ghost" href="/pricing">شاهد المجاني وPro</a></p>`;
}

function howItWorksEn(): string {
  return `<p class="lead">Katzu turns a real situation into a short loop: study the phrases, check your understanding, speak or type, then review what needs fixing. It is not a list of words without context.</p>
  <ol class="steps">
    <li><h2>1. Choose a situation</h2><p>Pick from the scenario library: the embassy, a café, a job interview, a doctor's visit or an apartment viewing. Each scenario can be played at the level that fits you.</p></li>
    <li><h2>2. Study the phrases and vocabulary</h2><p>Learn the phrases you will actually use, explained in Arabic with English as a secondary translation. German is the practice language; Arabic is the explanation language.</p></li>
    <li><h2>3. Check your understanding</h2><p>A short quiz checks that you know what you need for the conversation, not just that you scrolled past the text.</p></li>
    <li><h2>4. Speak or type</h2><p>Hold a live conversation with the Katzu persona. Answer by voice or text; the microphone is optional. Corrections are in Arabic, and a mistake is explained, never mocked.</p></li>
    <li><h2>5. Review the report and mistake bank</h2><p>After the session you get an honest report, a mistake bank and review cards. The report never claims mastery from a hint or one multiple-choice answer.</p></li>
    <li><h2>6. Keep the habit</h2><p>A short daily mission and spaced review keep what you learned alive. Review, the mistake bank and vocabulary are not taken away even without a subscription.</p></li>
  </ol>
  <div class="callout"><h2>Levels and the free tier</h2><p>The app covers A0–B2. The free tier opens A0–A1 with ${FREE_AI_SESSIONS} server-counted AI conversations. Pro unlocks A2–B2 and removes the conversation cap, with a fair-use ceiling of ${FAIR_USE_AI_PER_DAY} AI requests per day.</p></div>
  <div class="callout"><h2>What Katzu is not</h2><p>It is not an official exam course, it does not issue a certificate, and it is not a replacement for a lawyer, doctor or immigration adviser. Full A1/A2 exam formats are not published yet; B1-style mock practice is what exists.</p></div>
  <p><a class="btn btn-primary" href="/demo">Try a lesson without an account</a> <a class="btn btn-ghost" href="/en/pricing">See free and Pro</a></p>`;
}

function whoItsForAr(): string {
  return `<div class="two-col">
    <section class="card"><h2>مناسب لك إذا…</h2><ul>
      <li>أنت ناطق بالعربية وتستعد للانتقال إلى ألمانيا للعمل أو الدراسة أو الحياة، وتحتاج أن تتكلّم لا أن تحفظ فقط.</li>
      <li>وصلت حديثاً وتواجه مواقف مثل السفارة والطبيب والعمل والشقة، وتريد تدريباً قبل الموقف الحقيقي.</li>
      <li>مستواك بين A0 وB2، وتفضّل شرحاً بالعربية بدل دورة كاملة بالألمانية.</li>
      <li>تريد محادثة قصيرة يومية بالصوت أو الكتابة، مع تصحيح صريح ومراجعة لأخطائك.</li>
      <li>تريد أن تعرف ما تحصل عليه قبل الدفع: المجاني، وPro، وسقف الاستخدام العادل.</li>
    </ul></section>
    <section class="card card-muted"><h2>قد لا يناسبك إذا…</h2><ul>
      <li>تبحث عن كتاب قواعد شامل أو منهج أكاديمي طويل؛ Katzu يبدأ من المواقف لا من فصول النحو.</li>
      <li>تريد شهادة رسمية أو ضمان نجاح في Goethe أو telc أو DTZ؛ لا يمنح التطبيق شهادة ولا درجة رسمية.</li>
      <li>تحتاج استشارة قانونية أو طبية أو هجرة؛ استخدم مختصاً مرخصاً.</li>
      <li>تريد مدرّساً بشرياً أو شبكة اجتماعية؛ Katzu أداة تدريب فردية.</li>
      <li>تريد فقط بطاقات حفظ بلا محادثة؛ التطبيق يحتوي مراجعة، لكن جوهره هو الإنتاج الشفهي.</li>
    </ul></section>
  </div>
  <div class="callout"><h2>ما هو مدعوم الآن فعلاً</h2><p>السيناريوهات المنشورة: السفارة، المقهى، مقابلة العمل، زيارة الطبيب، ومعاينة الشقة. المستويات A0–B2، والمحادثة بالصوت أو الكتابة. المسارات الأخرى المذكورة في الرؤية ليست منشورة بعد ولا نعد بها هنا.</p></div>
  <p><a class="btn btn-primary" href="/demo">جرّب الموقف الأول</a> <a class="btn btn-ghost" href="/how-it-works">كيف يعمل؟</a></p>`;
}

function whoItsForEn(): string {
  return `<div class="two-col">
    <section class="card"><h2>It fits you if…</h2><ul>
      <li>You are an Arabic speaker preparing to move to Germany for work, study or family life, and you need to speak rather than only memorise.</li>
      <li>You have recently arrived and face situations such as the embassy, a doctor, work or an apartment, and want to rehearse before the real thing.</li>
      <li>Your level is between A0 and B2, and you prefer explanations in Arabic to a course delivered entirely in German.</li>
      <li>You want a short daily conversation by voice or text, with direct correction and review of your mistakes.</li>
      <li>You want to know what you get before paying: the free tier, Pro, and the fair-use ceiling.</li>
    </ul></section>
    <section class="card card-muted"><h2>It may not fit you if…</h2><ul>
      <li>You want a comprehensive grammar textbook or a long academic curriculum; Katzu starts from situations, not from chapters of syntax.</li>
      <li>You want an official certificate or a guarantee of passing Goethe, telc or DTZ; the app issues no certificate and no official result.</li>
      <li>You need legal, medical or immigration advice; use a licensed professional.</li>
      <li>You want a human tutor or a social network; Katzu is an individual practice tool.</li>
      <li>You only want flashcards without conversation; the app has review, but spoken production is the core.</li>
    </ul></section>
  </div>
  <div class="callout"><h2>What is actually supported now</h2><p>The published scenarios are the embassy, a café, a job interview, a doctor's visit and an apartment viewing. Levels are A0–B2, and conversation works by voice or text. Other tracks mentioned in the product vision are not published yet and are not promised here.</p></div>
  <p><a class="btn btn-primary" href="/demo">Try the first situation</a> <a class="btn btn-ghost" href="/en/how-it-works">How it works</a></p>`;
}

function compareAr(): string {
  return `<p class="lead">لا نقول إن Katzu أفضل من كل شيء. لكل أداة وظيفة مختلفة، وهذه مقارنة بما نعرفه فعلاً عن منتجنا.</p>
  <div class="compare-grid">
    <section class="card"><h2>مقابل تطبيقات البطاقات</h2><p>تطبيقات البطاقات ممتازة للتذكّر السريع، لكنها غالباً تختبر إن كنت تتعرّف على الكلمة. Katzu يطلب منك أن تنتج الألمانية في موقف، بالصوت أو الكتابة، ثم يصحح لك. المراجعة موجودة، لكنها ليست جوهر المنتج.</p></section>
    <section class="card"><h2>مقابل دورة عامة</h2><p>الدورة العامة تبني تقدماً منهجياً واسعاً. Katzu يبدأ من المواقف التي تلي الانتقال إلى ألمانيا، ويشرح بالعربية. إذا كنت تريد نحوًا شاملاً أو منهجاً أكاديمياً طويلاً، فالدورة العامة أنسب.</p></section>
    <section class="card"><h2>مقابل مدرّس بشري</h2><p>المدرّس البشري يقدّم علاقة وملاحظة إنسانية لا يستطيعها تطبيق. Katzu يقدّم تدريباً متاحاً في أي وقت بسعر كود لمرة واحدة، لكنه ليس بديلاً عن مدرّس ولا يمنح شهادة.</p></section>
    <section class="card"><h2>مقابل دورات الامتحانات</h2><p>دورات الامتحانات الرسمية تتدرّب على الصيغة والشروط الرسمية. Katzu يبني الأساس من A0 إلى B2 ويقدّم تدريباً على نمط B1، لكنه ليس دورة امتحان رسمية وصيغ A1/A2 الكاملة ليست منشورة بعد.</p></section>
  </div>
  <div class="callout"><h2>ما لا ندّعيه</h2><p>لا نعرض تقييمات أو شهادات مستخدمين أو أعداداً أو جوائز. لا نضمن لك النجاح في امتحان أو القبول في وظيفة. نعرض فقط ما يمكن التحقق منه في التطبيق وسياساته.</p></div>
  <p><a class="btn btn-primary" href="/pricing">شاهد ما تحصل عليه</a> <a class="btn btn-ghost" href="/who-its-for">لمن يناسب؟</a></p>`;
}

function compareEn(): string {
  return `<p class="lead">We do not claim Katzu is better than everything. Each tool has a different job; this is a comparison against what we can actually say about our own product.</p>
  <div class="compare-grid">
    <section class="card"><h2>Against flashcard apps</h2><p>Flashcard apps are excellent for quick recall, but they often test whether you recognise a word. Katzu asks you to produce German in a situation, by voice or text, and then corrects you. Review exists, but it is not the core of the product.</p></section>
    <section class="card"><h2>Against a general course</h2><p>A general course builds broad, sequenced progress. Katzu starts from the situations that follow a move to Germany and explains in Arabic. If you want comprehensive grammar or a long academic curriculum, a general course fits better.</p></section>
    <section class="card"><h2>Against a human tutor</h2><p>A human tutor offers a relationship and human judgement no app can copy. Katzu offers practice at any time for a one-off code price, but it is not a replacement for a tutor and it does not issue a certificate.</p></section>
    <section class="card"><h2>Against exam-prep courses</h2><p>Official exam courses train the official format and conditions. Katzu builds the A0–B2 foundation and offers B1-style mock practice, but it is not an official exam course and full A1/A2 formats are not published yet.</p></section>
  </div>
  <div class="callout"><h2>What we do not claim</h2><p>We show no ratings, user testimonials, user counts or awards. We do not guarantee an exam pass or a job offer. We show only what can be checked in the app and its policies.</p></div>
  <p><a class="btn btn-primary" href="/en/pricing">See what you get</a> <a class="btn btn-ghost" href="/en/who-its-for">Who it is for</a></p>`;
}

function movingToGermanyAr(): string {
  return `<p class="lead">الانتقال إلى ألمانيا يضعك في مواقف تحتاج فيها ألمانية واضحة وسريعة، لا ألمانية الامتحان فقط. Katzu يتدرّب على هذه المواقف بالصوت أو الكتابة، مع شرح عربي لما يقوله الطرف الآخر.</p>
  <div class="card"><h2>المواقف المدعومة الآن</h2><ul class="scenario-list">
    <li><strong>السفارة:</strong> حوار في موعد السفارة مع موظف الاستقبال.</li>
    <li><strong>المقهى:</strong> طلب في مقهى ألماني مع خادم ودود.</li>
    <li><strong>مقابلة العمل:</strong> حوار مع مدير توظيف ألماني.</li>
    <li><strong>زيارة الطبيب:</strong> حوار مع موظف استقبال في عيادة ألمانية.</li>
    <li><strong>معاينة الشقة:</strong> حوار مع مالك ألماني أثناء معاينة الشقة.</li>
  </ul></div>
  <div class="callout"><h2>كيف تستخدمه للانتقال؟</h2><p>اختر الموقف الأقرب لموعدك القادم، ادرس العبارات، ثم تحدّث. بعد الجلسة راجع بنك الأخطاء وأعد الموقف مرة أخرى. المراجعة اليومية تحافظ على العبارات حتى تحتاجها فعلاً.</p></div>
  <div class="callout"><h2>حدود واضحة</h2><p>Katzu ليس مكتب هجرة ولا محامياً ولا مستشاراً قانونياً، ولا يتعامل معك بدلاً من الجهات الرسمية. لا يمنح شهادة أو تأشيرة أو عقد عمل. للقرارات الرسمية استخدم الجهة المختصة.</p></div>
  <p><a class="btn btn-primary" href="/demo">جرّب موقفاً الآن</a> <a class="btn btn-ghost" href="/faq">اقرأ الأسئلة الشائعة</a></p>`;
}

function movingToGermanyEn(): string {
  return `<p class="lead">Moving to Germany puts you in situations that need clear, quick German, not only exam German. Katzu practises those situations by voice or text, with Arabic explanations of what the other person is saying.</p>
  <div class="card"><h2>Situations supported now</h2><ul class="scenario-list">
    <li><strong>The embassy:</strong> a conversation at an embassy appointment with the clerk.</li>
    <li><strong>A café:</strong> ordering from a friendly café server in German.</li>
    <li><strong>A job interview:</strong> a conversation with a German hiring manager.</li>
    <li><strong>A doctor's visit:</strong> a conversation with the receptionist at a German medical practice.</li>
    <li><strong>An apartment viewing:</strong> a conversation with a German landlord during a viewing.</li>
  </ul></div>
  <div class="callout"><h2>How to use it for a move</h2><p>Choose the situation closest to your next appointment, study the phrases, then speak. After the session, review the mistake bank and run the situation again. Daily review keeps the phrases alive until you need them.</p></div>
  <div class="callout"><h2>Clear limits</h2><p>Katzu is not an immigration office, a lawyer or a legal adviser, and it does not act for you with official bodies. It does not issue a certificate, visa or work contract. For official decisions, use the responsible authority.</p></div>
  <p><a class="btn btn-primary" href="/demo">Try a situation now</a> <a class="btn btn-ghost" href="/en/faq">Read the FAQ</a></p>`;
}

function faqBody(lang: PageLang, items: FaqItem[]): string {
  const intro = lang === 'ar'
    ? '<p class="lead">أسئلة نُسأل عنها فعلاً، بإجابات قصيرة وصادقة. إن لم تجد سؤالك، راسل الدعم.</p>'
    : '<p class="lead">Questions we are actually asked, with short, honest answers. If yours is missing, contact support.</p>';
  const rows = items.map((item) => `<section class="faq-item"><h2>${item.q}</h2><p>${item.a}</p></section>`).join('\n');
  const contact = lang === 'ar'
    ? `<p class="notice">سؤالك غير موجود؟ <a href="mailto:${SUPPORT_ADDRESS_AR}">${SUPPORT_ADDRESS_AR}</a></p>`
    : `<p class="notice">Question not here? <a href="mailto:${SUPPORT_ADDRESS_AR}">${SUPPORT_ADDRESS_AR}</a></p>`;
  return `${intro}${rows}${contact}`;
}

function pricingAr(): string {
  return `<p class="lead">المجاني ليس نسخة تجريبية تنتهي بعد يومين. المراجعة وبنك الأخطاء والمفردات تبقى لك، وPro يوسّع المستويات ويزيل حد المحادثات.</p>
  <div class="two-col">
    <section class="card"><h2>المجاني</h2><ul>
      <li>المستوى A0–A1.</li>
      <li>${FREE_AI_SESSIONS} محادثات ذكاء اصطناعي محسوبة على الخادم.</li>
      <li>المهمة اليومية، المراجعة، الاختبار التحديدي، وبنك الأخطاء.</li>
      <li>الدرس التجريبي بلا حساب وبلا بطاقة.</li>
    </ul></section>
    <section class="card card-accent"><h2>Pro</h2><ul>
      <li>يفتح المستويات A2–B2.</li>
      <li>يزيل حد جلسات المحادثة، مع سقف استخدام عادل ${FAIR_USE_AI_PER_DAY} طلباً في اليوم.</li>
      <li>يُباع ككود تفعيل لمرة واحدة، ويُفعّل داخل التطبيق.</li>
      <li>لا تجديد تلقائي، ولا بطاقة محفوظة داخل التطبيق.</li>
    </ul></section>
  </div>
  <div class="callout"><h2>السعر</h2><p>السعر يحدده الخادم ويظهر في التطبيق قبل الشراء. صفحة البيع الرسمية تعرض عرض Pro الحالي، وقد يعتمد السعر على منطقتك. لا نطلب منك إدخال بطاقة داخل التطبيق.</p><p><a class="btn btn-primary" href="${SALES_URL}" rel="noopener">افتح صفحة البيع الرسمية</a></p></div>
  <div class="callout"><h2>الاسترداد</h2><p>سياسة الاسترداد لم تُنشر بعد. لا نكتب وعداً لا نستطيع الوفاء به، ويمكنك سؤال الدعم قبل الدفع. اقرأ <a href="/trust/refund">صفحة الاسترداد</a> لمعرفة الحالة الحالية.</p></div>
  <p><a class="btn btn-primary" href="/welcome">ابدأ مجاناً</a> <a class="btn btn-ghost" href="/demo">جرّب أولاً</a></p>`;
}

function pricingEn(): string {
  return `<p class="lead">The free tier is not a two-day trial. Review, the mistake bank and vocabulary stay yours, while Pro widens the levels and removes the conversation cap.</p>
  <div class="two-col">
    <section class="card"><h2>Free</h2><ul>
      <li>Levels A0–A1.</li>
      <li>${FREE_AI_SESSIONS} server-counted AI conversations.</li>
      <li>Daily mission, review, placement test and the mistake bank.</li>
      <li>The demo lesson without an account or a card.</li>
    </ul></section>
    <section class="card card-accent"><h2>Pro</h2><ul>
      <li>Unlocks levels A2–B2.</li>
      <li>Removes the conversation-session cap, with a fair-use ceiling of ${FAIR_USE_AI_PER_DAY} AI requests per day.</li>
      <li>Sold as a one-off activation code and redeemed inside the app.</li>
      <li>No automatic renewal and no card stored in the app.</li>
    </ul></section>
  </div>
  <div class="callout"><h2>Price</h2><p>The price is set by the server and shown in the app before purchase. The official sales page lists the current Pro offer, and the price may depend on your region. We never ask you to enter a card inside the app.</p><p><a class="btn btn-primary" href="${SALES_URL}" rel="noopener">Open the official sales page</a></p></div>
  <div class="callout"><h2>Refunds</h2><p>The refund policy is not published yet. We will not write a promise we cannot keep, and you can ask support before paying. Read the <a href="/trust/refund">refund page</a> for the current state.</p></div>
  <p><a class="btn btn-primary" href="/welcome">Start free</a> <a class="btn btn-ghost" href="/demo">Try it first</a></p>`;
}

function aboutAr(): string {
  return `<p class="lead">Katzu تطبيق عربي لتدريب محادثة الألمانية، مبني للناطقين بالعربية الذين يحتاجون اللغة في الحياة اليومية في ألمانيا. المنتج مستقل، والواجهة عربية أولاً، والألمانية هي لغة التدريب.</p>
  <div class="two-col">
    <section class="card"><h2>من يبني Katzu؟</h2><p>Katzu من تطوير <strong>Ghaidak Alloush</strong> (<a href="https://ghaidak.com" rel="noopener">ghaidak.com</a>). لا نعرض هنا تقييمات أو شهادات مستخدمين أو أعداداً أو جوائز، لأننا لم نجمعها ولا نستطيع إثباتها.</p></section>
    <section class="card"><h2>كيف تتواصل؟</h2><p>للدعم والأسئلة: <a href="mailto:${SUPPORT_ADDRESS_AR}">${SUPPORT_ADDRESS_AR}</a>. لا نطلب كلمة مرور ولا رمز دخول ولا رقم بطاقة عبر البريد.</p></section>
  </div>
  <div class="callout"><h2>روابط مهمة</h2><ul class="link-list">
    <li><a href="/how-it-works">كيف يعمل التطبيق</a></li>
    <li><a href="/who-its-for">لمن يناسب Katzu</a></li>
    <li><a href="/compare">مقارنة صادقة</a></li>
    <li><a href="/pricing">المجاني وPro</a></li>
    <li><a href="/faq">الأسئلة الشائعة</a></li>
    <li><a href="/trust/privacy">الخصوصية والبيانات</a></li>
    <li><a href="/trust/terms">شروط الاستخدام</a></li>
    <li><a href="/trust/contact">تواصل معنا</a></li>
  </ul></div>
  <p class="notice">آخر تحديث للصفحة: ${PUBLIC_CONTENT_UPDATED}.</p>`;
}

function aboutEn(): string {
  return `<p class="lead">Katzu is an Arabic-first German conversation-practice app, built for Arabic speakers who need German in everyday life in Germany. The product is independent; the interface is Arabic-first and German is the practice language.</p>
  <div class="two-col">
    <section class="card"><h2>Who builds Katzu?</h2><p>Katzu is built by <strong>Ghaidak Alloush</strong> (<a href="https://ghaidak.com" rel="noopener">ghaidak.com</a>). We show no ratings, testimonials, user counts or awards here, because we have not collected them and cannot prove them.</p></section>
    <section class="card"><h2>How to contact us</h2><p>For support and questions: <a href="mailto:${SUPPORT_ADDRESS_AR}">${SUPPORT_ADDRESS_AR}</a>. We never ask for a password, a login code or a card number by email.</p></section>
  </div>
  <div class="callout"><h2>Useful links</h2><ul class="link-list">
    <li><a href="/en/how-it-works">How it works</a></li>
    <li><a href="/en/who-its-for">Who Katzu is for</a></li>
    <li><a href="/en/compare">An honest comparison</a></li>
    <li><a href="/en/pricing">Free and Pro</a></li>
    <li><a href="/en/faq">FAQ</a></li>
    <li><a href="/trust/privacy" hreflang="ar" lang="ar">Privacy (Arabic)</a></li>
    <li><a href="/trust/terms" hreflang="ar" lang="ar">Terms (Arabic)</a></li>
    <li><a href="/trust/contact" hreflang="ar" lang="ar">Contact (Arabic)</a></li>
  </ul></div>
  <p class="notice">Page last updated: ${PUBLIC_CONTENT_UPDATED}.</p>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
