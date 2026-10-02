#!/usr/bin/env node
/**
 * Offline chat-quality harness (V28 Stage 1C).
 *
 * Runs the conversation validators against `tests/fixtures/chatTurns.json` and
 * prints the before/after pass rates the ledger quotes. No network, no secrets,
 * deterministic — so it can run in CI on every push and would have caught the
 * "Fehlt Ihr Gepäck? → Hier ist mein Pass" hint and the no-op corrections.
 *
 * Exits non-zero if the NEW rules do not score 100% on the fixture set (a
 * controlled set, so any miss is a real regression), or if a rule is vacuous.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateCorrection, hintMatchesQuestion, obstacleApplies } from '../cloudflare-turn-quality.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = JSON.parse(readFileSync(join(root, 'tests/fixtures/chatTurns.json'), 'utf8'));

const pct = (hits, total) => `${Math.round((hits / total) * 100)}% (${hits}/${total})`;

function score(rows, verdictOf, expectedOf) {
  let hits = 0;
  for (const row of rows) if (verdictOf(row) === expectedOf(row)) hits += 1;
  return { hits, total: rows.length };
}

const sections = [
  {
    name: 'hints',
    rows: fixtures.hints,
    before: (f) => Boolean(String(f.hintGerman || '').trim()),
    after: (f) => hintMatchesQuestion(f.lastAiReply, f.hintGerman),
    expected: (f) => f.expected === 'pass',
  },
  {
    name: 'corrections',
    rows: fixtures.corrections,
    before: (f) =>
      f.isCorrect ? true : Boolean(String(f.originalMistake || '').trim() && String(f.correctedGerman || '').trim()),
    after: (f) =>
      evaluateCorrection({
        isCorrect: f.isCorrect,
        originalMistake: f.originalMistake,
        correctedGerman: f.correctedGerman,
        learnerSentence: f.learnerSentence,
      }).ok,
    expected: (f) => f.expected === 'pass',
  },
  {
    name: 'obstacles',
    rows: fixtures.obstacles,
    before: () => true,
    after: (f) => obstacleApplies(f.turnIndex, { learnerAskedRepeat: f.learnerAskedRepeat }),
    expected: (f) => f.expected === 'yes',
  },
];

const total = sections.reduce((sum, section) => sum + section.rows.length, 0);
console.log(`chat-quality eval — fixtures: ${total}`);

let failed = false;
for (const section of sections) {
  const before = score(section.rows, section.before, section.expected);
  const after = score(section.rows, section.after, section.expected);
  console.log(`${section.name.padEnd(12)} before ${pct(before.hits, before.total)} → after ${pct(after.hits, after.total)}`);
  if (after.hits !== after.total) failed = true;
  if (before.hits === before.total) {
    console.warn(`chat-quality eval: ${section.name} fixtures are vacuous — the old rule already scores 100%.`);
    failed = true;
  }
}

if (failed) {
  console.error('chat-quality eval: a validator regressed against its own fixture set.');
  process.exit(1);
}
console.log('chat-quality eval: OK');
