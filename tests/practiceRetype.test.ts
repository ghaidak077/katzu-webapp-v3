import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/katzuDb';
import { enrolMistake, gradeReviewItem } from '@/lib/srs/store';
import { gradeCorrectionRetype } from '@/lib/srs/engine';
import type { MistakeEntity } from '@/types/models';

/**
 * The practice mistake drill had two defects, both pinned here.
 *
 *  1. It compared the retyped answer to the correction with an ad-hoc exact match,
 *     so a correct full sentence written around the corrected fragment was
 *     rejected — the same false negative the session debrief had.
 *  2. One correct retype wrote `isMastered` on the mistake row, while the review
 *     engine defines mastery as three consecutive good recalls (`MASTERED_REPS`).
 *     The store owns that field; the drill must not write it.
 *
 * The store rule itself is pinned in reviewStore.test.ts. This file pins the
 * *drill's* contract: it uses the shared, non-exact grader, and it never claims
 * mastery — it grades through the store and lets the store decide.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(join(root, 'src', 'features', 'practice', 'PracticeScreen.tsx'), 'utf8');

function mistake(): MistakeEntity {
  return {
    userId: 'current_user',
    scenarioId: 'cafe_order',
    original: 'Ich habe den Bericht fertig',
    corrected: 'ist jetzt fertiggestellt',
    grammarRule: 'Perfekt',
    timestamp: 1_700_000_000_000,
    wasHintUsed: false,
  };
}

beforeEach(async () => {
  await db.open();
  await db.review_items.clear();
  await db.mistakes.clear();
});

describe('the practice mistake-retype drill', () => {
  it('grades through the shared, non-exact grader', () => {
    expect(source).toMatch(/gradeCorrectionRetype\s*\(/);
    // The defect was an ad-hoc exact comparison inside the handler; it must not
    // come back. (The retired line compared `input.replace(/\\.$/,'')` to `target`.)
    expect(source).not.toMatch(/replace\(\/\\\.\$\/,\s*''\)\s*===\s*target/);
  });

  it('never writes mastery itself — the review store owns isMastered', () => {
    expect(source).toMatch(/gradeReviewItem\s*\(/);
    expect(source).not.toMatch(/isMastered:\s*true/);
    expect(source).not.toMatch(/db\.mistakes\.update\(/);
  });

  it('would have caught the old drill (these guards are not vacuous)', () => {
    // The retired handler, verbatim in shape: an ad-hoc exact match plus a direct
    // mastery write. If a future edit reintroduces either, the assertions above fail.
    const oldHandler =
      "const input = (retypedMistakes[id] || '').trim().toLowerCase();" +
      "if (input.replace(/\\.$/, '') === target.replace(/\\.$/, '')) {" +
      'await db.mistakes.update(id, { isMastered: true }); }';
    expect(oldHandler).toMatch(/replace\(\/\\\.\$\/,\s*''\)\s*===\s*target/);
    expect(oldHandler).toMatch(/isMastered:\s*true/);
    expect(oldHandler).toMatch(/db\.mistakes\.update\(/);
  });

  it('accepts a correct full sentence around the corrected fragment', () => {
    // What the learner actually typed in the V26 walkthrough.
    expect(gradeCorrectionRetype('ist jetzt fertiggestellt', 'Ich habe den Bericht jetzt fertiggestellt')).toBe('correct');
  });

  it('leaves the mistake unmastered after one correct retype', async () => {
    const row = mistake();
    const id = await db.mistakes.put(row);
    await enrolMistake({ ...row, id }, 1_000);

    // Exactly what the drill now does on a correct retype of a full sentence.
    const item = (await db.review_items.toArray())[0];
    await gradeReviewItem(item, 'good');

    expect((await db.mistakes.get(id))?.isMastered).toBeFalsy();
  });

  it('masters it once the third good recall lands', async () => {
    const row = mistake();
    const id = await db.mistakes.put(row);
    await enrolMistake({ ...row, id }, 1_000);

    const item = (await db.review_items.toArray())[0];
    await gradeReviewItem(item, 'good');
    await gradeReviewItem(item, 'good');
    await gradeReviewItem(item, 'good');

    expect((await db.mistakes.get(id))?.isMastered).toBe(true);
  });
});
