import { describe, expect, it } from 'vitest';
import { ROLEPLAY_PROMPT_VERSION } from '../cloudflare-roleplay.js';
import { sessionsIn, summarise } from '../scripts/qa/objective-completion.mjs';

/**
 * The number this script reports is only useful if it refuses to mix prompt eras.
 * v10 renamed the closing objective (`say_goodbye` → `end_politely`); a v8 checkpoint counted
 * against a v10 row would show 0/1 for a mark v8 was never asked to make.
 */

const session = (promptVersion: string, objectivesDone: string[], objectivesTotal = 4, scenarioId = 'cafe_order') => ({
  sessionId: `${promptVersion}-${objectivesDone.join('-')}`,
  scenarioId,
  promptVersion,
  objectivesDone,
  objectivesTotal,
});

describe('per-objective completion', () => {
  it('keeps each prompt version in its own bucket', () => {
    const summary = summarise([
      session('8', ['order_drink', 'say_goodbye']),
      session(String(ROLEPLAY_PROMPT_VERSION), ['order_drink', 'order_food']),
    ]);
    const v8 = summary.versions.find((item) => item.version === '8');
    const current = summary.versions.find((item) => item.current);
    expect(v8?.rows.map((row) => row.objective).sort()).toEqual(['order_drink', 'say_goodbye']);
    expect(current?.rows.map((row) => row.objective)).toContain('order_food');
  });

  it('counts a session that stopped early in the denominator', () => {
    const { versions } = summarise([
      session('8', ['order_drink'], 4),
      session('8', [], 4),
    ]);
    const [v8] = versions;
    expect(v8.sessions).toBe(2);
    expect(v8.rows[0]).toEqual({ scenario: 'cafe_order', objective: 'order_drink', sessions: 1 });
    expect(v8.meanShare).toBe(0.125);
  });

  it('shows a current-prompt objective nobody reached as zero', () => {
    const current = String(ROLEPLAY_PROMPT_VERSION);
    const { versions } = summarise([session(current, ['order_drink'], 4)]);
    const rows = versions[0].rows;
    expect(rows.length, 'the plan seeds every objective, including the unreached ones').toBeGreaterThan(1);
    expect(rows.filter((row) => row.sessions === 0).length).toBeGreaterThan(0);
  });

  it('returns nothing for a directory that does not exist', () => {
    expect(sessionsIn('C:/does-not-exist/katzu-qa')).toEqual([]);
  });
});
