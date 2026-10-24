import { FAIR_USE_AI_PER_DAY } from '../offers/pricing';
import { SUPPORT_ADDRESS_AR } from '../trust/content';
import {
  CONTENT_DEFS,
  FAQ_AR,
  FAQ_EN,
  LANDING_AR,
  LANDING_EN,
  FREE_AI_SESSIONS,
  PUBLIC_CONTENT_UPDATED,
  SHARE_IMAGE,
  type ContentDef,
  type FaqItem,
  type PageLang,
} from './publicContent';

/**
 * Static public-site generation.
 *
 * This module is imported by `vite.config.ts` (through a relative path, before
 * Vite has resolved `@/`) and writes real HTML for every public page. The React
 * app keeps `/app/*` and the other private routes; it is not asked to become an
 * SSR app.
 */

export interface PublicPage {
  id: string;
  lang: PageLang;
  path: string;
  title: string;
  description: string;
  h1: string;
  updated: string;
  body: string;
  alternates: { ar?: string; en?: string };
  faq?: FaqItem[];
  noindex?: boolean;
}

interface SitemapRoute {
  path: string;
  updated: string;
  alternates: { ar?: string; en?: string };
}

const AR_NAV = [
  ['/how-it-works', 'كيف يعمل'],
  ['/who-its-for', 'لمن يناسب'],
  ['/compare', 'مقارنة'],
  ['/use-cases/moving-to-germany', 'الانتقال'],
  ['/faq', 'الأسئلة'],
  ['/pricing', 'السعر'],
  ['/about', 'عن Katzu'],
] as const;

const EN_NAV = [
  ['/en/how-it-works', 'How it works'],
  ['/en/who-its-for', 'Who it is for'],
  ['/en/compare', 'Compare'],
  ['/en/use-cases/moving-to-germany', 'Moving'],
  ['/en/faq', 'FAQ'],
  ['/en/pricing', 'Pricing'],
  ['/en/about', 'About'],
] as const;

const AR_TRUST = [
  ['/trust/privacy', 'الخصوصية'],
  ['/trust/terms', 'الشروط'],
  ['/trust/refund', 'الاسترداد'],
  ['/trust/imprint', 'بيانات الناشر'],
  ['/trust/contact', 'تواصل'],
] as const;

const EN_TRUST = [
  ['/trust/privacy', 'Privacy (Arabic)'],
  ['/trust/terms', 'Terms (Arabic)'],
  ['/trust/refund', 'Refunds (Arabic)'],
  ['/trust/imprint', 'Imprint (Arabic)'],
  ['/trust/contact', 'Contact (Arabic)'],
] as const;

export function normalizeOrigin(origin: string): string {
  const value = String(origin || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(value) ? value : '';
}

function absolute(origin: string, path: string): string {
  const base = normalizeOrigin(origin);
  if (!base) return path;
  return path === '/' ? `${base}/` : `${base}${path}`;
}

function attr(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function fileForPath(path: string): string {
  if (path === '/') return 'index.html';
  // Cloudflare Pages serves `faq.html` at `/faq` and 308s `/faq/` to `/faq`.
  // A directory index (`faq/index.html`) would do the opposite: `/faq` would
  // redirect to `/faq/` while every canonical and sitemap entry says `/faq`.
  // Emit flat files so the canonical URL is the URL Pages returns with 200.
  return `${path.replace(/^\/+/, '').replace(/\/+$/, '')}.html`;
}

function defToPage(def: ContentDef, lang: PageLang): PublicPage {
  const isAr = lang === 'ar';
  const path = isAr ? def.pathAr : def.pathEn;
  const title = isAr ? def.titleAr : def.titleEn;
  const description = isAr ? def.descriptionAr : def.descriptionEn;
  const h1 = isAr ? def.h1Ar : def.h1En;
  const body = isAr ? def.bodyAr : def.bodyEn;
  const faq = isAr ? def.faqAr : def.faqEn;
  if (!path || !title || !description || !h1 || !body) {
    throw new Error(`Missing ${lang} content for public page ${def.id}`);
  }
  return {
    id: `${def.id}-${lang}`,
    lang,
    path,
    title,
    description,
    h1,
    updated: def.updated,
    body,
    alternates: def.pathEn ? { ar: def.pathAr, en: def.pathEn } : { ar: def.pathAr },
    faq,
  };
}

const EN_LANDING_PAGE: PublicPage = {
  id: 'landing-en',
  lang: 'en',
  path: LANDING_EN.path,
  title: LANDING_EN.title,
  description: LANDING_EN.description,
  h1: LANDING_EN.h1,
  updated: PUBLIC_CONTENT_UPDATED,
  body: landingMain('en'),
  alternates: { ar: LANDING_AR.path, en: LANDING_EN.path },
};

export function buildPublicPages(origin: string): PublicPage[] {
  const pages: PublicPage[] = [EN_LANDING_PAGE];
  for (const def of CONTENT_DEFS) {
    pages.push(defToPage(def, 'ar'));
    if (def.pathEn && def.titleEn && def.descriptionEn && def.h1En && def.bodyEn) {
      pages.push(defToPage(def, 'en'));
    }
  }
  return pages;
}

export function renderPublicPage(page: PublicPage, origin: string): string {
  const base = normalizeOrigin(origin);
  const canonical = page.noindex ? '' : absolute(base, page.path);
  const altLinks: string[] = [];
  if (base && !page.noindex) {
    const ar = page.alternates.ar ? absolute(base, page.alternates.ar) : '';
    const en = page.alternates.en ? absolute(base, page.alternates.en) : '';
    if (ar) altLinks.push(`<link rel="alternate" hreflang="ar" href="${attr(ar)}" />`);
    if (en) altLinks.push(`<link rel="alternate" hreflang="en" href="${attr(en)}" />`);
    const fallback = ar || canonical;
    if (fallback) altLinks.push(`<link rel="alternate" hreflang="x-default" href="${attr(fallback)}" />`);
  }

  const isAr = page.lang === 'ar';
  const home = isAr ? '/' : '/en';
  const altPath = isAr ? page.alternates.en : page.alternates.ar;
  const graph = page.noindex ? null : structuredGraph(page, base, true);
  const image = absolute(base, SHARE_IMAGE);
  const imageAlt = isAr
    ? 'Katzu — تدريب محادثة الألمانية للناطقين بالعربية'
    : 'Katzu — Arabic-first German conversation practice';
  // A generated trust page is content, not a landing screen: it needs its own
  // h1 even when the source body starts with a section paragraph. Pages whose
  // body already opens with an h1 (the two landing pages) must not get a second.
  const heading = /<h1[\s>]/i.test(page.body) ? '' : `<h1>${attr(page.h1)}</h1>`;

  return `<!doctype html>
<html lang="${page.lang}" dir="${isAr ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${attr(page.title)}</title>
    <meta name="description" content="${attr(page.description)}" />
    <meta name="robots" content="${page.noindex ? 'noindex, nofollow' : 'index, follow'}" />
    ${canonical ? `<link rel="canonical" href="${attr(canonical)}" />` : ''}
    ${altLinks.join('\n    ')}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Katzu" />
    <meta property="og:title" content="${attr(page.title)}" />
    <meta property="og:description" content="${attr(page.description)}" />
    ${canonical ? `<meta property="og:url" content="${attr(canonical)}" />` : ''}
    <meta property="og:image" content="${attr(image)}" />
    <meta property="og:image:alt" content="${attr(imageAlt)}" />
    <meta property="og:locale" content="${isAr ? 'ar_AR' : 'en_US'}" />
    ${!isAr && page.alternates.ar ? '<meta property="og:locale:alternate" content="ar_AR" />' : ''}
    ${isAr && page.alternates.en ? '<meta property="og:locale:alternate" content="en_US" />' : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${attr(page.title)}" />
    <meta name="twitter:description" content="${attr(page.description)}" />
    <meta name="twitter:image" content="${attr(image)}" />
    <link rel="icon" type="image/png" href="/assets/mascot/katzu_icon_192.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/mascot/katzu_apple_180.png" />
    <link rel="preload" href="/assets/fonts/cairo.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/site.css" />
    ${graph ? `<script type="application/ld+json" id="katzu-page-jsonld">${jsonForScript(graph)}</script>` : ''}
  </head>
  <body class="site-page-body">
    <a class="skip-link" href="#main">${isAr ? 'تجاوز إلى المحتوى' : 'Skip to content'}</a>
    ${renderHeader(page.lang, page.path, altPath)}
    <main id="main" class="site-main site-wrap">
      ${heading}
      ${page.body}
    </main>
    ${renderFooter(page.lang, page.updated)}
    <noscript><p class="notice">${isAr ? 'التطبيق التفاعلي يحتاج JavaScript، لكن كل المعلومات أعلاه متاحة بدونه.' : 'The interactive app needs JavaScript, but all the information above is available without it.'}</p></noscript>
  </body>
</html>`;
}

export function renderLandingRoot(origin: string): string {
  const base = normalizeOrigin(origin);
  const en = absolute(base, '/en');
  return `<div class="seo-landing">
  <style>
    .seo-landing{background:rgb(var(--kz-black));color:rgb(var(--kz-ink));font-family:'Cairo',system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.8;min-height:100vh}
    .seo-landing *{box-sizing:border-box}
    .seo-landing .skip-link{position:absolute;inset-inline-start:-9999px}
    .seo-landing .site-header{border-bottom:1px solid rgb(var(--kz-line));background:rgb(var(--kz-near-black))}
    .seo-landing .site-bar,.seo-landing .site-wrap{max-width:980px;margin:0 auto;padding:14px 18px}
    .seo-landing .site-bar{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
    .seo-landing .site-brand{display:flex;align-items:center;gap:8px;color:rgb(var(--kz-ink));text-decoration:none;font-weight:700}
    .seo-landing .site-brand img{border-radius:10px}
    .seo-landing .site-nav{display:flex;gap:12px;flex-wrap:wrap;flex:1}
    .seo-landing .site-nav a,.seo-landing .lang-switch{color:rgb(var(--kz-ink-dim));text-decoration:none;font-size:14px}
    .seo-landing .site-nav a:hover,.seo-landing .lang-switch:hover{color:rgb(var(--kz-ink))}
    .seo-landing .lang-switch{border:1px solid rgb(var(--kz-line));border-radius:999px;padding:4px 10px}
    .seo-landing main{padding-top:24px;padding-bottom:24px}
    .seo-landing .kicker{color:rgb(var(--kz-lavender));font-weight:700;margin:0 0 8px}
    .seo-landing h1{font-size:clamp(28px,5vw,48px);line-height:1.35;margin:0 0 14px;color:rgb(var(--kz-on-fill))}
    .seo-landing .lede{font-size:clamp(16px,2.2vw,20px);color:rgb(var(--kz-ink-dim));max-width:780px;margin:0 0 18px}
    .seo-landing .actions{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}
    .seo-landing .btn{display:inline-block;border-radius:999px;padding:10px 16px;text-decoration:none;font-weight:700}
    .seo-landing .btn-primary{background:rgb(var(--kz-lavender-deep));color:rgb(var(--kz-on-lavender))}
    .seo-landing .btn-ghost{border:1px solid rgb(var(--kz-line-strong));color:rgb(var(--kz-ink))}
    .seo-landing .facts{margin:18px 0;padding:16px;border:1px solid rgb(var(--kz-line));border-radius:16px;background:rgb(var(--kz-glass-base))}
    .seo-landing .facts li{margin:6px 0}
    .seo-landing .landing-links{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}
    .seo-landing .landing-links a{color:rgb(var(--kz-lavender))}
    .seo-landing .site-footer{border-top:1px solid rgb(var(--kz-line));background:rgb(var(--kz-near-black));color:rgb(var(--kz-ink-dim));font-size:14px}
    .seo-landing .site-footer a{color:rgb(var(--kz-lavender))}
    .seo-landing .footer-links{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0}
  </style>
  <a class="skip-link" href="#main">تجاوز إلى المحتوى</a>
  ${renderHeader('ar', '/', '/en')}
  <main id="main" class="site-main site-wrap">
    ${landingMain('ar')}
  </main>
  ${renderFooter('ar', PUBLIC_CONTENT_UPDATED)}
  <noscript><p class="notice">التطبيق التفاعلي يحتاج JavaScript، لكن كل المعلومات أعلاه متاحة بدونه. <a href="${attr(en)}" lang="en" hreflang="en">English</a></p></noscript>
</div>`;
}

function landingMain(lang: PageLang): string {
  const copy = lang === 'ar' ? LANDING_AR : LANDING_EN;
  const links = lang === 'ar'
    ? [
        ['/how-it-works', 'كيف يعمل'],
        ['/who-its-for', 'لمن يناسب'],
        ['/compare', 'مقارنة'],
        ['/use-cases/moving-to-germany', 'الانتقال إلى ألمانيا'],
        ['/faq', 'الأسئلة الشائعة'],
        ['/pricing', 'السعر'],
        ['/about', 'عن Katzu'],
      ]
    : [
        ['/en/how-it-works', 'How it works'],
        ['/en/who-its-for', 'Who it is for'],
        ['/en/compare', 'Compare'],
        ['/en/use-cases/moving-to-germany', 'Moving to Germany'],
        ['/en/faq', 'FAQ'],
        ['/en/pricing', 'Pricing'],
        ['/en/about', 'About Katzu'],
      ];
  const ctaDemo = lang === 'ar' ? 'جرّب درساً بدون حساب' : 'Try a lesson without an account';
  const ctaStart = lang === 'ar' ? 'ابدأ مجاناً' : 'Start free';
  const ctaPrice = lang === 'ar' ? 'شاهد المجاني وPro' : 'See free and Pro';
  return `<p class="kicker">${lang === 'ar' ? 'عربي أولاً · ألمانية الحياة اليومية' : 'Arabic-first · German for real life'}</p>
  <h1>${copy.h1}</h1>
  <p class="lede">${copy.intro}</p>
  <div class="actions">
    <a class="btn btn-primary" href="/demo">${ctaDemo}</a>
    <a class="btn btn-ghost" href="/welcome">${ctaStart}</a>
    <a class="btn btn-ghost" href="${lang === 'ar' ? '/en' : '/'}" hreflang="${lang === 'ar' ? 'en' : 'ar'}" lang="${lang === 'ar' ? 'en' : 'ar'}">${lang === 'ar' ? 'English' : 'العربية'}</a>
  </div>
  <ul class="facts">${copy.facts.map((fact) => `<li>${fact}</li>`).join('')}</ul>
  <nav class="landing-links" aria-label="${lang === 'ar' ? 'صفحات المنتج' : 'Product pages'}">
    ${links.map(([path, label]) => `<a href="${path}">${label}</a>`).join('')}
    <a href="${lang === 'ar' ? '/pricing' : '/en/pricing'}">${ctaPrice}</a>
    <a href="mailto:${SUPPORT_ADDRESS_AR}">${SUPPORT_ADDRESS_AR}</a>
  </nav>
  <p class="notice">${lang === 'ar' ? 'آخر تحديث' : 'Last updated'}: ${PUBLIC_CONTENT_UPDATED}</p>`;
}

function renderHeader(lang: PageLang, currentPath: string, altPath?: string): string {
  const isAr = lang === 'ar';
  const home = isAr ? '/' : '/en';
  const nav = (isAr ? AR_NAV : EN_NAV)
    .map(([path, label]) => `<a href="${path}"${path === currentPath ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('');
  const altLang: PageLang = isAr ? 'en' : 'ar';
  const altHref = altPath
    ? ' hreflang="' + altLang + '" lang="' + altLang + '"'
    : '';
  const alt = altPath
    ? `<a class="lang-switch" href="${altPath}"${altHref}>${isAr ? 'English' : 'العربية'}</a>`
    : '';
  return `<header class="site-header"><div class="site-bar">
    <a class="site-brand" href="${home}"><img src="/assets/mascot/katzu_icon_192.png" alt="Katzu" width="36" height="36" loading="eager" decoding="async" /><span>Katzu</span></a>
    <nav class="site-nav" aria-label="${isAr ? 'التنقل الرئيسي' : 'Main navigation'}">${nav}</nav>
    ${alt}
  </div></header>`;
}

function renderFooter(lang: PageLang, updated: string): string {
  const isAr = lang === 'ar';
  const trust = isAr ? AR_TRUST : EN_TRUST;
  return `<footer class="site-footer"><div class="site-wrap">
    <p><strong>Katzu</strong> — ${isAr ? 'تدريب محادثة الألمانية للناطقين بالعربية.' : 'German conversation practice for Arabic speakers.'}</p>
    <nav class="footer-links" aria-label="${isAr ? 'روابط الثقة' : 'Trust links'}">
      ${trust.map(([path, label]) => `<a href="${path}"${!isAr ? ' hreflang="ar" lang="ar"' : ''}>${label}</a>`).join('')}
      <a href="${isAr ? '/about' : '/en/about'}">${isAr ? 'عن Katzu' : 'About'}</a>
      <a href="mailto:${SUPPORT_ADDRESS_AR}">${SUPPORT_ADDRESS_AR}</a>
    </nav>
    <p>${isAr ? 'آخر تحديث' : 'Last updated'}: ${updated} · ${isAr ? 'النسخة العربية هي المرجع' : 'The Arabic version is authoritative'}.</p>
  </div></footer>`;
}

function breadcrumbItems(page: PublicPage, base: string): Array<{ name: string; url: string }> {
  const isAr = page.lang === 'ar';
  const homeName = isAr ? 'الرئيسية' : 'Home';
  const homePath = isAr ? '/' : '/en';
  const home = { name: homeName, url: absolute(base, homePath) };
  if (page.path === homePath) return [home];
  return [home, { name: page.h1, url: absolute(base, page.path) }];
}

function structuredGraph(page: PublicPage, origin: string, includeWebsite: boolean): Record<string, unknown> {
  const base = normalizeOrigin(origin);
  const canonical = absolute(base, page.path);
  const home = absolute(base, page.lang === 'ar' ? '/' : '/en');
  const orgId = `${base}/#organization`;
  const websiteId = `${base}/#website`;
  const softwareId = `${base}/#software`;
  const pageId = `${canonical}#webpage`;
  const breadcrumbId = `${canonical}#breadcrumb`;
  const logo = absolute(base, '/assets/mascot/katzu_icon_192.png');
  const items = breadcrumbItems(page, base);
  const isAr = page.lang === 'ar';

  const org = {
    '@type': 'Organization',
    '@id': orgId,
    name: 'Katzu',
    url: base || home,
    logo: { '@type': 'ImageObject', url: logo },
    founder: { '@type': 'Person', name: 'Ghaidak Alloush', url: 'https://ghaidak.com' },
    sameAs: ['https://ghaidak.com'],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: SUPPORT_ADDRESS_AR,
      availableLanguage: ['Arabic', 'English'],
      url: absolute(base, '/trust/contact'),
    },
  };

  const website = {
    '@type': 'WebSite',
    '@id': websiteId,
    name: 'Katzu',
    url: base || home,
    inLanguage: ['ar', 'en'],
    publisher: { '@id': orgId },
  };

  const software = {
    '@type': 'SoftwareApplication',
    '@id': softwareId,
    name: 'Katzu',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any (web browser)',
    url: base || home,
    inLanguage: ['ar', 'en'],
    description: isAr ? LANDING_AR.description : LANDING_EN.description,
    publisher: { '@id': orgId },
  };

  const webPage = {
    '@type': 'WebPage',
    '@id': pageId,
    name: page.title,
    description: page.description,
    url: canonical,
    inLanguage: page.lang,
    dateModified: page.updated,
    // The SPA index carries a minimal standalone WebSite block; the entity
    // graph it adds must not point at an @id that block does not define.
    ...(includeWebsite ? { isPartOf: { '@id': websiteId } } : {}),
    about: { '@id': softwareId },
    breadcrumb: { '@id': breadcrumbId },
  };

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': breadcrumbId,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  const graph: Record<string, unknown>[] = [org, website, software, webPage, breadcrumb];
  if (page.faq) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${canonical}#faq`,
      name: isAr ? `أسئلة شائعة — ${page.h1}` : `FAQ — ${page.h1}`,
      inLanguage: page.lang,
      mainEntity: page.faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': includeWebsite ? graph : graph.filter((node) => node['@type'] !== 'WebSite'),
  };
}

/** Adds hreflang for the SPA's Arabic landing page. */
export function withHreflang(html: string, origin: string): string {
  const base = normalizeOrigin(origin);
  if (!base || /hreflang=["']ar["']/i.test(html)) return html;
  const tags = [
    `<link rel="alternate" hreflang="ar" href="${attr(base)}/" />`,
    `<link rel="alternate" hreflang="en" href="${attr(base)}/en" />`,
    `<link rel="alternate" hreflang="x-default" href="${attr(base)}/" />`,
  ].join('\n    ');
  return html.replace('</head>', `    ${tags}\n  </head>`);
}

/** Adds Organization, SoftwareApplication, WebPage and BreadcrumbList to the SPA index. */
export function withEntityStructuredData(html: string, origin: string): string {
  const base = normalizeOrigin(origin);
  if (!base || /id=["']katzu-entity-jsonld["']/i.test(html)) return html;
  const page: PublicPage = {
    id: 'landing-ar',
    lang: 'ar',
    path: '/',
    title: LANDING_AR.title,
    description: LANDING_AR.description,
    h1: LANDING_AR.h1,
    updated: PUBLIC_CONTENT_UPDATED,
    body: '',
    alternates: { ar: '/', en: '/en' },
  };
  const graph = structuredGraph(page, base, false);
  return html.replace(
    '</head>',
    `    <script type="application/ld+json" id="katzu-entity-jsonld">${jsonForScript(graph)}</script>\n  </head>`,
  );
}

export function sitemapXml(origin: string): string {
  const base = normalizeOrigin(origin);
  const routes: SitemapRoute[] = [
    { path: '/', updated: PUBLIC_CONTENT_UPDATED, alternates: { ar: '/', en: '/en' } },
    { path: '/en', updated: PUBLIC_CONTENT_UPDATED, alternates: { ar: '/', en: '/en' } },
  ];
  for (const def of CONTENT_DEFS) {
    routes.push({
      path: def.pathAr,
      updated: def.updated,
      alternates: def.pathEn ? { ar: def.pathAr, en: def.pathEn } : { ar: def.pathAr },
    });
    if (def.pathEn) {
      routes.push({
        path: def.pathEn,
        updated: def.updated,
        alternates: { ar: def.pathAr, en: def.pathEn },
      });
    }
  }

  const urls = routes.map((route) => {
    const loc = absolute(base, route.path);
    const alternates: string[] = [];
    if (route.alternates.ar) {
      alternates.push(`    <xhtml:link rel="alternate" hreflang="ar" href="${attr(absolute(base, route.alternates.ar))}" />`);
    }
    if (route.alternates.en) {
      alternates.push(`    <xhtml:link rel="alternate" hreflang="en" href="${attr(absolute(base, route.alternates.en))}" />`);
    }
    const fallback = route.alternates.ar || route.alternates.en || route.path;
    alternates.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${attr(absolute(base, fallback))}" />`);
    return `  <url>\n    <loc>${attr(loc)}</loc>\n    <lastmod>${route.updated}</lastmod>\n${alternates.join('\n')}\n  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

export function robotsTxt(origin: string): string {
  const base = normalizeOrigin(origin);
  const sitemap = base ? `\nSitemap: ${base}/sitemap.xml\n` : '\n';
  return `# Katzu public crawler policy
# Search and answer engines: allowed.
User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

# Training crawlers: allowed by default, stated separately so the choice is visible.
# GPTBot — OpenAI training
User-agent: GPTBot
Allow: /

# ClaudeBot — Anthropic training
User-agent: ClaudeBot
Allow: /

# Google-Extended — Google AI training
User-agent: Google-Extended
Allow: /

# Applebot-Extended — Apple AI training
User-agent: Applebot-Extended
Allow: /

# Everything else: public pages are readable; private app routes are noindex via HTTP headers.
User-agent: *
Allow: /
${sitemap}`;
}

export function llmsTxt(origin: string): string {
  const base = normalizeOrigin(origin);
  const url = (path: string) => absolute(base, path);
  return `# Katzu

> Katzu is an Arabic-first German conversation-practice web app and installable PWA for Arabic speakers, covering A0–B2. Learners practise real-life German situations by voice or text and receive corrections in Arabic. A free tier opens A0–A1 with ${FREE_AI_SESSIONS} server-counted AI conversations; Pro is a one-off activation code with no automatic renewal.

## Product facts

- Audience: Arabic speakers preparing for, or recently arrived in, Germany.
- Target language: German. Interface language: Arabic-first, with English as a secondary translation field.
- Levels: A0–B2. Free: A0–A1. Pro: A2–B2.
- Core loop: choose a situation → study phrases/vocabulary → short quiz → speak or type → honest report, mistake bank and review.
- Published scenarios: embassy appointment, café order, job interview, doctor visit, apartment viewing.
- Platform: web app / PWA. No native Android build is published from this repository.
- Free tier: ${FREE_AI_SESSIONS} server-counted AI conversations, daily mission, review, placement test and mistake bank.
- Pro: one-off activation code, no automatic renewal; the current price is set by the server and shown in the app before purchase.
- Fair use: up to 120 AI requests per day.
- Not an official Goethe/telc product, no certificate, no legal/medical/immigration advice.
- Contact: ${SUPPORT_ADDRESS_AR}

## Pages

- [Landing (Arabic)](${url('/')}): what Katzu is, who it is for, levels and price model.
- [How it works](${url('/how-it-works')}): the study → quiz → conversation → review loop.
- [Who it is for](${url('/who-its-for')}): honest fit and non-fit.
- [Comparison](${url('/compare')}): flashcards, general courses, human tutors and exam prep.
- [Moving to Germany](${url('/use-cases/moving-to-germany')}): the five supported situations.
- [FAQ](${url('/faq')}): 13 real questions and answers.
- [Pricing](${url('/pricing')}): free tier, Pro and fair use.
- [About / contact](${url('/about')}): owner and support contact.
- [English landing](${url('/en')}): the same product facts in English.
- [English: how it works](${url('/en/how-it-works')}), [who it is for](${url('/en/who-its-for')}), [comparison](${url('/en/compare')}), [moving to Germany](${url('/en/use-cases/moving-to-germany')}), [FAQ](${url('/en/faq')}), [pricing](${url('/en/pricing')}), [about](${url('/en/about')}).
- [Privacy](${url('/trust/privacy')}), [Terms](${url('/trust/terms')}), [Refunds](${url('/trust/refund')}), [Imprint](${url('/trust/imprint')}), [Contact](${url('/trust/contact')}).

## Full facts

- [llms-full.txt](${url('/llms-full.txt')}): the complete public product brief.

Last updated: ${PUBLIC_CONTENT_UPDATED}
`;
}

export function llmsFullTxt(origin: string): string {
  const base = normalizeOrigin(origin);
  const url = (path: string) => absolute(base, path);
  return `# Katzu — full public product brief

Katzu is an Arabic-first German conversation-practice web app and installable PWA for Arabic speakers, covering CEFR levels A0–B2. Learners practise real situations that follow a move to Germany — an embassy appointment, a café order, a job interview, a doctor's visit and an apartment viewing — by voice or text, with corrections in Arabic and English as a secondary translation.

## Audience

Arabic speakers who are preparing to move to Germany or have recently arrived, and who need to speak in everyday situations rather than only recognise words. The app is useful from beginner level (A0) through upper-intermediate (B2). It is not a replacement for a lawyer, doctor, immigration adviser or human tutor.

## Languages and platform

- Interface: Arabic-first, RTL.
- Target language: German.
- Secondary translation: English.
- Platform: web app and installable PWA in the browser.
- Native Android: not published from this repository; the historical native build lives in a separate repository.

## Levels and entitlement

- The app covers A0–B2.
- The free tier opens A0–A1 and includes ${FREE_AI_SESSIONS} server-counted AI conversations.
- Pro unlocks A2–B2 and removes the conversation-session cap.
- Review, the mistake bank and vocabulary are not level-gated and are not taken away without a subscription.
- Fair use: up to ${FAIR_USE_AI_PER_DAY} AI requests per day, stated before the learner reaches it.

## Core loop

1. Choose a situation.
2. Study the phrases, vocabulary and grammar support.
3. Take a short quiz.
4. Hold a live conversation with the AI persona by voice or text. The microphone is optional.
5. Receive an honest report, a mistake bank and review cards.
6. Keep a daily mission and spaced review habit.

The report does not claim mastery from a hint, a translation view or one multiple-choice answer.

## Published scenarios

- Embassy appointment.
- Café order.
- Job interview.
- Doctor visit.
- Apartment viewing.

Other tracks mentioned in the product vision are not published yet and are not promised on the public site.

## Pricing model

- Free tier: no payment, A0–A1, ${FREE_AI_SESSIONS} AI conversations, daily mission, review, placement test and mistake bank.
- Pro: a one-off activation code, not an auto-renewing subscription. It is redeemed inside the app; no card is stored in the app.
- The app shows the server's current price in EUR before purchase. The separate official sales page shows the current offer.
- Refund policy: not published yet. The public refund page says so and asks the learner to contact support before paying.

## What Katzu is not

- Not an official Goethe, telc or DTZ course.
- Does not issue a certificate, official score, visa or work contract.
- Does not guarantee an exam pass or a job offer.
- Does not provide legal, medical or immigration advice.
- Full A1/A2 exam formats are not published yet; B1-style mock practice exists.
- No ratings, reviews, testimonials, user counts or awards are published, because they have not been collected and cannot be proved.

## Privacy and data

- Sign-in uses a Google account: email and account identifier. The app does not see or store the password.
- Conversation messages and translations are sent to an AI provider only when the learner uses the conversation.
- Data is not sold or used for advertising.
- The learner can export data or delete the account from Settings.
- The full data-processing list is generated from the app's own analytics and table constants on the privacy page.

## Contact

- Support: ${SUPPORT_ADDRESS_AR}
- Owner: Ghaidak Alloush — https://ghaidak.com
- Privacy and terms pages are published in Arabic; the Arabic version is authoritative.

## Public pages

- ${url('/')} — Arabic landing.
- ${url('/how-it-works')} — how the practice loop works.
- ${url('/who-its-for')} — who it fits and who it does not.
- ${url('/compare')} — honest comparison with alternatives.
- ${url('/use-cases/moving-to-germany')} — supported situations for a move.
- ${url('/faq')} — 13 questions with short answers.
- ${url('/pricing')} — free tier, Pro and fair use.
- ${url('/about')} — owner and support contact.
- ${url('/en')} — English landing.
- ${url('/en/how-it-works')} — English how-it-works.
- ${url('/en/who-its-for')} — English fit page.
- ${url('/en/compare')} — English comparison.
- ${url('/en/use-cases/moving-to-germany')} — English use case.
- ${url('/en/faq')} — English FAQ.
- ${url('/en/pricing')} — English pricing.
- ${url('/en/about')} — English about.
- ${url('/trust/privacy')} — privacy and data.
- ${url('/trust/terms')} — terms of use.
- ${url('/trust/refund')} — refund status.
- ${url('/trust/imprint')} — publisher details.
- ${url('/trust/contact')} — contact.

Last updated: ${PUBLIC_CONTENT_UPDATED}
`;
}

export function notFoundHtml(origin: string): string {
  const base = normalizeOrigin(origin);
  const page: PublicPage = {
    id: '404',
    lang: 'ar',
    path: '/404.html',
    title: 'الصفحة غير موجودة — Katzu',
    description: 'الصفحة التي طلبتها غير موجودة. عد إلى الصفحة الرئيسية أو ابحث في صفحات المنتج.',
    h1: 'الصفحة غير موجودة',
    updated: PUBLIC_CONTENT_UPDATED,
    body: `<p class="lead">الرابط الذي طلبته غير موجود أو تم تغييره. يمكنك العودة إلى الصفحة الرئيسية أو اختيار صفحة من الأسفل.</p>
      <p><a class="btn btn-primary" href="/">العودة إلى الرئيسية</a> <a class="btn btn-ghost" href="/faq">الأسئلة الشائعة</a></p>
      <div class="callout"><h2>صفحات مفيدة</h2><ul class="link-list">
        <li><a href="/how-it-works">كيف يعمل Katzu</a></li>
        <li><a href="/pricing">المجاني وPro</a></li>
        <li><a href="/about">عن Katzu والتواصل</a></li>
        <li><a href="/en">English</a></li>
      </ul></div>`,
    alternates: {},
    noindex: true,
  };
  return renderPublicPage(page, base);
}

export function buildPublicArtifacts(origin: string): Record<string, string> {
  const artifacts: Record<string, string> = {};
  for (const page of buildPublicPages(origin)) {
    artifacts[fileForPath(page.path)] = renderPublicPage(page, origin);
  }
  artifacts['404.html'] = notFoundHtml(origin);
  artifacts['robots.txt'] = robotsTxt(origin);
  artifacts['sitemap.xml'] = sitemapXml(origin);
  artifacts['llms.txt'] = llmsTxt(origin);
  artifacts['llms-full.txt'] = llmsFullTxt(origin);
  return artifacts;
}

/** Kept for tests and for a caller that wants the FAQ data without the page list. */
export { FAQ_AR, FAQ_EN };
