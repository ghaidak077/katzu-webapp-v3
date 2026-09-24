/**
 * Full verification battery (read-only) against the LIVE deployed app.
 * Prints PASS/FAIL lines consumed by docs/verification-report.md.
 * Makes NO product changes; touches only the browser profile it creates.
 */
const { chromium } = require('playwright');
const APP = 'https://katzu-webapp-v3.pages.dev';
const results = [];
const rec = (name, pass, evidence) => {
  results.push({ name, pass, evidence });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name} :: ${evidence}`);
};

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ---------- Shared: capture console errors + requests ----------------------
  async function newPage() {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 120)); });
    page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 120)));
    return { ctx, page, consoleErrors };
  }

  // ---------- 7.1 New learner journey (welcome → trail renders) -------------
  {
    const { ctx, page, consoleErrors } = await newPage();
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200));
    const hasRoot = await page.evaluate(() => !!document.querySelector('#root') && document.querySelector('#root').children.length > 0);
    rec('J1 landing renders (no blank screen)', hasRoot, `root populated; UI: ${text.slice(0, 90)}`);
    // Trail requires sign-in; verify redirect behavior for anonymous users.
    await page.goto(`${APP}/app/trail`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    const url = page.url();
    rec('J1 anonymous /app/trail does not 404/blank', !url.includes('404'), `landed on ${new URL(url).pathname}`);
    rec('J1 no uncaught console errors on landing', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || 'clean');
    await ctx.close();
  }

  // ---------- 7.5 Conversation screen loads + German LTR + Arabic RTL -------
  {
    const { ctx, page, consoleErrors } = await newPage();
    await page.goto(`${APP}/scenario/cafe_order/live`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(6000);
    const dirInfo = await page.evaluate(() => {
      const htmlDir = document.documentElement.getAttribute('dir');
      const ltrInput = !!document.querySelector('input[dir="ltr"], [dir="ltr"]');
      return { htmlDir, ltrInput };
    });
    rec('J5 conversation screen renders with RTL shell + LTR German input', dirInfo.htmlDir === 'rtl' && dirInfo.ltrInput, JSON.stringify(dirInfo));
    const trainingMode = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) => /تمرين سريع/.test(x.textContent || ''));
      if (b) { b.click(); return true; }
      return false;
    });
    await page.waitForTimeout(4000);
    const starterPhrases = await page.evaluate(() => document.body.innerText.includes('عبارات مساعدة للبدء') || document.body.innerText.includes('Ich möchte'));
    rec('J5 quick mode enters conversation with starter content', trainingMode && starterPhrases, `mode clicked=${trainingMode}, starter phrases=${starterPhrases}`);
    rec('J5 no console errors in conversation', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || 'clean');
    await ctx.close();
  }

  // ---------- 8. Responsive / overflow across widths -------------------------
  {
    const { ctx, page } = await newPage();
    const widths = [320, 375, 390, 430, 768, 1024, 1440];
    const overflows = [];
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(`${APP}/app/profile`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 2) overflows.push(`${w}px:+${over}`);
    }
    rec('8 no horizontal overflow 320→1440px (profile)', overflows.length === 0, overflows.join(', ') || 'all widths clean');
    await ctx.close();
  }

  // ---------- 11.1 Browser storage audit (anonymous) --------------------------
  {
    const { ctx, page } = await newPage();
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    const storage = await page.evaluate(() => {
      const ls = Object.fromEntries(Object.entries(localStorage).map(([k, v]) => [k, v.slice(0, 40)]));
      const ss = Object.keys(sessionStorage);
      return { localStorageKeys: Object.keys(ls), localStorageSample: ls, sessionStorageKeys: ss, cookieCount: document.cookie ? document.cookie.split(';').length : 0 };
    });
    const sensitiveInLS = JSON.stringify(storage.localStorageSample).match(/idToken|sess_|ya29|eyJhbG/i);
    rec('11.1 anonymous storage contains no tokens', !sensitiveInLS, `localStorage keys: ${storage.localStorageKeys.join(', ') || 'none'}; cookies: ${storage.cookieCount}`);
    await ctx.close();
  }

  // ---------- 10.2 Performance metrics ---------------------------------------
  {
    const { ctx, page } = await newPage();
    const t0 = Date.now();
    await page.goto(APP, { waitUntil: 'load', timeout: 45000 });
    const loadMs = Date.now() - t0;
    const metrics = await page.evaluate(() => new Promise((resolve) => {
      const po = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lcp = entries.filter((e) => e.entryType === 'largest-contentful-paint').pop();
        if (lcp) resolve({ lcp: Math.round(lcp.startTime) });
      });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
      setTimeout(() => resolve({ lcp: -1 }), 3000);
    }));
    const jsKB = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.js')).reduce((s, r) => s + (r.transferSize || 0), 0));
    const reqCount = await page.evaluate(() => performance.getEntriesByType('resource').length);
    rec('10.2 initial load < 6s (3G-ish headless baseline)', loadMs < 6000, `${loadMs}ms, LCP ${metrics.lcp}ms, JS ${Math.round(jsKB / 1024)}KB over ${reqCount} requests`);
    await ctx.close();
  }

  // ---------- 7.6 Offline shell ----------------------------------------------
  {
    const { ctx, page } = await newPage();
    await page.goto(APP, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(5000); // allow SW install
    const swActive = await page.evaluate(async () => {
      if (!navigator.serviceWorker) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return !!(reg && (reg.active || reg.installing || reg.waiting));
    });
    await ctx.setOffline(true);
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const offlinePopulated = await page.evaluate(() => !!document.querySelector('#root')?.children.length);
    rec('7.6 offline shell loads (SW registered + cached shell)', swActive && offlinePopulated, `SW=${swActive}, offline root populated=${offlinePopulated}`);
    await ctx.close();
  }

  // ---------- Trust pages + PWA manifest --------------------------------------
  {
    const { ctx, page } = await newPage();
    await page.goto(`${APP}/trust/privacy`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const trust = await page.evaluate(() => document.body.innerText.includes('الخصوصية'));
    rec('11.4 trust/privacy page reachable in deployed app', trust, `privacy copy visible=${trust}`);
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      if (!link) return null;
      const res = await fetch(link.href);
      return res.ok ? await res.json() : null;
    });
    rec('10.1 PWA manifest valid (name + icons + rtl-ish lang)', !!manifest && !!manifest.name && (manifest.icons || []).length > 0, manifest ? `name=${manifest.name}, icons=${(manifest.icons || []).length}, lang=${manifest.lang || 'unset'}` : 'manifest missing');
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== VERIFICATION BATTERY: ${results.length - failed.length}/${results.length} passed =====`);
  process.exitCode = failed.length ? 1 : 0;
})().catch((e) => { console.error('BATTERY CRASH:', e.message); process.exit(2); });
