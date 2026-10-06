import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arCount } from '../src/lib/i18n/arabicCount';
import { MAX_FREE_AI_SESSIONS, MAX_FREE_SESSIONS_AR, freeSessionsCopy } from '../src/lib/entitlement/trialCopy';

/**
 * The free-session promise, held to the number the Worker actually enforces.
 *
 * This is a launch-week property with a one-week fuse: the landing page, the
 * offer and the paywall all promise a number of free conversations in Arabic,
 * and the Worker enforces a number of its own. If those ever differ, a learner
 * is told one thing and charged for the other, and nothing in the product would
 * notice — so the check reads the Worker's declaration out of the source rather
 * than trusting a comment or a doc.
 *
 * L12 adds the numeral shape to that promise: every user-facing price/session
 * count is written with Western digits («3 جلسات»), never Arabic-Indic («٣
 * جلسات»). `tests/westernNumerals.test.ts` holds the whole rule across surfaces;
 * this file keeps the count honest against the Worker.
 */
const WORKER_SOURCE = readFileSync('cloudflare-unified-worker.js', 'utf8');

/** The Worker's own constant, read from where it is declared. */
function workerMaxFreeSessions(): number {
  const match = WORKER_SOURCE.match(/^const MAX_FREE_AI_SESSIONS = (\d+);$/m);
  if (!match) throw new Error('cloudflare-unified-worker.js no longer declares MAX_FREE_AI_SESSIONS');
  return Number(match[1]);
}

const SESSION_FORMS = { one: 'جلسة واحدة', two: 'جلستان', few: 'جلسات', many: 'جلسة' } as const;

describe('the free-session promise', () => {
  it('is the number the Worker enforces', () => {
    expect(MAX_FREE_AI_SESSIONS).toBe(workerMaxFreeSessions());
  });

  it('is a positive whole number on both sides', () => {
    // A zero or a negative allowance would make «3 جلسات» a lie in the other
    // direction, and would break arCount's form table.
    expect(Number.isInteger(MAX_FREE_AI_SESSIONS)).toBe(true);
    expect(MAX_FREE_AI_SESSIONS).toBeGreaterThan(0);
    expect(Number.isInteger(workerMaxFreeSessions())).toBe(true);
    expect(workerMaxFreeSessions()).toBeGreaterThan(0);
  });

  it('reads as Arabic words carrying a Western digit, not an Arabic-Indic one', () => {
    // MEMORY 27: a digit interpolated into Arabic prose gives the wrong number
    // form ("راجع 2 الآن" instead of "راجع جلستان"), so the count goes through
    // arCount and the promise carries its result.
    expect(MAX_FREE_SESSIONS_AR).toBe('3 جلسات');
    expect(MAX_FREE_SESSIONS_AR).toMatch(/^3 /);
    expect(MAX_FREE_SESSIONS_AR).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
  });

  it('follows the allowance if the Worker ever changes it', () => {
    // Guards the mirror, not the sentence: a different allowance must produce a
    // different, correctly-formed Arabic phrase rather than a stale «3 جلسات».
    const expected: Record<number, string> = {
      1: 'جلسة واحدة',
      2: 'جلستان',
      3: '3 جلسات',
      11: '11 جلسة',
      100: '100 جلسة',
    };
    for (const [n, phrase] of Object.entries(expected)) {
      expect(arCount(Number(n), SESSION_FORMS)).toBe(phrase);
    }
  });

  it('writes the numeral the rest of the product uses — a Western digit', () => {
    // L12: the digit shape has no option. A promise is prose, but the numeral in
    // it is Latin like every other number a learner sees at launch.
    expect(arCount(3, SESSION_FORMS)).toBe('3 جلسات');
    expect(arCount(3, SESSION_FORMS)).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
  });
});

describe('what the learner is told, once the allowance runs out', () => {
  it('says the trial is over without inventing a number', () => {
    expect(freeSessionsCopy(0)).toContain('انتهت جلساتك التجريبية المجانية');
    expect(freeSessionsCopy(0)).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
  });

  it('counts what is left, with a Western digit', () => {
    expect(freeSessionsCopy(2)).toContain('جلستان');
    expect(freeSessionsCopy(1)).toContain('جلسة واحدة');
    expect(freeSessionsCopy(3)).toContain('3 جلسات');
    expect(freeSessionsCopy(3)).toMatch(/3 جلسات/);
    expect(freeSessionsCopy(3)).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
  });

  it('says the ledger is unreadable rather than claiming zero or three', () => {
    // `null` is unknown, not spent. Telling a learner who still has sessions
    // that they have none is the exact failure this screen exists to avoid.
    const copy = freeSessionsCopy(null);
    expect(copy).toContain('يُحسب على خوادمنا');
    expect(copy).not.toMatch(/[0-9\u0660-\u0669\u06F0-\u06F9]/);
  });
});

describe('no surface contradicts the Worker', () => {
  /** Every app file that can put a promise in front of a learner. */
  const surfaces = [
    'src/features/marketing/LandingScreen.tsx',
    'src/features/conversation/useLiveConversation.ts',
    'src/components/sheets/PaywallModal.tsx',
    'src/lib/entitlement/trialCopy.ts',
  ];

  /** The code, with comments removed (their prose may quote the old shape). */
  function code(file: string): string {
    return readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  it('writes no free-session count as a hand-typed Arabic-Indic numeral', () => {
    // «٣ جلسات» typed by hand was the stale number, and is now also the wrong
    // digit shape. The count must come from MAX_FREE_SESSIONS_AR.
    const offenders = surfaces.filter((f) => /[\u0660-\u0669\u06F0-\u06F9]\s*جلسة/.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it('takes the allowance from the one constant wherever it is stated', () => {
    // The landing page states it twice; both must read the constant.
    const landing = readFileSync('src/features/marketing/LandingScreen.tsx', 'utf8');
    const stated = (landing.match(/MAX_FREE_SESSIONS_AR/g) || []).length;
    expect(stated).toBeGreaterThanOrEqual(3); // 1 import + 2 uses
    expect(code('src/features/marketing/LandingScreen.tsx')).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]\s*جلسة/);
    expect(code('src/features/marketing/LandingScreen.tsx')).not.toMatch(/[0-9]+\s*جلسة/);
  });
});
