import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

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
    expect(source).toContain('lockReasonAr');
    // The reason must be built from the lesson's own prerequisites — naming the
    // holding lesson by title is the one fact that tells the learner what to do.
    expect(source).toMatch(/node\.lesson\.prerequisites/);
  });

  it('renders the reason on the locked row itself', () => {
    expect(source).toMatch(/\{locked && \([\s\S]{0,320}lockReasonAr\(node, path\.nodes\)/);
  });

  it('falls back to plain wording rather than rendering an empty reason', () => {
    expect(source).toContain("return 'الدرس الذي قبله'");
  });
});

describe('V33 — Listen and Write number their steps', () => {
  const listening = read('src/features/listening/ListeningScreen.tsx');
  const writing = read('src/features/writing/WritingScreen.tsx');
  const trail = read('src/components/ui/StepTrail.tsx');

  it('the shared indicator marks the current step for assistive tech', () => {
    expect(trail).toContain("aria-current={active ? 'step' : undefined}");
    // The list itself is named, so a screen reader announces "steps" rather
    // than three unlabelled numbers.
    expect(trail).toContain('aria-label="خطوات التدريب"');
  });

  it('the indicator is a real list, not a row of divs', () => {
    expect(trail).toContain('<ol');
    expect(trail).toContain('<li');
  });

  it('both skill screens declare their three moves in order', () => {
    expect(listening).toContain("LISTENING_STEPS = ['استمع', 'اكتب', 'تحقّق']");
    expect(writing).toContain("WRITING_STEPS = ['اقرأ المهمة', 'اكتب', 'اقرأ التصحيح']");
  });

  it('both render the indicator on the composing view', () => {
    expect(listening).toContain('<StepTrail steps={LISTENING_STEPS}');
    expect(writing).toContain('<StepTrail steps={WRITING_STEPS}');
  });

  it('writing also marks the correction step once feedback exists', () => {
    expect(writing).toContain('<StepTrail steps={WRITING_STEPS} current={2} />');
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
    // this screen for.
    expect(profile).toMatch(/title="حسابي"[^>]*defaultOpen|defaultOpen[^>]*title="حسابي"/s);
  });

  it('a folded group says what it contains', () => {
    expect(section).toContain('{!open && hint &&');
    for (const title of ['حسابي', 'طريقة تعلّمي', 'بياناتك']) {
      expect(profile).toMatch(new RegExp(`title="${title}"[\\s\\S]{0,120}hint=`));
    }
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
    const mission = source.indexOf('ONE primary action for today');
    const nag = source.indexOf('أكمل تفضيلاتك');
    expect(mission).toBeGreaterThan(-1);
    expect(nag).toBeGreaterThan(-1);
    expect(nag).toBeGreaterThan(mission);
  });

  it('and it is styled as a quiet row rather than a second hero', () => {
    const block = source.slice(source.indexOf('أكمل تفضيلاتك') - 900, source.indexOf('أكمل تفضيلاتك') + 400);
    expect(block).toContain('border-border-subtle');
    // The old version used border-primary/30 bg-primary/10 — the same weight as
    // the mission, which was the whole problem.
    expect(block).not.toContain('bg-primary/10');
  });
});

describe('V33 — the chat word bank teaches that you can build a sentence', () => {
  const source = read('src/features/conversation/ConversationDock.tsx');

  it('the chat bank says it is for building, not only for sending', () => {
    expect(source).toContain('اضغط لتبني جملتك بنفسك');
  });

  it('the other production surfaces keep their plain bank wording', () => {
    // Only the chat got the new lesson; changing the others would be churn.
    expect(read('src/features/review/ReviewScreen.tsx')).toContain('بنك الكلمات — اضغط لتضيف الكلمة');
    expect(read('src/features/writing/WritingScreen.tsx')).toContain('بنك الكلمات — اضغط لتضيف الكلمة');
  });
});