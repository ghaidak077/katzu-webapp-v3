import { describe, expect, it } from 'vitest';
// @ts-expect-error — the worker is plain JS (no types), imported the way the turn route imports it.
import { guardGreetingReply, isBareGreeting, isOffTopicSingleWord } from '../cloudflare-turn-guard.js';
// @ts-expect-error — same: the level spec twin ships as JS.
import { validateGermanAgainstLevel } from '../cloudflare-level-spec.js';

/**
 * FIX 3: a reply must never invent a question to answer (V30).
 *
 * The measured bug: the learner answered an opener with «hallo» and the partner
 * said «Hallo! Mir geht es gut.» — answering a wellbeing question the opener
 * never asked. Five bare inputs per level are pinned here, plus the cases the
 * guard must NOT touch (a one-word answer that belongs to the scene is a real
 * answer, and rewriting it would be a second bug).
 */

const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2'] as const;

const SCENE = 'Guten Tag! Was ist für Sie leicht, was ist schwer beim Deutschlernen?';

const GREETINGS = ['hallo', 'Hallo!', 'guten Morgen', 'hi', 'Hallo hallo'];

describe.each(LEVELS)('bare greetings at %s', (level) => {
  it.each(GREETINGS)('answers "%s" with a greeting and a re-ask, not an invented answer', (input) => {
    const out = guardGreetingReply({
      learnerText: input,
      replyDe: 'Hallo! Mir geht es gut.',
      replyAr: 'أهلاً! أنا بخير.',
      sceneGerman: SCENE,
      level,
    });
    expect(out.guarded).toBe(true);
    expect(out.reason).toBe('bare_greeting');
    // It asks something instead of answering something.
    expect(out.replyDe).toContain('?');
    // The invented wellbeing answer is gone.
    expect(out.replyDe).not.toContain('Mir geht es gut');
    // German and Arabic travel together, so the two bubbles never disagree.
    expect(out.replyAr).toMatch(/[\u0600-\u06FF]/);
    // And the fixed line is inside the level's own caps.
    expect(validateGermanAgainstLevel(out.replyDe, level)).toEqual({ ok: true });
  });

  it('answers an off-topic single word with an acknowledgement and a re-ask', () => {
    const out = guardGreetingReply({
      learnerText: 'Banane',
      replyDe: 'Ja, Bananen sind gesund.',
      replyAr: 'نعم، الموز صحي.',
      sceneGerman: SCENE,
      level,
    });
    expect(out.guarded).toBe(true);
    expect(out.reason).toBe('off_topic_single_word');
    expect(out.replyDe).toContain('?');
    expect(validateGermanAgainstLevel(out.replyDe, level)).toEqual({ ok: true });
  });
});

describe('the guard leaves real answers alone', () => {
  it('does not touch a sentence the learner composed', () => {
    const out = guardGreetingReply({
      learnerText: 'Ich heiße Ali und komme aus Syrien.',
      replyDe: 'Freut mich, Ali.',
      replyAr: 'يسعدني لقاؤك يا علي.',
      sceneGerman: SCENE,
      level: 'A1',
    });
    expect(out.guarded).toBe(false);
    expect(out.replyDe).toBe('Freut mich, Ali.');
  });

  it('does not touch a one-word answer that belongs to the scene', () => {
    const out = guardGreetingReply({
      learnerText: 'Deutschlernen',
      replyDe: 'Interessant. Warum ist das leicht für Sie?',
      replyAr: 'مثير للاهتمام. لماذا هذا سهل لك؟',
      sceneGerman: SCENE,
      level: 'A1',
    });
    expect(out.guarded).toBe(false);
  });

  it('does not touch yes/no/filler replies', () => {
    for (const input of ['ja', 'nein', 'danke', 'ok']) {
      expect(isBareGreeting(input)).toBe(false);
      expect(isOffTopicSingleWord(input, SCENE)).toBe(false);
    }
  });

  it('does not fire when the greeting carries content', () => {
    const out = guardGreetingReply({
      learnerText: 'Hallo, ich möchte einen Kaffee.',
      replyDe: 'Gerne, kommt sofort.',
      replyAr: 'بكل سرور، حالاً.',
      sceneGerman: 'Guten Tag! Was möchten Sie trinken?',
      level: 'A1',
    });
    expect(out.guarded).toBe(false);
  });

  it('keeps the polite register when the scene uses Sie', () => {
    const out = guardGreetingReply({
      learnerText: 'hallo',
      replyDe: '',
      replyAr: '',
      sceneGerman: 'Guten Tag! Wie heißen Sie?',
      level: 'A1',
    });
    expect(out.replyDe).toContain('Ihnen');
  });
});