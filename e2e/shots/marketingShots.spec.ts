import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { bootSignedIn, mockBackend, seedRows } from '../harness';

/**
 * The KatZU marketing screenshots (`docs/marketing/screenshots-mobile/`).
 *
 * What the owner asked for, in one sentence: every screen of the app, at phone
 * size, saved into the marketing folder. This rig is that, and it is the same
 * mechanism the two other evidence rigs use (`e2e/shots/*Shots.spec.ts`) rather
 * than a new one: build → serve the production bundle on its own port → drive the
 * real app through the shared harness → write PNGs to a path on disk.
 *
 * Two things it does that the other rigs do not:
 *
 * 1. **It proves its own output.** Each file's PNG header is read back and its
 *    pixel size asserted against viewport x deviceScaleFactor, so "1290x2796" is a
 *    measured fact rather than a hope about the context options. A run that writes
 *    desktop-sized files fails loudly.
 * 2. **A screen that does not settle is reported, never silently skipped.** The
 *    capture list is the acceptance criterion; the test fails at the end naming
 *    every screen that did not produce a file.
 *
 *   npx playwright test -c e2e/marketingShots.playwright.config.ts --reporter=line
 *   SCREENS=review,paywall …                       # re-shoot only those, while iterating
 *
 * Icons next to the PNGs: `manifest.json` (what each shot is, its size, the route
 * it came from and the text on screen) and `index.html` (a contact sheet).
 *
 * Real content only (the harness scripts the backend, never the copy), Arabic UI,
 * dark theme, no learner data. Sizes are the ones `docs/MARKETING-KIT.md` §6 asks
 * for: 1290x2796 (iPhone 15 Pro Max) and 1080x2400 (Android).
 */

const DSF = 3;
const OUT_DIR = join(process.cwd(), 'docs', 'marketing', 'screenshots-mobile');

interface Screen {
  slug: string;
  path: string;
  /** Extra driving before the shutter, for a screen whose value is in its content. */
  wait?: (page: Page) => Promise<void>;
}

/** The six shots of `docs/MARKETING-KIT.md` §6, then the rest of the product. */
const PUBLIC_SCREENS: Screen[] = [
  { slug: 'landing', path: '/' },
  { slug: 'welcome', path: '/welcome' },
  { slug: 'signin', path: '/signin' },
  { slug: 'demo-conversation', path: '/demo' },
  { slug: 'privacy', path: '/trust/privacy' },
];

const APP_SCREENS: Screen[] = [
  { slug: 'onboarding', path: '/onboarding' },
  { slug: 'placement', path: '/placement' },
  { slug: 'trail-journey', path: '/app/trail' },
  { slug: 'library-paths', path: '/app/library' },
  { slug: 'practice-hub', path: '/app/practice' },
  { slug: 'review', path: '/app/review' },
  { slug: 'listening', path: '/app/listen' },
  { slug: 'writing', path: '/app/write' },
  { slug: 'grammar', path: '/app/grammar' },
  { slug: 'coach', path: '/app/coach' },
  { slug: 'ask', path: '/app/ask' },
  { slug: 'progress', path: '/app/progress' },
  { slug: 'profile', path: '/app/profile' },
  { slug: 'subscription', path: '/subscription' },
  { slug: 'paywall', path: '/paywall' },
  { slug: 'scenario-story', path: '/scenario/cafe_order/story' },
  { slug: 'guided-practice', path: '/scenario/cafe_order/practice' },
  // The mock is exempt from the generic heading gate on purpose: once `/mock/start`
  // grants the seat it renders the conversation inside the exam banner, and there is
  // deliberately no `<h1>` on that screen — the banner IS the chrome. Measured
  // 2026-10-15: h1/h2 count 0, body reads "الطلب في المقهى B1 الجزء 1 من 3 …".
  { slug: 'mock-exam', path: '/mock', wait: readyMockExam },
  { slug: 'live-conversation', path: '/scenario/cafe_order/live', wait: readyLiveConversation },
];

/** The exam banner of part one, which is what makes the mock screen recognisable. */
async function readyMockExam(page: Page): Promise<void> {
  await page.goto('/mock');
  await expect(page.getByText(/الجزء 1 من \d/)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
}

/**
 * The conversation itself: the German line and its Arabic gloss, on screen.
 *
 * It stops before the microphone on purpose. The orb pulses for as long as the screen
 * is open, and a click on a continuously animated element makes Playwright keep
 * waiting for it to hold still — measured 2026-10-15: the rig hung here for minutes
 * while every other screen took 1.6–8 s. The mode tap plus the scripted opener give
 * the marketing frame, which is `docs/MARKETING-KIT.md` §6 shot 2: German text, Arabic
 * translation, same screen. If a shot ever needs a spoken turn, drive it in the gate
 * suite (`e2e/journey.spec.ts` does exactly that) and copy the frame — never make the
 * screenshot rig depend on an animated control.
 */
async function readyLiveConversation(page: Page): Promise<void> {
  await page.goto('/scenario/cafe_order/live');
  // A first visit asks how the learner wants to talk; the shot needs the conversation
  // itself, so it takes the recommended practice mode exactly as a learner would.
  await page.getByRole('button', { name: 'ابدأ «تدريب» الآن' }).click();
  await expect(page.locator('article[aria-label="رسالة من كَاتْزُو"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByPlaceholder(/Schreib deinen Satz/)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
}

/** Reads the real pixel size out of a PNG's IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  if (bytes.subarray(1, 4).toString('ascii') !== 'PNG') throw new Error(`not a PNG: ${file}`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

interface ManifestEntry {
  file: string;
  slug: string;
  path: string;
  width: number;
  height: number;
  heading: string;
  text: string;
}

const MANIFEST = join(OUT_DIR, 'manifest.json');

/**
 * Keeps `manifest.json` next to the PNGs true: the entry for this file replaces any
 * older one, and entries whose file no longer exists are dropped. The manifest is
 * what makes the folder auditable without opening 48 images — every shot, its size,
 * the route it came from, and the text that was on screen when it was taken.
 */
function recordManifest(entry: ManifestEntry): void {
  let stored: ManifestEntry[] = [];
  try {
    stored = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch {
    stored = [];
  }
  const next = [
    ...stored.filter((old) => old.file !== entry.file && existsSync(join(OUT_DIR, old.file))),
    entry,
  ].sort((a, b) => a.file.localeCompare(b.file));
  writeFileSync(MANIFEST, `${JSON.stringify(next, null, 2)}\n`);
}

async function shoot(page: Page, slug: string, path: string): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport size');
  mkdirSync(OUT_DIR, { recursive: true });
  const file = `${slug}-${viewport.width * DSF}x${viewport.height * DSF}.png`;
  await page.screenshot({ path: join(OUT_DIR, file) });
  const { width, height } = pngSize(join(OUT_DIR, file));
  const expected = { width: viewport.width * DSF, height: viewport.height * DSF };
  if (width !== expected.width || height !== expected.height) {
    throw new Error(`wrong pixel size for ${file}: ${width}x${height}, expected ${expected.width}x${expected.height}`);
  }
  // Both reads are diagnostics, so they get a SHORT explicit timeout. A bare
  // `locator.innerText()` has no action timeout of its own: on a screen with no heading
  // (the mock exam renders the conversation inside the exam banner) it waited until the
  // test timeout — measured 2026-10-15: 572 s on that one screen while every other
  // screen took 0.9–10 s.
  const heading = (await page.locator('h1, h2').first().innerText({ timeout: 2_000 }).catch(() => ''))
    .replace(/\s+/g, ' ')
    .trim();
  const text = (await page.locator('body').innerText({ timeout: 2_000 }).catch(() => ''))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  recordManifest({ file, slug, path, width, height, heading, text });
  console.log(`saved ${file} (${width}x${height}) — ${heading || text.slice(0, 40)}`);
}

/**
 * Waits for the screen to be a settled, painted page — never a bare sleep.
 *
 * `networkidle` is deliberately NOT used: a screen that keeps any request open made
 * each capture wait on it, and the cost was invisible (measured 2026-10-15: ~27 s
 * per screen with it, ~4 s without). The heading is the real readiness gate — every
 * screen the app ships has one — and the short paint settle covers the lazy chunk's
 * entrance motion.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(400);
}

/**
 * Captures one screen and returns null on success, or the reason it did not
 * settle. Nothing is written for a screen that never rendered: a half-loaded
 * frame in a marketing folder is worse than an absent one.
 */
async function capture(page: Page, screen: Screen, testInfo: TestInfo): Promise<string | null> {
  const startedAt = Date.now();
  try {
    if (screen.wait) await screen.wait(page);
    else {
      await page.goto(screen.path);
      const landed = new URL(page.url()).pathname;
      if (!landed.startsWith(screen.path)) throw new Error(`redirected to ${landed}`);
      await settle(page);
    }
    await shoot(page, screen.slug, screen.path);
    console.log(`  ${screen.slug}: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    return null;
  } catch (error) {
    // A screen that never settled gets no marketing file, but its frame goes to
    // Playwright's own output dir so the reason is inspectable instead of guessed,
    // and the message carries where the app actually ended up.
    const frame = testInfo.outputPath(`FAILED-${screen.slug}.png`);
    await page.screenshot({ path: frame }).catch(() => {});
    const headings = await page.locator('h1, h2').count().catch(() => -1);
    const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120);
    return `${screen.slug} (${screen.path}): ${(error as Error).message.split('\n')[0]} | at ${new URL(page.url()).pathname} | h1/h2=${headings} | "${text}"`;
  }
}

async function runScreens(page: Page, screens: Screen[], testInfo: TestInfo): Promise<void> {
  const failures: string[] = [];
  for (const screen of screens) {
    const failure = await capture(page, screen, testInfo);
    if (failure) failures.push(failure);
  }
  expect(failures, `screens that produced no screenshot:\n  ${failures.join('\n  ')}`).toEqual([]);
}

/** `SCREENS=review,paywall` re-shoots only those, for a fast single-screen iteration. */
const only = process.env.SCREENS ? new Set(process.env.SCREENS.split(',')) : null;
const wanted = (screens: Screen[]): Screen[] => (only ? screens.filter((s) => only.has(s.slug)) : screens);

test('public screens', async ({ page }, testInfo) => {
  await mockBackend(page);
  await runScreens(page, wanted(PUBLIC_SCREENS), testInfo);
});

test('signed-in app screens', async ({ page }, testInfo) => {
  // The server prices, so the subscription and paywall shots show real numbers. Without
  // this the mocked `/pricing` fails on purpose and the paywall honestly says «تعذّر تحميل
  // الأسعار الآن» — a correct behaviour and a useless marketing shot. Same catalogue as
  // `e2e/paywallPricing.spec.ts`.
  await bootSignedIn(page, {
    pricing: {
      prices: [
        { product: 'pass90', amountCents: 2900, currency: 'EUR', group: 'standard', cell: null },
        { product: 'monthly', amountCents: 1299, currency: 'EUR', group: 'standard', cell: null },
        { product: 'mock', amountCents: 900, currency: 'EUR', group: 'standard', cell: null },
      ],
      group: 'standard',
    },
  });
  // Due cards, so the Review shot shows a card that came back on time rather than
  // an empty state. Same rows the UI-polish rig seeds.
  await seedRows(page, 'review_items', [
    { userId: 'current_user', kind: 'vocab', refId: 'vocab:der Termin', sourceId: 4242, promptAr: 'موعد', answerDe: 'der Termin', contextDe: 'Ich habe morgen einen Termin.', direction: 'ar_to_de', dueAt: 1, intervalDays: 1, ease: 2.5, reps: 0, lapses: 0, reviews: 0, createdAt: 1 },
    { userId: 'current_user', kind: 'vocab', refId: 'vocab:die Rechnung', sourceId: 4242, promptAr: 'فاتورة', answerDe: 'die Rechnung', contextDe: 'Ich habe morgen eine Rechnung.', direction: 'ar_to_de', dueAt: 1, intervalDays: 1, ease: 2.5, reps: 0, lapses: 0, reviews: 0, createdAt: 1 },
    { userId: 'current_user', kind: 'vocab', refId: 'vocab:der Kaffee', sourceId: 4242, promptAr: 'قهوة', answerDe: 'der Kaffee', contextDe: 'Ich habe morgen einen Kaffee.', direction: 'ar_to_de', dueAt: 1, intervalDays: 1, ease: 2.5, reps: 0, lapses: 0, reviews: 0, createdAt: 1 },
  ]);
  await runScreens(page, wanted(APP_SCREENS), testInfo);
});
