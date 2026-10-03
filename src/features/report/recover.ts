/**
 * The debrief must survive the tab that earned it.
 *
 * V31 measured this: `ReportRoute` restored the summary from React state or
 * `sessionStorage`, and otherwise did `<Navigate to="/app/trail" replace />` —
 * silently. So a refresh, a crashed tab, a backgrounded PWA the browser
 * discarded, or closing the window inside the 3.2 s gap between the last turn
 * and the debrief navigation all ended the same way: the learner did the whole
 * lesson and the result vanished, with no explanation and nothing to come back
 * to. The reward was the one moment the product could not promise.
 *
 * Everything the debrief needs is already durable. `finishSession` writes the
 * `sessions` row, and every correction was written to `mistakes` the moment the
 * turn landed — before the session even ended. The debrief itself is a pure
 * function of those numbers, so it can be rebuilt rather than re-earned.
 *
 * The reconstruction is honest by construction:
 *  - the corrections are the session's OWN last `mistakesCount` mistakes for
 *    that scenario at or before the session's own end timestamp, so nothing from
 *    a neighbouring session leaks in and nothing from this one is missing;
 *  - `previousMistakeCount` is read from the prior session row the same way
 *    `finishSession` reads it, so the "versus your last attempt" line compares
 *    like with like;
 *  - a session row written before `mistakesCount` existed yields no comparison
 *    rather than an invented one.
 */

import type { SessionEntity, MistakeEntity, CEFRLevel } from '@/types/models';
import { buildSessionDebrief, type SessionDebrief } from '@/lib/debrief/debrief';

export interface RecoveredSummary {
  scenarioId: string;
  scenarioTitle: string;
  cefrLevel: CEFRLevel;
  sentencesSpoken: number;
  accuracyPercent: number | null;
  durationSeconds: number;
  independentSentences: number;
  assistedSentences: number;
  mistakes: Array<{ original: string; corrected: string; grammarRule: string }>;
  debrief: SessionDebrief;
}

/**
 * Which mistake rows belong to this session.
 *
 * The session's own corrections are the most recent `mistakesCount` mistakes for
 * the same scenario whose timestamp is at or before the session's end. Taking the
 * tail by COUNT rather than by a time window is what keeps this exact: a window
 * has to guess a boundary, and a guess either drops this session's last
 * correction or steals the next session's first.
 *
 * A session that recorded no count cannot be split from its neighbours, so it
 * contributes no mistakes rather than an approximate set.
 */
export function mistakesForSession(
  session: SessionEntity,
  mistakes: MistakeEntity[],
): MistakeEntity[] {
  const count = session.mistakesCount;
  if (typeof count !== 'number' || count <= 0) return [];
  const scoped = mistakes
    .filter(
      (mistake) =>
        mistake.scenarioId === session.scenarioId &&
        typeof mistake.timestamp === 'number' &&
        mistake.timestamp <= session.timestamp &&
        !!mistake.original &&
        !!mistake.corrected,
    )
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, count);
  // Oldest first, so the debrief reads in the order the learner made them.
  return scoped.reverse();
}

/** The prior attempt's correction count, or null when there is nothing honest to compare. */
export function previousMistakeCountFor(
  session: SessionEntity,
  sessions: SessionEntity[],
): number | null {
  const prior = sessions
    .filter(
      (row) =>
        row.scenarioId === session.scenarioId &&
        typeof row.mistakesCount === 'number' &&
        row.timestamp < session.timestamp,
    )
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  return prior?.mistakesCount ?? null;
}

/**
 * Rebuilds a debrief from durable rows. Returns null when the row cannot carry
 * one — an older row without the sentence counts the report needs — so the
 * caller can say "there is no saved report" instead of rendering zeroes.
 */
export function summaryFromSession(
  session: SessionEntity,
  mistakes: MistakeEntity[],
  sessions: SessionEntity[],
): RecoveredSummary | null {
  if (!session || typeof session.sentencesSpoken !== 'number') return null;
  const scoped = mistakesForSession(session, mistakes);
  const mistakesCount = typeof session.mistakesCount === 'number' ? session.mistakesCount : scoped.length;
  const independent = session.independentSentences ?? session.sentencesSpoken;
  const assisted = session.hintAssistedSentences ?? Math.max(0, session.sentencesSpoken - independent);
  const mistakeList = scoped.map((mistake) => ({
    original: mistake.original,
    corrected: mistake.corrected,
    grammarRule: mistake.grammarRule || 'قاعدة نحوية',
  }));

  return {
    scenarioId: session.scenarioId,
    scenarioTitle: session.scenarioTitle || '',
    cefrLevel: session.cefrLevel,
    sentencesSpoken: session.sentencesSpoken,
    accuracyPercent: session.accuracyPercent ?? null,
    durationSeconds: session.durationSeconds || 0,
    independentSentences: independent,
    assistedSentences: assisted,
    mistakes: mistakeList,
    debrief: buildSessionDebrief({
      scenarioTitle: session.scenarioTitle || '',
      level: session.cefrLevel,
      mode: session.mode || 'practice',
      sentencesSpoken: session.sentencesSpoken,
      independentSentences: independent,
      assistedSentences: assisted,
      accuracyPercent: session.accuracyPercent ?? null,
      mistakes: mistakeList,
      previousMistakeCount: previousMistakeCountFor(session, sessions),
    }),
  };
}

/**
 * The newest completed session, newest first. `mistakesCount` is not required:
 * a session that recorded no corrections is still a debrief worth recovering.
 */
export function latestRecoverableSession(sessions: SessionEntity[]): SessionEntity | null {
  const rows = (sessions || []).filter(
    (row) =>
      !!row &&
      typeof row.timestamp === 'number' &&
      typeof row.sentencesSpoken === 'number' &&
      row.sentencesSpoken > 0,
  );
  if (!rows.length) return null;
  return rows.sort((a, b) => b.timestamp - a.timestamp)[0];
}