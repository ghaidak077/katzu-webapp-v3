import { db } from '@/lib/db/katzuDb';
import type { LearnerGoal } from '@/types/models';

/**
 * The four personal facts Katzu is allowed to remember across sessions:
 * name, city, job and learning goal.
 *
 * Rules, by design:
 *  - they live only on this device (the `users` row), never on the server;
 *  - they are used for callbacks in the conversation (the persona can greet the
 *    learner by name or refer to their city), never for targeting or analytics;
 *  - every one of them is visible and deletable in Settings;
 *  - deleting a fact deletes the value, not the row.
 *
 * The functions are tiny on purpose: one reader, one writer, one remover. The
 * UI never writes to `db.users` for these facts directly, so there is exactly
 * one place that decides what a fact is.
 */
export type PersonalFactKind = 'name' | 'city' | 'job' | 'goal';

export interface PersonalFact {
  kind: PersonalFactKind;
  labelAr: string;
  value: string | null;
  /** What deleting this fact actually does, shown next to the trash icon. */
  placeholderAr: string;
}

export const PERSONAL_FACT_LABELS: Record<PersonalFactKind, string> = {
  name: 'الاسم',
  city: 'المدينة',
  job: 'المهنة',
  goal: 'هدف التعلّم',
};

/** Goal values that are safe to store; anything else is treated as absent. */
const GOALS: ReadonlySet<string> = new Set<LearnerGoal>([
  'daily_life',
  'work',
  'university',
  'exam',
  'family',
  'study',
  'travel',
  'general',
]);

function clean(value: unknown, max = 60): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function readPersonalFacts(): Promise<PersonalFact[]> {
  const user = await db.users.get('current_user');
  return [
    {
      kind: 'name',
      labelAr: PERSONAL_FACT_LABELS.name,
      value: clean(user?.displayName, 40),
      placeholderAr: 'لا نعرف اسمك بعد',
    },
    {
      kind: 'city',
      labelAr: PERSONAL_FACT_LABELS.city,
      value: clean(user?.city, 40),
      placeholderAr: 'لا نعرف مدينتك بعد',
    },
    {
      kind: 'job',
      labelAr: PERSONAL_FACT_LABELS.job,
      value: clean(user?.jobTitle, 60),
      placeholderAr: 'لا نعرف مهنتك بعد',
    },
    {
      kind: 'goal',
      labelAr: PERSONAL_FACT_LABELS.goal,
      value: user?.primaryGoal && GOALS.has(user.primaryGoal) ? user.primaryGoal : null,
      placeholderAr: 'لم تحدّد هدفك بعد',
    },
  ];
}

export async function savePersonalFact(kind: PersonalFactKind, raw: string): Promise<void> {
  const value = clean(raw);
  switch (kind) {
    case 'name':
      await db.users.update('current_user', { displayName: value ?? '' });
      return;
    case 'city':
      await db.users.update('current_user', { city: value ?? undefined });
      return;
    case 'job':
      await db.users.update('current_user', { jobTitle: value ?? undefined });
      return;
    case 'goal':
      await db.users.update('current_user', {
        primaryGoal: value && GOALS.has(value) ? (value as LearnerGoal) : undefined,
      });
      return;
  }
}

export async function clearPersonalFact(kind: PersonalFactKind): Promise<void> {
  switch (kind) {
    case 'name':
      await db.users.update('current_user', { displayName: '' });
      return;
    case 'city':
      await db.users.update('current_user', { city: undefined });
      return;
    case 'job':
      await db.users.update('current_user', { jobTitle: undefined });
      return;
    case 'goal':
      await db.users.update('current_user', { primaryGoal: undefined });
      return;
  }
}

/** A fact learned inside a conversation (today: the city the learner names). */
export async function rememberPersonalFact(kind: 'name' | 'city' | 'job', value: string): Promise<void> {
  const cleanValue = clean(value, kind === 'name' ? 40 : 60);
  if (!cleanValue) return;
  await savePersonalFact(kind, cleanValue);
}
