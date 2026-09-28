/**
 * Which grammar rows a scenario's Guided Practice may teach.
 *
 * The D1 `grammar` table has no scenario_id column, so there is no schema-level
 * link (and none may be added — see the B3 decisions). This map is the single
 * code-level source of truth instead: the all-roster test asserts against it
 * that every scenario resolves to at least one real grammar row.
 *
 * ids must exist in the curriculum (module drafts or the local fixture). When a
 * live D1 row wins over the fixture, only the id matters — the row itself is
 * authoritative.
 */
export const SCENARIO_GRAMMAR_IDS: Record<string, string[]> = {
  // Arrival module 2 (docs/content/curriculum-arrival-module2.json)
  airport_arrival: ['g_koennen_sie_bitte_a1'],
  train_station: ['g_koennen_sie_bitte_a1', 'g_moechte_haette_gern_a1'],
  bakery_shopping: ['g_moechte_haette_gern_a1'],
  landlord_followup: ['g_koennten_hoefflich_a2', 'g_weil_nebensatz_a2'],
  friend_catchup: ['g_moechte_haette_gern_a1', 'g_weil_nebensatz_a2'],
  // Offline fixtures (src/lib/db/katzuDb.ts)
  cafe_order: ['g_polite_requests_a1', 'g_modal_moechte'],
  doctor_visit: ['g_polite_requests_a1'],
  apartment_viewing: ['g_articles_a1'],
  job_interview: ['g_verb_position_a1'],
};
