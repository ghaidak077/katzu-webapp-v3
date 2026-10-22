import { describe, expect, it } from 'vitest';
import { resolveOpeningScenarioId } from '../src/lib/journey/opening';
import { INTRO_SCENARIO_ID } from '../src/lib/mission/selectMission';

/**
 * Which scene a first-run learner's episode opens.
 *
 * The arrival row is seeded on every launch, so the happy case is what a phone
 * actually runs. The fallback is the case a browser cannot be made to produce
 * honestly — the app re-adds the row on mount — so it is proven here instead: an
 * install that predates the opening fixture, or one whose seed stopped half-way,
 * must still open *some* real scene rather than a "scene not found" screen.
 */
describe('the opening scene', () => {
  it('opens the arrival episode whenever its row is on the device', () => {
    expect(resolveOpeningScenarioId([{ id: INTRO_SCENARIO_ID }])).toBe(INTRO_SCENARIO_ID);
    // Input order is never read: the decision is the id, not the array position.
    expect(
      resolveOpeningScenarioId([
        { id: 'cafe_order', category: 'daily_life' },
        { id: INTRO_SCENARIO_ID, category: 'travel' },
        { id: 'train_station', category: 'travel' },
      ]),
    ).toBe(INTRO_SCENARIO_ID);
  });

  it('falls back to the journey order, not to the first row handed in', () => {
    // `cafe_order` is first in the array and last in the journey; the station is
    // where the story starts once the airport is absent.
    expect(
      resolveOpeningScenarioId([
        { id: 'cafe_order', category: 'daily_life' },
        { id: 'train_station', category: 'travel' },
        { id: 'job_interview', category: 'work' },
      ]),
    ).toBe('train_station');
  });

  it('has nothing to open when the device has no scenes at all', () => {
    // The caller keeps today's route in this case (`/app/trail`) — never an id
    // that would render Story Setup on «لم نجد هذا المشهد».
    expect(resolveOpeningScenarioId([])).toBeNull();
    expect(resolveOpeningScenarioId(null)).toBeNull();
    expect(resolveOpeningScenarioId(undefined)).toBeNull();
  });
});
