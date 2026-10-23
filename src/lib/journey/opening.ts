import { INTRO_SCENARIO_ID } from '@/lib/mission/selectMission';
import { journeyOrderedScenarios } from '@/lib/content/scenarioOrder';

/**
 * Which scene a brand-new learner's first episode opens.
 *
 * The product's opening is the arrival (`INTRO_SCENARIO_ID`), and the offline seed
 * writes it on every launch (`seedStoryOpening`), so in practice this returns the
 * airport. It is a *resolution* rather than a constant for the two states where
 * that row is not on the device: an install whose cache was written before the
 * opening fixture existed, and a cache that failed to finish seeding. Navigating
 * to an id that is not there would open Story Setup on «لم نجد هذا المشهد» — a
 * dead end for the one learner this hop exists for.
 *
 * The fallback is the journey's own rule (`journeyOrderedScenarios`, the order the
 * library and the mission already use), not a second hardcoded id: a device with
 * only the six fixture scenes opens at the station, which is where the story
 * begins once the airport is absent. Still nothing on the device means no scene to
 * open, and the caller keeps today's route.
 *
 * Pure on purpose: which scene a learner meets first is a product decision, and a
 * decision buried in a route handler is one nobody can test.
 */
export function resolveOpeningScenarioId(
  scenarios: Array<{ id: string; category?: string | null; sequence_order?: number | null }> | null | undefined,
): string | null {
  const rows = Array.isArray(scenarios) ? scenarios : [];
  if (rows.some((row) => row?.id === INTRO_SCENARIO_ID)) return INTRO_SCENARIO_ID;
  const first = journeyOrderedScenarios(rows)[0];
  return first?.id ?? null;
}
