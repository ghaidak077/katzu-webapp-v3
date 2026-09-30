# Review — `curriculum-a0-foundations.json`

Module: الأساسيات من الصفر (A0 foundations) · 6 scenarios · 55 vocabulary · 55 starter phrases · 8 grammar rows · content levels A0/A1 only.

Gate followed: `docs/agent/CONTENT-GATE.md` — audit → adversarial self-review rounds → approval only after a later zero-defect round → loader dry-run. Reviewed by AI self-review; **no human review**. The reviewer is the same model that authored the rows, so treat this file as a map of what is most likely wrong, not as proof it is right.

## Round 1 — machine audit + adversarial read (5 defects found, all fixed)

Machine audit (`scripts/audit-curriculum.mjs`):

1. **E — documents pool too small (14 < 15).** Fixed: added `die Bank` (A1, documents) — the banking scene's own headword, previously undeclared in any module.

Adversarial read (author re-reading every row as an examiner):

2. **German grammar — `Wie schreibt man dieser Buchstabe?`** (Buchstabe example). Masculine dative after `man`-subject needs `diesen Buchstaben` (accusative + weak-noun declension). Fixed: `Wie schreibt man diesen Buchstaben?`
3. **Unnatural German — `Guten Morgen, habe ich Recht?`** (Guten Morgen example). A greeting example that jumps to "am I right?" is not a sentence a learner would say. Fixed: `Guten Morgen, der Kaffee ist fertig.`
4. **Unnatural German — `Welche Nummer hat Ihr Gleis?`** (Nummer example). Idiomatic German asks `Wie ist deine Nummer?` / states `Die Nummer ist …`. Fixed: `Die Nummer ist drei.`
5. **Wrong register in Arabic — helfen example `أنا أساعدك (بحضرتك)`.** Mixed a literal `أنا` with an honorific parenthetical that does not parse. Fixed: `أنا أساعدك (عند استعمال Sie)` — states the register rule instead of pretending to be natural speech.

Also fixed in the same pass (caught re-reading the grammar rows and phrases):

6. **Wrong grammar claim — `g_a0_ich_moechte` explanation** said möchte "does not take another verb after it". False: `Ich möchte trinken` is standard A0 teaching. Fixed with both uses stated.
7. **Unnatural phrase — `Kann ich diese Uhrzeit fragen?`** (train_first_ride, A1). Calque, not German. Fixed: `Ich möchte nach Köln fahren.`
8. **Coverage rule:** systematic check of every pool word against its topic's phrases + openers found `sein`, `helfen`, `teuer`, `brauchen` never appearing verbatim in their own topic. Fixed: two topic moves to where the verbatim sentences live (`teuer` → travel with `Zu teuer!`; `brauchen` → documents with `Ich brauche Hilfe.` — same precedent as module2's conjugated-verb rows) and two natural du-register phrases for the neighbour scene (`Das kann sein.`, `Kannst du mir helfen?`).

## Round 2 — re-review after the round-1 edits (3 defects found, all fixed)

9. **Over-specific plurals:** `die Milch` and `die Zucker` exist in specialised registers (dairy varieties, sugar grades) but not in the everyday A0 speech this module teaches; a quiz distractor pair Milch/Milchs would be noise. Fixed: empty plural, matching how the offline fixture treats uncountables.
10. **Arabic gender agreement — `كيف تُكتب هذه الحرف؟`** (Buchstabe example after the round-1 German fix). `حرف` is masculine; fixed: `كيف يُكتب هذا الحرف؟`

## Round 3 — full re-review (zero defects)

All 55 vocabulary rows, 55 phrases, 6 scenarios × 5 openers and 8 grammar rows re-checked for: article/gender, du/Sie register per scene, Arabic calques and naturalness, secular greeting rule (no السلام عليكم for Hallo/Guten Tag), no German transliterations in Arabic fields, no fees/deadlines/document lists/laws as facts, every pool word verbatim in a same-topic phrase or opener, no duplicate (topic, level, german) keys, no reuse of the 15 live scenario ids. **Zero defects found.**

## What a human should spot-check first (highest value, in order)

1. **The A0 openers of `banking_first_visit` and `letters_and_forms`** — is `Ich helfe Ihnen. Was brauchen Sie?` the right register for a bank clerk, and is the form-filling opener natural for a German Sachbearbeiter?
2. **The four Arabic grammar explanations** (`g_a0_*`) — these teach actively; a subtly wrong explanation (especially the möchte modal-verb one) reaches every A0 learner.
3. **Articles and plurals of the 55 headwords** — one pass with a dictionary; the plurals were checked but a native eye catches what automation cannot.
4. **The `Guten Tag`/`Guten Morgen`/`Guten Abend` Arabic glosses** — the register of time-of-day greetings in MSA (نهارك سعيد vs الطاب يومك) is a style decision worth a native second opinion.
5. **The du/Sie split across scenes** — friend/café scenes use du, bank/forms/train scenes use Sie; confirm the café persona speaking du matches the existing `cafe_order` scenario's convention.
