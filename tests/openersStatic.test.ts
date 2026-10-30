import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import content from '../scripts/language-data/content-snapshot.json';
import { openerForLevel, storedOpenerArabic } from '../src/lib/conversation/opener';
import { lookupWord } from '../src/lib/vocabulary/wordGloss';

/**
 * The static language data is the fix, so it is what these tests pin (V30).
 *
 * Before: the opener's Arabic came from `/ai/translate` (503 with no provider
 * key, one call per conversation opened) and a tapped word that was not an exact
 * vocabulary row showed «هذه الكلمة ليست في محتوى مشهدك بعد» with the part of
 * speech «—». Both are now generated once from the authored corpus and shipped in
 * the bundle, so both are assertions about data, not about a model.
 */

const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2'] as const;
const ARABIC = /[\u0600-\u06FF]/;

/** The scenario rows as the worker serves them (id + the five opener columns). */
type Row = Record<string, string>;

const rows = (content as unknown as { scenarios: Row[] }).scenarios;

/** Distinct opener texts, the way the build script collects them. */
function distinctOpeners(): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const level of LEVELS) {
      const text = openerForLevel(row as never, level);
      if (text && text.trim()) seen.add(text.trim());
    }
  }
  return [...seen];
}

/** Tokens as the build script counts them (lowercase, letters/umlauts/hyphens). */
const tokensOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-zäöüß\-\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);

describe('every scenario opener ships with its Arabic', () => {
  it('covers all 49 scenarios and all five levels that have an opener', () => {
    expect(rows.length).toBeGreaterThanOrEqual(49);
    for (const row of rows) {
      const openers = LEVELS.map((level) => openerForLevel(row as never, level)).filter(Boolean);
      expect(openers.length, `${row.id} has no opener at any level`).toBeGreaterThan(0);
    }
  });

  it('has a non-empty Arabic gloss for every opener of every scenario and level', () => {
    const missing: string[] = [];
    for (const row of rows) {
      for (const level of LEVELS) {
        const text = openerForLevel(row as never, level);
        if (!text) continue;
        const arabic = storedOpenerArabic(text);
        if (!arabic || !arabic.trim() || !ARABIC.test(arabic)) missing.push(`${row.id}/${level}: ${text}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('never leaves an opener to a runtime translation call', () => {
    // The lookup is pure data: the same input answers identically every time,
    // which an AI-backed path could not promise — and there is nothing async in
    // the opener path for a test to await.
    for (const text of distinctOpeners()) {
      expect(storedOpenerArabic(text)).toBe(storedOpenerArabic(text));
    }
  });
});

describe('every opener word resolves to a meaning, a part of speech and a level', () => {
  it('resolves 100% of the tokens', () => {
    const unresolved: string[] = [];
    let tokens = 0;
    for (const text of distinctOpeners()) {
      for (const token of tokensOf(text)) {
        tokens += 1;
        if (!lookupWord(token)) unresolved.push(`${token} (${text.slice(0, 40)})`);
      }
    }
    expect(unresolved).toEqual([]);
    expect(tokens).toBeGreaterThan(1000);
  });

  it('gives every resolved word a non-empty meaning, part of speech and level', () => {
    const bad: string[] = [];
    for (const text of distinctOpeners()) {
      for (const token of tokensOf(text)) {
        const gloss = lookupWord(token);
        if (!gloss) continue;
        if (!gloss.ar || !ARABIC.test(gloss.ar)) bad.push(`${token}: no Arabic`);
        if (!gloss.pos) bad.push(`${token}: no part of speech`);
        if (!LEVELS.includes(gloss.level as (typeof LEVELS)[number])) bad.push(`${token}: level ${gloss.level}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('handles compound and inflected words the card meets in the wild', () => {
    expect(lookupWord('Deutschlernen')?.ar).toContain('الألمانية');
    expect(lookupWord('Deutschlernen')?.pos).toBeTruthy();
    expect(lookupWord('Koffers')?.lemma).toBe('Koffer');
    expect(lookupWord('Koffer')?.match).toBe('exact');
    expect(lookupWord('Koffers')?.match).toBe('inflected');
    expect(lookupWord('xyzzy')).toBeNull();
  });

  it('keeps the generated data inside its shipped-size budget', () => {
    // Both modules are imported by screens the learner opens, so they land in the
    // precache. Measured compressed: ~28 KB for 223 openers and ~74 KB for 892
    // words — well inside the ~5 MB precache budget, and the budget is pinned so
    // the corpus can grow without anyone noticing the app got heavier.
    const root = join(__dirname, '..');
    const gz = (file: string) => gzipSync(readFileSync(join(root, file))).length;
    const openers = gz('src/lib/conversation/openerGlosses.generated.ts');
    const words = gz('src/lib/vocabulary/wordGlossary.generated.ts');
    console.log(`\n  generated data, gzipped: openers ${(openers / 1024).toFixed(1)} KiB · words ${(words / 1024).toFixed(1)} KiB`);
    expect(openers + words).toBeLessThan(160 * 1024);
  });

  it('prints the coverage report', () => {
    const openers = distinctOpeners();
    const tokenSet = new Set(openers.flatMap(tokensOf));
    const resolved = [...tokenSet].filter((token) => lookupWord(token)).length;
    const glossed = openers.filter((text) => storedOpenerArabic(text)).length;
    console.log(
      `\nlanguage data coverage\n` +
        `  scenarios:        ${rows.length}\n` +
        `  distinct openers: ${openers.length}\n` +
        `  openers with Arabic: ${glossed}/${openers.length}\n` +
        `  distinct tokens:  ${tokenSet.size}\n` +
        `  tokens resolved:  ${resolved}/${tokenSet.size}\n`,
    );
    expect(glossed).toBe(openers.length);
    expect(resolved).toBe(tokenSet.size);
  });
});