import type { CEFRLevel, SessionMode } from '@/types/models';

/**
 * How long a conversation is, as one explicit rule.
 *
 * This used to be three ternaries inside the live screen: the number of turns a
 * learner got depended on where they were read, and a documented length could
 * drift from the implemented one without anything failing. Pacing lives here
 * now, is unit-tested, and the screen only reads it.
 *
 * The numbers are deliberately modest: a learner who stops while still willing
 * to speak comes back tomorrow, and a session that ends on success is the only
 * one that teaches anything. A1 gets the shortest run — the first conversation
 * should be finishable.
 */
export const TURNS_BY_MODE: Record<SessionMode, Record<CEFRLevel, number>> = {
  // A0 gets the A1 run: the shortest possible session — a brand-new learner's
  // first conversation must finish while they are still willing to speak.
  quick: { A0: 3, A1: 3, A2: 4, B1: 5, B2: 6 },
  immersion: { A0: 8, A1: 8, A2: 8, B1: 10, B2: 10 },
};

/** The default mode when a learner enters the conversation from a mission. */
export const DEFAULT_SESSION_MODE: SessionMode = 'quick';

export function planTurns(mode: SessionMode, level: CEFRLevel): number {
  return TURNS_BY_MODE[mode]?.[level] ?? TURNS_BY_MODE[DEFAULT_SESSION_MODE].A1;
}

/** Both options for a level, for the mode chooser copy. */
export function turnPlanForLevel(level: CEFRLevel): Array<{ mode: SessionMode; turns: number }> {
  return [
    { mode: 'quick', turns: planTurns('quick', level) },
    { mode: 'immersion', turns: planTurns('immersion', level) },
  ];
}
