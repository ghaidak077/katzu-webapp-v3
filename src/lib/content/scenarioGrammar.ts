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
  // A0 foundations module (docs/content/curriculum-a0-foundations.json, V21 Phase 5).
  first_greetings: ['g_a0_hallo_ich_heisse', 'g_a0_ich_bin_aus'],
  supermarket_checkout: ['g_a0_ich_moechte', 'g_a1_der_die_das_uebersicht'],
  banking_first_visit: ['g_a0_hilfe_nicht_verstanden', 'g_a1_frage_wo_woher'],
  letters_and_forms: ['g_a1_buchstabieren_alphabet', 'g_a0_hilfe_nicht_verstanden'],
  train_first_ride: ['g_a1_frage_wo_woher', 'g_a1_zahlen_bis_zehn'],
  numbers_and_prices: ['g_a1_zahlen_bis_zehn', 'g_a1_der_die_das_uebersicht'],
  // German 30-day module 1 (docs/content/curriculum-30day-module1.json).
  // These five scenarios shipped ten grammar rows that no scenario pointed at:
  // with no `scenario_id` column in D1 and no entry here, Guided Practice had
  // nothing to teach for them — the same unreachable-content class as a
  // vocabulary topic no scenario resolves to.
  anmeldung_buergeramt: ['g_anmeldung_trennbar_a1', 'g_anmeldung_akkusativ_a1', 'g_anmeldung_verbposition_a1'],
  termin_online_buchen: ['g_termin_zeitangaben_a1', 'g_anmeldung_modal_a2'],
  krankenkasse_anmelden: ['g_kasse_zu_dativ_a2', 'g_kasse_perfekt_a2'],
  mietvertrag_uebergabe: ['g_miete_nebensatz_weil_a2', 'g_miete_wechselpraeposition_b1'],
  erster_arbeitstag: ['g_arbeit_hoeflich_b1'],
  // Arrival module 2 (docs/content/curriculum-arrival-module2.json)
  airport_arrival: ['g_koennen_sie_bitte_a1'],
  train_station: ['g_koennen_sie_bitte_a1', 'g_moechte_haette_gern_a1'],
  bakery_shopping: ['g_moechte_haette_gern_a1'],
  landlord_followup: ['g_koennten_hoefflich_a2', 'g_weil_nebensatz_a2'],
  friend_catchup: ['g_moechte_haette_gern_a1', 'g_weil_nebensatz_a2'],
  // Offline fixtures (src/lib/db/katzuDb.ts). The four rows they point at live in
  // docs/content/supplements/grammar-basics.json so production D1 has them too;
  // tests/grammarReachability.test.ts asserts the two copies are identical and
  // that no grammar row ships without a scenario pointing at it.
  cafe_order: ['g_polite_requests_a1', 'g_modal_moechte'],
  doctor_visit: ['g_polite_requests_a1'],
  apartment_viewing: ['g_articles_a1'],
  job_interview: ['g_verb_position_a1'],
  // Live in D1 but not in the offline fixture, so Guided Practice had no rule to
  // teach for it. Added in V14 against the same supplement row it can share.
  embassy_appointment: ['g_polite_requests_a1'],
};
