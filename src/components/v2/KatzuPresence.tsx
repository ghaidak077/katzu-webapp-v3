import React from 'react';
import { cn } from '@/components/ui/Button';
import { KatzuMascot, type MascotSticker } from '@/components/common/KatzuMascot';

/**
 * Katzu as a presence, not a sticker.
 *
 * A pose is chosen by *what actually happened*, never by decoration, and only a
 * genuinely earned outcome gets the magenta glow. The mapping is a closed set so
 * a screen cannot invent a celebratory pose for an assisted session:
 *
 *   journey        trail_guide   → leading the learner into today's mission
 *   story          scenario_host → Katzu introduces the character they'll meet
 *   practice       practice      → coaching, mid-drill
 *   listening      listening     → actively listening to the learner
 *   conversation   avatar        → present but out of the way
 *   independent    thumbs_up     → real unaided success (magenta allowed)
 *   assisted       peace         → progress with help; warm, not triumphant
 *   incomplete     practice      → a difficult miss: supportive, never mocking
 *   all_caught_up  peace         → rest is a legitimate state
 *   review_due     trail_guide   → something is waiting; gently impatient
 *   blocked        settings_mascot → a state only the learner can unblock (offline/quota)
 */
export type KatzuState =
  | 'journey'
  | 'story'
  | 'practice'
  | 'listening'
  | 'conversation'
  | 'independent'
  | 'assisted'
  | 'incomplete'
  | 'all_caught_up'
  | 'review_due'
  | 'blocked';

const POSES: Record<KatzuState, { pose: MascotSticker; glow: boolean }> = {
  journey: { pose: 'trail_guide', glow: false },
  story: { pose: 'scenario_host', glow: false },
  practice: { pose: 'practice', glow: false },
  listening: { pose: 'listening', glow: true },
  conversation: { pose: 'avatar', glow: false },
  independent: { pose: 'thumbs_up', glow: true },
  assisted: { pose: 'peace', glow: false },
  incomplete: { pose: 'practice', glow: false },
  all_caught_up: { pose: 'peace', glow: false },
  review_due: { pose: 'trail_guide', glow: false },
  blocked: { pose: 'settings_mascot', glow: false },
};

export interface KatzuPresenceProps {
  state: KatzuState;
  /** Arabic line Katzu says in this state. Real state-aware copy, never filler. */
  lineAr?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Places the line beside the pose instead of under it (mission card layout). */
  inline?: boolean;
  className?: string;
}

const SIZES = {
  sm: 'h-12 w-12',
  md: 'h-20 w-20',
  lg: 'h-28 w-28',
  xl: 'h-36 w-36',
};

export const KatzuPresence: React.FC<KatzuPresenceProps> = ({
  state,
  lineAr,
  size = 'md',
  inline = false,
  className,
}) => {
  const { pose, glow } = POSES[state];
  // Magenta is the earned signal; the pose keeps its own lavender drop-shadow.
  const glowClass = glow
    ? state === 'independent'
      ? 'drop-shadow-[0_0_26px_rgba(255,111,216,0.42)]'
      : 'drop-shadow-[0_0_22px_rgba(180,160,255,0.42)]'
    : undefined;

  if (inline) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <KatzuMascot name={pose} className={cn(SIZES[size], 'shrink-0', glowClass)} />
        {lineAr && <p className="kz-ar-caption min-w-0 text-kz-inkDim">{lineAr}</p>}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-center gap-2 text-center', className)}>
      <KatzuMascot name={pose} className={cn(SIZES[size], glowClass)} />
      {lineAr && <p className="kz-ar-caption max-w-xs text-kz-inkDim">{lineAr}</p>}
    </div>
  );
};
