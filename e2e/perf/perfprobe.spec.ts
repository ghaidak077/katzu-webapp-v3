import { test, expect } from '@playwright/test';
import { bootSignedIn } from '../harness';

/**
 * V34 performance probe.
 *
 * Measures what the app costs while nothing is happening on Journey Home, and
 * what a finger/pointer sweep costs, in Chromium's own counters.
 *
 * This is the tool behind the numbers in docs/agent/APP-MAP.md §9. It reports;
 * it never asserts — a threshold that only holds on one machine would be a lie
 * told in CI. Run it against the production bundle:
 *
 *   npm run build && npx vite preview --port 3000 --strictPort
 *   npx playwright test --config=e2e/perf/playwright.perf.config.ts
 *
 * Baseline, measured the same way before V34 on the same machine:
 *   idle 5s      46 style recalcs, 100.4ms recalc, 150.9ms task
 *   pointer sweep 200 recalcs, 969.1ms recalc, 2055.4ms task, 48.3s wall
 *   scroll 12x    27 recalcs, 62.3ms recalc, 172.2ms task
 */

interface Metrics {
  [key: string]: number;
}

async function snapshot(cdp: import('@playwright/test').CDPSession): Promise<Metrics> {
  // Playwright types `Metric` as a closed object; the map we build below wants
  // a plain `Record<string, number>`, so the cast goes through `unknown` rather
  // than pretending the two shapes are compatible.
  const { metrics } = (await cdp.send('Performance.getMetrics')) as unknown as { metrics: Metrics[] };
  const out: Metrics = {};
  for (const m of metrics) out[m.name] = m.value;
  return out;
}

function delta(before: Metrics, after: Metrics) {
  const pick = (k: string) => (after[k] ?? 0) - (before[k] ?? 0);
  return {
    recalcStyleCount: pick('RecalcStyleCount'),
    recalcStyleMs: +(pick('RecalcStyleDuration') * 1000).toFixed(1),
    layoutCount: pick('LayoutCount'),
    layoutMs: +(pick('LayoutDuration') * 1000).toFixed(1),
    scriptMs: +(pick('ScriptDuration') * 1000).toFixed(1),
    taskMs: +(pick('TaskDuration') * 1000).toFixed(1),
  };
}

test('V34 perf probe: idle + pointer sweep on Journey Home', async ({ page }) => {
  await bootSignedIn(page);
  await page.waitForTimeout(1500);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');

  await page.evaluate(() => {
    (window as unknown as { __lt: number[] }).__lt = [];
    new PerformanceObserver((list) => {
      const w = window as unknown as { __lt: number[] };
      for (const entry of list.getEntries()) w.__lt.push(entry.duration);
    }).observe({ entryTypes: ['longtask'] });
  });

  const beams = await page.locator('[data-rim]').count();

  // --- idle: 5s with no input at all ---
  await page.evaluate(() => {
    (window as unknown as { __lt: number[] }).__lt.length = 0;
  });
  const idleBefore = await snapshot(cdp);
  await page.waitForTimeout(5000);
  const idleAfter = await snapshot(cdp);
  const idle = delta(idleBefore, idleAfter);
  const idleLongTasks = await page.evaluate(
    () => (window as unknown as { __lt: number[] }).__lt.length,
  );

  // --- pointer sweep: 200 moves across the screen, as a finger drag would ---
  await page.evaluate(() => {
    (window as unknown as { __lt: number[] }).__lt.length = 0;
  });
  const moveBefore = await snapshot(cdp);
  const started = Date.now();
  for (let i = 0; i < 200; i++) {
    await page.mouse.move(20 + (i % 20) * 18, 120 + Math.floor(i / 20) * 40);
  }
  const sweepMs = Date.now() - started;
  const moveAfter = await snapshot(cdp);
  const move = delta(moveBefore, moveAfter);
  const moveLongTasks = await page.evaluate(
    () => (window as unknown as { __lt: number[] }).__lt.length,
  );

  // --- scroll: the everyday gesture ---
  await page.evaluate(() => {
    (window as unknown as { __lt: number[] }).__lt.length = 0;
  });
  const scrollBefore = await snapshot(cdp);
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(300);
  const scrollAfter = await snapshot(cdp);
  const scroll = delta(scrollBefore, scrollAfter);

  const report = { beams, idle: { ...idle, longTasks: idleLongTasks }, move: { ...move, longTasks: moveLongTasks, sweepMs }, scroll };
  console.log('PERF_PROBE ' + JSON.stringify(report));
  expect(true).toBe(true);
});