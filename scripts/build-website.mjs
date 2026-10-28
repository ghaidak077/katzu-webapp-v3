#!/usr/bin/env node
/**
 * Build https://website.katzuai.com into `website/`.
 *
 *   node scripts/build-website.mjs
 *
 * THE SITE IS THREE PAGES
 *   /         HOME      what the app is for, one real correction, how it works,
 *                       the six situations, who it fits, moving to Germany
 *   /pricing  PRICING   free card + four founding plans, the rules once, #pay
 *   /help     HELP      short FAQ answers that link, then privacy/terms/refund
 *                       and one contact address
 *
 * One template, one stylesheet, one nav and footer, one background image. The
 * video plays on the home page only; every other page shows the same background
 * still. Nothing else is generated — the old topic pages, the English twins and
 * the five trust pages are deleted by this build and answered with a 301 from
 * `website/_redirects`.
 *
 * SOURCES OF TRUTH
 *   - copy + prices:  scripts/site-content.mjs (prices from pricing.config.json)
 *   - legal text:     src/lib/trust/content.ts (bundled here with esbuild)
 *   - design:         website/assets/site.css
 *
 * A page that shows a raw `{{OWNER_FILL}}` is not a page: the build stops.
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

import {
  SITE,
  START,
  SUPPORT,
  UPDATED,
  NAV_LINKS,
  FOOTER_LINKS,
  CTA_LABEL,
  HOME,
  PRICING,
  PLAN_ORDER_MAILTO,
  helpPage,
} from './site-content.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'website');

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
/* Shell                                                              */
/* ------------------------------------------------------------------ */

function navHtml(current) {
  const links = NAV_LINKS.map(
    ([href, label]) =>
      `<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a>`,
  ).join('');
  return `<nav id="nav" aria-label="التنقل الرئيسي">
  <a class="brand" href="/"><img src="/assets/logo/logo-64.png" alt="" width="28" height="28">كاتزو</a>
  <div class="nl">${links}</div>
  <a class="btn sm mag" href="${START}">${CTA_LABEL}</a>
</nav>`;
}

function footerHtml() {
  const links = FOOTER_LINKS.map(([href, label]) => `<a href="${href}">${label}</a>`).join('');
  return `<footer>
  <div class="wrap fin">
    <nav class="fnav" aria-label="روابط الموقع">${links}</nav>
    <div class="fmeta">
      <a href="mailto:${SUPPORT}">${SUPPORT}</a>
      <span>© 2026 كاتزو</span>
    </div>
  </div>
</footer>`;
}

/** The fixed background. One image everywhere; the video is home-only. */
function backgroundHtml(isHome) {
  const video = isHome
    ? `<video id="veil" autoplay muted loop playsinline poster="/assets/bg-poster.jpg" aria-hidden="true">
  <source src="/assets/bg.mp4" type="video/mp4">
</video>`
    : '';
  return `<div class="bgimg" aria-hidden="true"></div>
${video}
<div class="shade" aria-hidden="true"></div>`;
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

function renderPage(page) {
  const { path, title, description, h1, lead, body, jsonld = [], anchorNav } = page;
  const isHome = path === '/';
  const slug = path === '/' ? 'home' : path.replace(/^\//, '');
  const extraScript = path === '/pricing' ? pricingPickerScript() : '';
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
  const ld = [webPageJsonld, ...jsonld]
    .map((j) => `  <script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`)
    .join('\n');

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
<meta name="theme-color" content="#05030C">
<link rel="canonical" href="${SITE}${path}">
<link rel="icon" href="/assets/logo/favicon.ico" sizes="any">
<link rel="icon" href="/assets/logo/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/logo/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;900&family=Syne:wght@700;800&display=swap">
<link rel="stylesheet" href="/assets/site.css">
${ld}
</head>
<body class="page-${slug}">
${backgroundHtml(isHome)}
<a class="skip" href="#main">تخطَّ إلى المحتوى</a>
${navHtml(path)}
<main id="main">
  <header class="hero wrap">
    <h1 class="reveal">${h1}</h1>
    <p class="lead reveal">${lead}</p>
  </header>
  ${anchors}
  ${body}
</main>
${footerHtml()}
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

/* ------------------------------------------------------------------ */
/* robots / sitemap / redirects / 404                                 */
/* ------------------------------------------------------------------ */

const PAGES = ['/', '/pricing', '/help'];

function robotsTxt() {
  return ['User-agent: *', 'Allow: /', '', `Sitemap: ${SITE}/sitemap.xml`, ''].join('\n');
}

function sitemapXml() {
  const urls = PAGES.map(
    (path) => `  <url>\n    <loc>${SITE}${path}</loc>\n    <lastmod>${UPDATED}</lastmod>\n  </url>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * Old site URLs, one 301 each, straight to the final section. No rule points at
 * another redirect: a chain costs a round trip and hides the real target from a
 * crawler. `/en/*` mirrors its Arabic page instead of dumping everything on `/`.
 */
function redirectsTxt() {
  return `# The site is three pages now: /, /pricing, /help. Every old URL answers
# with ONE 301 to its final target — no chain, no second hop.
/how-it-works /#how 301
/how-it-works/ /#how 301
/who-its-for /#for 301
/who-its-for/ /#for 301
/compare /#for 301
/compare/ /#for 301
/use-cases/moving-to-germany /#moving 301
/use-cases/* /#for 301
/faq /help#faq 301
/faq/ /help#faq 301
/about /help#about 301
/about/ /help#about 301
/privacy /help#privacy 301
/terms /help#terms 301
/refund /help#refund 301
/trust/privacy /help#privacy 301
/trust/terms /help#terms 301
/trust/refund /help#refund 301
/trust/contact /help#contact 301
/trust/imprint /help#about 301
/trust/* /help 301
/en / 301
/en/pricing /pricing 301
/en/faq /help#faq 301
/en/about /help#about 301
/en/how-it-works /#how 301
/en/who-its-for /#for 301
/en/compare /#for 301
/en/use-cases/moving-to-germany /#moving 301
/en/trust/privacy /help#privacy 301
/en/trust/terms /help#terms 301
/en/trust/refund /help#refund 301
/en/* /  301
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
<body class="page-404">
${backgroundHtml(false)}
<main id="main">
  <header class="hero wrap">
    <h1>الصفحة غير موجودة</h1>
    <p class="lead">ربما تغيّر الرابط. عد إلى الصفحة الرئيسية، أو اقرأ ما يفعله كاتزو أولاً.</p>
    <p class="lost-links"><a class="btn gh" href="/">الرئيسية</a> <a class="btn gh" href="/pricing">الأسعار</a></p>
  </header>
</main>
${footerHtml()}
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* Emit                                                               */
/* ------------------------------------------------------------------ */

function emit(rel, content) {
  const file = join(outDir, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return rel;
}

/** Delete every generated .html this build no longer writes. */
function pruneStaleHtml(keep) {
  const removed = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.html')) continue;
      const rel = relative(outDir, full).replace(/\\/g, '/');
      if (keep.has(rel)) continue;
      unlinkSync(full);
      removed.push(rel);
    }
  };
  walk(outDir);
  // Empty directories are stale too: `use-cases/` and `trust/` must not linger.
  const dropEmpty = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (!statSync(full).isDirectory()) continue;
      if (full === join(outDir, 'assets')) continue;
      dropEmpty(full);
      if (readdirSync(full).length === 0) rmdirSync(full);
    }
  };
  dropEmpty(outDir);
  return removed;
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

  const pages = [HOME, PRICING, helpPage(legal)];
  for (const page of pages) {
    if (/\{\{[A-Z_]/.test(page.body)) throw new Error(`${page.path} still contains a placeholder`);
    if (page.path !== '/pricing' && /\$\d/.test(page.body)) {
      throw new Error(`${page.path} shows a price; prices belong on /pricing only`);
    }
  }

  const written = [];
  for (const page of pages) {
    const file = page.path === '/' ? 'index.html' : `${page.path.slice(1)}.html`;
    written.push(emit(file, renderPage(page)));
  }
  written.push(emit('robots.txt', robotsTxt()));
  written.push(emit('sitemap.xml', sitemapXml()));
  written.push(emit('_redirects', redirectsTxt()));
  written.push(emit('404.html', notFoundHtml()));

  const keep = new Set(written.filter((rel) => rel.endsWith('.html')));
  const removed = pruneStaleHtml(keep);

  // Sanity: the three pages must agree on the nav, the footer and the CTA.
  for (const rel of ['index.html', 'pricing.html', 'help.html']) {
    const text = readFileSync(join(outDir, rel), 'utf8');
    for (const label of ['الرئيسية', 'الأسعار', 'المساعدة', CTA_LABEL]) {
      if (!text.includes(label)) throw new Error(`${rel} is missing "${label}"`);
    }
    for (const href of ['/help#privacy', '/help#terms', '/help#refund']) {
      if (!text.includes(href)) throw new Error(`${rel} is missing the footer link ${href}`);
    }
    if (text.includes('katzu-sales.pages.dev') || text.includes('KATZU26')) {
      throw new Error(`${rel} still points at the retired sales property or coupon`);
    }
    if (/\{\{[A-Z_]/.test(text)) throw new Error(`${rel} ships a raw placeholder`);
    if (/[\u0660-\u0669]/.test(text)) throw new Error(`${rel} uses Arabic-Indic digits`);
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
