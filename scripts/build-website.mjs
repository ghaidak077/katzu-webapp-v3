#!/usr/bin/env node
/**
 * Build https://website.katzuai.com into `website/`.
 *
 *   node scripts/build-website.mjs
 *
 * THE SITE IS THREE PAGES
 *   /         HOME      the supplied design, page for page: hero, the two
 *                       pinned scenes, the app conversation, the situations
 *                       rail, the error timeline, the results, the price line,
 *                       the FAQ, the closing scene.
 *   /pricing  PRICING   free card + four founding plans, the rules once, #pay
 *   /help     HELP      short FAQ answers that link, then privacy/terms/refund
 *                       and one contact address
 *
 * ONE SOURCE OF TRUTH PER PAGE
 *   /               scripts/templates/home.html — the design file with only the
 *                   allowed edits (nav/footer links, CTA target, the retired
 *                   coupon block, prices, facts). Tokens are filled here.
 *   /pricing /help  scripts/site-content.mjs (copy) + scripts/site-pricing.mjs
 *                   (prices from pricing.config.json).
 *   all pages       website/assets/site.css — Part 1 is the design's own CSS.
 *
 * Nothing else is generated: the old topic pages, the English twins and the
 * five trust pages are deleted by this build and answered with a 301 from
 * `website/_redirects`.
 */

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
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
  return html;
}

/* ------------------------------------------------------------------ */
/* /pricing and /help — the same shell, a page head, then the body     */
/* ------------------------------------------------------------------ */

function renderPage(page) {
  const { path, title, description, h1, lead, eye, body, jsonld = [], anchorNav } = page;
  const slug = path.replace(/^\//, '');
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
<meta name="theme-color" content="#000">
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
 * crawler. Every fragment below exists on its target page.
 */
function redirectsTxt() {
  return `# The site is three pages now: /, /pricing, /help. Every old URL answers
# with ONE 301 to its final target — no chain, no second hop.
/how-it-works /#app 301
/how-it-works/ /#app 301
/who-its-for /#faq 301
/who-its-for/ /#faq 301
/compare /#faq 301
/compare/ /#faq 301
/use-cases/moving-to-germany /#rail 301
/use-cases/* /#rail 301
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
/en/how-it-works /#app 301
/en/who-its-for /#faq 301
/en/compare /#faq 301
/en/use-cases/moving-to-germany /#rail 301
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

  const pages = [PRICING, helpPage(legal)];
  for (const page of pages) {
    if (/\{\{[A-Z_]/.test(page.body)) throw new Error(`${page.path} still contains a placeholder`);
  }

  const home = renderHome();
  if (/\$\d/.test(home)) throw new Error('/ shows a price; prices belong on /pricing only');

  const written = [];
  written.push(emit('index.html', home));
  for (const page of pages) {
    written.push(emit(`${page.path.slice(1)}.html`, renderPage(page)));
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
    if (/\$\d/.test(text) && rel !== 'pricing.html') throw new Error(`${rel} shows a price`);
  }

  // The home page is the design: its video, its loader, its rail. The other two
  // pages carry the same still and the same grain instead.
  const homeHtml = readFileSync(join(outDir, 'index.html'), 'utf8');
  for (const marker of ['/assets/bg.mp4', 'id="rail"', 'id="ld"', '/assets/vendor/gsap.min.js']) {
    if (!homeHtml.includes(marker)) throw new Error(`index.html is missing ${marker}`);
  }
  for (const rel of ['pricing.html', 'help.html', '404.html']) {
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
