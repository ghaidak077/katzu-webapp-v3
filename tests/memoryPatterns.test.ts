import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MemoryPatternEntity, MistakeEntity, ReviewItemEntity } from '../src/types/models';
import {
  MEMORY_PATTERNS_LIMIT,
  deriveMemoryPatterns,
  mistakePatternId,
  vocabPatternId,
} from '../src/lib/memory/patterns';
import { MEMORY_SUMMARY_TOKEN_BUDGET, approxTokens, buildMemorySummary } from '../src/lib/memory/summary';
import type { UserEntity } from '../src/types/models';

/**
 * The long-memory store (V21 Phase 3): derived, allow-listed, deterministic.
 * The migration half lives in `dbUpgrade.test.ts` (real v5 → v6 upgrade with
 * data preserved); this file pins the derivation and the ≤150-token summary.
 */

const mistake = (over: Partial<MistakeEntity>): MistakeEntity =>
  ({
    userId: 'current_user',
    scenarioId: 'cafe_order',
    original: 'Ich möchte ein Kaffee',
    corrected: 'Ich möchte einen Kaffee',
    grammarRule: 'الأدة: Koffer مذكّر',
    timestamp: 1_700_000_000_000,
    wasHintUsed: false,
    ...over,
  }) as MistakeEntity;

const reviewItem = (over: Partial<ReviewItemEntity>): ReviewItemEntity =>
  ({
    userId: 'current_user',
    kind: 'vocab',
    refId: 'vocab:1042',
    sourceId: 1042,
    promptAr: 'المحطة',
    answerDe: 'der Bahnhof',
    dueAt: 1_700_000_100_000,
    intervalDays: 1,
    ease: 2.5,
    reps: 3,
    lapses: 2,
    reviews: 5,
    createdAt: 1_700_000_000_000,
    ...over,
  }) as ReviewItemEntity;

describe('deriveMemoryPatterns', () => {
  it('groups repeated mistake rules into one pattern with a count', () => {
    const patterns = deriveMemoryPatterns(
      [
        mistake({ grammarRule: 'حرف الجر', timestamp: 1_000 }),
        mistake({ grammarRule: 'حرف الجر', timestamp: 2_000 }),
        mistake({ grammarRule: 'حرف الجر', timestamp: 3_000 }),
      ],
      [],
      9_000,
    );
    expect(patterns).toHaveLength(1);
    expect(patterns[0].patternId).toBe(mistakePatternId('حرف الجر'));
    expect(patterns[0].count).toBe(3);
    expect(patterns[0].lastSeenAt).toBe(3_000);
    expect(patterns[0].kind).toBe('mistake');
  });

  it('drops spelling-only corrections: a typo is not a grammar pattern', () => {
    // Same sentence with only capitalisation changed — the classifier the
    // mistake bank already uses calls this a spelling miss, so must the memory.
    const patterns = deriveMemoryPatterns(
      [mistake({ original: 'ich möchte einen kaffee', corrected: 'Ich möchte einen Kaffee', grammarRule: 'الأداة' })],
      [],
      9_000,
    );
    expect(patterns).toHaveLength(0);
  });

  it('turns repeatedly-lapsed vocabulary into a weak-vocab pattern', () => {
    const patterns = deriveMemoryPatterns([], [reviewItem({ lapses: 2 })], 9_000);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].patternId).toBe(vocabPatternId(1042));
    expect(patterns[0].kind).toBe('vocab');
    expect(patterns[0].count).toBe(2);
  });

  it('ignores vocabulary that has never lapsed twice', () => {
    expect(deriveMemoryPatterns([], [reviewItem({ lapses: 1 })], 9_000)).toHaveLength(0);
  });

  it('sorts by repetition first, then recency, then id — deterministically', () => {
    const patterns = deriveMemoryPatterns(
      [
        mistake({ grammarRule: 'قليل التكرار', timestamp: 5_000 }),
        mistake({ grammarRule: 'متكرر جدا', timestamp: 1_000 }),
        mistake({ grammarRule: 'متكرر جدا', timestamp: 2_000 }),
      ],
      [],
      9_000,
    );
    expect(patterns.map((pattern) => pattern.labelAr)).toEqual(['متكرر جدا', 'قليل التكرار']);
  });

  it('caps the table so the viewer and the summary stay bounded', () => {
    const flood = Array.from({ length: MEMORY_PATTERNS_LIMIT + 20 }, (_, index) =>
      mistake({ grammarRule: `قاعدة رقم ${index}` }),
    );
    expect(deriveMemoryPatterns(flood, [], 9_000).length).toBeLessThanOrEqual(MEMORY_PATTERNS_LIMIT);
  });
});

describe('buildMemorySummary', () => {
  const pattern = (over: Partial<MemoryPatternEntity>): MemoryPatternEntity =>
    ({
      patternId: 'mistake:x',
      kind: 'mistake',
      labelAr: 'قاعدة',
      count: 1,
      lastSeenAt: 1,
      updatedAt: 1,
      ...over,
    }) as MemoryPatternEntity;

  it('never exceeds the 150-token budget', () => {
    const patterns = Array.from({ length: 30 }, (_, index) =>
      pattern({ patternId: `mistake:r${index}`, labelAr: `قاعدة طويلة نسبياً رقم ${index} مع شرح`, german: 'Ich möchte einen Kaffee, bitte', count: 30 - index }),
    );
    const summary = buildMemorySummary({ patterns, level: 'A1', goal: 'work', profession: 'medical' });
    expect(summary.approxTokens).toBeLessThanOrEqual(MEMORY_SUMMARY_TOKEN_BUDGET);
    expect(summary.items.length).toBeGreaterThan(0);
    expect(summary.items.length).toBeLessThanOrEqual(10);
  });

  it('always saves room for the goal/profession line', () => {
    const patterns = Array.from({ length: 30 }, (_, index) =>
      pattern({ patternId: `mistake:r${index}`, labelAr: `قاعدة رقم ${index}`, count: 30 - index }),
    );
    const summary = buildMemorySummary({ patterns, level: 'B1', goal: 'work', profession: 'tech' });
    const goalLine = summary.items.find((item) => item.rule.includes('المتعلم'));
    expect(goalLine).toBeDefined();
    expect(goalLine?.rule).toContain('للعمل');
    expect(goalLine?.rule).toContain('تقني');
  });

  it('gives the tutor the CORRECTED German, never the broken one', () => {
    const summary = buildMemorySummary({
      patterns: [pattern({ labelAr: 'الأدة', german: 'Ich möchte einen Kaffee' })],
      level: 'A1',
    });
    expect(summary.items[0].rule).toContain('الصواب: Ich möchte einen Kaffee');
    expect(summary.items[0].example).toBe('Ich möchte einen Kaffee');
  });

  it('mixes mistakes first, then weak vocabulary, honouring the budget', () => {
    const summary = buildMemorySummary({
      patterns: [
        pattern({ patternId: 'mistake:a', kind: 'mistake', labelAr: 'خطأ أول', german: 'den Koffer', count: 5 }),
        pattern({ patternId: 'vocab:b', kind: 'vocab', labelAr: 'المحطة', german: 'der Bahnhof', count: 4 }),
      ],
      level: 'A2',
    });
    expect(summary.items[0].rule).toContain('خطأ أول');
    expect(summary.items[1].rule).toContain('der Bahnhof');
  });

  it('stays empty and cheap when the learner has no patterns yet', () => {
    const summary = buildMemorySummary({ patterns: [], level: 'A0', goal: null, profession: null });
    expect(summary.items).toEqual([]);
    expect(summary.approxTokens).toBe(0);
  });

  it('estimates conservatively: every char counts toward the cap', () => {
    expect(approxTokens('x'.repeat(70))).toBe(20);
    expect(approxTokens('')).toBe(1);
  });
});

describe('memory privacy shape (allow-listed fields only)', () => {
  it('carries no transcript-like or audio fields on any pattern row', () => {
    const patterns = deriveMemoryPatterns([mistake({ original: 'Eine ganze historische Satzadresse' })], [reviewItem({})], 9_000);
    for (const row of patterns) {
      expect(Object.keys(row).sort()).toEqual(['count', 'german', 'kind', 'labelAr', 'lastSeenAt', 'patternId', 'updatedAt']);
      expect(row.german!.length).toBeLessThan(200);
      expect(row.labelAr.length).toBeLessThan(200);
    }
  });

  it('user rows gain the optional profession field without breaking old rows', () => {
    const modern: Partial<UserEntity> = { profession: 'medical' };
    const legacy: Partial<UserEntity> = {};
    expect(modern.profession).toBe('medical');
    expect(legacy.profession).toBeUndefined();
  });
});
