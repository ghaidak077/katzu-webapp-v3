import type { MemoryPatternEntity, MistakeEntity, ReviewItemEntity } from '@/types/models';
import { db } from '@/lib/db/katzuDb';
import { classifyMistake } from '@/lib/coach/taxonomy';

/**
 * The long-memory store (V21 Phase 3).
 *
 * What it keeps — allow-listed facts only: recurring mistake patterns and weak
 * vocabulary, each as a count + a last-seen date. What it never keeps: audio,
 * full transcripts, message bodies. Every row is a DERIVED view over sources
 * the app already stores and syncs (`mistakes`, `review_items`), so the
 * pattern table itself needs no new server sync and no new conflict rules —
 * wipe it and the next rebuild reconstructs it.
 */

export const MEMORY_PATTERNS_LIMIT = 40;

/** A vocabulary item qualifies as weak after this many failed SRS grades. */
const WEAK_VOCAB_MIN_LAPSES = 2;

export function mistakePatternId(rule: string): string {
  return `mistake:${rule.toLowerCase().trim()}`;
}

export function vocabPatternId(sourceId: number): string {
  return `vocab:${sourceId}`;
}

/**
 * Rebuilds the whole pattern table from the source tables.
 * Deterministic: same sources → same rows, so the caller can rebuild after
 * every episode, on any device, and all devices converge on the same view.
 */
export async function rebuildMemoryPatterns(): Promise<void> {
  const [mistakes, reviewItems] = await Promise.all([
    db.mistakes.toArray(),
    db.review_items.toArray(),
  ]);
  const patterns = deriveMemoryPatterns(mistakes, reviewItems, Date.now());
  await db.memory_patterns.clear();
  if (patterns.length > 0) {
    await db.memory_patterns.bulkPut(patterns);
  }
}

/**
 * The pure core: mistakes become per-rule patterns (spelling excluded — a
 * typo is not a grammar pattern), review items become weak-vocab patterns
 * after `WEAK_VOCAB_MIN_LAPSES` lapses. Most-repeated first.
 */
export function deriveMemoryPatterns(
  mistakes: MistakeEntity[],
  reviewItems: ReviewItemEntity[],
  now: number,
): MemoryPatternEntity[] {
  const byId = new Map<string, MemoryPatternEntity>();

  for (const mistake of mistakes) {
    const rule = (mistake?.grammarRule || '').trim();
    if (!rule) continue;
    if (classifyMistake(rule, mistake.original || '', mistake.corrected || '') === 'spelling') continue;
    const id = mistakePatternId(rule);
    const existing = byId.get(id);
    if (existing) {
      existing.count += 1;
      existing.lastSeenAt = Math.max(existing.lastSeenAt, mistake.timestamp || 0);
    } else {
      byId.set(id, {
        patternId: id,
        kind: 'mistake',
        labelAr: rule,
        german: (mistake.corrected || '').trim() || undefined,
        count: 1,
        lastSeenAt: mistake.timestamp || 0,
        updatedAt: now,
      });
    }
  }

  for (const item of reviewItems) {
    const lapses = Number(item?.lapses) || 0;
    if (lapses < WEAK_VOCAB_MIN_LAPSES) continue;
    const answer = (item?.answerDe || '').trim();
    const id = vocabPatternId(item?.sourceId ?? 0);
    const existing = byId.get(id);
    if (existing) {
      existing.count = Math.max(existing.count, lapses);
      existing.lastSeenAt = Math.max(existing.lastSeenAt, item.lastReviewedAt || 0);
    } else {
      byId.set(id, {
        patternId: id,
        kind: 'vocab',
        labelAr: (item?.explanationAr || '').trim() || (item?.contextDe || '').trim() || 'كلمة تعود لتنسى',
        german: answer || undefined,
        count: lapses,
        lastSeenAt: item.lastReviewedAt || item.createdAt || 0,
        updatedAt: now,
      });
    }
  }

  return [...byId.values()]
    .sort((a, b) => b.count - a.count || b.lastSeenAt - a.lastSeenAt || a.patternId.localeCompare(b.patternId))
    .slice(0, MEMORY_PATTERNS_LIMIT);
}

/** The learner-facing rows (Settings viewer), newest activity first. */
export async function listMemoryPatterns(): Promise<MemoryPatternEntity[]> {
  const rows = await db.memory_patterns.toArray();
  return rows.sort((a, b) => b.count - a.count || b.lastSeenAt - a.lastSeenAt);
}

/** The learner's delete button: one pattern, or everything at once. */
export async function deleteMemoryPattern(patternId: string): Promise<void> {
  await db.memory_patterns.delete(patternId);
}

export async function clearMemoryPatterns(): Promise<void> {
  await db.memory_patterns.clear();
}
