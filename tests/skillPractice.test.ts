import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, wipeUserScopedData } from '@/lib/db/katzuDb';
import { buildSkillSummary } from '@/lib/skills/summary';
import { DEFAULT_EASE } from '@/lib/srs/engine';

/**
 * The skills card is the app's most tempting place to lie: a grid of four bars
 * looks broken when two of them are empty, and the easy fix is to invent a
 * number. These tests pin the opposite — a skill with no recorded attempt stays
 * `null` (rendered as "not measured"), and only real stored rows move a score.
 */

beforeEach(async () => {
  await db.open();
  await db.skill_practice.clear();
  await db.review_items.clear();
  await db.sessions.clear();
});

describe('skill practice storage (schema v5)', () => {
  it('adds its table without disturbing the memory queue', async () => {
    const tables = db.tables.map((table) => table.name);
    expect(tables).toContain('skill_practice');
    expect(tables).toContain('review_items');

    await db.review_items.add({
      userId: 'current_user',
      kind: 'vocab',
      refId: 'vocab:1',
      promptAr: 'قهوة',
      answerDe: 'der Kaffee',
      dueAt: 1,
      intervalDays: 1,
      ease: DEFAULT_EASE,
      reps: 0,
      lapses: 0,
      reviews: 0,
      createdAt: 1,
    });
    await db.skill_practice.add({ userId: 'current_user', skill: 'writing', score: 61, at: 2 });

    expect(await db.review_items.count()).toBe(1);
    expect(await db.skill_practice.count()).toBe(1);
  });

  it('clears practice rows with the rest of the user-scoped data on sign-out', async () => {
    await db.skill_practice.add({ userId: 'current_user', skill: 'listening', score: 80, at: 2 });
    await wipeUserScopedData();
    expect(await db.skill_practice.count()).toBe(0);
  });
});

describe('four-skill summary', () => {
  const practice = (rows: Array<{ skill: 'listening' | 'writing'; score: number }>) =>
    rows.map((row, index) => ({ ...row, at: index }));

  it('shows no score before anything has been practised', () => {
    const summary = buildSkillSummary({ sessions: [], practice: [] });
    expect(summary.measured).toBe(0);
    expect(summary.stats.every((stat) => stat.score === null)).toBe(true);
  });

  it('keeps reading unmeasured instead of reporting a zero', () => {
    const summary = buildSkillSummary({
      sessions: [{ accuracyPercent: 70, independentSentences: 4, hintAssistedSentences: 1 }],
      practice: [],
    });
    const reading = summary.stats.find((stat) => stat.skill === 'reading');
    expect(reading?.score).toBeNull();
    expect(reading?.attempts).toBe(0);
  });

  it('averages each skill from its own rows', () => {
    const summary = buildSkillSummary({
      sessions: [
        { accuracyPercent: 80, independentSentences: 5, hintAssistedSentences: 0 },
        { accuracyPercent: 60, independentSentences: 3, hintAssistedSentences: 2 },
      ],
      practice: practice([
        { skill: 'listening', score: 50 },
        { skill: 'listening', score: 75 },
        { skill: 'writing', score: 40 },
      ]),
    });

    const bySkill = Object.fromEntries(summary.stats.map((stat) => [stat.skill, stat]));
    expect(bySkill.speaking.score).toBe(70);
    expect(bySkill.speaking.attempts).toBe(2);
    expect(bySkill.listening.score).toBe(63);
    expect(bySkill.listening.attempts).toBe(2);
    expect(bySkill.writing.score).toBe(40);
    expect(summary.measured).toBe(3);
  });

  it('ignores sessions with no usable accuracy rather than counting them as zero', () => {
    const summary = buildSkillSummary({
      sessions: [
        { accuracyPercent: null as unknown as number, independentSentences: 0, hintAssistedSentences: 0 },
        { accuracyPercent: 90, independentSentences: 6, hintAssistedSentences: 0 },
      ],
      practice: [],
    });
    const speaking = summary.stats.find((stat) => stat.skill === 'speaking');
    expect(speaking?.score).toBe(90);
    expect(speaking?.attempts).toBe(1);
  });
});
