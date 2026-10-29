/**
 * The `/guides` hub: twelve articles, one index, one shape.
 *
 * WHY THIS FILE EXISTS
 * The twelve articles live in three topic modules (`language`, `everyday`,
 * `work`) because they were written as three batches. A reader must not be able
 * to tell that: the layout, the byline, the "last updated" line, the FAQ block,
 * the sources list and the related links are printed here, once, for every
 * article. Adding a thirteenth guide means adding an object, and this file
 * enforces the rest.
 *
 * THE ASSERTS ARE THE CONTENT GATE
 * A guide that is 600 words long, promises a visa, quotes a price, links to a
 * slug that does not exist, or repeats another guide's title fails the build.
 * Those are the failure modes that make an "SEO article" worthless, so they are
 * build errors rather than review notes.
 */

import { SITE, START, FREE_LESSONS_PER_MONTH } from '../site-pricing.mjs';
import {
  articleJsonLd,
  breadcrumbJsonLd,
  faqPageJsonLd,
} from '../site-schema.mjs';
import { LANGUAGE_GUIDES } from './language.mjs';
import { EVERYDAY_GUIDES } from './everyday.mjs';
import { SITUATION_GUIDES } from './situations.mjs';
import { WORK_GUIDES } from './work.mjs';
import { RECOGNITION_GUIDES } from './recognition.mjs';

/** The day every guide was published and last reviewed. One date, one place. */
export const GUIDE_UPDATED = '2026-10-29';
export const GUIDE_PUBLISHED = '2026-10-29';

const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/** `2026-10-29` → `29 أكتوبر 2026`, in the words the page prints. */
export function arabicDate(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  return `${date.getUTCDate()} ${MONTHS_AR[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const CATEGORIES = [
  {
    id: 'language',
    title: 'اللغة والامتحانات',
    lead: 'ما يُطلب منك في الامتحان، وكيف تصل إلى المستوى التالي دون أن تدفع لمركز لا تعرفه.',
    guides: LANGUAGE_GUIDES,
  },
  {
    id: 'everyday',
    title: 'الحياة اليومية في ألمانيا',
    lead: 'المواعيد التي لا تُؤجَّل: الطبيب، الشقة، مكتب التسجيل، والجُمل التي تُقال في كل واحد منها.',
    guides: [...EVERYDAY_GUIDES, ...SITUATION_GUIDES],
  },
  {
    id: 'work',
    title: 'العمل والاعتماد',
    lead: 'من أول سيرة ذاتية ألمانية إلى معادلة شهادتك: ما يطلبه صاحب العمل والجهة المختصة فعلًا.',
    guides: [...WORK_GUIDES, ...RECOGNITION_GUIDES],
  },
];

/* ------------------------------------------------------------------ */
/* Content gate                                                        */
/* ------------------------------------------------------------------ */

function wordCount(text) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean).length;
}

export function guideWords(guide) {
  return wordCount(
    [guide.summary, guide.body, ...guide.faq.map((item) => `${item.q} ${item.a}`)].join(' '),
  );
}

const GUIDES = CATEGORIES.flatMap((category) =>
  category.guides.map((guide) => ({ ...guide, category: category.id, path: `/guides/${guide.slug}` })),
);

const BY_SLUG = new Map(GUIDES.map((guide) => [guide.slug, guide]));

/**
 * The build stops on any of these. They are cheap checks with expensive
 * failures: a duplicated slug silently overwrites a page, a dead `related`
 * link is a 404 a crawler finds before the owner does.
 */
function assertGuides() {
  if (GUIDES.length !== 12) throw new Error(`guides: expected 12, found ${GUIDES.length}`);

  const slugs = new Set();
  const titles = new Set();
  const descriptions = new Set();
  for (const guide of GUIDES) {
    if (!/^[a-z0-9-]+$/.test(guide.slug)) throw new Error(`guides: bad slug ${guide.slug}`);
    if (slugs.has(guide.slug)) throw new Error(`guides: duplicate slug ${guide.slug}`);
    slugs.add(guide.slug);
    if (titles.has(guide.title)) throw new Error(`guides: duplicate title ${guide.slug}`);
    titles.add(guide.title);
    if (descriptions.has(guide.description)) {
      throw new Error(`guides: duplicate description ${guide.slug}`);
    }
    descriptions.add(guide.description);

    if (guide.title.length > 60) throw new Error(`guides: ${guide.slug} title is too long`);
    if (guide.description.length > 160) {
      throw new Error(`guides: ${guide.slug} description is too long for a result snippet`);
    }

    const words = guideWords(guide);
    if (words < 900 || words > 1500) {
      throw new Error(`guides: ${guide.slug} is ${words} words, outside 900–1500`);
    }

    if (guide.faq.length < 3 || guide.faq.length > 5) {
      throw new Error(`guides: ${guide.slug} has ${guide.faq.length} FAQ items, outside 3–5`);
    }
    if (guide.related.length < 2 || guide.related.length > 3) {
      throw new Error(`guides: ${guide.slug} has ${guide.related.length} related guides`);
    }
    for (const slug of guide.related) {
      if (!BY_SLUG.has(slug) || slug === guide.slug) {
        throw new Error(`guides: ${guide.slug} links to unknown guide ${slug}`);
      }
    }
    if (!guide.sources.length) throw new Error(`guides: ${guide.slug} has no official source`);
    for (const [, url] of guide.sources) {
      if (!/^https:\/\//.test(url)) throw new Error(`guides: ${guide.slug} source is not https`);
    }

    const text = [guide.title, guide.h1, guide.summary, guide.body, ...guide.faq.flatMap((f) => [f.q, f.a])].join(
      ' ',
    );
    if (/\$\d/.test(text)) throw new Error(`guides: ${guide.slug} quotes a price`);
    if (/[\u0660-\u0669]/.test(text)) throw new Error(`guides: ${guide.slug} uses Arabic-Indic digits`);
    if (/KATZU26|katzu\.app|pages\.dev|لفترة محدودة|24 ساعة|PLACEHOLDER/.test(text)) {
      throw new Error(`guides: ${guide.slug} carries a retired claim`);
    }
    if (/<h1[\s>]/i.test(guide.body)) throw new Error(`guides: ${guide.slug} body carries a second H1`);
    if (!/<table|class="checks"/.test(guide.body)) {
      throw new Error(`guides: ${guide.slug} has neither a table nor a checklist`);
    }
    // No promise about an outcome the authority decides.
    if (/نضمن|مضمون القبول|ستحصل على التأشيرة|ستنجح حتماً/.test(text)) {
      throw new Error(`guides: ${guide.slug} promises an outcome`);
    }
  }
}

assertGuides();

export { GUIDES, CATEGORIES };

/** Every guide path, for the sitemap and the link crawler. */
export const GUIDE_ROUTES = ['/guides', ...GUIDES.map((guide) => guide.path)];

/** The related cards, with the real titles: never a raw slug in an anchor. */
function relatedHtml(guide) {
  return `<ul class="grel">
${guide.related
  .map((slug) => {
    const other = BY_SLUG.get(slug);
    return `    <li><a href="${other.path}">${other.title}</a></li>`;
  })
  .join('\n')}
  </ul>`;
}

function sourcesHtml(guide) {
  return `<ul class="gsources">
${guide.sources
  .map(
    ([label, url]) =>
      `    <li><a href="${url}" rel="noopener" target="_blank">${label}</a></li>`,
  )
  .join('\n')}
  </ul>`;
}

function faqHtml(guide) {
  return `<div class="faq">
${guide.faq
  .map((item) => `    <div class="qa"><h3>${item.q}</h3><p>${item.a}</p></div>`)
  .join('\n')}
  </div>`;
}

function crumbsHtml(items) {
  return `<nav class="crumbs wrap" aria-label="مسار التصفح">${items
    .map(([href, label], index) =>
      index === items.length - 1
        ? `<span aria-current="page">${label}</span>`
        : `<a href="${href}">${label}</a>`,
    )
    .join('<span aria-hidden="true">›</span>')}</nav>`;
}

/* ------------------------------------------------------------------ */
/* One article                                                         */
/* ------------------------------------------------------------------ */

/**
 * The page object `renderPage` consumes. `lead` is the answer-first summary, so
 * the first thing under the H1 answers the question in the title — before any
 * heading, card or call to action.
 */
export function guideArticlePage(guide) {
  return {
    path: guide.path,
    title: `${guide.title} — كاتزو`,
    description: guide.description,
    h1: guide.h1,
    lead: guide.summary,
    bodyClass: 'page-guide',
    body: `${crumbsHtml([['/', 'الرئيسية'], ['/guides', 'الأدلة'], [guide.path, guide.title]])}
<section class="wrap sec guide-body">
  <p class="gmeta"><span>آخر تحديث: ${arabicDate(GUIDE_UPDATED)}</span><span>بقلم فريق كاتزو</span><span>قراءة ${guide.minutes} دقائق</span></p>
${guide.body.trim()}
</section>

<section class="wrap sec" id="faq">
  <h2>أسئلة شائعة</h2>
${faqHtml(guide)}
</section>

<section class="wrap sec" id="sources">
  <h2>المصادر الرسمية</h2>
  <p>كل رقم في هذا الدليل يعود إلى واحد من هذه المصادر، وروابطها تعمل عند آخر تحديث. اقرأ المصدر قبل أن تعتمد على أي تفصيل يخص حالتك.</p>
${sourcesHtml(guide)}
</section>

<section class="wrap sec" id="related">
  <h2>اقرأ أيضاً</h2>
${relatedHtml(guide)}
</section>

<section class="wrap sec gcta">
  <h2>تدرّب على الموقف قبل أن تواجهه</h2>
  <p>كاتزو يضعك في موقف مشابه، ويصحّح جملتك بالعربية. ابدأ بـ${FREE_LESSONS_PER_MONTH} دروس مجانية في المجموع، بلا بطاقة بنكية.</p>
  <p><a class="btn mag" href="${START}">ابدأ مجاناً</a></p>
</section>`,
    jsonld: [
      breadcrumbJsonLd([
        ['/', 'الرئيسية'],
        ['/guides', 'الأدلة'],
        [guide.path, guide.title],
      ]),
      articleJsonLd({
        path: guide.path,
        headline: guide.h1,
        description: guide.description,
        published: GUIDE_PUBLISHED,
        modified: GUIDE_UPDATED,
      }),
      faqPageJsonLd(guide.faq),
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The index                                                           */
/* ------------------------------------------------------------------ */

export function guideIndexPage() {
  const cards = CATEGORIES.map(
    (category) => `<section class="wrap sec" id="${category.id}">
  <h2>${category.title}</h2>
  <p class="gcat">${category.lead}</p>
  <ul class="gcards">
${category.guides
  .map((guide) => {
    const full = BY_SLUG.get(guide.slug);
    return `    <li><a class="gcard" href="${full.path}"><h3>${full.title}</h3><p>${full.description}</p><span class="gmeta-s">${full.minutes} دقائق قراءة</span></a></li>`;
  })
  .join('\n')}
  </ul>
</section>`,
  ).join('\n\n');

  return {
    path: '/guides',
    title: 'أدلة الألمانية العملية — كاتزو',
    description:
      'اثنا عشر دليلاً بالعربية عن امتحان A1، والكورس، والطبيب، والشقة، ومكتب التسجيل، والعمل، ومعادلة الشهادة — بمصادر رسمية وتاريخ تحديث.',
    h1: 'أدلة الألمانية: من الامتحان إلى المكتب',
    lead: 'اثنا عشر دليلاً عملياً لمن يستعدّ للانتقال إلى ألمانيا أو يعيش فيها بالفعل. كل دليل يبدأ بالجواب، ثم يشرح الخطوات، وينتهي بأسئلة شائعة ومصادر رسمية يمكنك فتحها بنفسك.',
    bodyClass: 'page-guides',
    body: `${crumbsHtml([['/', 'الرئيسية'], ['/guides', 'الأدلة']])}
<section class="wrap sec gintro">
  <p class="gmeta"><span>آخر تحديث: ${arabicDate(GUIDE_UPDATED)}</span><span>بقلم فريق كاتزو</span></p>
  <h2>كيف تقرأ هذه الأدلة</h2>
  <p>كل دليل مكتوب لسؤال واحد يصلنا كثيراً: ما الشهادة التي تطلبها السفارة؟ ما الذي يحدث في أول موعد عند الطبيب؟ كيف أكتب سيرة ذاتية يفهمها صاحب عمل ألماني؟ الجواب في أول فقرة، والتفاصيل بعدها، والمصدر في آخر الصفحة.</p>
  <p>لا نَعِد بقبول في سفارة ولا بنتيجة امتحان ولا بعمل. القرار عند الجهة المختصة، ودور هذه الصفحات أن يجعلك تعرف ما يُطلب منك قبل أن تدفع رسوماً أو تحجز موعداً. وحين يتغيّر رقم أو إجراء، نحدّث الصفحة ونغيّر تاريخ آخر تحديث أعلاها.</p>
  <ul class="checks">
    <li>ابدأ بالدليل الذي يخص أقرب موعد عندك، لا بالدليل الأسهل.</li>
    <li>افتح المصدر الرسمي في نهاية كل دليل قبل أن تعتمد على تفصيل يخص حالتك.</li>
    <li>إن اختلفت صفحتك الرسمية عن هذا الدليل، فالصفحة الرسمية هي المرجع.</li>
  </ul>
</section>

${cards}

<section class="wrap sec gcta">
  <h2>الدليل لا يكفي وحده</h2>
  <p>القراءة تعطيك الخريطة، والتدريب يعطيك الجملة. كاتزو يضعك في الموقف ويصحّح ما تقوله بالعربية. ابدأ بـ${FREE_LESSONS_PER_MONTH} دروس مجانية في المجموع.</p>
  <p><a class="btn mag" href="${START}">ابدأ مجاناً</a></p>
</section>`,
    jsonld: [
      breadcrumbJsonLd([
        ['/', 'الرئيسية'],
        ['/guides', 'الأدلة'],
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'أدلة الألمانية العملية',
        numberOfItems: GUIDES.length,
        itemListElement: GUIDES.map((guide, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: guide.title,
          url: `${SITE}${guide.path}`,
        })),
      },
    ],
  };
}

/** Last modification per guide path, for the sitemap. */
export function guideLastmods() {
  return Object.fromEntries(GUIDES.map((guide) => [guide.path, GUIDE_UPDATED]));
}
