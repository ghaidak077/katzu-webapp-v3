import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { UI_STRINGS } from '../src/lib/i18n/strings';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * V33 — the P2 findings the V32 audit filed as backlog, now closed.
 *
 * These are source assertions on purpose. Each one pins a *requirement* the audit
 * wrote down (a locked row must say why it is locked; a folded group must keep a
 * hint; the preferences prompt must not outrank today's mission), so a future
 * feature that quietly reintroduces the confusion fails here rather than in a
 * learner's first ten minutes.
 */
describe('V33 — locked grammar lessons state the reason inline', () => {
  const source = read('src/features/grammar/GrammarSectionScreen.tsx');

  it('names the unmet prerequisite instead of only saying "locked"', () => {
    expect(source).toContain('lockReason');
    // The reason must be built from the lesson's own prerequisites — naming the
    // holding lesson by title is the one fact that tells the learner what to do.
    expect(source).toMatch(/node\.lesson\.prerequisites/);
  });

  it('renders the reason on the locked row itself', () => {
    expect(source).toMatch(/\{locked && \([\s\S]{0,320}lockReason\(node, path\.nodes, t/);
  });

  it('falls back to plain wording rather than rendering an empty reason', () => {
    expect(source).toContain("return t('grammar.lockPrevious')");
    expect(UI_STRINGS.ar['grammar.lockPrevious']).toBe('الدرس الذي قبله');
  });
});

describe('V33 — Listen and Write number their steps', () => {
  const listening = read('src/features/listening/ListeningScreen.tsx');
  const writing = read('src/features/writing/WritingScreen.tsx');
  const trail = read('src/components/ui/StepTrail.tsx');

  it('the shared indicator marks the current step for assistive tech', () => {
    expect(trail).toContain("aria-current={active ? 'step' : undefined}");
    // The list itself is named, so a screen reader announces "steps" rather
    // than three unlabelled numbers. The name now comes from the dictionary.
    expect(trail).toContain("'a11y.stepTrail'");
    expect(UI_STRINGS.ar['a11y.stepTrail']).toBe('خطوات التدريب');
  });

  it('the indicator is a real list, not a row of divs', () => {
    expect(trail).toContain('<ol');
    expect(trail).toContain('<li');
  });

  it('both skill screens declare their three moves in order', () => {
    expect(listening).toContain(
      "LISTENING_STEPS = ['listening.step.listen', 'listening.step.write', 'listening.step.check']",
    );
    expect(writing).toContain(
      "WRITING_STEPS = ['writing.step.read', 'writing.step.write', 'writing.step.readCorrection']",
    );
    expect(UI_STRINGS.ar['listening.step.listen']).toBe('استمع');
    expect(UI_STRINGS.ar['writing.step.read']).toBe('اقرأ المهمة');
  });

  it('both render the indicator on the composing view', () => {
    expect(listening).toContain('<StepTrail steps={LISTENING_STEPS.map((key) => t(key))}');
    expect(writing).toContain('<StepTrail steps={WRITING_STEPS.map((key) => t(key))}');
  });

  it('writing also marks the correction step once feedback exists', () => {
    expect(writing).toContain('<StepTrail steps={WRITING_STEPS.map((key) => t(key))} current={2} />');
  });
});

describe('V33 — Profile is grouped, not a wall of 29 controls', () => {
  const profile = read('src/features/settings/ProfileSettingsScreen.tsx');
  const section = read('src/components/ui/CollapsibleSection.tsx');

  it('renders three grouped sections', () => {
    const opened = profile.match(/<CollapsibleSection/g) || [];
    const closed = profile.match(/<\/CollapsibleSection>/g) || [];
    expect(opened.length).toBe(3);
    expect(closed.length).toBe(3);
  });

  it('only the account section is open by default', () => {
    const defaults = profile.match(/<CollapsibleSection[^>]*defaultOpen/g) || [];
    expect(defaults).toHaveLength(1);
    // ...and it is the identity/subscription group, which is what people open
    // this screen for. The title is a dictionary key now, so the assertion reads
    // the key: the group is the same group, in every language.
    expect(profile).toMatch(
      /title=\{t\('profile\.section\.account\.title'\)\}[^>]*defaultOpen|defaultOpen[^>]*title=\{t\('profile\.section\.account\.title'\)\}/s,
    );
    expect(UI_STRINGS.ar['profile.section.account.title']).toBe('حسابي');
  });

  it('a folded group says what it contains', () => {
    // V34 retitles the third group «الحساب والخصوصية»: sign-out left it for the foot
    // of the screen, so what remains there is privacy, export and deletion. The
    // requirement this test states is unchanged; only the string moved with the copy.
    expect(section).toContain('{!open && hint &&');
    for (const key of [
      'profile.section.account.title',
      'profile.section.learning.title',
      'profile.section.privacy.title',
    ]) {
      expect(profile).toMatch(new RegExp(`title=\\{t\\('${key.replace(/\./g, '\\.')}'\\)\\}[\\s\\S]{0,120}hint=`));
    }
    // The copy itself is unchanged in Arabic; only its home moved.
    expect(UI_STRINGS.ar['profile.section.account.title']).toBe('حسابي');
    expect(UI_STRINGS.ar['profile.section.learning.title']).toBe('طريقة تعلّمي');
    expect(UI_STRINGS.ar['profile.section.privacy.title']).toBe('الحساب والخصوصية');
  });

  it('the toggle reports its state and controls the panel', () => {
    expect(section).toContain('aria-expanded={open}');
    expect(section).toContain('aria-controls={panelId}');
    expect(section).toContain('hidden={!open}');
  });
});

describe('V33 — the preferences prompt no longer outranks today’s mission', () => {
  const source = read('src/features/trail/TrailScreen.tsx');

  it('the prompt is rendered after the mission card, not before it', () => {
    const mission = source.indexOf('ONE PRIMARY ACTION');
    // The prompt's copy lives in the dictionary now; its key marks the spot.
    const nag = source.indexOf("trail.onboarding.title");
    expect(mission).toBeGreaterThan(-1);
    expect(nag).toBeGreaterThan(-1);
    expect(nag).toBeGreaterThan(mission);
  });

  it('and it is styled as a quiet row rather than a second hero', () => {
    const block = source.slice(
      source.indexOf('trail.onboarding.title') - 900,
      source.indexOf('trail.onboarding.title') + 400,
    );
    expect(block).toContain('border-border-subtle');
    // The old version used border-primary/30 bg-primary/10 — the same weight as
    // the mission, which was the whole problem.
    expect(block).not.toContain('bg-primary/10');
  });
});

describe('the chat has no word bank (2026-11-13: the hint is typed, never tapped)', () => {
  const source = read('src/features/conversation/ConversationDock.tsx');
  const screen = read('src/features/conversation/LiveConversationScreen.tsx');

  it('the dock carries no word-bank chips: the hint sentence is the only offer', () => {
    // Tapping chips built the sentence for the learner and one tap sent it, so
    // the turn was neither produced nor judged as their own. The hint dock shows
    // one sentence to type or say; nothing inserts it.
    expect(source).not.toContain('رتّب الكلمات لتبني الجملة');
    expect(source).not.toContain('data-testid="word-bank"');
    expect(screen).not.toContain('buildWordBank');
  });

  it('the other production surfaces keep their plain bank wording', () => {
    // Only the chat got the new lesson; changing the others would be churn.
    const review = read('src/features/review/ReviewScreen.tsx');
    expect(review).toContain("t('review.hint')");
    expect(UI_STRINGS.ar['review.hint']).toBe('تلميح: أول كلمات الإجابة');
    const writing = read('src/features/writing/WritingScreen.tsx');
    expect(writing).toContain("t('writing.wordBank')");
    expect(writing).toContain("t('writing.tapToAdd')");
    expect(`${UI_STRINGS.ar['writing.wordBank']} — ${UI_STRINGS.ar['writing.tapToAdd']}`).toBe(
      'بنك الكلمات — اضغط لتضيف الكلمة',
    );
  });
});