import { describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';
import {
  MAX_WRITING_CHARS,
  MAX_WRITING_MISTAKES,
  WRITING_TASK_TYPES,
  buildWritingPrompt,
  buildWritingResponseSchema,
  handleWritingRoute,
  normalizeTargetPhrases,
  normalizeWritingFeedback,
  taskTypeForLevel,
} from '../cloudflare-writing.js';
import { WRITING_TASK_COPY, writingTaskForLevel } from '@/lib/writing/task';
import type { CEFRLevel } from '@/types/models';

/**
 * Writing is the skill that decides a certificate for this audience, and it is
 * the only one of the four that needed no new content table — so it is also the
 * easiest place to ship something that *looks* like grading. These tests pin the
 * two things that would make it dishonest: showing a task the learner was not
 * given, and showing a score the model never produced.
 */

const LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2'];

const json = (obj: unknown, status: number, cors: Record<string, string> = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });

const modelReply = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    scores: { task: 4, coherence: 3, grammar: 2, vocabulary: 4 },
    corrected_de: 'Ich möchte einen Termin am Montag.',
    summary_ar: 'المعنى واضح، وركّز على حالة الأكوزاتيف.',
    mistakes: [
      { original: 'ein Termin', corrected: 'einen Termin', rule_de: 'Akkusativ', explanation_ar: 'الاسم مذكر في حالة النصب.' },
    ],
    ...overrides,
  });

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    authenticateAiRequest: async () => ({ account: { sub: 'writer' } }),
    hasUsableProvider: () => true,
    callAiRouter: async () => modelReply(),
    cleanJson: (raw: string) => JSON.parse(raw),
    json,
    validLevels: new Set(LEVELS),
    ...overrides,
  } as any;
}

function writingRequest(body: unknown) {
  return new Request('https://worker.test/ai/check-writing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  text: 'Ich möchte einen Termin am Montag bitte.',
  task_type: 'short_message',
  cefr_level: 'A1',
  scenario_title: 'موعد في السفارة',
  target_phrases: ['Guten Tag', 'Ich brauche einen Termin'],
};

describe('task contract between the app and the grader', () => {
  it('maps every level to the same task on both sides', () => {
    for (const level of LEVELS) {
      expect(writingTaskForLevel(level)).toBe(taskTypeForLevel(level));
    }
    // An unknown/absent level must not silently become a B2 task.
    expect(writingTaskForLevel(undefined)).toBe(taskTypeForLevel(undefined));
  });

  it('gives every task format the worker accepts a label the learner can read', () => {
    for (const taskType of WRITING_TASK_TYPES) {
      expect(WRITING_TASK_COPY[taskType as keyof typeof WRITING_TASK_COPY]).toBeTruthy();
      expect(WRITING_TASK_COPY[taskType as keyof typeof WRITING_TASK_COPY].briefAr.length).toBeGreaterThan(10);
    }
  });
});

describe('grading a submission', () => {
  it('rejects text too short to correct', async () => {
    const res = await handleWritingRoute(writingRequest({ ...VALID_BODY, text: 'Hallo' }), {}, {}, makeDeps());
    expect(res.status).toBe(400);
    expect((await res.json() as any).code).toBe('TEXT_TOO_SHORT');
  });

  it('rejects text past the cap instead of sending it to the model', async () => {
    const res = await handleWritingRoute(
      writingRequest({ ...VALID_BODY, text: 'a'.repeat(MAX_WRITING_CHARS + 5) }),
      {},
      {},
      makeDeps(),
    );
    expect((await res.json() as any).code).toBe('TEXT_TOO_LONG');
  });

  it('rejects a level the product does not teach', async () => {
    const res = await handleWritingRoute(writingRequest({ ...VALID_BODY, cefr_level: 'C1' }), {}, {}, makeDeps());
    expect(res.status).toBe(400);
    expect((await res.json() as any).code).toBe('INVALID_LEVEL');
  });

  it('refuses to grade a task the level was not given', async () => {
    // The learner can only be shown taskTypeForLevel(); a mismatch means the
    // client and the grader disagree, which must be an error, not a silent regrade.
    const res = await handleWritingRoute(
      writingRequest({ ...VALID_BODY, cefr_level: 'B1', task_type: 'short_message' }),
      {},
      {},
      makeDeps(),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.code).toBe('TASK_TYPE_MISMATCH');
    expect(body.expected_task_type).toBe('formal_email');
  });

  it('sends the learner text, the topic and bounded phrases to the model', async () => {
    let prompt = '';
    const deps = makeDeps({
      callAiRouter: async (payload: any) => {
        prompt = payload.contents[0].parts[0].text;
        return modelReply();
      },
    });

    await handleWritingRoute(
      writingRequest({
        ...VALID_BODY,
        scenario_title: 'موعد في السفارة',
        target_phrases: ['eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht'],
      }),
      {},
      {},
      deps,
    );

    expect(prompt).toContain(VALID_BODY.text);
    expect(prompt).toContain('موعد في السفارة');
    expect(prompt).toContain('CEFR A1');
    expect(prompt).toContain('sechs');
    // Eight phrases offered, six kept: the prompt stays inside its budget.
    expect(prompt).not.toContain('sieben');
    expect(prompt).not.toContain('acht');
  });

  it('keeps the learner text and asks for a retry when the model fails', async () => {
    const deps = makeDeps({
      callAiRouter: async () => {
        throw new Error('all keys cooling down');
      },
    });
    const res = await handleWritingRoute(writingRequest(VALID_BODY), {}, {}, deps);
    expect(res.status).toBe(502);
    const body = await res.json() as any;
    expect(body.code).toBe('AI_WRITING_FAILED');
    expect(body.message).toMatch(/[\u0600-\u06FF]/);
  });

  it('never invents a score when the model returned no rubric', async () => {
    const deps = makeDeps({ callAiRouter: async () => JSON.stringify({ summary_ar: 'جيد' }) });
    const res = await handleWritingRoute(writingRequest(VALID_BODY), {}, {}, deps);
    expect(res.status).toBe(502);
    expect((await res.json() as any).code).toBe('AI_WRITING_UNUSABLE');
  });

  it('clamps scores and computes one percent the UI can trust', async () => {
    const deps = makeDeps({
      callAiRouter: async () =>
        JSON.stringify({
          scores: { task: 9, coherence: -2, grammar: 2.6 },
          corrected_de: 'Text',
          summary_ar: 'ملاحظة عربية',
          mistakes: [],
        }),
    });
    const res = await handleWritingRoute(writingRequest(VALID_BODY), {}, {}, deps);
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.feedback.scores).toEqual({ task: 5, coherence: 0, grammar: 3 });
    // Percent over the returned dimensions only: the missing one is not a zero.
    expect(body.feedback.percent).toBe(53);
    expect(body.task_type).toBe('short_message');
  });

  it('returns 503 without a usable key instead of a fake correction', async () => {
    const res = await handleWritingRoute(writingRequest(VALID_BODY), {}, {}, makeDeps({ hasUsableProvider: () => false }));
    expect(res.status).toBe(503);
  });

  it('passes an entitlement refusal straight through', async () => {
    const paywall = json({ error: 'subscription_required', code: 'PAYWALL_REQUIRED' }, 402, {});
    const res = await handleWritingRoute(
      writingRequest(VALID_BODY),
      {},
      {},
      makeDeps({ authenticateAiRequest: async () => ({ response: paywall }) }),
    );
    expect(res.status).toBe(402);
    expect((await res.json() as any).code).toBe('PAYWALL_REQUIRED');
  });
});

describe('normalizing what the model returned', () => {
  it('drops a correction that does not change anything', () => {
    const feedback = normalizeWritingFeedback({
      scores: { task: 3, coherence: 3, grammar: 3, vocabulary: 3 },
      corrected_de: 'x',
      summary_ar: 'ملاحظة',
      mistakes: [
        { original: 'der Kaffee', corrected: 'der Kaffee', rule_de: 'r', explanation_ar: 'شرح' },
        { original: 'ein Kaffee', corrected: 'einen Kaffee', rule_de: 'Akkusativ', explanation_ar: 'شرح' },
      ],
    });
    expect(feedback?.mistakes).toHaveLength(1);
    expect(feedback?.mistakes[0].corrected).toBe('einen Kaffee');
  });

  it('caps how many corrections a learner has to read', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      original: `falsch ${i}`,
      corrected: `richtig ${i}`,
      rule_de: 'Regel',
      explanation_ar: 'شرح',
    }));
    const feedback = normalizeWritingFeedback({
      scores: { task: 3, coherence: 3, grammar: 3, vocabulary: 3 },
      corrected_de: 'x',
      summary_ar: 'ملاحظة',
      mistakes: many,
    });
    expect(feedback?.mistakes).toHaveLength(MAX_WRITING_MISTAKES);
  });

  it('drops an Arabic summary that is not Arabic', () => {
    const feedback = normalizeWritingFeedback({
      scores: { task: 3 },
      corrected_de: 'x',
      summary_ar: 'Good work, keep going',
      mistakes: [],
    });
    expect(feedback?.summaryAr).toBe('');
    expect(feedback?.percent).toBe(60);
  });

  it('returns nothing when no dimension is usable', () => {
    expect(normalizeWritingFeedback(null)).toBeNull();
    expect(normalizeWritingFeedback({ scores: { task: 'good' } })).toBeNull();
  });

  it('bounds and de-duplicates the topic phrases it forwards', () => {
    expect(normalizeTargetPhrases(['a', 'a', '', 42, 'b'])).toEqual(['a', 'b']);
    expect(normalizeTargetPhrases('not an array')).toEqual([]);
  });

  it('builds a prompt that never asks for a score the app could inflate', () => {
    const prompt = buildWritingPrompt({
      level: 'B1',
      taskType: 'formal_email',
      scenarioTitle: 'شكوى',
      targetPhrases: [],
      text: 'Sehr geehrte Damen und Herren, ...',
    });
    expect(prompt).toContain('CEFR B1');
    expect(prompt).toContain('corrected_de');
    expect(prompt).toMatch(/Do NOT rewrite correct German/);
    // The rubric the schema demands is exactly what the normalizer reads.
    expect(Object.keys(buildWritingResponseSchema().properties.scores.properties)).toEqual([
      'task',
      'coherence',
      'grammar',
      'vocabulary',
    ]);
  });
});

describe('route wiring', () => {
  class MemoryKv {
    values = new Map<string, string>();
    async get(key: string) { return this.values.get(key) || null; }
    async put(key: string, value: string) { this.values.set(key, value); }
    async delete(key: string) { this.values.delete(key); }
  }

  it('requires a session before any grading', async () => {
    const env: any = { USER_PROGRESS: new MemoryKv() };
    const res = await worker.fetch(writingRequest(VALID_BODY), env);
    expect(res.status).toBe(401);
    expect((await res.json() as any).code).toBe('UNAUTHENTICATED');
  });

  it('paywalls a non-A1 trial learner before spending a model call', async () => {
    const env: any = { USER_PROGRESS: new MemoryKv(), REDEEMED_CODES: new MemoryKv() };
    await env.USER_PROGRESS.put('session:sess_b2_writer', JSON.stringify({
      sub: 'b2-writer',
      email: 'b2@test.dev',
      created_at: Date.now(),
      expires_at: Date.now() + 3600_000,
    }));

    const res = await worker.fetch(
      new Request('https://worker.test/ai/check-writing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_b2_writer' },
        body: JSON.stringify({ ...VALID_BODY, cefr_level: 'B2', task_type: 'complaint' }),
      }),
      env,
    );

    expect(res.status).toBe(402);
    expect((await res.json() as any).code).toBe('PAYWALL_REQUIRED');
  });

  it('paywalls a trial learner whose free sessions are spent', async () => {
    // Writing is part of the trial, not an exemption from it: three used
    // sessions open the same Pro CTA the rest of the app shows. (Hints stay
    // quota-exempt on purpose — the quota is already consumed while a learner's
    // LAST free session is still running, so checking it there would strip
    // hints out of a conversation they are still entitled to have.)
    const env: any = { USER_PROGRESS: new MemoryKv(), REDEEMED_CODES: new MemoryKv() };
    await env.USER_PROGRESS.put('session:sess_used_writer', JSON.stringify({
      sub: 'used-writer',
      email: 'used@test.dev',
      created_at: Date.now(),
      expires_at: Date.now() + 3600_000,
    }));
    await env.USER_PROGRESS.put('ai-quota:used-writer', JSON.stringify({ used: 3, updated_at: Date.now() }));

    const res = await worker.fetch(
      new Request('https://worker.test/ai/check-writing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_used_writer' },
        body: JSON.stringify(VALID_BODY),
      }),
      env,
    );

    expect(res.status).toBe(402);
    expect((await res.json() as any).code).toBe('FREE_QUOTA_EXHAUSTED');
  });
});
