# Content Gate

Provenance: moved **verbatim** from `AGENTS.md` v6 §4 during the v7 split. It is normative —
`AGENTS.md` v7 §0 and §10 both point here, and only the owner edits it.

AI-authored curriculum is **permitted** under this gate.

**Contract.** Follow `docs/CONTENT-AUTHORING-PROMPT.md` (schema) and
`docs/CONTENT-STRATEGY-ROADMAP.md` (story, personas, order). A module holds **5–8 scenarios**.
Categories/topic pools come from `src/lib/utils/scenarioVocab.ts` (verify; includes `travel`).
Scenario→grammar links live in `src/lib/content/scenarioGrammar.ts` (no schema change).

**Pre-authoring checklist (read BEFORE writing rows):**
- Headwords follow the existing convention (`rg` module1 and fixtures first); nouns keep article and
  plural in their own fields.
- Arabic matches the German register (Sie → formal/plural address; du → informal).
- No bureaucracy claims with numbers, fees, deadlines or document lists. Keep it generic; flag
  uncertainty in the confidence note.
- Every pool word appears verbatim in a starter phrase or opener.
- `ai_persona` strings copied verbatim from the existing fixture for recurring personas; same du/Sie.
- Ids not in D1 or fixtures, unless deliberately replacing a fallback; then list them in
  `OWNER-OPEN`: "confirm ids absent from production D1 before --commit".
- German stays LTR-isolated. Arabic natural and short.

**Gate, per module, in order:**
1. `node scripts/audit-curriculum.mjs --file=<module>.json`: fix every error.
2. Adversarial self-review row by row: article/gender, du/Sie, calques, unnatural Arabic, over-certain
   bureaucracy claims. Fix, re-review, max 3 rounds.
3. Approval needs a written `docs/content/review-<module>.md` listing, per round, the defects found
   and fixed. Approve only after a later round listing zero defects. Then
   `review.status="approved"`, `reviewedBy="AI self-review — <model>, no human review"`,
   `reviewedAt`=real timestamp. The same model reviews itself, so the file must say what a human
   should spot-check first. **Never write a human name.** Issues left after 3 rounds → `"pending"`.
4. Loader gate: `node scripts/load-curriculum.mjs --file=<module>.json --dry-run` (validates, prints
   row counts, needs no secret, writes nothing). If `--dry-run` is missing, adding it is a code item.

**Never:** change/redefine existing content IDs; rewrite approved rows in place; duplicate ids to hit
a count; invent filler; write to production D1. The owner runs `--commit`. The app must show honest
empty states for missing content.

**Always:** each scenario has ≥1 grammar row it uses; every vocabulary word appears in a phrase or
opener before any quiz.
