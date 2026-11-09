/**
 * SCENARIO PLANS — the data that replaced the conversation scripts (2026-11-08).
 *
 * WHY THIS FILE EXISTS
 * The practice chat used to be an app-owned script keyed by step: the app chose
 * the next question and a model supplied a reaction. On real input that failed
 * loudly — a learner's typo ("zwie", "mit kart") produced «Wie bitte?», a meta
 * sentence leaked into the chat, and an answer that had already been given was
 * asked again. The replacement is a normal AI conversation: one call per learner
 * turn, an LLM playing this persona, and these plans as its only briefing.
 *
 * CONTRACT
 * - One entry per SERVED scenario id (49). `scripts/audit-roleplay-plans.mjs`
 *   fails the gate when a served id is missing or a plan is malformed.
 * - `persona.gender` decides the Arabic forms; the prompt passes it verbatim.
 * - `objectives` are the only measure of progress: the header shows
 *   done/total, and the model may only close the scene when every objective is
 *   done. Ids are stable snake_case; descriptions are plain English (they are
 *   read by the model, never by the learner).
 * - `level` is the scenario's own design level (the unit it belongs to). The
 *   learner's session level still drives the word limit and vocabulary.
 *
 * Owner review: docs/agent/OWNER-CHECKLIST.md lists the flagged lines.
 */

/** Bump when the shape of a plan changes, not when a line is edited. */
export const ROLEPLAY_PLAN_VERSION = 1;

export const ROLEPLAY_PLANS = {
  // ── A1 · first words ──────────────────────────────────────────────────────
  first_greetings: {
    level: 'A1',
    persona: { name: 'Frau Meier', gender: 'female', role: 'your new neighbour in the building', personality: 'warm, curious, talks a little too much' },
    goal: 'Meet your new neighbour, say who you are, and end the chat politely.',
    objectives: [
      { id: 'greet_and_name', description: 'Greet her and say your name.' },
      { id: 'say_origin', description: 'Say where you come from.' },
      { id: 'say_you_live_here', description: 'Say that you live in this building now.' },
      { id: 'say_goodbye', description: 'Say goodbye in a friendly way.' },
    ],
  },
  numbers_and_prices: {
    level: 'A1',
    persona: { name: 'Herr Tunc', gender: 'male', role: 'kiosk seller on the corner', personality: 'quick, friendly, always busy' },
    goal: 'Buy a bottle of water at the kiosk and pay for it.',
    objectives: [
      { id: 'say_what_you_want', description: 'Say what you want to buy.' },
      { id: 'ask_the_price', description: 'Ask how much it costs.' },
      { id: 'say_the_number', description: 'Repeat the price as a number.' },
      { id: 'pay_and_thank', description: 'Pay and thank him.' },
    ],
  },
  cafe_order: {
    level: 'A1',
    persona: { name: 'Frau Weber', gender: 'female', role: 'waitress in a café', personality: 'cheerful, fast, a bit loud' },
    goal: 'Order a drink and a piece of cake in a café.',
    objectives: [
      { id: 'order_drink', description: 'Order a drink.' },
      { id: 'order_food', description: 'Order something to eat.' },
      { id: 'ask_for_bill', description: 'Ask for the bill.' },
      { id: 'say_goodbye', description: 'Say thank you and goodbye.' },
    ],
  },
  bakery_shopping: {
    level: 'A1',
    persona: { name: 'Herr Yildiz', gender: 'male', role: 'baker behind the counter', personality: 'brisk, friendly, proud of his bread' },
    goal: 'Buy a loaf of bread and two rolls at the bakery.',
    objectives: [
      { id: 'say_what_you_want', description: 'Say what you want to buy.' },
      { id: 'give_quantity', description: 'Say how many you want.' },
      { id: 'pay', description: 'Ask the price and pay.' },
      { id: 'say_goodbye', description: 'Thank him and say goodbye.' },
    ],
  },
  supermarket_checkout: {
    level: 'A1',
    persona: { name: 'Frau Novak', gender: 'female', role: 'cashier at the supermarket checkout', personality: 'matter-of-fact but kind' },
    goal: 'Buy coffee, milk and sugar at the supermarket.',
    objectives: [
      { id: 'say_what_you_need', description: 'Say what you need to buy.' },
      { id: 'ask_where', description: 'Ask where one of the products is.' },
      { id: 'pay_by_card', description: 'Ask whether you can pay by card.' },
      { id: 'thank_and_leave', description: 'Thank her and leave.' },
    ],
  },
  restaurant_besonders: {
    level: 'A1',
    persona: { name: 'Herr Albrecht', gender: 'male', role: 'waiter in a restaurant', personality: 'polite, attentive, slightly formal' },
    goal: 'Order dinner in a restaurant and explain one special wish.',
    objectives: [
      { id: 'order_drink', description: 'Order a drink.' },
      { id: 'order_dish', description: 'Order a dish.' },
      { id: 'special_wish', description: 'Say one special wish, for example no onions or vegetarian.' },
      { id: 'ask_for_bill', description: 'Ask for the bill and pay.' },
    ],
  },
  embassy_appointment: {
    level: 'A1',
    persona: { name: 'Herr Schmidt', gender: 'male', role: 'clerk at the German embassy', personality: 'formal, patient, precise' },
    goal: 'Get an appointment to renew your passport.',
    objectives: [
      { id: 'say_why_you_came', description: 'Say why you came.' },
      { id: 'ask_for_appointment', description: 'Ask for an appointment.' },
      { id: 'ask_documents', description: 'Ask which documents you need to bring.' },
      { id: 'confirm_and_thank', description: 'Confirm the appointment and thank him.' },
    ],
  },
  pass_und_dokumente: {
    level: 'A1',
    persona: { name: 'Frau Krüger', gender: 'female', role: 'officer at the foreigners office', personality: 'correct, reserved, not unfriendly' },
    goal: 'Show your passport at the office and answer the officer’s questions.',
    objectives: [
      { id: 'say_you_have_passport', description: 'Say that you have your passport with you.' },
      { id: 'say_how_long_you_stay', description: 'Say how long you are staying in Germany.' },
      { id: 'ask_what_else', description: 'Ask what else they need from you.' },
      { id: 'thank_and_leave', description: 'Thank her and say goodbye.' },
    ],
  },
  airport_arrival: {
    level: 'A1',
    persona: { name: 'Herr Nowak', gender: 'male', role: 'agent at the airport baggage counter', personality: 'calm, efficient, reassuring' },
    goal: 'Report your missing suitcase at the airport.',
    objectives: [
      { id: 'say_suitcase_missing', description: 'Say that your suitcase did not arrive.' },
      { id: 'describe_suitcase', description: 'Describe the suitcase: colour and size.' },
      { id: 'give_flight_number', description: 'Give your flight number.' },
      { id: 'ask_when_it_arrives', description: 'Ask when the suitcase will arrive.' },
    ],
  },
  train_station: {
    level: 'A1',
    persona: { name: 'Frau Petrov', gender: 'female', role: 'ticket clerk at the train station', personality: 'brisk, helpful, all business' },
    goal: 'Buy a train ticket to Munich.',
    objectives: [
      { id: 'say_destination', description: 'Say where you want to go.' },
      { id: 'ask_the_price', description: 'Ask how much the ticket costs.' },
      { id: 'ask_platform', description: 'Ask which platform the train leaves from.' },
      { id: 'buy_ticket', description: 'Buy the ticket and thank her.' },
    ],
  },
  train_first_ride: {
    level: 'A1',
    persona: { name: 'Herr Sommer', gender: 'male', role: 'railway employee on the platform', personality: 'helpful, patient, chatty' },
    goal: 'Find the right train and platform for your first trip.',
    objectives: [
      { id: 'say_where_you_go', description: 'Say where you want to travel.' },
      { id: 'ask_platform', description: 'Ask which platform you need.' },
      { id: 'ask_departure_time', description: 'Ask when the train leaves.' },
      { id: 'thank_him', description: 'Thank him and say goodbye.' },
    ],
  },
  anmeldung_buergeramt: {
    level: 'A1',
    persona: { name: 'Herr Lehmann', gender: 'male', role: 'clerk at the registration office', personality: 'formal, thorough, reads every field twice' },
    goal: 'Register your new address at the registration office.',
    objectives: [
      { id: 'say_you_want_to_register', description: 'Say that you want to register your address.' },
      { id: 'say_since_when', description: 'Say since when you have lived in the city.' },
      { id: 'ask_documents', description: 'Ask which documents you need.' },
      { id: 'ask_confirmation', description: 'Ask when you get the confirmation.' },
    ],
  },
  letters_and_forms: {
    level: 'A1',
    persona: { name: 'Frau Hahn', gender: 'female', role: 'clerk helping you fill in a form', personality: 'patient, repeats things slowly, kind' },
    goal: 'Fill in a form together with the clerk.',
    objectives: [
      { id: 'give_your_name', description: 'Say your full name slowly.' },
      { id: 'spell_surname', description: 'Spell your surname letter by letter.' },
      { id: 'say_nationality', description: 'Say your nationality.' },
      { id: 'ask_what_to_write', description: 'Ask what you should write in one field.' },
      { id: 'confirm_form', description: 'Confirm that the form is complete.' },
    ],
  },
  banking_first_visit: {
    level: 'A1',
    persona: { name: 'Herr Özdemir', gender: 'male', role: 'advisor at a bank', personality: 'friendly, clear, never rushes you' },
    goal: 'Open a basic bank account.',
    objectives: [
      { id: 'say_you_want_account', description: 'Say that you want to open an account.' },
      { id: 'ask_what_you_need', description: 'Ask which documents you need.' },
      { id: 'ask_monthly_fee', description: 'Ask about the monthly fee.' },
      { id: 'thank_and_leave', description: 'Thank him and say goodbye.' },
    ],
  },
  pruefung_anmeldung: {
    level: 'A1',
    persona: { name: 'Frau Roth', gender: 'female', role: 'clerk at the exam office', personality: 'precise, kind, used to nervous learners' },
    goal: 'Register for a German language exam.',
    objectives: [
      { id: 'say_which_exam', description: 'Say which exam and which level you want.' },
      { id: 'ask_next_date', description: 'Ask for the next exam date.' },
      { id: 'ask_fee', description: 'Ask how much the exam costs.' },
      { id: 'confirm_registration', description: 'Confirm the registration.' },
    ],
  },

  // ── A2 · home, health, work ───────────────────────────────────────────────
  apartment_viewing: {
    level: 'A2',
    persona: { name: 'Frau Klein', gender: 'female', role: 'landlady showing a flat', personality: 'friendly, businesslike, answers straight' },
    goal: 'View a flat and ask the questions that decide it.',
    objectives: [
      { id: 'ask_rent', description: 'Ask about the rent and the extra costs.' },
      { id: 'ask_size', description: 'Ask how big the flat is and how many rooms it has.' },
      { id: 'ask_move_in', description: 'Ask when you could move in.' },
      { id: 'say_interested', description: 'Say whether you are interested and why.' },
    ],
  },
  wohnung_besichtigen_tiefer: {
    level: 'A2',
    persona: { name: 'Herr Baumann', gender: 'male', role: 'landlord showing an empty flat', personality: 'relaxed, a bit proud of the flat, honest about problems' },
    goal: 'Check the flat’s details before you decide.',
    objectives: [
      { id: 'ask_included', description: 'Ask what is included in the rent.' },
      { id: 'ask_heating', description: 'Ask how the flat is heated and what the bills look like.' },
      { id: 'ask_kitchen_bath', description: 'Ask about the kitchen and the bathroom.' },
      { id: 'ask_contract_length', description: 'Ask how long the contract runs.' },
    ],
  },
  mietvertrag_uebergabe: {
    level: 'A2',
    persona: { name: 'Herr Wolf', gender: 'male', role: 'landlord signing the rental contract', personality: 'correct, slightly stiff, fair' },
    goal: 'Sign the rental contract and take over the flat.',
    objectives: [
      { id: 'ask_deposit', description: 'Ask about the deposit and how to pay it.' },
      { id: 'ask_handover_date', description: 'Ask when the handover takes place.' },
      { id: 'ask_what_to_repair', description: 'Ask what you have to paint or repair.' },
      { id: 'confirm_keys', description: 'Confirm that you received the keys.' },
    ],
  },
  landlord_followup: {
    level: 'A2',
    persona: { name: 'Frau Berger', gender: 'female', role: 'landlady on the phone', personality: 'impatient but fair, fixes things once she understands them' },
    goal: 'Call your landlady because the heating is broken.',
    objectives: [
      { id: 'describe_problem', description: 'Say what is broken.' },
      { id: 'say_since_when', description: 'Say since when it has been broken.' },
      { id: 'ask_repair', description: 'Ask when someone can come and repair it.' },
      { id: 'agree_time', description: 'Agree on a day and a time.' },
    ],
  },
  doctor_visit: {
    level: 'A2',
    persona: { name: 'Dr. Fischer', gender: 'male', role: 'general practitioner', personality: 'calm, kind, asks one thing at a time' },
    goal: 'Describe your symptoms and get advice from the doctor.',
    objectives: [
      { id: 'say_what_hurts', description: 'Say what hurts.' },
      { id: 'say_since_when', description: 'Say since when you have had the problem.' },
      { id: 'ask_what_to_do', description: 'Ask what you can do about it.' },
      { id: 'ask_sick_note', description: 'Ask for a sick note for work.' },
    ],
  },
  termin_online_buchen: {
    level: 'A2',
    persona: { name: 'Frau Neumann', gender: 'female', role: 'appointment desk at a practice', personality: 'efficient, friendly, keeps the call short' },
    goal: 'Book a doctor’s appointment by phone.',
    objectives: [
      { id: 'say_you_need_appointment', description: 'Say that you need an appointment.' },
      { id: 'say_which_day', description: 'Say which day suits you.' },
      { id: 'give_name', description: 'Give your name for the appointment.' },
      { id: 'confirm_appointment', description: 'Repeat the day and time to confirm.' },
    ],
  },
  krankenkasse_anmelden: {
    level: 'A2',
    persona: { name: 'Herr Kaiser', gender: 'male', role: 'clerk at a health insurance', personality: 'formal, helpful, explains slowly' },
    goal: 'Join a health insurance.',
    objectives: [
      { id: 'say_you_want_to_join', description: 'Say that you want to join the insurance.' },
      { id: 'ask_documents', description: 'Ask which documents are needed.' },
      { id: 'ask_when_starts', description: 'Ask when the coverage starts.' },
      { id: 'ask_card', description: 'Ask when you get the insurance card.' },
    ],
  },
  gesundheit_alltag: {
    level: 'A2',
    persona: { name: 'Dr. Lang', gender: 'female', role: 'doctor in a practice', personality: 'warm, brisk, practical' },
    goal: 'Describe your symptoms and ask for a prescription.',
    objectives: [
      { id: 'describe_symptoms', description: 'Describe your symptoms.' },
      { id: 'say_how_long', description: 'Say how long you have had them.' },
      { id: 'ask_prescription', description: 'Ask for a prescription.' },
      { id: 'ask_stay_home', description: 'Ask whether you should stay at home.' },
    ],
  },
  patient_conversation_basics: {
    level: 'A2',
    persona: { name: 'Frau Adler', gender: 'female', role: 'patient in hospital room twelve', personality: 'anxious, in pain, grateful for clear words' },
    goal: 'You are the nurse: find out what the patient needs and calm her down.',
    objectives: [
      { id: 'greet_and_ask', description: 'Greet her and ask what is wrong.' },
      { id: 'ask_where_it_hurts', description: 'Ask where it hurts.' },
      { id: 'ask_since_when', description: 'Ask since when she has had the pain.' },
      { id: 'reassure_next', description: 'Reassure her and say what happens next.' },
    ],
  },
  erster_arbeitstag: {
    level: 'A2',
    persona: { name: 'Herr Braun', gender: 'male', role: 'HR colleague on your first day', personality: 'welcoming, organised, a bit formal' },
    goal: 'Get through the first hour of your new job.',
    objectives: [
      { id: 'introduce_yourself', description: 'Introduce yourself and say what you do.' },
      { id: 'ask_workplace', description: 'Ask where your workplace is.' },
      { id: 'ask_who_helps', description: 'Ask who you can ask when you need help.' },
      { id: 'thank_him', description: 'Thank him and say you are happy to start.' },
    ],
  },
  kollegen_smalltalk: {
    level: 'A2',
    persona: { name: 'Jonas', gender: 'male', role: 'colleague from the early shift', personality: 'casual, friendly, always hungry' },
    goal: 'Chat with a colleague and join the lunch break.',
    objectives: [
      { id: 'answer_about_work', description: 'Say what you do and where you work.' },
      { id: 'say_what_you_like', description: 'Say one thing you like about the job.' },
      { id: 'accept_lunch', description: 'Accept the lunch invitation.' },
      { id: 'ask_time', description: 'Ask what time lunch is.' },
    ],
  },
  betriebs_kantine: {
    level: 'A2',
    persona: { name: 'Meltem', gender: 'female', role: 'apprentice in the canteen', personality: 'chatty, direct, easy to talk to' },
    goal: 'Order lunch in the canteen and talk about your day.',
    objectives: [
      { id: 'order_food', description: 'Say what you want to eat.' },
      { id: 'say_about_day', description: 'Say how your day was.' },
      { id: 'sit_together', description: 'Agree to sit together.' },
      { id: 'ask_about_her', description: 'Ask her one question about her work.' },
    ],
  },
  friend_catchup: {
    level: 'A2',
    persona: { name: 'Lena', gender: 'female', role: 'an old friend you have not seen for a while', personality: 'warm, curious, laughs easily' },
    goal: 'Catch up with a friend after a long time.',
    objectives: [
      { id: 'greet_and_ask_her', description: 'Greet her and ask how she is.' },
      { id: 'say_what_you_do_now', description: 'Say what you are doing now: job or course.' },
      { id: 'ask_about_her_life', description: 'Ask about her family or her work.' },
      { id: 'suggest_meeting', description: 'Suggest meeting again and agree on when.' },
    ],
  },

  // ── B1 · work, training, recognition ──────────────────────────────────────
  station_uebergabe: {
    level: 'B1',
    persona: { name: 'Dr. Weiss', gender: 'female', role: 'senior physician taking your handover', personality: 'focused, demanding, fair' },
    goal: 'Hand over a patient clearly at the shift change.',
    objectives: [
      { id: 'report_state', description: 'Report the patient’s current state.' },
      { id: 'report_changes', description: 'Say what changed overnight.' },
      { id: 'say_recommendation', description: 'Say what you recommend next.' },
      { id: 'answer_question', description: 'Answer one follow-up question about the patient.' },
    ],
  },
  buero_gespraech_tiefer: {
    level: 'B1',
    persona: { name: 'Frau Conrad', gender: 'female', role: 'your manager in the office', personality: 'direct, fair, wants clear answers' },
    goal: 'Discuss your tasks and responsibilities with your manager.',
    objectives: [
      { id: 'describe_tasks', description: 'Describe your current tasks.' },
      { id: 'raise_problem', description: 'Raise one problem or open point.' },
      { id: 'ask_decision', description: 'Ask her for a decision.' },
      { id: 'agree_next_steps', description: 'Agree on the next steps.' },
    ],
  },
  daily_standup: {
    level: 'B1',
    persona: { name: 'Pia', gender: 'female', role: 'Scrum master running the daily meeting', personality: 'brisk, organised, keeps everyone to two minutes' },
    goal: 'Give a short, clear status report in the daily meeting.',
    objectives: [
      { id: 'say_yesterday', description: 'Say what you did yesterday.' },
      { id: 'say_today', description: 'Say what you will do today.' },
      { id: 'name_blocker', description: 'Name one blocker or ask for help.' },
      { id: 'ask_short_question', description: 'Ask one short question about the plan.' },
    ],
  },
  support_ticket: {
    level: 'B1',
    persona: { name: 'Frau Berger', gender: 'female', role: 'customer calling support', personality: 'frustrated, polite, wants a fix now' },
    goal: 'You are support: find the problem and give the customer one clear step.',
    objectives: [
      { id: 'ask_what_happens', description: 'Ask what exactly happens when she starts the computer.' },
      { id: 'ask_what_tried', description: 'Ask what she has already tried.' },
      { id: 'give_one_step', description: 'Give one clear step she can do now.' },
      { id: 'say_next_step', description: 'Say what happens if the step does not work.' },
    ],
  },
  tech_kuechenpause: {
    level: 'B1',
    persona: { name: 'Jonas', gender: 'male', role: 'developer in the kitchen at work', personality: 'relaxed, funny, makes small talk easy' },
    goal: 'Make small talk in the office kitchen and agree on lunch.',
    objectives: [
      { id: 'say_what_you_work_on', description: 'Say what you are working on.' },
      { id: 'say_weekend', description: 'Say what you did or will do at the weekend.' },
      { id: 'ask_about_him', description: 'Ask him one question about his week.' },
      { id: 'agree_lunch', description: 'Agree on a time for lunch.' },
    ],
  },
  bewerbung_ausbildung: {
    level: 'B1',
    persona: { name: 'Herr Brenner', gender: 'male', role: 'trainer interviewing for an apprenticeship', personality: 'practical, warm, wants to see motivation' },
    goal: 'Apply for an apprenticeship place.',
    objectives: [
      { id: 'say_why_job', description: 'Say why you want this apprenticeship.' },
      { id: 'describe_experience', description: 'Describe one relevant experience.' },
      { id: 'ask_training', description: 'Ask how the training is organised.' },
      { id: 'ask_school', description: 'Ask about the vocational school days.' },
    ],
  },
  ausbildung_alltag: {
    level: 'B1',
    persona: { name: 'Herr Brenner', gender: 'male', role: 'trainer showing you the workshop', personality: 'practical, patient, expects you to ask' },
    goal: 'Understand your first week in the workshop.',
    objectives: [
      { id: 'ask_what_you_learn', description: 'Ask what you will learn first.' },
      { id: 'ask_break', description: 'Ask when the break is.' },
      { id: 'say_what_you_know', description: 'Say what you already know how to do.' },
      { id: 'ask_who_shows', description: 'Ask who will show you the machines.' },
    ],
  },
  berufsschule_tag: {
    level: 'B1',
    persona: { name: 'Denis', gender: 'male', role: 'classmate in the same apprenticeship', personality: 'friendly, curious, complains about maths' },
    goal: 'Talk with a classmate about vocational school.',
    objectives: [
      { id: 'say_how_you_find_it', description: 'Say how you find the school so far.' },
      { id: 'name_difficult_subject', description: 'Name one subject that is difficult for you.' },
      { id: 'ask_his_experience', description: 'Ask how he copes with it.' },
      { id: 'suggest_studying', description: 'Suggest studying together.' },
    ],
  },
  pruefungstag: {
    level: 'B1',
    persona: { name: 'Herr Kaiwicz', gender: 'male', role: 'examiner on your practical exam day', personality: 'formal, encouraging, exact' },
    goal: 'Get through the practical exam and answer the examiner.',
    objectives: [
      { id: 'say_you_are_ready', description: 'Say that you are ready to start.' },
      { id: 'describe_task', description: 'Describe the task you just did.' },
      { id: 'explain_why', description: 'Explain why you chose that approach.' },
      { id: 'thank_and_finish', description: 'Thank him and finish politely.' },
    ],
  },
  anerkennung_gespraech: {
    level: 'B1',
    persona: { name: 'Frau Lange', gender: 'female', role: 'clerk at the recognition office', personality: 'precise, formal, not unkind' },
    goal: 'Start the recognition of your foreign qualification.',
    objectives: [
      { id: 'say_qualification', description: 'Say which qualification you want recognised.' },
      { id: 'say_where_from', description: 'Say where and when you got it.' },
      { id: 'ask_documents', description: 'Ask which documents they need.' },
      { id: 'ask_duration', description: 'Ask how long the process takes.' },
    ],
  },
  anerkennung_it_zertifikate: {
    level: 'B1',
    persona: { name: 'Herr Weber', gender: 'male', role: 'clerk assessing foreign IT certificates', personality: 'reserved, detailed, asks for proof' },
    goal: 'Get your IT certificates recognised.',
    objectives: [
      { id: 'name_certificates', description: 'Name the certificates you have.' },
      { id: 'say_what_they_cover', description: 'Say what the certificates cover.' },
      { id: 'ask_translation', description: 'Ask whether translations are needed.' },
      { id: 'ask_next_step', description: 'Ask what happens next.' },
    ],
  },
  job_interview: {
    level: 'B1',
    persona: { name: 'Herr Bauer', gender: 'male', role: 'HR manager conducting a job interview', personality: 'professional, probing, polite' },
    goal: 'Get through a job interview.',
    objectives: [
      { id: 'introduce_yourself', description: 'Introduce yourself and your background.' },
      { id: 'describe_experience', description: 'Describe your experience with one example.' },
      { id: 'why_this_company', description: 'Say why you want this company.' },
      { id: 'ask_question', description: 'Ask one question about the job.' },
    ],
  },
  interview_pflegefachkraft: {
    level: 'B1',
    persona: { name: 'Herr Falk', gender: 'male', role: 'nursing director in an interview', personality: 'calm, exacting, cares about patients' },
    goal: 'Interview for a nursing position.',
    objectives: [
      { id: 'introduce_yourself', description: 'Introduce yourself and your training.' },
      { id: 'describe_nursing_experience', description: 'Describe your nursing experience.' },
      { id: 'answer_shifts', description: 'Answer whether you can work shifts.' },
      { id: 'ask_about_team', description: 'Ask one question about the team or the ward.' },
    ],
  },
  interview_arzt: {
    level: 'B1',
    persona: { name: 'Dr. Berg', gender: 'male', role: 'chief physician in an interview', personality: 'formal, precise, expects structure' },
    goal: 'Interview for a doctor’s post.',
    objectives: [
      { id: 'say_speciality', description: 'Say your speciality.' },
      { id: 'describe_experience', description: 'Describe your clinical experience.' },
      { id: 'answer_language', description: 'Answer how you handle German at work.' },
      { id: 'ask_department', description: 'Ask one question about the department.' },
    ],
  },
  interview_it_fachkraft: {
    level: 'B1',
    persona: { name: 'Herr Vogel', gender: 'male', role: 'team lead interviewing for IT support', personality: 'friendly, technical, practical' },
    goal: 'Interview for an IT support role.',
    objectives: [
      { id: 'introduce_skills', description: 'Introduce yourself and your skills.' },
      { id: 'describe_task_solved', description: 'Describe one problem you solved.' },
      { id: 'ask_about_team', description: 'Ask about the team or the technology.' },
      { id: 'answer_availability', description: 'Answer when you could start.' },
    ],
  },
  interview_entwickler: {
    level: 'B1',
    persona: { name: 'Dr. Sander', gender: 'male', role: 'lead developer interviewing you', personality: 'analytical, quiet, asks precise questions' },
    goal: 'Interview for a software developer role.',
    objectives: [
      { id: 'say_speciality', description: 'Say what you develop and with which tools.' },
      { id: 'describe_project', description: 'Describe one project you built.' },
      { id: 'how_you_work', description: 'Say how you work in a team.' },
      { id: 'ask_process', description: 'Ask how the team ships code.' },
    ],
  },

  // ── B2 · exam style ───────────────────────────────────────────────────────
  exam_sich_vorstellen: {
    level: 'B2',
    persona: { name: 'Frau Haas', gender: 'female', role: 'oral exam partner in a practice exam', personality: 'neutral, encouraging, keeps the pace' },
    goal: 'Introduce yourself in the style of the oral exam.',
    objectives: [
      { id: 'name_and_origin', description: 'Say your name and where you come from.' },
      { id: 'job_or_course', description: 'Say what you do: job, course or training.' },
      { id: 'why_german', description: 'Say why you are learning German.' },
      { id: 'one_hobby', description: 'Mention one hobby or free-time activity.' },
    ],
  },
  exam_erfahrungen_sprechen: {
    level: 'B2',
    persona: { name: 'Herr Peters', gender: 'male', role: 'oral exam partner in a practice exam', personality: 'neutral, patient, asks for examples' },
    goal: 'Talk about your experience learning German.',
    objectives: [
      { id: 'what_is_easy', description: 'Say what is easy for you in German.' },
      { id: 'what_is_hard', description: 'Say what is hard for you.' },
      { id: 'give_example', description: 'Give one concrete example.' },
      { id: 'ask_partner', description: 'Ask your partner one question about their experience.' },
    ],
  },
  exam_gemeinsam_planen: {
    level: 'B2',
    persona: { name: 'Frau Haas', gender: 'female', role: 'oral exam examiner planning a trip with you', personality: 'neutral, organised, moves the plan forward' },
    goal: 'Plan a trip together with the exam partner.',
    objectives: [
      { id: 'suggest_activity', description: 'Suggest an activity for the trip.' },
      { id: 'agree_day_time', description: 'Agree on a day and a time.' },
      { id: 'agree_meeting_point', description: 'Agree where to meet.' },
      { id: 'confirm_plan', description: 'Confirm the plan in one sentence.' },
    ],
  },
  exam_thema_praesentieren: {
    level: 'B2',
    persona: { name: 'Herr Peters', gender: 'male', role: 'oral exam examiner listening to your presentation', personality: 'neutral, attentive, asks one follow-up' },
    goal: 'Present a place in your city in the style of the oral exam.',
    objectives: [
      { id: 'say_where_it_is', description: 'Say where the place is.' },
      { id: 'what_you_can_do', description: 'Describe what you can do there.' },
      { id: 'reason_to_visit', description: 'Give one reason why it is worth visiting.' },
      { id: 'answer_question', description: 'Answer one follow-up question about it.' },
    ],
  },
  exam_auf_partner_reagieren: {
    level: 'B2',
    persona: { name: 'Frau Haas', gender: 'female', role: 'oral exam partner making statements about everyday life in Germany', personality: 'neutral, friendly, leaves room for disagreement' },
    goal: 'React to your partner’s statements about everyday life in Germany.',
    objectives: [
      { id: 'agree_or_disagree', description: 'Agree or disagree and give a reason.' },
      { id: 'own_example', description: 'Give one example from your own life.' },
      { id: 'ask_follow_up', description: 'Ask your partner a follow-up question.' },
      { id: 'summarise', description: 'Summarise your view in one sentence.' },
    ],
  },
};

/** Every objective id of a scenario, in authoring order. */
export function objectivesOf(plan) {
  return Array.isArray(plan?.objectives) ? plan.objectives : [];
}

/** The plan for a served scenario id, or null when this id has none. */
export function planForScenario(scenarioId) {
  return ROLEPLAY_PLANS[String(scenarioId || '')] || null;
}

/**
 * Keep only objective ids this plan actually has, deduped — a client can send
 * anything, and a made-up id must never count toward progress.
 */
export function sanitizeObjectivesDone(plan, raw) {
  const valid = new Set(objectivesOf(plan).map((o) => o.id));
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const value of raw) {
    const id = String(value || '').slice(0, 60);
    if (valid.has(id) && !out.includes(id)) out.push(id);
    if (out.length >= valid.size) break;
  }
  return out;
}
