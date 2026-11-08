import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db/katzuDb';
import {
  clearPersonalFact,
  readPersonalFacts,
  rememberPersonalFact,
  savePersonalFact,
} from '../src/lib/memory/personalFacts';
import type { UserEntity } from '../src/types/models';

/**
 * The four personal facts are the learner's own, local-only memory. These tests
 * pin the three promises the Settings card makes:
 *  1. a value written here is exactly what is read back (trimmed, not altered);
 *  2. a goal is only stored when it is a real answer;
 *  3. deleting a fact removes the value, not the account row.
 */

const baseUser = (over: Partial<UserEntity> = {}): UserEntity =>
  ({
    id: 'current_user',
    email: 'learner@example.com',
    displayName: 'Ghaidak',
    isLoggedIn: true,
    subscriptionExpiresAt: null,
    isSubscriptionActive: false,
    lastCheckedAt: 0,
    updatedAt: 0,
    cefrLevel: 'A1',
    streakDays: 0,
    lastActiveDate: '2026-11-08',
    totalXp: 0,
    speechSpeed: 1,
    sarcasmLevel: 'normal',
    freeSessionsRemaining: 3,
    dailyGoalMinutes: 15,
    weeklyGoalDays: 5,
    ...over,
  }) as UserEntity;

beforeEach(async () => {
  await db.users.clear();
  await db.users.put(baseUser());
});

describe('personal facts', () => {
  it('reads name, city, job and goal from the local user row', async () => {
    await db.users.update('current_user', {
      displayName: 'Ghaidak',
      city: 'Hamburg',
      jobTitle: 'Krankenpfleger',
      primaryGoal: 'work',
    });
    const facts = await readPersonalFacts();
    expect(facts.map((fact) => [fact.kind, fact.value])).toEqual([
      ['name', 'Ghaidak'],
      ['city', 'Hamburg'],
      ['job', 'Krankenpfleger'],
      ['goal', 'work'],
    ]);
  });

  it('trims and collapses whitespace instead of storing it', async () => {
    await savePersonalFact('city', '  Bad   Homburg  ');
    const city = (await readPersonalFacts()).find((fact) => fact.kind === 'city');
    expect(city?.value).toBe('Bad Homburg');
  });

  it('refuses a goal that is not one of the stored answers', async () => {
    await savePersonalFact('goal', 'become_astronaut');
    const goal = (await readPersonalFacts()).find((fact) => fact.kind === 'goal');
    expect(goal?.value).toBeNull();
  });

  it('deletes one fact without touching the others', async () => {
    await db.users.update('current_user', { city: 'Hamburg', jobTitle: 'Krankenpfleger' });
    await clearPersonalFact('city');
    const facts = await readPersonalFacts();
    expect(facts.find((fact) => fact.kind === 'city')?.value).toBeNull();
    expect(facts.find((fact) => fact.kind === 'job')?.value).toBe('Krankenpfleger');
    expect(facts.find((fact) => fact.kind === 'name')?.value).toBe('Ghaidak');
  });

  it('remembers a city from a conversation, but ignores an empty one', async () => {
    await rememberPersonalFact('city', '  ');
    expect((await readPersonalFacts()).find((fact) => fact.kind === 'city')?.value).toBeNull();
    await rememberPersonalFact('city', 'Leipzig');
    expect((await readPersonalFacts()).find((fact) => fact.kind === 'city')?.value).toBe('Leipzig');
  });
});
