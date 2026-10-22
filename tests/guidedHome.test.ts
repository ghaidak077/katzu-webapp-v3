import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveGuidedHome } from '../src/lib/flags/guidedHome';

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
    // The hero's one action, the chapter path and the daily tasks are never
    // conditioned on the flag: they are what the guided home keeps.
    expect(source).toMatch(/<PrimaryAction[\s\S]{0,200}\{mission\.ctaAr\}/);
    expect(source).toContain('<ProgressStrip');
    expect(source).toMatch(/<DailyTasksPanel snapshot=\{dailyTasks\}/);
  });

  it('keeps the review-due row for a learner with a completed session', () => {
    // Two different questions, both required to be the ones written down:
    //  - the sheet lists what is due once a session is finished (a menu entry,
    //    not a CTA), so it can coexist with a review hero;
    //  - the inline row is a competing CTA, so it still stands down when review
    //    IS today's mission — the rule it shipped with, untouched.
    expect(source).toContain('const sheetReviewCount = dueCount > 0 && firstSessionDone ? dueCount : 0');
    expect(source).toContain('const firstSessionDone = completedEpisodes > 0');
    expect(source).toContain("reviewDueCount={sheetReviewCount}");
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
    expect(home).toContain('guided && !firstSessionDone');
    expect(home).toContain('completedScenarioIds: guided ? completedScenarioIds : []');
  });

  it('the skip link is first-run only, flag-gated, and invents no goal', () => {
    expect(onboarding).toContain('mode === \'first_run\' && isGuidedHomeEnabled() && (');
    expect(onboarding).toContain('تخطَّ الأسئلة وابدأ الآن');
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
