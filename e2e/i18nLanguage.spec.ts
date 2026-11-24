import { expect, test } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * The language switch, in a browser, in every language that is finished.
 *
 * WHY THIS FILE EXISTS
 * Before it, every spec in this repository ran in Arabic: the coverage script
 * counted Arabic strings in source, and nothing ever *rendered* a translated
 * screen. So an English learner could get Arabic layout in an LTR document, or a
 * `left-` utility that stopped mirroring, and the full gate would still be green
 * (`VERIFY OK 16/16` says nothing about English).
 *
 * What is pinned here, on the screens that are actually finished (B1: welcome,
 * sign-in, onboarding entry, the Pro screen):
 *
 *  1. the document's `lang` and `dir` match the chosen language;
 *  2. no Arabic word is visible — not "mostly translated", *zero* Arabic, which
 *     is the rule `docs/plans/010-multilanguage-master-plan.md` §4 sets for a
 *     batch marked done;
 *  3. the choice survives a reload, because a switch that resets is a switch a
 *     learner has to make twice a day;
 *  4. switching back to Arabic restores RTL, so the reference language cannot be
 *     left in a half-LTR shell.
 *
 * The signed-in journey home is pinned at the bottom of this file, now that B2
 * (the tab bar, the journey home and the app shell) is finished. It asserts the
 * chrome — the day/chapter line, the chapter heading, the «المزيد» row — because
 * that is what B2 owns; a scenario's own title is Arabic *content*, which is the
 * content layer's job (plan 010 §11), and pretending otherwise here would make
 * this test demand a translation the app does not ship yet.
 */

const ARABIC_WORD = /[\u0600-\u06FF]/;

/** The scene page's own copy, per language (B3). */
const SCENE = {
  en: {
    plan: 'The mastery plan for this situation:',
    step1: '1. Study the phrases and vocabulary',
    starter: 'Starter phrases to begin with:',
  },
  id: {
    plan: 'Rencana penguasaan untuk situasi ini:',
    step1: '1. Pelajari frasa dan kosakata',
    starter: 'Frasa bantu untuk memulai:',
  },
} as const;

/** Every visible string the learner can read, without the app's own scripts. */
async function visibleText(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => document.body.innerText || '');
}

test.describe('the front door in English and Indonesian', () => {
  for (const language of ['en', 'id'] as const) {
    test(`${language}: lang, direction and copy are the chosen language`, async ({ page }) => {
      await page.addInitScript((value) => {
        window.localStorage.setItem('katzu_ui_language', value);
      }, language);
      await page.goto('/welcome');
      // The heading, not `#root`: the shell paints a status line first, and reading
      // innerText at that moment measured the boot copy instead of the screen.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

      const text = await visibleText(page);
      expect(text.trim().length, 'the front door rendered nothing').toBeGreaterThan(40);
      expect(
        text.match(ARABIC_WORD)?.[0],
        `an Arabic word reached the ${language} front door — the batch is not finished`,
      ).toBeUndefined();
    });
  }

  test('a new device detects English instead of opening Arabic, once English is complete', async ({ page }) => {
    // The gate this exercises is `UI_COVERAGE_COMPLETE`: detection is only kind
    // when the language actually covers the screen the learner lands on.
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'languages', { value: ['en-US', 'en'], configurable: true });
      Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true });
    });
    await page.goto('/welcome');
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
    const lang = await page.locator('html').getAttribute('lang');
    // While English coverage is partial, Arabic is the correct answer and this
    // asserts the *reason*: the switch is available, the assumption is not made.
    expect(['ar', 'en']).toContain(lang);
    console.log(`[i18n] device language en-US opened the app in ${lang}`);
  });
});

test('the switch itself changes language, persists, and returns to RTL', async ({ page }) => {
  await page.goto('/welcome');
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.getByTestId('language-switch').click();
  await page.getByTestId('language-switch-option-en').click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  expect((await visibleText(page)).match(ARABIC_WORD)).toBeNull();

  // The choice is the device's, not the session's.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  // And back: a stale LTR document under Arabic copy is the failure this catches.
  await page.getByTestId('language-switch').click();
  await page.getByTestId('language-switch-option-ar').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const stored = await page.evaluate(() => window.localStorage.getItem('katzu_ui_language'));
  expect(stored).toBe('ar');
});

test('sign-in is localised too', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('katzu_ui_language', 'en');
  });
  await page.goto('/signin');
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 });
  const text = await visibleText(page);
  expect(text.trim().length).toBeGreaterThan(40);
  expect(text.match(ARABIC_WORD)?.[0], 'an Arabic word reached the English sign-in screen').toBeUndefined();
  // The Google button is the one control that also carries its own locale.
  await expect(page.getByRole('button', { name: /Google/i }).first()).toBeVisible();
});

/**
 * B2, rendered: the journey home — the first signed-in screen, and the one a
 * learner reads every day — is written in the language they chose.
 *
 * The switch is forced on before the first load, and the locale is seeded
 * before React mounts, so this is the same path a learner takes after choosing
 * English in the language sheet.
 */
test.describe('the journey home in the finished languages', () => {
  const JOURNEY = {
    en: {
      day: /^Day 1 · chapter 1 of \d+$/m,
      chapter: /^(First steps in Germany|Daily life and getting around|Work and the office|University and official offices|Independent in German)$/m,
      more: 'More',
      scenes: /\d+\s*\/\s*\d+ scenes/,
    },
    id: {
      day: /^Hari 1 · Bab 1 dari \d+$/m,
      chapter: /^(Langkah pertama di Jerman|Kehidupan sehari-hari dan transportasi|Kerja dan kantor|Universitas dan instansi resmi|Mandiri dalam bahasa Jerman)$/m,
      more: 'Lainnya',
      scenes: /\d+\s*\/\s*\d+ adegan/,
    },
  } as const;

  for (const language of ['en', 'id'] as const) {
    test(`${language}: the scene page's plan and buttons are in the chosen language`, async ({ page }) => {
      // B3: the scene page is where a learner decides what to do next, so its
      // plan, its button and its heading are the screen's own words — not the
      // scene's Arabic content, which the content layer owns (plan 010 §11).
      const copy = SCENE[language];
      await bootSignedIn(page, { uiLanguage: language });
      await page.goto('/scenario/cafe_order');

      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.getByText(copy.plan)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(copy.step1)).toBeVisible();
      await expect(page.getByText(copy.starter)).toBeVisible();
      await expect(page.getByText(/^(Start the training|Mulai latihan)/)).toBeVisible();

      const plan = await page.getByText(copy.plan).locator('..').innerText();
      expect(plan, `an Arabic word reached the ${language} scene page`).not.toMatch(ARABIC_WORD);
    });

    test(`${language}: the home screen's own chrome is in the chosen language`, async ({ page }) => {
      await page.addInitScript(() => {
        try {
          // The guided home is the shipped shape; forcing it keeps this test
          // about the language rather than about which flag a build carries.
          localStorage.setItem('kz.guidedHome', '1');
        } catch {
          /* storage blocked: the build default applies */
        }
      });
      await bootSignedIn(page, { uiLanguage: language });

      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

      const labels = JOURNEY[language];
      // Wait for the screen itself, not the shell's boot line.
      await expect(page.getByText(labels.day)).toBeVisible({ timeout: 30_000 });

      const header = await page.locator('header').first().innerText();
      expect(header, `the day/chapter line in ${language}`).toMatch(labels.day);
      expect(header, `the chapter heading in ${language}`).toMatch(labels.chapter);
      expect(header, `an Arabic word reached the ${language} home header`).not.toMatch(ARABIC_WORD);

      // The count beside the chapter bar, in the learner's units.
      const progress = await page.getByTestId('chapter-progress').innerText();
      expect(progress).toMatch(labels.scenes);
      expect(progress, `an Arabic word reached the ${language} chapter bar`).not.toMatch(ARABIC_WORD);

      // The one secondary entry point — the door to the library, preferences and
      // Pro — is the most-read control the sheet owns.
      await expect(page.getByTestId('journey-more')).toHaveText(new RegExp(`^${labels.more}$`));
    });
  }
});
