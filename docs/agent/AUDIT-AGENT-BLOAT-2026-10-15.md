# AUDIT — the hour that produced no screenshots (2026-10-15)

Written after the owner's report: *"a task that takes a minute became an hour of token
burn with no usable output."* This is the root-cause audit of that run, the fixes applied
in the same session, and the rules the agent files now carry so it cannot repeat.

Everything below is either read from the repository or measured in this session. Where a
number comes from the earlier run's transcript it is labelled as such.

---

## 1. The task and the outcome

**Asked:** take screenshots of every KatZU screen at phone size and save them into the
marketing folder.

**Outcome before this session:** two agent sessions, zero image files on disk. The folder
`docs/marketing/screenshots-mobile/` existed and was empty. A hand-written script
`scripts/mobile-marketing-screenshots.mjs` was left behind and never worked.

**Outcome now:** 48 PNGs in `docs/marketing/screenshots-mobile/` — 24 screens at
1290x2796 (iPhone 15 Pro Max) and 1080x2400 (Android), the two sizes `docs/MARKETING-KIT.md`
§6 asks for — plus `manifest.json` (what each shot is, its measured pixel size, the route
and the text on screen) and `index.html` (a contact sheet). Produced by the repository's
own rig pattern: **1.8 min, 4 tests passed, exit 0**, every file's pixel size asserted
against viewport x deviceScaleFactor (48 files, 0 wrong).

## 2. What the failed run actually did

From the visible transcript of the previous sessions:

- **~90 browser-tool calls** of the shape `preview_navigate` → `preview_screenshot`, once per
  screen, twice over (a first pass and a "continue" pass).
- **~35 shell commands**, of which the largest group was repeated
  `playwright install chromium` (and `playwright install --with-deps chromium`) followed by
  `sleep 25/30/45/60` and `cat <temp log>` loops — at least five cycles of it.
- **Two PowerShell download attempts** for a browser.
- It wrote a **new 200-line script** (`scripts/mobile-marketing-screenshots.mjs`) using
  `playwright-core` with a guessed executable path, instead of using the rig that already
  existed in the repository.
- It never ran the check that would have caught all of this at minute one: `ls` on the
  output folder.

## 3. Root causes (each with its proof)

### 3.1 The repository already had a working screenshot rig, and the run never looked for one

`e2e/shots/uiPolishShots.spec.ts` and `e2e/shots/journeyPolishShots.spec.ts`, each with its
own `*.playwright.config.ts`, already do exactly this job: start the server, drive the real
app through `e2e/harness.ts`, and **write PNGs to a path on disk** (`docs/agent/ui-polish/`,
`docs/agent/journey-polish/`). The rig author had already solved the two hard parts —
harness sign-in and a server with the placeholder worker origin.

*Proof:* both files exist, unmodified since 2026-10-07, and their `shoot()` writes
`join(OUT_DIR, …)` + `page.screenshot({ path })`.

**Root cause:** the run searched for a *script* (`glob **/marketing*`, `code_search marketing`)
and never searched for a *rig*. `grep -rl "screenshot({ path" e2e scripts` returns the answer
in under a second.

### 3.2 It installed a browser that was already installed, then retried the failure five times

`docs/agent/ENV-FACTS.md` §C already records, as measured fact:
`Playwright browsers installed in %LOCALAPPDATA%/ms-playwright: chromium-1243, chromium_headless_shell-1243 …`
and `@playwright/test 1.63.0`. Nothing needed installing.

*Proof:* ENV-FACTS §C, and the fact that this session ran `npx playwright test` and produced
48 screenshots without a single browser download.

**Root cause:** `AGENTS.md` §1 says the session starts by reading ENV-FACTS, and §4 says
"same command fails 2x → change method". Both were skipped. The `EMPTY` folder plus a
`node_modules/playwright-core` module whose browsers were not where the script guessed made
"browser missing" the obvious story — and nobody checked the file that already answered it.

### 3.3 The tool it fell back on cannot produce a file, and nothing said so

`preview_screenshot` renders a frame for the model. It has no path parameter and never
touches the workspace. The run used it ~90 times.

*Proof (this session):* two attempts to screenshot a local page returned
`Could not capture the preview page: it produced no frames`. Even when it works, its output
is a picture in the transcript, not a file — that is the whole gap between "I looked at the
screens" and "the marketing folder has the screens".

**Root cause:** `ENV-FACTS.md` listed the tool as *"`preview_*` — browser tab control (open,
snapshot, click, type, screenshot, evaluate, logs)"*, which reads as a capture capability.
Nothing anywhere stated the boundary. **Fixed** (§5.3).

### 3.4 The deliverable was never checked against its own acceptance criterion

"The files are in `docs/marketing/screenshots-mobile/`" is a one-command check. It was run
only at the very end, after the hour.

**Root cause:** no rule tied a file-producing task to a file-existence check. The run
reported "partial progress" three times, each time describing browser captures as if they
were progress toward the folder.

### 3.5 The instruction that could not be executed: a ~780 KB reading list

This is the deepest cause, and it explains 3.1–3.4 rather than sitting beside them.

`AGENTS.md` §1 ordered every session to read, in order: this file → the ledger → `APP-MAP.md` →
`MEMORY.md` → `ENV-FACTS.md` → `LESSONS.md`, and `npm run session:start` ended with
`READ NEXT: APP-MAP → MEMORY → ENV-FACTS → LESSONS`. Measured sizes in this repository:

| Document | Size | ≈ tokens |
|---|---|---|
| `docs/AGENT-STATE.md` (the ledger) | **443 KB** | ~110k |
| `docs/agent/APP-MAP.md` | 126 KB | ~32k |
| `docs/agent/PROJECT-BRIEF.md` | 71 KB | ~18k |
| `docs/agent/LESSONS.md` | 49 KB | ~12k |
| `docs/agent/MEMORY.md` | 37 KB | ~9k |
| `docs/agent/ENV-FACTS.md` | 23 KB | ~6k |
| **total** | **~780 KB** | **~190k** |

No agent can load that and still have room to work, so the instruction was skipped — and the
files it skipped are the ones holding the answers (`ENV-FACTS` §C: Chromium already cached;
`e2e/shots/`: the rig that writes screenshots). The system was not too weak to follow the rules;
the rules were written as a reading list that cannot be followed, in a file whose own §4 says
cap every output. A rule that cannot be executed is not a rule — and its cost only shows up as
the kind of hour this audit is about.

### 3.6 The blast radius: the evidence rigs were inside the gate suite

Separate defect found while auditing, and the reason this repository keeps going dirty:

`playwright.config.ts` ran every `e2e/shots/*Shots.spec.ts` inside `npx playwright test`
(measured: `--list` showed journeyPolishShots 6 + uiPolishShots 9 + mascotSheet 1 = 16 of the
137 tests). Those specs default to `TAG=before` and write **tracked** PNGs. So every ordinary
suite run rewrote `docs/agent/ui-polish/*-before.png` and `docs/agent/journey-polish/*-before.png`
with renders of the tree under test.

*Proof:* `git status` before this session showed 12 tracked `*-before.png` files modified,
same byte sizes differing from the HEAD blob, mtimes `2026-10-07 19:06` — the end of the
last session that ran the full suite. The ledger for that session already had to "restore"
those files once; nothing stopped it happening again, or aggregating "before" evidence from
the wrong commit (a mistake the earlier journey-polish session had to repair by re-shooting
from an old commit).

## 4. The cost, in the terms the owner paid it

| | Failed run | This session |
|---|---|---|
| Wall time to the deliverable | ~60 min, no output | 1.8 min, 48 files |
| Browser calls | ~90 | 0 for the deliverable |
| Shell commands | ~35 (incl. 5+ install/sleep cycles) | 6 |
| New files invented | 1 broken script | 1 rig + 1 config + 2 artifacts |
| Verification | "the browser showed me" | 500+ line log, exit 0, pixel size asserted per file |

The rig lives on: the next screenshot request is one command, not a re-investigation.

## 5. Fixes applied in this session

### 5.1 The screenshot path now exists, and it is the third rig of the same shape

- `e2e/shots/marketingShots.spec.ts` — 24 screens, two device projects, writes
  `docs/marketing/screenshots-mobile/`, asserts every PNG's IHDR pixel size against
  viewport x deviceScaleFactor, records `manifest.json`, reports (never silently skips) a
  screen that does not settle, and keeps a failure frame in Playwright's output dir.
- `e2e/marketingShots.playwright.config.ts` — phone contexts (430x932x3, 360x800x3), its own
  port 3101 so it never fights the gate's server or inherits one without the placeholder
  worker origin, `npm run build` + `vite preview` so shots show the shipped bundle.
- Run it: `npx playwright test -c e2e/marketingShots.playwright.config.ts --reporter=line`
  (`SCREENS=review,paywall` narrows it while iterating; `--project=iphone-15-pro-max` halves it).
- Two traps the rig had to be built around, both measured, both now in `MEMORY.md` §C:
  a bare `locator.innerText()` has **no action timeout**, so one diagnostic read on a screen
  without an `<h1>` waited to the 600 s test timeout (572 s on the mock exam alone); and
  `page.waitForLoadState('networkidle')` made every capture wait on a screen that keeps a
  request open (~27 s per screen versus ~4 s without it). `actionTimeout` is now set, every
  diagnostic read is capped, and the readiness gate is a real element assertion.
- The paywall and subscription shots are taken with the harness's priced `/pricing` fixture:
  the default fixture fails on purpose, and the paywall's honest «تعذّر تحميل الأسعار الآن» is a
  correct behaviour and a useless marketing screenshot.

### 5.2 Evidence rigs removed from the gate

`playwright.config.ts` `testIgnore` now excludes `**/shots/**Shots.spec.ts` and
`**/shots/mascotSheet.spec.ts`. The suite is 121 tests / 33 files (was 137 / 36): the 16
removed tests were evidence producers, not assertions. `e2e/shots/journeyLayoutProbe.spec.ts`
— a real layout contract — still runs. Each rig has its own config and command, exactly like
the perf probe that was already excluded for the same class of reason.

### 5.3 The environment facts now state the boundary

`docs/agent/ENV-FACTS.md`: the tool list distinguishes *renders for the eye* from *writes to
disk*, the screenshot rigs and their commands are recorded with their measured cost, and the
chromium-already-installed fact is repeated where a tool choice is made.

### 5.4 Rules in `AGENTS.md` §4 and a memory entry

Three rules added where the next run will read them, and a `MEMORY.md` §C row + `LESSONS.md`
entries so the same hour cannot be paid twice.

### 5.5 The orientation cost is now a fact and a budget, not a hope (§3.5)

- `scripts/session-start.mjs` no longer ends with a blanket "READ NEXT"; it prints the **measured
  size of every orientation document** (ledger 443 KB · APP-MAP 126 KB · PROJECT-BRIEF 71 KB ·
  LESSONS 49 KB · MEMORY 37 KB · ENV-FACTS 23 KB) and the rule that replaces the list: find the
  section (`grep -n "^## " <file>`), read that range, never a document. Readout stays 92 lines / exit 0.
- `AGENTS.md` §1 is now **"run one command, then read sections, never documents"**, with the
  per-task pointers (tool choice → `ENV-FACTS` §C–D + `MEMORY` §C; file artifact → §4).
- `docs/AGENT-STATE.md` opens with a *How to read this file* block: resume from RESUME, look items
  up by `grep`, add to a row instead of appending history, and read only the newest SNAPSHOT before
  a deploy.
- `tests/agentDocs.test.ts` enforces size budgets on the files a run must load (AGENTS.md 22 KB,
  MEMORY 45, ENV-FACTS 30, LESSONS 60, PROJECT-BRIEF 80, CLAUDE.md 4) and asserts the two rules
  that were missing (the tool boundary and "read sections, never documents"). Verified by
  reintroducing the violation: a 10 KB budget on a 37 KB file failed with the file's real size in
  the message, and passed again once reverted. Archiving the ledger's history is the next step and
  is left to the owner, because deciding what history to keep is not an agent's call.

### 5.6 The broken leftover is gone

`scripts/mobile-marketing-screenshots.mjs` deleted.

## 6. What is still open (not fixed here, owner's or next run's call)

1. **The 12 modified `*-before.png` files** under `docs/agent/ui-polish/` and
   `docs/agent/journey-polish/` are still modified versus HEAD. They are evidence images
   rewritten by the suite runs described in §3.5; whether to restore them from HEAD or
   re-shoot them from the commit they claim is the owner's call, because both are defensible
   and neither is this session's change.
2. **Visual review of the 48 shots** is a human step: open
   `docs/marketing/screenshots-mobile/index.html` and delete whatever does not sell. The rig
   guarantees the size, the route and that a heading rendered — it cannot tell you whether a
   shot is *attractive*.
3. **Shots are ~63 MB for 24 screens.** If they are meant to be committed, that is a real
   repo-weight decision (the existing `docs/agent/*` evidence folders hold a handful of PNGs,
   not 48 phone-resolution ones). Consider keeping the six marketing shots and ignoring the
   rest.
4. **A spoken turn in the live-conversation shot.** The rig deliberately stops at the
   scripted opener: the orb animates continuously and clicking it makes Playwright wait for
   stability (measured: minutes on that one screen). If a turn's frame is ever wanted, copy it
   from `e2e/journey.spec.ts`, which already drives a real turn in the gate.
