import type { CEFRLevel, SessionMode } from '@/types/models';
import { LEVEL_SPECS } from '@/lib/levels/levelSpec';

/**
 * How long a conversation is, and what the two modes mean.
 *
 * V28 Stage 1D replaced the old "تمرين سريع / تحدي واقعي مكثف" picker — which
 * chose between three and eight ROUNDS of the same thing — with two modes of the
 * SAME conversation:
 *   • `practice` — with help: hints, translation, a direct correction.
 *   • `real`     — no help: no hints, no translation, no live correction; a
 *                  report at the end instead (see SessionReportScreen).
 *
 * Length is therefore a LEVEL property, not a mode one, and it lives in
 * `levelSpec` (`maxSessionTurns`) beside the other level caps so the documented
 * and implemented numbers cannot drift. This module is the one place the screen
 * reads it from.
 */

/** The default mode when a learner enters the conversation from a mission. */
export const DEFAULT_SESSION_MODE: SessionMode = 'practice';

/** The turn cap for one conversation at this level. */
export function sessionTurnCap(level: CEFRLevel): number {
  return LEVEL_SPECS[level]?.maxSessionTurns ?? LEVEL_SPECS.A1.maxSessionTurns;
}

/** UI copy per mode, so the picker and the report never disagree. */
export const SESSION_MODE_COPY: Record<SessionMode, { labelAr: string; descriptionAr: string }> = {
  practice: {
    labelAr: 'تدريب (مع مساعدة)',
    descriptionAr: 'تلميحات وترجمة وتصحيح مباشر أثناء الحديث — للتعلّم والبناء.',
  },
  real: {
    labelAr: 'محادثة حقيقية (بدون مساعدة)',
    descriptionAr: 'بلا تلميحات ولا ترجمة ولا تصحيح مباشر — كموقف حقيقي، وتقرير في النهاية.',
  },
};
