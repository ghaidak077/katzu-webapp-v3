#!/usr/bin/env node
/**
 * Captures screenshots of the LIVE Katzu admin dashboard and prints the values
 * it rendered, so the output is verifiable text as well as images.
 *
 * The admin dashboard keeps its bearer token in sessionStorage, so the script
 * seeds that before load and then drives the real deployed UI.
 *
 * Requires a Chromium binary. Playwright's Chromium may already be cached:
 *   node scripts/capture-admin-screenshots.mjs --secret=<ADMIN_SECRET>
 *
 * If playwright-core is missing:  npm i --no-save playwright-core
 * Override the browser with CHROME_PATH if the default path does not exist.
 */

import { mkdirSync, existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
const SECRET = arg('secret') || process.env.ADMIN_SECRET;
const URL = arg('url') || 'https://katzu-test.ghaidakalosh008.workers.dev/admin';
const OUT = arg('out') || 'docs/screenshots';
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/home/daytona/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  '/home/daytona/.cache/ms-playwright/chromium_headless_shell-1243/chrome-linux/headless_shell',
].filter(Boolean);

const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Chromium binary found. Set CHROME_PATH.');
  process.exit(1);
}
if (!SECRET) {
  console.error('No admin secret. Pass --secret=<ADMIN_SECRET>.');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1500, height: 1150 } });

// Seed the bearer token before any page script runs.
await context.addInitScript((s) => {
  try {
    sessionStorage.setItem('katzu_admin_key', s);
  } catch {}
}, SECRET);

const page = await context.newPage();
const shot = async (name) => {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(`screenshot -> ${path}`);
};
const settle = (ms = 1800) => page.waitForTimeout(ms);

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await settle(2500);

console.log(`\npage title        : ${await page.title()}`);
console.log(`connection state  : ${(await page.textContent('#key-state'))?.trim()}`);
console.log(`headline          : ${(await page.textContent('#page-title'))?.trim()}`);

// ---- Overview ----
await page.waitForSelector('#overview-cards .stat .v', { timeout: 20000 });
await settle(2200);
const stats = await page.$$eval('#overview-cards .stat', (nodes) =>
  nodes.map((n) => ({
    k: n.querySelector('.k')?.textContent?.trim(),
    v: n.querySelector('.v')?.textContent?.trim(),
    d: n.querySelector('.d')?.textContent?.trim(),
  })),
);
console.log('\n--- OVERVIEW STAT CARDS (live API) ---');
for (const s of stats) console.log(`  ${s.k}: ${s.v}   (${s.d})`);
console.log(`signup chart caption: ${(await page.textContent('#signup-caption'))?.trim()}`);
await shot('admin-overview-connected');

// ---- Users ----
await page.click('#nav-users');
await settle(2500);
const rowCount = await page.$$eval('#users-body tr', (r) => r.length);
console.log(`\n--- USERS TAB ---`);
console.log(`  users count label : ${(await page.textContent('#users-count'))?.trim()}`);
console.log(`  pagination label  : ${(await page.textContent('#users-page'))?.trim()}`);
console.log(`  table rows        : ${rowCount}`);
const firstRow = await page.$eval('#users-body tr', (tr) => tr.innerText.replace(/\s+/g, ' ').trim()).catch(() => '(none)');
console.log(`  first row         : ${firstRow}`);
await shot('admin-users-connected');

// ---- Activity ----
await page.click('#nav-activity');
await settle(2200);
const feedText = (await page.textContent('#activity-feed'))?.trim() || '';
console.log(`\n--- ACTIVITY TAB ---`);
console.log(`  feed (first 160)  : ${feedText.replace(/\s+/g, ' ').slice(0, 160)}`);
await shot('admin-activity-connected');

// ---- Errors ----
await page.click('#nav-errors');
await settle(2000);
const errText = (await page.textContent('#errors-feed'))?.trim() || '';
console.log(`\n--- ERRORS TAB ---`);
console.log(`  feed (first 160)  : ${errText.replace(/\s+/g, ' ').slice(0, 160)}`);
await shot('admin-errors-connected');

// Surface any console errors (a broken dashboard would show here).
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e.message).slice(0, 120)));
await settle(500);
if (consoleErrors.length) console.log(`\npage errors: ${consoleErrors.join(' | ')}`);
else console.log('\nno page errors during the run.');

await browser.close();
