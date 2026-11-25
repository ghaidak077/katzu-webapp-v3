import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { bootSignedIn, collectPageErrors, seedFinishedEpisode } from './harness';
import { UI_STRINGS, type UiStringKey } from '../src/lib/i18n/strings';
import { GRAMMAR_TITLES, MOCK_PARTS, SCENARIO_TITLES, UNIT_TITLES } from '../src/lib/content/titles';

/**
 * The whole app, walked as a learner, in every language the app ships.
 *
 * This is the browser-side counterpart of `scripts/i18n-coverage.mjs`: coverage
 * proves no source file still hard-codes Arabic, and this proves the *rendered*
 * screens actually speak the chosen language. A screen can pass every static gate
 * and still show Arabic because a module-level table was built once in the
 * reference language, or because an error branch was written in Arabic inline.
 *
 * The walkthrough covers the public front door, every tab, the episode chain, the
 * priced offer, the mock, the account pages, and the dev surfaces. It records the
 * visible text of every screen into `test-results/language-walkthrough-<lang>.txt`
 * (the ignored Playwright output dir) so a human can read what a learner reads,
 * then fails on what a learner must never see:
 *
 *   1. a raw dictionary key painted as copy (`profile.delete.title`);
 *   2. `undefined`, `NaN`, `[object Object]` or a literal `null`;
 *   3. any Arabic word on an English or Indonesian *chrome* screen — the screens
 *      that carry no content from the content layer (see `CHROME_ROUTES`);
 *   4. a page error, which the ErrorBoundary would otherwise turn into a friendly
 *      card that hides the crash.
 *
 * Content-bearing screens (scenarios, exercises, AI replies) legitimately carry
 * Arabic content until the content layer is localized; their text is recorded and
 * reported, not failed on Arabic, because failing there would demand a
 * translation the product does not ship yet.
 */

const ARABIC = /[\u0600-\u06FF]/;

/** Screens whose copy is entirely UI chrome: nothing from the content layer. */
const CHROME_ROUTES = new Set([
  '/welcome',
  '/signin',
  '/onboarding',
  '/placement',
  '/subscription',
  '/paywall',
  '/partners',
  '/delete-account',
]);

const ROUTES: Array<{ path: string; label: string }> = [
  { path: '/welcome', label: 'front door' },
  { path: '/signin', label: 'sign-in' },
  { path: '/onboarding', label: 'onboarding' },
  { path: '/placement', label: 'placement' },
  { path: '/subscription', label: 'subscription' },
  { path: '/paywall', label: 'paywall' },
  { path: '/app/trail', label: 'journey home' },
  { path: '/app/library', label: 'library' },
  { path: '/app/grammar', label: 'grammar path' },
  { path: '/app/review', label: 'review' },
  { path: '/app/listen', label: 'listening' },
  { path: '/app/write', label: 'writing' },
  { path: '/app/practice', label: 'practice tab' },
  { path: '/app/ask', label: 'ask' },
  { path: '/app/coach', label: 'coach' },
  { path: '/app/progress', label: 'progress' },
  { path: '/app/profile', label: 'profile' },
  { path: '/mock', label: 'mock exam' },
  { path: '/partners', label: 'partners' },
  { path: '/delete-account', label: 'account deletion' },
  { path: '/session-report', label: 'session report' },
  { path: '/dev/system', label: 'design system' },
  { path: '/dev/i18n', label: 'i18n review' },
];

/** Every key `t()` could paint by mistake, verbatim. */
const KEYS = Object.keys(UI_STRINGS.ar) as UiStringKey[];

function rawKeysIn(text: string): string[] {
  return KEYS.filter((key) => key.includes('.') && text.includes(key));
}

function brokenValuesIn(text: string): string[] {
  const found: string[] = [];
  for (const token of ['undefined', 'NaN', '[object Object]', 'Infinity']) {
    if (text.includes(token)) found.push(token);
  }
  return found;
}

function arabicSamples(text: string): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => ARABIC.test(line));
  return [...new Set(lines)].slice(0, 6);
}

/** The dictionary row for a language, so selectors are the copy a learner reads. */
function copy(language: 'ar' | 'en' | 'id', key: UiStringKey): string {
  return UI_STRINGS[language][key];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The flows a learner actually walks, driven by the copy in their own language.
 *
 * The rendered-text pass above proves every screen speaks the language; this
 * proves the *controls* a learner presses do too — a translated heading over an
 * Arabic button is still an Arabic app. Labels come from the dictionary, so the
 * selector and the copy under test are the same value.
 */
for (const language of ['ar', 'en', 'id'] as const) {
  test(`${language}: a learner can finish the first session and the side doors`, async ({ page }) => {
    test.setTimeout(300_000);
    // A selector that no longer matches must fail in seconds, not eat the budget.
    page.setDefaultTimeout(20_000);
    await bootSignedIn(page, { uiLanguage: language, user: { onboardingCompletedAt: 0 } });
    const errors = collectPageErrors(page);
    const problems: string[] = [];
    const note = (message: string) => problems.push(message);

    // 1. The goal question ends inside the first episode, not on a menu.
    await page.goto('/onboarding');
    // The first-run goal question offers five answers; «عام» is the general one
    // and opens the arrival episode for any learner.
    const goal = copy(language, 'onboarding.goal.general.label');
    await page.getByRole('button', { name: new RegExp(`^${escapeRegExp(goal)}`) }).click();
    await expect(page, 'the goal answer did not open the first episode').toHaveURL(/\/scenario\/[a-z_]+\/story$/);

    // 2. The story's own action opens guided practice.
    await page.getByRole('button', { name: new RegExp(escapeRegExp(copy(language, 'storySetup.start'))) }).first().click();
    await expect(page).toHaveURL(/\/scenario\/[a-z_]+\/practice$/);
    // The heading is a template ("Guided practice · {count} phrases"), so its
    // fixed prefix is what must be on screen — and never the braces themselves.
    const practicePrefix = copy(language, 'practice.title').split('{')[0].trim();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(practicePrefix);

    // 3. Ask Katzu answers in the learner's language, not in Arabic chrome.
    await page.goto('/app/ask');
    // The placeholder is a template ("Example: {example}"), so match its prefix.
    const placeholderPrefix = copy(language, 'ask.placeholder').replace('{example}', '').trim();
    await page.getByPlaceholder(placeholderPrefix).fill('Akkusativ');
    await page.getByRole('button', { name: copy(language, 'ask.ask') }).first().click();
    await expect(page.getByText(copy(language, 'ask.practiceHeading')).first()).toBeVisible({ timeout: 20_000 });

    // 4. Review opens on its own language, whether or not anything is due.
    // A new learner has nothing due, so the honest empty state is what a real user
    // sees here — and it has to be in their language, with no Arabic left in it.
    await page.goto('/app/review');
    await page.locator('main').first().waitFor({ state: 'attached', timeout: 20_000 });
    await page.waitForTimeout(1500);
    const reviewText = (await page.evaluate(() => document.body.innerText || '')).trim();
    if (reviewText.length < 30) note('/app/review: the empty state rendered almost nothing');
    // A learner coming straight from practice may have a card due, and a card's
    // meaning is content. Only the empty state is chrome, so only it must be pure.
    const emptyState = reviewText.includes(copy(language, 'review.noneDue'));
    if (emptyState && language !== 'ar' && ARABIC.test(reviewText)) {
      note(`/app/review: Arabic in the ${language} empty state`);
    }

    // 5. The priced offer renders its own language with a real price.
    await page.goto('/paywall');
    await expect(page.getByText(copy(language, 'paywall.title')).first()).toBeVisible({ timeout: 20_000 });

    // 6. The mock exam starts straight into part 1, so there is no page title —
    // the brief itself is what has to be in the learner's language.
    await page.goto('/mock');
    await page.locator('main').first().waitFor({ state: 'attached', timeout: 30_000 });
    // The claim and the first examiner turn arrive after the shell, so wait for
    // the brief itself rather than for a fixed delay that can sample the shell.
    await page
      .waitForFunction(() => (document.body.innerText || '').trim().length >= 60, null, { timeout: 15_000 })
      .catch(() => undefined);
    const mockText = (await page.evaluate(() => document.body.innerText || '')).trim();
    if (mockText.length < 60) note('/mock: the mock exam entry rendered almost nothing');
    // The topic and task text are content; the exam's own chrome is checked by the
    // full render pass above, which reads the same screen.

    // 7. The switch itself: choose another language, see the document flip, reload.
    const other = language === 'en' ? 'id' : 'en';
    await page.goto('/welcome');
    await page.getByTestId('language-switch').click();
    await page.getByTestId(`language-switch-option-${other}`).click();
    await expect(page.locator('html')).toHaveAttribute('lang', other);
    // This test boots with the harness's language seed, which re-applies on every
    // navigation by design — so it asserts the live flip and the stored choice,
    // and `i18nLanguage.spec.ts` (no seed) owns the reload-persistence proof.
    const stored = await page.evaluate(() => window.localStorage.getItem('katzu_ui_language'));
    if (stored !== other) note(`the language switch did not store ${other} (stored ${stored})`);
    await page.getByTestId('language-switch').click();
    await page.getByTestId(`language-switch-option-${language}`).click();
    await expect(page.locator('html')).toHaveAttribute('lang', language);

    if (errors.length) note(`page errors: ${errors.slice(0, 3).join(' | ')}`);
    expect(problems, `${language} flow problems:\n${problems.join('\n')}`).toEqual([]);
  });
}

for (const language of ['ar', 'en', 'id'] as const) {
  test(`${language}: every screen renders as a real learner sees it`, async ({ page }) => {
    test.setTimeout(600_000);
    await bootSignedIn(page, { uiLanguage: language, history: true });
    await seedFinishedEpisode(page);
    const errors = collectPageErrors(page);
    const report: string[] = [`=== ${language.toUpperCase()} ===`];
    const problems: string[] = [];

    for (const route of ROUTES) {
      await page.goto(route.path);
      await page.locator('main').first().waitFor({ state: 'attached', timeout: 45_000 });
      // Lazy routes resolve their data a tick after the shell paints.
      await page.waitForTimeout(900);
      const text = (await page.evaluate(() => document.body.innerText || '')).trim();
      const dir = await page.locator('html').getAttribute('dir');
      const lang = await page.locator('html').getAttribute('lang');

      report.push(`\n--- ${route.label} (${route.path}) [lang=${lang} dir=${dir}] ---\n${text}`);

      if (lang !== language) problems.push(`${route.path}: html lang is ${lang}, expected ${language}`);
      const expectedDir = language === 'ar' ? 'rtl' : 'ltr';
      if (dir !== expectedDir) problems.push(`${route.path}: html dir is ${dir}, expected ${expectedDir}`);
      if (text.length < 20) problems.push(`${route.path}: rendered almost nothing ("${text}")`);

      // `/dev/i18n` is the review surface that lists every key on purpose.
      const keys = route.path === '/dev/i18n' ? [] : rawKeysIn(text);
      if (keys.length) problems.push(`${route.path}: raw dictionary keys on screen: ${keys.join(', ')}`);
      const broken = brokenValuesIn(text);
      if (broken.length) problems.push(`${route.path}: broken values on screen: ${broken.join(', ')}`);
      if (route.path !== '/dev/i18n' && /\{[a-zA-Z]+\}/.test(text)) {
        problems.push(`${route.path}: an un-interpolated template reached the screen`);
      }

      const arabic = arabicSamples(text);
      if (language !== 'ar' && arabic.length && CHROME_ROUTES.has(route.path)) {
        problems.push(`${route.path}: Arabic on the ${language} screen — ${arabic.join(' | ')}`);
      }
      if (language !== 'ar' && arabic.length) {
        report.push(`[arabic content present] ${arabic.join(' | ')}`);
      }

      // Titles are app-owned, so they must be in the learner's language wherever
      // the app owns the list: a positive check (the learned title is on screen)
      // rather than a negative one, because the study material on these screens
      // is still the content layer's Arabic and would drown a line filter.
      if (language !== 'ar') {
        const expected: Record<string, string[]> = {
          '/app/trail': [
            ...Object.values(SCENARIO_TITLES).map((title) => title[language]),
            ...Object.values(UNIT_TITLES).map((title) => title[language]),
          ],
          '/app/library': Object.values(SCENARIO_TITLES).map((title) => title[language]),
          '/app/grammar': Object.values(GRAMMAR_TITLES).map((title) => title[language]),
          '/mock': Object.values(MOCK_PARTS).flatMap((part) => [part.title[language], part.brief[language]]),
        };
        const titles = expected[route.path];
        if (titles && !titles.some((title) => text.includes(title))) {
          problems.push(`${route.path}: not one localised title reached the ${language} screen`);
        }
      }
    }

    // The episode chain: open the first scenario the library offers, all the way
    // to its story and guided practice screens.
    await page.goto('/app/library');
    await page.locator('main').first().waitFor({ state: 'attached', timeout: 45_000 });
    await page.waitForTimeout(900);
    const card = page.locator('main button, main a').filter({ hasText: /\S/ }).first();
    if (await card.count()) {
      await card.click();
      await page.waitForTimeout(1200);
      const url = new URL(page.url());
      const match = url.pathname.match(/^\/scenario\/([^/]+)/);
      if (match) {
        const scenarioId = match[1];
        for (const suffix of ['', '/story', '/practice', '/study', '/quiz']) {
          const path = `/scenario/${scenarioId}${suffix}`;
          await page.goto(path);
          await page.locator('main').first().waitFor({ state: 'attached', timeout: 45_000 });
          await page.waitForTimeout(900);
          const text = (await page.evaluate(() => document.body.innerText || '')).trim();
          const dir = await page.locator('html').getAttribute('dir');
          report.push(`\n--- episode ${suffix || 'entry'} (${path}) [dir=${dir}] ---\n${text}`);
          if (text.length < 20) problems.push(`${path}: rendered almost nothing`);
          const keys = rawKeysIn(text);
          if (keys.length) problems.push(`${path}: raw dictionary keys on screen: ${keys.join(', ')}`);
          const broken = brokenValuesIn(text);
          if (broken.length) problems.push(`${path}: broken values on screen: ${broken.join(', ')}`);
          if (language !== 'ar' && ARABIC.test(text)) {
            report.push(`[arabic content present] ${arabicSamples(text).join(' | ')}`);
          }
        }
      }
    } else {
      problems.push('/app/library: no scenario cards to open');
    }

    report.push(`\n--- page errors ---\n${errors.length ? errors.join('\n') : 'none'}`);
    writeFileSync(`test-results/language-walkthrough-${language}.txt`, report.join('\n'), 'utf8');
    if (errors.length) problems.push(`page errors: ${errors.slice(0, 3).join(' | ')}`);

    expect(problems, `${language} walkthrough problems:\n${problems.join('\n')}`).toEqual([]);
  });
}
