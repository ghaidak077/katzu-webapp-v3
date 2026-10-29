/**
 * The twelve guides, checked on the HTML a crawler actually receives.
 *
 * WHY THIS IS A TEST AND NOT A REVIEW NOTE
 * An "SEO article" fails in ways that are invisible in a browser: the FAQ in the
 * markup stops matching the FAQ in the schema, the canonical points at the index,
 * the date is missing from the Article, or the piece is 500 words. Each of those
 * costs the page its eligibility and none of them breaks a link. The build
 * already refuses a short or duplicated guide (`scripts/guides/index.mjs`); this
 * file checks the emitted page, which is the only version that ships.
 *
 * The word count is measured on the article region only — summary, body and FAQ —
 * not on the breadcrumbs, sources, related links or the closing call to action.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GUIDE_UPDATED, arabicDate } from '../scripts/guides/index.mjs';

const SITE = 'https://website.katzuai.com';

const GUIDES = [
  ['a1-visa', 'امتحان A1 للسفارة'],
  ['a1-b1', 'من A1 إلى B1'],
  ['integrationskurs', 'كورس الاندماج'],
  ['aussprache', 'النطق'],
  ['wortschatz', 'المفردات'],
  ['artikel', 'أدوات التعريف'],
  ['arzt', 'عند الطبيب'],
  ['wohnung', 'الشقة'],
  ['buergeramt', 'مكتب التسجيل'],
  ['arbeit', 'العمل'],
  ['anerkennung', 'معادلة الشهادة'],
  ['telefon', 'الهاتف'],
] as const;

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function jsonLd(html: string): any[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (match) => JSON.parse(match[1]),
  );
}

/** Visible words in a fragment: scripts and tags removed, entities not counted. */
function words(fragment: string): number {
  return fragment
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean).length;
}

/** Text of a fragment as a reader sees it, whitespace collapsed. */
function text(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The article region: the answer-first summary, the body and the FAQ. It stops
 * before the sources list, so the official links and the closing CTA are not
 * counted as article prose.
 */
function articleRegion(html: string): string {
  const start = html.indexOf('<p class="lead reveal">');
  const end = html.indexOf('<section class="wrap sec" id="sources">');
  if (start < 0 || end < 0) throw new Error('guide page: article region not found');
  return html.slice(start, end);
}

const pages = GUIDES.map(([slug]) => ({ slug, html: read(`website/guides/${slug}.html`) }));

describe('the twelve guides', () => {
  it('is one page per slug, each 900–1500 words of article', () => {
    for (const { slug, html } of pages) {
      const count = words(articleRegion(html));
      expect(count, `${slug} is ${count} words`).toBeGreaterThanOrEqual(900);
      expect(count, `${slug} is ${count} words`).toBeLessThanOrEqual(1500);
    }
  });

  it('declares Arabic, one H1, and a real section structure', () => {
    for (const { slug, html } of pages) {
      expect(html, `${slug} lang`).toContain('<html lang="ar" dir="rtl">');
      expect([...html.matchAll(/<h1[\s>]/g)], `${slug} h1 count`).toHaveLength(1);
      const h2 = [...html.matchAll(/<h2[\s>]/g)].length;
      expect(h2, `${slug} needs a logical set of H2s`).toBeGreaterThanOrEqual(4);
      // An answer-first page has its summary directly under the H1.
      expect(html, `${slug} answer-first lead`).toMatch(
        /<h1 class="reveal">[\s\S]*?<\/h1>\s*<p class="lead reveal">[\s\S]{80,}<\/p>/,
      );
      expect(html, `${slug} last-updated line`).toContain('آخر تحديث:');
      expect(html, `${slug} byline`).toContain('بقلم فريق كاتزو');
      expect(html, `${slug} official sources`).toContain('id="sources"');
      // No layout shift from an unsized image and no price on an editorial page.
      expect(html, `${slug} price`).not.toMatch(/\$\d/);
      expect(html, `${slug} Arabic-Indic digits`).not.toMatch(/[\u0660-\u0669]/);
      expect(html, `${slug} unsized image`).not.toMatch(/<img(?![^>]*\bwidth=)[^>]*>/);
    }
  });

  it('gives every guide a unique title, description and self-canonical', () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const { slug, html } of pages) {
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
      const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? '';
      expect(title, `${slug} title`).toMatch(/ — كاتزو$/);
      expect(title.length, `${slug} title length`).toBeLessThanOrEqual(65);
      expect(description.length, `${slug} description length`).toBeGreaterThan(80);
      expect(description.length, `${slug} description length`).toBeLessThanOrEqual(160);
      expect(titles.has(title), `${slug} duplicates a title`).toBe(false);
      expect(descriptions.has(description), `${slug} duplicates a description`).toBe(false);
      titles.add(title);
      descriptions.add(description);

      const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map((m) => m[1]);
      expect(canonicals, `${slug} canonical`).toEqual([`${SITE}/guides/${slug}`]);
      expect(html, `${slug} hreflang ar`).toContain(
        `<link rel="alternate" hreflang="ar" href="${SITE}/guides/${slug}">`,
      );
      expect(html, `${slug} hreflang default`).toContain(
        `<link rel="alternate" hreflang="x-default" href="${SITE}/guides/${slug}">`,
      );
      expect(html, `${slug} noindex`).not.toContain('name="robots"');
      // The footer carries the hub link on every page, the main nav does not.
      expect(html, `${slug} footer hub link`).toContain('<a href="/guides">الأدلة</a>');
    }
  });

  it('publishes Article and BreadcrumbList markup with the same dates as the page', () => {
    for (const { slug, html } of pages) {
      const blocks = jsonLd(html);
      const types = blocks.map((block) => block['@type']);
      expect(types, `${slug} block types`).toEqual(
        expect.arrayContaining(['WebPage', 'BreadcrumbList', 'Article', 'FAQPage']),
      );

      const article = blocks.find((block) => block['@type'] === 'Article');
      const h1 = text(html.match(/<h1 class="reveal">([\s\S]*?)<\/h1>/)?.[1] ?? '');
      expect(article.headline).toBe(h1);
      expect(article.inLanguage).toBe('ar');
      expect(article.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(article.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(article.dateModified >= article.datePublished).toBe(true);
      expect(article.author.name).toBe('Katzu');
      expect(article.mainEntityOfPage['@id']).toBe(`${SITE}/guides/${slug}`);

      const crumbs = blocks.find((block) => block['@type'] === 'BreadcrumbList');
      expect(crumbs.itemListElement.map((item: any) => item.position)).toEqual([1, 2, 3]);
      expect(crumbs.itemListElement[2].item).toBe(`${SITE}/guides/${slug}`);

      // The visible last-updated date and the schema date agree.
      expect(article.dateModified).toBe(GUIDE_UPDATED);
      expect(html).toContain(arabicDate(GUIDE_UPDATED));
    }
  });

  it('keeps every FAQ answer identical in the page and in the schema', () => {
    for (const { slug, html } of pages) {
      const faq = jsonLd(html).find((block) => block['@type'] === 'FAQPage');
      const visible = [
        ...html.matchAll(/<div class="qa"><h3>([\s\S]*?)<\/h3><p>([\s\S]*?)<\/p><\/div>/g),
      ].map(([, q, a]) => ({ q: text(q), a: text(a) }));

      expect(faq.mainEntity.length, `${slug} FAQ count`).toBeGreaterThanOrEqual(3);
      expect(faq.mainEntity.length, `${slug} FAQ count`).toBeLessThanOrEqual(5);
      expect(visible.length, `${slug} visible FAQ count`).toBe(faq.mainEntity.length);
      faq.mainEntity.forEach((item: any, index: number) => {
        expect(item['@type']).toBe('Question');
        expect(item.name).toBe(visible[index].q);
        expect(item.acceptedAnswer.text).toBe(visible[index].a);
      });
    }
  });

  it('links to two or three other guides, every one of them published', () => {
    const slugs = new Set(GUIDES.map(([slug]) => slug));
    for (const { slug, html } of pages) {
      const related = [...html.matchAll(/<li><a href="\/guides\/([a-z0-9-]+)">/g)].map((m) => m[1]);
      expect(related.length, `${slug} related guides`).toBeGreaterThanOrEqual(2);
      expect(related.length, `${slug} related guides`).toBeLessThanOrEqual(3);
      for (const target of related) {
        expect(target, `${slug} links to an unpublished guide`).not.toBe(slug);
        expect(slugs.has(target), `${slug} -> ${target}`).toBe(true);
      }
    }
  });
});

describe('the guides hub', () => {
  const html = read('website/guides.html');

  it('lists all twelve guides and nothing else', () => {
    for (const [slug] of GUIDES) expect(html, `${slug} card`).toContain(`href="/guides/${slug}"`);
    expect([...html.matchAll(/class="gcard"/g)]).toHaveLength(12);

    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    expect(canonical).toBe(`${SITE}/guides`);
    expect([...html.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    expect(html).toContain('<html lang="ar" dir="rtl">');
  });

  it('describes the list in schema, with the count the page shows', () => {
    const list = jsonLd(html).find((block) => block['@type'] === 'ItemList');
    expect(list.numberOfItems).toBe(12);
    expect(list.itemListElement).toHaveLength(12);
    expect(list.itemListElement[0].url).toMatch(/^https:\/\/website\.katzuai\.com\/guides\//);
    const crumbs = jsonLd(html).find((block) => block['@type'] === 'BreadcrumbList');
    expect(crumbs.itemListElement).toHaveLength(2);
  });
});

describe('the crawler files', () => {
  const robots = read('website/robots.txt');

  it('welcomes the ten named crawlers and closes only the private paths', () => {
    for (const agent of [
      'Googlebot',
      'bingbot',
      'GPTBot',
      'OAI-SearchBot',
      'ChatGPT-User',
      'ClaudeBot',
      'Claude-SearchBot',
      'PerplexityBot',
      'Applebot',
      'Google-Extended',
    ]) {
      expect(robots, `${agent} group`).toContain(`User-agent: ${agent}\nAllow: /`);
    }
    expect(robots).toContain(
      'User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=yes\nAllow: /',
    );
    // Exactly once, inside the wildcard group: the named groups already carry the
    // same policy in robots syntax, and a second copy would state it twice.
    expect(robots.match(/^Content-Signal:/gm)).toHaveLength(1);
    expect(robots).not.toContain('ai-train=no');
    for (const path of ['/admin/', '/api/', '/private/']) {
      expect(robots, `${path} disallowed`).toContain(`Disallow: ${path}`);
    }
    expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  it('serves the IndexNow key under the name the sitemap proves', () => {
    const key = readFileSync('website/01b620d0b185bc05ba94023366c02b06.txt', 'utf8').trim();
    expect(key).toBe('01b620d0b185bc05ba94023366c02b06');
  });

  it('explains the product and lists every guide in llms.txt', () => {
    const llms = read('website/llms.txt');
    expect(llms).toContain('# كاتزو (Katzu)');
    expect(llms, 'the honesty note').toContain('اتفاق غير معياري');
    for (const [slug] of GUIDES) expect(llms, `${slug} in llms.txt`).toContain(`${SITE}/guides/${slug}`);
    // A price in this file must be a price the site sells.
    expect(llms).toContain('$14.99');
    expect(llms).not.toMatch(/\$60\b|\$42\b/);
  });
});
