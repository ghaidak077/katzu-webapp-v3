# Quality bar and pre-decided defaults

Provenance: moved **verbatim** from `AGENTS.md` v6 §8 (Quality bar) and §11 (Pre-decided defaults)
during the v7 split. Normative: `AGENTS.md` v7 §10 points here. Read when touching UI, AI or data.

## Quality bar

**Done means:** flow works end to end; existing flows intact; loading/empty/error/offline/success
states exist; RTL and LTR correct; data persists safely; failures recoverable; auth/entitlements
preserved; new logic tested; docs updated; no secrets exposed; no unrelated files changed; limits
stated honestly.

**Code.** Strict TypeScript, no new `any`, validate external input, one source of truth, no silent
catch, no dead code, comments explain why, avoid needless rerenders/DB reads/network calls.

**Learning science.** Retrieval, spaced repetition, interleaving, production over recognition,
immediate corrective feedback with re-attempt, real-world context. Separate independent from
hint-assisted, recognition from production, measured from unmeasured. Never claim mastery from
opening a screen, reading a translation, using a hint or one multiple-choice answer. Progress
headline: "what can I now do in German?".

**Arabic-first.** Correct RTL, natural short actionable Arabic, no English-only recovery state.
German stays LTR-isolated via `GermanText`/`kz-de`.

**No dead ends.** Handle loading, empty, slow network, offline, auth failure, expired session, AI
failure, quota, paywall, invalid input, mic denied, recognition failure, retry, back, refresh, small
screens. Failures are visible, Arabic, preserve input, offer a next action (speaking fails → typing
stays; AI fails → cached/deterministic practice; sync fails → queue and say so). Never: blank
screens, infinite spinners, silent catches, fake success, unexplained disabled buttons.

**Conversation.** Explicit states (idle, recording, transcribing, evaluating, generating_reply,
showing_feedback, retryable_error, offline, quota_exhausted, completed); no duplicate sends;
idempotent retry; no double quota use; typed fallback always available.

**Backend and AI.** Validate and bound every AI response; timeouts, quota, retry defined; AI never
authoritative for billing, account state or irreversible changes; never expose provider keys or log
tokens, auth headers, full transcripts or raw sensitive bodies.

**Data.** Additive, versioned, backward compatible, tested, safe for offline upgrades. Never destroy
progress, reviews, mistakes, vocabulary, subscription state, settings or sync queues.

**Security/privacy.** Treat input as untrusted; validate shape, length, range, ownership, session,
route authorization; guard XSS, injection, replay, oversized bodies, cross-user access. Analytics
privacy-safe, allow-listed, rate-limited, opt-out capable, free of audio, transcripts, tokens,
sensitive details.

**Visual/mobile.** Check 360 and 390 px, RTL, long strings, all states, focus, reduced motion, safe
areas, 44 px targets, contrast. One primary action per screen; calm, honest tone.

**Product.** Public demo works with no AI call and no account; daily mission deterministic for the
same state and date (review due → level → goal → unfinished → recurring mistakes → weakest skill →
time available); do not paywall the first meaningful learning experience; do not invent a payment
provider.

## Pre-decided defaults (do not re-deliberate)

- Local fixtures (`src/lib/db/katzuDb.ts`) are offline fallback only; remote D1 always wins. Existing
  rows are never overwritten. New local rows: ids ≥ 2000, insert-if-missing per id, never `put` over
  existing.
- No schema change for scenario→grammar; use `src/lib/content/scenarioGrammar.ts`.
- Local art replaces remote art at the same key, in the same commit as the tests pinning it.
- Owner-only commands are never run or requested (`--commit`, deploy, secrets). Record the exact
  owner command in `OWNER-OPEN`, e.g.
  `node scripts/load-curriculum.mjs --file=<module>.json --commit`
  (after confirming replaced ids are absent from production D1).
- Scope: only the current backlog item. Out-of-scope temptations → one `DECISIONS` line, move on.
- Prefer deleting complexity over adding it; prefer a test over an assumption.
- One throwaway probe file at most; delete it before committing.
- Repo missing locally → inspect read-only first; do not start work until the working tree is the
  real one.
