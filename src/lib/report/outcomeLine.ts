import type { CapabilityState } from '@/types/models';

/**
 * What the report says when a session was not independent.
 *
 * WHY THIS EXISTS
 * `OUTCOME.PRACTISING` used to be one fixed sentence: «أكملنا الجلسة بمساعدة
 * تلميحاتي» — "we finished with the help of my hints". The state is derived from
 * a missing independent session, not from hint use, so a learner who typed every
 * sentence alone and simply did not clear the independence bar was told hints had
 * carried them. On a screen whose whole promise is honest feedback, that is the
 * one claim it must never invent.
 *
 * The assisted count is the evidence: above zero the hint line is true, at zero
 * the report says what actually happened and still offers the next step.
 */
export const PRACTISING_WITHOUT_HINTS_AR =
  'أكملت الجلسة، وما زال هذا المشهد يحتاج تدريباً — لم تستقل به بعد، وهذا طبيعي في هذه المرحلة.';

/**
 * The line the report shows for a capability state.
 *
 * `fallback` is the state's authored line, so every other state is unchanged and
 * this file holds copy for exactly one case.
 */
export function sessionOutcomeLine(
  state: CapabilityState,
  assistedSentences: number,
  fallback: string,
): string {
  if (state === 'PRACTISING' && Math.max(0, Number(assistedSentences) || 0) === 0) {
    return PRACTISING_WITHOUT_HINTS_AR;
  }
  return fallback;
}
