# Katzu Agent State Ledger

Status for `AGENTS.md` §6. Rules live in `AGENTS.md`; this file records status and evidence only.

## ITEMS

| ID | Status | Evidence / blocker |
|---|---|---|
| Baseline | done | Historical baseline recorded before this continuation: `npm run lint` passed; `npx tsc -p e2e --noEmit` passed; `npm test -- --run` passed 62 files / 718 tests; `npm run build` passed (entry 490.60 kB / 157.56 kB gzip; 83 precache entries, 3978.03 KiB). Branch `launch-hardening`; original work checkpoint `6ddb39f`. |
| Chat-bubble assertion move | done | Assertion moved into live-interaction test after turn one, while transcript messages are mounted. Historical `npm run lint && npx tsc -p e2e --noEmit` passed after the edit. The focused live-interaction browser test after this move remains unproven; see UNPROVEN/B8. |
| Banner stabilization | done | Replaced the race-prone geometry check with waits for the lazy-loaded cafe card, visible banner, and exact image source. `npx playwright test e2e/banner.spec.ts --workers=1` passed twice, 2 tests per run, per prior ledger evidence; fix checkpoint `8a65edf`. |
| Conversation layout | done | `npx playwright test e2e/conversationLayout.spec.ts --workers=1` passed twice, 2 tests per run, per prior ledger evidence. |
| Public demo | done | `npx playwright test e2e/demo.spec.ts --workers=1` passed twice, 1 test per run, per prior ledger evidence. |
| B1. Content contract | done | `npm test -- --run tests/curriculumAudit.test.ts`: 25/25 passed, including 5 and 8 accepted and 4/9 rejected. `node scripts/audit-curriculum.mjs --file=docs/content/curriculum-30day-module1.json`: recorded pass (5 scenarios, 74 vocabulary, 30 phrases, 10 grammar, review pending). `npm test -- --run`: recorded pass, 62 files / 721 tests. `npm run lint && npx tsc -p e2e --noEmit`: recorded pass. These are historical results from the previous ledger, not rerun in this session. No production D1 write. |
| B2. Learning-loop wiring | done | `npx tsc --noEmit` and `npm run lint` passed; `npx vitest run tests/journeyV2.test.ts tests/workerClient.test.ts tests/aiRoutes.test.ts tests/srsEngine.test.ts tests/reviewStore.test.ts tests/reviewSync.test.ts tests/progressGrammarSync.test.ts` passed 7 files / 130 tests; `npm test -- --run` passed 63 files / 730 tests; `timeout 540 npx playwright test e2e/journey.spec.ts --grep 'Guided Practice rehearses real lines and grades honestly|Live Interaction runs a turn with the orb and keeps the typed path open' --workers=1 --reporter=line` passed 2/2; `node --check cloudflare-ai-chat.js && node --check cloudflare-unified-worker.js` passed; `git diff --check` passed. Written trace: Guided Practice selects scenario vocabulary (deduped, max 12 terms × 80 chars) and a grammar ID; `onReady` puts that context in route state; LiveRoute bounds it again and WorkerClient serializes it. Worker rejects invalid/oversized untrusted context, places the terms in a data-only prompt, resolves grammar IDs from D1, and emits a link/reference only when the AI marks a correction and echoes that resolved ID exactly. The client checks the nested response identity; the correction and mistake store it additively; SRS review retains it, shows the linked Arabic rule and German example only when IDs match, and review/progress sync validates and round-trips the optional reference. Without Guided Practice context, without a D1 grammar row, or for a correct/unmatched correction, the link is empty; previous stored records remain valid. T1 full Vitest passed `npm test -- --run`: 63 files / 730 tests; related browser regression group passed `timeout 540 npx playwright test e2e/journey.spec.ts --grep 'Guided Practice rehearses real lines and grades honestly|Live Interaction runs a turn with the orb and keeps the typed path open' --workers=1 --reporter=line`: 2/2. Visual inspection of rendered linked-reference content remains part of broader B6/B8 checks. No D1 or production writes. |
| B3. Content authoring | done | Decisions of 2026-09-28 applied. STEP 0: B2 committed as `6f17608`; stalled B3 pre-work (module1 claim-softening, fixture openers/vocab) as `ad7b19b`; audit of module1 re-run in this session: passed (5 scenarios, 74 vocab, 30 phrases, 10 grammar, review pending — module1 stays pending by decision 4, untouched). New module `docs/content/curriculum-arrival-module2.json` authored with existing ids (airport_arrival, train_station, bakery_shopping) plus new landlord_followup and friend_catchup: 5 scenarios, 49 vocab (travel 16 / food 18 / housing 15), 42 phrases, 4 grammar; audit passed (`node scripts/audit-curriculum.mjs --file=docs/content/curriculum-arrival-module2.json` → no errors). Decision 3: `SCENARIO_GRAMMAR_IDS` in `src/lib/content/scenarioGrammar.ts` (no schema change). Decision 2: `seedArrivalTopUps` in `src/lib/db/katzuDb.ts` adds the two new scenarios + 12 phrases + 16 vocab rows at ids ≥ 2000, per-id guarded `add`, idempotent, wired into App launch after `initializeDatabaseSeed`. Decision c: `tests/arrivalRoster.test.ts` gates every roster scenario (4 openers, 6–10 contiguous phrases, 15–40 topic pool, no isolated vocabulary, ≥ 1 grammar row via the map, Sie/du register, no certain bureaucracy claims) and exercises the seed layer on fake-indexeddb (fresh add, no overwrite of a simulated D1 row, idempotency). Decision d: adversarial review rounds recorded in `docs/content/review-arrival-module2.md`; round 1 fixed 3 issues (33 bare headwords, Arabic formality, Arabic style), round 2 zero issues → review.status approved with "AI self-review — GLM 5.3 Flash, no human review", reviewedAt 2026-09-28T08:55:00Z. Verification this item: audit passed as above; `npx vitest run tests/arrivalRoster.test.ts` 11/11; `npm test -- --run` 64 files / 741 tests; `npm run lint` (tsc) passed; `node --check` both workers; `git diff --check` clean. No production D1 writes; loader dry run NOT run (see UNPROVEN). |
| B4. Performance | todo | Not started. No before/after build measurement. |
| B5. Reliability | todo | Not started. No complete `/app/*` offline audit or network-drop-mid-recording regression evidence. |
| B6. Accessibility | todo | Not started. No axe scan evidence. |
| B7. Docs and contradiction sweep | done | Interrupted documentation reconciliation checkpointed as `7ed92f4`. Read `docs/CONTENT-AUTHORING-PROMPT.md` and `docs/CONTENT-STRATEGY-ROADMAP.md`; `rg` contradiction sweep over docs and repository files (excluding the manual itself, whose resolved-conflict table intentionally names old statements) returned no conflicting matches. `AGENTS.md` already contains the supplied v3 manual; no content change was needed. Owner-only `LAUNCH-CHECKLIST.md` §2 untouched. |
| B8. Final gate and merge | todo | Final T2 and merge not run. |

## DECISIONS

- Supplied v3 manual is already the exact current `AGENTS.md` content observed at session start, so it was left intact rather than rewritten unnecessarily.
- Freebuff's Changes panel owns Save/Share/commits/push/PRs. Prefer code and verification only; no Git delivery commands were requested or run during this continuation.
- The interrupted full `journey.spec.ts` run was killed and is not a pass. Per §2.4, run the remaining journey tests in synchronous groups of at most three in B8; do not repeat the timed-out full-file command.

## UNPROVEN

- B3: **loader dry run: not run, needs owner secret** (`ADMIN_SECRET` absent from the environment). The audit CLI and the test gate have run, but `scripts/load-curriculum.mjs` (dry-run mode, never `--commit`) has never executed against module2. The app-side seed layer is tested on fake-indexeddb, not on a real device database.
- B3: no human review of module2 content; review attribution is AI self-review only.
- B8: `e2e/journey.spec.ts` complete run. A full-file invocation was killed mid-run; split the file into groups of ≤3 tests and run each synchronously.
- B8: the live-interaction transcript/bubble-count regression after relocating the assertion; include its focused test in a ≤3-test group.
- Visual preview inspection, 360px/390px screenshots, offline network-drop recording behavior, and axe scans remain unverified.

### Per-scenario confidence notes (module2) — what a human should spot-check first

- `airport_arrival`: highest confidence overall. Spot-check the German of the b2 opener ("Seit Ihrer Ankunft fehlt also Ihr Gepäck") for the slightly emphatic "also", and the Arabic plural in "خبزتان صغيرتان" against natural spoken usage.
- `train_station`: high confidence. Spot-check that "Bahn katze" matches any live D1 persona row before loading (it is copied from the local fixture, and D1 wins).
- `bakery_shopping`: high confidence. Spot-check "Darf es sonst noch etwas sein?" — idiomatic but register-sensitive; a native speaker may prefer a variant.
- `landlord_followup`: medium confidence (new scenario). Spot-check the b1 opener's elliptical confirmation ("Sie haben gesagt, die Heizung ist kaputt?") and that the phrasing stays natural for a phone call; also confirm the Vermieter katze persona continuity with apartment_viewing is desired on live D1.
- `friend_catchup`: medium confidence (new scenario, du register). Spot-check "Na, wie geht es dir? Erzähl mal!" for tone and the whole scenario for level-appropriate informality; it is the module's only du-register scene.

## OWNER-OPEN

- **B3 loader dry run + commit path (owner-only, needs ADMIN_SECRET):**
  ```
  ADMIN_SECRET=<your secret> node scripts/load-curriculum.mjs --file=docs/content/curriculum-arrival-module2.json
  ```
  Dry run first, inspect the output, and only then decide on the explicit `--commit` path. The same applies to the still-pending module1 draft. Never paste the secret into chat.
- Existing `docs/LAUNCH-CHECKLIST.md` §2 owner-only actions remain untouched.
