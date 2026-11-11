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
import {
  ASSUMED_COMPLETION_TOKENS,
  AI_TIER_PRICES_USD_PER_MTOK,
  PROVIDER_TIERS,
  estimateTurnCostUsd,
} from '../cloudflare-ai-router.js';

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

// ---------------------------------------------------------------------------
// Cost report (Batch 1 item 4). PRICES ARE UNPROVEN — see AI_TIER_PRICES_USD_PER_MTOK.
// ---------------------------------------------------------------------------
const meanPromptTokens = fixture.scenarios.length ? Math.round(totalAfter / fixture.scenarios.length) : 0;
const MOCK_TURNS = 3;          // one mock = plan, present, react
const TURNS_PER_USER_DAY = 12; // a learner's realistic ceiling, well under AI_RATE_LIMIT_PER_DAY

const usd = (n) => `$${n.toFixed(4)}`;
console.log('');
console.log('estimated cost (UNPROVEN prices — confirm against an invoice)');
console.log(`mean prompt ~${meanPromptTokens} tokens, assumed completion ${ASSUMED_COMPLETION_TOKENS}`);
console.log(`one mock = ${MOCK_TURNS} turns · one user-day = ${TURNS_PER_USER_DAY} turns`);
console.log('');
console.log(`${'tier'.padEnd(10)} ${'per turn'.padStart(10)} ${'per mock'.padStart(10)} ${'per user-day'.padStart(14)}`);

const perUserDay = {};
for (const tier of PROVIDER_TIERS) {
  const perTurn = estimateTurnCostUsd({ tier, inputTokens: meanPromptTokens });
  perUserDay[tier] = perTurn * TURNS_PER_USER_DAY;
  console.log(
    `${tier.padEnd(10)} ${usd(perTurn).padStart(10)} ${usd(perTurn * MOCK_TURNS).padStart(10)} ${usd(perTurn * TURNS_PER_USER_DAY).padStart(14)}`,
  );
}

// What cheap-routing is worth: the flagship→lite saving on one user's day.
const saving = perUserDay.flagship - perUserDay.lite;
console.log('');
console.log(`flagship → lite saves ${usd(saving)} per user-day (~${Math.round((saving / (perUserDay.flagship || 1)) * 100)}%)`);

// ---------------------------------------------------------------------------
// Before / after cheap-routing. UNPROVEN: the easy share is a planning
// assumption, not a measurement — no production turn log is available to this
// script, so `EASY_SHARE` must be replaced with a measured figure before these
// numbers are quoted as fact. 0.5 means "half of all turns are easy".
// ---------------------------------------------------------------------------
const EASY_SHARE = Number(process.env.EASY_SHARE ?? 0.5);
const EASY_TIER = 'mid';
const beforePerTurn = estimateTurnCostUsd({ tier: 'flagship', inputTokens: meanPromptTokens });
const afterPerTurn =
  beforePerTurn * EASY_SHARE + estimateTurnCostUsd({ tier: EASY_TIER, inputTokens: meanPromptTokens }) * (1 - EASY_SHARE);
const beforeDay = beforePerTurn * TURNS_PER_USER_DAY;
const afterDay = afterPerTurn * TURNS_PER_USER_DAY;
console.log('');
console.log(`cheap-routing before/after (easy share ${(EASY_SHARE * 100).toFixed(0)}% — UNPROVEN)`);
console.log(`${''.padEnd(18)}${'before'.padStart(10)} ${'after'.padStart(10)} ${'saved'.padStart(10)}`);
for (const [label, turns] of [['per turn', 1], ['per mock', MOCK_TURNS], ['per user-day', TURNS_PER_USER_DAY]]) {
  const b = beforePerTurn * turns;
  const a = afterPerTurn * turns;
  console.log(`${label.padEnd(18)}${usd(b).padStart(10)} ${usd(a).padStart(10)} ${usd(b - a).padStart(10)}`);
}
console.log(`saved ${usd(beforeDay - afterDay)} per user-day (~${Math.round(((beforeDay - afterDay) / (beforeDay || 1)) * 100)}%)`);
console.log('UNPROVEN: EASY_SHARE is an assumption. Set EASY_SHARE=1 for no saving, =0 for the full saving.');

// A recommended daily cap for the operator's AI_DAILY_SPEND_CAP. It is expressed
// in CALLS, because that is what the cap counts — the prices only choose the
// number. The budget ceiling is deliberately a guess the owner edits: one week
// of the current active-user count at the flagship rate.
const ACTIVE_USERS = 5; // the cohort actually in the app today
const DAILY_BUDGET_USD = 1.0;
const flagshipPerTurn = estimateTurnCostUsd({ tier: 'flagship', inputTokens: meanPromptTokens });
const recommendedCap = flagshipPerTurn > 0
  ? Math.floor((DAILY_BUDGET_USD / ACTIVE_USERS) / flagshipPerTurn)
  : 0;
console.log(`recommended AI_DAILY_SPEND_CAP: ${recommendedCap} calls/day`);
console.log(`  = $${DAILY_BUDGET_USD.toFixed(2)}/day ÷ ${ACTIVE_USERS} active users ÷ ${usd(flagshipPerTurn)}/turn, at the flagship rate.`);
console.log('  UNPROVEN: both the budget ceiling and the price table are assumptions. Set 0 to stop all AI traffic.');

if (failed) {
  console.error('measure-turn-cost: the beats prompt is larger than the cap allows.');
  process.exit(1);
}
console.log('measure-turn-cost: OK');
