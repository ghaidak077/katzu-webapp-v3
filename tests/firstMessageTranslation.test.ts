import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import liveFixture from './fixtures/live-scenarios.json';
import catalogue from '../scripts/language-data/content-snapshot.json';
import { openerForLevel, storedOpenerArabic } from '../src/lib/conversation/opener';
import { openingFor } from '../src/lib/journey/story';
import type { CEFRLevel, ScenarioEntity } from '../src/types/models';

/**
 * Every first message, in every mode, must already carry its Arabic.
 *
 * The V30 tests checked only `scripts/language-data/content-snapshot.json` — the
 * authored 61-scenario catalogue. Production served a different 49-scenario
 * corpus, so 221 openers had no gloss and the first bubble showed «تعذرت
 * الترجمة». This test enumerates the corpus the worker actually serves (a
 * committed fixture), the authored catalogue, the repo curriculum files, the B1
 * mock-exam openers and the code fallback, at every level, for live practice,
 * live real, story preview and mock exam — and fails on one missing translation.
 *
 * It also proves the first render is offline: with `fetch` removed, resolving
 * every first message must still produce Arabic and make no network call.
 */

const LEVELS: CEFRLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2'];
const ARABIC = /[\u0600-\u06FF]/;
const FALLBACK = 'Hallo! Wie kann ich Ihnen helfen?';

type Row = Record<string, string> & { id: string };
type Cell = { mode: string; id: string; level: string; german: string };

const liveRows = (liveFixture as unknown as { scenarios: Row[] }).scenarios;
const catalogueRows = (catalogue as unknown as { scenarios: Row[] }).scenarios;

/** The authored curriculum files that mirror the live content. */
function curriculumRows(): Row[] {
  const dir = join(process.cwd(), 'docs', 'content');
  return readdirSync(dir)
    .filter((file) => file.startsWith('curriculum-') && file.endsWith('.json'))
    .flatMap((file) => {
      const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { scenarios?: Row[] };
      return parsed.scenarios || [];
    });
}

/** The three fixed B1 mock-exam part openers from the worker module. */
function mockExamOpeners(): string[] {
  const source = readFileSync(join(process.cwd(), 'cloudflare-mock-exam.js'), 'utf8');
  return [...source.matchAll(/openerDe: '([^']+)'/g)].map((match) => match[1]);
}

function liveCells(rows: Row[], mode: string): Cell[] {
  const cells: Cell[] = [];
  for (const row of rows) {
    for (const level of LEVELS) {
      const german = openerForLevel(row, level);
      if (german.trim()) cells.push({ mode, id: row.id, level, german });
    }
  }
  return cells;
}

function storyCells(rows: Row[]): Cell[] {
  const cells: Cell[] = [];
  for (const row of rows) {
    for (const level of LEVELS) {
      const opening = openingFor(row as unknown as ScenarioEntity, level);
      if (opening.text.trim()) cells.push({ mode: 'story', id: row.id, level, german: opening.text });
    }
  }
  return cells;
}

function allCells(): Cell[] {
  const authored = curriculumRows();
  const cells = [
    ...liveCells(liveRows, 'live-practice'),
    // Real mode uses the same opener rule; it is listed separately because the
    // requirement is every mode, and a future real-mode override must not slip.
    ...liveCells(liveRows, 'live-real'),
    ...liveCells(catalogueRows, 'catalogue-practice'),
    ...liveCells(authored, 'curriculum-practice'),
    ...storyCells(liveRows),
    ...storyCells(authored),
    ...mockExamOpeners().map((german, index) => ({
      mode: 'mock-exam',
      id: `mock-part-${index + 1}`,
      level: 'B1',
      german,
    })),
    { mode: 'fallback', id: 'fallback', level: 'A1', german: FALLBACK },
  ];
  return cells;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('every first message ships its Arabic in every mode', () => {
  it('covers every scenario × level × mode with no missing translation', () => {
    const cells = allCells();
    const missing = cells.filter((cell) => {
      const arabic = storedOpenerArabic(cell.german);
      return !arabic || !arabic.trim() || !ARABIC.test(arabic);
    });

    const counts = cells.reduce<Record<string, number>>((acc, cell) => {
      acc[cell.mode] = (acc[cell.mode] || 0) + 1;
      return acc;
    }, {});
    console.log(
      `\nfirst-message translation coverage\n` +
        `  live practice:      ${counts['live-practice'] || 0}\n` +
        `  live real:          ${counts['live-real'] || 0}\n` +
        `  catalogue practice: ${counts['catalogue-practice'] || 0}\n` +
        `  curriculum practice:${counts['curriculum-practice'] || 0}\n` +
        `  story preview:      ${counts.story || 0}\n` +
        `  mock exam:          ${counts['mock-exam'] || 0}\n` +
        `  fallback:           ${counts.fallback || 0}\n` +
        `  total cells:        ${cells.length}\n` +
        `  translated:         ${cells.length - missing.length}/${cells.length}\n` +
        `  distinct openers:   ${new Set(cells.map((cell) => cell.german)).size}\n`,
    );

    expect(missing, missing.map((cell) => `${cell.mode}/${cell.id}/${cell.level}: ${cell.german}`).join('\n')).toEqual([]);
    expect(cells.length).toBeGreaterThan(1000);
    expect(new Set(cells.map((cell) => cell.german)).size).toBeGreaterThan(300);
  });

  it('resolves the exact production opener that used to fail', () => {
    const german = 'Hallo! Ich bin Frau Meier, deine Nachbarin. Wie heißt du?';
    const arabic = storedOpenerArabic(german);
    expect(arabic).toBeTruthy();
    expect(arabic).toMatch(ARABIC);
    expect(liveRows.find((row) => row.id === 'first_greetings')?.initial_message_a1).toBe(german);
  });

  it('makes zero network calls on first render, including offline', () => {
    // Offline means there is no fetch at all: a first message that still needed
    // one would throw here instead of rendering its Arabic.
    const fetchSpy = vi.fn(() => {
      throw new Error('first-message translation must not touch the network');
    });
    vi.stubGlobal('fetch', fetchSpy);

    for (const cell of allCells()) {
      expect(storedOpenerArabic(cell.german), cell.german).toBeTruthy();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the first-message code paths free of translation calls', () => {
    const files = [
      'src/features/conversation/useLiveConversation.ts',
      'src/features/journey/StorySetupScreen.tsx',
      'src/features/conversation/ConversationMessage.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source, `${file} must not call translateText on the first-message path`).not.toMatch(
        /\btranslateText(?:Reliable)?\s*\(/,
      );
    }
  });

  it('shows a short loading state and one automatic retry before the honest message', () => {
    const live = readFileSync(join(process.cwd(), 'src/features/conversation/useLiveConversation.ts'), 'utf8');
    const story = readFileSync(join(process.cwd(), 'src/features/journey/StorySetupScreen.tsx'), 'utf8');
    expect(live).toContain("translationState: 'pending' as const");
    expect(live).toMatch(/setTimeout\(\(\) => \{\s*requestOpenerTranslation/);
    expect(live).toContain('clearTimeout(autoRetryTimer)');
    expect(story).toContain("setTranslationState('pending')");
    expect(story).toContain('جارٍ الترجمة');
  });

  it('ships Arabic for all three mock-exam part openers', () => {
    const openers = mockExamOpeners();
    expect(openers).toHaveLength(3);
    for (const german of openers) {
      expect(storedOpenerArabic(german), german).toMatch(ARABIC);
    }
  });
});
