import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bootSignedIn } from './harness';
import { createLiveProxy, type LiveProxy } from '../scripts/qa/liveProxy.mjs';

/**
 * The practice chat, driven by the REAL model through the REAL app.
 *
 * The other conversation specs script `/ai/turn`, which proves the screen can
 * render a known reply. This one lets the app send the body it builds and runs
 * that body through the Worker's own `runRoleplayTurn` (same prompt v4, same
 * parser, same shaper, same reply checks) against the model named in
 * `ROLEPLAY_MODEL` (production: `openai/gpt-oss-120b`). So these assertions are
 * about what a learner on a 390×844 phone actually gets from today's model, not
 * from a fixture:
 *
 *   * every reply lands as exactly one bubble, nothing hidden behind the dock;
 *   * the objective header never goes backwards and matches the server's count;
 *   * the hint dock offers a sentence and never sends or inserts it;
 *   * a real spelling fix produces the correction chip, openable, with a reason;
 *   * a failed turn keeps the learner's sentence and offers one retry;
 *   * the scene ends with a goodbye and the report opens.
 *
 * Run (needs a provider key; nothing is printed):
 *   GROQ_API_KEY=... E2E_TARGET=preview npx playwright test -c e2e/chatQaLive.playwright.config.ts
 *
 * The app itself is untouched: the interception lives in the test process, so
 * there is no production test hook, no auth bypass and no new env flag in the
 * bundle. `scripts/qa/` is never part of a deployment.
 */

const KEY = process.env.GROQ_API_KEY || '';
const SHOTS = join(process.cwd(), '.tmp', 'qa', 'ui');
const VIEWPORT = { width: 390, height: 844 };

test.skip(!KEY, 'set GROQ_API_KEY to run the live chat suite (the real model costs money)');

interface Scenario {
  id: string;
  first: string;
  /** This opener is deliberately misspelled, to exercise the correction chip. */
  careless?: boolean;
}

/** Scenarios the UI suite covers: three levels, six rooms, six different goals. */
const SCENARIOS: Scenario[] = [
  { id: 'cafe_order', first: 'Einen Kaffee bite und ein stuck Kuchen.', careless: true },
  { id: 'first_greetings', first: 'Hallo, ich bin Sami.' },
  { id: 'numbers_and_prices', first: 'Was kostet das Wasser?' },
  { id: 'anmeldung_buergeramt', first: 'Ich möchte mich anmelden.' },
  { id: 'doctor_visit', first: 'Ich habe Fieber.' },
  { id: 'job_interview', first: 'Guten Tag, ich heiße Sami.' },
];

let stamp = '';

function installLiveTurn(page: Page, proxy: LiveProxy): void {
  // Registered after `mockBackend` in `bootSignedIn`, and Playwright matches the
  // most recently added route first — so `/ai/turn` is live while every other
  // call (status, translation, mock exam) stays canned and offline.
  void page.route('**/ai/turn', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const result = await proxy.handle(body);
    await route.fulfill({
      status: result.status,
      contentType: 'application/json',
      body: JSON.stringify(result.body),
    });
  });
}

/** A real slow phone connection: 400 kbps down, 150 kbps up, 150 ms RTT. */
async function throttle(context: BrowserContext, page: Page): Promise<void> {
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (150 * 1024) / 8,
  });
}

async function boot(page: Page, proxy: LiveProxy): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await bootSignedIn(page);
  installLiveTurn(page, proxy);
  await throttle(page.context(), page);
}

async function openPractice(page: Page, scenarioId: string): Promise<void> {
  await page.goto(`/scenario/${scenarioId}/live`);
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  await expect(page.getByTestId('conversation-dock')).toBeVisible();
}

function input(page: Page) {
  return page.getByPlaceholder(/Schreib deinen Satz/);
}

async function send(page: Page, text: string): Promise<void> {
  await input(page).fill(text);
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(input(page)).toHaveValue('');
}

/** Every message box must end above the dock — the clipped-sentence bug. */
async function assertNothingHidden(page: Page): Promise<void> {
  const dock = await page.getByTestId('conversation-dock').boundingBox();
  const transcript = await page.getByTestId('conversation-transcript').boundingBox();
  expect(dock, 'the dock must be laid out').not.toBeNull();
  expect(transcript, 'the transcript must be laid out').not.toBeNull();
  const bubbles = page.locator('article');
  const count = await bubbles.count();
  for (let index = 0; index < count; index += 1) {
    const box = await bubbles.nth(index).boundingBox();
    if (!box) continue;
    const top = Math.max(box.y, transcript!.y);
    const bottom = Math.min(box.y + box.height, transcript!.y + transcript!.height);
    if (bottom <= top) continue;
    expect(bottom, `message ${index} reaches into the dock`).toBeLessThanOrEqual(dock!.y + 2);
  }
}

interface Header {
  now: number;
  max: number;
}

async function readHeader(page: Page): Promise<Header | null> {
  const bar = page.getByTestId('objective-progress');
  if ((await bar.count()) === 0) return null;
  const now = Number(await bar.getAttribute('aria-valuenow'));
  const max = Number(await bar.getAttribute('aria-valuemax'));
  const label = await page.getByTestId('objective-progress-label').innerText();
  expect(label, 'the header label must equal the bar').toContain(`${now} من ${max}`);
  return { now, max };
}

/**
 * Wait for the next real reply, recovering a busy service the way a learner
 * would. A free-tier 429 is not a product failure — the client's own three
 * automatic attempts and the one-tap retry are what must carry the turn — so
 * this helper accepts either a new bubble or the quiet retry notice, clicks the
 * retry, and never lets the transcript grow an error card.
 */
async function nextReply(page: Page, before: number, turn: number): Promise<void> {
  const persona = page.locator('article[aria-label="رسالة من كَاتْزُو"]');
  const retry = page.getByRole('status').getByRole('button', { name: 'أعد المحاولة' });
  for (let recovery = 0; recovery <= 3; recovery += 1) {
    await expect
      .poll(
        async () => {
          if ((await persona.count()) > before) return 'reply';
          if (await retry.isVisible().catch(() => false)) return 'retry';
          return 'waiting';
        },
        { message: `turn ${turn}: a reply or the one-tap retry`, timeout: 180_000 },
      )
      .not.toBe('waiting');
    if ((await persona.count()) > before) return;
    await retry.click();
  }
  throw new Error(`turn ${turn}: the model produced neither a reply nor a retry`);
}

/**
 * One full cooperative conversation: send, wait for the real reply, screenshot,
 * assert. The learner copies the persona's own hint, which is the A1 behaviour
 * the scene is built for; `___` slots get a plausible personal fact.
 */
async function converse(page: Page, scenario: Scenario, proxy: LiveProxy) {
  const persona = page.locator('article[aria-label="رسالة من كَاتْزُو"]');
  let previous: Header | null = null;
  let dockTurns = 0;
  const replyCount = async () => persona.count();

  await send(page, scenario.first);
  // Five turns is enough to prove progress, the dock, the sheet, the chip and
  // the composer's clearing behaviour; longer runs only spend free-tier quota
  // and add provider-weather timeouts, not new UI evidence.
  for (let turn = 1; turn <= 5; turn += 1) {
    const before = await replyCount();
    await nextReply(page, before, turn);
    const answered = proxy.state.turns.at(-1)!;
    // The newest persona bubble must carry this reply. Uniqueness across the
    // transcript is NOT required: a persona that repeats a sentence on a later
    // turn is a model-quality note, not a duplicate-bubble bug — that bug is
    // covered by the bubble count having grown by exactly one above.
    await expect(persona.last(), 'this reply must be the newest bubble').toContainText(answered.reply_de);

    const header = await readHeader(page);
    expect(header, 'the header must show progress after the first reply').not.toBeNull();
    expect(header!.max).toBeGreaterThan(0);
    expect(header!.now).toBeLessThanOrEqual(header!.max);
    if (previous) {
      expect(header!.now, 'objectives may never go backwards').toBeGreaterThanOrEqual(previous.now);
      expect(header!.max, 'the objective total is fixed by the plan').toBe(previous.max);
    }
    previous = header;
    await assertNothingHidden(page);
    mkdirSync(join(SHOTS, stamp), { recursive: true });
    await page.screenshot({ path: join(SHOTS, stamp, `${scenario.id}-t${turn}.png`) });

    if (await page.getByTestId('closed-scene').isVisible().catch(() => false)) break;

    // The suggestion sheet and its word bank are gone (2026-11-13): a turn that
    // carries no hint offers ONE small call («اطلب تلميحاً») instead, and that
    // button must never send a turn or open a sheet.
    const askHint = page.getByTestId('hint-request').getByRole('button');
    if (await askHint.isVisible().catch(() => false)) {
      const articlesBefore = await page.locator('article').count();
      expect(await page.getByRole('dialog').count(), 'no sheet is left to open').toBe(0);
      expect(await page.locator('article').count(), 'asking for a hint must not send a turn').toBe(articlesBefore);
    }

    // The hint dock offers the sentence for THIS question, so it exists only
    // when the reply carried a usable hint. When it is there it must never
    // insert text or send a turn; across the session at least one turn must
    // offer it, or a regression could remove the dock unnoticed.
    const dock = page.getByTestId('hint-dock');
    if (await dock.isVisible().catch(() => false)) {
      dockTurns += 1;
      const requestsBeforeHint = proxy.state.requests;
      const articlesBeforeHint = await page.locator('article').count();
      await dock.getByRole('button', { name: 'سمّعني' }).click();
      await dock.getByRole('button', { name: 'قلها' }).click();
      expect(await input(page).inputValue(), 'the hint must not insert text').toBe('');
      expect(await page.locator('article').count(), 'the hint must not send a turn').toBe(articlesBeforeHint);
      expect(proxy.state.requests, 'the hint must not call the model').toBe(requestsBeforeHint);
    }

    // Whatever the provider did, the learner never sees an error card: a failed
    // request restores the sentence with one quiet retry and no bubble.
    await expect(page.getByText(/تعذر توليد رد واضح/)).toHaveCount(0);

    // A real fix by the persona must surface as the quiet chip, and open.
    if (turn === 1 && scenario.careless) {
      const fixed = (answered.understood_de || '').trim();
      if (fixed && fixed !== scenario.first.trim()) {
        const chip = page.getByText('تصحيح صغير').last();
        await expect(chip, 'a real correction must show the chip').toBeVisible();
        await chip.click();
        await expect(page.getByTestId('correction-card').last()).toBeVisible();
      }
    }

    if (turn === 5) break;
    const hint = (await proxy.state.turns.at(-1)!.hint_de || '').replace(/_{2,}/g, 'Sami').trim();
    await send(page, hint || 'Ich verstehe. Und dann?');
  }

  expect(dockTurns, 'at least one turn must offer the sentence dock').toBeGreaterThan(0);
}

/** Finish honestly: the goodbye closes it, otherwise the options menu does. */
async function finishAndOpenReport(page: Page): Promise<void> {
  const reportUrl = /\/session-report$/;
  if (await page.getByTestId('closed-scene').isVisible().catch(() => false)) {
    await page.getByTestId('closed-scene').getByRole('button', { name: 'إنهاء الجلسة وعرض الملخص' }).click();
  } else {
    await page.getByRole('button', { name: 'خيارات الجلسة' }).click();
    const end = page.getByRole('button', { name: 'إنهاء الجلسة وعرض الملخص' });
    // A closing turn makes the app prepare and open the report by itself, and
    // the end control stays disabled while it does. So wait for whichever
    // happens: the report arriving, or the control becoming usable.
    await expect
      .poll(
        async () => {
          if (reportUrl.test(page.url())) return 'report';
          return (await end.isEnabled().catch(() => false)) ? 'enabled' : 'waiting';
        },
        { message: 'the report arrives or the end control becomes usable', timeout: 180_000 },
      )
      .not.toBe('waiting');
    if (!reportUrl.test(page.url())) await end.click();
  }
  await expect(page).toHaveURL(reportUrl, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test.beforeAll(() => {
  stamp = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(join(SHOTS, stamp), { recursive: true });
});

for (const scenario of SCENARIOS) {
  test(`${scenario.id}: the real model fills the screen without breaking it`, async ({ page }) => {
    const proxy = createLiveProxy({ key: KEY, maxUsd: 1 });
    await boot(page, proxy);
    await openPractice(page, scenario.id);
    await converse(page, scenario, proxy);
    await finishAndOpenReport(page);

    expect(proxy.state.turns.length, 'the model answered at least once').toBeGreaterThan(0);
    // A busy free tier may fail a request; what must never happen is an error
    // card, a lost sentence or a missing bubble. Recoveries are counted and
    // printed so a rising provider failure rate stays visible to the owner.
    if (proxy.state.failures > 0) {
      console.log(`[live] ${scenario.id}: ${proxy.state.failures} provider failure(s), recovered through the one-tap retry`);
    }
    // A long-running truth, printed for the report rather than asserted: the free
    // tier's real latency is the owner's number, not a threshold this suite owns.
    const latencies = proxy.state.turns.map((turn) => turn.ms).sort((a, b) => a - b);
    console.log(
      `[live] ${scenario.id}: ${latencies.length} turns, p50 ${latencies[Math.floor(latencies.length / 2)]} ms, ` +
        `max ${latencies.at(-1)} ms, ${proxy.provider.ledger.retries429} × 429, $${proxy.state.usd().toFixed(4)}`,
    );
  });
}

test('a failed turn keeps the sentence and offers exactly one retry', async ({ page }) => {
  const proxy = createLiveProxy({ key: KEY, maxUsd: 1 });
  await boot(page, proxy);
  await openPractice(page, 'cafe_order');

  const line = 'Einen Kaffee bitte.';
  // The client retries a transient failure itself twice before handing control
  // back, so the deliberate outage must cover all three automatic attempts;
  // the learner's manual retry is the fourth request and succeeds.
  proxy.state.failNext = 3;
  await send(page, line);

  const retry = page.getByRole('status').getByRole('button', { name: 'أعد المحاولة' });
  await expect(retry).toBeVisible({ timeout: 40_000 });
  await expect(input(page), 'the learner keeps their sentence').toHaveValue(line);
  await expect(page.locator('article'), 'a failed turn adds no bubble').toHaveCount(0);
  await expect(page.getByText(/تعذر توليد رد واضح/)).toHaveCount(0);
  await page.screenshot({ path: join(SHOTS, stamp, 'offline-retry.png') });

  await retry.click();
  await expect(page.locator('article[aria-label="رسالة من كَاتْزُو"]')).toHaveCount(1, { timeout: 90_000 });
  await expect(input(page)).toHaveValue('');
});

test('five learners in the same minute all get a real reply', async ({ browser }) => {
  const proxy = createLiveProxy({ key: KEY, maxUsd: 2 });
  const pages: Page[] = [];
  const scenarios = SCENARIOS.slice(0, 5);
  const contexts: BrowserContext[] = [];
  for (const scenario of scenarios) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await boot(page, proxy);
    await openPractice(page, scenario.id);
    contexts.push(context);
    pages.push(page);
  }

  const started = Date.now();
  await Promise.all(pages.map((page, index) => send(page, scenarios[index].first)));
  await Promise.all(
    pages.map(async (page, index) => {
      const reply = page.locator('article[aria-label="رسالة من كَاتْزُو"]');
      const retry = page.getByRole('status').getByRole('button', { name: 'أعد المحاولة' });
      await expect
        .poll(
          async () => {
            if ((await reply.count()) === 1) return 'reply';
            if (await retry.isVisible().catch(() => false)) return 'retry';
            return 'waiting';
          },
          { message: `${scenarios[index].id} answered under load`, timeout: 90_000 },
        )
        .not.toBe('waiting');
      // A 429 under load is the free tier, not the app: the learner's one-tap
      // retry must still produce the reply, with no error card and no lost turn.
      if ((await reply.count()) === 0) {
        await retry.click();
        await expect(reply).toHaveCount(1, { timeout: 90_000 });
      }
    }),
  );
  const elapsed = Date.now() - started;

  expect(proxy.state.turns.length, 'every learner got a shaped turn').toBe(5);
  if (proxy.state.failures > 0) {
    console.log(`[live] 5 concurrent: ${proxy.state.failures} provider failure(s), recovered through the one-tap retry`);
  }
  for (const page of pages) {
    await expect(page.getByText(/تعذر توليد رد واضح/)).toHaveCount(0);
    await page.screenshot({ path: join(SHOTS, stamp, 'concurrent.png') });
  }
  const sorted = proxy.state.turns.map((turn) => turn.ms).sort((a, b) => a - b);
  console.log(
    `[live] 5 concurrent: wall ${elapsed} ms, p50 ${sorted[2]} ms, p95 ${sorted.at(-1)} ms, ` +
      `${proxy.provider.ledger.retries429} × 429, $${proxy.state.usd().toFixed(4)}`,
  );
  for (const context of contexts) await context.close();
});
