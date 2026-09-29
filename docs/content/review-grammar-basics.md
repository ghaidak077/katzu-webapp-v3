Adversarial self-review of `docs/content/supplements/grammar-basics.json`. Same
model ported and reviewed this content, so this file is written to be falsifiable:
the one defect below carries the exact string that was wrong and the check that
now fails if it returns.

Scope: four `grammar` rows that `SCENARIO_GRAMMAR_IDS`
(`src/lib/content/scenarioGrammar.ts`) already points at for the five scenarios
that shipped before the drafted modules. They are ports of
`src/lib/db/katzuDb.ts`'s fixture rows, not new content — the point is to give
production D1 a row for ids the app already asks for.

## Round 1 — 1 defect found and fixed

### `rule_de` carried English text in a German-only field

`g_polite_requests_a1.rule_de` read:

> `Können Sie ...? is a polite question; the infinitive stands at the end.`

"is a polite question" is English in the column the learner reads *as German*. The
curriculum audit only requires `rule_de` to be a non-empty string, and no test
checked the language of a `rule_de` string, so the fixture shipped it unnoticed.

Fix: `Können Sie ...? ist eine höfliche Frage; der Infinitiv steht am Ende.` The
same edit was applied to the fixture (V14) so the two copies stay byte-identical;
`tests/grammarReachability.test.ts` now compares all eight columns of every
shared id and fails if either side is edited alone.

## Round 2 — zero defects

Checked each row against its fixture original, field by field, for the four rows
(`g_polite_requests_a1`, `g_articles_a1`, `g_verb_position_a1`,
`g_modal_moechte`): ids, levels, German and Arabic fields, examples and
explanations all match. Then checked the things a diff cannot see:

- **The ids are the ones the map asks for.** All four appear as values in
  `SCENARIO_GRAMMAR_IDS`; the test asserts this in both directions (no orphan row,
  no dead link).
- **The levels match how they are used.** All four are A1, which is the level of
  the fixtures that read them (cafe_order / doctor_visit / apartment_viewing /
  job_interview open at A1).
- **No column is invented or omitted.** The test validates every row against
  `CONTENT_COLUMNS.grammar` — the same contract the audit and the loader use — so a
  typo here would be a write-time 500, which is exactly the V12 failure mode.
- **Nothing here is a rewrite of shipped content.** No live row is updated: these
  ids are absent from D1 (`g_%` grammar rows were created by the module loads, and
  these four are not among them), so a future load would be an insert.

## What a human should spot-check first

- `g_polite_requests_a1.rule_de` — the one field rewritten in this pass, and the
  only place German was authored rather than ported.
- `g_articles_a1.explanation_ar` mentions the app's own gender colours
  (الأزرق/الوردي/الأخضر). That is intentional product copy, but it is the kind of
  claim that should track what the UI actually renders.
- `g_verb_position_a1.example_de` shows both orders in one line
  (`Heute trinke ich einen Tee. / Ich trinke heute einen Tee.`). Correct, and a
  native speaker is the right judge of whether the slash reads clearly in a card.

## Not in scope, recorded instead

The four legacy D1 grammar rows (`akkusativ_articles`, `dativ_prepositions`,
`konjunktiv_ii`, `perfekt_tense`) stay as they are — the owner decided on
2026-09-29 **not to rename them**. They are therefore not referenced by
`SCENARIO_GRAMMAR_IDS` and remain unreachable-by-design from Guided Practice; the
reachability test covers the repo's own content, and this exception is recorded in
`docs/AGENT-STATE.md` rather than silently encoded in a test.

`embassy_appointment` is a live-only scenario (it is not in the offline fixture),
so this supplement gives it a rule in production that the repo cannot assert
end-to-end. Its map entry (`g_polite_requests_a1`) is added in V14 for that reason.
