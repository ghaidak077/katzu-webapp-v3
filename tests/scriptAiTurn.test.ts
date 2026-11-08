import { describe, expect, it } from 'vitest';
import {
  advanceScript,
  buildScriptTurnContext,
  currentHint,
  scriptForScenario,
  startScript,
  understandAnswer,
  validateFarewellTurn,
  validateScriptAiTurn,
} from '@/lib/conversation/script';

/**
 * The scripted turn contract: the app owns the arc, the model only reads the
 * learner's words, reacts, and writes a hint for THIS attempt. These tests are
 * the promise that a model can help without being allowed to invent a fact, a
 * question, or an answer the learner never gave.
 */

const bakery = scriptForScenario('bakery_shopping', 'A1')!;
const greetings = scriptForScenario('first_greetings', 'A1')!;

describe('script turn packet', () => {
  it('carries the question on screen, the slot, and only scene facts', () => {
    const state = startScript(bakery);
    const { script_context } = buildScriptTurnContext(bakery, state);
    expect(script_context.step_id).toBe('bread');
    expect(script_context.slot).toBe('item');
    expect(script_context.question_de.length).toBeGreaterThan(0);
    expect(script_context.facts.join(' ')).not.toContain('Bali');
    expect(script_context.allowed_keywords).toContain('brot');
  });

  it('caps every field it sends to the worker', () => {
    const state = { ...startScript(bakery), slots: { name: 'x'.repeat(200) } };
    const { script_context } = buildScriptTurnContext(bakery, state, 'y'.repeat(200));
    expect(script_context.learner_name.length).toBeLessThanOrEqual(40);
    expect(script_context.facts.every((fact) => fact.length <= 220)).toBe(true);
  });
});

describe('AI reaction and hint validation', () => {
  it('keeps a clean in-character statement and drops a question', () => {
    const step = bakery.steps[0];
    const clean = validateScriptAiTurn(
      { reply_de: 'Sehr gern, das ist frisch.', reply_ar: 'بكل سرور، هذا طازج.' },
      { script: bakery, step },
    );
    expect(clean.reaction).toEqual({ de: 'Sehr gern, das ist frisch.', ar: 'بكل سرور، هذا طازج.' });

    const asks = validateScriptAiTurn(
      { reply_de: 'Möchten Sie noch etwas?', reply_ar: 'هل تريد شيئاً آخر؟' },
      { script: bakery, step },
    );
    expect(asks.reaction).toBeNull();
  });

  it('rejects an echo of the learner’s own sentence', () => {
    const step = bakery.steps[0];
    const echoed = validateScriptAiTurn(
      { reply_de: 'Ich möchte ein Brot.', reply_ar: 'أريد خبزاً.' },
      { script: bakery, step, learnerText: 'Ich möchte ein Brot.' },
    );
    expect(echoed.reaction).toBeNull();
  });

  it('accepts a hint that fits the number step and rejects a generic retry', () => {
    const step = bakery.steps[1];
    const good = validateScriptAiTurn(
      { hint_de: 'Drei Gläser, bitte.', hint_ar: 'ثلاثة أكواب، من فضلك.' },
      { script: bakery, step },
    );
    expect(good.hint?.de).toBe('Drei Gläser, bitte.');

    const vague = validateScriptAiTurn(
      { hint_de: 'Sag es noch einmal.', hint_ar: 'قلها مرة أخرى.' },
      { script: bakery, step },
    );
    expect(vague.hint).toBeNull();
  });

  it('uses the farewell reaction and never carries a hint into it', () => {
    const farewell = validateFarewellTurn(
      { reply_de: 'Tschüss, einen schönen Tag!', reply_ar: 'إلى اللقاء، يوماً سعيداً!', hint_de: 'Danke!', hint_ar: 'شكراً!' },
      { script: greetings },
    );
    expect(farewell.reaction?.de).toBe('Tschüss, einen schönen Tag!');
    expect(farewell.hint).toBeNull();
  });
});

describe('understanding is grounded in the learner’s words', () => {
  const nameStep = greetings.steps[0];
  const cityStep = greetings.steps.find((step) => step.match.type === 'city') ?? greetings.steps[2];

  it('lets the model reject a local false positive', () => {
    const local = understandAnswer(nameStep, 'Ich bin müde');
    expect(local.matched).toBe(false);
    const withAi = understandAnswer(nameStep, 'Ich bin müde', { matched: false });
    expect(withAi.matched).toBe(false);
  });

  it('rescues a phrasing the local matcher missed, when the value is in the sentence', () => {
    const rescued = understandAnswer(nameStep, 'Man nennt mich Sara', {
      matched: true,
      slot: 'name',
      value: 'Sara',
    });
    expect(rescued).toEqual({ matched: true, value: 'Sara' });
  });

  it('never accepts a value the learner did not say', () => {
    const invented = understandAnswer(cityStep, 'Ich wohne in Bali', {
      matched: true,
      slot: 'city',
      value: 'Berlin',
    });
    expect(invented.value).not.toBe('Berlin');
    expect(invented.value?.toLowerCase()).toContain('bali');
  });

  it('still accepts an explicit local answer when the model says no', () => {
    const explicit = understandAnswer(nameStep, 'Ich heiße Sara', { matched: false });
    expect(explicit).toEqual({ matched: true, value: 'Sara' });
  });
});

describe('an unclear answer still gets a human reaction', () => {
  it('acknowledges the learner, then re-asks its own question exactly once', () => {
    const result = advanceScript(greetings, startScript(greetings), {
      text: 'Ich bin müde.',
      hintUsed: false,
      aiReaction: { de: 'Alles klar.', ar: 'كل شيء واضح.' },
    });
    expect(result.matched).toBe(false);
    expect(result.reply?.de).toBe('Alles klar. Entschuldigung, wie ist dein Name?');
    expect(result.reply?.de.match(/\?/g)).toHaveLength(1);
    // The name the learner did not give is never treated as answered.
    expect(result.state.slots.name).toBeUndefined();
    expect(result.state.stepIndex).toBe(0);
  });

  it('falls back to «Wie bitte?» when the model wrote nothing, with the model answer in the hint dock', () => {
    const result = advanceScript(greetings, startScript(greetings), {
      text: 'Ich bin müde.',
      hintUsed: false,
    });
    expect(result.reply?.de).toBe('Wie bitte?');
    expect(result.state.hintOverride).not.toBeNull();
    expect(result.state.hintStepIndex).toBe(0);
  });
});

describe('adaptive hint state', () => {
  it('shows the hint written for the failed attempt, then drops it on advance', () => {
    const state = startScript(bakery);
    const first = advanceScript(bakery, state, {
      text: 'drie glasse',
      hintUsed: false,
      aiHint: { de: 'Drei Gläser, bitte.', ar: 'ثلاثة أكواب، من فضلك.' },
    });
    expect(first.matched).toBe(false);
    expect(currentHint(bakery, first.state)?.de).toBe('Drei Gläser, bitte.');

    const second = advanceScript(bakery, first.state, {
      text: 'Ich möchte ein Brot.',
      hintUsed: false,
      aiHint: { de: 'Drei Gläser, bitte.', ar: 'ثلاثة أكواب، من فضلك.' },
    });
    expect(second.matched).toBe(true);
    // The hint belonged to the failed attempt, not to the new question.
    expect(currentHint(bakery, second.state)?.de).not.toBe('Drei Gläser, bitte.');
  });
});
