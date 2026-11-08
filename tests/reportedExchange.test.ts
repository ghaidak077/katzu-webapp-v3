import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkGerman } from '../src/lib/conversation/germanChecker';
import { scriptForScenario } from '../src/lib/conversation/script';

/**
 * Every «أبلغ عن رد سيئ» report becomes a fixture here and a permanent test.
 *
 * One documented command turns a report into a fixture:
 *   npm run regression:report -- report.json
 *
 * The promise a scripted scenario makes is narrow and testable: the reply the
 * learner saw is one clean German line, with at most one question, that the
 * local corrector would not change. A report that fails this is a real defect
 * in the script content, not a matter of taste.
 */
const fixtureDir = join(process.cwd(), 'tests', 'fixtures', 'reported-exchanges');

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
  it('has a documented one-command entry point', () => {
    // The script is the entry point; its absence would silently end the loop.
    expect(existsSync(join(process.cwd(), 'scripts', 'replay-reported-exchange.mjs'))).toBe(true);
  });

  if (reported.length === 0) {
    it('has no open reports (add one with `npm run regression:report -- report.json`)', () => {
      expect(reported.length).toBe(0);
    });
  }

  for (const { name, value } of reported) {
    it(`${name}: the reported reply is a scripted scenario's clean line`, () => {
      const script = scriptForScenario(value.scenarioId);
      expect(script, `${value.scenarioId} is no longer scripted`).not.toBeNull();
      expect(value.replyText.trim().length).toBeGreaterThan(0);

      // The core promise: the learner must never be handed a line the app would
      // correct, and one turn asks at most one question.
      expect(checkGerman(value.replyText).errors).toEqual([]);
      expect((value.replyText.match(/\?/g) || []).length).toBeLessThanOrEqual(1);
      expect(value.replyText).not.toMatch(/\*\*|__[^_]|`/);
    });
  }
});
