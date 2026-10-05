import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { examFirstScenarios } from '../src/lib/levels/levelSpec';

/**
 * The Trail leads with the exam scenarios.
 *
 * The rule is narrow on purpose: reorder, never filter. A learner who came to
 * prepare for an exam used to be shown five everyday situations first and had to
 * know that `exam_` meant what it meant. Nothing about the "show the rest"
 * control changes, and nothing disappears — this batch is about what the first
 * screen is made of, not about what exists.
 */

type S = { id: string; sort_order?: number | null };

describe('examFirstScenarios', () => {
  it('puts every exam scenario before every other one', () => {
    const result = examFirstScenarios([
      { id: 'cafe_order', sort_order: 1 },
      { id: 'exam_sich_vorstellen', sort_order: 9 },
      { id: 'supermarket', sort_order: 2 },
      { id: 'exam_erfahrungen_sprechen', sort_order: 8 },
    ]);
    expect(result.map((s) => s.id)).toEqual([
      'exam_erfahrungen_sprechen',
      'exam_sich_vorstellen',
      'cafe_order',
      'supermarket',
    ]);
  });

  it('keeps the author\'s own order inside each group', () => {
    // `sort_order` is the content author's decision. This function decides which
    // group a scenario is in and nothing else.
    const result = examFirstScenarios([
      { id: 'zebra_shop', sort_order: 30 },
      { id: 'exam_third', sort_order: 3 },
      { id: 'exam_first', sort_order: 1 },
      { id: 'apple_store', sort_order: 20 },
      { id: 'exam_second', sort_order: 2 },
    ]);
    expect(result.map((s) => s.id)).toEqual([
      'exam_first',
      'exam_second',
      'exam_third',
      'apple_store',
      'zebra_shop',
    ]);
  });

  it('hides nothing — every scenario survives', () => {
    const input: S[] = [
      { id: 'a', sort_order: 1 },
      { id: 'exam_b', sort_order: 2 },
      { id: 'c', sort_order: 3 },
      { id: 'd', sort_order: 4 },
    ];
    const result = examFirstScenarios(input);
    expect(result).toHaveLength(input.length);
    expect(result.map((s) => s.id).sort()).toEqual(['a', 'c', 'd', 'exam_b']);
  });

  it('does not mutate the array it was given', () => {
    const input: S[] = [
      { id: 'cafe_order', sort_order: 2 },
      { id: 'exam_first', sort_order: 1 },
    ];
    const copy = input.map((s) => ({ ...s }));
    examFirstScenarios(input);
    expect(input).toEqual(copy);
  });

  it('leaves an all-exam or all-everyday list in its authored order', () => {
    const exams = examFirstScenarios([
      { id: 'exam_b', sort_order: 2 },
      { id: 'exam_a', sort_order: 1 },
    ]);
    expect(exams.map((s) => s.id)).toEqual(['exam_a', 'exam_b']);

    const everyday = examFirstScenarios([
      { id: 'b', sort_order: 2 },
      { id: 'a', sort_order: 1 },
    ]);
    expect(everyday.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('copes with an empty list and missing sort orders', () => {
    expect(examFirstScenarios([])).toEqual([]);
    const messy = examFirstScenarios([
      { id: 'exam_x' },
      { id: 'y' },
      { id: 'exam_a', sort_order: null },
    ]);
    expect(messy).toHaveLength(3);
    expect(messy[0].id).toBe('exam_x');
    expect(messy[1].id).toBe('exam_a');
  });

  it('only treats the `exam_` prefix as an exam scenario', () => {
    // Not `EXAM_` (ids are lowercase by convention) and not a word that merely
    // contains "exam" — a mis-prefixed id would otherwise jump the queue.
    const result = examFirstScenarios([
      { id: 'my_exam_prep', sort_order: 1 },
      { id: 'exam', sort_order: 2 },
      { id: 'exam_real_one', sort_order: 3 },
    ]);
    expect(result.map((s) => s.id)).toEqual(['exam_real_one', 'my_exam_prep', 'exam']);
  });
});

describe('the Trail uses the rule and keeps its own controls', () => {
  const TRAIL = readFileSync('src/features/trail/TrailScreen.tsx', 'utf8');

  it('applies the ordering to the scenario list it renders', () => {
    expect(TRAIL).toMatch(/examFirstScenarios\(useLiveQuery/);
  });

  it('keeps the "show the rest" control and its preview count', () => {
    // The whole point of the rule is that the preview is exam-shaped. If the
    // control went, this would become a filter by accident.
    expect(TRAIL).toMatch(/TRAIL_PREVIEW_COUNT/);
    expect(TRAIL).toMatch(/setShowAllScenarios\(true\)/);
    expect(TRAIL).toMatch(/اعرض بقية المشاهد/);
  });

  it('still renders the same list, not a filtered one', () => {
    expect(TRAIL).toMatch(/scenarios\.slice\(0, showAllScenarios \? undefined : TRAIL_PREVIEW_COUNT\)/);
  });
});
