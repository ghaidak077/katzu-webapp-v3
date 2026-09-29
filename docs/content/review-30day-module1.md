Adversarial self-review of `docs/content/curriculum-30day-module1.json` under
`docs/agent/CONTENT-GATE.md`. Same model authored and reviewed this content, so
this file is written to be falsifiable: every defect below carries the number
that was measured before the fix and the check that now fails if it returns.

## Round 1 — 3 defects found and fixed

### 1. Isolated vocabulary: 31 of 74 words appeared in no phrase or opener

The gate's "Always" rule ("every vocabulary word appears in a phrase or opener")
was measured with the *executable* definition the repo already uses for module2
(`tests/arrivalRoster.test.ts`: per-topic coverage — the phrases of every
scenario reading that pool plus their four openers, matched on the bare headword
or its stem without the final -en/-n/-t). Module1 failed it, topic by topic:

| topic | pool | isolated before | isolated after |
| --- | --- | --- | --- |
| documents | 26 | 11 | 0 |
| health | 16 | 7 | 0 |
| housing | 16 | 8 | 0 |
| work | 16 | 5 | 0 |
| **total** | **74** | **31** | **0** |

The isolated words were `Unterschrift, Adresse, Kopie, unterschreiben, gültig,
vollständig, Online, Wartezeit, Uhrzeit, Datum, Vormittag` (documents),
`Arzt, Krankenhaus, Medikament, Antrag, gesetzlich, zahlen, zuständig` (health),
`Mietvertrag, Schlüssel, übernehmen, Hausordnung, Vermieter, Renovierung,
räumen, vereinbaren` (housing) and `Kollege, Arbeitsvertrag, Pause, Vorgesetzte,
einweisen` (work). Those words were reachable only inside a quiz.

Fix: 19 new starter phrases (30 → 49; per scenario 10/10/10/10/9, inside the
gate's 6–10 band, `sort_order` still contiguous from 1). Each new phrase is a
learner line that belongs to its scene, e.g. `Muss ich das Formular noch
unterschreiben?`, `Wie lang ist die Wartezeit für einen Termin?`, `Sind Sie für
die gesetzliche Versicherung zuständig?`, `Was steht im Mietvertrag dazu, wer
die Wohnung am Ende räumt?`. No vocabulary row was deleted or edited — the
fix adds the missing homes rather than shrinking the pool.

### 2. Ten grammar rows had no scenario to teach them

`grammar` has no `scenario_id` column in D1, so the scenario→grammar link is
code-level (`src/lib/content/scenarioGrammar.ts`). Module2 and the offline
fixtures were mapped there; **module1's five scenarios were not**, so its ten
grammar rows (`g_anmeldung_*`, `g_termin_zeitangaben_a1`, `g_kasse_*`,
`g_miete_*`, `g_arbeit_hoeflich_b1`) were unreachable — Guided Practice had
nothing to teach for the shipped module. This is the same defect class as a
vocabulary topic no scenario resolves to.

Fix: `SCENARIO_GRAMMAR_IDS` now maps all five scenarios (3/2/2/2/1 links, all
ids present in the draft). The roster gate asserts this for module1 now.

### 3. Arabic register slips and one unidiomatic gloss (6 fixes)

The German uses **Sie** with officials throughout; six Arabic glosses addressed
the same person in the informal singular, which reads as a register mismatch to
an Arabic speaker:

- `Hier sind mein Pass und meine Wohnungsgeberbestätigung.` — `تفضّل جواز سفري…`
  → `هذا جواز سفري وتأكيد المالك.`
- `Können Sie das bitte wiederholen?` — `هل يمكنك إعادة ذلك…` →
  `هل يمكنكم تكرار ذلك من فضلكم؟`
- `Können Sie den Termin bitte verschieben?` — `هل يمكنك تأجيل…` →
  `هل يمكنكم تأجيل الموعد من فضلكم؟`
- `Hier ist mein Anmeldeschein vom Arbeitgeber.` — `تفضّل ورقة التسجيل…` →
  `هذه ورقة التسجيل من صاحب العمل.`
- `Hier sind meine Steuer-ID und meine Bankverbindung.` — `تفضّل رقمي الضريبي…`
  → `هذا رقمي الضريبي وبيانات حسابي البنكي.`
- `Welche Termine sind noch frei?` — `ما المواعيد المتاحة بعد؟` (the trailing
  `بعد` is not idiomatic) → `أي مواعيد ما زالت متاحة؟`

The 19 new phrases were authored with neutral or formal Arabic address for the
same reason.

Re-verified after the fixes: `audit-curriculum.mjs` PASSED with zero errors
(5 scenarios · 74 vocabulary · 49 phrases · 10 grammar) and both module drafts
pass `load-curriculum.mjs --dry-run`.

## Round 2 — zero issues

Read row by row again, with the executable checks now covering module1 as well:

- **Article/gender** — all 51 nouns: `Anmeldung` die, `Amt` das, `Ausweis` der,
  `Pass` der, `Formular` das, `Unterschrift` die, `Adresse` die, `Wohnung` die,
  `Kopie` die, `Bürgeramt` das, `Wartezeit` die, `Uhrzeit` die, `Datum` das,
  `Vormittag` der, `Arzt` der, `Krankenhaus` das, `Medikament` das,
  `Krankenkasse` die, `Versicherung` die, `Anmeldeschein` der,
  `Versichertenkarte` die, `Arbeitgeber` der, `Beitrag` der, `Leistung` die,
  `Antrag` der, `Miete` die, `Mietvertrag` der, `Schlüssel` der, `Kaution` die,
  `Übergabeprotokoll` das, `Mangel` der, `Zählerstand` der, `Nebenkosten` die,
  `Kündigungsfrist` die, `Hausordnung` die, `Vermieter` der, `Mieter` der,
  `Renovierung` die, `Kollege` der, `Gehalt` das, `Arbeitsvertrag` der,
  `Pause` die, `Abteilung` die, `Steueridentifikationsnummer` die,
  `Sozialversicherungsnummer` die, `Bankverbindung` die,
  `Gehaltsabrechnung` die, `Probezeit` die, `Lohn` der, `Vorgesetzte` der
  (weak masculine), `Wochenende`/`Samstag` not used here. All correct.
- **du/Sie** — every German phrase and opener in all five scenarios uses Sie
  forms (`Können Sie`, `Haben Sie`, `Ihre`) or first-person learner speech; no
  `du/dich/dir/dein` anywhere. The roster gate asserts this per scenario.
- **Calques and naturalness** — the new German is idiomatic and speakable:
  `Kann mich ein Kollege in die Aufgaben einweisen?`, `Wann bekomme ich die
  Schlüssel, und gilt die Hausordnung auch für den Keller?`, `Muss ich die
  Renovierung selbst übernehmen?`. Arabic glosses read as Arabic, not as German
  word order.
- **Over-certain bureaucracy claims** — none added. Every new line is a question
  or a first-person statement about the learner's own case; nothing asserts
  fees, deadlines, mandatory documents or legal rules, and no opener matches the
  `BUREAUCRATIC_CLAIM_PATTERNS` list the roster gate applies. The scenario
  openers stay generic (`Wohnungsgeberbestätigung` is named as what the clerk
  asks for, not as a nationwide requirement).
- **Level fit** — A1 phrases stay present-tense and short; A2 adds modal
  requests (`Kann ich … buchen?`); B1 adds subordinate clauses
  (`Was steht im Mietvertrag dazu, wer … räumt?`) and passive-free formal
  hedging (`Können wir … vereinbaren?`). Nothing uses a word the pool does not
  teach at or below that level.
- **Verbatim usability** — all 49 phrases are usable unchanged in their scene.

Because round 2 found zero issues, the review block is set to
`review.status="approved"` with the AI self-review attribution below (no human
has reviewed this content).

## Round 3 (V16, 2026-09-29) — one cross-file defect, fixed

### 6. Three vocabulary keys were declared by both module drafts

Round 1 and 2 could not have seen this one: `auditCurriculum` validates **one
file at a time**, and the defect is between files. `Miete`, `Mietvertrag` and
`Kaution` (A2, `housing`) were declared here *and* in
`curriculum-arrival-module2.json`, with the same key
(`level|german|topic`) and **different example sentences**. The loader writes
the first file it is given and skips every later row whose key already exists,
so the second declaration could never land — silently, and with no message. It
was found by the V15 drift check against production
(`scripts/check-content-drift.mjs`, which exits non-zero on this class), not by
the gate.

**Fix, per the owner's decision (keep module2's wording):** the three rows are
removed from this draft. That changes no learner-visible string: production
holds a *third*, older wording for `Miete` (id 130) and `Kaution` (id 126) from
the pre-module catalogue, and `Mietvertrag` is module2's row (id 214). What is
removed here are declarations that could only ever be skipped.

**The replacement, and why it was needed:** the Content Gate and the roster gate
both require a topic pool of **at least 15** words, so removing three rows alone
would drop `housing` from 16 to 13 and fail the audit — an agent must not loosen
a gate to make an edit fit. The pool is refilled with three words this draft's
own phrases and openers already use, so the round-1 coverage rule still holds
exactly:

| new row | covered by |
| --- | --- |
| `die Wohnung` (A2) | a1 opener `Sie möchten die Wohnung mieten?`; b1 phrase `… wer die Wohnung am Ende räumt?` |
| `der Vertrag` (A2) | b2 opener `… in Ihrem Vertrag gemeinsam an.` |
| `die Besichtigung` (B1) | b1 phrase `Dieser Mangel war schon bei der Besichtigung vorhanden.` |

Their rows, for a reviewer who does not want to open the draft:

- `Wohnung` / die / die Wohnungen / Noun / **الشقة** / flat — `Die Wohnung ist ab dem ersten Oktober frei.` — `الشقة متاحة من أول أكتوبر.` — "The flat is available from the first of October."
- `Vertrag` / der / die Verträge / Noun / **العقد** / contract — `Im Vertrag steht, wann die Wohnung geräumt sein muss.` — `العقد يحدد موعد تسليم الشقة فارغة.` — "The contract states when the flat has to be cleared."
- `Besichtigung` / die / die Besichtigungen / Noun / **المعاينة** / viewing — `Bei der Besichtigung war der Mangel noch nicht sichtbar.` — `لم يكن العيب ظاهراً وقت المعاينة.` — "The defect was not visible at the viewing."

After the edit: **74 vocabulary** (documents 26, health 16, housing 16, work 16),
49 phrases, 10 grammar — the module's shape is unchanged, no key is declared
twice, and `node scripts/audit-curriculum.mjs` reports no errors. `reviewedAt`
moved to `2026-09-29T11:20:00Z`; the review is still AI self-review by the same
model that authored the rows, so add these three rows and the keep-module2
decision to the human spot-check list below.

## What a human should spot-check first

1. **The 19 new phrases in German** (the only newly authored text in this
   change) — read them aloud in scene order; check that
   `Am liebsten am Vormittag — welche Uhrzeit und welches Datum sind frei?` and
   `Was steht im Mietvertrag dazu, wer die Wohnung am Ende räumt?` sound like
   something a learner would say to a clerk or a landlord.
2. **The six Arabic gloss fixes** — confirm formal address (`يمكنكم`, `هذا` /
   `هذه`) is the register you want when German uses Sie.
3. **`SCENARIO_GRAMMAR_IDS` for module1** — confirm each scenario teaches the
   grammar point you intended (e.g. `krankenkasse_anmelden` → Dativ + Perfekt).
4. **Quiz/Study coverage** — open Study for a module1 scenario after loading and
   confirm the pool words no longer appear only in the quiz.
5. **The approval itself** — this is AI self-review by the same system that
   authored the rows; a native-speaker pass is still the only real check on
   idiomaticity.
6. **The round-3 replacement rows (V16)** — check the German and Arabic of
   `Wohnung`, `Vertrag` and `Besichtigung` above, and confirm that keeping
   module2's wording for `Miete`, `Mietvertrag` and `Kaution` is the choice you
   want (production keeps its own older wording for two of the three regardless,
   because the pre-module catalogue already had those keys).
