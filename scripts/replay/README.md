# Scenario replay — the practice chat against the live worker

Two files, one job: replay a fixed set of learner sentences against the real
`POST /ai/turn` and score the answers with the same rules the product relies on.

- `scenario-replay-cases.json` — 69 learner turns on `first_greetings` and
  `airport_arrival`, 36 of them carrying a genuine error (spelling, article/gender,
  word order, conjugation, capitalisation, umlaut) across the kinds the owner
  named. Each case names the wrong-thing-it-tests (`kind`), whether a real error
  MUST be corrected (`expect.correct`) and which correct form proves it
  (`expect.form`). `noChange: true` marks a sentence that needs no correction, so
  a "fix" that changes real words is a `false_fix`. `holdout: true` marks the
  ~24% that are never used to tune the
  prompt; their score is reported separately. `changed` is compared with case and
  umlauts intact — folding both sides first hides exactly the fixes a beginner
  needs credited (`heisse` → `heiße`, `lehrerin` → `Lehrerin`).
- `score-replay.mjs` — deterministic scoring, no network: one question per reply,
  no meta talk, no «Wie bitte?» on a typo, no repeat of the opener's question, the
  hint answers the question that was just asked (the repo's own
  `hintMatchesQuestion`), no invented facts on an off-topic question, no echo of
  the learner's own error, and correction recall against `expect.form`.

## Capture

The worker needs a signed-in session token, so the capture runs in the browser
that is already signed in — the token is read from IndexedDB and never printed:

1. Open the app, start any practice scenario.
2. Run the runner in the page console (it reads `users/current_user.sessionToken`,
   POSTs each case with a fresh `session_id`, and keeps `window.__R`).
3. Pace it: `/ai/turn` allows 10 requests a minute, so the runner waits ~6 s
   between cases (69 cases ≈ 7 minutes — and ~a third of the day's 200-turn
   allowance, so run it once per prompt change, not after every fix).
4. Copy `window.__R` to `.tmp/replay-<prompt>.json`.

The runner is deliberately not a committed script: it needs a real account and a
real browser, and a committed copy would invite someone to think it can run in CI.

### When a run does not finish (quota wall, closed tab)

A capture may be split. `--plan` reads every capture file given and prints what is
still missing, in batches sized for one sitting, at the measured ~9 s cadence:

```bash
node scripts/replay/score-replay.mjs .tmp/replay-a.json --plan
# 23/69 captured, 46 left (≈6.9 min at 9 s/turn)
#   batch 1: g06,g09,g13,…
```

Capture the next batch, save it as a second file, and score both together — turns
are merged by case id, later files winning:

```bash
node scripts/replay/score-replay.mjs .tmp/replay-a.json .tmp/replay-b.json
```

A case with no capture is reported as `not captured`, not as a failure: the
recall denominator is the cases that actually ran. A run with any case missing
prints `REPLAY INCOMPLETE` and exits `2` — not finished, not failed. Full
denominator: `0` green, `1` red.

`--save` stores the scored run under `.tmp/replay-results/` (untracked machine
state) and `--history` prints the trend, so a number is compared with the last
one instead of remembered:

```bash
node scripts/replay/score-replay.mjs .tmp/replay-*.json --save
node scripts/replay/score-replay.mjs --history
```

## Score

```bash
node scripts/replay/score-replay.mjs .tmp/replay-v8.json
```

To score only some cases (a targeted regression run), pass `--only`:

```bash
node scripts/replay/score-replay.mjs .tmp/replay-g34.json --only g34,g35,g36
```

A subset run prints `subset … — gates below are indicative only`, because a
three-case sample cannot carry the ≥90% and p95 gates.

It prints one line per turn (mark, id, latency, provider, FIX/MISS, failed
checks) and then the gates:

| Gate | Threshold |
|---|---|
| correction recall on sentences with real errors | ≥ 90% |
| invented facts on an off-topic question | 0 |
| p95 latency | < 3500 ms |
| error turns (no reply) | 0 |

`REPLAY OK` / `REPLAY RED` and the exit status come from those four gates, plus a
fifth that every case was captured. The tune/holdout split is printed next to
them, so a prompt that was tuned into the corpus is visible rather than flattering.

## What this cannot prove

- The model is non-deterministic: one run is a sample, not a guarantee. Re-run it
  after any prompt or plan change.
- No judge model is reachable from this machine (no provider key in the repo, and
  the worker exposes no generic completion route), so the quality score here is
  deterministic-only. An LLM judge needs a key the owner supplies.
