#!/usr/bin/env node
/**
 * Build https://website.katzuai.com into `website/`.
 *
 *   node scripts/build-website.mjs
 *
 * THE SITE IS FOUR PAGES
 *   /          HOME      the supplied design, page for page: hero, the two
 *                        pinned scenes, the app conversation, the situations
 *                        rail, the error timeline, the results, the price line,
 *                        the FAQ, the closing scene.
 *   /pricing   PRICING   free card + four founding plans, the rules once, #pay
 *   /help      HELP      short FAQ answers that link, then privacy/terms/refund
 *                        and one contact address
 *   /affiliate PARTNERS  rate, three steps with one worked example, the rules
 *                        once, who it is for, and one mailto application
 *
 * ONE SOURCE OF TRUTH PER PAGE
 *   /               scripts/templates/home.html — the design file with only the
 *                   allowed edits (nav/footer links, CTA target, the retired
 *                   coupon block, prices, facts). Tokens are filled here.
 *   /pricing /help /affiliate
 *                   scripts/site-content.mjs (copy) + scripts/site-pricing.mjs
 *                   (prices from pricing.config.json); the partner numbers are
 *                   read from cloudflare-affiliate.js, the module that pays them.
 *   all pages       website/assets/site.css — Part 1 is the design's own CSS.
 *
 * Nothing else is generated: the old topic pages, the English twins and the
 * five trust pages are deleted by this build and answered with a 301 from
 * `website/_redirects`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

import {
  SITE,
  START,
  SUPPORT,
  UPDATED,
  CTA_LABEL,
  NAV_LINKS,
  FOOTER_LINKS,
  REFUND_DAYS,
  ACTIVATION_HOURS,
  FREE_LESSONS_PER_MONTH,
  PRICING,
  PLAN_ORDER_MAILTO,
  helpPage,
} from './site-content.mjs';
import {
  REF_SCRIPT,
  affiliateCaptureScript,
  affiliatePage,
  loadAffiliateConfig,
} from './site-content-affiliate.mjs';
import { AI_REF_SCRIPT, aiReferrerScript } from './site-referrer.mjs';
import { emit as emitFile, pruneStaleHtml, redirectsTxt } from './site-files.mjs';
import { pageMarkdown } from './site-markdown.mjs';
import { WORKER } from './site-pricing.mjs';
import {
  INDEXNOW_KEY_FILE,
  indexNowKeyFile,
  llmsTxt,
  robotsTxt as siteRobotsTxt,
  sitemapXml as siteSitemapXml,
} from './site-seo.mjs';
import { GUIDES, guideArticlePage, guideIndexPage } from './guides/index.mjs';
import {
  breadcrumbJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
  webSiteJsonLd,
} from './site-schema.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'website');
const homeTemplate = join(root, 'scripts', 'templates', 'home.html');

/* ------------------------------------------------------------------ */
/* Legal text: bundle the TS module once and import the result.        */
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

const esc = (v) =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const attr = (v) => esc(v).replace(/'/g, '&#39;');

/* ------------------------------------------------------------------ */
/* Shell — the design's nav, footer and cursor, shared by all pages    */
/* ------------------------------------------------------------------ */

function navHtml(current) {
  const links = NAV_LINKS.map(
    ([href, label]) =>
      `<a href="${href}"${href === current ? ' class="act" aria-current="page"' : ''}>${label}</a>`,
  ).join('');
  return `<nav id="nav" aria-label="التنقل الرئيسي"><a class="brand" href="/"><img src="/assets/logo/logo-64.png" alt="" width="30" height="30">كاتزو</a><div class="nl">${links}</div><a class="btn sm" href="${START}" data-cur="ابدأ">${CTA_LABEL}</a><i class="pg"></i></nav>`;
}

/** Exactly the footer printed in scripts/templates/home.html. */
function footerHtml() {
  const links = FOOTER_LINKS.map(([href, label]) => `<a href="${href}">${label}</a>`).join('\n  ');
  return `<footer>
  ${links}
  <a href="mailto:${SUPPORT}">تواصل معنا</a>
  <span>© 2026 كاتزو</span>
</footer>`;
}

/** Subpage background: the same still the home video opens on. */
function backgroundHtml() {
  return `<div class="bgimg" aria-hidden="true"></div>
<div class="grain"></div>`;
}

/**
 * The plan picker. Only `/pricing` gets it: it marks the chosen card and rewrites
 * the one order button's mailto from the same table the cards were built from.
 * A href swap cannot disagree with a price, because there is no second copy.
 */
function pricingPickerScript() {
  const map = JSON.stringify(PLAN_ORDER_MAILTO).replace(/</g, '\\u003c');
  return `<script>
(() => {
  const order = ${map};
  const cta = document.querySelector('[data-pay-cta]');
  const picks = [...document.querySelectorAll('[data-pick]')];
  const pick = (id) => {
    picks.forEach((b) => {
      const on = b.dataset.pick === id;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.closest('.plan')?.classList.toggle('sel', on);
    });
    if (cta && order[id]) cta.setAttribute('href', order[id]);
  };
  picks.forEach((b) =>
    b.addEventListener('click', () => {
      pick(b.dataset.pick);
      document.getElementById('pay')?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    }),
  );
})();
</script>`;
}

/* ------------------------------------------------------------------ */
/* / — the design template, with its numbers filled from config        */
/* ------------------------------------------------------------------ */

/** One `<script type="application/ld+json">` per object, `<` escaped. */
function jsonLdScripts(items) {
  return items
    .map((j) => `  <script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`)
    .join('\n');
}

/**
 * `hreflang` for an Arabic-only site: it points at itself in Arabic and is the
 * default for every other language. The pages are not translated, so claiming a
 * German alternate would be a lie; this pair is the honest statement.
 */
function hreflangLinks(path) {
  return [
    `  <link rel="alternate" hreflang="ar" href="${SITE}${path}">`,
    `  <link rel="alternate" hreflang="x-default" href="${SITE}${path}">`,
  ].join('\n');
}

function renderHome() {
  let html = readFileSync(homeTemplate, 'utf8');
  const tokens = {
    SITE,
    START,
    REFUND_DAYS,
    ACTIVATION_HOURS,
    FREE_LESSONS: FREE_LESSONS_PER_MONTH,
  };
  for (const [name, value] of Object.entries(tokens)) {
    html = html.split(`{{${name}}}`).join(String(value));
  }
  if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error('home: a template token was not filled');

  // The design file is untouched; the head gains the site's structured data and
  // its language declaration, which no crawler can infer from the text alone.
  const head = `${jsonLdScripts([
    organizationJsonLd(),
    webSiteJsonLd(),
    softwareApplicationJsonLd(),
  ])}\n${hreflangLinks('/')}\n</head>`;
  if (!html.includes('</head>')) throw new Error('home: the template has no </head>');
  html = html.replace('</head>', head);
  return html;
}

/* ------------------------------------------------------------------ */
/* /pricing and /help — the same shell, a page head, then the body     */
/* ------------------------------------------------------------------ */

function renderPage(page) {
  const { path, title, description, h1, lead, eye, body, jsonld = [], anchorNav } = page;
  const slug = path.replace(/^\//, '');
  const bodyClass = page.bodyClass || `page-${slug}`;
  const extraScript = page.script || (path === '/pricing' ? pricingPickerScript() : '');
  const anchors = anchorNav
    ? `<nav class="anchors" aria-label="أقسام المساعدة">${anchorNav
        .map(([href, label]) => `<a href="${href}">${label}</a>`)
        .join('')}</nav>`
    : '';

  const webPageJsonld = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: `${SITE}${path}`,
    inLanguage: 'ar',
  };
  // Every page carries one BreadcrumbList: a guide builds its own (Home > Guides >
  // article), every other page gets Home > itself here. The home page is one
  // level, so it is the path, not a trail — a single-item list says nothing.
  const hasBreadcrumb = jsonld.some((item) => item && item['@type'] === 'BreadcrumbList');
  const crumbs = hasBreadcrumb
    ? []
    : [breadcrumbJsonLd([['/', 'الرئيسية'], [path, title]])];
  const ld = jsonLdScripts([webPageJsonld, ...crumbs, ...jsonld]);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/assets/logo/logo-512.png">
<meta property="og:locale" content="ar">
<meta name="theme-color" content="#000">
<link rel="canonical" href="${SITE}${path}">
${hreflangLinks(path)}
<link rel="icon" href="/assets/logo/favicon.ico" sizes="any">
<link rel="icon" href="/assets/logo/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/logo/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;900&family=Syne:wght@700;800&display=swap">
<link rel="stylesheet" href="/assets/site.css">
${ld}
</head>
<body class="${bodyClass}">
${backgroundHtml()}
<a class="skip" href="#main">تخطَّ إلى المحتوى</a>
${navHtml(path)}
<main id="main">
  <header class="phead">
    ${eye ? `<span class="eye reveal">${eye}</span>` : ''}
    <h1 class="reveal">${h1}</h1>
    <p class="lead reveal">${lead}</p>
  </header>
  ${anchors}
  ${body}
</main>
${footerHtml()}
${REF_SCRIPT}
${AI_REF_SCRIPT}
<script>
document.documentElement.classList.add('js');
addEventListener('DOMContentLoaded',()=>{
  const io=new IntersectionObserver((es)=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
});
</script>
${extraScript}
</body>
</html>
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
<meta name="theme-color" content="#000">
<link rel="icon" href="/assets/logo/favicon.ico" sizes="any">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;900&family=Syne:wght@700;800&display=swap">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body class="page-404">
${backgroundHtml()}
<a class="skip" href="#main">تخطَّ إلى المحتوى</a>
${navHtml('/')}
<main id="main">
  <header class="phead">
    <h1>الصفحة غير موجودة</h1>
    <p class="lead">ربما تغيّر الرابط. عد إلى الصفحة الرئيسية، أو اقرأ ما يفعله كاتزو أولاً.</p>
    <p class="lost-links"><a class="btn gh" href="/">الرئيسية</a> <a class="btn gh" href="/pricing">الأسعار</a></p>
  </header>
</main>
${footerHtml()}
${REF_SCRIPT}
${AI_REF_SCRIPT}
</body>
</html>
`;
}



function emit(rel, content) {
  return emitFile(outDir, rel, content);
}

function prune(keep) {
  return pruneStaleHtml(outDir, keep);
}

function legalHtml(pageId, content) {
  return content.sections
    .map(
      (section) => `<div class="legal-block" id="${pageId}-${section.id}">
  <h3>${esc(section.headingAr)}</h3>
${section.bodyAr
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => `  <p>${esc(line)}</p>`)
  .join('\n')}
</div>`,
    )
    .join('\n');
}

async function main() {
  const { TRUST_CONTENT, outstandingOwnerFields } = await loadTrustContent();

  const open = outstandingOwnerFields();
  if (open.length) {
    // The site must never print a raw token to a visitor. If an owner field is
    // added, this build stops until it is answered (the launch check lists it).
    throw new Error(
      `owner fields are still open: ${open.map((o) => `${o.page}/${o.section}`).join(', ')}`,
    );
  }

  const legal = {
    privacy: legalHtml('privacy', TRUST_CONTENT.privacy),
    terms: legalHtml('terms', TRUST_CONTENT.terms),
    refund: legalHtml('refund', TRUST_CONTENT.refund),
  };

  const pages = [
    PRICING,
    affiliatePage(await loadAffiliateConfig()),
    helpPage(legal),
    guideIndexPage(),
    ...GUIDES.map(guideArticlePage),
  ];
  for (const page of pages) {
    if (/\{\{[A-Z_]/.test(page.body)) throw new Error(`${page.path} still contains a placeholder`);
  }

  const home = renderHome();
  if (/\$\d/.test(home)) throw new Error('/ shows a price; prices belong on /pricing only');

  // `/guides` is `guides.html`; `/guides/<slug>` is a flat file inside `guides/`.
  // No directory index, so `/guides/a1-visa` never redirects to a trailing slash.
  const fileFor = (path) => (path === '/' ? 'index.html' : `${path.replace(/^\//, '')}.html`);

  const written = [];
  // One page, two flavours: the HTML a browser asks for and the markdown an
  // assistant asks for, both written here so neither can be newer than the
  // other. `md/` is not a second set of indexable URLs — the Function that
  // serves it marks it `noindex` and the canonical stays on the HTML page.
  const emitPage = (rel, html) => {
    written.push(emit(rel, html));
    const markdown = pageMarkdown(html);
    if (!markdown) throw new Error(`${rel} produced no markdown twin`);
    written.push(emit(`md/${rel.replace(/\.html$/, '.md')}`, markdown));
  };

  emitPage('index.html', home);
  for (const page of pages) {
    emitPage(fileFor(page.path), renderPage(page));
  }
  written.push(emit('robots.txt', siteRobotsTxt()));
  written.push(emit('sitemap.xml', siteSitemapXml()));
  written.push(emit('llms.txt', llmsTxt()));
  written.push(emit(INDEXNOW_KEY_FILE, indexNowKeyFile()));
  written.push(emit('_redirects', redirectsTxt()));
  written.push(emit('404.html', notFoundHtml()));
  // One partner-link reader for every page (home, text pages, guides, 404).
  written.push(emit('assets/ref.js', affiliateCaptureScript()));
  // One AI-referrer reader for every page: the only measurement of whether the
  // guides are being cited, and it stores nothing on the visitor's device.
  written.push(emit('assets/ai-ref.js', aiReferrerScript(WORKER)));

  const keep = new Set(written.filter((rel) => rel.endsWith('.html') || rel.endsWith('.md')));
  const removed = prune(keep);

  // Sanity: every page must agree on the nav, the footer and the CTA.
  for (const rel of written.filter((file) => file.endsWith('.html'))) {
    const text = readFileSync(join(outDir, rel), 'utf8');
    for (const label of ['الرئيسية', 'الأسعار', 'المساعدة', CTA_LABEL]) {
      if (!text.includes(label)) throw new Error(`${rel} is missing "${label}"`);
    }
    for (const href of ['/help#privacy', '/help#terms', '/help#refund', '/affiliate']) {
      if (!text.includes(href)) throw new Error(`${rel} is missing the footer link ${href}`);
    }
    if (text.includes('katzu-sales.pages.dev') || text.includes('KATZU26')) {
      throw new Error(`${rel} still points at the retired sales property or coupon`);
    }
    if (/\{\{[A-Z_]/.test(text)) throw new Error(`${rel} ships a raw placeholder`);
    if (/[\u0660-\u0669]/.test(text)) throw new Error(`${rel} uses Arabic-Indic digits`);
    // /affiliate is the one other page allowed a price: its worked example is the
    // offer ("$49.99 → $10"), and it is filled from the same pricing table.
    if (/\$\d/.test(text) && rel !== 'pricing.html' && rel !== 'affiliate.html') {
      throw new Error(`${rel} shows a price`);
    }
  }

  // The home page is the design: its video, its loader, its rail. Every other
  // page carries the same still and the same grain instead.
  const homeHtml = readFileSync(join(outDir, 'index.html'), 'utf8');
  for (const marker of ['/assets/bg.mp4', 'id="rail"', 'id="ld"', '/assets/vendor/gsap.min.js']) {
    if (!homeHtml.includes(marker)) throw new Error(`index.html is missing ${marker}`);
  }
  for (const rel of written.filter((file) => file.endsWith('.html') && file !== 'index.html')) {
    const text = readFileSync(join(outDir, rel), 'utf8');
    if (!text.includes('class="bgimg"')) throw new Error(`${rel} is missing the background still`);
    if (text.includes('bg.mp4')) throw new Error(`${rel} must not load the home video`);
  }

  console.log(`site: wrote ${written.length} files into website/`);
  for (const rel of written) console.log(`  ${rel}`);
  if (removed.length) {
    console.log(`site: removed ${removed.length} stale page(s)`);
    for (const rel of removed) console.log(`  - ${rel}`);
  }
}

main().catch((error) => {
  console.error('[build-website]', error);
  process.exit(1);
});
