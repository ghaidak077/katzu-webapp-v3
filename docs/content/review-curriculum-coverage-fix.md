# Content review — curriculum-coverage-fix.json

- **Module**: coverage-fix (5 scenarios, 75 vocabulary, 30 phrases, 8 grammar)
- **Purpose**: master plan §3.5 fix list. Measured 2026-09-30 on live D1 (380 vocabulary rows): **49 words appeared in no phrase or opener of their own topic pool** — every one traces back to the five legacy scenarios that ship only one phrase per level (`job_interview`, `doctor_visit`, `embassy_appointment`, `cafe_order`, `apartment_viewing`). This module adds one dense scenario per affected pool so every word becomes reachable **without editing any existing row** (owner decision D4 is not touched).
- **Categories**: existing ones only — `official` (documents), `daily_life` (food), `health`, `housing`, `work`. Owner decision D1 (new categories) is NOT needed and NOT exercised.

## Adversarial rounds

**Round 1** (mechanical + purity):
- 3 garbled Latin-in-Arabic defects found and fixed: a phrase Arabic field with the English word "responsibly" embedded, `der Balkon` example with "Facing" mixed into Arabic, `die Führungskraft` example with "يulnerable". All rewritten pure Arabic.
- Grammar `title_ar`/`rule_ar`/`explanation_ar` legitimately carry German terms inline (der/die/das, möchte, zuständig für) — the convention every approved module uses. Not a defect.

**Round 2** (German naturalness):
- 1 stiff learner line found: "Der Geschmack ist köstlich — wie erfolgt die Zubereitung?" — bureaucratic "erfolgt" phrasing. Rewritten as a natural question: "Können Sie mir sagen, wie man dieses Gericht zubereitet?"
- Plural spot-checks: `die Chefin → die Chefs` (corrected from a draft error), `die Vollmacht → die Vollmachten`, `der Druck` without plural (correct — mass noun).

**Round 3** (final sweep): zero defects. Coverage re-proven **49/49** against the final draft text (article-stripped, ß→ss, inflection-aware matcher). Arabic purity clean. Sie/du register: `pass_und_dokumente`, `restaurant_besonders`, `gesundheit_alltag`, `buero_gespraech_tiefer` are Sie throughout; `wohnung_besichtigen_tiefer` is du throughout (landlord-candidate informal scene, mirrors the live `apartment_viewing` which is also du).

## Gates

- `audit-curriculum.mjs --file=…` **PASSED** (5 scenarios, 75 vocab, 30 phrases, 8 grammar; pools 15/15/15/15/15; 2+ grammar per taught level A1–B2)
- `load-curriculum.mjs --dry-run` PASSED (5/75/30/8)
- `tests/grammarReachability.test.ts` — all 8 `g_fix_*` rows wired into `SCENARIO_GRAMMAR_IDS` (2–3 per scenario), 11/11
- `tests/contentDrift.test.ts` — roster updated, **0 duplicate natural keys** across all 7 modules, 14/14
- `tests/curriculumSupplement.test.ts` — file-count pin updated to 9 files (7 modules, 2 supplements)
- Full suite `npm test` 989/989, `tsc --noEmit` clean

## Duplicate-key avoidance

Two early draft rows (`A1|schmecken|food`, `A2|gültig|documents`) collided with keys owned by existing drafts and were **removed** (the words themselves stay covered — both appear in this draft's phrases and in live pool texts). `die Vorspeise` added as a collision-free replacement. The V16 invariant (no natural key declared by two drafts) holds.

## What a human should check first

1. **German naturalness** of the 30 phrases, especially the B2 lines (`Vollmacht`, `Staatsangehörigkeit`, `Nebenkostenabrechnung` contexts).
2. **Articles and plurals** of all 75 nouns (die Chefs, die Drücke omitted — mass noun, die Vorspeisen, die Etagen…).
3. **Arabic naturalness** of the 105 Arabic strings — Modern Standard, no calques; flagged spot: "يذوق له (طعم)" for `schmecken` is a structural gloss, check it reads acceptably.
4. **Sie/du register** of `wohnung_besichtigen_tiefer` (deliberate du — landlord shows a student the flat) and `gesundheit_alltag` (Sie — doctor).
5. **No bureaucratic claims**: `das Wohnungsamt` example mentions "Wohnzuschuss" (housing benefit) generically — verify no sentence states eligibility rules, amounts or deadlines as fact.
6. Scenario ids (`pass_und_dokumente`, `restaurant_besonders`, `gesundheit_alltag`, `wohnung_besichtigen_tiefer`, `buero_gespraech_tiefer`) are new against all live ids and all 6 other drafts — re-verify against production before any load.

## Load status

`review.status` = **approved** (AI self-review — Freebuff coding agent (Buffy), no human review, 2026-09-30T13:58:42Z). **Not loaded.** Loading requires the owner's `CONTENT-LOAD-AUTHORIZED: docs/content/curriculum-coverage-fix.json` in a prompt, per AGENTS.md §3 and docs/agent/CONTENT-LOAD.md.
