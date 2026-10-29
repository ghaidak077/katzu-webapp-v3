/**
 * The two representations of every marketing page, checked on the files that
 * ship and on the Function that chooses between them.
 *
 * WHY BOTH HALVES
 * A markdown twin that drifts from its page is worse than none: an assistant
 * would answer from text the reader cannot find. And a negotiator that answers
 * markdown to a browser breaks the actual site. So this file checks the files on
 * disk for every page (same title, no markup, no nav/footer/script) and drives
 * the middleware with real `Request`/`Response` objects for the header cases.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUIDES } from '../scripts/guides/index.mjs';
import { htmlToMarkdown, pageMarkdown } from '../scripts/site-markdown.mjs';
import { markdownPathFor, onRequest, wantsMarkdown } from '../website/functions/_middleware.js';

const root = process.cwd();

/** Every generated page, as the path a visitor uses and the files behind it. */
const PAGES = [
  { path: '/', html: 'website/index.html', md: 'website/md/index.md' },
  { path: '/pricing', html: 'website/pricing.html', md: 'website/md/pricing.md' },
  { path: '/help', html: 'website/help.html', md: 'website/md/help.md' },
  { path: '/affiliate', html: 'website/affiliate.html', md: 'website/md/affiliate.md' },
  { path: '/guides', html: 'website/guides.html', md: 'website/md/guides.md' },
  ...GUIDES.map((guide) => ({
    path: guide.path,
    html: `website${guide.path}.html`,
    md: `website/md${guide.path}.md`,
  })),
];

const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

/** The text of the page's single `h1`, with its inline wrappers removed. */
function h1Text(html: string): string {
  const raw = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!raw) throw new Error('page has no h1');
  return raw[1]
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('every page has a markdown twin', () => {
  it('covers the five page shapes and all twelve guides', () => {
    expect(PAGES).toHaveLength(17);
  });

  for (const page of PAGES) {
    it(`${page.path} ships both variants`, () => {
      expect(existsSync(join(root, page.html)), `${page.path} html`).toBe(true);
      expect(existsSync(join(root, page.md)), `${page.path} markdown`).toBe(true);

      const html = read(page.html);
      const markdown = read(page.md);

      expect(markdown.trim().length, `${page.path} markdown is not empty`).toBeGreaterThan(80);
      // Same page: the heading a reader sees is the heading the twin opens with.
      expect(markdown, `${page.path} twin carries the page h1`).toContain(h1Text(html));
    });
  }

  it('carries no markup, navigation, footer or script', () => {
    for (const page of PAGES) {
      const markdown = read(page.md);
      expect(markdown, `${page.path} has a raw tag`).not.toMatch(/<\/?[a-z][a-z0-9-]*[\s>/]/i);
      expect(markdown, `${page.path} has a script`).not.toMatch(/<script|javascript:/i);
      expect(markdown, `${page.path} has the nav`).not.toContain('aria-label="التنقل الرئيسي"');
      expect(markdown, `${page.path} has the footer`).not.toContain('© 2026 كاتزو');
    }
  });

  it('keeps the HTML the only canonical, indexable variant', () => {
    for (const page of PAGES) {
      const html = read(page.html);
      // The feature is additive: no page links to its twin, and no page claims a
      // second representation in its head.
      expect(html, `${page.path} links its markdown`).not.toContain('/md/');
      expect(html, `${page.path} advertises markdown`).not.toMatch(/text\/markdown/i);
      expect(html.match(/<link rel="canonical"/g), `${page.path} canonicals`).toHaveLength(1);
      expect(html, `${page.path} canonical is itself`).toContain(
        `<link rel="canonical" href="https://website.katzuai.com${page.path === '/' ? '/' : page.path}">`,
      );
    }
  });

  it('is derived from the HTML, so the two cannot disagree', () => {
    for (const page of PAGES) {
      const html = read(page.html);
      const fromHtml = pageMarkdown(html);
      expect(fromHtml, `${page.path} renders from its own html`).toBe(read(page.md));
    }
  });
});

describe('the middleware picks the representation', () => {
  it('maps exactly the page URLs to their twin', () => {
    expect(markdownPathFor('/')).toBe('/md/index.md');
    expect(markdownPathFor('/pricing')).toBe('/md/pricing.md');
    expect(markdownPathFor('/pricing/')).toBe('/md/pricing.md');
    expect(markdownPathFor('/guides/a1-visa')).toBe('/md/guides/a1-visa.md');
    // A guide-shaped URL is negotiated by shape; whether the twin exists is
    // answered by the fetch, not by a second copy of the guide list here.
    expect(markdownPathFor('/guides/nope')).toBe('/md/guides/nope.md');
    for (const path of ['/robots.txt', '/sitemap.xml', '/assets/site.css', '/404.html', '/nope']) {
      expect(markdownPathFor(path), `${path} is not negotiable`).toBeNull();
    }
  });

  it('reads the header, including its quality value', () => {
    expect(wantsMarkdown('text/markdown')).toBe(true);
    expect(wantsMarkdown('text/html, text/markdown;q=0.9')).toBe(true);
    expect(wantsMarkdown('TEXT/MARKDOWN; charset=utf-8')).toBe(true);
    expect(wantsMarkdown('text/markdown;q=0')).toBe(false);
    expect(wantsMarkdown('text/html,application/xhtml+xml,*/*;q=0.8')).toBe(false);
    expect(wantsMarkdown('*/*')).toBe(false);
    expect(wantsMarkdown(null)).toBe(false);
  });

  /** A context shaped like the one Pages passes, with a real asset table. */
  const context = (path: string, accept: string | null, assets: Record<string, string> = {}) => {
    const request = new Request(`https://website.katzuai.com${path}`, {
      headers: accept ? { accept } : {},
    });
    const env = {
      ASSETS: {
        fetch: async (input: Request) => {
          const url = new URL(input.url);
          const body = assets[url.pathname];
          return body === undefined
            ? new Response('missing', { status: 404 })
            : new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain' } });
        },
      },
    };
    const html = () =>
      new Response('<html><main><h1>الصفحة</h1></main></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    return { request, env, next: html, html };
  };

  it('answers markdown, with the headers a cache needs', async () => {
    const ctx = context('/pricing', 'text/markdown', { '/md/pricing.md': '# الأسعار\n' });
    const res = await onRequest(ctx as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(res.headers.get('vary')).toBe('Accept');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(await res.text()).toBe('# الأسعار\n');
  });

  it('answers HTML to a browser, and marks the URL as varying', async () => {
    const ctx = context('/pricing', 'text/html,*/*;q=0.8');
    const res = await onRequest(ctx as never);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('vary')).toBe('Accept');
    expect(await res.text()).toContain('<main>');
  });

  it('falls back to the page when a twin is missing, and leaves other paths alone', async () => {
    const missing = await onRequest(context('/pricing', 'text/markdown') as never);
    expect(missing.headers.get('content-type')).toBe('text/html; charset=utf-8');

    const robots = await onRequest(context('/robots.txt', 'text/markdown') as never);
    expect(robots.headers.get('vary')).toBeNull();
  });

  it('never serves its own source', async () => {
    const res = await onRequest(context('/functions/_middleware.js', 'text/markdown') as never);
    expect(res.status).toBe(404);
  });
});

describe('the markdown converter', () => {
  it('keeps headings, lists, links, tables and the FAQ', () => {
    const html = `<main><h1>عنوان</h1><p>نص <a href="/x">رابط</a>.</p>
      <ul><li><p>أول</p></li><li><p>ثاني</p></li></ul>
      <table><thead><tr><th>أ</th><th>ب</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
      <details><summary>سؤال؟</summary><p>جواب.</p></details></main>`;
    const md = pageMarkdown(html) ?? '';
    expect(md).toContain('# عنوان');
    expect(md).toContain('[رابط](/x)');
    expect(md).toContain('- أول\n- ثاني');
    expect(md).toContain('| أ | ب |');
    expect(md).toContain('| 1 | 2 |');
    expect(md).toContain('**سؤال؟**');
    expect(md).not.toMatch(/<\/?[a-z][a-z0-9-]*[\s>/]/i);
  });

  it('returns null rather than shipping the whole document', () => {
    expect(pageMarkdown('<html><body><nav>nav</nav></body></html>')).toBeNull();
    expect(pageMarkdown('<main> </main>')).toBeNull();
    expect(htmlToMarkdown('<p>نص</p>')).toContain('نص');
  });
});
