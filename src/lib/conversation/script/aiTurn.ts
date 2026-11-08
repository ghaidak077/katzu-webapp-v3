import type { CEFRLevel } from '@/types/models';
import { fillSlots, guardGermanLine, guardHintLine, hasMarkdown } from './engine';
import { lintGloss } from './glossLint';
import type {
  PersonaRole,
  ScenarioScript,
  ScriptLine,
  ScriptState,
  ScriptStep,
  ScriptUnderstanding,
} from './types';

/**
 * The AI's half of a scripted turn — and its limits.
 *
 * The script owns the arc: which question is on screen, what counts as an
 * answer, and what is asked next. The model owns the human part: reading the
 * learner's actual sentence, reacting to it in character, and writing a hint
 * that repairs THIS attempt. It never chooses the next question and never gets
 * to move the conversation to a topic the scene did not introduce.
 *
 * Everything below is pure and network-free so the same rules can be unit
 * tested and replayed in the simulation gate.
 */

/** What the client sends for a scripted turn, already bounded to the step. */
export interface ScriptTurnWireContext {
  step_id: string;
  slot: string;
  question_de: string;
  question_ar: string;
  hint_de: string;
  hint_ar: string;
  /** Tokens the learner can use for this question (never a list of facts). */
  allowed_keywords: string[];
  /** The scene's own facts: persona, goal and values the learner supplied. */
  facts: string[];
  learner_name: string;
  /** The persona's grammatical gender, so its Arabic agrees with itself. */
  persona_gender: 'female' | 'male';
  awaiting_farewell: boolean;
  /** 0-based turn index; the model uses it only for variety. */
  turn_index: number;
}

/** The validated result of one scripted model call. */
export interface ScriptAiTurn {
  reaction: ScriptLine | null;
  hint: ScriptLine | null;
  understanding: ScriptUnderstanding | null;
}

const EMPTY: ScriptAiTurn = { reaction: null, hint: null, understanding: null };

function cleanLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/^\s*(reply_de|reply_ar|hint_de|hint_ar|de|ar)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function sceneFacts(script: ScenarioScript, state: ScriptState, learnerName?: string): string[] {
  const facts = [
    `الشخصية: ${script.persona.name} — ${script.persona.role}`,
    `هدف المشهد: ${script.goalAr}`,
  ];
  const name = state.slots.name || learnerName;
  if (name) facts.push(`اسم المتعلّم: ${name}`);
  for (const [slot, value] of Object.entries(state.slots)) {
    if (slot === 'name') continue;
    if (value) facts.push(`${slot}: ${value}`);
  }
  // These are the only other German sentences the scene itself contains. The
  // model may refer to them; anything else it says about the world is invented.
  facts.push('عبارات المشهد المتاحة:');
  for (const step of script.steps) {
    if (step.farewell) continue;
    facts.push(`- ${fillSlots(step.asks[0].de, state.slots, learnerName)}`);
  }
  return facts;
}

/** The bounded packet that rides the existing `/ai/turn` request. */
export function buildScriptTurnContext(
  script: ScenarioScript,
  state: ScriptState,
  learnerName?: string,
): { script_context: ScriptTurnWireContext } {
  const step = script.steps[state.stepIndex] ?? script.steps[0];
  const ask = step.asks[0] ?? { de: '', ar: '' };
  const hint = step.hints[0] ?? { de: '', ar: '' };
  return {
    script_context: {
      step_id: step.id,
      slot: step.slot ?? '',
      question_de: fillSlots(ask.de, state.slots, learnerName),
      question_ar: ask.ar.replace(/\{([a-zA-Z]+)\}/g, (_all, key: string) =>
        key === 'name' ? state.slots.name || learnerName || 'أنت' : state.slots[key] || '',
      ),
      hint_de: fillSlots(hint.de, state.slots, learnerName),
      hint_ar: hint.ar,
      allowed_keywords: (step.keywords ?? []).slice(0, 8).map((word) => word.slice(0, 40)),
      facts: sceneFacts(script, state, learnerName).slice(0, 24),
      learner_name: (state.slots.name || learnerName || '').slice(0, 40),
      persona_gender: script.persona.gender,
      awaiting_farewell: state.awaitingFarewell,
      turn_index: Math.max(0, Math.min(200, state.turns)),
    },
  };
}

function asScriptLine(de: string, ar: string, max: number): ScriptLine | null {
  const german = cleanLine(de, max);
  const arabic = cleanLine(ar, max * 3);
  if (!german || !arabic) return null;
  return { de: german, ar: arabic };
}

function hintFitsStep(step: ScriptStep, hint: string): boolean {
  const normalized = hint.toLowerCase();
  if (/_{2,}/.test(hint)) return true;
  if (!step.match) return true;
  switch (step.match.type) {
    case 'number':
      return /\b(\d{1,3}|eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwanzig)\b/i.test(hint);
    case 'yesno':
      return /\b(ja|nein|doch|gern|gerne|klar|bitte)\b/i.test(hint);
    case 'keyword':
      return step.match.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
    case 'name':
    case 'origin':
    case 'city':
    case 'anything':
      return true;
    default:
      return true;
  }
}

/**
 * Turn model output into a turn the script can trust.
 *
 * A rejected field becomes `null` and the script's authored line is used. The
 * caller never sees a partial or unsafe sentence: it is either a clean German
 * line with no question, or nothing at all.
 */
export function validateScriptAiTurn(
  raw: unknown,
  opts: {
    script: ScenarioScript;
    step: ScriptStep;
    level?: CEFRLevel;
    learnerText?: string;
  },
): ScriptAiTurn {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const value = raw as Record<string, unknown>;
  // The worker replies in snake_case; the client transport maps it to camelCase.
  // Accepting both keeps this validator usable on either side of the wire.
  const field = (snake: string, camel: string) => value[snake] ?? value[camel];
  const level = opts.level ?? opts.script.level;
  const role: PersonaRole = opts.script.persona.role;

  // 1. The reaction is a statement. One question per turn belongs to the
  //    script's ask; a model question here would duplicate or replace it.
  let reaction: ScriptLine | null = null;
  const reactionDe = cleanLine(field('reply_de', 'replyDe'), level === 'A0' || level === 'A1' ? 110 : 170);
  const reactionAr = cleanLine(field('reply_ar', 'replyAr'), 360);
  if (reactionDe && reactionAr && !hasMarkdown(reactionDe) && !reactionDe.includes('?') && !reactionDe.includes('{')) {
    const guard = guardGermanLine(reactionDe, { level, role, asksQuestion: false });
    const repeatsQuestion = reactionDe.toLowerCase() === opts.step.asks[0]?.de.toLowerCase();
    const echo = opts.learnerText && reactionDe.trim().toLowerCase() === opts.learnerText.trim().toLowerCase();
    const agrees = lintGloss(reactionAr, opts.script.persona.gender).length === 0;
    if (guard.ok && !repeatsQuestion && !echo && agrees) reaction = { de: reactionDe, ar: reactionAr };
  }

  // 2. The hint must answer the question that is on screen. A generic "try
  //    again" is worse than the authored hint, so it is rejected here.
  let hint: ScriptLine | null = null;
  const hintDe = cleanLine(field('hint_de', 'hintDe'), 120);
  const hintAr = cleanLine(field('hint_ar', 'hintAr'), 360);
  if (hintDe && hintAr && !hasMarkdown(hintDe) && !hintDe.includes('?') && !hintDe.includes('{')) {
    const guard = guardHintLine({ de: hintDe, ar: hintAr }, level, role);
    const sameAsQuestion = hintDe.toLowerCase() === opts.step.asks[0]?.de.toLowerCase();
    const agrees = lintGloss(hintAr, opts.script.persona.gender).length === 0;
    if (guard.ok && !sameAsQuestion && agrees && hintFitsStep(opts.step, hintDe)) {
      hint = { de: hintDe, ar: hintAr };
    }
  }

  // 3. Understanding is a reading of the learner's words. It cannot invent a
  //    slot or a value; the engine grounds the value in the learner's sentence.
  let understanding: ScriptUnderstanding | null = null;
  if (typeof value.matched === 'boolean') {
    const slot = typeof value.slot === 'string' ? value.slot.slice(0, 24) : '';
    const understood = typeof value.value === 'string' ? value.value.trim().slice(0, 48) : '';
    understanding = {
      matched: value.matched,
      slot: slot || undefined,
      value: understood || undefined,
    };
  }

  return { reaction, hint, understanding };
}

/** The farewell turn has one job: close warmly, no question, no hint. */
export function validateFarewellTurn(raw: unknown, opts: { script: ScenarioScript; level?: CEFRLevel }): ScriptAiTurn {
  const base = validateScriptAiTurn(raw, {
    ...opts,
    step: opts.script.steps[opts.script.steps.length - 1],
  });
  return { reaction: base.reaction, hint: null, understanding: null };
}
