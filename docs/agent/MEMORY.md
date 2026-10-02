# MEMORY — durable facts and mistakes that must survive every session

Read this **second** (after `AGENTS.md`, before `docs/agent/APP-MAP.md`). It is the compact,
curated memory layer: the things that have cost real runs, the ids you should not re-derive,
and the decisions that are frozen. The raw append-only log is `docs/agent/LESSONS.md`; this
file is the digest that is short enough to always read.

**Rules for editing this file (agent-owned):**
- Add a **mistake** only when the root cause is *proven by a tool result* — one line:
  `symptom → proven cause → rule`. No speculation, no "probably".
- When the same trap recurs, move it up, not out. If it repeats 2× and a section of
  `AGENTS.md` would prevent it, propose the change in the report (never edit §3 yourself).
- Keep it under ~140 lines. Prune anything already encoded in `AGENTS.md`.
- **Update in the same commit** as the change it describes. If a durable fact changes (URL,
  id, quota, level range), fix the row here immediately.

*Last consolidated: 2026-10-02 (V28).*

---

## A. Canonical facts (do not re-derive; remeasure only if a command fails)

| Fact | Value |
|---|---|
| Repo root | `C:/Users/Lenovo/Desktop/k1/katzu` (shell starts at `/c/Users/Lenovo/Desktop/k1`) |
| Branch of record | `launch-hardening` (named in the ledger, not hardcoded) |
| Remote | `github.com/ghaidak077/katzu-webapp-v3` |
| Node here / in CI | v24.14.0 here; **24.15.0** pinned in CI (EBADENGINE warning here is expected) |
| Gate commands | `npx tsc --noEmit` (== `npm run lint`); `npm test`; `E2E_TARGET=preview npx playwright test`; `npm run build`; `node --check cloudflare-*.js` |
| Reporter trap | Vitest = `dot`/default; **`--reporter=line` is Playwright-only and errors in Vitest** |
| Search | `rg` is NOT installed → `grep -rn` / `git grep -n` |
| App / worker / sales | `katzu-webapp-v3.pages.dev` · `katzu-test.ghaidakalosh008.workers.dev` · `katzu-sales.pages.dev` |
| AI free quota | `MAX_FREE_AI_SESSIONS = 3` (`cloudflare-unified-worker.js`) |
| Levels | A0–B2 (`src/lib/levels/levelSpec.ts`) |
| Sign-in | Google-only |
| Payments | NOWPayments **test mode**, `ready:false` |
| Deploy / content gates | `DEPLOY-AUTHORIZED:` / `CONTENT-LOAD-AUTHORIZED:` owner lines only; see `docs/agent/DEPLOY.md`, `CONTENT-LOAD.md` |
| Working tree | CRLF (despite `.gitattributes` pinning LF) |
| Ledger of record | `docs/AGENT-STATE.md` |
| Session start | `npm run session:start` — ledger NEXT + APP-MAP §9 + MEMORY §A + git + OPEN ITEMS (owner-only/unproven) |

---

## B. Frozen decisions (do not relitigate)

1. **§3 is owner-only** — stack, secrets, deploys, payments, force-push. An agent never edits
   §3 or the Content Gate; it proposes.
2. **One framework, one DB, one state system, one HTTP client, one AI provider interface.**
   No new runtime dependency when the stack can do it (dev-only tooling may be added).
3. **Server is authoritative** for entitlements, quotas, identity, sync merges and payments.
4. **Payments never touch the app** — the app only redeems codes; checkout lives on the sales
   site (`sales/`).
5. **Production D1 is content-insert-only**, and only through the gated loader.
6. **No fake success, no weakened or skipped test.** "Pre-existing" needs proof on the base
   commit and is still red.
7. **A pushed commit is not verified until the CI run for that sha is green** (quote the id).

---

## C. Recurring mistakes (the digest — full evidence in `LESSONS.md`)

| # | Symptom | Proven cause | Rule |
|---|---|---|---|
| 1 | Exact-match edit fails / a written `#!` file makes tests red | Working tree is **CRLF**; Vite's hashbang strip leaves a stray `\r` | Re-read exact lines before editing; after writing a `#!` file check `tr -cd '\r' < f | wc -c` is `0`. |
| 2 | A measurement is nonsense | A **stale local server** you did not start answered (dev vs preview look alike) | Check the port is free before *and* after; kill the **listening** PID and the whole `workerd` tree; tell servers apart by `GET /@vite/client` content-type. |
| 3 | "It passed locally" but CI is red | Local run cannot see CRLF/LF, fresh install, or a different Node version | Declare requirements where both see them (`engines.node`, CI pin); quote the **CI run id** for the pushed sha. |
| 4 | A green test hid a real failure | A **test double more forgiving than the engine** invented success | Fakes must throw where the real dependency throws. |
| 5 | Performance "fix" made the metric worse | Judged by the flattering number, not the deciding metric | Judge by the **median of the measurement that decides**; revert if it does not improve; prove the revert with a diff + reproduced build hash. |
| 6 | Content loaded but a learner can't reach it | A **code-level join** (`SCENARIO_GRAMMAR_IDS`) not asserted per artifact | For every code join, assert each artifact is reachable; a rule enforced for one artifact is documentation for the rest. |
| 7 | A schema write 500s on the first row | The **live D1 schema is unversioned** and had drifted from the declared one | Read the real schema (`SELECT name FROM pragma_table_info('<t>')`) and diff it against the payload keys **before** the first production write. |
| 8 | "Is it set?" said yes but auth 401'd | The secret was a **placeholder wrapped in `< >`** — a presence test cannot see a wrapper | Verify secret **shape** without printing it (length, hex-count, first/last code point); never trim/re-encode a secret — hand it back to the owner. |
| 9 | A multi-batch save printed `DONE` and exited 0 after a batch failed | The runner's summary was computed from a different set than its per-item lines | Read every item line; a multi-write exit code must be the **conjunction** of its batches. |
| 10 | A new asset answered 200 but was not deployed | Pages serves the previous deployment for a minute and SPA-fallback returns `index.html` with 200 | Verify by **size + content-type** (and the direct deployment URL); a status code is not evidence. |
| 11 | The wrong deployment looked live | Service-worker **precache** kept the old bundle in the returning profile | Verify painted assets from a fresh/incognito profile; say separately whether the update path was observed. |
| 12 | A transient UI state test flaked only in CI | The **mock answered faster than the state it stands in for** | Make the fake able to hold the state open (`translateDelayMs`); assert the replacement too (`toHaveCount(0)`). |
| 13 | A geometry test passed locally, failed in CI | Position-only changes don't fire `ResizeObserver` | Observe the thing that actually changes (`dir`/active child) and poll the final state. |
| 14 | An edit deleted a neighbouring ledger row (twice) | A one-shot replace whose `newString` **re-emitted** the consumed header and dropped it | Insert a row by replacing **only** the next row's unique id prefix; never retype consumed text; verify with `grep -n` + `git diff --stat`. |
| 15 | An integration probe went red while the product was right | The assertion demanded fresh-ledger numbers against **persistent state** | Disposable state dir, wiped first, assert absolute numbers, own your process. |
| 16 | The hint matcher ranked a greeting first | Lexical overlap without a **stopword class** for greetings/pronouns ranks register, not subject | Exclude greetings/politeness and pronoun/possessive forms from content-word ranking. |
| 17 | A "large unused bundle" item kept directing work for versions | A **stale metric** nobody re-measured (measured 0% unused when finally probed) | Re-measure a performance claim before acting; record metrics with their measurement date. |
| 18 | Review showed questions with no clear answer | Items were built from a field that is not a question (`grammarRule` as the prompt) and nothing validated them before display | Validate every generated item before it is shown; suppress (never delete) the ones that fail. |
| 19 | The chat felt illogical (a hint that ignored the question, a no-op correction, an obstacle on turn 1) | Each output shape was checked for presence, never for whether it answered the turn | Validate the AI's own output against the turn (does the hint answer the question, does the correction change anything); gate behaviours, don't cycle them blindly. |

---

## D. Important details worth not rediscovering

- The **public demo makes no AI call** by design — a regression here is a real bug.
- **Zero `/ai/*` before the first message** in a live session is the intended economy (one fused
  `/ai/turn` per typed turn). A stray `/ai/translate` on open is a regression.
- **`/trust/:page`** is its own lazy chunk; legal links are wired.
- **`_headers`** is the only place that sets CSP; a Google button needs
  `style-src https://accounts.google.com/gsi/style`.
- **Content Studio** (`cloudflare-content-studio*.js`) and `/admin/*` are bearer-gated; never
  read/print `ADMIN_SECRET`.
- **`sweepExpiredRows`** keeps `rate_limit_counters` (24h) and `error_reports` (30d); cron
  `17 4 * * *`.
- Observability is honest: `/health` exposes status only (no pool/provider), `/client-error`
  sanitizes (400-char cap, credential redaction).
- **Mastery has exactly one definition: `MASTERED_REPS = 3` consecutive good recalls, owned by
  `gradeReviewItem`** (`src/lib/srs/store.ts`), which writes `mistakes.isMastered` itself and the
  UI reads it reactively (live query). A screen must never write `isMastered` — both retype drills
  now grade through the store for this reason.
- **A grader must match the shape the learner is invited to produce.** The AI returns a
  correction as a *fragment* (`ist jetzt fertiggestellt`); the debrief asks the learner to
  "write the correct sentence", so a full sentence is correct input. `gradeCorrectionRetype`
  (report retype drill) accepts the fragment inside a sentence; `gradeAnswer` stays exact for
  vocab recall. Two graders, two contracts — do not collapse them.
- **`tests/appMap.test.ts` enforces APP-MAP against the code** (routes, screens, worker
  endpoints, D1 tables). Add the new item to APP-MAP §14's matching `appmap-*` block when you add
  it to the code, or `npm test` reddens.
- **A review card is shown only if it is answerable.** `validateReviewItem` (`src/lib/review/validate.ts`)
  refuses an item with no clear Arabic prompt, no answer, or a correction that changes nothing
  (`isMeaningfulCorrection` folds case/punctuation/umlaut-transliteration). Bad stored items are
  **suppressed** (Dexie v7 migration), never deleted, and mastery stays `gradeReviewItem`'s.
- **The AI's own output is validated before the learner sees it.** `cloudflare-turn-quality.js`
  drops a `next_hint` that does not answer the last AI message, refuses a no-op correction, and
  gates the persona obstacles (never the first turn, never right after a repeat request).
  `scripts/eval-chat-quality.mjs` (in CI) is the before/after measure.
- **There are exactly two conversation modes of the SAME conversation (V28): `practice` (hints,
  translation, a live correction) and `real` (none of those; the turn call is unchanged and still
  returns the evaluation, so the report is built from the stored turns; REAL XP is weighted 1.5×).
  The round-count picker is gone — session length is a level cap (`levelSpec.maxSessionTurns`, read
  via `sessionTurnCap`: A0 3 / A1 4 / A2 6 / B1 9 / B2 12).**
- **REAL-mode progress credit is a pure rule, not an inline expression.** `sessionXp`
  (`src/lib/progress/sessionXp.ts`) multiplies practice XP by `REAL_XP_MULTIPLIER` (1.5×) for REAL
  mode; the report's "versus your previous attempt" line appears only when a prior session recorded
  `mistakesCount` (new optional `SessionEntity` field), never a guessed baseline.
- **Ask Katzu (`/app/ask` → `/ai/ask`, V28 Stage 2A) is German-only and quota-capped.** One question
  → one validated JSON answer (Arabic explanation + ≤3 examples + exactly 3 practice items) or a
  polite Arabic refusal for anything off-topic; the learner's text is fenced data, never
  instructions. Its own daily cap and rate limit live in worker config (`ASK_FREE_PER_DAY` 8 /
  `ASK_PRO_PER_DAY` 60 / `ASK_RATE_PER_MINUTE` 4) and **never spend the conversation trial quota**.
  Official/legal German attaches a not-legal-advice notice; practice is graded by the same
  `gradeAnswer` the review engine uses, and a wrong answer enters the validated review path.
  `tests/askRoutes.test.ts` pins the contract, `e2e/ask.spec.ts` the happy path.

---

## E. Open items the owner must decide (not an agent's call)

- Rotate `ADMIN_SECRET` (was exposed in an earlier prompt).
- `katzu.app` does not resolve though robots/sitemap advertise it.
- Imprint placeholder + refund one-liner need real wording before public launch.
- No dedicated e2e for review/listen/write/coach.
- Real-device voice input unverified.
- Live-walkthrough defects to triage: `/ai/translate` intermittent abort + retry; Trail
  scene-image placeholder line.
