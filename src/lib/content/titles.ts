import type { UiLanguage } from '@/lib/i18n/languages';

/**
 * The learner-language titles of content the app owns.
 *
 * WHY THIS EXISTS
 * Every content row in D1 and in the offline seed carries one Arabic title
 * (`title_ar`). Arabic is the reference language, so an English or Indonesian
 * learner was reading «الطلب في المقهى» in the library, on the trail, in the
 * progress list, in the grammar path and on the session report — Arabic data in
 * an otherwise translated screen. The walkthrough in
 * `e2e/languageWalkthrough.spec.ts` recorded those screens, and this table is the
 * fix for what it recorded.
 *
 * WHY A TABLE AND NOT NEW COLUMNS YET
 * The content tables live in production D1, and loading new rows there needs the
 * owner's authorisation; a client table localizes what is already deployed
 * without a migration and without pretending a column exists. The resolver
 * already prefers `title_en`/`title_id` on the row when a future content load
 * brings them, so this table becomes a fallback rather than a dead end.
 *
 * WHAT IT COVERS
 * App-owned titles: the 45 scenarios of the curricula plus the four that only
 * exist in the offline seed, the ten units, and every grammar lesson. Study
 * material — phrase glosses, vocabulary meanings, grammar explanations — is the
 * content layer's own translation work and is not duplicated here.
 */

export interface LocalizedContentTitle {
  en: string;
  id: string;
}

type TitleRow = { id?: string; title_ar?: string; title_en?: string | null; title_id?: string | null };

/** Scenario id → title. Ids match `scenarios.id` in D1 and in the seed. */
export const SCENARIO_TITLES: Record<string, LocalizedContentTitle> = {
  airport_arrival: { en: 'At the airport: baggage', id: 'Di bandara: bagasi' },
  anerkennung_gespraech: {
    en: 'A meeting at the credential-recognition office',
    id: 'Percakapan di kantor pengakuan ijazah',
  },
  anerkennung_it_zertifikate: {
    en: 'Recognition: technical certificates from abroad',
    id: 'Pengakuan: sertifikat teknis dari luar negeri',
  },
  anmeldung_buergeramt: { en: "Registering at the residents' office", id: 'Mendaftar di kantor kependudukan' },
  apartment_viewing: { en: 'Viewing a flat', id: 'Melihat-lihat apartemen' },
  ausbildung_alltag: {
    en: 'A day of vocational training inside the plant',
    id: 'Sehari dalam pelatihan kerja di pabrik',
  },
  bakery_shopping: { en: 'At the bakery', id: 'Di toko roti' },
  banking_first_visit: { en: 'First visit to the bank', id: 'Kunjungan pertama ke bank' },
  berufsschule_tag: { en: 'Vocational school: a morning in class', id: 'Sekolah kejuruan: pagi di kelas' },
  betriebs_kantine: { en: 'Lunch break at the plant canteen', id: 'Jeda makan siang di kantin pabrik' },
  bewerbung_ausbildung: {
    en: 'Interview for a vocational training place',
    id: 'Wawancara untuk posisi pelatihan kerja',
  },
  buero_gespraech_tiefer: { en: 'At the office: tasks and responsibility', id: 'Di kantor: tugas dan tanggung jawab' },
  cafe_order: { en: 'Ordering at the café', id: 'Memesan di kafe' },
  daily_standup: { en: 'Daily team stand-up: a short report', id: 'Rapat harian tim: laporan singkat' },
  doctor_visit: { en: 'A visit to the doctor', id: 'Kunjungan ke dokter' },
  erster_arbeitstag: { en: 'First day at work', id: 'Hari pertama kerja' },
  exam_auf_partner_reagieren: {
    en: 'Practice: reacting to your partner (exam style)',
    id: 'Latihan: menanggapi pasangan bicara (gaya ujian)',
  },
  exam_erfahrungen_sprechen: {
    en: 'Practice: talking about experience (exam style)',
    id: 'Latihan: membicarakan pengalaman (gaya ujian)',
  },
  exam_gemeinsam_planen: {
    en: 'Practice: planning together (exam style)',
    id: 'Latihan: merencanakan bersama (gaya ujian)',
  },
  exam_sich_vorstellen: {
    en: 'Practice: introducing yourself (exam style)',
    id: 'Latihan: memperkenalkan diri (gaya ujian)',
  },
  exam_thema_praesentieren: {
    en: 'Practice: presenting a topic (exam style)',
    id: 'Latihan: memaparkan topik (gaya ujian)',
  },
  first_greetings: { en: 'First words: hello and goodbye', id: 'Kata pertama: halo dan selamat tinggal' },
  friend_catchup: { en: 'Catching up with a friend', id: 'Ngobrol dengan teman' },
  gesundheit_alltag: { en: 'At the doctor: symptoms and prescription', id: 'Ke dokter: gejala dan resep' },
  interview_arzt: { en: 'Job interview: doctor', id: 'Wawancara kerja: dokter' },
  interview_entwickler: { en: 'Job interview: software developer', id: 'Wawancara kerja: pengembang perangkat lunak' },
  interview_it_fachkraft: { en: 'Job interview: IT specialist', id: 'Wawancara kerja: spesialis TI' },
  interview_pflegefachkraft: { en: 'Job interview: registered nurse', id: 'Wawancara kerja: perawat terampil' },
  job_interview: { en: 'The job interview', id: 'Wawancara kerja' },
  kollegen_smalltalk: { en: 'Small talk with colleagues', id: 'Obrolan ringan dengan kolega' },
  krankenkasse_anmelden: { en: 'Signing up for health insurance', id: 'Mendaftar asuransi kesehatan' },
  landlord_followup: { en: 'A call with the landlord', id: 'Telepon dengan pemilik sewa' },
  letters_and_forms: { en: 'Spelling names and filling in forms', id: 'Mengeja nama dan mengisi formulir' },
  mietvertrag_uebergabe: { en: 'The lease and handing over the flat', id: 'Kontrak sewa dan serah terima apartemen' },
  numbers_and_prices: { en: 'Numbers and prices', id: 'Angka dan harga' },
  pass_und_dokumente: { en: 'Passport and travel documents', id: 'Paspor dan dokumen perjalanan' },
  patient_conversation_basics: { en: 'Talking with a patient', id: 'Berbicara dengan pasien' },
  pruefung_anmeldung: { en: 'Registering for the language exam', id: 'Mendaftar ujian bahasa' },
  pruefungstag: { en: 'Exam day: the practical and the oral', id: 'Hari ujian: praktik dan lisan' },
  restaurant_besonders: { en: 'At the restaurant: requests and questions', id: 'Di restoran: permintaan dan pertanyaan' },
  station_uebergabe: { en: 'Handing over a shift on the ward', id: 'Serah terima shift di bangsal' },
  supermarket_checkout: { en: 'At the supermarket: your first shopping', id: 'Di supermarket: belanja pertama' },
  support_ticket: { en: 'Customer support: a problem on the phone', id: 'Layanan pelanggan: masalah lewat telepon' },
  tech_kuechenpause: { en: 'A break in the tech-company kitchen', id: 'Istirahat di dapur perusahaan teknologi' },
  termin_online_buchen: { en: 'Booking an appointment', id: 'Memesan janji temu' },
  train_first_ride: { en: 'Your first train ride', id: 'Perjalanan kereta pertama' },
  train_station: { en: 'At the train station', id: 'Di stasiun kereta' },
  wohnung_besichtigen_tiefer: { en: 'The flat: details and moving in', id: 'Apartemen: detail dan pindahan' },
  // The welcome-message scene has no id in the curriculum audit; it is keyed by
  // its authored title so the seed's own row still resolves.
  'اكتب أول رسالة ترحيب': { en: 'Write your first greeting message', id: 'Tulis pesan sapaan pertamamu' },
};

/** Unit id → title, for the trail's chapter rows. */
export const UNIT_TITLES: Record<string, LocalizedContentTitle> = {
  'u1-first-words': { en: 'Your first words', id: 'Kata-kata pertamamu' },
  'u2-embassy-arrival': { en: 'From the embassy to Germany', id: 'Dari kedutaan ke Jerman' },
  'u3-paperwork': { en: 'Your paperwork and appointments', id: 'Dokumen dan urusanmu' },
  'u4-new-home': { en: 'A new home', id: 'Rumah baru' },
  'u5-health': { en: 'Your health and appointments', id: 'Kesehatan dan jadwalmu' },
  'u6-work-people': { en: 'Work and people', id: 'Kerja dan orang-orang' },
  'u7-office': { en: 'At the office', id: 'Di kantor' },
  'u8-training': { en: 'Training and recognising your certificate', id: 'Pelatihan dan pengakuan ijazahmu' },
  'u9-interviews': { en: 'Job interviews', id: 'Wawancara kerja' },
  'u10-exam-style': { en: 'Speaking in the exam style', id: 'Berbicara dengan gaya ujian' },
};

/** Grammar lesson id → title, for the grammar path. */
export const GRAMMAR_TITLES: Record<string, LocalizedContentTitle> = {
  // The four rows the app ships in its own offline seed (`katzuDb.ts`), so a
  // first launch with no sync already reads in the chosen language.
  g_polite_requests_a1: {
    en: 'Polite requests and questions (können)',
    id: 'Permintaan dan pertanyaan sopan (können)',
  },
  g_articles_a1: {
    en: 'Definite and indefinite articles (der, die, das)',
    id: 'Artikel tentu dan tak tentu (der, die, das)',
  },
  g_verb_position_a1: {
    en: 'Verb position in the main clause (position 2)',
    id: 'Posisi verba dalam klausa utama (posisi 2)',
  },
  g_modal_moechte: {
    en: 'Polite requests with möchte',
    id: 'Permintaan sopan dengan möchte',
  },
  g_a0_hallo_ich_heisse: { en: 'Introducing yourself: Ich heiße …', id: 'Memperkenalkan diri: Ich heiße …' },
  g_a0_hilfe_nicht_verstanden: {
    en: 'Survival phrases: Hilfe, ich verstehe nicht',
    id: 'Frasa penyelamat: Hilfe, ich verstehe nicht',
  },
  g_a0_ich_bin_aus: {
    en: 'Origin and home: Ich bin aus … / Ich wohne in …',
    id: 'Asal dan tempat tinggal: Ich bin aus … / Ich wohne in …',
  },
  g_a0_ich_moechte: { en: 'Polite requests: Ich möchte …', id: 'Permintaan sopan: Ich möchte …' },
  g_a1_buchstabieren_alphabet: { en: 'Spelling your name: das Alphabet', id: 'Mengeja nama: das Alphabet' },
  g_a1_der_die_das_uebersicht: { en: 'The three articles: der, die, das', id: 'Tiga artikel: der, die, das' },
  g_a1_frage_wo_woher: { en: 'Questions of place: wo and woher', id: 'Pertanyaan tempat: wo dan woher' },
  g_a1_zahlen_bis_zehn: { en: 'Numbers 1 to 10 and the price', id: 'Angka 1 sampai 10 dan harga' },
  g_anmeldung_akkusativ_a1: {
    en: 'The accusative (Akkusativ) after brauchen and haben',
    id: 'Kasus akusatif (Akkusativ) setelah brauchen dan haben',
  },
  g_anmeldung_modal_a2: { en: 'Modal verbs (müssen, können, möchten)', id: 'Kata kerja modal (müssen, können, möchten)' },
  g_anmeldung_trennbar_a1: { en: 'Separable verbs (anmelden, ausfüllen)', id: 'Kata kerja terpisah (anmelden, ausfüllen)' },
  g_anmeldung_verbposition_a1: {
    en: 'The verb in the main clause (second position)',
    id: 'Posisi kata kerja di kalimat utama (posisi kedua)',
  },
  g_arbeit_hoeflich_b1: { en: 'Polite requests (könnten, würden)', id: 'Permintaan sopan (könnten, würden)' },
  g_ausb_falls_vorsichtig: { en: 'Being cautious: falls + Konjunktiv', id: 'Berhati-hati: falls + Konjunktiv' },
  g_ausb_freu_mich_auf: { en: 'Looking forward: sich freuen auf + accusative', id: 'Menantikan: sich freuen auf + akusatif' },
  g_ausb_haette_frei: { en: 'Polite requests: hätten / könnten', id: 'Permintaan sopan: hätten / könnten' },
  g_ausb_ich_muss_noch: { en: 'Daily obligations: muss + infinitive', id: 'Kewajiban harian: muss + infinitif' },
  g_ausb_moechte_werden: { en: 'Career goal: Ich möchte … werden', id: 'Tujuan karier: Ich möchte … werden' },
  g_ausb_nach_im: { en: 'Time order: nach / im', id: 'Urutan waktu: nach / im' },
  g_ausb_passiv_pruefung: { en: 'The passive in the exam', id: 'Bentuk pasif dalam ujian' },
  g_ausb_perfekt_bestanden: { en: 'Success in the past: habe … bestanden', id: 'Keberhasilan di masa lalu: habe … bestanden' },
  g_ausb_wann_beginnt: { en: 'Appointments: Wann beginnt …?', id: 'Jadwal: Wann beginnt …?' },
  g_ausb_wenn_dann: { en: 'Conditions: wenn …, dann …', id: 'Syarat: wenn …, dann …' },
  g_exam_ich_habe_gemerkt_a2: { en: 'The clause after verbs of opinion', id: 'Klausa setelah kata kerja pendapat' },
  g_exam_meinung_begruenden_b1: { en: 'Opinion and justification', id: 'Pendapat dan alasannya' },
  g_exam_moechten_a1: { en: 'Expressing wishes with möchte', id: 'Menyatakan keinginan dengan möchte' },
  g_exam_seit_dativ_a2: { en: 'seit + dative for time', id: 'seit + datif untuk waktu' },
  g_exam_vorschlaege_machen_b1: { en: 'Making suggestions', id: 'Menyusun saran' },
  g_exam_wfragen_a1: { en: 'Question words: W-Fragen', id: 'Kata tanya: W-Fragen' },
  g_fix_akkusativ_objekt_a2: { en: 'The accusative article: einen / eine / ein', id: 'Artikel akusatif: einen / eine / ein' },
  g_fix_bestimmte_artikel_a1: { en: 'The definite article: der, die, das', id: 'Artikel tentu: der, die, das' },
  g_fix_moegen_moechte_a1: { en: 'Wishes: ich möchte', id: 'Keinginan: ich möchte' },
  g_fix_passiv_prasens_b2: { en: 'The passive: wird + Partizip II', id: 'Bentuk pasif: wird + Partizip II' },
  g_fix_seit_dativ_b1: { en: 'Duration: seit + dative', id: 'Durasi: seit + datif' },
  g_fix_sich_erholen_b1: { en: 'Reflexive verbs: sich erholen', id: 'Kata kerja refleksif: sich erholen' },
  g_fix_weil_nachdem_b2: { en: 'Cause and sequence: weil / nachdem', id: 'Sebab dan urutan: weil / nachdem' },
  g_fix_zustaendig_fuer_a2: {
    en: 'Responsibility: zuständig für + accusative',
    id: 'Tanggung jawab: zuständig für + akusatif',
  },
  g_kasse_perfekt_a2: { en: 'The perfect tense with haben and sein', id: 'Kala perfekt dengan haben dan sein' },
  g_kasse_zu_dativ_a2: { en: 'zu with the dative (zum Arzt, zur Kasse)', id: 'zu dengan datif (zum Arzt, zur Kasse)' },
  g_koennen_sie_bitte_a1: { en: 'Polite questions with Können Sie … ?', id: 'Pertanyaan sopan dengan Können Sie … ?' },
  g_koennten_hoefflich_a2: { en: 'The more polite form: Könnten Sie … ?', id: 'Bentuk lebih sopan: Könnten Sie … ?' },
  g_med_ich_kann_helfen: {
    en: 'A simple professional offer: Ich kann … / Ich helfe …',
    id: 'Tawaran profesional sederhana: Ich kann … / Ich helfe …',
  },
  g_med_konjunktiv_hoeflich: {
    en: 'Professional politeness: würde, hätte, könnte',
    id: 'Kesopanan profesional: würde, hätte, könnte',
  },
  g_med_modal_vermutung: {
    en: 'Assumption and obligation: muss, sollte, könnte sein',
    id: 'Dugaan dan kewajiban: muss, sollte, könnte sein',
  },
  g_med_nachdem_vorzeitigkeit: { en: 'Sequence in time: nachdem + perfect', id: 'Urutan waktu: nachdem + perfekt' },
  g_med_passiv_verfahren: { en: 'The passive: wird geprüft', id: 'Bentuk pasif: wird geprüft' },
  g_med_patientenfragen: { en: 'Patient questions: W-Fragen + clarity', id: 'Pertanyaan pasien: W-Fragen + kejelasan' },
  g_med_perfekt_erfahrungen: {
    en: 'Experience in the past: Perfekt and haben/sein',
    id: 'Pengalaman di masa lalu: Perfekt dan haben/sein',
  },
  g_med_relativsaetze_erfahrung: {
    en: 'Relative clauses: die Station, in der ich gearbeitet habe',
    id: 'Klausa relatif: die Station, in der ich gearbeitet habe',
  },
  g_med_sich_bewerben: {
    en: 'Verbs with prepositions: sich bewerben um / bei',
    id: 'Kata kerja dengan preposisi: sich bewerben um / bei',
  },
  g_med_wfragen_sprechstunde: {
    en: 'Short patient questions: W-Fragen in the present',
    id: 'Pertanyaan pasien singkat: W-Fragen dalam kala kini',
  },
  g_miete_nebensatz_weil_a2: { en: 'The subordinate clause with weil', id: 'Klausa bawahan dengan weil' },
  g_miete_wechselpraeposition_b1: { en: 'Two-way prepositions (in, auf)', id: 'Preposisi dua arah (in, auf)' },
  g_moechte_haette_gern_a1: { en: 'Expressing wishes: möchte / hätte gern', id: 'Menyatakan keinginan: möchte / hätte gern' },
  g_tech_du_im_team: { en: 'Inside the team: the du form', id: 'Di dalam tim: bentuk du' },
  g_tech_fuer_zweck: { en: 'Purpose and cause: für / an', id: 'Tujuan dan sebab: für / an' },
  g_tech_hoeflich_kunde: { en: 'Politeness with a client', id: 'Kesopanan dengan klien' },
  g_tech_modal_vermutung_tech: { en: 'Technical inference: muss / dürfte', id: 'Kesimpulan teknis: muss / dürfte' },
  g_tech_passiv_tech: { en: 'The passive in technical writing', id: 'Bentuk pasif dalam teks teknis' },
  g_tech_perfekt_arbeit: { en: 'Reporting work in the past: Perfekt', id: 'Melaporkan kerja di masa lalu: Perfekt' },
  g_tech_relativsaetze_technik: {
    en: 'Relative clauses in technical description',
    id: 'Klausa relatif dalam deskripsi teknis',
  },
  g_tech_seit_zeit: { en: 'Duration: seit + dative', id: 'Durasi: seit + datif' },
  g_tech_trennbare_verben: { en: 'Separable verbs', id: 'Kata kerja terpisah' },
  g_tech_wfragen_support: { en: 'Support questions: W-Fragen', id: 'Pertanyaan dukungan: W-Fragen' },
  g_termin_zeitangaben_a1: { en: 'Time prepositions (am, um, im)', id: 'Preposisi waktu (am, um, im)' },
  g_weil_nebensatz_a2: { en: 'The reason clause: weil', id: 'Klausa sebab: weil' },
};

/**
 * The title to render for a content row.
 *
 * Order: the row's own localized column (a future content load), then this
 * table by id, then by authored Arabic title, then the Arabic title itself. A
 * missing entry is never a reason to render an empty heading or a raw id — the
 * learner reads Arabic rather than `cafe_ordrer`.
 */
export function localizedTitle(
  row: TitleRow | null | undefined,
  table: Record<string, LocalizedContentTitle>,
  language: UiLanguage,
  fallback = '',
): string {
  if (!row && !fallback) return '';
  const arabic = row?.title_ar || fallback;
  if (language === 'ar') return arabic;
  const column = language === 'en' ? row?.title_en : row?.title_id;
  if (typeof column === 'string' && column.trim()) return column;
  const byId = row?.id ? table[row.id] : undefined;
  if (byId) return byId[language];
  const byTitle = arabic ? table[arabic] : undefined;
  if (byTitle) return byTitle[language];
  return arabic;
}

/** The scenario title in `language`; Arabic is the reference and the fallback. */
export function scenarioTitle(
  row: TitleRow | null | undefined,
  language: UiLanguage = 'ar',
): string {
  return localizedTitle(row, SCENARIO_TITLES, language);
}

/** The unit title in `language`. */
export function unitTitle(
  row: { id?: string; title_ar?: string } | null | undefined,
  language: UiLanguage = 'ar',
): string {
  return localizedTitle(row, UNIT_TITLES, language);
}

/** The grammar lesson title in `language`. */
export function grammarTitle(
  row: TitleRow | null | undefined,
  language: UiLanguage = 'ar',
): string {
  return localizedTitle(row, GRAMMAR_TITLES, language);
}

/** A scenario title by id alone, for call sites that only carry the id. */
export function scenarioTitleById(id: string, language: UiLanguage, fallbackAr = ''): string {
  return localizedTitle({ id, title_ar: fallbackAr }, SCENARIO_TITLES, language, fallbackAr);
}

/**
 * The three parts of the B1 speaking mock.
 *
 * The worker mints them in Arabic (`titleAr`/`briefAr`) because that is the
 * reference language of every content payload. Only the *framing* is localized
 * here: the examiner's own lines and the model's replies are generated turns and
 * stay in the content layer.
 */
export const MOCK_PARTS: Record<string, { title: LocalizedContentTitle; brief: LocalizedContentTitle }> = {
  plan: {
    title: { en: 'Part 1: planning with your conversation partner', id: 'Bagian 1: merencanakan dengan pasangan bicara' },
    brief: {
      en: 'Plan with your conversation partner and agree the details together.',
      id: 'Rencanakan bersama pasangan bicaramu dan sepakati detailnya bersama.',
    },
  },
  present: {
    title: { en: 'Part 2: presenting a topic', id: 'Bagian 2: memaparkan topik' },
    brief: {
      en: 'Present the given topic and say why you think so.',
      id: 'Paparkan topik yang diberikan dan sebutkan alasan pendapatmu.',
    },
  },
  react: {
    title: { en: 'Part 3: reacting to questions', id: 'Bagian 3: menanggapi pertanyaan' },
    brief: {
      en: 'Answer the questions and state your opinion clearly.',
      id: 'Jawab pertanyaannya dan sampaikan pendapatmu dengan jelas.',
    },
  },
};

interface MockPartRow {
  id?: string;
  titleAr?: string;
  briefAr?: string;
}

export function mockPartTitle(part: MockPartRow, language: UiLanguage): string {
  const ar = part.titleAr || '';
  if (language === 'ar') return ar;
  return MOCK_PARTS[part.id || '']?.title[language] ?? ar;
}

export function mockPartBrief(part: MockPartRow, language: UiLanguage): string {
  const ar = part.briefAr || '';
  if (language === 'ar') return ar;
  return MOCK_PARTS[part.id || '']?.brief[language] ?? ar;
}
