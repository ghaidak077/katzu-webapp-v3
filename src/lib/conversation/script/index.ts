import type { CEFRLevel } from '@/types/models';
import type { ScenarioScript } from './types';
import { PILOT_SCRIPTS } from './scripts';

/**
 * The per-scenario migration flag. A scenario is served by the app-owned script
 * only when it appears here; everything else keeps the legacy model-driven
 * engine. That is what lets the pilot ship unit by unit without a big-bang.
 */
const SCRIPT_BY_ID = new Map<string, ScenarioScript>(PILOT_SCRIPTS.map((entry) => [entry.scenarioId, entry]));

/**
 * A script is authored at ONE level (today: A1). Serving it at another level is
 * what the mock exam exposed: the B1 exam asks for `cafe_order`, and the A1
 * script answered in A1 German while the chip said B1. So a script only takes
 * over when the level the session is actually served at matches the script's
 * own level; every other level keeps the legacy engine.
 */
export function isScriptedScenario(
  scenarioId: string | null | undefined,
  level?: CEFRLevel | null,
): boolean {
  return scriptForScenario(scenarioId, level) !== null;
}

export function scriptForScenario(
  scenarioId: string | null | undefined,
  level?: CEFRLevel | null,
): ScenarioScript | null {
  if (!scenarioId) return null;
  const script = SCRIPT_BY_ID.get(scenarioId);
  if (!script) return null;
  if (level && script.level !== level) return null;
  return script;
}

/** Every migrated id, for the simulation gate and the docs. */
export function scriptedScenarioIds(): string[] {
  return PILOT_SCRIPTS.map((entry) => entry.scenarioId);
}

/** The opener is the script's first ask, so the two can never disagree. */
export function scriptOpener(script: ScenarioScript): { de: string; ar: string } {
  return script.steps[0]?.asks[0] ?? { de: 'Hallo!', ar: 'مرحباً!' };
}

export function scriptLevel(script: ScenarioScript): CEFRLevel {
  return script.level;
}

export * from './types';
export {
  advanceScript,
  countQuestions,
  currentHint,
  currentQuestionLine,
  currentStep,
  fillSlots,
  guardGermanLine,
  guardHintLine,
  hasMarkdown,
  isAwaitingGoodbye,
  keepNameOnce,
  matchAnswer,
  scriptTurnTarget,
  startScript,
  understandAnswer,
} from './engine';
export {
  buildScriptTurnContext,
  validateFarewellTurn,
  validateScriptAiTurn,
  type ScriptAiTurn,
  type ScriptTurnWireContext,
} from './aiTurn';
