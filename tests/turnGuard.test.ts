import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { resetScenarioBeatsCache } from '../cloudflare-unified-worker';
// @ts-expect-error — the worker is plain JS (no types), imported the way the turn route imports it.
import { guardGreetingReply, isBareGreeting, isOffTopicSingleWord } from '../cloudflare-turn-guard.js';
// @ts-expect-error — same: the level spec twin ships as JS.
import { validateGermanAgainstLevel } from '../cloudflare-level-spec.js';
import { resetRouterState } from '../cloudflare-ai-router.js';

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

/**
 * The wiring, not just the rule.
 *
 * The unit tests above prove the guard's logic; this proves `/ai/turn` actually
 * calls it. Without this, a refactor could drop the `guardGreetingReply(...)`
 * line and every test above would still pass while the learner saw
 * «Hallo! Mir geht es gut.» again — the exact failure this batch fixed.
 */
class MemoryKv {
  values = new Map<string, string>();
  async get(key: string) {
    return this.values.get(key) || null;
  }
  async put(key: string, value: string) {
    this.values.set(key, value);
  }
  async delete(key: string) {
    this.values.delete(key);
  }
}

// The route resolves the scenario from D1 before it can answer, and the exam
// scenario this bug was reported in has no static fallback row, so the stub has
// to serve it — an empty DB turns the turn into UNKNOWN_SCENARIO (400).
const SCENARIO_ROW = {
  title_de: 'Erfahrungen sprechen',
  ai_persona: 'friendly German examiner',
  category: 'exam',
};

const emptyDb = () => {
  const first = async (sql: string) => (/FROM scenarios/i.test(sql) ? SCENARIO_ROW : null);
  return {
    prepare: (sql: string) => ({
      bind: () => ({ run: async () => ({ success: true }), all: async () => ({ results: [] }), first: () => first(sql) }),
      run: async () => ({ success: true }),
      all: async () => ({ results: [] }),
      first: () => first(sql),
    }),
    batch: async () => [],
  };
};

describe('/ai/turn wires the guard into the reply the learner sees', () => {
  beforeEach(() => {
    resetRouterState();
    resetScenarioBeatsCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces «Hallo! Mir geht es gut.» with the re-ask for a bare greeting', async () => {
    const env: any = {
      TEST_MODE: true,
      GOOGLE_CLIENT_ID: 'client-id',
      NVIDIA_API_KEYS: 'test-key-aaaaaaaaaa',
      OPENROUTER_API_KEYS: 'test-key-openrouter-b',
      USER_PROGRESS: new MemoryKv(),
      REDEEMED_CODES: new MemoryKv(),
      DB: emptyDb(),
    };
    await env.USER_PROGRESS.put(
      'session:sess_guard_route',
      JSON.stringify({ sub: 'guard-learner', email: 'guard@test.dev', created_at: Date.now(), expires_at: Date.now() + 3600_000 }),
    );

    // A model that answers the greeting the way the bug did.
    vi.stubGlobal('fetch', (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply_de: 'Hallo! Mir geht es gut.',
                  reply_ar: 'أهلاً! أنا بخير.',
                  evaluation: { is_correct: true, explanation_ar: 'جيد.', positive_note_ar: 'أحسنت!' },
                  next_hint: { german: 'Danke!', translation_ar: 'شكراً!' },
                  followup_question_ar: '',
                }),
              },
            },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch);

    const res = await worker.fetch(
      new Request('https://worker.test/ai/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_guard_route' },
        body: JSON.stringify({
          scenario_id: 'exam_erfahrungen_sprechen',
          cefr_level: 'A1',
          user_message: 'hallo',
          session_id: 'sess-guard-route',
          history: [
            {
              sender: 'model',
              text: 'Guten Tag! Erzählen Sie: Was ist für Sie leicht, was ist schwer beim Deutschlernen?',
            },
          ],
        }),
      }),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    // The invented wellbeing answer is gone, the partner asks rather than answers.
    expect(body.reply_de).not.toContain('Mir geht es gut');
    expect(body.reply_de).toContain('?');
    expect(body.reply_de).toContain('Ihnen');
    expect(body.reply_ar).toMatch(/[\u0600-\u06FF]/);
  });
});