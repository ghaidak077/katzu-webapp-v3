/**
 * The order a learner meets the situations in — the journey, not the alphabet.
 *
 * WHY THIS FILE EXISTS
 * The Trail decides what a learner sees first, and until now that decision was
 * made by accident twice over:
 *
 *   1. `examFirstScenarios` sorted each group by `sort_order` — a field no
 *      scenario row has (the column is `sequence_order`, and the D1 endpoint
 *      does not even order by it). `Number(undefined ?? 0)` is 0 for every row,
 *      so the comparison always returned 0 and the sort did nothing.
 *   2. With the sort a no-op, the list kept the order Dexie handed back, which
 *      is the object store's primary key: `id`, alphabetically. That is why
 *      «أول الكلمات» sat behind «التأشيرة», and why a learner arriving in Germany
 *      met `anerkennung_*` before the airport.
 *
 * An unexplained order is a product defect: the learner cannot tell whether a
 * situation comes next because it is easier or because its name starts with `a`.
 * So the order is now stated once, in one place, as a rule — and it starts where
 * the learner's story starts, at the airport.
 *
 * THE RULE
 * Every scenario belongs to a stage of the journey. Stages run in a fixed order;
 * within a stage, the situations a learner meets first are named explicitly, and
 * anything new lands in a sane place without anyone editing this file for it.
 *
 * `exam_*` sits last by the owner's direction (2026-10-07). It previously led the
 * Trail (F8: "the preview is the reason they arrived"), which put exam drills in
 * front of the airport a first-run learner had just been dropped into. Exam
 * practice is now the end of the journey it prepares you for, and it is still one
 * tap away behind the same «اعرض بقية المشاهد» control. Nothing is filtered.
 */

/** Where a situation sits in the learner's journey, in the order it is met. */
export type JourneyStage =
  | 'arrival'
  | 'first_words'
  | 'everyday'
  | 'home'
  | 'official'
  | 'health'
  | 'work'
  | 'professional'
  | 'exam'
  | 'other';

/**
 * The journey, in order.
 *
 * The sequence is the story the app is built around: you land, you find your
 * words, you live your day, you sort out where you sleep, you deal with
 * authorities, you look after your body, you work, you interview, and finally you
 * practise for the exam that all of it was for.
 */
export const JOURNEY_STAGE_ORDER: JourneyStage[] = [
  'arrival',
  'first_words',
  'everyday',
  'home',
  'official',
  'health',
  'work',
  'professional',
  'exam',
  'other',
];

/**
 * Known situations, by stage.
 *
 * Explicit rather than inferred, because a scenario's `category` is a topic pool
 * (reused by vocabulary and the Study join) and is not fine-grained enough to
 * carry a journey: `interview_arzt` is filed under `work`, and
 * `pruefung_anmeldung` under `official`, but the learner meets them at very
 * different points. `JOURNEY_STAGE_FALLBACK` below still places anything not
 * listed here.
 */
const SCENARIO_STAGE: Record<string, JourneyStage> = {
  // 1 · You land.
  airport_arrival: 'arrival',
  train_station: 'arrival',
  train_first_ride: 'arrival',

  // 2 · Your first words, before any errand works.
  first_greetings: 'first_words',
  numbers_and_prices: 'first_words',
  letters_and_forms: 'first_words',

  // 3 · The ordinary day.
  supermarket_checkout: 'everyday',
  bakery_shopping: 'everyday',
  cafe_order: 'everyday',
  restaurant_besonders: 'everyday',
  friend_catchup: 'everyday',
  kollegen_smalltalk: 'everyday',
  betriebs_kantine: 'everyday',
  tech_kuechenpause: 'everyday',

  // 4 · A roof.
  apartment_viewing: 'home',
  wohnung_besichtigen_tiefer: 'home',
  mietvertrag_uebergabe: 'home',
  landlord_followup: 'home',

  // 5 · The authorities, in the order they usually arrive.
  anmeldung_buergeramt: 'official',
  termin_online_buchen: 'official',
  banking_first_visit: 'official',
  pass_und_dokumente: 'official',
  pruefung_anmeldung: 'official',
  anerkennung_gespraech: 'official',
  anerkennung_it_zertifikate: 'official',

  // 6 · Your body, and the people who look after it.
  krankenkasse_anmelden: 'health',
  doctor_visit: 'health',
  gesundheit_alltag: 'health',
  patient_conversation_basics: 'health',
  station_uebergabe: 'health',

  // 7 · The job itself.
  erster_arbeitstag: 'work',
  ausbildung_alltag: 'work',
  berufsschule_tag: 'work',
  pruefungstag: 'work',
  bewerbung_ausbildung: 'work',
  buero_gespraech_tiefer: 'work',
  daily_standup: 'work',
  support_ticket: 'work',

  // 8 · Getting the job: the interview room, whatever the field.
  job_interview: 'professional',
  interview_pflegefachkraft: 'professional',
  interview_arzt: 'professional',
  interview_it_fachkraft: 'professional',
  interview_entwickler: 'professional',
};

/**
 * Where a situation nobody listed lands.
 *
 * Two levels, cheapest first: an id prefix for the families that are a stage of
 * their own, then the category. A new `travel` scenario therefore joins the
 * arrival chain by itself, which is the point — content grows without this file
 * becoming a bottleneck, and without a new scenario silently sorting to the end.
 */
const CATEGORY_STAGE: Record<string, JourneyStage> = {
  travel: 'arrival',
  basics: 'first_words',
  daily_life: 'everyday',
  food: 'everyday',
  services: 'everyday',
  housing: 'home',
  official: 'official',
  visa: 'official',
  study: 'official',
  health: 'health',
  work: 'work',
  trades: 'work',
  career: 'professional',
  exam: 'exam',
};

/** The stage a scenario belongs to, by name if known, else by prefix then category. */
export function journeyStageFor(id: string, category?: string | null): JourneyStage {
  const key = String(id ?? '');
  const known = SCENARIO_STAGE[key];
  if (known) return known;
  if (key.startsWith('exam_')) return 'exam';
  if (key.startsWith('interview_')) return 'professional';
  if (key.startsWith('anerkennung_')) return 'official';
  if (key.startsWith('pruefung_') || key.startsWith('exam')) return 'official';
  const byCategory = CATEGORY_STAGE[String(category ?? '').toLowerCase()];
  return byCategory ?? 'other';
}

/**
 * The order inside a stage, for the situations whose sequence the learner feels.
 *
 * Only stages where order genuinely carries meaning are listed. Anything absent
 * keeps the author's own `sequence_order`, then falls back to its id so the sort
 * is total: the same list always produces the same screen, whatever order the
 * database happened to return it in.
 */
const ORDER_WITHIN_STAGE: Partial<Record<JourneyStage, string[]>> = {
  arrival: ['airport_arrival', 'train_station', 'train_first_ride'],
  first_words: ['first_greetings', 'numbers_and_prices', 'letters_and_forms'],
  everyday: [
    'supermarket_checkout',
    'bakery_shopping',
    'cafe_order',
    'restaurant_besonders',
    'friend_catchup',
    'kollegen_smalltalk',
    'betriebs_kantine',
    'tech_kuechenpause',
  ],
  home: ['apartment_viewing', 'wohnung_besichtigen_tiefer', 'mietvertrag_uebergabe', 'landlord_followup'],
  official: [
    'anmeldung_buergeramt',
    'termin_online_buchen',
    'banking_first_visit',
    'pass_und_dokumente',
    'pruefung_anmeldung',
    'anerkennung_gespraech',
    'anerkennung_it_zertifikate',
  ],
  health: [
    'krankenkasse_anmelden',
    'doctor_visit',
    'gesundheit_alltag',
    'patient_conversation_basics',
    'station_uebergabe',
  ],
  work: [
    'erster_arbeitstag',
    'ausbildung_alltag',
    'berufsschule_tag',
    'pruefungstag',
    'bewerbung_ausbildung',
    'buero_gespraech_tiefer',
    'daily_standup',
    'support_ticket',
  ],
  professional: [
    'job_interview',
    'interview_pflegefachkraft',
    'interview_arzt',
    'interview_it_fachkraft',
    'interview_entwickler',
  ],
  exam: [
    'exam_sich_vorstellen',
    'exam_erfahrungen_sprechen',
    'exam_gemeinsam_planen',
    'exam_thema_praesentieren',
    'exam_auf_partner_reagieren',
  ],
};

/** Rank of an id inside its stage: the named sequence first, then authored order. */
function rankWithinStage(stage: JourneyStage, id: string, authored: number | null | undefined): number {
  const named = ORDER_WITHIN_STAGE[stage];
  const at = named ? named.indexOf(id) : -1;
  if (at !== -1) return at;
  const offset = named ? named.length : 0;
  const sequence = typeof authored === 'number' && Number.isFinite(authored) ? authored : 0;
  return offset + sequence;
}

/**
 * The Trail's order, as a rule rather than a habit.
 *
 * Reorders only — nothing is hidden, and the «اعرض بقية المشاهد» control and the
 * level filter are untouched. This decides what the first screen is made of.
 *
 * Deterministic by construction: stage, then rank, then id. The input order does
 * not matter and is never read, which is what removes the dependency on whichever
 * order the object store happened to return.
 */
export function journeyOrderedScenarios<
  T extends { id: string; category?: string | null; sequence_order?: number | null },
>(scenarios: T[]): T[] {
  const stageRank = new Map<JourneyStage, number>(JOURNEY_STAGE_ORDER.map((stage, index) => [stage, index]));
  return [...(scenarios ?? [])].sort((a, b) => {
    const aStage = journeyStageFor(a?.id, a?.category);
    const bStage = journeyStageFor(b?.id, b?.category);
    const byStage = (stageRank.get(aStage) ?? JOURNEY_STAGE_ORDER.length) - (stageRank.get(bStage) ?? JOURNEY_STAGE_ORDER.length);
    if (byStage !== 0) return byStage;
    const byRank = rankWithinStage(aStage, a.id, a.sequence_order) - rankWithinStage(bStage, b.id, b.sequence_order);
    if (byRank !== 0) return byRank;
    return String(a.id).localeCompare(String(b.id));
  });
}
