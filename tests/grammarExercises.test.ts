import { describe, expect, it } from 'vitest';
import {
  buildGrammarExercises,
  gradeGrammarAttempt,
  grammarAttemptMistake,
  grammarLevelSort,
  hashString,
  seededRng,
} from '../src/lib/grammar/exercises';
import type { GrammarEntity } from '../src/types/models';

/**
 * The القواعد section's exercises (V21 Phase 4): generated deterministically
 * from the grammar row itself, graded with the review engine's own normaliser,
 * and honest about what one attempt proves.
 */

const row: Pick<GrammarEntity, 'id' | 'example_de' | 'rule_de' | 'example_ar' | 'rule_ar' | 'title_ar'> = {
  id: 'g_articles_a1',
  title_ar: 'أدوات التعريف والتنكير',
  rule_de: 'Bestimmte Artikel: der (maskulin), die (feminin), das (neutral).',
  rule_ar: 'في الألمانية لكل اسم جنس محدد يجب حفظه مع الكلمة.',
  example_de: 'Der Kaffee ist heiss.',
  example_ar: 'القهوة ساخنة.',
};

describe('buildGrammarExercises', () => {
  it('produces exactly three exercises: fill, reorder, translate', () => {
    const exercises = buildGrammarExercises(row);
    expect(exercises.map((exercise) => exercise.kind)).toEqual(['fill', 'reorder', 'translate']);
  });

  it('is deterministic: same row and seed, same exercises', () => {
    expect(buildGrammarExercises(row, seededRng(7))).toEqual(buildGrammarExercises(row, seededRng(7)));
  });

  it('differs across rows, so two topics never feel identical', () => {
    const other: typeof row = { ...row, id: 'g_modal_moechte', example_de: 'Ich möchte einen Termin machen.' };
    expect(buildGrammarExercises(row)[0].displayDe).not.toBe(buildGrammarExercises(other)[0].displayDe);
  });

  it('keeps the row sentence as the answer of every exercise', () => {
    for (const exercise of buildGrammarExercises(row)) {
      expect(exercise.answerDe).toBe('Der Kaffee ist heiss.');
    }
  });

  it('masks exactly one word for the fill and carries the gap answer', () => {
    const [fill] = buildGrammarExercises(row);
    expect(fill?.displayDe).toContain('____');
    expect(fill?.gapAnswer).toBe('ist');
    expect(fill?.displayDe?.replace('____', 'ist')).toBe('Der Kaffee ist heiss.');
  });

  it('gives the reorder a token bank that contains the answer words plus one distractor', () => {
    const [, reorder] = buildGrammarExercises(row);
    const answerWords = 'Der Kaffee ist heiss'.split(' ');
    for (const word of answerWords) {
      expect(reorder?.tokens).toContain(word);
    }
    expect(reorder?.tokens!.length).toBe(answerWords.length + 1);
  });

  it('shows the Arabic prompt for the translate exercise', () => {
    const [, , translate] = buildGrammarExercises(row);
    expect(translate?.displayAr).toBe('القهوة ساخنة.');
  });

  it('returns nothing for a row with no German text at all, rather than a broken exercise', () => {
    expect(buildGrammarExercises({ ...row, example_de: '', rule_de: '' })).toEqual([]);
  });
});

describe('gradeGrammarAttempt', () => {
  const exercises = buildGrammarExercises(row);
  const translate = exercises[2]!;

  it('accepts the exact answer and punctuation-tolerant variants', () => {
    expect(gradeGrammarAttempt(translate, 'Der Kaffee ist heiss.')).toBe('correct');
    expect(gradeGrammarAttempt(translate, 'der kaffee ist heiss')).toBe('correct');
  });

  it('calls a single-word slip close, not wrong', () => {
    // ß/ss folds to the same answer by design (the review engine's rule), so a
    // genuine one-word slip is a wrong ARTICLE, not a spelling variant.
    expect(gradeGrammarAttempt(translate, 'Die Kaffee ist heiss')).toBe('close');
    expect(gradeGrammarAttempt(translate, 'Der Kaffee sind heiss')).toBe('close');
  });

  it('calls a genuinely different sentence wrong', () => {
    expect(gradeGrammarAttempt(translate, 'Ich möchte einen Kaffee')).toBe('wrong');
    expect(gradeGrammarAttempt(translate, '')).toBe('wrong');
  });
});

describe('grammarAttemptMistake', () => {
  it('produces a mistake row wired to the rule and the row id', () => {
    const exercises = buildGrammarExercises(row);
    const miss = grammarAttemptMistake(row, exercises[2]!, 'Ich trinke Wasser');
    expect(miss.original).toBe('Ich trinke Wasser');
    expect(miss.corrected).toBe('Der Kaffee ist heiss.');
    expect(miss.grammarRule).toContain('أدوات التعريف');
    expect(miss.grammarId).toBe('g_articles_a1');
  });
});

describe('helpers', () => {
  it('hashes ids stably and orders the level ladder floor-first', () => {
    expect(hashString('g_articles_a1')).toBe(hashString('g_articles_a1'));
    expect(hashString('g_articles_a1')).not.toBe(hashString('g_modal_moechte'));
    expect(grammarLevelSort('A0', 'B1')).toBeLessThan(0);
    expect(grammarLevelSort('B2', 'A1')).toBeGreaterThan(0);
  });
});
