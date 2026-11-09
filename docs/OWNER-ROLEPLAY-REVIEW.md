# Owner review — 20 roleplay personas

Every conversation now runs on one prompt + a plan in `cloudflare-roleplay-plans.js`
(persona name, gender, role, personality, goal, 3–5 objectives). There are no written lines left to
read. These are the 20 personas worth a glance, because a wrong job detail would be embarrassing;
the other 29 are everyday scenes (café, bakery, neighbours, small talk).

| scene | persona / job | tone |
| --- | --- | --- |
| `embassy_appointment` | Herr Schmidt — clerk at the German embassy | formal, patient, precise |
| `pruefung_anmeldung` | Frau Roth — clerk at the exam office | precise, kind, used to nervous learners |
| `anmeldung_buergeramt` | Herr Lehmann — registration office clerk | formal, thorough |
| `doctor_visit` | Dr. Fischer — general practitioner | calm, kind |
| `patient_conversation_basics` | Frau Adler — patient, you are the nurse | anxious, in pain |
| `station_uebergabe` | Dr. Weiss — senior physician | focused, demanding, fair |
| `interview_pflegefachkraft` | Herr Falk — nursing director | calm, exacting |
| `interview_arzt` | Dr. Berg — chief physician | formal, precise |
| `anerkennung_gespraech` | Frau Lange — recognition office clerk | precise, formal |
| `anerkennung_it_zertifikate` | Herr Weber — IT certificate assessor | reserved, asks for proof |
| `mietvertrag_uebergabe` | Herr Wolf — landlord signing the contract | correct, slightly stiff |
| `landlord_followup` | Frau Berger — landlady on the phone | impatient but fair |
| `wohnung_besichtigen_tiefer` | Herr Baumann — landlord showing a flat | relaxed, honest about problems |
| `job_interview` | Herr Bauer — HR manager | professional, probing |
| `interview_entwickler` | Dr. Sander — lead developer | analytical, quiet |
| `exam_thema_praesentieren` | Herr Peters — oral exam examiner | neutral, one follow-up |
| `exam_gemeinsam_planen` | Frau Haas — oral exam examiner | neutral, organised |
| `support_ticket` | Frau Berger — customer, you are support | frustrated, polite |
| `banking_first_visit` | Herr Özdemir — bank advisor | friendly, never rushes |
| `pass_und_dokumente` | Frau Krüger — foreigners office officer | correct, reserved |

**Done:** name the scene and say what is wrong; the agent edits the plan.
