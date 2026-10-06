import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_FREE_SESSIONS_AR, freeSessionsCopy } from '../src/lib/entitlement/trialCopy';

/**
 * ONE RULE: every user-facing price and session count is a Western digit.
 *
 * The product shipped Arabic-Indic numerals (٣ جلسات، ٢٩ €) inherited from the
 * Arabic-copy convention. At launch the owner's rule is the opposite: a learner
 * reading a price or a free-session count sees «3 جلسات» and «29 €», the same
 * digits as the German, the level chip and every other number on the screen.
 *
 * This file is the single gate for that rule. It does not try to police Arabic
 * prose in general — durations («2 دقائق»), ordinals and the archive docs are
 * out of scope. It polices exactly the two classes of number the owner named:
 * MONEY and SESSION COUNTS, wherever they can reach a learner.
 */

const ARABIC_INDIC = /[\u0660-\u0669\u06F0-\u06F9]/;
/**
 * Every user-facing numeral is Western (launch-week G1 extended the rule from
 * prices/session counts to ALL UI strings), so no noun token gates the scan
 * any more. A digits-in-anything line fails; prose about digits in comments is
 * still stripped below.
 */

/** Every source file under src/, so a new surface cannot slip past a fixed list. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

/** Comments removed: prose may quote a digit shape without shipping it. */
function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the Western-numeral rule', () => {
  it('writes NO user-facing string in Arabic-Indic digits anywhere in src', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      const code = withoutComments(readFileSync(file, 'utf8'));
      code.split(/\r?\n/).forEach((line, i) => {
        if (ARABIC_INDIC.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('still keeps the whole rule honest: reintroducing ٣ fails the scan', () => {
    // Guard-the-guard: the scan must fail on the exact defective shape it
    // exists for («0 من ٣ خطوات» reached production through the old noun
    // token gap), so a future loosening cannot pass silently.
    const defective = 'readyBadge: "0 من ٣ خطوات"';
    expect(ARABIC_INDIC.test(defective)).toBe(true);
  });

  it('writes the free-session promise with a Western digit', () => {
    expect(MAX_FREE_SESSIONS_AR).toBe('3 جلسات');
    expect(MAX_FREE_SESSIONS_AR).toMatch(/\b3\b/);
    expect(freeSessionsCopy(3)).toContain('3 جلسات');
    expect(freeSessionsCopy(3)).not.toMatch(ARABIC_INDIC);
  });

  it('keeps the build-ready landing copy (§8) and in-app copy spec (§9.1) Western', () => {
    // These two sections are build-ready copy that must match the shipped
    // product. A price or a count written ٣ here would be pasted back into the
    // app, so the whole span is held to the Western rule.
    const playbook = readFileSync('docs/marketing/KATZU-LAUNCH-PLAYBOOK.md', 'utf8');
    const start = playbook.indexOf('## 8. Landing page copy');
    const end = playbook.indexOf('### 9.2 Support library');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const region = playbook.slice(start, end);
    const offenders = region
      .split(/\r?\n/)
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => ARABIC_INDIC.test(line))
      .map(({ line, n }) => `§8.${n}: ${line.trim()}`);
    expect(offenders).toEqual([]);
  });
});
