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
 * question the scene never asked. These are the five live `airport_arrival`
 * openers (A0 reuses A1, exactly as the app does), the missing-luggage scene.
 */
const LUGGAGE_SCENES: Record<(typeof LEVELS)[number], string> = {
  A0: 'Guten Tag. Fehlt Ihr Gepäck?',
  A1: 'Guten Tag. Fehlt Ihr Gepäck?',
  A2: 'Guten Tag. Willkommen am Flughafen. Fehlt Ihr Gepäck, oder suchen Sie den Gepäckschalter?',
  B1: 'Guten Tag. Da Ihr Koffer nicht angekommen ist, nehme ich hier die Meldung auf. Haben Sie Ihren Pass und Ihre Bordkarte dabei?',
  B2: 'Guten Tag. Seit Ihrer Ankunft fehlt also Ihr Gepäck. Beschreiben Sie mir bitte kurz, wie Ihr Koffer aussieht, dann sehe ich nach.',
};

describe.each(LEVELS)('a bare greeting in the missing-luggage scene at %s', (level) => {
  it('greets back briefly and returns to the stored opener’s own question', () => {
    const sceneOpener = LUGGAGE_SCENES[level];
    const sceneAsk = sceneOpener.slice(sceneOpener.lastIndexOf('. ') + 2);
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
    expect(out.replyDe).toMatch(/Gepäck|Koffer|Pass|Bordkarte/);
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
    expect(out.replyDe).toContain(sceneOpener.slice(sceneOpener.lastIndexOf('. ') + 2));
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
  // The stored openers the route now reads by scenario id + level. A0 is empty
  // in the corpus and falls back to A1, exactly as the live screen does.
  initial_message_a0: '',
  initial_message_a1: 'Guten Tag. Fehlt Ihr Gepäck?',
  initial_message_a2: 'Guten Tag. Willkommen am Flughafen. Fehlt Ihr Gepäck, oder suchen Sie den Gepäckschalter?',
  initial_message_b1: 'Guten Tag. Da Ihr Koffer nicht angekommen ist, nehme ich hier die Meldung auf. Haben Sie Ihren Pass und Ihre Bordkarte dabei?',
  initial_message_b2: 'Guten Tag. Seit Ihrer Ankunft fehlt also Ihr Gepäck. Beschreiben Sie mir bitte kurz, wie Ihr Koffer aussieht, dann sehe ich nach.',
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
    expect(body.reply_de).toContain('Fehlt Ihr Gepäck');
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
    expect(body.reply_de).toContain('Fehlt Ihr Gepäck');
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
    expect(body.reply_de).toContain('Fehlt Ihr Gepäck');
  });
});