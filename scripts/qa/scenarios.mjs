/**
 * THE REDUCED SUITE — 12 sessions, one learner profile each, every unit at least once.
 *
 * The owner's full 60-input eval cannot run on the free tier at will (200K
 * tokens/day shared with production). This is the smallest suite that still
 * covers all ten units, all four levels and all twelve learner behaviours, so a
 * run is affordable and the result still means something.
 *
 * Split: 9 training sessions / 3 held-out. Held-out is chosen one per level band
 * (A2, B1, B2) and is never used while choosing a prompt version; it is the
 * check that an improvement generalises.
 */
import './register.mjs';
import { planForScenario } from '../../cloudflare-roleplay-plans.js';

// Static imports of the app's TS modules are hoisted above register.mjs, so the
// resolver hook would not be installed yet. A dynamic import runs after it.
const { UNITS } = await import('../../src/lib/units/units.ts');

export const SUITE_VERSION = 1;

const SEEDS = [
  'first_greetings',
  'cafe_order',
  'numbers_and_prices',
  'train_station',
  'anmeldung_buergeramt',
  'apartment_viewing',
  'doctor_visit',
  'friend_catchup',
  'daily_standup',
  'bewerbung_ausbildung',
  'job_interview',
  'exam_gemeinsam_planen',
];

export const SCENARIOS = SEEDS.map((scenarioId) => {
  const unit = UNITS.find((entry) => entry.scenarioIds.includes(scenarioId));
  const plan = planForScenario(scenarioId);
  if (!unit) throw new Error(`qa: ${scenarioId} is not in any unit`);
  if (!plan) throw new Error(`qa: ${scenarioId} has no roleplay plan`);
  return {
    scenarioId,
    unitId: unit.id,
    unitLevel: unit.level,
    level: plan.level || unit.level,
    persona: plan.persona?.name || '',
    gender: plan.persona?.gender || '',
  };
});

/** Profile → scenario, fixed so a run is comparable across prompt versions. */
export const SESSIONS = [
  { profile: 'careless_speller', scenarioId: 'cafe_order', split: 'train' },
  { profile: 'no_umlauts_lowercase', scenarioId: 'anmeldung_buergeramt', split: 'train' },
  { profile: 'one_word', scenarioId: 'first_greetings', split: 'train' },
  { profile: 'arabic', scenarioId: 'doctor_visit', split: 'train' },
  { profile: 'off_topic', scenarioId: 'numbers_and_prices', split: 'train' },
  { profile: 'injection', scenarioId: 'job_interview', split: 'heldout' },
  { profile: 'very_short', scenarioId: 'train_station', split: 'train' },
  { profile: 'very_long', scenarioId: 'apartment_viewing', split: 'heldout' },
  { profile: 'copies_hint', scenarioId: 'friend_catchup', split: 'train' },
  { profile: 'silent', scenarioId: 'daily_standup', split: 'train' },
  { profile: 'confused_beginner', scenarioId: 'bewerbung_ausbildung', split: 'train' },
  { profile: 'strong_learner', scenarioId: 'exam_gemeinsam_planen', split: 'heldout' },
].map((session) => {
  const scenario = SCENARIOS.find((entry) => entry.scenarioId === session.scenarioId);
  if (!scenario) throw new Error(`qa: unknown scenario ${session.scenarioId}`);
  return { ...session, ...scenario, id: `${session.profile}--${session.scenarioId}` };
});

/** The weekly CI smoke: 10 scenarios × 3 profiles is too much for free tier at
 * full length, so the smoke picks the hostile/edge profiles across units. */
export const CI_PROFILES = ['careless_speller', 'copies_hint', 'injection'];
