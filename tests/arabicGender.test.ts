import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// The lint is a script so an author can run it without the suite: `npm run lint:arabic`.
import { FEMININE_ADDRESS, scan } from '../scripts/lint-arabic-gender.mjs';

/**
 * One rule, two implementations, and a test that keeps them the same.
 *
 * The runtime guard in `cloudflare-roleplay.js` stops the model addressing the learner as a woman
 * when her gender is unknown; `scripts/lint-arabic-gender.mjs` does the same for hand-authored
 * content, which never passes through the guard. Two thresholds for one rule is how a guard quietly
 * stops covering what it claims to cover, so the regex sources must match exactly.
 */

const root = join(__dirname, '..');
const roleplay = readFileSync(join(root, 'cloudflare-roleplay.js'), 'utf8');
const allowlistPath = join(root, 'scripts/arabic-gender-allowlist.json');

describe('Arabic addressed to the learner stays neutral', () => {
  it('the lint uses the same two forms as the runtime guard', () => {
    const match = roleplay.match(/const FEMININE_LEARNER_ADDRESS = \/(.+?)\/u;/);
    expect(match, 'the guard regex moved — update the lint with it').not.toBeNull();
    expect(match?.[1]).toBe(FEMININE_ADDRESS.source);
  });

  it('catches the diacritised forms and leaves the undiacritised ones to the prompt', () => {
    expect(FEMININE_ADDRESS.test('كيف حالكِ؟')).toBe(true);
    expect(FEMININE_ADDRESS.test('أين أنتِ الآن؟')).toBe(true);
    // Unvocalised Arabic is genuinely ambiguous; the prompt rule covers it, not this scan.
    expect(FEMININE_ADDRESS.test('كيف حالك؟')).toBe(false);
    expect(FEMININE_ADDRESS.test('Hallo, wie geht es Ihnen?')).toBe(false);
  });

  it('scans real authored content, not an empty directory', () => {
    const { files } = scan();
    expect(files, 'the scan found almost nothing — the guard is not looking where content lives').toBeGreaterThan(100);
  });

  it('finds no unexplained feminine address in shipped content', () => {
    const { hits } = scan();
    expect(
      hits.map((hit) => `${hit.file}:${hit.line} ${hit.text}`),
      'authored Arabic addresses the learner as a woman. Use neutral wording; only a quoted line spoken by a woman belongs in scripts/arabic-gender-allowlist.json, with the reason.',
    ).toEqual([]);
  });

  it('every allowlist entry is real, explained, and still matches a line', () => {
    const entries = existsSync(allowlistPath)
      ? (JSON.parse(readFileSync(allowlistPath, 'utf8')) as Array<Record<string, string>>)
      : [];
    for (const entry of entries) {
      expect(entry.file, 'an allowlist entry needs a file').toBeTruthy();
      expect(entry.contains, 'an allowlist entry needs the exact text it allows').toBeTruthy();
      expect(entry.why?.length ?? 0, `${entry.file} needs a reason, not a placeholder`).toBeGreaterThan(20);
      expect(
        existsSync(join(root, entry.file)),
        `${entry.file} is allowlisted but does not exist — a stale exemption hides the next hit`,
      ).toBe(true);
    }
    const { allowed } = scan();
    for (const entry of entries) {
      expect(
        allowed.some((item) => item.file === entry.file),
        `allowlist entry for ${entry.file} matches no line any more — delete it`,
      ).toBe(true);
    }
  });
});
