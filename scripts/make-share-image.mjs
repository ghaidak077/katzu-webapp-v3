#!/usr/bin/env node
/**
 * Build the Arabic share card — `public/assets/share/katzu-share-ar.png`.
 *
 * WHAT IT IS
 * The 1200x630 Open Graph / Twitter image a link to Katzu unfurls into. Before
 * this the `og:image` pointed at the raw 512px app icon, which is a square the
 * social card crops; a link preview is the first thing a stranger sees, and it
 * was showing a logo, not a sentence.
 *
 * HOW IT IS BUILT
 * With tooling the repo already has: Chromium through Playwright renders one
 * local HTML document and screenshots it at exactly 1200x630. No design tool, no
 * binary asset committed without its source, and no mockup of app UI — the card
 * is the real landing headline, the real brand fonts and the real palette.
 *
 * The Cairo face and the app icon are inlined as data URIs, so the render does
 * not depend on a dev server, on `file://` access rules, or on anything being
 * installed beyond the repo's own `public/` files.
 *
 * Run: `npm run make:share-image`. Commit the resulting PNG.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontPath = join(root, 'public', 'assets', 'fonts', 'cairo.woff2');
const iconPath = join(root, 'public', 'assets', 'mascot', 'katzu_icon_512.png');
const outDir = join(root, 'public', 'assets', 'share');
const outPath = join(outDir, 'katzu-share-ar.png');

const font = readFileSync(fontPath).toString('base64');
const icon = readFileSync(iconPath).toString('base64');

// The palette, read from the same values `src/index.css` owns.
const AMOLED = '#000000';
const NEAR_BLACK = '#050508';
const LAVENDER = '#b4a0ff';
const LAVENDER_DEEP = '#7c5cf0';

// The landing headline, verbatim from `src/features/marketing/LandingScreen.tsx`.
const HEADLINE_1 = 'تحدّث الألمانية التي تحتاجها فعلاً';
const HEADLINE_2 = 'لا كلمات تحفظها وتنساها';

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: 'Cairo';
    src: url(data:font/woff2;base64,${font}) format('woff2');
    font-weight: 100 900;
    font-style: normal;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: 'Cairo', sans-serif;
    background: ${AMOLED};
    color: #ffffff;
    direction: rtl;
    position: relative;
  }
  /* Two soft lavender lights so the AMOLED black reads as a lit surface rather
     than a hole. Nothing here imitates app UI. */
  .glow-a {
    position: absolute; inset: -180px -120px auto auto; width: 900px; height: 900px;
    background: radial-gradient(circle, ${LAVENDER_DEEP}55 0%, ${LAVENDER_DEEP}22 38%, transparent 68%);
    border-radius: 50%;
  }
  .glow-b {
    position: absolute; inset: auto auto -220px -160px; width: 720px; height: 720px;
    background: radial-gradient(circle, ${LAVENDER}33 0%, transparent 62%);
    border-radius: 50%;
  }
  .frame {
    position: absolute; inset: 0;
    border: 1px solid #ffffff14;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 64px 76px;
  }
  .brand { display: flex; align-items: center; gap: 18px; }
  .brand img { width: 76px; height: 76px; border-radius: 20px; }
  .brand .word { font-size: 34px; font-weight: 800; letter-spacing: 0.5px; }
  .brand .tag {
    font-size: 21px; font-weight: 600; color: ${LAVENDER};
    border-inline-start: 2px solid #ffffff22; padding-inline-start: 18px;
  }
  .headline { display: flex; flex-direction: column; gap: 10px; }
  .headline .l1 { font-size: 60px; font-weight: 800; line-height: 1.22; }
  .headline .l2 { font-size: 60px; font-weight: 800; line-height: 1.22; color: ${LAVENDER}; }
  .foot { display: flex; align-items: center; justify-content: space-between; }
  .foot .sub { font-size: 24px; font-weight: 600; color: #c9c5d6; }
  .foot .levels {
    font-size: 20px; font-weight: 700; color: #0a0a0d;
    background: ${LAVENDER}; border-radius: 999px; padding: 8px 22px;
  }
</style>
</head>
<body>
  <div class="glow-a"></div>
  <div class="glow-b"></div>
  <div class="frame">
    <div class="brand">
      <img src="data:image/png;base64,${icon}" alt="" />
      <span class="word">كَاتْزُو</span>
      <span class="tag">عربي أولاً · ألمانية الحياة اليومية</span>
    </div>
    <div class="headline">
      <div class="l1">${HEADLINE_1}</div>
      <div class="l2">${HEADLINE_2}</div>
    </div>
    <div class="foot">
      <span class="sub">تدريب على مواقف حقيقية في ألمانيا</span>
      <span class="levels">من A0 إلى B2</span>
    </div>
  </div>
</body>
</html>`;

mkdirSync(outDir, { recursive: true });

// Optional: also write the source HTML somewhere, for eyeballing the card in a
// browser without regenerating the PNG. Not used by the build.
if (process.env.SHARE_HTML_OUT) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.env.SHARE_HTML_OUT, html);
  console.log(`wrote html ${process.env.SHARE_HTML_OUT}`);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  // The card is exactly 1200x630 and must never crop: a headline that overflows
  // would ship a share image missing its last word. Measure, then fail loudly.
  const box = await page.evaluate(() => {
    const frame = document.querySelector('.frame');
    return { sw: frame.scrollWidth, sh: frame.scrollHeight, cw: frame.clientWidth, ch: frame.clientHeight };
  });
  if (box.sw > box.cw || box.sh > box.ch) {
    throw new Error(`share card overflows its canvas: content ${box.sw}x${box.sh} in ${box.cw}x${box.ch}`);
  }
  console.log(`share card fits: content ${box.sw}x${box.sh} in ${box.cw}x${box.ch}`);

  await page.screenshot({ path: outPath, type: 'png' });
} finally {
  await browser.close();
}

console.log(`wrote ${outPath}`);
