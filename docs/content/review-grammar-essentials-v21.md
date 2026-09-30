# Review — `supplements/grammar-essentials-v21.json`

Supplement: the three essential rules the live 22 rows did not cover — present-tense conjugation, nicht/kein negation, adjective endings after the definite article. 3 grammar rows, wired to `first_greetings`, `supermarket_checkout` and `apartment_viewing` via `SCENARIO_GRAMMAR_IDS`.

Gate followed: `docs/agent/CONTENT-GATE.md` (supplement path). Reviewed by AI self-review; **no human review**.

## Round 1 — machine audit + adversarial read (1 machine error + 1 defect found, both fixed)

1. **E — `rule_de` "looks like English"** on the negation row: I had written German metalanguage with English words ("negates nouns with articles"). Fixed: rewritten in German (`kein + Nomen verneint Namen …`).
2. **Adversarial read:** the other two rows opened with English metalanguage too ("Regular verbs:", "After the definite article:") — one English word each, below the checker's two-word threshold, but the same defect class. Fixed pre-emptively: both rules rewritten in German.

## Round 2 — re-review after the fixes (zero defects)

All three rows re-checked: case/gender in the German rules (keinen Kaffee — Akkusativ negation; adjective endings -e singular / -en plural after the definite article all conform), Arabic naturalness (no calques, no transliterations, no السلام عليكم), `example_ar` Arabic-only, ids `g_`-prefixed and absent from every draft, the fixture and the 18 live rows, no bureaucracy claims (pure grammar rows). **Zero defects found.**

## What a human should spot-check first

1. **`g_a1_negation_nicht_kein`'s Arabic explanation** — the "kein vs nicht" decision rule is the highest-traffic teaching line in this supplement; a native eye should confirm the Arabic is as decisive as intended.
2. **`g_a0_praesens_konjugation`'s scope** — it teaches the -e/-st/-t pattern plus sein/haben by name only; confirm that is the right A0 slice (stem-changing verbs are deliberately excluded).
3. **The adjective-endings example** (`Der neue Kollege ist nett und die neue Chefin auch.`) — confirm the mixed nominative example reads naturally rather than like a drill.
