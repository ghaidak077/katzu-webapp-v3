import { describe, expect, it } from 'vitest';
import {
  DRILL_SIZE,
  buildDrillQueue,
  describeDrillResult,
  diffDictation,
  type DrillPool,
} from '@/lib/listening/drill';
import type { CEFRLevel, StarterPhraseEntity, VocabularyEntity } from '@/types/models';

function seededRng(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function word(id: number, level: CEFRLevel, german: string, translationAr: string, article: 'der' | 'die' | 'das' | null = null) {
  return { id, german, article, translation_ar: translationAr, level, topic: 'cafe_order' } as VocabularyEntity;
}

function phrase(id: number, level: CEFRLevel, german: string, translationAr: string) {
  return { id, german, translation_ar: translationAr, level, scenario_id: 'cafe_order', sort_order: 1 } as StarterPhraseEntity;
}

const POOL: DrillPool = {
  vocabulary: [
    word(1, 'A1', 'Kaffee', 'قهوة', 'der'),
    word(2, 'A1', 'Wasser', 'ماء', 'das'),
    word(3, 'A2', 'Termin', 'موعد', 'der'),
  ],
  phrases: [
    phrase(10, 'A1', 'Ich möchte einen Kaffee, bitte.', 'أريد قهوة من فضلك.'),
    phrase(11, 'A2', 'Können Sie das bitte wiederholen?', 'هل يمكنك إعادة ذلك من فضلك؟'),
  ],
};

describe('dictation scoring', () => {
  it('accepts an exact transcription', () => {
    const result = diffDictation('Ich möchte einen Kaffee, bitte.', 'Ich möchte einen Kaffee, bitte.');
    expect(result.verdict).toBe('correct');
    expect(result.missedWords).toEqual([]);
  });

  it('forgives umlauts and ß spelling, because a phone keyboard should not decide the score', () => {
    expect(diffDictation('Ich möchte einen Kaffee', 'Ich moechte einen Kaffee').verdict).toBe('correct');
    expect(diffDictation('die Straße', 'die Strasse').verdict).toBe('correct');
  });

  it('ignores case and punctuation', () => {
    expect(diffDictation('Können Sie das wiederholen?', 'koennen sie das wiederholen').verdict).toBe('correct');
  });

  it('tolerates a word the learner added, since they still heard the sentence', () => {
    expect(diffDictation('Der Termin ist Montag', 'Der Termin ist am Montag').verdict).toBe('correct');
  });

  it('names the exact words that were missed', () => {
    // Four of five words: not "correct" (a word was genuinely missed), but not
    // "wrong" either — and the feedback must name the missing word.
    const result = diffDictation('Können Sie das bitte wiederholen?', 'Können Sie das wiederholen');
    expect(result.verdict).toBe('close');
    expect(result.missedWords).toEqual(['bitte']);

    const partial = diffDictation('Können Sie das bitte wiederholen?', 'Können Sie das');
    expect(partial.verdict).toBe('wrong');
    expect(partial.missedWords).toContain('bitte');
    expect(partial.missedWords).toContain('wiederholen');
    expect(partial.matched).toBe(3);
    expect(partial.total).toBe(5);
  });

  it('calls a mostly-right attempt close rather than wrong', () => {
    const result = diffDictation('Ich möchte einen Kaffee bitte', 'Ich möchte einen Kaffee');
    expect(result.verdict).toBe('close');
    expect(result.matched).toBe(4);
    expect(result.total).toBe(5);
  });

  it('does not count one word twice just because it was typed twice', () => {
    const result = diffDictation('Der Termin ist da', 'Termin Termin Termin');
    expect(result.matched).toBe(1);
    expect(result.verdict).toBe('wrong');
  });

  it('treats an empty answer as wrong instead of scoring it', () => {
    expect(diffDictation('Der Termin', '').verdict).toBe('wrong');
    expect(diffDictation('', '').verdict).toBe('wrong');
  });

  it('reports the missed word without trailing punctuation', () => {
    const result = diffDictation('Wo ist der Bahnhof?', 'Wo ist der');
    expect(result.missedWords).toContain('Bahnhof');
  });
});

describe('drill queue', () => {
  it('asks for whole sentences before single words', () => {
    const sentencePool: DrillPool = {
      vocabulary: [word(1, 'A1', 'Kaffee', 'قهوة', 'der')],
      phrases: [
        phrase(10, 'A1', 'Ich möchte einen Kaffee, bitte.', 'أريد قهوة من فضلك.'),
        phrase(11, 'A1', 'Wo ist der Bahnhof?', 'أين محطة القطار؟'),
      ],
    };
    const queue = buildDrillQueue(sentencePool, 'A1', 2, seededRng(1));
    expect(queue).toHaveLength(2);
    expect(queue.every((item) => item.kind === 'phrase')).toBe(true);
  });

  it('tops up with single words when a level has fewer sentences than the drill size', () => {
    const queue = buildDrillQueue(POOL, 'A1', 3, seededRng(9));
    expect(queue).toHaveLength(3);
    expect(queue.filter((item) => item.kind === 'phrase')).toHaveLength(1);
    expect(queue.filter((item) => item.kind === 'vocab')).toHaveLength(2);
  });

  it('never exceeds the requested size', () => {
    expect(buildDrillQueue(POOL, 'A1', DRILL_SIZE, seededRng(2)).length).toBeLessThanOrEqual(DRILL_SIZE);
    expect(buildDrillQueue(POOL, 'A1', 2, seededRng(2))).toHaveLength(2);
  });

  it('never drills the same source row twice in one run', () => {
    const queue = buildDrillQueue(POOL, 'A1', DRILL_SIZE, seededRng(3));
    expect(new Set(queue.map((item) => item.id)).size).toBe(queue.length);
  });

  it('honours already-used rows so a second run does not repeat the first', () => {
    const first = buildDrillQueue(POOL, 'A1', 3, seededRng(4));
    const used = new Set(first.map((item) => item.id));
    const second = buildDrillQueue(POOL, 'A1', 3, seededRng(5), used);
    for (const item of second) expect(used.has(item.id)).toBe(false);
  });

  it('falls back to other levels rather than returning an empty drill', () => {
    const sparse: DrillPool = { vocabulary: [word(1, 'A1', 'Kaffee', 'قهوة', 'der')], phrases: [] };
    expect(buildDrillQueue(sparse, 'B2', 3, seededRng(6))).toHaveLength(1);
  });

  it('returns nothing when there is no content at all, so the screen can say so', () => {
    expect(buildDrillQueue({ vocabulary: [], phrases: [] }, 'A1', 5, seededRng(7))).toEqual([]);
  });

  it('never asks for an item with an empty answer to compare against', () => {
    const queue = buildDrillQueue(POOL, 'A1', DRILL_SIZE, seededRng(8));
    for (const item of queue) {
      expect(item.german.length).toBeGreaterThan(0);
      expect(item.translationAr.length).toBeGreaterThan(0);
      expect(Number.isFinite(item.sourceId)).toBe(true);
    }
  });
});

describe('result wording', () => {
  it('is encouraging without overclaiming', () => {
    expect(describeDrillResult(8, 8)).toContain('بدقة');
    expect(describeDrillResult(6, 8)).toContain('معظم');
    expect(describeDrillResult(1, 8)).toContain('مراجعتك');
    expect(describeDrillResult(0, 0)).toContain('لا يوجد محتوى');
  });
});
