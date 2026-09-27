import { db } from '@/lib/db/katzuDb';
import { enrolStudiedPhrases, enrolStudiedVocabulary } from '@/lib/srs/store';
import type { DemoState } from './demoFlow';
import { DEMO_VERSION } from './demoFlow';

/**
 * Anonymous demo progress: what is stored locally, and what may cross into a
 * real account afterwards.
 *
 * The demo runs with no account, so its state lives in localStorage only. When
 * the visitor later signs in, exactly two things migrate:
 *
 *  1. the scenario they actually studied (a truthful `studiedAt` timestamp), and
 *  2. the content rows they saw, enrolled into the spaced-repetition queue —
 *     the same enrolment the authenticated Study screen performs.
 *
 * Nothing else crosses. The demo's quiz score and production verdict are
 * client-side, unmoderated and unverifiable, so recording them as achievement
 * would be exactly the "claim the learner learned something the app did not
 * measure" failure this product forbids. They stay on the demo's own summary
 * screen and are then discarded.
 */

export const DEMO_STORAGE_KEY = 'katzu_demo_state_v1';

export interface DemoMigrationPlan {
  scenarioId: string;
  studiedAt: number;
  vocabSourceIds: number[];
  phraseSourceIds: number[];
}

/**
 * Pure planning half. Returns null when there is nothing honest to migrate: no
 * completed demo, or a demo where the visitor never finished studying an item.
 */
export function planDemoMigration(state: DemoState | null | undefined): DemoMigrationPlan | null {
  if (!state || state.version !== DEMO_VERSION) return null;
  if (state.stage !== 'done' || !state.completedAt) return null;
  if (!state.scenarioId || !Array.isArray(state.items)) return null;

  const studied = Array.isArray(state.studiedIndices) ? state.studiedIndices : [];
  const studiedItems = studied
    .filter((index) => Number.isInteger(index) && index >= 0 && index < state.items.length)
    .map((index) => state.items[index]);
  if (studiedItems.length === 0) return null;
  // The visitor who skipped every study step and jumped to production still
  // produced a sentence against one item; that item is real practice.
  const practised = studiedItems.length > 0 ? studiedItems : state.items.slice(0, 1);

  return {
    scenarioId: state.scenarioId,
    studiedAt: state.completedAt,
    vocabSourceIds: [...new Set(practised.filter((item) => item.kind === 'vocab').map((item) => item.sourceId))],
    phraseSourceIds: [...new Set(practised.filter((item) => item.kind === 'phrase').map((item) => item.sourceId))],
  };
}

/**
 * Writes the plan into the local database. Idempotent: the review queue refuses
 * duplicates by `[kind+refId]`, and the training row is written with the
 * earliest truthful study timestamp so re-running it cannot overwrite real
 * progress from a later session.
 */
export async function applyDemoMigration(plan: DemoMigrationPlan): Promise<{ trainingMarked: boolean; enrolled: number }> {
  if (!plan?.scenarioId) return { trainingMarked: false, enrolled: 0 };

  const existing = await db.scenario_training.get(plan.scenarioId);
  if (!existing?.studiedAt) {
    await db.scenario_training.put({
      scenarioId: plan.scenarioId,
      userId: 'current_user',
      studiedAt: plan.studiedAt,
      quizAttempted: false,
      lastScore: 0,
      effectiveLevel: 'A1',
      updatedAt: Date.now(),
    });
  }

  let enrolled = 0;
  if (plan.vocabSourceIds.length > 0) {
    const words = (await db.vocabulary.bulkGet(plan.vocabSourceIds)).filter(
      (word): word is NonNullable<typeof word> => !!word,
    );
    enrolled += await enrolStudiedVocabulary(words, plan.studiedAt);
  }
  if (plan.phraseSourceIds.length > 0) {
    const phrases = (await db.starter_phrases.bulkGet(plan.phraseSourceIds)).filter(
      (phrase): phrase is NonNullable<typeof phrase> => !!phrase,
    );
    enrolled += await enrolStudiedPhrases(phrases, plan.studiedAt);
  }

  return { trainingMarked: true, enrolled };
}

/** Runs the whole migration once and clears the demo state on success only. */
export async function consumeDemoProgress(): Promise<{ migrated: boolean; enrolled: number }> {
  const plan = planDemoMigration(loadDemoState());
  if (!plan) return { migrated: false, enrolled: 0 };
  try {
    const result = await applyDemoMigration(plan);
    clearDemoState();
    return { migrated: true, enrolled: result.enrolled };
  } catch {
    // Keep the state: a failed import must not destroy the only copy of the
    // visitor's practice, and the next sign-in will retry it.
    return { migrated: false, enrolled: 0 };
  }
}

export function loadDemoState(): DemoState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoState;
    if (!parsed || parsed.version !== DEMO_VERSION || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    // A corrupt demo state is not worth a crash: treat it as absent.
    return null;
  }
}

export function saveDemoState(state: DemoState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode / quota: the demo still runs for this session, it just will
    // not survive a reload. Never surface a storage error to a visitor.
  }
}

export function clearDemoState(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
