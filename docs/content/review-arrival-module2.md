Adversarial self-review of `docs/content/curriculum-arrival-module2.json`.

## Round 1 — 3 issues found and fixed

1. **Headword convention drift (fix applied to 33 rows).** Module1 and the local
   fixtures store bare headwords (`Anmeldung`, `Kaffee`); the first authoring pass
   had embedded the article into `german` (`der Flughafen`). Because D1 dedupes
   vocabulary on `german + level + topic`, the embedded-article form would have
   dodged dedupe against any existing row. Articles are stripped; the `article`
   column (still enforced by the audit for nouns) is the single source of truth.
2. **Arabic formality mismatch (fix applied).** `Ich zeige Ihnen …` is formal;
   the Arabic gloss used the informal singular `سأريك`. Now `سأُريكم`.
3. **Arabic style (fix applied).** `أرقى تهذيباً` is stilted MSA calque territory;
   replaced with `أكثر تهذيباً`. Also `will الفظة` → `will غير اللبقة`.

Re-verified after fixes: audit passes (5 scenarios, 49 vocabulary, 42 phrases,
4 grammar, review "pending"), tests/arrivalRoster.test.ts 11/11.

## Round 2 — zero issues

Checked row by row with fresh attention to:

- **Article/gender** for every noun (now also cross-checked against the
  `article` column): Flughafen der, Pass der, Bordkarte die, Koffer der (pl.
  die Koffer), Gepäck das (no plural change), Ankunft die, Gepäckschalter der,
  Verspätung die, Bahnsteig der, Gleis das, Abfahrt die, Fahrkarte die,
  Verbindung die, Fahrplan der, Brötchen das, Brot das, Vollkornbrot das,
  Scheibe die, Kuchen der, Croissant das, Kaffee der, Wochenende das, Samstag
  der, Zeit die, Heizung die, Wasserhahn der, Küche die, Kaution die, Miete
  die, Mietvertrag der, Termin der, Dienstag der, Hilfe die — all correct.
- **du/Sie register**: airport/station/bakery/landlord openers and all their
  phrases use Sie consistently; friend_catchup uses du exclusively (dich, dir,
  machst, hast, Schreib); no scenario mixes.
- **Calques and naturalness**: no German-syntax calques found in the Arabic
  (e.g. `لنشرب قهوة معاً` and `ما رأيك بالغد؟` read naturally; `هل يمكنني
  قراءة هذه الفقرة…` is normal written Arabic). Grammar rule texts are
  instructional register, not dialogue, and read naturally.
- **Over-certain bureaucracy claims**: none. The only rent/deposit/contract
  rows are question-form or first-person statements about the learner's own
  situation (`Ich habe eine Frage zur Miete und zur Kaution.`). Nothing asserts
  fees, deadlines, mandatory documents or legal rules.
- **Verbatim usability**: every example sentence is speakable as-is in its
  scenario; no example requires context the learner will not have.

Because round 2 found zero issues, `review.status` is set to `approved` with
the required AI self-review attribution below (no human has reviewed this).
