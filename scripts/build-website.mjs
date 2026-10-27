#!/usr/bin/env node
/**
 * Build the static pages of https://website.katzuai.com into `website/`.
 *
 *   node scripts/build-website.mjs
 *
 * WHAT IT REPLACES
 * The app used to prerender its own marketing pages (`src/lib/seo/publicPages.ts`,
 * deleted). Those pages — the seven Arabic topics, their English twins, the /en
 * landing and the five trust pages — now live on the separate site, rendered in
 * the landing's own design (shared `website/assets/site.css`).
 *
 * SOURCES OF TRUTH
 *   - topic copy:        scripts/site-content.mjs (updated to the landing's facts)
 *   - trust copy:        src/lib/trust/content.ts (bundled here with esbuild, so
 *                        the legal text stays one file and `npm run check:launch`
 *                        still gates it)
 *   - design:            website/assets/site.css
 *
 * It never touches `website/index.html` — the animated landing is hand-maintained.
 * Emits robots.txt, sitemap.xml and a branded 404.html as well.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

import {
  SITE,
  APP,
  START,
  UPDATED,
  SUPPORT,
  NAV_AR,
  NAV_EN,
  FOOTER_AR,
  FOOTER_EN,
  TRUST_META,
  FAQ_AR,
  FAQ_EN,
  AR_PAGES,
} from './site-content.mjs';
import { EN_PAGES, EN_HOME } from './site-content.en.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'website');

/* ------------------------------------------------------------------ */
/* Trust content: bundle the TS module once and import the result.     */
/* ------------------------------------------------------------------ */

async function loadTrustContent() {
  const outfile = join(root, 'node_modules', '.cache', `katzu-trust-${process.pid}.mjs`);
  mkdirSync(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [join(root, 'src', 'lib', 'trust', 'content.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
  });
  const mod = await import(pathToFileURL(outfile).href);
  if (!mod?.TRUST_CONTENT) throw new Error('trust content failed to load');
  return mod;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const esc = (v) =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const plain = (html) => String(html).replace(/<[^>]+>/g, '');

function fileForPath(path) {
  if (path === '/en') return 'en.html';
  if (path === '/') return 'index.html';
  return `${path.replace(/^\/+/, '').replace(/\/+$/, '')}.html`;
}

/** The English twin of an Arabic path (and vice versa), for hreflang. */
function alternate(lang, path) {
  if (lang === 'ar' && path === '/') return `${SITE}/en`;
  if (lang === 'ar') return `${SITE}/en${path}`;
  if (path === '/en') return `${SITE}/`;
  return `${SITE}${path.replace(/^\/en/, '') || '/'}`;
}

const NAV = { ar: NAV_AR, en: NAV_EN };
const FOOTER = { ar: FOOTER_AR, en: FOOTER_EN };

function navHtml(lang, current) {
  const links = NAV[lang]
    .map(([href, label]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('');
  const home = lang === 'ar' ? '/' : '/en';
  const cta = lang === 'ar' ? 'ابدأ مجاناً' : 'Start free';
  return `<nav id="nav" aria-label="${lang === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'}"><a class="brand" href="${home}"><img src="/assets/logo/logo-64.png" alt="" width="30" height="30">${lang === 'ar' ? 'كاتزو' : 'Katzu'}</a><div class="nl">${links}</div><a class="btn sm" href="${START}">${cta}</a></nav>`;
}

function footerHtml(lang) {
  const links = FOOTER[lang]
    .map(([href, label], i) => {
      const langAttr = label === 'English' ? ' hreflang="en" lang="en"' : label === 'العربية' ? ' hreflang="ar" lang="ar"' : '';
      return `<a href="${href}"${langAttr}>${label}</a>`;
    })
    .join('');
  return `<footer><span>© 2026 ${lang === 'ar' ? 'كاتزو' : 'Katzu'}</span><nav class="fnav" aria-label="${lang === 'ar' ? 'روابط الموقع' : 'Site links'}">${links}</nav></footer>`;
}

/** The bottom call-to-action every content page ends with. */
function endCtaHtml(lang) {
  const h2 = lang === 'ar' ? 'قل جملتك الأولى بالألمانية اليوم.' : 'Say your first German sentence today.';
  const btn = lang === 'ar' ? 'ابدأ مجاناً' : 'Start free';
  const micro = lang === 'ar' ? '3 دروس مجانية كل شهر · بلا بطاقة بنكية' : '3 free lessons every month · no bank card';
  return `<section class="page-cta"><div class="wrap"><h2 class="reveal">${h2}</h2><a class="btn big mag reveal" href="${START}">${btn}</a><p class="micro reveal" style="margin-top:18px">${micro}</p></div></section>`;
}

/**
 * The page shell: head (canonical/og/hreflang/JSON-LD), nav, content, footer,
 * and the one small script every generated page shares (reveal-on-scroll +
 * coupon copy + toast). No GSAP/Lenis on content pages — they are static text.
 */
function renderPage(page) {
  const { path, lang, title, description, h1, lead, body, faq, jsonld = [], alternates = true } = page;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const alt = alternate(lang, path);
  const faqItems = faq === 'ar' ? FAQ_AR : faq === 'en' ? FAQ_EN : null;

  const faqDetails = faqItems
    ? `<div class="wrap faq-block" style="margin-bottom:8px">${faqItems
        .map(
          (item) =>
            `<details class="reveal"><summary>${esc(item.q)}</summary><p>${item.a}</p></details>`,
        )
        .join('')}</div>`
    : '';

  const faqJsonld = faqItems
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqItems.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: plain(item.a) },
        })),
      }
    : null;

  const webPageJsonld = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: `${SITE}${path}`,
    inLanguage: lang,
  };

  const ld = [webPageJsonld, ...(faqJsonld ? [faqJsonld] : []), ...jsonld]
    .map((j) => `  <script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/assets/logo/logo-512.png">
<link rel="canonical" href="${SITE}${path}">
${alternates ? `<link rel="alternate" hreflang="${lang}" href="${SITE}${path}">
<link rel="alternate" hreflang="${lang === 'ar' ? 'en' : 'ar'}" href="${alt}">` : ''}
<meta name="theme-color" content="#000">
<link rel="icon" href="/assets/logo/favicon.ico" sizes="any"><link rel="icon" href="/assets/logo/favicon-32.png" type="image/png" sizes="32x32"><link rel="apple-touch-icon" href="/assets/logo/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;900&family=Syne:wght@700;800&display=swap">
<link rel="stylesheet" href="/assets/site.css">
${ld}
</head>
<body>
<div id="toast" role="status" aria-live="polite"></div>
<a class="skip" href="#main">${lang === 'ar' ? 'تخطَّ إلى المحتوى' : 'Skip to content'}</a>
${navHtml(lang, path)}
<main id="main" class="page">
<section class="page-hero"><div class="wrap">
  <h1 class="h1 reveal">${h1}</h1>
  <p class="lead reveal">${lead}</p>
</div></section>
${faqDetails}
${body}
${endCtaHtml(lang)}
</main>
${footerHtml(lang)}
<script>
document.documentElement.classList.add('js');
addEventListener('DOMContentLoaded',()=>{
  const io=new IntersectionObserver((es)=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
  const toast=(m)=>{const t=document.getElementById('toast');if(!t)return;t.textContent=m;t.style.opacity='1';setTimeout(()=>{t.style.opacity='0'},1900)};
  addEventListener('click',(e)=>{const b=e.target.closest('[data-copy]');if(b){navigator.clipboard?.writeText(b.dataset.copy).catch(()=>{});toast(${JSON.stringify(lang === 'ar' ? 'تم نسخ الكوبون ✓' : 'Coupon copied ✓')})}});
});
</script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* Trust pages, from src/lib/trust/content.ts                          */
/* ------------------------------------------------------------------ */

const PENDING_AR = 'لم يُنشر هذا البند بعد. لم نكتب هنا وعداً لا نستطيع الوفاء به، ويمكنك سؤال الدعم قبل الدفع.';

function trustBodyHtml(pageId, content, OWNER_FILL, SUPPORT_ADDRESS_AR) {
  const sections = content.sections
    .map((section) => {
      let body = section.bodyAr;
      if (body.includes(OWNER_FILL)) {
        body =
          pageId === 'contact' && section.id === 'how'
            ? `راسلنا على ${SUPPORT_ADDRESS_AR}.`
            : PENDING_AR;
      }
      return `<section class="prose-block reveal" id="${section.id}"><h2>${esc(section.headingAr)}</h2><p>${esc(body)}</p></section>`;
    })
    .join('\n');

  const pending = content.sections.filter(
    (s) => s.bodyAr.includes(OWNER_FILL) && !(pageId === 'contact' && s.id === 'how'),
  ).length;
  const notice = pending
    ? `<p class="notice">هذه الصفحة غير مكتملة بعد: ${pending} بنود تنتظر استكمال الناشر. لن نكتب وعداً لا نستطيع الوفاء به.</p>`
    : '';

  return `<div class="wrap prose">
  <p class="lead reveal">${esc(content.updatedAr)} · الصفحة الرسمية بالعربية، والنسخة العربية هي المرجع.</p>
  ${notice}
  ${sections}
  <p class="notice reveal">للتواصل: <a href="mailto:${SUPPORT_ADDRESS_AR}">${SUPPORT_ADDRESS_AR}</a></p>
</div>`;
}

/* ------------------------------------------------------------------ */
/* robots / sitemap / 404                                              */
/* ------------------------------------------------------------------ */

function robotsTxt(paths) {
  return [
    'User-agent: *',
    'Allow:/',
    '',
    `Sitemap: ${SITE}/sitemap.xml`,
    '',
  ].join('\n');
}

function sitemapXml(allPages) {
  const urls = allPages
    .map((p) => {
      const alt = p.path === '/' ? `${SITE}/en` : p.lang === 'ar' ? `${SITE}/en${p.path}` : `${SITE}${p.path.replace(/^\/en/, '')}`;
      const hasPair = p.path === '/' || p.path === '/en' || p.alternates !== false;
      const xhtml = hasPair
        ? `\n    <xhtml:link rel="alternate" hreflang="${p.lang}" href="${SITE}${p.path}"/>` +
          `\n    <xhtml:link rel="alternate" hreflang="${p.lang === 'ar' ? 'en' : 'ar'}" href="${alt}"/>`
        : '';
      return `  <url>\n    <loc>${SITE}${p.path}</loc>\n    <lastmod>${UPDATED}</lastmod>${xhtml}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

function notFoundHtml() {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>الصفحة غير موجودة · كاتزو</title>
<link rel="icon" href="/assets/logo/favicon.ico" sizes="any">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;900&display=swap">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<nav id="nav" aria-label="التنقل الرئيسي"><a class="brand" href="/"><img src="/assets/logo/logo-64.png" alt="" width="30" height="30">كاتزو</a></nav>
<main id="main" class="page">
<section class="page-hero"><div class="wrap">
  <h1 class="h1">الصفحة غير موجودة</h1>
  <p class="lead">ربما تغيّر الرابط. عد إلى الصفحة الرئيسية، أو ابدأ التدريب مجاناً في التطبيق.</p>
  <p style="margin-top:26px"><a class="btn" href="/">الصفحة الرئيسية</a> <a class="btn gh" href="${START}">ابدأ مجاناً</a></p>
</div></section>
</main>
${footerHtml('ar')}
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* Emit                                                                */
/* ------------------------------------------------------------------ */

function emit(rel, content) {
  const file = join(outDir, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return rel;
}

async function main() {
  const { TRUST_CONTENT, OWNER_FILL, SUPPORT_ADDRESS_AR } = await loadTrustContent();

  const written = [];

  // The EN landing (generated; the AR landing is the hand-written index.html).
  const enHome = { ...EN_HOME, lang: 'en' };
  written.push(emit(fileForPath(enHome.path), renderPage(enHome)));

  // Topic pages.
  for (const p of AR_PAGES) written.push(emit(fileForPath(p.path), renderPage({ ...p, lang: 'ar' })));
  for (const p of EN_PAGES) written.push(emit(fileForPath(p.path), renderPage({ ...p, lang: 'en' })));

  // Trust pages (Arabic only, same as before).
  for (const [pageId, meta] of Object.entries(TRUST_META)) {
    const content = TRUST_CONTENT[pageId];
    if (!content) throw new Error(`missing trust content: ${pageId}`);
    const path = `/trust/${pageId}`;
    written.push(
      emit(
        fileForPath(path),
        renderPage({
          path,
          lang: 'ar',
          title: meta.ar.title,
          description: meta.ar.description,
          h1: content.titleAr,
          lead: `${content.updatedAr} · الصفحة الرسمية بالعربية.`,
          body: trustBodyHtml(pageId, content, OWNER_FILL, SUPPORT_ADDRESS_AR),
          alternates: false,
        }),
      ),
    );
  }

  // robots + sitemap + 404.
  const allPages = [
    { path: '/', lang: 'ar' },
    ...AR_PAGES.map((p) => ({ path: p.path, lang: 'ar' })),
    ...Object.keys(TRUST_META).map((id) => ({ path: `/trust/${id}`, lang: 'ar', alternates: false })),
    { path: '/en', lang: 'en' },
    ...EN_PAGES.map((p) => ({ path: p.path, lang: 'en' })),
  ];
  written.push(emit('robots.txt', robotsTxt(allPages)));
  written.push(emit('sitemap.xml', sitemapXml(allPages)));
  written.push(emit('404.html', notFoundHtml()));

  // Sanity: never leave a stale marketing URL behind in generated output.
  const writtenPaths = new Set(allPages.map((p) => p.path));
  for (const rel of written) {
    if (!rel.endsWith('.html')) continue;
    const text = readFileSync(join(outDir, rel), 'utf8');
    if (text.includes('katzuai.com/demo')) throw new Error(`${rel} still links to the removed /demo`);
    // An hreflang alternate is an SEO promise that the target exists. The trust
    // pages are Arabic-only, so advertising `/en/trust/:id` pointed crawlers at
    // a 404; every alternate must name a page this build actually writes.
    for (const m of text.matchAll(/hreflang="[^"]+" href="https:\/\/website\.katzuai\.com([^"]*)"/g)) {
      if (!writtenPaths.has(m[1] || '/')) throw new Error(`${rel} advertises a missing alternate: ${m[1]}`);
    }
  }
  if (!existsSync(join(outDir, 'index.html'))) throw new Error('website/index.html disappeared');

  console.log(`site: wrote ${written.length} files into website/`);
  for (const rel of written) console.log(`  ${rel}`);
}

main().catch((error) => {
  console.error('[build-website]', error);
  process.exit(1);
});
