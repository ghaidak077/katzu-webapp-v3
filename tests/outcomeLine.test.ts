import { describe, expect, it } from 'vitest';
import { PRACTISING_WITHOUT_HINTS_AR, sessionOutcomeLine } from '@/lib/report/outcomeLine';

const HINT_LINE = 'أكملنا الجلسة بمساعدة تلميحاتي. المرة القادمة سنحتاج تلميحات أقل — هكذا يُبنى التدريب.';

/**
 * Found on 2026-11-15 driving scenario one as a learner who never opened a hint:
 * the report told them the session was finished "with the help of my hints".
 * `PRACTISING` is derived from a missing independent session, so the copy has to
 * follow the recorded assisted count, not the state name.
 */
describe('the report outcome line', () => {
  it('never claims hint help when no turn was hint-assisted', () => {
    const line = sessionOutcomeLine('PRACTISING', 0, HINT_LINE);
    expect(line).toBe(PRACTISING_WITHOUT_HINTS_AR);
    expect(line).not.toContain('تلميح');
  });

  it('keeps the authored hint line when the session really was assisted', () => {
    expect(sessionOutcomeLine('PRACTISING', 2, HINT_LINE)).toBe(HINT_LINE);
  });

  it('leaves every other state untouched', () => {
    expect(sessionOutcomeLine('INDEPENDENT', 0, 'x')).toBe('x');
    expect(sessionOutcomeLine('INTRODUCED', 3, 'y')).toBe('y');
  });

  it('treats a missing count as zero rather than crashing', () => {
    expect(sessionOutcomeLine('PRACTISING', Number.NaN, HINT_LINE)).toBe(PRACTISING_WITHOUT_HINTS_AR);
  });
});
