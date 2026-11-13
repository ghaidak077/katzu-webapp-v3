import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkGerman } from '../src/lib/conversation/germanChecker';

/**
 * Every «أبلغ عن رد سيئ» report becomes a fixture here and a permanent test.
 *
 * One documented command turns a report into a fixture:
 *   npm run regression:report -- report.json
 * and one documented command turns it into a live eval input:
 *   npm run eval:chat -- --from-report report.json
 *
 * The promise a roleplay turn makes is narrow and testable: the reply the learner
 * saw is one clean German line, with at most one question, that the local
 * corrector would not change, and with no sentence about the exercise itself.
 * A report that fails this is a real defect in the prompt or the model, not a
 * matter of taste.
 */
const fixtureDir = join(process.cwd(), 'tests', 'fixtures', 'reported-exchanges');

const META_PHRASES = ['nächste frage', 'nächste aufgabe', 'nächsten schritt', 'schritt'];

interface ReportedExchange {
  scenarioId: string;
  cefrLevel?: string;
  learnerText: string;
  replyText: string;
  reportedAt: string;
  note?: string;
}

function fixtures(): Array<{ name: string; value: ReportedExchange }> {
  if (!existsSync(fixtureDir)) return [];
  return readdirSync(fixtureDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({
      name,
      value: JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as ReportedExchange,
    }));
}

const reported = fixtures();

describe('reported bad replies become regressions', () => {
  it('has the documented one-command entry points', () => {
    // Both loops are code, not prose: a missing script would end the feedback
    // path silently.
    expect(existsSync(join(process.cwd(), 'scripts', 'replay-reported-exchange.mjs'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'scripts', 'eval-chat.mjs'))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(typeof pkg.scripts?.['eval:chat']).toBe('string');
  });

  if (reported.length === 0) {
    it('has no open reports (add one with `npm run regression:report -- report.json`)', () => {
      expect(reported.length).toBe(0);
    });
  }

  for (const { name, value } of reported) {
    it(`${name}: the reported reply is one clean German line`, () => {
      expect(value.replyText.trim().length).toBeGreaterThan(0);
      // The learner must never be handed a line the app would correct, one turn
      // asks at most one question, and the persona never talks about the task.
      expect(checkGerman(value.replyText).errors).toEqual([]);
      expect((value.replyText.match(/\?/g) || []).length).toBeLessThanOrEqual(1);
      expect(value.replyText).not.toMatch(/\*\*|__[^_]|`/);
      const lower = value.replyText.toLowerCase();
      for (const phrase of META_PHRASES) expect(lower).not.toContain(phrase);
    });
  }
});
