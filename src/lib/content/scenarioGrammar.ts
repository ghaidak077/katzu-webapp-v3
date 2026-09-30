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
  first_greetings: ['g_a0_hallo_ich_heisse', 'g_a0_ich_bin_aus', 'g_a0_praesens_konjugation'],
  supermarket_checkout: ['g_a0_ich_moechte', 'g_a1_der_die_das_uebersicht', 'g_a1_negation_nicht_kein'],
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
  // Medical careers module (docs/content/curriculum-interview-medical.json, V21 Phase 5).
  interview_pflegefachkraft: ['g_med_perfekt_erfahrungen', 'g_med_sich_bewerben', 'g_med_relativsaetze_erfahrung'],
  interview_arzt: ['g_med_perfekt_erfahrungen', 'g_med_sich_bewerben', 'g_med_modal_vermutung'],
  patient_conversation_basics: ['g_med_wfragen_sprechstunde', 'g_med_ich_kann_helfen', 'g_med_patientenfragen', 'g_med_relativsaetze_erfahrung'],
  station_uebergabe: ['g_med_nachdem_vorzeitigkeit', 'g_med_passiv_verfahren', 'g_med_konjunktiv_hoeflich', 'g_med_modal_vermutung'],
  kollegen_smalltalk: ['g_med_wfragen_sprechstunde', 'g_med_konjunktiv_hoeflich'],
  anerkennung_gespraech: ['g_med_passiv_verfahren', 'g_med_konjunktiv_hoeflich'],
  // Tech careers module (docs/content/curriculum-interview-tech.json, V21 Phase 5).
  interview_it_fachkraft: ['g_tech_perfekt_arbeit', 'g_tech_seit_zeit', 'g_tech_modal_vermutung_tech'],
  interview_entwickler: ['g_tech_perfekt_arbeit', 'g_tech_seit_zeit', 'g_tech_relativsaetze_technik'],
  daily_standup: ['g_tech_du_im_team', 'g_tech_perfekt_arbeit', 'g_tech_trennbare_verben'],
  support_ticket: ['g_tech_wfragen_support', 'g_tech_hoeflich_kunde', 'g_tech_passiv_tech', 'g_tech_fuer_zweck'],
  tech_kuechenpause: ['g_tech_du_im_team', 'g_tech_trennbare_verben', 'g_tech_fuer_zweck'],
  anerkennung_it_zertifikate: ['g_tech_passiv_tech', 'g_tech_hoeflich_kunde'],
  // Ausbildung & exams module (docs/content/curriculum-ausbildung-exams.json, V21 Phase 5).
  bewerbung_ausbildung: ['g_ausb_moechte_werden', 'g_ausb_perfekt_bestanden', 'g_ausb_freu_mich_auf'],
  ausbildung_alltag: ['g_ausb_ich_muss_noch', 'g_ausb_wann_beginnt', 'g_ausb_nach_im'],
  berufsschule_tag: ['g_ausb_wenn_dann', 'g_ausb_perfekt_bestanden', 'g_ausb_nach_im'],
  pruefungstag: ['g_ausb_perfekt_bestanden', 'g_ausb_passiv_pruefung', 'g_ausb_falls_vorsichtig'],
  betriebs_kantine: ['g_ausb_wann_beginnt', 'g_ausb_wenn_dann'],
  pruefung_anmeldung: ['g_ausb_haette_frei', 'g_ausb_passiv_pruefung', 'g_ausb_falls_vorsichtig'],
  // Offline fixtures (src/lib/db/katzuDb.ts). The four rows they point at live in
  // docs/content/supplements/grammar-basics.json so production D1 has them too;
  // tests/grammarReachability.test.ts asserts the two copies are identical and
  // that no grammar row ships without a scenario pointing at it.
  cafe_order: ['g_polite_requests_a1', 'g_modal_moechte'],
  doctor_visit: ['g_polite_requests_a1'],
  apartment_viewing: ['g_articles_a1', 'g_a1_adjektivendung_bestimmt'],
  job_interview: ['g_verb_position_a1'],
  // Live in D1 but not in the offline fixture, so Guided Practice had no rule to
  // teach for it. Added in V14 against the same supplement row it can share.
  embassy_appointment: ['g_polite_requests_a1'],
  // Coverage-fix module (docs/content/curriculum-coverage-fix.json): the five
  // thin legacy pools get one dense scenario each; every row it ships is
  // reachable through these links.
  pass_und_dokumente: ['g_fix_bestimmte_artikel_a1', 'g_fix_zustaendig_fuer_a2', 'g_fix_weil_nachdem_b2'],
  restaurant_besonders: ['g_fix_moegen_moechte_a1', 'g_fix_akkusativ_objekt_a2'],
  gesundheit_alltag: ['g_fix_seit_dativ_b1', 'g_fix_sich_erholen_b1'],
  wohnung_besichtigen_tiefer: ['g_fix_bestimmte_artikel_a1', 'g_fix_akkusativ_objekt_a2'],
  buero_gespraech_tiefer: ['g_fix_weil_nachdem_b2', 'g_fix_passiv_prasens_b2'],
  // Exam-speaking module (docs/content/curriculum-exam-speaking.json, V23 §5.2).
  // Format practice in the style of DTZ / Goethe-ÖSD B1, original topics only.
  exam_sich_vorstellen: ['g_exam_wfragen_a1', 'g_exam_moechten_a1', 'g_exam_meinung_begruenden_b1'],
  exam_erfahrungen_sprechen: ['g_exam_seit_dativ_a2', 'g_exam_ich_habe_gemerkt_a2'],
  exam_gemeinsam_planen: ['g_exam_vorschlaege_machen_b1', 'g_exam_moechten_a1'],
  exam_thema_praesentieren: ['g_exam_wfragen_a1', 'g_exam_vorschlaege_machen_b1'],
  exam_auf_partner_reagieren: ['g_exam_meinung_begruenden_b1', 'g_exam_ich_habe_gemerkt_a2'],
};
