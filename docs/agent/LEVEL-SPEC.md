# LEVEL-SPEC — Katzu's five teaching levels (V21 Phase 1)

Owner-approved shape: one level system, five rungs (A0–B2), same scenario playable at every rung.
**Complexity comes from the level spec, not from separate content copies.** The code below is
authoritative; this document explains it. The typed module is `src/lib/levels/levelSpec.ts`, the
worker-side enforcement twin is `cloudflare-level-spec.js`, and `tests/levelParity.test.ts` fails
if the two ever drift.

## The rungs

| | A0 (from zero) | A1 | A2 | B1 | B2 |
|---|---|---|---|---|---|
| Max words per German sentence | 6 | 8 | 10 | 12 | 15 |
| Allowed tenses | Präsens | + Perfekt | + Präteritum | + Futur, Konjunktiv II (würde-form) | all, incl. real KII |
| Connectors | und, oder, aber | + denn, dann | + weil, dass, wenn, deshalb | + obwohl, damit, bevor, nachdem, während | free |
| Corrections per turn (most important first) | 1 | 1 | 2 | 3 | 3 |
| Arabic support | always shown | default shown | on tap | hidden by default | hidden by default |
| Speaking speed (TTS rate multiplier) | 0.75 | 0.85 | 0.95 | 1.0 | 1.05 |
| Formality (Sie/du) | **always set by the scenario** — the persona owns the register; the level never overrides it |

## Rules the implementation enforces

1. **One spec, two homes, parity-tested.** The client needs the spec for UI defaults (Arabic
   visibility, TTS speed, turn pacing). The worker needs it for *enforcement*, and the worker is
   plain JS that cannot import TS — so `cloudflare-level-spec.js` is a deliberate mirror, and
   `tests/levelParity.test.ts` parses both files' `LEVEL_SPECS` and asserts deep equality. Drift
   between the two is a red test, not a review hope.
2. **The server validates, repairs once, then falls back.** After the model answers `/ai/turn`,
   the worker runs `validateGermanAgainstLevel(reply_de, spec)`: per-sentence word cap, tense
   markers outside the allowed set, subordinators outside the allowed set. On violation the model
   gets **one** repair call ("shorten/simplify to obey these caps, keep the meaning"); if the
   repair still violates, a **deterministic fallback line** (per-level table, no pronouns, safe
   for Sie and du personas) is served with the model's evaluation of the *learner's* sentence
   kept. The reply a learner reads is never off-spec, and the turn is still one AI call in the
   normal case, two in the worst case (same as before for retries).
3. **A0 is a first-class level.** `CEFRLevel` is widened to `'A0' | 'A1' | 'A2' | 'B1' | 'B2'`.
   Stored content keeps using A1–B2 (D1 rows are unchanged); A0 pools come from the
   a0-foundations module when it loads (Phase 5). Before that module exists, the placement
   generator's `nearestLevelWithItems` serves A0 questions from the closest level that has
   content, so the check never dead-ends.
4. **Placement stays deterministic and short.** The existing 2-up/1-down staircase is extended:
   floor `A0`, question budget 5–10 (was 6–14; five is the honest minimum for reporting a level),
   plus the "start from zero" path on the intro, the manual pick, and the learner-editable level in
   Settings. No AI anywhere in it.
5. **The free tier covers the beginner floor.** Free learners may be served **A0 or A1** (was A1
   only): a learner the placement measured at A0 gets A0 conversations, not a level they were
   just measured below. A2+ stays Pro, unchanged. `servedLevel` returns a free learner's measured
   level when it is A0, else A1.
6. **Arabic support is a default, not a cage.** The spec sets the *initial* visibility of the
   existing translation toggles (per-message and the global switch, both already built). A0
   opens with Arabic on and it stays on unless the learner hides it; every level above keeps the
   learner's manual override — "hidden by default" never means "removed".
7. **Prompt-side and gate-side agree.** The roleplay prompt carries the level's caps as one
   compact line (stable per level → provider prefix cache stays warm), and the validator enforces
   the same caps after the answer. The coach is told the per-level correction budget so it
   corrects at most N errors, most important first.
8. **Wire format unchanged.** No new request fields, no response-shape change: `/ai/turn` keeps
   its schema, the client keeps sending `cefr_level` (now including `A0`), and every existing
   scenario keeps working at every level. Zero AI calls before the first message (V19) and one
   fused call per turn are preserved; the V19 hint-floor behaviour and its regression tests are
   untouched.

## Known determinism limits (honest boundaries)

- Tense/connector checks are marker-based (a closed list of frequent forms), not grammar parsing:
  `könnte` is deliberately ambiguous (Präteritum *and* KII) and is allowed wherever Präteritum
  is allowed. The validator is a floor, not a CEFR examiner.
- The word cap counts whitespace-separated tokens per sentence; ellipses and dashes can split a
  spoken sentence that punctuation does not.
- The validator watches the *model's* German. The learner's sentence is graded by the model,
  exactly as before.
