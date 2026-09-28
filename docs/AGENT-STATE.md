# Katzu Agent State Ledger

Status for the ordered backlog in `AGENTS.md` §6. Historical context is retained only where it records verified work; current rules live in `AGENTS.md`.

## ITEMS

| ID | Status | Evidence / blocker |
|---|---|---|
| Baseline | done | Initial checks recorded before this continuation: `npm run lint` passed; `npx tsc -p e2e --noEmit` passed; `npm test -- --run` passed 62 files / 718 tests; `npm run build` passed (entry 490.60 kB / 157.56 kB gzip; 83 precache entries, 3978.03 KiB). Branch `launch-hardening` based on `7c7a594`. Existing work checkpointed as `6ddb39f`. |
| Chat-bubble assertion move | done | `e2e/journey.spec.ts`: bubble check is in the live-interaction spec while live transcript cards are mounted, after turn one; the previous whole-loop assertion was removed. A prior whole-loop grep passed before the final assertion relocation; latest relocation is supported by T0 checks (`npm run lint && npx tsc -p e2e --noEmit` passed) but still needs its grouped B8 browser run. |
| Banner stabilization | done | Fixed race by waiting for the lazy-loaded cafe scenario card, visible banner, and exact image source before geometry measurement. `npx playwright test e2e/banner.spec.ts --workers=1` passed twice after the wait change (2 tests each run). Checkpoint `8a65edf`. |
| Conversation layout | done | `npx playwright test e2e/conversationLayout.spec.ts --workers=1` passed twice (2 tests each run). |
| Public demo | done | `npx playwright test e2e/demo.spec.ts --workers=1` passed twice (1 test each run). |
| B1. Content contract | done | `npm test -- --run tests/curriculumAudit.test.ts`: 25/25 passed, including 5 and 8 accepted and 4/9 rejected. `node scripts/audit-curriculum.mjs --file=docs/content/curriculum-30day-module1.json`: passed; 5 scenarios, 74 vocabulary, 30 phrases, 10 grammar, pending. `npm test -- --run`: 62 files / 721 tests passed. `npm run lint && npx tsc -p e2e --noEmit`: passed. Implemented the formerly missing CLI against the existing pure audit module. No loader or D1 write. |
| B2. Learning-loop wiring | todo | No implementation/evidence yet in this continuation. |
| B3. Content authoring | todo | Existing draft remains pending. Per-scenario confidence notes and review outcomes are not yet produced. `scripts/load-curriculum.mjs` and `scripts/` are absent in the current workspace; no D1 writes. |
| B4. Performance | todo | No before/after build measurement from this continuation. |
| B5. Reliability | todo | No complete route-by-route offline audit or network-drop-mid-recording regression test in this continuation. |
| B6. Accessibility | todo | No axe scan evidence in this continuation. |
| B7. Docs | doing | Updated current policy references and the stale authoring/roadmap/current-state/draft/log docs. Still performing repository-wide contradiction sweep; owner-only LAUNCH-CHECKLIST §2 left unchanged. |
| B8. Final gate and merge | todo | **UNPROVEN:** full `journey.spec.ts` invocations were killed by the terminal deadline; they are not passes. Prior `--grep "Journey Home|first episode" --workers=1` passed twice (2 tests per run); the previously recorded `whole loop` focused pass predates the final assertion relocation. Remaining Journey tests and T2 gates must be run in groups of at most 3. No merge. |

## DECISIONS

- The supplied v3 manual replaces the prior manual exactly. Workspace rules prohibit background commands even though the old manual allowed them; synchronous, grouped test runs are used.
- The repository’s curriculum audit CLI and loader referenced by older docs are absent. B1 may add the missing audit entry point if it can reuse the existing pure validator; no loader, secret, or production database behavior will be fabricated.
- Historical records are annotated as historical rather than rewritten to claim past work followed the new policy. Current authoring policy links to `AGENTS.md` §4.

## UNPROVEN

- `e2e/journey.spec.ts` as a whole; complete its 12 tests in ≤3-test grep groups, one worker.
- The live interaction bubble-count regression after its latest assertion relocation.
- B1 audit CLI execution against `docs/content/curriculum-30day-module1.json` until the CLI has been implemented and exercised; any prior report is historical only.
- B3 loader dry run: loader script is absent from the workspace.
- Visual preview inspection, 360px/390px screenshots, offline network-drop recording behavior, and axe scans are not verified by this ledger yet.

## OWNER-OPEN

- None newly identified in this continuation. Existing launch checklist §2 actions remain owner-only and untouched.
