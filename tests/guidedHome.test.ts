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
    // Two conditions, both required: something due, and the first session done.
    // `mission.kind !== 'review'` stays because when review IS the mission the
    // row would be a second CTA for the same thing.
    expect(source).toContain(
      "{dueCount > 0 && mission.kind !== 'review' && (!guided || firstSessionDone) && (",
    );
    expect(source).toContain('const firstSessionDone');
  });
});
