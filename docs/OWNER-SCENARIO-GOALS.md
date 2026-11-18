# Owner scenario goals — three per scenario, plus the universal ending

Created 2026-11-16 from the owner request "every scenario has exactly 3 goals (ids and
success criteria) in the server plans". The request said the list would follow in this
file; no per-scenario list was attached, so every goal below is derived from the plan
that was already serving that scenario, with the ids kept exactly as they were.

## v10 (2026-11-18) — the fourth goal and what the header counts

- Every one of the 49 plans now ends with the same fourth objective, `end_politely`:
  the learner says goodbye. It is credited only from the learner's own farewell
  (`auf Wiedersehen`, `Tschüss`, `Bis bald`, …), never from the persona's words.
- Because `close` is server-decided (`allDone`), the chat can now close only after the
  learner has ended it. The persona may say «Ich muss jetzt los», but its farewell is
  rejected until the learner said goodbye first.
- **The header counts GOALS, not turns.** `N von 4` means four objectives are finished;
  it never means four messages were exchanged. It was `3 von 3` before this change and
  is `N von 4` now; a learner can finish the three scene goals in any number of turns.
- The rows below still list the three scene-specific goals; `end_politely` is common to
  all of them and is not repeated in every row.
- **Teacher review flag:** the A1 opener was changed to
  «Hallo! Ich bin Frau Meier, Ihre Nachbarin. Wie heißen Sie?» (Sie-form, matching the
  scenario's `register: "sie"`). Please have a teacher confirm that this is the right
  first sentence for an A1 learner before it becomes the production opener; the Arabic
  gloss is «أهلاً! أنا السيدة ماير، جارتك. ما اسمك؟».

## How the third goal was chosen

- The first three objectives of each plan were kept, in their original order, with their
  original ids and Arabic anchors unchanged — so no credit that worked before stops
  working.
- A dropped **courtesy** line (goodbye / thank you) is removed outright: the scene closes
  with the persona's own farewell once `close` is true, so tracking it cost a goal slot for
  nothing.
- Any other dropped beat is **folded into the third goal's success criterion**, so the
  model still pursues it while progress counts three goals. No folded text is a second
  tracked goal: `objectives_done` can only name one of the three ids.
- Anchors for a dropped id were deleted from `OBJECTIVE_ANCHORS`; `tests/roleplayPlans.test.ts`
  fails on an anchor no plan uses, so the table cannot drift.

## First run and unit path

**Conflict reported, not forced.** The unit path (`src/lib/units/units.ts`) opens unit 1 with
`first_greetings`; the first-run mission points at `airport_arrival` (`INTRO_SCENARIO_ID` in
`src/lib/mission/selectMission.ts`), which unit 1 reaches fourth. Pointing the constant at
`first_greetings` was tried and **broke the shipped browser suite**: `e2e/aiEconomy.spec.ts`
(the stored opener text), `e2e/firstSessionChain.spec.ts` and `e2e/journey.spec.ts` all expect
`/scenario/airport_arrival/story` as the first episode. The unit tests stayed green (75/75, they
read the constant symbolically), so the blocker was the e2e contract, not the rule. The request
allowed the change "unless it breaks a guard", so the constant was restored and the conflict is
recorded here. **To close it:** update those three specs, then flip `INTRO_SCENARIO_ID`.

| Scenario | Goal (English) | Goal 1 | Goal 2 | Goal 3 |
|---|---|---|---|---|
| `first_greetings` | Meet your new neighbour, say who you are, and end the chat politely. | `greet_and_name`: Greet her and say your name. | `say_origin`: Say where you come from. | `say_you_live_here`: Say that you live in this building now. |
| `numbers_and_prices` | Buy a bottle of water at the kiosk and pay for it. | `say_what_you_want`: Say what you want to buy. | `ask_the_price`: Ask how much it costs. | `say_the_number`: Repeat the price as a number, then pay and thank him. |
| `cafe_order` | Order a drink and a piece of cake in a café. | `order_drink`: Order a drink. | `order_food`: Order something to eat. | `ask_for_bill`: Ask for the bill. |
| `bakery_shopping` | Buy a loaf of bread and two rolls at the bakery. | `say_what_you_want`: Say what you want to buy. | `give_quantity`: Say how many you want. | `pay`: Ask the price and pay. |
| `supermarket_checkout` | Buy coffee, milk and sugar at the supermarket. | `say_what_you_need`: Say what you need to buy. | `ask_where`: Ask where one of the products is. | `pay_by_card`: Ask whether you can pay by card. |
| `restaurant_besonders` | Order dinner in a restaurant and explain one special wish. | `order_drink`: Order a drink. | `order_dish`: Order a dish. | `special_wish`: Say one special wish, for example no onions or vegetarian, then ask for the bill and pay. |
| `embassy_appointment` | Get an appointment to renew your passport. | `say_why_you_came`: Say why you came. | `ask_for_appointment`: Ask for an appointment. | `ask_documents`: Ask which documents you need to bring, then confirm the appointment and thank him. |
| `pass_und_dokumente` | Show your passport at the office and answer the officer’s questions. | `say_you_have_passport`: Say that you have your passport with you. | `say_how_long_you_stay`: Say how long you are staying in Germany. | `ask_what_else`: Ask what else they need from you. |
| `airport_arrival` | Report your missing suitcase at the airport. | `say_suitcase_missing`: Say that your suitcase did not arrive. | `describe_suitcase`: Describe the suitcase: colour and size. | `give_flight_number`: Give your flight number, then ask when the suitcase will arrive. |
| `train_station` | Buy a train ticket to Munich. | `say_destination`: Say where you want to go. | `ask_the_price`: Ask how much the ticket costs. | `ask_platform`: Ask which platform the train leaves from, then buy the ticket and thank her. |
| `train_first_ride` | Find the right train and platform for your first trip. | `say_where_you_go`: Say where you want to travel. | `ask_platform`: Ask which platform you need. | `ask_departure_time`: Ask when the train leaves. |
| `anmeldung_buergeramt` | Register your new address at the registration office. | `say_you_want_to_register`: Say that you want to register your address. | `say_since_when`: Say since when you have lived in the city. | `ask_documents`: Ask which documents you need, then ask when you get the confirmation. |
| `letters_and_forms` | Fill in a form together with the clerk. | `give_your_name`: Say your full name slowly. | `spell_surname`: Spell your surname letter by letter. | `say_nationality`: Say your nationality, then ask what you should write in one field, and confirm that the form is complete. |
| `banking_first_visit` | Open a basic bank account. | `say_you_want_account`: Say that you want to open an account. | `ask_what_you_need`: Ask which documents you need. | `ask_monthly_fee`: Ask about the monthly fee. |
| `pruefung_anmeldung` | Register for a German language exam. | `say_which_exam`: Say which exam and which level you want. | `ask_next_date`: Ask for the next exam date. | `ask_fee`: Ask how much the exam costs, then confirm the registration. |
| `apartment_viewing` | View a flat and ask the questions that decide it. | `ask_rent`: Ask about the rent and the extra costs. | `ask_size`: Ask how big the flat is and how many rooms it has. | `ask_move_in`: Ask when you could move in, then say whether you are interested and why. |
| `wohnung_besichtigen_tiefer` | Check the flat’s details before you decide. | `ask_included`: Ask what is included in the rent. | `ask_heating`: Ask how the flat is heated and what the bills look like. | `ask_kitchen_bath`: Ask about the kitchen and the bathroom, then ask how long the contract runs. |
| `mietvertrag_uebergabe` | Sign the rental contract and take over the flat. | `ask_deposit`: Ask about the deposit and how to pay it. | `ask_handover_date`: Ask when the handover takes place. | `ask_what_to_repair`: Ask what you have to paint or repair, then confirm that you received the keys. |
| `landlord_followup` | Call your landlady because the heating is broken. | `describe_problem`: Say what is broken. | `say_since_when`: Say since when it has been broken. | `ask_repair`: Ask when someone can come and repair it, then agree on a day and a time. |
| `doctor_visit` | Describe your symptoms and get advice from the doctor. | `say_what_hurts`: Say what hurts. | `say_since_when`: Say since when you have had the problem. | `ask_what_to_do`: Ask what you can do about it, then ask for a sick note for work. |
| `termin_online_buchen` | Book a doctor’s appointment by phone. | `say_you_need_appointment`: Say that you need an appointment. | `say_which_day`: Say which day suits you. | `give_name`: Give your name for the appointment, then repeat the day and time to confirm. |
| `krankenkasse_anmelden` | Join a health insurance. | `say_you_want_to_join`: Say that you want to join the insurance. | `ask_documents`: Ask which documents are needed. | `ask_when_starts`: Ask when the coverage starts, then ask when you get the insurance card. |
| `gesundheit_alltag` | Describe your symptoms and ask for a prescription. | `describe_symptoms`: Describe your symptoms. | `say_how_long`: Say how long you have had them. | `ask_prescription`: Ask for a prescription, then ask whether you should stay at home. |
| `patient_conversation_basics` | You are the nurse: find out what the patient needs and calm her down. | `greet_and_ask`: Greet her and ask what is wrong. | `ask_where_it_hurts`: Ask where it hurts. | `ask_since_when`: Ask since when she has had the pain, then reassure her and say what happens next. |
| `erster_arbeitstag` | Get through the first hour of your new job. | `introduce_yourself`: Introduce yourself and say what you do. | `ask_workplace`: Ask where your workplace is. | `ask_who_helps`: Ask who you can ask when you need help. |
| `kollegen_smalltalk` | Chat with a colleague and join the lunch break. | `answer_about_work`: Say what you do and where you work. | `say_what_you_like`: Say one thing you like about the job. | `accept_lunch`: Accept the lunch invitation, then ask what time lunch is. |
| `betriebs_kantine` | Order lunch in the canteen and talk about your day. | `order_food`: Say what you want to eat. | `say_about_day`: Say how your day was. | `sit_together`: Agree to sit together, then ask her one question about her work. |
| `friend_catchup` | Catch up with a friend after a long time. | `greet_and_ask_her`: Greet her and ask how she is. | `say_what_you_do_now`: Say what you are doing now: job or course. | `ask_about_her_life`: Ask about her family or her work, then suggest meeting again and agree on when. |
| `station_uebergabe` | Hand over a patient clearly at the shift change. | `report_state`: Report the patient’s current state. | `report_changes`: Say what changed overnight. | `say_recommendation`: Say what you recommend next, then answer one follow-up question about the patient. |
| `buero_gespraech_tiefer` | Discuss your tasks and responsibilities with your manager. | `describe_tasks`: Describe your current tasks. | `raise_problem`: Raise one problem or open point. | `ask_decision`: Ask her for a decision, then agree on the next steps. |
| `daily_standup` | Give a short, clear status report in the daily meeting. | `say_yesterday`: Say what you did yesterday. | `say_today`: Say what you will do today. | `name_blocker`: Name one blocker or ask for help, then ask one short question about the plan. |
| `support_ticket` | You are support: find the problem and give the customer one clear step. | `ask_what_happens`: Ask what exactly happens when she starts the computer. | `ask_what_tried`: Ask what she has already tried. | `give_one_step`: Give one clear step she can do now, then say what happens if the step does not work. |
| `tech_kuechenpause` | Make small talk in the office kitchen and agree on lunch. | `say_what_you_work_on`: Say what you are working on. | `say_weekend`: Say what you did or will do at the weekend. | `ask_about_him`: Ask him one question about his week, then agree on a time for lunch. |
| `bewerbung_ausbildung` | Apply for an apprenticeship place. | `say_why_job`: Say why you want this apprenticeship. | `describe_experience`: Describe one relevant experience. | `ask_training`: Ask how the training is organised, then ask about the vocational school days. |
| `ausbildung_alltag` | Understand your first week in the workshop. | `ask_what_you_learn`: Ask what you will learn first. | `ask_break`: Ask when the break is. | `say_what_you_know`: Say what you already know how to do, then ask who will show you the machines. |
| `berufsschule_tag` | Talk with a classmate about vocational school. | `say_how_you_find_it`: Say how you find the school so far. | `name_difficult_subject`: Name one subject that is difficult for you. | `ask_his_experience`: Ask how he copes with it, then suggest studying together. |
| `pruefungstag` | Get through the practical exam and answer the examiner. | `say_you_are_ready`: Say that you are ready to start. | `describe_task`: Describe the task you just did. | `explain_why`: Explain why you chose that approach. |
| `anerkennung_gespraech` | Start the recognition of your foreign qualification. | `say_qualification`: Say which qualification you want recognised. | `say_where_from`: Say where and when you got it. | `ask_documents`: Ask which documents they need, then ask how long the process takes. |
| `anerkennung_it_zertifikate` | Get your IT certificates recognised. | `name_certificates`: Name the certificates you have. | `say_what_they_cover`: Say what the certificates cover. | `ask_translation`: Ask whether translations are needed, then ask what happens next. |
| `job_interview` | Get through a job interview. | `introduce_yourself`: Introduce yourself and your background. | `describe_experience`: Describe your experience with one example. | `why_this_company`: Say why you want this company, then ask one question about the job. |
| `interview_pflegefachkraft` | Interview for a nursing position. | `introduce_yourself`: Introduce yourself and your training. | `describe_nursing_experience`: Describe your nursing experience. | `answer_shifts`: Answer whether you can work shifts, then ask one question about the team or the ward. |
| `interview_arzt` | Interview for a doctor’s post. | `say_speciality`: Say your speciality. | `describe_experience`: Describe your clinical experience. | `answer_language`: Answer how you handle German at work, then ask one question about the department. |
| `interview_it_fachkraft` | Interview for an IT support role. | `introduce_skills`: Introduce yourself and your skills. | `describe_task_solved`: Describe one problem you solved. | `ask_about_team`: Ask about the team or the technology, then answer when you could start. |
| `interview_entwickler` | Interview for a software developer role. | `say_speciality`: Say what you develop and with which tools. | `describe_project`: Describe one project you built. | `how_you_work`: Say how you work in a team, then ask how the team ships code. |
| `exam_sich_vorstellen` | Introduce yourself in the style of the oral exam. | `name_and_origin`: Say your name and where you come from. | `job_or_course`: Say what you do: job, course or training. | `why_german`: Say why you are learning German, then mention one hobby or free-time activity. |
| `exam_erfahrungen_sprechen` | Talk about your experience learning German. | `what_is_easy`: Say what is easy for you in German. | `what_is_hard`: Say what is hard for you. | `give_example`: Give one concrete example, then ask your partner one question about their experience. |
| `exam_gemeinsam_planen` | Plan a trip together with the exam partner. | `suggest_activity`: Suggest an activity for the trip. | `agree_day_time`: Agree on a day and a time. | `agree_meeting_point`: Agree where to meet, then confirm the plan in one sentence. |
| `exam_thema_praesentieren` | Present a place in your city in the style of the oral exam. | `say_where_it_is`: Say where the place is. | `what_you_can_do`: Describe what you can do there. | `reason_to_visit`: Give one reason why it is worth visiting, then answer one follow-up question about it. |
| `exam_auf_partner_reagieren` | React to your partner’s statements about everyday life in Germany. | `agree_or_disagree`: Agree or disagree and give a reason. | `own_example`: Give one example from your own life. | `ask_follow_up`: Ask your partner a follow-up question, then summarise your view in one sentence. |

## Changes from the plans that were serving before this pass

Every scenario had four objectives (one had five). Nothing was renamed.

| Scenario | Folded into goal 3 | Removed as courtesy |
|---|---|---|
| `first_greetings` | — | `say_goodbye` |
| `numbers_and_prices` | `pay_and_thank` | — |
| `cafe_order` | — | `say_goodbye` |
| `bakery_shopping` | — | `say_goodbye` |
| `supermarket_checkout` | — | `thank_and_leave` |
| `restaurant_besonders` | `ask_for_bill` | — |
| `embassy_appointment` | `confirm_and_thank` | — |
| `pass_und_dokumente` | — | `thank_and_leave` |
| `airport_arrival` | `ask_when_it_arrives` | — |
| `train_station` | `buy_ticket` | — |
| `train_first_ride` | — | `thank_him` |
| `anmeldung_buergeramt` | `ask_confirmation` | — |
| `letters_and_forms` | `ask_what_to_write`, `confirm_form` | — |
| `banking_first_visit` | — | `thank_and_leave` |
| `pruefung_anmeldung` | `confirm_registration` | — |
| `apartment_viewing` | `say_interested` | — |
| `wohnung_besichtigen_tiefer` | `ask_contract_length` | — |
| `mietvertrag_uebergabe` | `confirm_keys` | — |
| `landlord_followup` | `agree_time` | — |
| `doctor_visit` | `ask_sick_note` | — |
| `termin_online_buchen` | `confirm_appointment` | — |
| `krankenkasse_anmelden` | `ask_card` | — |
| `gesundheit_alltag` | `ask_stay_home` | — |
| `patient_conversation_basics` | `reassure_next` | — |
| `erster_arbeitstag` | — | `thank_him` |
| `kollegen_smalltalk` | `ask_time` | — |
| `betriebs_kantine` | `ask_about_her` | — |
| `friend_catchup` | `suggest_meeting` | — |
| `station_uebergabe` | `answer_question` | — |
| `buero_gespraech_tiefer` | `agree_next_steps` | — |
| `daily_standup` | `ask_short_question` | — |
| `support_ticket` | `say_next_step` | — |
| `tech_kuechenpause` | `agree_lunch` | — |
| `bewerbung_ausbildung` | `ask_school` | — |
| `ausbildung_alltag` | `ask_who_shows` | — |
| `berufsschule_tag` | `suggest_studying` | — |
| `pruefungstag` | — | `thank_and_finish` |
| `anerkennung_gespraech` | `ask_duration` | — |
| `anerkennung_it_zertifikate` | `ask_next_step` | — |
| `job_interview` | `ask_question` | — |
| `interview_pflegefachkraft` | `ask_about_team` | — |
| `interview_arzt` | `ask_department` | — |
| `interview_it_fachkraft` | `answer_availability` | — |
| `interview_entwickler` | `ask_process` | — |
| `exam_sich_vorstellen` | `one_hobby` | — |
| `exam_erfahrungen_sprechen` | `ask_partner` | — |
| `exam_gemeinsam_planen` | `confirm_plan` | — |
| `exam_thema_praesentieren` | `answer_question` | — |
| `exam_auf_partner_reagieren` | `summarise` | — |

## Arabic goal line (unchanged)

`GOALS_AR` in `cloudflare-roleplay-anchors.js` still supplies the one-sentence Arabic goal
under the title, so this change does not touch the text a learner reads.
