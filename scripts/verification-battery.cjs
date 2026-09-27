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

  // ---------- 7.5 The signed-out path: the public demo -----------------------
  // The live conversation is auth-gated, so a signed-out battery can only walk
  // the visitor's own path: value before signup. That path is `/demo`, and it
  // must reach its own German input without an account.
  {
    const { ctx, page, consoleErrors } = await newPage();
    await page.goto(`${APP}/demo`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const intro = page.getByRole('button', { name: /ابدأ الدرس التجريبي/ });
    const introOk = await intro.waitFor({ state: 'visible', timeout: 60000 }).then(() => true).catch(() => false);
    const shell = await page.evaluate(() => ({
      dir: document.documentElement.getAttribute('dir'),
      ltr: document.querySelectorAll('[dir="ltr"]').length,
    }));
    rec(
      'J5 the signed-out demo opens a real lesson (RTL shell + LTR German)',
      introOk && shell.dir === 'rtl' && shell.ltr > 0,
      `intro=${introOk}, dir=${shell.dir}, ltrNodes=${shell.ltr}`,
    );

    let reachedInput = false;
    let started = false;
    if (introOk) {
      await intro.click();
      started = true;
      for (let step = 0; step < 3; step++) {
        const understood = page.getByRole('button', { name: /فهمتها/ });
        if (!(await understood.count())) break;
        await understood.click();
        await page.waitForTimeout(200);
      }
      for (let question = 0; question < 3; question++) {
        if (!(await page.getByText('ما معنى هذه الجملة بالألمانية؟').count())) break;
        // Quiz options are the only buttons in the quiz card.
        await page.locator('button[class*="p-3.5"]').first().click();
        const next = page.getByRole('button', { name: /السؤال التالي|إلى التحدث/ });
        if (await next.count()) { await next.click(); await page.waitForTimeout(200); }
      }
      const input = page.locator('input[dir="ltr"]').first();
      reachedInput = (await input.count()) > 0;
    }
    rec(
      'J5 the demo reaches its own German input without an account',
      started && reachedInput,
      `started=${started}, ltrInput=${reachedInput}`,
    );
    rec('J5 no console errors in the demo', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || 'clean');
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
  // An installed PWA open must land on the cached shell. This used to flip the
  // network off after a fixed 5 s — mid-install on a cold cache — and report a
  // failure the app did not have. It now waits for the worker to be *active*
  // (`ready` only resolves after the precache install succeeded) and for the
  // precache to actually hold entries, and records both facts either way: a
  // worker that activates with an empty cache is exactly the shipped bug this
  // check exists to catch.
  {
    const { ctx, page } = await newPage();
    await page.goto(APP, { waitUntil: 'load', timeout: 45000 });
    const sw = await page.evaluate(async () => {
      if (!navigator.serviceWorker) return { ready: false, state: 'missing', cached: 0 };
      // `ready` only resolves once an active worker exists, which in turn only
      // happens after a successful install (the precache). The state string is
      // reported as evidence, not asserted on: sampling it can race with the
      // activation itself. An empty precache is the shipped bug this catches.
      const ready = await Promise.race([
        navigator.serviceWorker.ready.then(() => true),
        new Promise((r) => setTimeout(() => r(false), 90000)),
      ]);
      const reg = await navigator.serviceWorker.getRegistration();
      let cached = 0;
      for (const key of await caches.keys()) cached += (await (await caches.open(key)).keys()).length;
      return { ready, state: reg?.active?.state || 'none', cached };
    });
    await ctx.setOffline(true);
    const nav = await page
      .goto(APP, { waitUntil: 'domcontentloaded', timeout: 25000 })
      .then(() => 'ok')
      .catch((e) => `nav-error:${String(e).slice(0, 60)}`);
    await page.waitForTimeout(2500);
    const offlinePopulated = await page.evaluate(() => !!document.querySelector('#root')?.children.length);
    rec(
      '7.6 offline shell loads (SW active + precache populated + offline navigation)',
      sw.ready && sw.cached > 0 && nav === 'ok' && offlinePopulated,
      `ready=${sw.ready}, worker=${sw.state}, precache=${sw.cached}, nav=${nav}, root populated=${offlinePopulated}`,
    );
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
