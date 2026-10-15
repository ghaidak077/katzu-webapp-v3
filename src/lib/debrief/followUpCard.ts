import type { UserEntity } from '@/types/models';
import { placementOffer } from '@/lib/onboarding/preferences';

/**
 * The one-time follow-up card (A4) — the single question the app asks *after*
 * the first real episode, and never again.
 *
 * Why after and not before: A3 removed questions from the front door precisely
 * because a learner who has not yet produced a German sentence has no reason to
 * answer another one. Once an episode exists, though, exactly one thing is
 * usually still unknown — and which thing differs per learner, so this picks
 * one instead of stacking a survey on the report.
 *
 * The card is deterministic and pure: it reads the user row and returns the one
 * card this learner should see, or null. "One-time" is enforced by the caller
 * writing `followUpCardSeenAt`; the decision function stays honest about that
 * and returns nothing once the stamp exists, so a missed write can only cost a
 * repeat card, never an endless loop of them.
 */

export type FollowUpCardKind =
  /** The level was never measured and there is reason to offer the check. */
  | 'placement'
  /** The goal is an exam but no date exists to plan backwards from. */
  | 'target-date';

export interface FollowUpCard {
  kind: FollowUpCardKind;
  titleAr: string;
  bodyAr: string;
  /** The one action, named as the outcome rather than the mechanism. */
  actionAr: string;
  /** The quiet way out. Present on every card — none of these is mandatory. */
  skipAr: string;
}

export interface FollowUpCardInput {
  user:
    | Pick<
        UserEntity,
        | 'cefrLevel'
        | 'placementCompletedAt'
        | 'placementSkippedAt'
        | 'previousGerman'
        | 'arrivalStatus'
        | 'primaryGoal'
        | 'targetDate'
        | 'followUpCardSeenAt'
      >
    | null
    | undefined;
  /** True once at least one episode has been completed on this device. */
  hasCompletedEpisode: boolean;
}

export function buildFollowUpCard({ user, hasCompletedEpisode }: FollowUpCardInput): FollowUpCard | null {
  if (!user) return null;
  // Asking before the learner has done anything is the front-door tax A3 removed.
  if (!hasCompletedEpisode) return null;
  if (user.followUpCardSeenAt) return null;

  // The level question comes first: everything else (which scenarios are
  // reachable, how hard the coach pushes) is built on top of it, so it is the
  // one unknown that makes the rest less accurate.
  if (needsPlacementOffer(user)) {
    return {
      kind: 'placement',
      titleAr: 'هل نقيس مستواك الآن؟',
      bodyAr: placementOffer(user.previousGerman).recommendAr,
      actionAr: 'ابدأ القياس',
      skipAr: 'سنتابع من هنا',
    };
  }

  // An exam is the one goal with a deadline, and a deadline with no date cannot
  // be planned backwards from — so the date is the missing fact, not the goal.
  if (user.primaryGoal === 'exam' && !user.targetDate) {
    return {
      kind: 'target-date',
      titleAr: 'ما موعد امتحانك؟',
      bodyAr: 'قلت إن هدفك الامتحان. بموعدك نبني المراجعة على عدد الأسابيع المتبقية فعلاً بدل وتيرة عامة.',
      actionAr: 'أضف الموعد',
      skipAr: 'لا موعد محدّد بعد',
    };
  }

  return null;
}

/**
 * Whether the unmeasured level is worth offering to *this* learner.
 *
 * A from-zero first-timer is already in the right place, so offering a
 * placement check would be busy-work dressed as personalisation. Everyone else
 * gets the offer: anyone who studied before may be weeks ahead of where A1
 * starts them, and someone already living in Germany has real-world German
 * around them whether or not they ever studied it formally.
 */
function needsPlacementOffer(
  user: Pick<UserEntity, 'placementCompletedAt' | 'placementSkippedAt' | 'previousGerman' | 'arrivalStatus'>,
): boolean {
  if (user.placementCompletedAt) return false;
  if (user.previousGerman === 'first_time' && user.arrivalStatus !== 'living_in_germany') return false;
  return placementOffer(user.previousGerman).primary === 'placement' || user.arrivalStatus === 'living_in_germany';
}
