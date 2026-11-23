import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveGuidedHome } from '../src/lib/flags/guidedHome';
import { ONBOARDING_SKIP_SOURCE } from '../src/lib/analytics/events';
import { isDayZeroOpening } from '../src/lib/journey/firstSession';
import { UI_STRINGS } from '../src/lib/i18n/strings';

/**
 * `guidedHome` decides whether a brand-new learner sees the guided home or the
 * screen that shipped before it. Both answers are load-bearing:
 *
 *   - ON, because the owner's complaint is that the first screen cannot say what
 *     to do first;
 *   - OFF, because "OFF must be today's screen exactly" is the reason the flag
 *     exists — a switch that cannot restore the old behaviour is not a switch.
 *
 * The decision is a pure function, so all four precedence cases are proven here
 * without a browser or a build. What those cases cannot prove (that the screen
 * actually renders differently) is proven in `e2e/guidedHome.spec.ts`, which
 * flips the device switch before the page loads and reads the DOM.
 */
describe('guidedHome: which source wins', () => {
  it('a device switch of 1 turns it on, whatever the build says', () => {
    expect(resolveGuidedHome({ stored: '1', envValue: '0', isDev: false })).toBe(true);
  });

  it('a device switch of 0 turns it off, whatever the build says', () => {
    expect(resolveGuidedHome({ stored: '0', envValue: '1', isDev: true })).toBe(false);
  });

  it('with no device value, the build variable decides', () => {
    expect(resolveGuidedHome({ stored: null, envValue: '1', isDev: false })).toBe(true);
    expect(resolveGuidedHome({ stored: null, envValue: '0', isDev: true })).toBe(false);
  });

  it('with no switch and no build variable, a shipped bundle stays OFF', () => {
    expect(resolveGuidedHome({ stored: null, envValue: undefined, isDev: false })).toBe(false);
  });

  it('a dev server shows it without anybody setting a variable', () => {
    expect(resolveGuidedHome({ stored: null, envValue: undefined, isDev: true })).toBe(true);
  });

  it('junk in storage is not a decision — the build default stands', () => {
    expect(resolveGuidedHome({ stored: 'yes', envValue: undefined, isDev: false })).toBe(false);
    expect(resolveGuidedHome({ stored: '', envValue: undefined, isDev: true })).toBe(true);
  });
});

/**
 * The screen side of the contract: the six secondary blocks are gated on the
 * flag, and the hero/path/tasks are not. A source assertion is the cheap guard
 * here because `e2e/guidedHome.spec.ts` proves the rendered result; this stops a
 * future edit from "tidying" one of the gates away.
 */
describe('JourneyHomeScreen consults the flag', () => {
  const source = readFileSync('src/features/journey/JourneyHomeScreen.tsx', 'utf8');

  it('imports the flag and reads it once per render', () => {
    expect(source).toContain("from '@/lib/flags/guidedHome'");
    expect(source).toContain('const guided = isGuidedHomeEnabled()');
  });

  it('gates the six secondary blocks on it, and nothing that must stay', () => {
    for (const gated of [
      '{!guided && !isPro && (',
      '{!guided && user?.isLoggedIn',
      '{!guided && katzuLineAr && (',
      '{!guided && (latestCapability ? (',
      '{!guided && weeklyRecap.episodes > 0 && (',
      '{!guided && (<div className="flex flex-wrap items-center gap-2">',
    ]) {
      expect(source, gated).toContain(gated);
    }
    // The hero's one action and the chapter path are never conditioned on the
    // flag: they are what the guided home keeps. The daily-task panel is the
    // habit underneath the hero and appears with the first finished session
    // (step 7) — with the flag off it is unconditional, as shipped.
    expect(source).toMatch(/<PrimaryAction[\s\S]{0,200}\{mission\.ctaAr\}/);
    expect(source).toContain('<ProgressStrip');
    expect(source).toContain('const showTasksCard = !guided || firstSessionDone;');
    expect(source).toMatch(/\{showTasksCard && \(/);
    expect(source).toContain('snapshot={dailyTasks}');
  });

  it('keeps one review door on the home, and never before day 2', () => {
    // The hero is always the next scene when the flag is on, so on a review day
    // the home's one door to the queue is the ghost row. The sheet may list it
    // too (it is a menu, not a second CTA on this screen); with the flag off the
    // hero can be the review and the sheet yields to it.
    expect(source).toContain('const reviewRevealed = isReviewRevealed({');
    expect(source).toContain('dayNumber: context.dayNumber,');
    expect(source).toContain('const sheetReviewEntryCount = sheetReviewCount({');
    expect(source).toContain("missionIsReview: !guided && mission.kind === 'review',");
    expect(source).toContain('guided && !reviewRevealed');
    expect(source).toContain('{guided && firstSessionDone && reviewRevealed && dueCount > 0 && (');
    // The shared first-session fact (Decision A): the home hands the sheet the
    // same boolean the tab lock reads, so the two surfaces cannot disagree.
    expect(source).toContain('const firstSessionDone = isFirstSessionDone({');
    expect(source).toContain('sessionCount: completedEpisodes,');
    expect(source).toContain("reviewDueCount={sheetReviewEntryCount}");
    expect(source).toContain("{dueCount > 0 && mission.kind !== 'review' && !guided && (");
  });

  it('hides the Pro chip until the first completed session, then offers it in «المزيد»', () => {
    // The 1a deviation: the header chip was dropped outright, so the offer never
    // came back. It is back on the documented rule (`shouldOfferPro`: after a
    // real episode, never before it) and lives in the sheet, because the guided
    // header is orientation only.
    expect(source).toContain('const proOfferVisible = shouldOfferPro({ isPro, completedEpisodes });');
    expect(source).toContain('proOfferVisible={proOfferVisible}');
    expect(source).toContain('{!guided && !isPro && (');
  });

  it('day 0 in the sheet: the library alone, because the skills are behind the tab lock', () => {
    // Step 1c. The Practice tab is locked until the first finished conversation,
    // and grammar/listening/writing/coach are that tab's screens — a sheet that
    // listed them on day 0 would be a side door around the lock. Same fact, one
    // gate: `firstSessionDone`, which the home screen computes from recorded
    // sessions only.
    const sheet = readFileSync('src/features/journey/JourneyMoreSheet.tsx', 'utf8');
    for (const surface of ['Grammar', 'Listening', 'Writing', 'Coach']) {
      expect(sheet, `${surface} must be gated on firstSessionDone`).toContain(
        `{firstSessionDone && onOpen${surface} && (`,
      );
    }
    // The library is the one destination day 0 keeps, and it is not gated.
    const libraryRow = sheet.slice(sheet.indexOf('testId="more-library"') - 220, sheet.indexOf('testId="more-library"'));
    expect(libraryRow).not.toContain('firstSessionDone');
    // The home screen hands the sheet the same boolean it uses for the review row.
    expect(source).toContain('firstSessionDone={firstSessionDone}');
  });

  it('moves the six blocks into one sheet instead of deleting them', () => {
    expect(source).toContain("import { JourneyMoreSheet } from '@/features/journey/JourneyMoreSheet'");
    expect(source).toContain('data-testid="journey-more"');
    expect(source).toContain('aria-haspopup="dialog"');
    // The entry point is a control, never an automatic open.
    expect(source).not.toMatch(/useEffect\(\(\) => \{\s*setMoreOpen\(true\)/);
  });

  it('the hero reserves its picture box, so a missing banner is not a hole', () => {
    // 140px is held before the image resolves, and the same box carries the
    // scene's light when the content has no artwork: the words under it never
    // move, whether the picture loads, fails, or does not exist.
    expect(source).toContain('data-testid="journey-hero-banner"');
    // The banner hook `e2e/banner.spec.ts` reads: a content editor's
    // `banner_url` must reach the hero, which it only does if this stays the
    // element that draws `scene.artUrl`.
    expect(source).toContain('data-testid="scenario-banner"');
    expect(source).toContain('className="relative h-[140px] w-full overflow-hidden bg-kz-black"');
    // No source (or a failed one) still paints: the violet wash plus the
    // accent glow, never a plain black band.
    expect(source).toContain('kz-hero-glow');
    expect(source).toContain('from-kz-black/85');
    expect(source).toContain('object-cover');
    // Fade-in is keyed to the current source, never to a bare boolean: a new
    // mission must fade its own picture, not inherit the previous one. 200ms is
    // the owner's fade, set inline because it is one number, not a scale.
    expect(source).toContain('loadedArt === scene.artUrl');
    expect(source).toContain("transitionDuration: '200ms'");
  });

  it('one bright action, and every flag-off branch keeps its 52px height', () => {
    // The guided hero has exactly one action with one fixed label, whatever
    // today's mission is: the owner's rule is that the hero continues the story.
    expect(source).toContain('data-testid="journey-primary-action"');
    expect(source).toContain('kz-hero-cta flex w-full items-center justify-center');
    expect(source).toContain("{guided ? 'تابع التعلّم' : heroMission.ctaAr}");
    // The solid fill lives in the class, so it cannot drift back to the
    // translucent `.kz-primary`, and 52px is stated once, next to the fill.
    const css = readFileSync('src/index.css', 'utf8');
    const cta = css.slice(css.indexOf('.kz-hero-cta {'), css.indexOf('.kz-hero-cta:active'));
    expect(cta).toContain('min-height: 52px');
    expect(cta).toContain('border-radius: var(--kz-radius-action)');
    expect(cta).toContain('background-color: rgb(var(--kz-lavender-deep))');
    expect(css).toContain('transform: scale(0.97)');
    // The two remaining `PrimaryAction`s are the honest empty state and the
    // shipped review branch, still on the same 52px height.
    const branches = source.split('<PrimaryAction').slice(1);
    expect(branches, 'the flag-off branches keep one action each').toHaveLength(2);
    for (const branch of branches) {
      expect(branch.slice(0, 60), 'the mission button is 52px, not the 56px default').toContain(
        'min-h-[52px]',
      );
    }
  });

  it('the review row and «المزيد» are flat rows, not surfaces', () => {
    for (const testId of ['journey-review-row', 'journey-more']) {
      const start = source.indexOf(`data-testid="${testId}"`);
      const row = source.slice(start, source.indexOf('</button>', start));
      expect(row, `${testId} is not an accent fill`).not.toContain('bg-kz-lavender');
      expect(row, `${testId} is not a card`).not.toContain('bg-kz-soft-black');
    }
    // The review row's only paint is the hairline under it.
    const review = source.slice(source.indexOf('data-testid="journey-review-row"'));
    expect(review.slice(0, 400)).toContain('border-b border-kz-line');
  });

  it('the review row caps what it prints, and the review screen keeps the backlog', () => {
    // A learner with 156 cards due must not read «156» in a CTA on the home
    // screen: the row is a door, the number is a promise about this sitting.
    expect(source).toContain('const reviewRowCount = Math.min(dueCount, 10);');
    expect(source).toContain('const reviewRowMinutes = Math.min(3, Math.max(1, Math.round(reviewRowCount * 0.3)));');
    expect(source).toContain('arCount(reviewRowCount, REVIEW_ITEM_FORMS)');
    expect(source).not.toMatch(/arCount\(dueCount, REVIEW_ITEM_FORMS\)/);
  });

  it('the hero says the next scene, and review is only the ghost row', () => {
    // The owner's fix (2026-11-20): a review day must not hijack the hero. The
    // hero's plan is selected with no due items to consider and its label is
    // fixed; review keeps its own door under it.
    expect(source).toContain('selectDailyMission({ ...missionInput, reviewItems: [] })');
    expect(source).toContain(": 'المشهد التالي';");
    // The three tasks are all listed, so `0/3` and the visible rows agree.
    const panel = readFileSync('src/features/journey/DailyTasksPanel.tsx', 'utf8');
    expect(panel).not.toContain("status.kind !== 'review'");
    expect(panel).toContain('{statuses.map((status, index) => (');
    // A 24px outline, not a tiny glyph that reads as the letter «C».
    expect(panel).not.toMatch(/import \{[^}]*\bCircle\b/);
    expect(panel).toContain('border border-white/25');
    expect(panel).toContain('text-kz-neon');
  });
});

/**
 * The first-session chain (step 2), as source contracts.
 *
 * The behaviour is proven in `e2e/firstSessionChain.spec.ts`. These assertions
 * guard the three properties a later edit could quietly break: the hop is
 * flag-gated (so OFF is still today's exit), it *resolves* the opening scene
 * rather than assuming its row is on the device, and the day-0 screens do not
 * claim evidence the learner has not produced.
 */
describe('the first-run chain', () => {
  const shell = readFileSync('src/app/AppShell.tsx', 'utf8');
  const home = readFileSync('src/features/journey/JourneyHomeScreen.tsx', 'utf8');
  const onboarding = readFileSync('src/features/onboarding/OnboardingScreen.tsx', 'utf8');

  it('leaves the exit alone when the flag is off', () => {
    expect(shell).toContain('if (!isGuidedHomeEnabled()) {');
    expect(shell).toContain("navigate('/app/trail', { replace: true });");
  });

  it('resolves the opening scene instead of assuming its row exists', () => {
    expect(shell).toContain('resolveOpeningScenarioId(await db.scenarios.toArray())');
    expect(shell).toContain("from '@/lib/journey/opening'");
    // A failed read ends on today's route — never between two screens.
    expect(shell).toMatch(/catch \{[\s\S]{0,400}navigate\('\/app\/trail'/);
  });

  it('defers the review mission on day 0 and reports finished scenes to the selector', () => {
    expect(home).toContain('const completedScenarioIds = useMemo(');
    expect(home).toContain('Object.keys(data?.sessionsByScenario ?? {})');
    // Both corrections ride the flag: OFF keeps the shipped mission logic.
    expect(home).toContain('guided && !reviewRevealed');
    expect(home).toContain('completedScenarioIds: guided ? completedScenarioIds : []');
  });

  it('the skip link is first-run only, flag-gated, and invents no goal', () => {
    // The skip on the FIRST question (Decision G): a quiet GlassButton, gated on
    // the flag and the first-run mode, that walks past the goal question without
    // writing a goal for it. The funnel is told this learner walked past it
    // (`source: 'skip_first'`) rather than that they declined the placement check.
    expect(onboarding).toContain('mode === \'first_run\' && guided && (');
    // Phase 1b moved this copy into the dictionary; the rule follows the string
    // instead of the screen's source, so the label cannot go missing in a
    // translation and the Arabic cannot silently change.
    expect(onboarding).toContain("t('onboarding.goal.skip')");
    expect(UI_STRINGS.ar['onboarding.goal.skip']).toBe('تخطَّ الآن وابدأ');
    // One shared constant for the first-run skip source, used by the screen and
    // asserted here; its value stays the free-string 'skip_first'.
    expect(onboarding).toContain("onClick={() => void save('skip', {}, ONBOARDING_SKIP_SOURCE)}");
    expect(ONBOARDING_SKIP_SOURCE).toBe('skip_first');
    // The second question keeps its own (plain) skip, source 'skip'.
    expect(onboarding).toContain("t('onboarding.skipAll')");
    expect(UI_STRINGS.ar['onboarding.skipAll']).toBe('تخطَّ الأسئلة وابدأ الآن');
    expect(onboarding).toContain("onClick={() => void save('skip')}");
  });

  it('the first question offers no way back out of the flow', () => {
    // The route's onBack is `/welcome` for a first run, so the header control
    // walked a signed-in learner out to the sign-up screen; and there is no first
    // step to return to. Gated, so OFF is the shipped header.
    expect(onboarding).toContain('hideBackOnFirstQuestion = guided && mode === \'first_run\'');
    expect(onboarding).toContain('{hideBackOnFirstQuestion ? (');
    // And the second question's back link returns to the question actually asked.
    expect(onboarding).toContain("setStep(guided && mode === 'first_run' ? 'goal' : 'previous')");
  });

  it('the episode is pushed on top of the home route, so back has somewhere to go', () => {
    const exit = shell.slice(shell.indexOf('resolveOpeningScenarioId(await db.scenarios.toArray())'));
    expect(exit).toContain("navigate('/app/trail', { replace: true });");
    // The story call must NOT replace: it is the entry the back gesture returns from.
    expect(exit).toMatch(/navigate\(`\/scenario\/\$\{encodeURIComponent\(openingId\)\}\/story`\);/);
  });
});

/**
 * The Practice/Progress lock (step 3), as source contracts.
 *
 * The behaviour is proven in `e2e/tabLock.spec.ts`. These assertions guard the
 * properties a later edit could quietly break: the ONE shared first-session fact
 * behind both the «المزيد» sheet and the tab bar (Decision A), the sheet's place
 * OUTSIDE the glass container so it is never a fifth measured tab (Decision C),
 * the exact agreed copy (Decision E), the locked-tab look (Decision F), and that
 * the flag-off branch still renders today's DOM (no extra clauses are consulted).
 */
describe('the Practice/Progress lock (step 3)', () => {
  const shell = readFileSync('src/app/AppShell.tsx', 'utf8');
  const home = readFileSync('src/features/journey/JourneyHomeScreen.tsx', 'utf8');
  const nav = readFileSync('src/features/journey/usePracticeLock.ts', 'utf8');
  const sheet = readFileSync('src/features/journey/PracticeLockSheet.tsx', 'utf8');
  const rule = readFileSync('src/lib/journey/firstSession.ts', 'utf8');

  it('the shared first-session rule drives both the sheet and the tab lock', () => {
    expect(home).toContain("import { isFirstSessionDone } from '@/lib/journey/firstSession'");
    expect(nav).toContain("import { isFirstSessionDone } from '@/lib/journey/firstSession'");
    expect(shell).toContain(
      "import { usePracticeLock, type PracticeLock } from '@/features/journey/usePracticeLock'",
    );
    expect(shell).toContain("import { PracticeLockSheet } from '@/features/journey/PracticeLockSheet'");
  });

  it('the lock sheet is a sibling of the nav, never a child of the tab bar', () => {
    const afterNav = shell.slice(shell.indexOf('</nav>'));
    // The nav closes and ONLY then the sheet mounts: a sheet inside the bar
    // would be a fifth segment of the flex row, and inside the nav's box it
    // could be clipped by the safe-area padding.
    expect(afterNav).toMatch(/<\/nav>[\s\S]*?<PracticeLockSheet/);
  });

  it('the lock copy is the exact agreed text, with no bypass', () => {
    expect(sheet).toContain('هذا القسم يفتح بعد أول محادثة');
    expect(sheet).toContain('محادثة واحدة قصيرة تكفي — وبعدها كل ما هنا مفتوح.');
    expect(sheet).toContain('ابدأ أول محادثة');
    expect(sheet).toContain('لاحقاً');
    // The primary resolves the SAME opening episode the onboarding hop uses.
    expect(sheet).toContain('resolveOpeningScenarioId(await db.scenarios.toArray())');
    expect(sheet).toContain("navigate(`/scenario/${encodeURIComponent(openingId)}/story`)");
    // No "open anyway": the tabs stay closed until the conversation is finished.
    expect(sheet).not.toContain('افتحه');
    expect(sheet).not.toContain('أي حال');
  });

  it('a locked tab keeps its ink and adds only a badge, never opacity or disabled', () => {
    expect(shell).toContain("aria-disabled={locked ? 'true' : undefined}");
    // The accessible name is still a sentence in the learner's language, but it
    // now comes from the UI dictionary (`nav.lockedHint`) so the tab bar can be
    // read in English and Indonesian too. Both halves are pinned: the call site,
    // and the Arabic wording the owner agreed to.
    expect(shell).toContain("aria-label={locked ? t('nav.lockedHint', { label }) : undefined}");
    expect(UI_STRINGS.ar['nav.lockedHint']).toBe('{label} — مقفل حتى أول محادثة');
    expect(shell).toContain('aria-hidden="true"');
    expect(shell).toContain('data-testid={`tab-lock-${tabKey}`}');
    expect(shell).toContain("active ? 'text-kz-lavender' : 'text-kz-inkFaint'");
    expect(shell).not.toContain('opacity-');
  });

  it('the flag-off branch is untouched: the extra clauses are gated on guided', () => {
    expect(rule).toContain('if (!input.guided) return false;');
    expect(nav).toContain('guided &&');
    // With the flag off `locked` is always false, so the tab is never marked.
    expect(nav).toContain('const locked =');
    expect(nav).toContain('guided &&');
  });
});

/**
 * Story Setup (step 4b): the episode opening's day-0 copy, and the rule behind it.
 *
 * The behaviour is proven in e2e. These assertions guard what a later edit could
 * quietly break. The day-0 decision is a pure function that reads the SAME shared
 * first-session fact the home hero and the locks use, but refuses day 0 with the
 * flag off or while the count is still loading — so a flag-off build stays
 * byte-for-byte the old hint and a returning learner never flashes the day-0 line.
 * The two agreed copy strings (day-0: no test, no judgement; returning: continue
 * framing) stay in the screen, and the label is asserted in the e2e suite.
 */
describe('Story Setup: the day-0 opening copy (step 4b)', () => {
  const story = readFileSync('src/features/journey/StorySetupScreen.tsx', 'utf8');

  it('gates the day-0 copy on the shared rule the home hero and locks use', () => {
    expect(story).toContain("import { isDayZeroOpening } from '@/lib/journey/firstSession'");
    expect(story).toContain("import { isGuidedHomeEnabled } from '@/lib/flags/guidedHome'");
    expect(story).toContain('const dayZero = isDayZeroOpening({ guided, sessionCount, user });');
  });

  it('passes the count RAW — a still-loading count must never be decided as day 0', () => {
    // The screen hands the unresolved query result to the rule as-is. A `?? 0` here
    // would turn a still-loading returning learner into day 0 on first paint and
    // silently defeat the loading guard inside `isDayZeroOpening`.
    expect(story).toContain('const sessionCount = useLiveQuery(() => db.sessions.count(), []);');
    expect(story).not.toContain('?? 0');
    expect(story).not.toContain('??0');
  });

  it('still carries the two agreed copy strings', () => {
    expect(story).toContain('ستستمع أولاً، ثم تتحدث أنت — لا يوجد اختبار ولا حكم.');
    expect(story).toContain('خطوتان قصيرتان ثم تبدأ المحادثة.');
  });
});

describe('isDayZeroOpening (step 4b): the day-0 decision', () => {
  it('guided off is never day 0, even with a zero count', () => {
    expect(isDayZeroOpening({ guided: false, sessionCount: 0, user: { freeSessionsRemaining: 3 } }))
      .toBe(false);
    expect(isDayZeroOpening({ guided: false, sessionCount: 4, user: undefined })).toBe(false);
  });

  it('a still-loading count is never day 0', () => {
    expect(isDayZeroOpening({ guided: true, sessionCount: undefined, user: undefined })).toBe(false);
    expect(isDayZeroOpening({ guided: true, sessionCount: null, user: { freeSessionsRemaining: 3 } }))
      .toBe(false);
  });

  it('day 0: guided, known zero count, not Pro, free allowance left', () => {
    expect(isDayZeroOpening({ guided: true, sessionCount: 0, user: { freeSessionsRemaining: 3 } }))
      .toBe(true);
    expect(isDayZeroOpening({ guided: true, sessionCount: 0, user: { freeSessionsRemaining: 1 } }))
      .toBe(true);
  });

  it('after one finished conversation it is not day 0', () => {
    expect(isDayZeroOpening({ guided: true, sessionCount: 1, user: { freeSessionsRemaining: 3 } }))
      .toBe(false);
    expect(isDayZeroOpening({ guided: true, sessionCount: 6, user: undefined })).toBe(false);
  });

  it('a Pro learner is not day 0 even with no finished conversation', () => {
    expect(isDayZeroOpening({ guided: true, sessionCount: 0, user: { isSubscriptionActive: true } }))
      .toBe(false);
  });

  it('a learner whose free allowance is spent is not day 0', () => {
    expect(isDayZeroOpening({ guided: true, sessionCount: 0, user: { freeSessionsRemaining: 0 } }))
      .toBe(false);
  });
});
