import type { SessionEntity, SkillPracticeEntity } from '@/types/models';

/**
 * The four-skill picture, computed from what was actually recorded.
 *
 * Why this is a separate pure module: the app's central honesty rule is that it
 * never displays a number it did not measure, and a skills grid is the easiest
 * place in any language app to break that rule (an empty skill silently becomes
 * a zero, or a generator fills the gap with a plausible-looking bar). Everything
 * here is derived from stored rows, and a skill with no rows is `null` — the UI
 * renders that as "not measured yet", not as 0%.
 */

/** The four skills every German exam tests. Reading is listed because it is missing, not because it works. */
export const SKILLS = ['speaking', 'listening', 'writing', 'reading'] as const;

export type Skill = (typeof SKILLS)[number];

export interface SkillStat {
  skill: Skill;
  /** Measured 0-100, or null when nothing has been recorded for this skill yet. */
  score: number | null;
  /** How many measured attempts the score is based on. */
  attempts: number;
}

export interface SkillSummary {
  stats: SkillStat[];
  /** Skills with at least one measured attempt — used to avoid showing a grid of dashes to a new learner. */
  measured: number;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

export function buildSkillSummary({
  sessions,
  practice,
}: {
  sessions: Array<Pick<SessionEntity, 'accuracyPercent' | 'independentSentences' | 'hintAssistedSentences'>>;
  practice: Array<Pick<SkillPracticeEntity, 'skill' | 'score'>>;
}): SkillSummary {
  // Speaking is the conversation loop. Its honest unit is the session accuracy
  // the learner saw at the end of the conversation, not a score we invent here.
  const speakingScores = sessions
    .map((session) => session.accuracyPercent)
    .filter((accuracy): accuracy is number => typeof accuracy === 'number' && Number.isFinite(accuracy));

  const bySkill = (skill: SkillPracticeEntity['skill']) =>
    practice
      .filter((row) => row.skill === skill)
      .map((row) => row.score)
      .filter((score) => typeof score === 'number' && Number.isFinite(score));

  const listening = bySkill('listening');
  const writing = bySkill('writing');

  const stats: SkillStat[] = [
    { skill: 'speaking', score: average(speakingScores), attempts: speakingScores.length },
    { skill: 'listening', score: average(listening), attempts: listening.length },
    { skill: 'writing', score: average(writing), attempts: writing.length },
    // Reading has no exercises yet, so it has no data — and the card says so
    // rather than showing a fabricated or zero score.
    { skill: 'reading', score: null, attempts: 0 },
  ];

  return { stats, measured: stats.filter((stat) => stat.score !== null).length };
}
