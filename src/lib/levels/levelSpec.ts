import type { CEFRLevel } from '@/types/models';

/**
 * The level system spec (docs/agent/LEVEL-SPEC.md) as code.
 *
 * WHY A MODULE AND NOT CONTENT: one scenario must be playable at every level —
 * the same airport, café or interview, easier or harder German — so complexity
 * has to live in ONE spec the AI prompt, the validator and the UI all read,
 * not in per-level copies of the content. Everything here is pure data and pure
 * functions, unit-tested without network.
 *
 * The worker (plain JS) mirrors this table in `cloudflare-level-spec.js` for
 * server-side enforcement; `tests/levelParity.test.ts` fails if the two drift.
 */

export type LevelSpec = {
  /** Max words per German sentence the model may produce at this level. */
  maxWordsPerSentence: number;
  /** Tense groups the model may use, named for the validator's marker lists. */
  allowedTenses: Array<'praesens' | 'perfekt' | 'praeteritum' | 'futur' | 'konjunktiv_ii'>;
  /** Coordinating/subordinating connectors allowed at this level. */
  allowedConnectors: string[];
  /** How many learner errors to correct per turn — always the most important first. */
  maxCorrectionsPerTurn: number;
  /** Initial Arabic-support default (the learner can always toggle). */
  arabicSupport: 'always' | 'default' | 'on-tap' | 'hidden';
  /** TTS speaking-speed multiplier the conversation reads when speaking German. */
  speakingSpeed: number;
  /**
   * Turn cap for one conversation: the session ends when the last beat is reached
   * or here, whichever comes first (V28 Stage 1D). Level-based, not mode-based —
   * the two modes are the same conversation with different help.
   */
  maxSessionTurns: number;
};

/**
 * A0 ("from zero") sits below A1: six-word sentences, present tense only,
 * two connectors, one correction, Arabic always on, slow speech.
 * Stored content keeps using A1–B2; A0 pools arrive with the foundations module.
 */
export const LEVEL_SPECS: Record<CEFRLevel, LevelSpec> = {
  A0: {
    maxWordsPerSentence: 6,
    allowedTenses: ['praesens'],
    allowedConnectors: ['und', 'oder', 'aber'],
    maxCorrectionsPerTurn: 1,
    arabicSupport: 'always',
    speakingSpeed: 0.75,
    maxSessionTurns: 3,
  },
  A1: {
    maxWordsPerSentence: 8,
    allowedTenses: ['praesens', 'perfekt'],
    allowedConnectors: ['und', 'oder', 'aber', 'denn', 'dann'],
    maxCorrectionsPerTurn: 1,
    arabicSupport: 'default',
    speakingSpeed: 0.85,
    maxSessionTurns: 4,
  },
  A2: {
    maxWordsPerSentence: 10,
    allowedTenses: ['praesens', 'perfekt', 'praeteritum'],
    allowedConnectors: ['und', 'oder', 'aber', 'denn', 'dann', 'weil', 'dass', 'wenn', 'deshalb'],
    maxCorrectionsPerTurn: 2,
    arabicSupport: 'on-tap',
    speakingSpeed: 0.95,
    maxSessionTurns: 6,
  },
  B1: {
    maxWordsPerSentence: 12,
    allowedTenses: ['praesens', 'perfekt', 'praeteritum', 'futur', 'konjunktiv_ii'],
    allowedConnectors: [
      'und', 'oder', 'aber', 'denn', 'dann', 'weil', 'dass', 'wenn', 'deshalb',
      'obwohl', 'damit', 'bevor', 'nachdem', 'während',
    ],
    maxCorrectionsPerTurn: 3,
    arabicSupport: 'hidden',
    speakingSpeed: 1.0,
    maxSessionTurns: 9,
  },
  B2: {
    maxWordsPerSentence: 15,
    allowedTenses: ['praesens', 'perfekt', 'praeteritum', 'futur', 'konjunktiv_ii'],
    allowedConnectors: ['*'],
    maxCorrectionsPerTurn: 3,
    arabicSupport: 'hidden',
    speakingSpeed: 1.05,
    maxSessionTurns: 12,
  },
};

/** The full ladder, floor first. */
export const LEVEL_LADDER: CEFRLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2'];

export function levelSpecFor(level: CEFRLevel | undefined | null): LevelSpec {
  return LEVEL_SPECS[level || 'A1'] ?? LEVEL_SPECS.A1;
}

/**
 * One compact prompt line describing the level's caps — stable per level so the
 * provider's prefix cache stays warm (the base prompt must not vary per turn).
 */
export function levelConstraintLine(level: CEFRLevel): string {
  const s = levelSpecFor(level);
  const tenses =
    level === 'A0'
      ? 'present tense only'
      : level === 'A1'
        ? 'present and perfect (Perfekt) tense only'
        : level === 'A2'
          ? 'present, perfect and simple past (Präteritum) only'
          : 'any tense';
  const connectors = s.allowedConnectors.includes('*')
    ? 'any connectors'
    : `connectors limited to: ${s.allowedConnectors.join(', ')}`;
  return `LEVEL CAPS — write German at CEFR ${level}: at most ${s.maxWordsPerSentence} words per sentence; ${tenses}; ${connectors}. Correct at most ${s.maxCorrectionsPerTurn} mistake${s.maxCorrectionsPerTurn === 1 ? '' : 's'} per turn, the most important one first.`;
}
