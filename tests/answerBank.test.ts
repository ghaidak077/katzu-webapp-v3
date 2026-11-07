import { describe, expect, it } from 'vitest';
import {
  GENERIC_SAFE_FAMILY,
  QUESTION_TYPES,
  REPEAT_FAMILY,
  answerBankCoverage,
  answerHintsFor,
  assertSuggestionClean,
  classifyQuestion,
  filterCleanHints,
  suggestionIsClean,
} from '@/lib/conversation/answerBank';

/**
 * The static answer bank.
 *
 * WHY: a real A1 session produced an EMPTY hint sheet after the AI asked
 * «Wie heißt du?» / «Wie geht es dir?». These tests pin the three guarantees the
 * sheet now relies on: it is never empty, the first hint answers the question on
 * screen, and every shipped German string survives the local corrector
 * unchanged — an unchanged suggestion must never be "corrected".
 */

const NAME_SLOT = '{name}';
const fill = (german: string, name: string) => german.replaceAll(NAME_SLOT, name);

/** Every shipped line, in both the unfilled and the filled form. */
function shippedStrings(): Array<{ where: string; german: string }> {
  const rows: Array<{ where: string; german: string }> = [];
  for (const type of QUESTION_TYPES) {
    for (const answer of type.answers) {
      rows.push({ where: `${type.id}/placeholder`, german: fill(answer.german, '…') });
      rows.push({ where: `${type.id}/name`, german: fill(answer.german, 'Ghaidak') });
    }
  }
  for (const answer of REPEAT_FAMILY) rows.push({ where: 'repeat', german: answer.german });
  for (const answer of GENERIC_SAFE_FAMILY) rows.push({ where: 'generic', german: answer.german });
  return rows;
}

describe('answer bank invariants', () => {
  it('ships at least 40 question types at A0–A2', () => {
    const coverage = answerBankCoverage();
    expect(coverage.types).toBeGreaterThanOrEqual(40);
    expect(coverage.answers).toBe(coverage.types * 3);
    expect(coverage.levels).toBe('A0–A2');
  });

  it('has every shipped German string pass the corrector with zero corrections', () => {
    const bad = shippedStrings()
      .map((row) => ({ ...row, result: suggestionIsClean(row.german) }))
      .filter((row) => !row.result);
    expect(bad.map((row) => `${row.where}: ${row.german}`)).toEqual([]);
  });

  it('assertSuggestionClean accepts every shipped string and rejects a broken one', () => {
    for (const row of shippedStrings()) {
      expect(() => assertSuggestionClean(row.german), row.german).not.toThrow();
    }
    expect(() => assertSuggestionClean('ich heisse ghaidak')).toThrow(/corrected/);
  });

  it('filterCleanHints drops a line the corrector would change', () => {
    const kept = filterCleanHints([
      { german: 'Ich heiße Ghaidak.' },
      { german: 'ich heisse ghaidak' },
      { german: 'Mir geht es gut, danke.' },
    ]);
    expect(kept.map((hint) => hint.german)).toEqual(['Ich heiße Ghaidak.', 'Mir geht es gut, danke.']);
  });
});

describe('answerHintsFor ordering and coverage', () => {
  it('answers «Wie heißt du?» with a name answer first and the repeat family last', () => {
    const hints = answerHintsFor('Schön. Wie heißt du?', { learnerName: 'Ghaidak' });
    expect(hints[0].german).toBe('Ich heiße Ghaidak.');
    expect(hints.slice(0, 3).map((hint) => hint.german)).toEqual([
      'Ich heiße Ghaidak.',
      'Mein Name ist Ghaidak.',
      'Ich bin Ghaidak.',
    ]);
    expect(hints.slice(3).map((hint) => hint.german)).toEqual(REPEAT_FAMILY.map((hint) => hint.german));
  });

  it('prefers the more specific «nochmal» question over the generic name type', () => {
    const hints = answerHintsFor('Wie heißt du nochmal, bitte?', { learnerName: 'Ghaidak' });
    expect(hints[0].german).toBe('Ich heiße Ghaidak.');
    expect(classifyQuestion('Wie heißt du nochmal, bitte?')?.id).toBe('name_again');
  });

  it('answers the last question of a multi-sentence AI turn, not its greeting', () => {
    const hints = answerHintsFor('Schön, Ghaidak. Wie geht es dir?');
    expect(hints[0].german).toBe('Mir geht es gut, danke.');
    expect(hints.map((hint) => hint.german).join(' ')).not.toMatch(/Tee|Kaffee|Kuchen/i);
  });

  it('uses the placeholder when the learner name is unknown or invalid', () => {
    expect(answerHintsFor('Wie heißt du?')[0].german).toBe('Ich heiße ….');
    expect(answerHintsFor('Wie heißt du?', { learnerName: '  ' })[0].german).toBe('Ich heiße ….');
    expect(answerHintsFor('Wie heißt du?', { learnerName: 'Ghaidak!' })[0].german).toBe('Ich heiße ….');
  });

  it('returns no bank hints for a statement, so the scenario phrase floor fills', () => {
    expect(answerHintsFor('Guten Tag! Ich bin Frau Meier.')).toEqual([]);
    expect(answerHintsFor('')).toEqual([]);
    expect(answerHintsFor(null)).toEqual([]);
  });

  it('falls back to the exact generic safe family for an unmatched question', () => {
    const hints = answerHintsFor('Warum ist der Himmel blau?');
    expect(hints).toEqual([...GENERIC_SAFE_FAMILY]);
    expect(hints).toHaveLength(4);
  });

  it('is never empty for a question we do not recognise', () => {
    for (const question of ['Was ist das?', 'Können Sie mir helfen?', 'Warum?', 'Hm?']) {
      expect(answerHintsFor(question).length, question).toBeGreaterThan(0);
    }
  });
});

describe('session replay: first words', () => {
  // The reported session, replayed through the same pure functions the screen uses.
  const turns = [
    'Hallo! Wie heißt du?',
    'Wie heißt du nochmal, bitte?',
    'Schön, Ghaidak. Wie geht es dir?',
  ];

  it('never leaves a hint sheet empty at any point in the session', () => {
    for (const turn of turns) {
      expect(answerHintsFor(turn, { learnerName: 'Ghaidak' }).length, turn).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps «Mir geht es gut, danke.» first after the wellbeing question', () => {
    const hints = answerHintsFor('Schön, Ghaidak. Wie geht es dir?', { learnerName: 'Ghaidak' });
    expect(hints[0].german).toBe('Mir geht es gut, danke.');
  });

  it('adds no café/tea line to a greetings conversation', () => {
    for (const turn of turns) {
      for (const hint of answerHintsFor(turn, { learnerName: 'Ghaidak' })) {
        expect(hint.german).not.toMatch(/Tee|Kaffee|Kuchen|Frühstück/i);
      }
    }
  });
});
