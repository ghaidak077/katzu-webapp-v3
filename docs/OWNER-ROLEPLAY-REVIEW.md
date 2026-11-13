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

## What changed on 2026-11-13 (read this part)

- **One model call per learner turn.** The persona's answer, the correction, the Arabic reason, the objective
  credits and the learner's next sentence all come back together. The «اقتراح لردّك» sheet and the word bank
  are gone; a hint now sits under the conversation with 🔊 / 🐢 and «قلها» (which only puts the cursor in the
  box — it never types for the learner and never sends).
- **The screen says what the scene is for.** «مهمتك: …» under the title, and `N من M` objectives in the header.
  An objective only ticks when the learner's own words do it — if you say «أريد قهوة» the bar moves, if the
  persona offers coffee it does not.
- **No written lines behind the persona.** If the model fails, the learner sees one Arabic sentence and their
  own sentence stays in the box; there is no "pretend" reply.
- **Shipped** to `katzuai.com`. Everything above is verified by the gate (16/16 steps, browser suite 175
  passed) and by the bundle that is live; the quality table is the one open item.

## Your two asks

1. **A second provider key** (any OpenAI-compatible endpoint). The pool has one Groq key on the free tier, and
   its 200k-token daily cap stops the 60-input quality run before it finishes. With a second key the run
   fails over instead of stopping.
2. **Flag any scenario line that reads wrong.** Name the scene, say what is wrong, and the agent edits the
   plan: goals («مهمتك») in `cloudflare-roleplay-anchors.js` (`GOALS_AR`), objectives in
   `cloudflare-roleplay-plans.js`.
