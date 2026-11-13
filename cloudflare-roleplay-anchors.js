/**
 * OBJECTIVE ANCHORS + ARABIC GOALS — the data the server needs to police progress.
 *
 * WHY THIS EXISTS (2026-11-13)
 * The model used to be trusted on `objectives_done` outright. On the real A1 first
 * scenario it credited facts the learner never said, which made the header count a
 * conversation that had not happened. An objective now counts only when the
 * learner's OWN words (raw or as `understood_de` rewrote them) contain one of the
 * anchors below — a slot or a fact, in German, as the learner would say it.
 *
 * CONTRACT
 * - `OBJECTIVE_ANCHORS` is keyed by objective id, not by scenario: 174 distinct ids
 *   cover all 197 objectives, so one table is the whole policing layer.
 * - Anchors are lowercase substrings matched against a normalised learner string
 *   (umlauts folded, punctuation dropped), so «Miete» matches «miete» and
 *   «Kartenzahlung» matches «karte».
 * - `GOALS_AR` is the learner-facing one-sentence goal under the title. It is
 *   authored here, in Arabic, and generated into the client by
 *   `scripts/build-roleplay-goals.mjs`; the English `goal` stays the model's copy.
 * - `tests/roleplayPlans.test.ts` fails when a served scenario has no Arabic goal
 *   or an objective has no anchor, so this table cannot silently fall behind.
 */

/** Arabic one-sentence goal per served scenario id, shown as «مهمتك: …». */
export const GOALS_AR = {
  first_greetings: 'تعرّف على جارتك الجديدة، قدّم نفسك، واختم الحديث بأدب.',
  numbers_and_prices: 'اشترِ زجاجة ماء من الكشك وادفع ثمنها.',
  cafe_order: 'اطلب مشروباً وقطعة كيك في مقهى.',
  bakery_shopping: 'اشترِ رغيف خبز وقرصين صغيرين من المخبز.',
  supermarket_checkout: 'اشترِ قهوة وحليباً وسكراً من السوبرماركت.',
  restaurant_besonders: 'اطلب العشاء في مطعم واذكر طلباً خاصاً واحداً.',
  embassy_appointment: 'احصل على موعد لتجديد جواز سفرك.',
  pass_und_dokumente: 'أظهر جواز سفرك في المكتب وأجب عن أسئلة الموظفة.',
  airport_arrival: 'أبلغ عن حقيبة مفقودة في المطار.',
  train_station: 'اشترِ تذكرة قطار إلى ميونخ.',
  train_first_ride: 'اعرف القطار والرصيف الصحيحين لرحلتك الأولى.',
  anmeldung_buergeramt: 'سجّل عنوانك الجديد في مكتب التسجيل.',
  letters_and_forms: 'املأ استمارة مع الموظفة.',
  banking_first_visit: 'افتح حساباً بنكياً أساسياً.',
  pruefung_anmeldung: 'سجّل في امتحان لغة ألمانية.',
  apartment_viewing: 'شاهد شقة واسأل الأسئلة التي تحسم قرارك.',
  wohnung_besichtigen_tiefer: 'تحقّق من تفاصيل الشقة قبل أن تقرر.',
  mietvertrag_uebergabe: 'وقّع عقد الإيجار واستلم الشقة.',
  landlord_followup: 'اتصل بمالكة البيت لأن التدفئة معطّلة.',
  doctor_visit: 'اشرح أعراضك واحصل على نصيحة الطبيب.',
  termin_online_buchen: 'احجز موعداً عند الطبيب هاتفياً.',
  krankenkasse_anmelden: 'انتسب إلى تأمين صحي.',
  gesundheit_alltag: 'اشرح أعراضك واطلب وصفة طبية.',
  patient_conversation_basics: 'أنت الممرض: اعرف ما تحتاجه المريضة وطمئنها.',
  erster_arbeitstag: 'تجاوز ساعتك الأولى في عملك الجديد.',
  kollegen_smalltalk: 'تحدّث مع زميل وشاركه استراحة الغداء.',
  betriebs_kantine: 'اطلب غداءك في الكانتين وتحدّث عن يومك.',
  friend_catchup: 'تحدّث مع صديقة بعد غياب طويل.',
  station_uebergabe: 'سلّم مريضاً بوضوح عند تغيّر الوردية.',
  buero_gespraech_tiefer: 'ناقش مهامك ومسؤولياتك مع مديرتك.',
  daily_standup: 'قدّم تقرير حالة قصيراً وواضحاً في اجتماع الفريق اليومي.',
  support_ticket: 'أنت الدعم: اكتشف المشكلة وأعطِ العميلة خطوة واحدة واضحة.',
  tech_kuechenpause: 'تبادل حديثاً خفيفاً في مطبخ المكتب واتفق على الغداء.',
  bewerbung_ausbildung: 'تقدّم بطلب مكان تدريب مهني.',
  ausbildung_alltag: 'افهم أسبوعك الأول في الورشة.',
  berufsschule_tag: 'تحدّث مع زميل صف عن المدرسة المهنية.',
  pruefungstag: 'تجاوز الامتحان العملي وأجب عن أسئلة الممتحن.',
  anerkennung_gespraech: 'ابدأ معادلة شهادتك الأجنبية.',
  anerkennung_it_zertifikate: 'اعترف بشهادات تقنية المعلومات الخاصة بك.',
  job_interview: 'تجاوز مقابلة عمل.',
  interview_pflegefachkraft: 'اجرِ مقابلة لوظيفة في التمريض.',
  interview_arzt: 'اجرِ مقابلة لوظيفة طبيب.',
  interview_it_fachkraft: 'اجرِ مقابلة لوظيفة دعم تقني.',
  interview_entwickler: 'اجرِ مقابلة لوظيفة مطوّر برمجيات.',
  exam_sich_vorstellen: 'قدّم نفسك على طريقة الامتحان الشفهي.',
  exam_erfahrungen_sprechen: 'تحدّث عن تجربتك في تعلّم الألمانية.',
  exam_gemeinsam_planen: 'خطّط رحلة مع شريك الامتحان.',
  exam_thema_praesentieren: 'اعرض مكاناً في مدينتك على طريقة الامتحان الشفهي.',
  exam_auf_partner_reagieren: 'تفاعل مع عبارات شريكك عن الحياة اليومية في ألمانيا.',
};

/**
 * German anchors per objective id. One match credits the objective; two or more
 * are never required, because a beginner says the shortest thing that works.
 */
export const OBJECTIVE_ANCHORS = {
  // ── greetings, identity, politeness ────────────────────────────────────────
  greet_and_name: ['hallo', 'guten tag', 'guten morgen', 'ich heiße', 'mein name', 'ich bin'],
  say_origin: ['aus ', 'komme', 'komm aus', 'wohne in', 'ursprünglich'],
  say_you_live_here: ['wohne', 'lebe', 'seit', 'hier', 'mieter'],
  say_goodbye: ['tschüss', 'wiedersehen', 'bis bald', 'bis später', 'schönen tag', 'gute nacht', 'ciao'],
  thank_him: ['danke', 'dankeschön', 'vielen dank'],
  thank_and_leave: ['danke', 'dankeschön', 'vielen dank', 'tschüss', 'wiedersehen'],
  thank_and_finish: ['danke', 'dankeschön', 'vielen dank'],
  confirm_and_thank: ['danke', 'dankeschön', 'in ordnung', 'okay', 'passt'],
  answer_about_work: ['ich arbeite', 'arbeit', 'beruf', 'stelle', 'firma', 'als '],
  introduce_yourself: ['ich heiße', 'mein name', 'ich bin', 'komme aus', 'ich arbeite'],
  say_speciality: ['ich bin', 'fachkraft', 'spezialist', 'schwerpunkt', 'bereich', 'entwickle', 'arbeite als'],
  name_and_origin: ['ich heiße', 'mein name', 'komme aus', 'aus '],
  job_or_course: ['ich arbeite', 'kurs', 'ausbildung', 'studium', 'lerne', 'beruf'],
  why_german: ['weil', 'um zu', 'brauche', 'arbeit', 'studium', 'prüfung'],
  one_hobby: ['hobby', 'spiele', 'lese', 'sport', 'musik', 'wandern', 'gern'],

  // ── shopping, money, food ─────────────────────────────────────────────────
  say_what_you_want: ['ich möchte', 'ich will', 'hätte gern', 'kaufe', 'bräuchte', 'bekomme'],
  say_what_you_need: ['ich brauche', 'brauche', 'möchte', 'kaufe'],
  say_the_number: ['eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'zwanzig', 'euro', 'cent'],
  give_quantity: ['zwei', 'drei', 'vier', 'fünf', 'halb', 'stück', 'gramm', 'kilo', 'ein kilo'],
  pay: ['zahle', 'bezahle', 'zahlen', 'kostet', 'macht das', 'bitte zahlen'],
  pay_and_thank: ['zahle', 'bezahle', 'bar', 'karte', 'danke'],
  pay_by_card: ['karte', 'kartenzahlung', 'ec', 'kreditkarte', 'bargeld'],
  ask_the_price: ['kostet', 'kosten', 'preis', 'teuer', 'wie viel', 'was macht'],
  ask_monthly_fee: ['gebühr', 'kosten', 'monatlich', 'pro monat', 'kostet'],
  ask_fee: ['gebühr', 'kostet', 'kosten', 'preis', 'euro'],
  order_drink: ['kaffee', 'tee', 'wasser', 'saft', 'cola', 'bier', 'limonade', 'schokolade', 'getränk'],
  order_food: ['kuchen', 'brot', 'brötchen', 'essen', 'suppe', 'salat', 'pasta', 'pizza', 'sandwich', 'frühstück'],
  order_dish: ['ich nehme', 'ich möchte', 'gericht', 'essen', 'bestelle'],
  special_wish: ['ohne', 'keine', 'vegetarisch', 'allergie', 'leider', 'nicht'],
  ask_for_bill: ['rechnung', 'zahlen', 'bezahlen', 'zusammen', 'getrennt'],
  ask_where: ['wo ', 'wo ist', 'wo finde ich', 'welches regal', 'abteilung'],
  ask_included: ['inbegriffen', 'inklusive', 'enthalten', 'nebenkosten', 'warmmiete'],
  ask_rent: ['miete', 'kaltmiete', 'warmmiete', 'nebenkosten', 'monatlich', 'kostet'],
  ask_size: ['quadratmeter', 'qm', 'zimmer', 'groß', 'größe'],
  ask_move_in: ['einziehen', 'einzug', 'frei', 'ab wann', 'wann kann'],
  say_interested: ['interessiert', 'interessant', 'gefällt', 'nehme', 'passt', 'gern'],
  ask_heating: ['heizung', 'geheizt', 'gas', 'strom', 'abschlag', 'nebenkosten'],
  ask_kitchen_bath: ['küche', 'bad', 'badezimmer', 'dusche', 'wanne', 'ebk'],
  ask_contract_length: ['vertrag', 'laufzeit', 'jahre', 'monate', 'kündigen'],
  ask_deposit: ['kaution', 'anzahlung', 'deposit', 'zahlen'],
  ask_handover_date: ['übergabe', 'schlüssel', 'datum', 'wann', 'einziehen'],
  ask_what_to_repair: ['streichen', 'renovieren', 'reparieren', 'malern', 'bohren', 'schäden'],
  confirm_keys: ['schlüssel', 'erhalten', 'bekommen', 'habe ich', 'danke'],

  // ── housing problems ─────────────────────────────────────────────────────
  describe_problem: ['heizung', 'kaputt', 'defekt', 'kalt', 'läuft nicht', 'funktioniert nicht', 'problem', 'wasser'],
  ask_repair: ['reparieren', 'handwerker', 'kommt', 'techniker', 'wann kann'],
  agree_time: ['morgen', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'uhr', 'um ', 'passt', 'gern'],

  // ── health ───────────────────────────────────────────────────────────────
  say_what_hurts: ['schmerzen', 'tut weh', 'weh', 'kopf', 'bauch', 'hals', 'rücken', 'zahn', 'fieber', 'husten'],
  say_since_when: ['seit', 'gestern', 'tagen', 'woche', 'wochen', 'montag'],
  say_how_long: ['seit', 'tage', 'wochen', 'monate', 'lange'],
  ask_what_to_do: ['was kann ich', 'was soll ich', 'was mache ich', 'hilft', 'rat'],
  ask_sick_note: ['krankschreibung', 'krankmeldung', 'bescheinigung', 'attest', 'arbeit'],
  ask_prescription: ['rezept', 'medikament', 'tabletten', 'verschreiben', 'apotheke'],
  ask_stay_home: ['zu hause', 'arbeit', 'krank', 'bleiben', 'bett'],
  describe_symptoms: ['schmerzen', 'husten', 'fieber', 'schnupfen', 'weh', 'schwindel', 'übel', 'müde'],
  say_you_need_appointment: ['termin', 'brauche', 'möchte', 'vereinbaren'],
  ask_what_you_need: ['unterlagen', 'dokumente', 'brauche', 'mitbringen', 'papiere'],
  say_which_day: ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'morgen', 'vormittag', 'nachmittag'],
  give_name: ['ich heiße', 'mein name', 'name ist'],
  confirm_appointment: ['uhr', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'stimmt', 'genau'],
  say_you_want_to_join: ['beitreten', 'mitglied', 'versichern', 'krankenkasse', 'anmelden'],
  ask_when_starts: ['wann', 'beginnt', 'gilt', 'startet', 'ab wann'],
  ask_card: ['karte', 'versichertenkarte', 'bekomme', 'erhalte'],
  greet_and_ask: ['hallo', 'guten tag', 'wie geht', 'was fehlt', 'was ist los', 'kann ich helfen'],
  ask_where_it_hurts: ['wo ', 'weh', 'schmerzen', 'tut es'],
  ask_since_when: ['seit', 'wann', 'lange'],
  reassure_next: ['keine sorge', 'gleich', 'ruhig', 'ich kümmere', 'arzt kommt', 'wir schauen'],

  // ── work, training, interviews ───────────────────────────────────────────
  ask_workplace: ['arbeitsplatz', 'wo ', 'abteilung', 'schreibtisch', 'büro'],
  ask_who_helps: ['wer hilft', 'ansprechpartner', 'fragen', 'kollege', 'einlernen'],
  ask_about_her: ['wie ', 'was machst du', 'arbeit', 'magst du', 'wie lange'],
  ask_about_him: ['wie ', 'was machst du', 'woche', 'arbeit', 'wie geht'],
  ask_about_her_life: ['familie', 'arbeit', 'kinder', 'wohnst du', 'wie geht'],
  say_what_you_like: ['gefällt', 'mag', 'gut', 'gern', 'interessant'],
  accept_lunch: ['gern', 'gerne', 'komme mit', 'bin dabei', 'abgemacht', 'klar'],
  ask_time: ['wann', 'uhr', 'wie viel uhr', 'zeit'],
  ask_break: ['pause', 'wann', 'uhr', 'mittag'],
  say_about_day: ['tag war', 'war gut', 'anstrengend', 'viel zu tun', 'war okay', 'stressig'],
  sit_together: ['zusammen', 'setzen', 'platz', 'gern', 'hier'],
  say_what_you_do_now: ['ich arbeite', 'ich mache', 'ausbildung', 'kurs', 'studium', 'seit'],
  suggest_meeting: ['treffen', 'wiedersehen', 'samstag', 'sonntag', 'kaffee', 'mal wieder'],
  describe_tasks: ['aufgabe', 'mache', 'zuständig', 'projekt', 'team', 'bearbeite'],
  raise_problem: ['problem', 'schwierig', 'zeit', 'fehlt', 'zu viel', 'frage'],
  ask_decision: ['entscheiden', 'entscheidung', 'meinung', 'was meinen sie', 'sollen wir'],
  agree_next_steps: ['nächste', 'schritt', 'montag', 'mache ich', 'abgemacht', 'einverstanden'],
  say_yesterday: ['gestern', 'habe', 'gemacht', 'erledigt', 'fertig'],
  say_today: ['heute', 'werde', 'mache', 'schaue', 'fertig', 'weiter'],
  name_blocker: ['blockiert', 'problem', 'warte', 'brauche', 'hilfe', 'fehlt', 'zugang'],
  ask_short_question: ['frage', 'wie ', 'wann', 'wer ', 'können wir', 'ist das'],
  report_state: ['patient', 'zustand', 'stabil', 'kreislauf', 'fieber', 'schmerzen', 'bewusstsein'],
  report_changes: ['nacht', 'seit gestern', 'verändert', 'besser', 'schlechter', 'neu', 'fieber'],
  say_recommendation: ['empfehle', 'würde', 'vorschlag', 'mrt', 'kontrolle', 'blut', 'medikament'],
  answer_question: ['weil', 'seit gestern', 'seit ', 'genau', 'ungefähr', 'zum beispiel'],
  ask_what_happens: ['was passiert', 'wenn sie', 'startet', 'wie ', 'problem'],
  ask_what_tried: ['versucht', 'schon gemacht', 'neu gestartet', 'ausgeschaltet', 'kabel'],
  give_one_step: ['drücken', 'starten', 'klicken', 'stecker', 'warten', 'versuchen sie', 'bitte'],
  say_next_step: ['wenn das nicht', 'dann', 'rufen sie', 'melden', 'nochmal', 'zurücksetzen'],
  say_what_you_work_on: ['arbeite an', 'projekt', 'feature', 'code', 'bug', 'gerade'],
  say_weekend: ['wochenende', 'samstag', 'sonntag', 'war', 'werde', 'familie'],
  agree_lunch: ['mittag', 'uhr', 'gern', 'zusammen', 'abgemacht'],
  say_why_job: ['weil', 'interessiert', 'lernen', 'motivation', 'beruf', 'chance'],
  ask_training: ['ausbildung', 'ablauf', 'wie lange', 'schule', 'berufsschule', 'organisiert'],
  ask_school: ['berufsschule', 'schule', 'tage', 'block', 'wann'],
  ask_what_you_learn: ['lerne', 'zuerst', 'was ', 'grundlagen', 'maschinen', 'sicherheit'],
  say_what_you_know: ['ich kann', 'kenne', 'schon gemacht', 'erfahrung', 'gelernt'],
  ask_who_shows: ['wer zeigt', 'wer erklärt', 'einlernen', 'kollege', 'meister'],
  say_how_you_find_it: ['finde', 'gut', 'schwer', 'interessant', 'gefällt', 'anstrengend'],
  name_difficult_subject: ['mathe', 'mathematik', 'deutsch', 'fach', 'schwer', 'schwierig'],
  ask_his_experience: ['wie machst du', 'wie schaffst du', 'wie lernst du', 'tipp', 'du '],
  suggest_studying: ['zusammen', 'lernen', 'üben', 'treffen', 'gern'],
  say_you_are_ready: ['bereit', 'kann anfangen', 'fertig', 'los geht'],
  describe_task: ['aufgabe', 'gemacht', 'geprüft', 'montiert', 'gemessen', 'zuerst', 'dann'],
  explain_why: ['weil', 'deshalb', 'darum', 'grund', 'damit'],
  say_qualification: ['diplom', 'abschluss', 'studium', 'ausbildung', 'zertifikat', 'anerkennung'],
  say_where_from: ['aus ', 'staat', 'universität', 'jahr', 'abgeschlossen'],
  ask_duration: ['wie lange', 'dauert', 'monate', 'wochen', 'zeit'],
  name_certificates: ['zertifikat', 'schein', 'prüfung', 'ccna', 'microsoft', 'zertifikate'],
  say_what_they_cover: ['netzwerk', 'sicherheit', 'systeme', 'inhalt', 'themen', 'umfasst'],
  ask_translation: ['übersetzung', 'übersetzt', 'beglaubigt', 'deutsch', 'nötig'],
  ask_next_step: ['was passiert', 'nächste', 'schritt', 'wie weiter', 'wann'],
  describe_experience: ['erfahrung', 'jahre', 'gearbeitet', 'gemacht', 'projekt', 'bei '],
  why_this_company: ['weil', 'firma', 'team', 'interessiert', 'produkt', 'chance'],
  ask_question: ['frage', 'wie ', 'wann', 'wer ', 'team', 'aufgabe'],
  describe_nursing_experience: ['pflege', 'patienten', 'station', 'jahre', 'erfahrung', 'ausbildung'],
  answer_shifts: ['schicht', 'nachtdienst', 'bereit', 'flexibel', 'wochenende'],
  answer_language: ['deutsch', 'b2', 'sprachkurs', 'lerne', 'verstehen', 'prüfung'],
  ask_department: ['abteilung', 'station', 'team', 'wie viele', 'welche'],
  introduce_skills: ['ich kann', 'kenne', 'erfahrung', 'support', 'netzwerk', 'systeme'],
  describe_task_solved: ['problem', 'gelöst', 'behoben', 'eingeführt', 'reduziert', 'projekt'],
  ask_about_team: ['team', 'wie viele', 'kollegen', 'zusammenarbeit', 'technologie'],
  answer_availability: ['ab sofort', 'ab dem', 'monat', 'verfügbar', 'kann beginnen'],
  describe_project: ['projekt', 'gebaut', 'entwickelt', 'app', 'website', 'mit '],
  how_you_work: ['team', 'zusammen', 'scrum', 'daily', 'review', 'kommunikation'],
  ask_process: ['wie ', 'deploy', 'release', 'prozess', 'pipeline', 'code'],

  // ── travel, official business ────────────────────────────────────────────
  say_why_you_came: ['termin', 'pass', 'reisepass', 'verlängern', 'abholen', 'brauche'],
  ask_for_appointment: ['termin', 'wann', 'frei', 'vereinbaren', 'bekommen'],
  ask_documents: ['unterlagen', 'dokumente', 'papiere', 'mitbringen', 'brauche'],
  say_you_have_passport: ['pass', 'reisepass', 'habe', 'dabei', 'hier'],
  say_how_long_you_stay: ['monate', 'jahre', 'wochen', 'bleibe', 'bis '],
  ask_what_else: ['noch', 'sonst', 'brauchen sie', 'fehlt', 'etwas'],
  say_suitcase_missing: ['koffer', 'nicht angekommen', 'fehlt', 'verloren', 'ist weg'],
  describe_suitcase: ['schwarz', 'blau', 'rot', 'groß', 'klein', 'koffer', 'hartschale'],
  give_flight_number: ['flug', 'flugnummer', 'nummer', 'lh', 'ab '],
  ask_when_it_arrives: ['wann', 'kommt', 'ankommen', 'später', 'morgen'],
  say_destination: ['nach ', 'möchte nach', 'fahrkarte', 'ticket', 'ziel'],
  ask_platform: ['gleis', 'bahnsteig', 'wo ', 'abfahrt'],
  buy_ticket: ['fahrkarte', 'ticket', 'kaufe', 'nehme', 'einfach', 'hin und zurück'],
  say_where_you_go: ['nach ', 'fahre', 'möchte nach', 'zug'],
  ask_departure_time: ['wann', 'abfahrt', 'fährt', 'uhr', 'zeit'],
  say_you_want_to_register: ['anmelden', 'anmeldung', 'ummelden', 'wohnung', 'adresse'],
  ask_confirmation: ['bestätigung', 'meldebescheinigung', 'wann', 'bekomme', 'brauche'],
  give_your_name: ['ich heiße', 'mein name', 'vorname', 'nachname', 'familienname'],
  spell_surname: ['buchstabier', 'doppel', 'wie in', 'großes', 'kleines'],
  say_nationality: ['aus ', 'staatsangehörigkeit', 'nationalität', 'syrisch', 'irakisch', 'ägyptisch'],
  ask_what_to_write: ['was soll ich', 'hier', 'feld', 'schreiben', 'eintragen'],
  confirm_form: ['vollständig', 'fertig', 'alles', 'ausgefüllt', 'stimmt'],
  confirm_registration: ['anmelden', 'angemeldet', 'bestätige', 'ja', 'prüfung'],
  greet_and_ask_her: ['hallo', 'guten tag', 'wie geht', 'lange nicht', 'wie geht es dir'],
  say_you_want_account: ['konto', 'eröffnen', 'girokonto'],
  say_which_exam: ['prüfung', 'b1', 'b2', 'a2', 'telc', 'goethe', 'anmelden'],
  ask_next_date: ['wann', 'termin', 'nächste', 'datum', 'prüfung'],

  // ── exam style ───────────────────────────────────────────────────────────
  what_is_easy: ['einfach', 'leicht', 'gut', 'verstehe', 'gefällt'],
  what_is_hard: ['schwer', 'schwierig', 'probleme', 'fällt mir', 'grammatik'],
  give_example: ['zum beispiel', 'beispiel', 'letzte woche', 'einmal', 'als ich'],
  ask_partner: ['wie ', 'und du', 'was meinst du', 'bei dir', 'erfahrung'],
  suggest_activity: ['wir könnten', 'vorschlag', 'zusammen', 'besuchen', 'fahren', 'machen'],
  agree_day_time: ['samstag', 'sonntag', 'uhr', 'um ', 'passt', 'gern'],
  agree_meeting_point: ['treffen', 'bahnhof', 'eingang', 'vor ', 'wo ', 'treffpunkt'],
  confirm_plan: ['also', 'zusammenfassung', 'treffen uns', 'abgemacht', 'genau'],
  say_where_it_is: ['liegt', 'in der', 'im zentrum', 'neben', 'stadtteil', 'straße'],
  what_you_can_do: ['kann man', 'möglich', 'besichtigen', 'essen', 'spazieren', 'museum'],
  reason_to_visit: ['weil', 'lohnt', 'besonders', 'bekannt', 'schön', 'geschichte'],
  agree_or_disagree: ['stimme', 'finde ich', 'anders', 'recht', 'meiner meinung'],
  own_example: ['bei mir', 'zum beispiel', 'ich ', 'erfahrung', 'meine'],
  ask_follow_up: ['wie ', 'was meinst du', 'warum', 'und du', 'findest du'],
  summarise: ['also', 'zusammenfassend', 'insgesamt', 'meine meinung', 'finde ich'],
  answer_question: ['weil', 'genau', 'seit ', 'zum beispiel', 'meiner meinung'],
};

/** Lowercase, umlauts folded, punctuation dropped — the form anchors match against. */
export function normalizeClaimText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9#\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The anchors that can credit one objective, objective-level `words` first. */
export function anchorsForObjective(objective) {
  const extra = Array.isArray(objective?.words) ? objective.words : [];
  const known = OBJECTIVE_ANCHORS[objective?.id] || [];
  return [...extra, ...known].map((word) => normalizeClaimText(word)).filter(Boolean);
}

/**
 * True when the learner's own words support crediting this objective.
 *
 * Both strings are checked: the raw sentence (so a correct answer counts even when
 * the model left `understood_de` empty) and the model's `understood_de` rewrite
 * (so a typo the learner made in the right word still counts). Nothing else can
 * credit an objective — not the persona's line, not the model's opinion.
 */
export function claimSupportedByText(objective, ...texts) {
  const anchors = anchorsForObjective(objective);
  if (anchors.length === 0) return false;
  const normalized = texts.map(normalizeClaimText).filter(Boolean);
  if (normalized.length === 0) return false;
  return anchors.some((anchor) =>
    normalized.some((text) => text === anchor || text.includes(anchor)),
  );
}
