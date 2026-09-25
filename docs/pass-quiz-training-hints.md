# Pass — Quiz correctness, training on-ramp, multi-move hints, sales link

**Date:** 2026-09-25 · verified against the live worker and the live D1 content.

## What changed

| Area | Change | Where |
|---|---|---|
| Quiz correctness | A vocabulary question's prompt is now the **headword** (with article), never an example sentence. The example ships alongside as context. Root cause of the reported prompt/answer mismatch. | `src/lib/utils/quizGenerator.ts`, `src/features/quiz/QuizScreen.tsx` |
| Quiz answerability | Distractors are chosen so two options can never mean the same thing (`optionsCollide`: harakat/tatweel-normalised containment). A question with fewer than 4 honest options is dropped instead of collapsing. | `src/lib/utils/quizGenerator.ts` |
| D1 content defect | 5 vocabulary rows carried glosses that could not be told apart from another row's gloss. Corrected **in the data**, not by patching app logic. | `scripts/fix-quiz-content.mjs` → live D1 |
| Content edit path | `vocabulary` / `starter_phrases` had no update route (`/admin/upload` is insert-only and would have duplicated the headword). Added rowid-keyed, column-allowlisted `content-list` / `content-update`. | `cloudflare-admin.js` |
| Training on-ramp | Entering a scenario now leads Study → Quiz by default, with an explicit, visually secondary **"تخطَّ التدريب"** override that records `trainingSkippedAt`. The skip never bypasses CEFR gating or vocabulary injection — the live session does not read that record. | `src/features/study/ScenarioDetailScreen.tsx`, `src/types/models.ts` |
| Hints | `/ai/hints` returns **2–4 distinct conversational moves** (agree / disagree / answer / add detail / ask follow-up / clarify / uncertainty / deflect) instead of one suggestion, each tagged with its intent. Duplicate sentences and two options making the same move are dropped server-side; the client shows one and reveals the rest behind an expander. | `cloudflare-hints.js`, `src/components/common/HintOption.tsx`, `src/lib/utils/hintIntents.ts` |
| Sales link | The app links to the separate sales site in the Pro paywall and on the redemption screen. The app still never takes a payment — it only redeems a code. | `src/lib/utils/links.ts`, `PaywallModal.tsx`, `SubscriptionRedemptionScreen.tsx` |

## Live evidence

**Quiz content audit** (`node scripts/audit-quiz-content.mjs` — read-only, pulls live content and replays the real generator):

```
scenarios=5 vocabulary=114
embassy_appointment  → 29 questions      cafe_order   → 27
job_interview        → 24 questions      doctor_visit → 28
apartment_viewing    → 26 questions
=== MISMATCHES === total mismatches: 0
=== COVERAGE GAPS === total gaps: 0
```

Every scenario has all four CEFR levels populated (20–25 vocabulary rows + 4 starter phrases each), so the "no quiz exists for this scenario" gap does not occur and nothing had to be generated.

**Gloss corrections applied and read back through the public API the app reads:**

```
#54 einreichen    "يقدّم"             → "يقدّم طلباً"        OK
#61 vorlegen      "يُبرز / يقدّم"      → "يُبرز (وثيقة)"      OK
#36 Beschwerden   "أعراض / شكاوى"     → "شكاوى/آلام"         OK
#79 köstlich      "شهي"               → "لذيذ جداً"          OK
#96 Führungskraft "قائد/مدير تنفيذي"  → "قيادي تنفيذي"       OK
```

Re-running the audit afterwards still reports **0 mismatches / 0 gaps**.

Residual (honest): the independent collision sweep still lists 5 same-topic pairs whose glosses overlap textually — `Miete`/`Mietvertrag`, `Dokument`/`vorlegen`, `lecker`/`köstlich`, `Arbeit`/`arbeiten`, `Stelle`/`sich bewerben`. Each is a real noun/verb or degree distinction (rent vs lease contract, delicious vs very delicious), and `pickDistractors` guarantees no two of them can appear in one question, so no question is unanswerable. They are flagged for human content review, not as quiz defects.

**Deployed worker** (`katzu-test`, version `841407c4`):

```
GET  /health                              → 200 healthy, ready:true, fallback ready (no key metadata)
GET  /admin/api/overview   (+secret)      → 200 registry available
GET  /admin/api/content-list (+secret)    → 200 row #54 read back
POST /admin/api/content-update (+secret)  → 400 invalid_columns (allowlist enforced)
POST /admin/api/content-update (no secret)→ 401
POST /ai/hints             (no auth)      → 401
GET  /crypto/health                       → 200 ok:true, ready:false
POST /crypto/webhook       (no signature) → 401 invalid_signature
```

Unit coverage added: `tests/hints.test.ts` (11 tests — distinct moves survive, same-move rephrasings and duplicate sentences are dropped, non-Arabic glosses rejected, `belowTarget` reported honestly, cache hit avoids a second model call, auth happens first) and `tests/adminContent.test.ts` (5 tests — the rowid-keyed update path and its column/level guards). Full suite: **24 files / 220 tests passing**, `tsc --noEmit` clean.

## Still open (operator action, cannot be done from code)

1. **NOWPayments is unconfigured** — `/crypto/health` reports `apiKeyConfigured:false`, `ipnSecretConfigured:false`, `ready:false`. Set `NOWPAYMENTS_API_KEY` + `NOWPAYMENTS_IPN_SECRET`, verify with `scripts/verify-crypto-live.mjs` in `test_mode`, then switch `NOWPAYMENTS_ENVIRONMENT` to `live_mode`.
2. **Local Syria payment details are placeholders** on the live sales site (`sales.js` CONFIG still holds `FILL — رقم Syriatel Cash`, `FILL — رقم MTN Cash`, `FILL — اسم المصرف…`, `FILL_TELEGRAM_HANDLE`). The page shows a loud warning until they are filled.
3. **Admin secret rotation** — see the launch checklist; the current value has been shared in plain text.
