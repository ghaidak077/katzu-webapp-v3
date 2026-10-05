// C4 measurement: Lighthouse performance + PWA at 360x640, via the Node API.
//
// WHY NOT THE CLI
// `npx lighthouse` writes the report and then, in the same process, kills its
// Chrome instance and removes the temp profile. On this Windows host that
// removal fails with EPERM and throws out of `runLighthouse` before anything is
// flushed — the audit runs for a minute and the measurement is lost. Driving the
// library directly lets us keep the JSON whether or not the launcher cleans up.
import fs from 'node:fs/promises';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const url = process.argv[2] || 'http://localhost:4188/';
const out = process.argv[3] || 'lh-tmp.json';

const chrome = await chromeLauncher.launch({
  // The first run of this measurement was contaminated: this machine has a
  // Kaspersky web-injection script that every page loads (151 KiB, render
  // blocking, ~1.1s of the FCP budget). Mapping every non-localhost name to a
  // dead port removes it, so the score describes the app rather than the
  // antivirus. `localhost` is excluded so the page under test still loads.
  chromeFlags: [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--host-resolver-rules=MAP * 127.0.0.1:9, EXCLUDE localhost',
  ],
});

let result;
try {
  result = await lighthouse(
    url,
    {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      // Lighthouse 13 dropped the PWA category entirely, so installability is
      // audited with the individual audits below instead of a category score.
      onlyCategories: ['performance'],
      formFactor: 'mobile',
      screenEmulation: {
        mobile: true,
        width: 360,
        height: 640,
        deviceScaleFactor: 2,
        disabled: false,
      },
      throttlingMethod: 'simulate',
    },
    undefined,
  );
} finally {
  // Best-effort: the temp profile may stay behind on this host, which is
  // harmless. Never let cleanup throw over a report we already have.
  try {
    await chrome.kill();
  } catch {
    /* ignored */
  }
}

const lhr = result.lhr;
const INSTALL_AUDITS = [
  'installable-manifest',
  'service-worker',
  'splash-screen',
  'themed-omnibox',
  'maskable-icon',
  'viewport',
  'apple-touch-icon',
];
await fs.writeFile(out, result.report ?? JSON.stringify(lhr), 'utf8');

const rows = Object.entries(lhr.audits)
  .filter(([, a]) => a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'notApplicable')
  .map(([id, a]) => ({ id, score: a.score, title: a.title }));

console.log(
  JSON.stringify(
    {
      url,
      viewport: '360x640 @2x, simulated throttling',
      userAgent: lhr.userAgent,
      fetchTime: lhr.fetchTime,
      performance: lhr.categories.performance.score,
      pwaCategory: lhr.categories.pwa ? lhr.categories.pwa.score : 'removed-in-lighthouse-13',
      installability: Object.fromEntries(
        INSTALL_AUDITS.filter((id) => lhr.audits[id]).map((id) => [id, {
          score: lhr.audits[id].score,
          value: lhr.audits[id].displayValue || null,
        }]),
      ),
      metrics: {
        fcp: lhr.audits['first-contentful-paint']?.displayValue,
        lcp: lhr.audits['largest-contentful-paint']?.displayValue,
        tbt: lhr.audits['total-blocking-time']?.displayValue,
        cls: lhr.audits['cumulative-layout-shift']?.displayValue,
        si: lhr.audits['speed-index']?.displayValue,
      },
      failing: rows,
    },
    null,
    2,
  ),
);