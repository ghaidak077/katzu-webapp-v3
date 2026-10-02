#!/usr/bin/env node
/**
 * Offline turn-cost harness for the V28 Stage 1 beats change.
 *
 * The learner waits on an unstreamed turn, so the prompt's size IS part of its
 * latency. This script builds the REAL `/ai/turn` system instruction through the
 * same exported `buildTurnSystemInstruction` the worker uses, with and without the
 * scenario's deterministic beats, and reports the added tokens. It fails CI if the
 * increase crosses `BEATS_PROMPT_TOKEN_CAP`, so a future prompt edit cannot
 * silently price every turn up.
 *
 * Token counts are an ESTIMATE (characters / 4, the standard rough ratio for
 * English/German + JSON). The absolute number is approximate; the DELTA is what
 * this measures, and it is the same estimator on both sides. No network, no key.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEATS_PROMPT_TOKEN_CAP, beatsInstruction, deriveConversationBeats } from '../cloudflare-conversation-beats.js';
import { buildTurnSystemInstruction } from '../cloudflare-ai-chat.js';
import { correctionBudgetFor, levelConstraintLine } from '../cloudflare-level-spec.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(readFileSync(join(root, 'tests/fixtures/turnCost.json'), 'utf8'));

const estimateTokens = (text) => Math.ceil([...String(text)].length / 4);
const promptText = (parts) => parts.map((part) => part.text).join('');
const promptTokens = (parts) => estimateTokens(promptText(parts));

function contextFor(scenario, beats) {
  return {
    level: scenario.level,
    scenarioTitle: scenario.title,
    scenarioId: scenario.id,
    persona: scenario.persona,
    scenarioCategory: scenario.category,
    sarcasmLevel: 2,
    isFinalTurn: false,
    turnIndex: 2,
    learnerAskedRepeat: false,
    vocabulary: [],
    grammarReference: null,
    memory: [],
    beats,
    levelConstraint: levelConstraintLine(scenario.level),
    correctionBudget: correctionBudgetFor(scenario.level),
  };
}

let failed = false;
let totalBefore = 0;
let totalAfter = 0;
console.log('turn-cost — system prompt, beats OFF → ON (estimated tokens, chars/4)');
console.log(`${'scenario'.padEnd(22)} ${'beats'.padStart(5)} ${'before'.padStart(7)} ${'after'.padStart(7)} ${'delta'.padStart(6)}`);
for (const scenario of fixture.scenarios) {
  const beats = deriveConversationBeats(scenario.phrases);
  const before = promptTokens(buildTurnSystemInstruction(contextFor(scenario, [])).parts);
  const after = promptTokens(buildTurnSystemInstruction(contextFor(scenario, beats)).parts);
  totalBefore += before;
  totalAfter += after;
  const delta = after - before;
  console.log(`${scenario.id.padEnd(22)} ${String(beats.length).padStart(5)} ${String(before).padStart(7)} ${String(after).padStart(7)} ${String(delta).padStart(6)}`);
  if (delta > BEATS_PROMPT_TOKEN_CAP) {
    console.error(`  ✗ ${scenario.id}: beats added ~${delta} tokens, over the ${BEATS_PROMPT_TOKEN_CAP} cap`);
    failed = true;
  }
  // The beats must actually reach the prompt, and stay a small ordered list.
  const instruction = beatsInstruction(beats);
  if (!instruction || !instruction.includes(beats.length + ')')) {
    console.error(`  ✗ ${scenario.id}: the beats instruction did not reach the prompt`);
    failed = true;
  }
}

const meanDelta = fixture.scenarios.length ? Math.round((totalAfter - totalBefore) / fixture.scenarios.length) : 0;
console.log(`mean added tokens per turn: ~${meanDelta} (cap ${BEATS_PROMPT_TOKEN_CAP})`);

if (failed) {
  console.error('measure-turn-cost: the beats prompt is larger than the cap allows.');
  process.exit(1);
}
console.log('measure-turn-cost: OK');
