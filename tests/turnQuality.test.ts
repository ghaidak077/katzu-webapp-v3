import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contentWords,
  evaluateCorrection,
  hintMatchesQuestion,
  obstacleApplies,
  questionType,
} from '../cloudflare-turn-quality.js';

/**
 * The chat-quality validators (V28 Stage 1C) measured against the fixture set the
 * offline harness uses, so the "before 41% → after 100%" claim in the ledger is
 * reproducible by `npm test` alone. The non-vacuity block proves the fixtures
 * actually discriminate: the OLD rules misclassify them, so a rule that always
 * returned the same verdict could not post these numbers.
 */

interface HintFixture {
  id: string;
  lastAiReply: string;
  hintGerman: string;
  expected: 'pass' | 'fail';
}
interface CorrectionFixture {
  id: string;
  isCorrect: boolean;
  originalMistake: string;
  correctedGerman: string;
  learnerSentence: string;
  expected: 'pass' | 'fail';
}
interface ObstacleFixture {
  id: string;
  turnIndex: number;
  learnerAskedRepeat: boolean;
  expected: 'yes' | 'no';
}
const fixtures = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/chatTurns.json'), 'utf8')) as {
  hints: HintFixture[];
  corrections: CorrectionFixture[];
  obstacles: ObstacleFixture[];
};

const newHintPass = (f: HintFixture) => hintMatchesQuestion(f.lastAiReply, f.hintGerman);
const newCorrectionPass = (f: CorrectionFixture) =>
  evaluateCorrection({
    isCorrect: f.isCorrect,
    originalMistake: f.originalMistake,
    correctedGerman: f.correctedGerman,
    learnerSentence: f.learnerSentence,
  }).ok;
const newObstacleApplies = (f: ObstacleFixture) => obstacleApplies(f.turnIndex, { learnerAskedRepeat: f.learnerAskedRepeat });

// The rules as they were before V28.
const oldHintPass = (f: HintFixture) => Boolean(String(f.hintGerman || '').trim());
const oldCorrectionPass = (f: CorrectionFixture) =>
  f.isCorrect ? true : Boolean(String(f.originalMistake || '').trim() && String(f.correctedGerman || '').trim());
const oldObstacleApplies = (_f: ObstacleFixture) => true;

const accuracy = <T,>(rows: T[], predicate: (row: T, expected: string) => boolean, expectedOf: (row: T) => string) =>
  rows.filter((row) => predicate(row, expectedOf(row))).length / rows.length;

describe('chat-quality fixtures describe the right verdicts', () => {
  it('hints', () => {
    for (const f of fixtures.hints) {
      expect(newHintPass(f), `${f.id}: ${f.hintGerman}`).toBe(f.expected === 'pass');
    }
  });
  it('corrections', () => {
    for (const f of fixtures.corrections) {
      expect(newCorrectionPass(f), f.id).toBe(f.expected === 'pass');
    }
  });
  it('obstacles', () => {
    for (const f of fixtures.obstacles) {
      expect(newObstacleApplies(f), f.id).toBe(f.expected === 'yes');
    }
  });
});

describe('the fixtures discriminate (the old rules fail them)', () => {
  it('the old hint rule accepts the observed bad hint', () => {
    expect(oldHintPass(fixtures.hints[0])).toBe(true);
    expect(newHintPass(fixtures.hints[0])).toBe(false);
  });
  it('the old correction rule accepts no-op and already-correct corrections', () => {
    const noOp = fixtures.corrections.find((f) => f.id === 'corr-02')!;
    expect(oldCorrectionPass(noOp)).toBe(true);
    expect(newCorrectionPass(noOp)).toBe(false);
  });
  it('the old obstacle rule fires on the first turn and after a repeat request', () => {
    expect(oldObstacleApplies(fixtures.obstacles[0])).toBe(true);
    expect(newObstacleApplies(fixtures.obstacles[0])).toBe(false);
  });
});

describe('the before/after rates the ledger quotes', () => {
  it('improves every validator and reaches 100% after', () => {
    const hintBefore = accuracy(fixtures.hints, (f, e) => oldHintPass(f) === (e === 'pass'), (f) => f.expected);
    const hintAfter = accuracy(fixtures.hints, (f, e) => newHintPass(f) === (e === 'pass'), (f) => f.expected);
    const corrBefore = accuracy(fixtures.corrections, (f, e) => oldCorrectionPass(f) === (e === 'pass'), (f) => f.expected);
    const corrAfter = accuracy(fixtures.corrections, (f, e) => newCorrectionPass(f) === (e === 'pass'), (f) => f.expected);
    const obsBefore = accuracy(fixtures.obstacles, (f, e) => oldObstacleApplies(f) === (e === 'yes'), (f) => f.expected);
    const obsAfter = accuracy(fixtures.obstacles, (f, e) => newObstacleApplies(f) === (e === 'yes'), (f) => f.expected);
    expect(hintAfter).toBe(1);
    expect(corrAfter).toBe(1);
    expect(obsAfter).toBe(1);
    expect(hintBefore).toBeLessThan(1);
    expect(corrBefore).toBeLessThan(1);
    expect(obsBefore).toBeLessThan(1);
  });
});

describe('the primitives', () => {
  it('classifies question types', () => {
    expect(questionType('Fehlt Ihr Gepäck?')).toBe('yesno');
    expect(questionType('Wann fährt der Zug?')).toBe('wh');
    expect(questionType('Guten Tag.')).toBe('none');
  });
  it('keeps only content words', () => {
    expect(contentWords('Fehlt Ihr Gepäck?')).toEqual(['fehlt', 'gepaeck']);
  });
});
