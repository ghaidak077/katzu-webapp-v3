import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { resetScenarioBeatsCache } from '../cloudflare-unified-worker';
// @ts-expect-error — the worker is plain JS (no types), imported the way the turn route imports it.
import {
  guardGreetingReply,
  guardTrailingQuestion,
  isBareGreeting,
  isOffTopicSingleWord,
  replyEndsWithQuestion,
} from '../cloudflare-turn-guard.js';
// @ts-expect-error — same: the level spec twin ships as JS.
import { validateGermanAgainstLevel } from '../cloudflare-level-spec.js';
import { resetRouterState } from '../cloudflare-ai-router.js';
import catalogue from '../docs/content/catalogue/scenarios-catalogue.json';

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
type Level = (typeof LEVELS)[number];

const LEVEL_TO_KEY: Record<Level, 'a0' | 'a1' | 'a2' | 'b1' | 'b2'> = {
  A0: 'a0', A1: 'a1', A2: 'a2', B1: 'b1', B2: 'b2',
};

const SCENARIOS = (catalogue as unknown as {
  scenarios: Array<{
    id: string;
    title_de: string;
    title_ar: string;
    ai_persona: string;
    category: string;
    openers: Record<string, [string, string]>;
  }>;
}).scenarios;

const scenarioById = (id: string) => {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`catalogue has no ${id}`);
  return found;
};

const SCENE = 'Guten Tag! Was ist für Sie leicht, was ist schwer beim Deutschlernen?';

const GREETINGS = [
  'hallo', 'Hallo!', 'guten Morgen', 'hi', 'Hallo hallo',
  // The variants a phone keyboard actually produces: typos, held keys, English
  // and regional forms, punctuation and a lone wave. All must still get the
  // correction card, not an invented answer.
  'halo', 'hello', 'hiii', 'HEY!!!', 'moin', 'moin moin', 'servus', 'Guten Tag!',
  'halloooo', '👋', 'Hallo 👋',
];

/**
 * The rule this pins: in a scenario chat, a bare greeting is answered with a
 * short greeting and then the SCENE'S OWN question — not a generic wellbeing
 * question the scene never asked. The openers come from the catalogue, the same
 * source that ships to learners, so editing content changes this fixture with it.
 */
const LUGGAGE_SCENES = Object.fromEntries(
  LEVELS.map((level) => [level, scenarioById('airport_arrival').openers[LEVEL_TO_KEY[level]][0]]),
) as Record<Level, string>;

/** The last sentence of an opener — the question the scene is actually asking. */
const askOf = (opener: string) => germanSentences(opener).slice(-1)[0];

function germanSentences(text: string) {
  return text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
}

describe.each(LEVELS)('a bare greeting in the missing-luggage scene at %s', (level) => {
  it('greets back briefly and returns to the stored opener’s own question', () => {
    const sceneOpener = LUGGAGE_SCENES[level];
    const sceneAsk = askOf(sceneOpener);
    const out = guardGreetingReply({
      learnerText: 'hallo',
      replyDe: 'Hallo! Mir geht es gut.',
      replyAr: 'أهلاً! أنا بخير.',
      sceneGerman: sceneOpener,
      // The stored opener for this scenario+level is the topic source; history
      // is not, because after the first exchange it joins and never matches.
      sceneOpener,
      level,
    });
    expect(out.guarded).toBe(true);
    expect(out.reason).toBe('bare_greeting');
    // A short greeting first, then the question the scenario actually asks.
    expect(out.replyDe).toMatch(/^Hallo! /);
    expect(out.replyDe).toContain(sceneAsk);
    // The invented wellbeing answer/question is gone.
    expect(out.replyDe).not.toContain('Mir geht es gut');
    expect(out.replyDe).not.toContain('Wie geht es Ihnen');
    expect(out.replyAr).toMatch(/[\u0600-\u06FF]/);
    expect(out.replyAr).not.toContain('كيف حالك');
    // The scene's own line is authored at its level, so the reply stays in caps.
    expect(validateGermanAgainstLevel(out.replyDe, level)).toEqual({ ok: true });
  });

  it('uses the stored opener even when history has many later model turns', () => {
    const sceneOpener = LUGGAGE_SCENES[level];
    // What `/ai/turn` used to build and pass as `sceneGerman`: every assistant
    // turn joined. It is not a stored opener, so the old lookup returned null.
    const joinedHistory = [
      sceneOpener,
      'Gut. Und wie lange sind Sie schon in Deutschland?',
      'Danke. Möchten Sie noch etwas ergänzen?',
    ].join(' ');
    const out = guardGreetingReply({
      learnerText: 'hallo',
      replyDe: 'Hallo! Mir geht es gut.',
      replyAr: 'أهلاً! أنا بخير.',
      sceneGerman: joinedHistory,
      sceneOpener,
      level,
    });
    expect(out.reason).toBe('bare_greeting');
    expect(out.replyDe).toContain(askOf(sceneOpener));
    expect(out.replyDe).not.toContain('Wie geht es Ihnen');
    expect(out.replyDe).not.toContain('Mir geht es gut');
  });
});

describe.each(LEVELS)('bare greetings at %s', (level) => {
  it.each(GREETINGS)('answers "%s" with a greeting and a continuation, not an invented answer', (input) => {
    const out = guardGreetingReply({
      learnerText: input,
      replyDe: 'Hallo! Mir geht es gut.',
      replyAr: 'أهلاً! أنا بخير.',
      sceneGerman: SCENE,
      level,
    });
    expect(out.guarded).toBe(true);
    expect(out.reason).toBe('bare_greeting');
    expect(out.replyDe).toMatch(/^(Hallo|Guten Tag)/);
    // The invented wellbeing answer is gone, and the fixed continuation never
    // invents a wellbeing question either: that line must not exist in a scene.
    expect(out.replyDe).not.toContain('Mir geht es gut');
    expect(out.replyDe).not.toContain('Wie geht es');
    expect(out.replyAr).not.toContain('كيف حالك');
    // German and Arabic travel together, so the two bubbles never disagree.
    expect(out.replyAr).toMatch(/[\u0600-\u06FF]/);
    // And the fixed line is inside the level's own caps.
    expect(validateGermanAgainstLevel(out.replyDe, level)).toEqual({ ok: true });
  });

  it('answers an off-topic single word with an acknowledgement and a continuation', () => {
    const out = guardGreetingReply({
      learnerText: 'Banane',
      replyDe: 'Ja, Bananen sind gesund.',
      replyAr: 'نعم، الموز صحي.',
      sceneGerman: SCENE,
      level,
    });
    expect(out.guarded).toBe(true);
    expect(out.reason).toBe('off_topic_single_word');
    expect(out.replyDe).not.toContain('Wie geht es');
    expect(validateGermanAgainstLevel(out.replyDe, level)).toEqual({ ok: true });
  });
});

describe('every shipped scene answers a bare greeting with its own question', () => {
  it('holds for all 61 scenarios at all five levels', () => {
    let checked = 0;
    for (const scenario of SCENARIOS) {
      for (const level of LEVELS) {
        const opener = scenario.openers[LEVEL_TO_KEY[level]][0];
        const out = guardGreetingReply({
          learnerText: 'hallo',
          replyDe: 'Hallo! Mir geht es gut.',
          replyAr: 'أهلاً! أنا بخير.',
          sceneGerman: opener,
          sceneOpener: opener,
          level,
        });
        const label = `${scenario.id}/${level}`;
        expect(out.guarded, label).toBe(true);
        expect(out.reason, label).toBe('bare_greeting');
        // The invented wellbeing answer/question never survives.
        expect(out.replyDe, label).not.toContain('Mir geht es gut');
        expect(out.replyDe, label).not.toContain('Wie geht es');
        expect(out.replyDe, label).not.toMatch(/Wie geht es Ihnen/);
        expect(out.replyAr, label).not.toContain('كيف حالك');
        // The scene's own last question is what the learner gets back.
        expect(out.replyDe, label).toContain(askOf(opener));
        // And it stays inside the level, so the guard cannot teach off-spec German.
        expect(validateGermanAgainstLevel(out.replyDe, level), label).toEqual({ ok: true });
        checked += 1;
      }
    }
    expect(checked).toBe(61 * 5);
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
    expect(out.replyDe).toMatch(/\bSie\b/);
    expect(out.replyDe).not.toMatch(/\b(du|dir|dich)\b/);
  });

  it('never falls back to a wellbeing question when no stored opener is known', () => {
    for (const level of LEVELS) {
      const out = guardGreetingReply({ learnerText: 'hallo', replyDe: '', replyAr: '', level });
      expect(out.guarded).toBe(true);
      expect(out.replyDe).not.toContain('Wie geht es');
      expect(out.replyAr).not.toContain('كيف حالك');
      expect(validateGermanAgainstLevel(out.replyDe, level)).toEqual({ ok: true });
    }
  });
});

/**
 * FIX 4: every A0–A2 turn ends with one answerable question.
 *
 * The prompt asks for it, but a model that stops after its answer leaves the
 * learner with nothing to reply. The guard appends the SCENE'S own last question
 * (deterministic, no second model call), never a new topic. These tests pin both
 * the rule and the `/ai/turn` wiring.
 */
describe('guardTrailingQuestion — the A0–A2 closing question', () => {
  it('recognises a question even behind a closing quote or trailing space', () => {
    expect(replyEndsWithQuestion('Was möchten Sie?')).toBe(true);
    expect(replyEndsWithQuestion('Was möchten Sie?  ')).toBe(true);
    expect(replyEndsWithQuestion('«Was möchten Sie?»')).toBe(true);
    expect(replyEndsWithQuestion('Gut.')).toBe(false);
  });

  it('appends the scene’s own question when the reply stops after an answer', () => {
    const out = guardTrailingQuestion({
      replyDe: 'Gut.',
      replyAr: 'حسنًا.',
      sceneOpener: LUGGAGE_SCENES.A1,
      level: 'A1',
    });
    expect(out.guarded).toBe(true);
    expect(out.reason).toBe('appended_scene_question');
    expect(out.replyDe).toContain(askOf(LUGGAGE_SCENES.A1));
    expect(out.replyDe.trim().endsWith('?')).toBe(true);
    expect(out.replyAr).toMatch(/[\u0600-\u06FF]/);
    expect(out.replyAr.trim().endsWith('؟')).toBe(true);
  });

  it('leaves a reply that already ends with a question untouched', () => {
    const out = guardTrailingQuestion({
      replyDe: 'Gut. Und was möchten Sie?',
      replyAr: 'حسنًا. وماذا تريد؟',
      sceneOpener: LUGGAGE_SCENES.A1,
      level: 'A1',
    });
    expect(out.guarded).toBe(false);
    expect(out.reason).toBe('already_question');
    expect(out.replyDe).toBe('Gut. Und was möchten Sie?');
  });

  it('does not add a question to the final exchange', () => {
    const out = guardTrailingQuestion({
      replyDe: 'Danke für das Gespräch. Auf Wiedersehen!',
      replyAr: 'شكراً على المحادثة. إلى اللقاء!',
      sceneOpener: LUGGAGE_SCENES.A1,
      level: 'A1',
      isFinalTurn: true,
    });
    expect(out.guarded).toBe(false);
    expect(out.reason).toBe('not_required');
    expect(out.replyDe).not.toContain('?');
  });

  it('does not touch B1 and B2, where a statement turn is allowed', () => {
    for (const level of ['B1', 'B2'] as const) {
      const out = guardTrailingQuestion({ replyDe: 'Gut.', replyAr: 'حسنًا.', level });
      expect(out.guarded).toBe(false);
      expect(out.replyDe).toBe('Gut.');
    }
  });

  it('falls back to a level-safe question when no stored opener exists', () => {
    const out = guardTrailingQuestion({ replyDe: 'Gut.', replyAr: 'حسنًا.', level: 'A0' });
    expect(out.guarded).toBe(true);
    expect(out.reason).toBe('appended_level_question');
    expect(validateGermanAgainstLevel(out.replyDe, 'A0')).toEqual({ ok: true });
    expect(out.replyAr).toMatch(/[\u0600-\u06FF]/);
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

// The route resolves the scenario from D1 before it can answer, so the stub has
// to serve it. The row is built from the catalogue, so this fixture cannot drift
// away from what the app ships.
const LUGGAGE_SCENARIO = scenarioById('airport_arrival');
const SCENARIO_ROW = {
  title_de: LUGGAGE_SCENARIO.title_de,
  ai_persona: LUGGAGE_SCENARIO.ai_persona,
  category: LUGGAGE_SCENARIO.category,
  initial_message_a0: LUGGAGE_SCENARIO.openers.a0[0],
  initial_message_a1: LUGGAGE_SCENARIO.openers.a1[0],
  initial_message_a2: LUGGAGE_SCENARIO.openers.a2[0],
  initial_message_b1: LUGGAGE_SCENARIO.openers.b1[0],
  initial_message_b2: LUGGAGE_SCENARIO.openers.b2[0],
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
          // The exact shape `workerClient.sendTurn` puts on the wire: it rewrites
          // history to { role, text } before sending. The old test used { sender },
          // which the app never sends — so it was green while production was not.
          scenario_id: 'airport_arrival',
          scenario_title: 'Am Flughafen',
          persona: 'friendly conversational partner and native German teacher',
          cefr_level: 'A1',
          user_message: 'hallo',
          session_id: 'sess-guard-route',
          mode: 'roleplay',
          is_final_turn: false,
          sarcasm_level: 'SASSY',
          turn_index: 0,
          history: [{ role: 'model', text: 'Guten Tag. Fehlt Ihr Gepäck?' }],
        }),
      }),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    // The invented wellbeing answer is gone; the partner re-asks the scene's own
    // missing-luggage question, which is the live failure this batch fixes.
    expect(body.reply_de).not.toContain('Mir geht es gut');
    expect(body.reply_de).toContain(askOf(LUGGAGE_SCENES.A1));
    expect(body.reply_ar).toMatch(/[\u0600-\u06FF]/);
  });

  it('re-asks the stored opener after several later turns (multi-turn history)', async () => {
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
      'session:sess_guard_multiturn',
      JSON.stringify({ sub: 'guard-learner', email: 'guard@test.dev', created_at: Date.now(), expires_at: Date.now() + 3600_000 }),
    );
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
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_guard_multiturn' },
        body: JSON.stringify({
          scenario_id: 'airport_arrival',
          cefr_level: 'A1',
          user_message: 'hallo',
          session_id: 'sess-guard-multiturn',
          turn_index: 4,
          // The app's real wire shape: joined assistant history is NOT a stored
          // opener, so the topic must come from the scenario row, not this text.
          history: [
            { role: 'model', text: 'Guten Tag. Fehlt Ihr Gepäck?' },
            { role: 'user', text: 'Ja, mein Koffer fehlt.' },
            { role: 'model', text: 'Das tut mir leid. Haben Sie Ihre Bordkarte dabei?' },
            { role: 'user', text: 'Ja, hier bitte.' },
            { role: 'model', text: 'Danke. Wie lange sind Sie schon in Deutschland?' },
            { role: 'user', text: 'Seit zwei Tagen.' },
          ],
        }),
      }),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.reply_de).not.toContain('Mir geht es gut');
    expect(body.reply_de).not.toContain('Wie geht es');
    expect(body.reply_de).toContain(askOf(LUGGAGE_SCENES.A1));
    expect(body.reply_ar).not.toContain('كيف حالك');
  });

  it('still accepts the legacy { sender } shape older callers send', async () => {
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
      'session:sess_guard_legacy',
      JSON.stringify({ sub: 'guard-learner', email: 'guard@test.dev', created_at: Date.now(), expires_at: Date.now() + 3600_000 }),
    );
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
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_guard_legacy' },
        body: JSON.stringify({
          scenario_id: 'airport_arrival',
          cefr_level: 'A1',
          user_message: 'hallo',
          session_id: 'sess-guard-legacy',
          history: [{ sender: 'model', text: 'Guten Tag. Fehlt Ihr Gepäck?' }],
        }),
      }),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.reply_de).toContain(askOf(LUGGAGE_SCENES.A1));
  });

  it('returns the scene question even when a later greeting is in history', async () => {
    // The reported failure: after the learner greeted mid-conversation, the
    // joined history contained a greeting line, so the guard answered that
    // greeting and never re-asked the scene. The topic must come from the
    // stored opener, not from whatever the history happens to contain.
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
      'session:sess_guard_late_greeting',
      JSON.stringify({ sub: 'guard-learner', email: 'guard@test.dev', created_at: Date.now(), expires_at: Date.now() + 3600_000 }),
    );
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
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_guard_late_greeting' },
        body: JSON.stringify({
          scenario_id: 'airport_arrival',
          cefr_level: 'A1',
          user_message: 'hallo',
          session_id: 'sess-guard-late-greeting',
          turn_index: 2,
          history: [
            { role: 'model', text: LUGGAGE_SCENES.A1 },
            { role: 'user', text: 'hallo' },
            { role: 'model', text: 'Hallo! Wie geht es Ihnen?' },
            { role: 'user', text: 'hallo' },
          ],
        }),
      }),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.reply_de).not.toContain('Mir geht es gut');
    expect(body.reply_de).not.toMatch(/Wie geht es Ihnen/);
    expect(body.reply_de).toContain(askOf(LUGGAGE_SCENES.A1));
    expect(body.reply_ar).not.toContain('كيف حالك');
  });

  it('appends the scene question when the model ends its A1 turn with a statement', async () => {
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
      'session:sess_trailing_question',
      JSON.stringify({ sub: 'trailing-learner', email: 'trailing@test.dev', created_at: Date.now(), expires_at: Date.now() + 3600_000 }),
    );

    vi.stubGlobal('fetch', (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply_de: 'Gut.',
                  reply_ar: 'حسنًا.',
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
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_trailing_question' },
        body: JSON.stringify({
          scenario_id: 'airport_arrival',
          cefr_level: 'A1',
          user_message: 'Ich habe einen Koffer dabei.',
          session_id: 'sess-trailing-question',
          turn_index: 1,
          is_final_turn: false,
          history: [{ role: 'model', text: LUGGAGE_SCENES.A1 }],
        }),
      }),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.reply_de.trim().endsWith('?')).toBe(true);
    expect(body.reply_de).toContain(askOf(LUGGAGE_SCENES.A1));
    expect(body.reply_ar).toMatch(/[\u0600-\u06FF]/);
  });

  it('does not append a question to the final turn', async () => {
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
      'session:sess_final_turn',
      JSON.stringify({ sub: 'final-learner', email: 'final@test.dev', created_at: Date.now(), expires_at: Date.now() + 3600_000 }),
    );
    vi.stubGlobal('fetch', (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply_de: 'Danke für das Gespräch. Auf Wiedersehen!',
                  reply_ar: 'شكراً على المحادثة. إلى اللقاء!',
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
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_final_turn' },
        body: JSON.stringify({
          scenario_id: 'airport_arrival',
          cefr_level: 'A1',
          user_message: 'Danke, auf Wiedersehen.',
          session_id: 'sess-final-turn',
          turn_index: 8,
          is_final_turn: true,
          history: [{ role: 'model', text: LUGGAGE_SCENES.A1 }],
        }),
      }),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.reply_de).not.toContain('?');
  });
});