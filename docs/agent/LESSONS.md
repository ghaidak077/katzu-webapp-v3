# LESSONS — stall / retry / wrong-assumption log

Purpose: every time a run stalls, repeats a command, acts on an unverified assumption, or
wastes a run, append **one line** here. The file is read at session start. A lesson that
repeats **twice** is proposed as an `AGENTS.md` change in the report (the owner approves;
`§3` and the Content Gate are never edited by an agent). Lines already encoded in `AGENTS.md` are pruned.

Format:

```
date | symptom | root cause (proven) | rule that prevents it
```

Keep it to facts from a tool result. No speculation, no "probably".

---

## Entries

2026-09-29 | `npx vitest run --reporter=line` exited 1 in 2 s with `Startup Error: Failed to load custom Reporter from line` | `line` is a **Playwright** reporter name; Vitest has no such reporter (`default,basic,verbose,dot,json,junit,tap,tap-flat`). v6 §2.2/§2.3 said "Tests: `--reporter=line`" without scoping it to Playwright, so the flag was copied onto the unit runner | Use `npm test` unchanged, or `--reporter=dot` for Vitest and `--reporter=line` **only** for Playwright. Encoded in v7 §5; prune when v7 §5 is stable.

2026-09-29 | `rg --version` → `command not found` on this machine | v6 §2.0 documented this only through the ledger's `ENV:` line — a fresh session reads `AGENTS.md`, not DECISIONS history | v7 §1 and `docs/agent/ENV-FACTS.md` state that `rg` is missing before any command; use `git grep -n` / `grep -rn`, never retry `rg`.

2026-09-29 | Working tree files are **CRLF** even though `.gitattributes` pins `* text=auto eol=lf` | The `eol=lf` attribute is not being applied to this checkout (`core.autocrlf=true`, files already on disk as CRLF). A first probe that used `head -c 4000 \| grep -q $'\r'` wrongly reported "0 CRLF files"; the reliable probe is `head -c 200 <f> \| tr -cd '\r' \| wc -c` | Before concluding "no CRLF", verify with `tr -cd '\r' \| wc -c`. Exact-string edits must match the CRLF text as it is on disk; re-read the target lines rather than pasting LF text from memory.

2026-09-29 | A batched block of two independent 8 s `sleep` commands took 16.4 s, not ~8 s | Batched tool calls execute **sequentially**; they reduce round-trips, not wall time | Do not split a long job into parallel calls expecting a speed-up. Batch only to save round-trips, and keep each command under the output cap.

2026-09-29 | `seq 1 20000` came back with the middle replaced by `[...TRUNCATED DUE TO LENGTH...]` | Very large stdout (~>40–50 KB) is head+tail truncated by the harness. A first read of the untruncated-looking 500-line output suggested no cap existed | Cap every command output (`head -40` / `tail -25`); never rely on seeing the middle of a big dump. Tee anything important to `/tmp/<name>.log` first.

2026-09-29 | The e2e suite scored 26/37 against `vite preview`, then 10 more failures after blocking service workers, and 3/3 failing on a hand-started dev server — while the same tests passed when Playwright started the server itself | A manually started dev/preview server never receives Playwright's `webServer.env`, and for a preview build `VITE_WORKER_URL` is baked in at **build** time. With no origin, `WORKER_BASE_URL` is `''` (`src/lib/api/workerUrl.ts:8`), so the app called its own origin, the harness (`e2e/harness.ts:123` leaves localhost alone) never mocked those calls, and every turn 404'd | Test the built bundle only via `E2E_TARGET=preview npx playwright test`, which owns both the build and the env; never judge a suite run against a server you started by hand.

2026-09-29 | An intermediate V8-2 result contradicted the code: concurrent same-`rev` syncs both appeared to answer 200, then a later run gave one 200 + one 409, and `wrangler d1 execute --persist-to <dir>` seemed to be ignored by `wrangler dev` | **A stale `wrangler dev` from an earlier run was still listening on port 8799 and answered the new run's requests**, with the args of the *older* process (no `--persist-to`). `taskkill /F /T /PID <shell pid>` did not reach it: `wrangler dev` spawns `cmd → npx → node → workerd`, and the surviving `workerd.exe` kept the port and the SQLite locks even after its recorded parent was killed | Before trusting any local-server result: confirm the port is free, and kill by the **listening PID / by command line**, not by the shell PID. After the run, kill again and re-check the port. A leftover server turns every measurement into a lie — and the `--persist-to` "finding" was withdrawn once this was understood.

2026-09-29 | `execFileSync('npx', ['wrangler','d1','execute',…,'--command', 'INSERT INTO …'])` failed with `Unknown arguments: OR, REPLACE, INTO, crypto_orders, (order_id,, …)` | The call used `shell: true`, so Node joins the argv array into one string and the shell splits the SQL on its spaces — a multi-word argument cannot survive | Pass SQL to `wrangler d1` through `--file <path.sql>` (a single token) rather than `--command`. Same rule for any long/space-bearing argument handed to a native CLI through a shell.

2026-09-29 | `wrangler dev` (4.136.3, local) refused to start the real worker: `Incorrect type for map entry 'ERROR_REPORT_RETENTION_MS': the provided value is not of type 'function or ExportedHandler'` | `cloudflare-unified-worker.js` exports two non-function consts (`RATE_LIMIT_RETENTION_MS`, `ERROR_REPORT_RETENTION_MS`, added in `c3ee78d`). The deployed worker accepts them — production serves `/health` from the same file — but the local workerd config treats every named export of the **entry** module as a named entrypoint | For local integration runs, point `wrangler dev` at a one-line wrapper (`export { default } from "../../cloudflare-unified-worker.js"`) so the code under test stays byte-identical. Do not "fix" the worker for the local tool's sake: it deploys and serves correctly today.

2026-09-29 | One preview run scored 36/37: `e2e/journey.spec.ts:320` timed out waiting for the composer to hold the transcribed sentence | **Proven and fixed (V8-1, `8313808`).** The harness's fake capture device held the scripted audio level for exactly **6 animation frames**; the app detects speech from a rAF-driven analyser, and under load it can miss a window that short — `spokeAtMs` stays null, `decideStop` returns `no_speech` after 7 s, `/ai/transcribe` is never called and the composer stays empty. It was never a timing problem in the assertion | A fake input has to satisfy the *real* detection contract, not approximate it: hold the stimulus until the consumer's own measurement observes it (here RMS > 0.05 for 400 ms), with a ceiling so a broken probe fails loudly instead of hanging. Note that constants referenced inside `page.evaluate` must be passed in as the serialized argument — module scope does not exist in the page.
