import { describe, expect, it } from 'vitest';
import { MAX_FREE_AI_SESSIONS } from '../src/lib/entitlement/trialCopy';
import {
  CONTENT_DEFS,
  FAQ_AR,
  FAQ_EN,
  FREE_AI_SESSIONS,
  LANDING_AR,
  LANDING_EN,
  PUBLIC_CONTENT_UPDATED,
} from '../src/lib/seo/publicContent';
import { withLandingRoot } from '../vite.config';
import {
  buildPublicArtifacts,
  buildPublicPages,
  llmsFullTxt,
  llmsTxt,
  notFoundHtml,
  renderLandingRoot,
  renderPublicPage,
  robotsTxt,
  sitemapXml,
  withEntityStructuredData,
  withHreflang,
} from '../src/lib/seo/publicPages';

const ORIGIN = 'https://katzuai.com';

function jsonLdBlocks(html: string): Array<Record<string, unknown>> {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]) as Record<string, unknown>);
}

function graphTypes(graph: Record<string, unknown>): string[] {
  const nodes = Array.isArray(graph['@graph']) ? (graph['@graph'] as Array<Record<string, unknown>>) : [];
  return nodes.map((node) => String(node['@type']));
}

/** Two or three full stops, not a paragraph hidden behind a full stop. */
function sentenceCount(value: string): number {
  return value
    .split(/[.!?؟]+(?:\s|$)/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

describe('public page content', () => {
  it('keeps the public free-session number in step with the client mirror', () => {
    expect(FREE_AI_SESSIONS).toBe(MAX_FREE_AI_SESSIONS);
  });

  it('has 10–15 real questions in both languages with short answers', () => {
    for (const faq of [FAQ_AR, FAQ_EN]) {
      expect(faq.length).toBeGreaterThanOrEqual(10);
      expect(faq.length).toBeLessThanOrEqual(15);
      for (const item of faq) {
        expect(item.q.trim().length).toBeGreaterThan(4);
        expect(sentenceCount(item.a)).toBeGreaterThanOrEqual(2);
        expect(sentenceCount(item.a)).toBeLessThanOrEqual(3);
      }
    }
  });

  it('states the product, audience, levels, feature, languages, platform and price model in the landing copy', () => {
    const all = `${LANDING_AR.description} ${LANDING_AR.intro} ${LANDING_AR.facts.join(' ')}`;
    expect(all).toContain('تدريب محادثة ألمانية');
    expect(all).toContain('للناطقين بالعربية');
    expect(all).toContain('A0');
    expect(all).toContain('B2');
    expect(all).toContain('الصوت');
    expect(all).toContain('الكتابة');
    expect(all).toContain('إنجليزية');
    expect(all).toContain('PWA');
    expect(all).toContain('مجاني');
    expect(all).toContain('Pro');
    expect(all).toContain('كود تفعيل');

    const en = `${LANDING_EN.description} ${LANDING_EN.intro} ${LANDING_EN.facts.join(' ')}`;
    expect(en).toContain('Arabic-first');
    expect(en).toContain('A0');
    expect(en).toContain('B2');
    expect(en).toContain('voice or text');
    expect(en).toContain('PWA');
    expect(en).toContain('free');
    expect(en).toContain('Pro');
  });
});

describe('generated public HTML', () => {
  const pages = buildPublicPages(ORIGIN);

  it('generates both languages for every translated page and one Arabic trust page each', () => {
    const paths = pages.map((page) => page.path);
    // The Arabic landing is the SPA index, injected by Vite; every other
    // public page is generated here.
    expect(paths).not.toContain('/');
    expect(paths).toContain('/en');
    expect(paths).toContain('/how-it-works');
    expect(paths).toContain('/en/how-it-works');
    expect(paths).toContain('/faq');
    expect(paths).toContain('/en/faq');
    expect(paths).toContain('/trust/privacy');
    expect(paths).not.toContain('/en/trust/privacy');

    const arContent = CONTENT_DEFS.filter((def) => def.pathEn);
    expect(paths.filter((path) => path.startsWith('/en/')).length).toBe(arContent.length);
  });

  it('gives every page one h1, a canonical, the right lang/dir and valid JSON-LD', () => {
    for (const page of pages) {
      const html = renderPublicPage(page, ORIGIN);
      expect((html.match(/<h1[\s>]/gi) ?? []).length, page.id).toBe(1);
      const canonical = page.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${page.path}`;
      expect(html, page.id).toContain(`<link rel="canonical" href="${canonical}" />`);
      expect(html, page.id).toContain(`<html lang="${page.lang}" dir="${page.lang === 'ar' ? 'rtl' : 'ltr'}">`);
      expect(html, page.id).toContain('<meta name="robots" content="index, follow" />');

      const blocks = jsonLdBlocks(html);
      expect(blocks, page.id).toHaveLength(1);
      expect(blocks[0]['@context']).toBe('https://schema.org');
      const types = graphTypes(blocks[0]);
      expect(types, page.id).toEqual(expect.arrayContaining([
        'Organization',
        'WebSite',
        'SoftwareApplication',
        'WebPage',
        'BreadcrumbList',
      ]));
      if (page.faq) expect(types, page.id).toContain('FAQPage');
      expect(JSON.stringify(blocks[0])).not.toContain('katzu.app');
    }
  });

  it('adds hreflang only to pages that have a translation', () => {
    for (const page of pages) {
      const html = renderPublicPage(page, ORIGIN);
      if (page.alternates.en) {
        expect(html, page.id).toContain('hreflang="ar"');
        expect(html, page.id).toContain('hreflang="en"');
      } else {
        expect(html, page.id).toContain('hreflang="ar"');
        expect(html, page.id).not.toContain('hreflang="en"');
      }
      expect(html, page.id).toContain('hreflang="x-default"');
    }
  });

  it('prerenders the Arabic landing root with one h1 and the product facts', () => {
    const html = renderLandingRoot(ORIGIN);
    expect((html.match(/<h1[\s>]/gi) ?? []).length).toBe(1);
    expect(html).toContain('تدريب محادثة الألمانية');
    expect(html).toContain('A0');
    expect(html).toContain('B2');
    expect(html).toContain('PWA');
    expect(html).toContain('كود تفعيل');
    expect(html).toContain('href="/en"');
  });

  it('emits a noindex 404 page without a canonical or structured data', () => {
    const html = notFoundHtml(ORIGIN);
    expect((html.match(/<h1[\s>]/gi) ?? []).length).toBe(1);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('application/ld+json');
  });
});

describe('build artefacts', () => {
  const artifacts = buildPublicArtifacts(ORIGIN);

  it('writes every public page, the 404 and the crawler files', () => {
    expect(Object.keys(artifacts)).toEqual(expect.arrayContaining([
      'en.html',
      'how-it-works.html',
      'en/how-it-works.html',
      'faq.html',
      'pricing.html',
      'about.html',
      'trust/privacy.html',
      '404.html',
      'robots.txt',
      'sitemap.xml',
      'llms.txt',
      'llms-full.txt',
    ]));
    expect(artifacts['404.html']).toContain('noindex, nofollow');
  });

  it('emits flat files so the canonical extensionless URL is served with 200', () => {
    for (const page of buildPublicPages(ORIGIN)) {
      const expected = page.path === '/'
        ? 'index.html'
        : `${page.path.replace(/^\/+/, '')}.html`;
      expect(artifacts[expected], page.path).toBeTruthy();
      expect(expected.endsWith('/index.html'), page.path).toBe(false);
    }
  });

  it('lists every generated page in the sitemap, with lastmod and hreflang', () => {
    const sitemap = sitemapXml(ORIGIN);
    const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    for (const page of buildPublicPages(ORIGIN)) {
      expect(paths, page.id).toContain(page.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${page.path}`);
    }
    expect(paths).not.toContain(`${ORIGIN}/welcome`);
    expect(paths).not.toContain(`${ORIGIN}/demo`);
    expect(sitemap).toContain(`<lastmod>${PUBLIC_CONTENT_UPDATED}</lastmod>`);
    expect(sitemap).toContain('hreflang="x-default"');
    expect(sitemap).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
  });

  it('allows the named search/answer crawlers and states training choices separately', () => {
    const robots = robotsTxt(ORIGIN);
    for (const agent of [
      'OAI-SearchBot',
      'ChatGPT-User',
      'Claude-SearchBot',
      'Claude-User',
      'PerplexityBot',
      'Googlebot',
      'Bingbot',
      'GPTBot',
      'ClaudeBot',
      'Google-Extended',
      'Applebot-Extended',
    ]) {
      expect(robots).toMatch(new RegExp(`User-agent: ${agent}\\nAllow: /`));
    }
    expect(robots).toContain('Training crawlers: allowed by default');
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  it('publishes a short and a full AI brief without unsourced pricing or social proof', () => {
    const short = llmsTxt(ORIGIN);
    const full = llmsFullTxt(ORIGIN);
    for (const path of [
      '/', '/how-it-works', '/who-its-for', '/compare', '/use-cases/moving-to-germany',
      '/faq', '/pricing', '/about', '/en', '/en/how-it-works', '/en/faq',
      '/trust/privacy', '/trust/terms', '/trust/refund', '/trust/imprint', '/trust/contact',
    ]) {
      expect(short, path).toContain(`${ORIGIN}${path === '/' ? '/' : path}`);
    }
    for (const fact of ['A0–B2', 'A0–A1', 'A2–B2', '120', 'one-off', 'no automatic renewal', '13 real questions']) {
      expect(short, fact).toContain(fact);
    }
    expect(full).toContain('120 AI requests per day');
    expect(full).toContain('A0–B2');
    expect(full).toContain('A0–A1');
    expect(full).toContain('A2–B2');
    expect(full).toContain('No ratings, reviews, testimonials, user counts or awards');
    expect(full).not.toContain('5 USD');
    expect(full).not.toContain('unproven planning price');
  });
});

describe('SPA index helpers', () => {
  it('adds Arabic/English hreflang once without duplicating tags', () => {
    const head = '<head><title>Katzu</title></head>';
    const once = withHreflang(head, ORIGIN);
    expect(once.match(/hreflang="ar"/g)).toHaveLength(1);
    expect(once).toContain(`href="${ORIGIN}/en"`);
    expect(withHreflang(once, ORIGIN)).toBe(once);
  });

  it('injects the landing when Vite moves the entry script into head', () => {
    // The real failure: Vite put the module script in <head>, so a regression
    // regex that looked for it after #root silently matched nothing and shipped
    // an empty shell to every crawler.
    const shell =
      '<!doctype html><html><head><script type="module" src="/src/main.tsx"></script></head>' +
      '<body><div id="root">\n<noscript>JavaScript required</noscript>\n</div>\n</body></html>';
    const out = withLandingRoot(shell, ORIGIN);
    expect((out.match(/<h1[\s>]/gi) ?? []).length).toBe(1);
    expect(out).toContain('seo-landing');
    expect(out).toContain('<div id="root">');
    expect(out).toContain('<script type="module" src="/src/main.tsx"></script>');
  });

  it('adds the entity graph without a second WebSite node', () => {
    const html = withEntityStructuredData('<head><title>Katzu</title></head>', ORIGIN);
    const blocks = jsonLdBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]['@context']).toBe('https://schema.org');
    const types = graphTypes(blocks[0]);
    expect(types).toEqual(expect.arrayContaining(['Organization', 'SoftwareApplication', 'WebPage', 'BreadcrumbList']));
    expect(types).not.toContain('WebSite');
    expect(withEntityStructuredData(html, ORIGIN)).toBe(html);
  });
});
