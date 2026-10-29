/**
 * The three files a crawler reads before it reads a page: `sitemap.xml`,
 * `llms.txt` and the IndexNow key.
 *
 * WHY THEY ARE BUILT, NOT WRITTEN
 * A hand-written sitemap goes stale the day a page is added, and a hand-written
 * price in `llms.txt` is a second price table. Every URL, date, price and limit
 * below is read from the same modules the pages use, so the answer a crawler
 * gets cannot disagree with the answer a reader gets.
 *
 * ON `llms.txt` — READ THIS BEFORE TRUSTING IT
 * `llms.txt` is a proposed convention, not an agreed standard: none of the large
 * model vendors has committed to reading it, and there is no evidence it changes
 * what an assistant says about a site. It is here because it costs one file and
 * is generated from config, not because it is a ranking or citation lever. The
 * measurable part of AI discoverability is in `docs/agent/OWNER-CHECKLIST.md`:
 * the 30-prompt panel, run by hand, every month.
 */

import {
  ACTIVATION_HOURS,
  CTA_LABEL,
  FOUNDING_CAP,
  FREE_LESSONS_PER_MONTH,
  PLANS,
  REFUND_DAYS,
  SITE,
  START,
  SUPPORT,
  UPDATED,
  formatUsd,
} from './site-pricing.mjs';
import { CRAWLER_AGENTS, robotsTxt as robotsFromAgents } from './seo-agents.mjs';
import { GUIDES, GUIDE_UPDATED } from './guides/index.mjs';

/**
 * IndexNow key. Public by design — the service proves ownership by fetching
 * `/<key>.txt` from the host, so the file and this constant are the same bytes.
 * Rotating it means changing both and re-deploying the site.
 */
export const INDEXNOW_KEY = '01b620d0b185bc05ba94023366c02b06';
export const INDEXNOW_KEY_FILE = `${INDEXNOW_KEY}.txt`;
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/** Every public page on the marketing site, in reading order, with its date. */
export function siteSitemapEntries() {
  return [
    { loc: `${SITE}/`, lastmod: UPDATED },
    { loc: `${SITE}/pricing`, lastmod: UPDATED },
    { loc: `${SITE}/help`, lastmod: UPDATED },
    { loc: `${SITE}/affiliate`, lastmod: UPDATED },
    { loc: `${SITE}/guides`, lastmod: GUIDE_UPDATED },
    ...GUIDES.map((guide) => ({ loc: `${SITE}${guide.path}`, lastmod: GUIDE_UPDATED })),
  ];
}

export function sitemapXml() {
  const urls = siteSitemapEntries()
    .map(({ loc, lastmod }) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function robotsTxt() {
  return robotsFromAgents(`${SITE}/sitemap.xml`);
}

/** The public URL list, exactly as the sitemap lists it. */
export function siteUrls() {
  return siteSitemapEntries().map((entry) => entry.loc);
}

/**
 * `llms.txt`: what Katzu is, what it costs, what it does not claim, and where
 * the twelve guides are. Every number comes from `pricing.config.json` or the
 * page content; nothing is typed here.
 */
export function llmsTxt() {
  const plans = PLANS.map(
    (plan) =>
      `- ${plan.nameAr}: ${formatUsd(plan.cents)} للفترة كاملة (السعر المستقبلي ${formatUsd(plan.futureCents)})`,
  ).join('\n');

  const guides = GUIDES.map((guide) => `- [${guide.title}](${SITE}${guide.path}): ${guide.description}`).join(
    '\n',
  );

  return `# كاتزو (Katzu)

> تطبيق ويب عربي لتعلّم الألمانية بالتحدّث: موقف يومي، جملة تنطقها أو تكتبها، وتصحيح بالعربية. الصفحات العامة بالعربية، والألمانية تُعرض داخل الجملة باتجاه من اليسار إلى اليمين.

## ما هو
- تطبيق تدريب على المحادثة، لا كورس قواعد ولا مزوّد شهادات.
- ${FREE_LESSONS_PER_MONTH} دروس مجانية في المجموع، بلا بطاقة بنكية.
- ${CTA_LABEL}: ${START}
- الصفحات العامة: ${SITE}/ · ${SITE}/pricing · ${SITE}/help · ${SITE}/affiliate · ${SITE}/guides

## الأسعار
${plans}
- استرداد كامل خلال ${REFUND_DAYS} أيام على باقات 3 و6 و12 شهراً.
- تفعيل الكود خلال ${ACTIVATION_HOURS} ساعة كحد أقصى، والبريد ${SUPPORT}.
- أسعار المؤسسين تنتهي عند ${FOUNDING_CAP} عضو دافع مؤكد أو في التاريخ المعلن على صفحة الأسعار.

## الأدلة (${GUIDES.length})
${guides}

## ما لا ندّعيه
- لا نمنح شهادة رسمية، ولا نستبدل مزوّد امتحان معتمداً، ولا نضمن تأشيرة أو وظيفة أو نتيجة امتحان.
- لا توجد تقييمات أو أعداد مستخدمين منشورة، لأننا لا نستطيع إثباتها.
- الروابط الرسمية في نهاية كل دليل هي المرجع عند الاختلاف.

## ملاحظة
هذا الملف مولَّد من إعدادات الموقع نفسها عند كل بناء. وهو اتفاق غير معياري بعد، ويُقرأ كدليل لا كضمان.
`;
}

/** The IndexNow key file: one line, the key, a trailing newline. */
export function indexNowKeyFile() {
  return `${INDEXNOW_KEY}\n`;
}

/** Payload for one IndexNow submission, built from the live URL list. */
export function indexNowPayload(urls = siteUrls()) {
  return {
    host: new URL(SITE).host,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE}/${INDEXNOW_KEY_FILE}`,
    urlList: urls,
  };
}

export { CRAWLER_AGENTS };
