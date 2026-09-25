import { describe, expect, it } from 'vitest';
import {
  CEFR_LADDER,
  MAX_ITEMS,
  MIN_ITEMS,
  PROMOTE_AFTER,
  isConverged,
  applyPlacementResponse,
  createPlacementState,
  describePlacementResult,
  isPlacementFinished,
  missedPlacementSourceIds,
  placementEstimate,
  type PlacementState,
} from '@/lib/placement/engine';
import {
  buildPlacementItem,
  levelHasItems,
  nearestLevelWithItems,
  shouldUseListening,
  type PlacementPool,
} from '@/lib/placement/generator';
import { optionsCollide } from '@/lib/utils/quizGenerator';
import type { CEFRLevel, StarterPhraseEntity, VocabularyEntity } from '@/types/models';

/** Deterministic rng so generated options are reproducible in assertions. */
function seededRng(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function answer(state: PlacementState, correct: boolean, kind: 'vocab' | 'phrase' = 'vocab'): PlacementState {
  return applyPlacementResponse(state, {
    kind,
    level: state.level,
    correct,
    wasListening: false,
    sourceId: state.responses.length + 1,
  });
}

function word(id: number, level: CEFRLevel, german: string, translationAr: string): VocabularyEntity {
  return {
    id,
    german,
    article: null,
    plural: null,
    part_of_speech: 'Noun',
    translation_ar: translationAr,
    translation_en: german,
    example_de: '',
    example_ar: '',
    topic: 'placement',
    level,
  } as VocabularyEntity;
}

function phrase(id: number, level: CEFRLevel, german: string, translationAr: string): StarterPhraseEntity {
  return {
    id,
    scenario_id: 'cafe_order',
    level,
    german,
    translation_en: german,
    translation_ar: translationAr,
    sort_order: 1,
  } as StarterPhraseEntity;
}

const POOL: PlacementPool = {
  vocabulary: [
    word(1, 'A1', 'Kaffee', 'قهوة'),
    word(2, 'A1', 'Wasser', 'ماء'),
    word(3, 'A1', 'Brot', 'خبز'),
    word(4, 'A1', 'Tee', 'شاي'),
    word(5, 'A2', 'Termin', 'موعد'),
    word(6, 'A2', 'Rechnung', 'فاتورة'),
    word(7, 'A2', 'Fahrkarte', 'تذكرة سفر'),
    word(8, 'A2', 'Nachbar', 'جار'),
    word(9, 'B1', 'Bewerbung', 'طلب توظيف'),
    word(10, 'B1', 'Versicherung', 'تأمين'),
    word(11, 'B1', 'Ausbildung', 'تدريب مهني'),
    word(12, 'B1', 'Miete', 'إيجار'),
  ],
  phrases: [phrase(100, 'A2', 'Ich möchte einen Termin machen.', 'أريد تحديد موعد.')],
};

describe('placement staircase', () => {
  it('starts at A2 — above beginner, below the level most learners overstate', () => {
    expect(createPlacementState().level).toBe('A2');
  });

  it('promotes after two correct answers and demotes after one wrong one', () => {
    let state = createPlacementState();
    state = answer(state, true);
    expect(state.level).toBe('A2');
    state = answer(state, true);
    expect(state.level).toBe('B1');

    state = answer(state, false);
    expect(state.level).toBe('A2');
    expect(state.correctAtLevel).toBe(0);
  });

  it('never estimates beyond the A1–B2 range the product teaches', () => {
    let high = createPlacementState('B2');
    for (let i = 0; i < 6; i += 1) high = answer(high, true);
    expect(high.level).toBe('B2');

    let low = createPlacementState('A1');
    for (let i = 0; i < 6; i += 1) low = answer(low, false);
    expect(low.level).toBe('A1');
    expect(CEFR_LADDER.indexOf(low.level)).toBe(0);
  });

  it('forgives a single slip but needs two answers to climb back', () => {
    let state = createPlacementState();
    state = answer(state, true);
    state = answer(state, true); // now B1
    state = answer(state, false); // back to A2
    state = answer(state, true);
    expect(state.level).toBe('A2'); // one correct is not enough to re-promote

    state = answer(state, true);
    expect(state.level).toBe('B1');
  });

  it('always finishes and never asks more than the item budget, whatever the pattern', () => {
    const patterns: Array<[string, (index: number) => boolean]> = [
      ['always right', () => true],
      ['always wrong', () => false],
      ['right two in three', (i) => i % 3 !== 0],
      ['alternating', (i) => i % 2 === 0],
      ['right then lost', (i) => i < 3],
    ];

    for (const [name, pattern] of patterns) {
      let state = createPlacementState();
      let asked = 0;
      // The bound is a guard as much as an assertion: a screen that never
      // finishes would trap the learner, which is the worst failure available here.
      while (!isPlacementFinished(state) && asked < MAX_ITEMS + 5) {
        state = answer(state, pattern(asked));
        asked += 1;
      }
      expect(isPlacementFinished(state), `${name} never finished`).toBe(true);
      expect(state.responses.length).toBeLessThanOrEqual(MAX_ITEMS);
      expect(CEFR_LADDER).toContain(placementEstimate(state));
    }
  });

  it('stops once the staircase settles between two neighbouring levels', () => {
    // The realistic pattern for a real learner: they hold one level and miss the
    // harder neighbour, which oscillates between the two.
    let state = createPlacementState();
    const pattern = [true, false, true, true, false, true];
    for (const correct of pattern) state = answer(state, correct);

    expect(state.responses.length).toBe(MIN_ITEMS);
    expect(isPlacementFinished(state)).toBe(true);
    expect(placementEstimate(state)).toBe('A1');
  });

  it('does not place a complete beginner off three answers', () => {
    let state = createPlacementState('A1');
    for (let i = 0; i < 3; i += 1) state = answer(state, false);
    // Honest: six questions is the floor for reporting a level at all.
    expect(isPlacementFinished(state)).toBe(false);

    for (let i = 0; i < MIN_ITEMS - 3; i += 1) state = answer(state, false);
    expect(isPlacementFinished(state)).toBe(true);
    expect(placementEstimate(state)).toBe('A1');
  });

  it('is not converged before it has seen enough answers to judge', () => {
    let state = createPlacementState('A1');
    state = answer(state, false);
    state = answer(state, false);
    expect(isConverged(state)).toBe(false);
  });

  it('reports the resting level of the staircase as the estimate', () => {
    let state = createPlacementState();
    state = answer(state, true);
    state = answer(state, true);
    expect(placementEstimate(state)).toBe('B1');
  });

  it('describes the result in the learner’s own terms, not just a label', () => {
    let state = createPlacementState();
    // Two right at A2 then a failure at B1: handled everyday material, stopped there.
    state = answer(state, true);
    state = answer(state, true);
    state = answer(state, false);

    const result = describePlacementResult(state);
    expect(result.level).toBe('A2');
    expect(result.headlineAr).toContain('A2');
    expect(result.detailAr).toContain('A2');
    expect(result.detailAr.length).toBeGreaterThan(20);
  });

  it('mentions listening honestly when listening questions were asked', () => {
    let state = createPlacementState();
    state = applyPlacementResponse(state, {
      kind: 'vocab',
      level: 'A2',
      correct: false,
      wasListening: true,
      sourceId: 5,
    });
    const result = describePlacementResult(state);
    expect(result.listeningTotal).toBe(1);
    expect(result.listeningCorrect).toBe(0);
    expect(result.detailAr).toContain('الاستماع');
  });

  it('collects exactly the missed items so placement can seed the review queue', () => {
    let state = createPlacementState();
    state = applyPlacementResponse(state, { kind: 'vocab', level: 'A2', correct: false, wasListening: false, sourceId: 11 });
    state = applyPlacementResponse(state, { kind: 'vocab', level: 'A2', correct: true, wasListening: false, sourceId: 12 });
    state = applyPlacementResponse(state, { kind: 'vocab', level: 'A1', correct: false, wasListening: false, sourceId: 11 });

    expect(missedPlacementSourceIds(state)).toEqual([11, 12].filter((id) => id === 11));
  });
});

describe('placement item generator', () => {
  it('asks about a row that exists at the requested level', () => {
    const item = buildPlacementItem(POOL, 'A2', new Set(), seededRng(3));
    expect(item).not.toBeNull();
    expect(item!.level).toBe('A2');
    expect(item!.options).toHaveLength(4);
    expect(item!.options[item!.correctIndex]).toBe(item!.correctAr);
  });

  it('never offers two options that could both be correct', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const item = buildPlacementItem(POOL, 'A2', new Set(), seededRng(seed));
      if (!item) continue;
      for (let i = 0; i < item.options.length; i += 1) {
        for (let j = i + 1; j < item.options.length; j += 1) {
          expect(optionsCollide(item.options[i], item.options[j])).toBe(false);
        }
      }
    }
  });

  it('takes distractors from the same level when that level has enough words', () => {
    const sameLevelPool: PlacementPool = {
      vocabulary: [
        word(1, 'A1', 'Kaffee', 'قهوة'),
        word(2, 'A1', 'Wasser', 'ماء'),
        word(3, 'A1', 'Brot', 'خبز'),
        word(4, 'A1', 'Tee', 'شاي'),
        word(5, 'B2', 'Nachhaltigkeit', 'استدامة'),
        word(6, 'B2', 'Wirtschaft', 'اقتصاد'),
        word(7, 'B2', 'Regierung', 'حكومة'),
      ],
      phrases: [],
    };
    const item = buildPlacementItem(sameLevelPool, 'A1', new Set(), seededRng(5))!;
    expect(new Set(item.options)).toEqual(new Set(['قهوة', 'ماء', 'خبز', 'شاي']));
  });

  it('never repeats a source row inside one check', () => {
    const used = new Set<string>();
    const seen = new Set<string>();
    for (let i = 0; i < 4; i += 1) {
      const item = buildPlacementItem(POOL, 'A1', used, seededRng(i + 1));
      if (!item) break;
      used.add(item.id);
      seen.add(item.id);
    }
    expect(seen.size).toBe(used.size);
    expect(buildPlacementItem(POOL, 'A1', used, seededRng(1))).toBeNull();
  });

  it('returns nothing rather than a broken question when a level has no content', () => {
    const empty: PlacementPool = { vocabulary: [], phrases: [] };
    expect(buildPlacementItem(empty, 'B1', new Set(), seededRng(1))).toBeNull();
    expect(levelHasItems(empty, 'B1')).toBe(false);
    expect(nearestLevelWithItems(empty, 'B1')).toBeNull();
  });

  it('steps to the closest level that has content, so a sparse level cannot end the check', () => {
    const sparse: PlacementPool = {
      vocabulary: [word(1, 'A1', 'Kaffee', 'قهوة'), word(2, 'A1', 'Wasser', 'ماء')],
      phrases: [],
    };
    expect(nearestLevelWithItems(sparse, 'B1')).toBe('A1');
    expect(nearestLevelWithItems(POOL, 'B2')).toBe('B1');
    expect(nearestLevelWithItems(POOL, 'A2')).toBe('A2');
  });

  it('is reproducible for the same content and seed', () => {
    const first = buildPlacementItem(POOL, 'A2', new Set(), seededRng(9));
    const second = buildPlacementItem(POOL, 'A2', new Set(), seededRng(9));
    expect(first!.id).toBe(second!.id);
    expect(first!.options).toEqual(second!.options);
  });

  it('marks a listening question as such and carries the source row for review', () => {
    const item = buildPlacementItem(POOL, 'A1', new Set(), seededRng(2), true)!;
    expect(item.isListening).toBe(true);
    expect(Number.isFinite(item.sourceId)).toBe(true);
    expect(item.explanationAr).toContain(item.german);
  });

  it('asks listening questions only when the device can speak, and never first', () => {
    expect(shouldUseListening(0, true)).toBe(false);
    expect(shouldUseListening(2, true)).toBe(true);
    expect(shouldUseListening(5, true)).toBe(true);
    expect(shouldUseListening(2, false)).toBe(false);
  });

  it('needs at least two correct answers to promote, never one', () => {
    expect(PROMOTE_AFTER).toBe(2);
  });
});
