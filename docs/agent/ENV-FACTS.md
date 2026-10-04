# ENV-FACTS — measured environment for the Katzu workspace

## Current overlay — 2026-10-04

The sections below are historical recon, not current production/readiness claims.
Current checkout at excellence-batch start: `main`, `1a72827`; source changes are local and
uncommitted. Node remains 24.14.0 / npm 11.9.0, below the declared Node floor; no system-wide
runtime upgrade is authorized or performed. A local `.env` exists now: never print its contents.
The preceding audit passed 1,410 unit tests and 80 dev-server browser tests; these numbers are
not coverage for later edits. Final edited-file evidence lives in `EXCELLENCE-STATUS.md`.
The root shell directory is still the parent workspace; commands for the app need `cwd: katzu`.
Use bundled code_search when available, `git grep` fallback otherwise. Inspect listeners before
starting servers and never terminate another thread's process. No production/network secret
operations are necessary for the current batch. CLAUDE.md and AGENTS.md share one instruction
source, and neither grants automatic commits or deploys.

One-time recon, read-only. Every `FACT` line carries the command and its result.
`UNKNOWN` means the probe could not prove the claim — never a guess.
Recon date: 2026-09-29. Host: the owner's Windows desktop (Freebuff desktop app).

## Corrections folded into AGENTS.md v7 (2026-09-29)
These four probe results were promoted from this file into the manual, so they are rules now, not
just facts. Each one already has its proof above; nothing was re-measured.
- **Reporters:** Vitest accepts `default | basic | verbose | dot | json | junit | tap` — `line` is
  Playwright-only. v7 §5. (`npx vitest run --reporter=line` → Startup Error, exit 1, 2 s.)
- **CRLF:** the working tree is CRLF although `.gitattributes` pins `eol=lf`; re-read the exact lines
  before an exact-match edit. v7 §6. (`index.html` CR=4, `tailwind.config.js` CR=9.)
- **Sequential batching:** tool calls issued in one block run one after another, not concurrently.
  v7 §4. (Two 8 s sleeps → 16.4 s wall.)
- **`npm run lint` == `npx tsc --noEmit`:** one gate, not two. v7 §5.

Repo root on disk: `C:/Users/Lenovo/Desktop/k1/katzu`.
Workspace root (where shell commands start): `/c/Users/Lenovo/Desktop/k1` (not a git repo).

---

## A. Identity & tools

| | |
|---|---|
| Agent identity | FACT: `Buffy`, the coding agent behind Codebuff, running in the Freebuff desktop client — proof: harness/system prompt states it. |
| Model name | UNKNOWN — the harness does not state a model name anywhere in this session. (`GLM 5.3 Flash` appears in `docs/AGENT-STATE.md` only as a content-review attribution, not the runtime model.) |
| Context window | UNKNOWN — not stated by the harness. |
| Token/usage counter | UNKNOWN — no counter is visible in tool results; the app UI may show one the agent cannot read. |

**Tools callable** (name → purpose):

- `read_files` — read files / line ranges; batch several in one call.
- `str_replace` — exact-string replacement inside a file (supports `allowMultiple`).
- `write_file` — create or fully overwrite a file.
- `run_terminal_command` — run a shell command (SYNC or BACKGROUND).
- `code_search` — content search via a bundled ripgrep (works even though `rg` is absent from PATH).
- `glob` / `list_directory` — find files by pattern / list a directory.
- `write_todos` — maintain a step-by-step plan.
- `web_search` / `read_url` — search the web / extract readable text from a URL.
- `preview_*` — browser tab control (open, snapshot, click, type, screenshot, evaluate, logs) and `register_preview`.
- `ask_questions` / `suggest_prompts` / `end_turn` — user interaction.
- `search_mcp_tools` / `call_mcp_tool` — reach connected MCP servers (cloudflare, github).
- `request_elevation` — request OS administrator rights for one exact command.
- `run_file_change_hooks` — trigger client-configured post-edit hooks.

Parallelism: FACT: **batched tool calls run sequentially, not concurrently** — two independent 8 s sleeps issued in one block took 16.4 s wall (`A-start=…606.678`, `B-start=…614.974`). Batching saves round-trips, not wall time.

---

## B. Machine (measured)

| Fact | Proof |
|---|---|
| OS: Windows, MSYS/MinGW (`MINGW64_NT-10.0-26200`, MSYS 3.4.10 x86_64) | `uname -a` |
| Shells present: `sh`, `bash` (`/usr/bin`), `powershell` (Windows PowerShell 5.1), `cmd`. **No `pwsh`.** | `command -v` loop |
| The command tool runs **bash (MSYS)**: `SHELL=/usr/bin/bash` | `echo $SHELL` |
| CPU: 12 logical, 6 physical cores | `nproc` → 12; `Win32_Processor.NumberOfCores` → 6 |
| RAM: 15.9 GB | `Win32_ComputerSystem.TotalPhysicalMemory/1GB` |
| Disk: `C:` 475 GB, **101 GB free** (79 % used) | `df -h .` |
| Repo path length: `C:/Users/Lenovo/Desktop/k1/katzu` (31 chars) | `git -C katzu rev-parse --show-toplevel` |
| Branch: `launch-hardening`, **working tree clean** | `git status -sb` → only `## launch-hardening` |
| Divergence: 18 ahead of `main`, **1 commit ahead of `origin/launch-hardening`** | `git rev-list --left-right --count main...launch-hardening` → `0 18`; `git push --dry-run` → would push `a74014a` |
| Last 3 commits | `git log -3 --oneline`: `a74014a RC-6…`, `9539923 RC-5…`, `2254dc3 RC-4…` |
| `.gitattributes` pins LF (`* text=auto eol=lf`); `core.autocrlf=true` | `cat .gitattributes`, `git config core.autocrlf` |
| **Working tree files ARE CRLF** — the `eol=lf` attribute is not taking effect on this checkout | `head -c 200 <f> \| tr -cd '\r' \| wc -c`: `index.html=4`, `tailwind.config.js=9`, `vite.config.ts=6`, `AGENTS.md=3`, `src/main.tsx=4`, `cloudflare-unified-worker.js=4`; `file index.html` → "CRLF line terminators" |
| Tracked files: 321 | `git ls-files \| wc -l` |

---

## C. Toolchain (measured)

| Tool | Version | Proof |
|---|---|---|
| node | **v24.14.0** | `node -v` |
| npm | 11.9.0 | `npm -v` |
| npx | 11.9.0 | `npx --version` |
| git | 2.44.0.windows.1 | `git --version` |
| TypeScript (tsc) | 5.9.3 | `npx tsc --version` |
| vitest | 5.0.1 (win32-x64, node v24.14.0) | `npx vitest --version` |
| @playwright/test | 1.63.0 | `npx playwright --version` |
| wrangler | 4.136.3 (4.143.0 available) | `npx wrangler --version` |
| **ripgrep (`rg`)** | **NOT INSTALLED** | `rg --version` → `command not found` → use `grep` / `git grep -n` |
| `node_modules` | present | `test -d node_modules` |
| `npm ci --dry-run` | "up to date in 1s" (with an `EBADENGINE` warning) | `npm ci --dry-run` |
| `engines.node` (declared in V17) | **`^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`** — the intersection of the dependency floors | `node -p "require('./package.json').engines"`; jsdom 30.1.1 declares exactly this, vitest 5.0.1 `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`, lighthouse 13.5.0 `>=22.19`, wrangler 4.136.3 `>=22` |
| **CI Node pin** | **`24.15.0`** in both jobs — the lowest version satisfying `engines.node`, i.e. CI proves the minimum supported environment | `.github/workflows/ci.yml`; checked by `tests/ciWorkflow.test.ts` |
| **This machine is one patch below that floor** — Node 24.14.0, so `npm ci` reports `EBADENGINE Unsupported engine { package: 'katzu-web@1.1.0', required: { node: '^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0' }, current: { node: 'v24.14.0' } }` | the suite is green on 24.14.0 anyway (74 files / 891 tests, V17), so this is a declaration-vs-machine gap, not a failure | `npm ci` in a fresh clone; fix is an owner action — install Node 24.15.0+ (or 22.22.2+) |
| **TypeScript imports need default type stripping** | `scripts/audit-curriculum.mjs:13` and `scripts/load-curriculum.mjs` do `from '../src/lib/content/curriculumAudit.ts'` — Node **22.18+ / 23+**, or `ERR_UNKNOWN_FILE_EXTENSION` | `node --version`; enforced by `tests/ciWorkflow.test.ts` (`TYPE_STRIPPING_FLOOR`) |

Playwright browsers installed in `%LOCALAPPDATA%/ms-playwright`: `chromium-1243`, `chromium_headless_shell-1243`, `ffmpeg-1011`, `winldd-1007`. **Chromium only** — no firefox, no webkit, and the Playwright config declares a single `chromium` project.

---

## D. Capabilities (probed in the OS temp dir, probes deleted)

| Capability | Result |
|---|---|
| Heredoc write | FACT works — `cat > f <<'EOF' …` produced the file. |
| `sed -i` multi/substitution | FACT works. |
| `awk` | FACT works. |
| `timeout <n>` | FACT works — `timeout 2 sh -c 'sleep 5'` → exit **124**. |
| `nohup … &` | FACT works — backgrounded write produced its file. |
| `curl` | FACT works — `registry.npmjs.org` → 200. |
| Editor tool, unique 3-line match | FACT works — replaced `alpha/beta/gamma` block in one call. |
| Editor tool, duplicate match | FACT **fails cleanly**: "Found 2 occurrences … No change to the file". No partial write. |
| UTF-8 (Arabic + umlauts + ß) | FACT intact — `od -c` shows correct `d9 85 d8 b1 … c3 b6 … c3 9f`; **no BOM** (`head -c 3 \| od` → `d9 85 d8`). |
| Line endings of tool-written files | FACT **LF** (tool output is LF even though the repo working tree is CRLF). |
| Output: 500 lines | FACT not truncated — full `seq 1 500` returned. |
| Output: 20 000 lines | FACT truncated **in the middle** with `[...TRUNCATED DUE TO LENGTH...]`, keeping ~head 5.2 k lines + ~tail 4.2 k lines (≈20 KB each end). Safe habit: ≤500 lines per call. |
| Command time limit | FACT **no per-command kill observed** — `sleep 120` ran the full 120 s and exited 0. |
| Background server | FACT works: see "Copy-paste commands" below (start → 200 → kill by PID). |

**Plan mode / permission prompts:** UNKNOWN — no plan-mode state was present this session and no action was refused. All probes above (read-only plus writes to the OS temp dir and local `dist`) ran without an approval prompt. Which action classes trigger approval, and which are hard-blocked, is UNKNOWN (not exercised; deliberately nothing destructive was attempted).

---

## E. Network & credentials (read-only)

| Check | Result |
|---|---|
| `https://registry.npmjs.org/` | FACT 200 |
| `https://github.com/` | FACT 200 |
| `https://api.cloudflare.com/` | FACT 301 |
| `https://katzu-test.ghaidakalosh008.workers.dev/` | FACT **404** (no route at `/`) |
| `https://katzu-test.ghaidakalosh008.workers.dev/health` | FACT **200** |
| `https://katzu-webapp-v3.pages.dev/` | FACT 200 |
| `https://katzu-sales.pages.dev/` | FACT 200 |
| Env var NAMES matching `CLOUDFLARE\|VITE_\|WRANGLER\|ADMIN\|NOWPAY\|GOOGLE\|CF_` | FACT **none in the shell environment** (`env \| cut -d= -f1`) |
| `.env` / `.dev.vars` files | FACT neither exists; only `.env.example` (template, no values) |
| `wrangler whoami` | FACT logged in via **OAuth Token**, email `ghaidakalosh008@gmail.com`, account `00df3d915626e0a681f4fef98c1c587c`; token scopes include `workers (write)`, `workers_kv (write)`, `workers_scripts (write)` → **this machine can deploy**. Credentials stored at `%APPDATA%/xdg.config/.wrangler/config/default.toml`. |
| Git remote | FACT `origin` = `https://github.com/ghaidak077/katzu-webapp-v3.git`; `git ls-remote --heads origin` exit 0 |
| Push permitted? | FACT yes: `git push --dry-run origin launch-hardening` → `22fe6aa..a74014a launch-hardening -> launch-hardening`, exit 0. (Nothing was pushed.) |
| Live `/health` body | FACT still returns the pre-hardening disclosure (`aiPool.entries:9`, `tiers`, `active` provider/model names, `strategy`, `cachedTranslationsCount`) → **production runs old code (commit `22fe6aa`)**, matching the RC-6 ledger entry. |
| `wrangler d1 execute … --remote` (read-only SELECT) | FACT works; used for the counts in §F/content state. |

---

## F. Project baseline (all run this session)

| Gate | Result | Duration |
|---|---|---|
| `npx tsc --noEmit` | FACT exit 0 | 6 s |
| `npm run lint` | FACT identical to the above — the script is literally `tsc --noEmit` (no separate linter) | — |
| `npm test` (= `vitest run`) | FACT exit 0 — **67 files / 799 tests passed** | 9 s (7.2 s reported) |
| `npm run build` (`tsc && vite build`) | FACT exit 0; `dist` = 4.4 M; entry `index-C0HtKS_k.js` **492 K**; `sw.js` precache **86 entries / 4171.99 KiB**; Vite warns one chunk > 500 kB | 17 s |
| `node --check cloudflare-unified-worker.js` | FACT OK | <1 s |
| `npx tsc -p e2e --noEmit` | FACT OK | ~5 s |
| `npm audit --omit=dev --audit-level=high` | FACT **0 vulnerabilities** | ~4 s |
| Playwright inventory | FACT **10 spec files / 37 tests**, chromium only (`npx playwright test --list`) | — |
| `npx playwright test e2e/demo.spec.ts` vs **dev** (`npm run dev`, port 3000) | FACT **1 passed** | **8 s** wall (5.0 s test) |
| same spec vs **`vite preview`** (port 3000, production build) | FACT **1 passed** | **7 s** wall (4.6 s test) |
| **Whole suite vs `vite preview`** via `E2E_TARGET=preview npx playwright test` | FACT **37/37 passed** (2026-09-29), with service workers blocked | **4.3 min** (build 14 s + tests) |
| Same suite, same command, an earlier run | FACT **36/37** — one intermittent failure in `e2e/journey.spec.ts:320` (silent-fake-device recorder fallback); passed 3/3 on dev when Playwright owned the server | 3.1 min |

Top 5 chunks by size: `index` 492 K · `LiveConversationScreen` 96 K · `JourneyHomeScreen` 32 K · `ProfileSettingsScreen` 24 K · `SubscriptionRedemptionScreen` 24 K; CSS `index-*.css` 52 K.

**Gate trap (costs a wasted run):** FACT `npx vitest run --reporter=line` **fails** — `Startup Error: Failed to load custom Reporter from line` (exit 1, 2 s). `line` is a **Playwright** reporter, not a Vitest reporter. Valid Vitest names: `default | basic | verbose | dot | json | junit | tap | tap-flat`. Use **`npm test`** as-is, or `--reporter=dot`.

`npm run lint` and `npx tsc --noEmit` are the same command — do not run both for "two gates".

---

## G. Repo map (≤25 lines)

- **Entry points** — `index.html` → `src/main.tsx` → `src/App.tsx` (all routes).
- **Routes** — public `/`, `/welcome`, `/signin`, `/demo`, `/onboarding`, `/subscription`, `/placement`, `/trust/:page`; learner `/app/*` (`/app/trail`, `/app/library`, `/app/review`, `/app/listen`, `/app/write`, `/app/coach`, `/app/:tab`) plus `/scenario/:id/{story,practice,study,quiz,live}` and `/session-report`.
- **Key dirs** — `src/features/*` (auth, coach, conversation, demo, dev, journey, listening, marketing, onboarding, placement, practice, progress, quiz, report, review, settings, study, trail, writing); `src/components`; `src/lib`; `src/types`.
- **Worker** — `cloudflare-unified-worker.js` (main), plus 15 sibling `cloudflare-*.js` modules (ai-router, ai-chat, admin, analytics, content-studio*, crypto, hints, stt, writing, content-schema).
- **DB layer** — `src/lib/db/katzuDb.ts` (Dexie/IndexedDB offline fixtures + seeding); server side is D1 (`DB`) + KV (`USER_PROGRESS`, `REDEEMED_CODES`) per `wrangler.toml`.
- **Tests** — `tests/` (**74** Vitest files, 891 tests as of V17), `e2e/` (10 Playwright specs + `harness.ts`; 37 tests).
- **Scripts** — `scripts/`: `audit-curriculum.mjs`, `audit-quiz-content.mjs`, `load-curriculum.mjs`, `backfill-user-registry.mjs`, `smoke-token-hygiene.cjs`, `verification-battery.cjs`, `verify-{admin,crypto,stt}-live.mjs`, `capture-admin-screenshots.mjs`, `fix-quiz-content.mjs`, `fixtures/`.
- **`package.json` scripts** — `dev` (vite :3000) · `build` (tsc + vite) · `preview` (vite preview) · `test` (vitest run) · `test:e2e` (playwright) · `test:e2e:types` (tsc -p e2e) · `lint` (tsc --noEmit) · `deploy:worker` (wrangler deploy — **never run**) · `tail:worker` · `test:smoke:token-hygiene`.
- **CI** — `.github/workflows/ci.yml` only: jobs `verify` (Node **24.15.0**), `e2e` (`needs: verify`, same Node) and `secret-scan`. The Node pin is not cosmetic: it ran on 20 from the project's start, which made every run red from 2026-09-28 to V17 while every local run was green (see §H).
- **Docs present** — `docs/AGENT-STATE.md` (ledger), `LAUNCH-CHECKLIST.md`, `CONTENT-AUTHORING-PROMPT.md`, `CONTENT-STRATEGY-ROADMAP.md`, `CURRICULUM-DRAFT.md`, `IMPLEMENTATION_PLAN.md`, `LEARNING-ROADMAP.md`, `PRODUCT-SPEC.md`, `current-state.md`, `launch-gate.md`, `pass-quiz-training-hints.md`, `product-gaps.md`, `security-gaps.md`, `verification-report.md`, `docs/content/`, `docs/screenshots/`.
- **Docs missing?** FACT none — every file the manual names (v6 §4 → now `docs/agent/CONTENT-GATE.md`; v6 §5 → now v7 §1/§8) exists (`docs/AGENT-STATE.md`, `LAUNCH-CHECKLIST.md`, `CONTENT-AUTHORING-PROMPT.md`, `CONTENT-STRATEGY-ROADMAP.md`, `src/lib/utils/scenarioVocab.ts`, `src/lib/content/scenarioGrammar.ts`, `src/lib/db/katzuDb.ts`). `docs/agent/` did not exist before this recon; it is created by this commit.

---

## H. Reproducing CI in a fresh LF clone (optional T2 step, added in V17)

The verifier or agent who has only ever seen a green local run has not seen CI. This checkout is CRLF (`core.autocrlf=true`, §B) and carries `node_modules`, so it hides two whole classes of failure: line endings, and a Node version that only *this* machine has. The commands below were run in V17 and produce the workflow's `verify` result on a clean tree, in the OS temp dir, without touching the repository.

```bash
# Everything below is run from the workspace root; the repo is in ./katzu
cd katzu

# --- fresh Linux-like clone: LF checkout, clean install, into the OS temp dir ---------
# `core.autocrlf=input` is what makes the clone LF like the runner's checkout;
# --depth 1 is enough for the checks (add --branch main to test what main serves).
CLONE=/tmp/katzu-fresh-lf
rm -rf "$CLONE"
git clone --quiet --depth 1 --branch main --config core.autocrlf=input \
  https://github.com/ghaidak077/katzu-webapp-v3.git "$CLONE"
cd "$CLONE"

# Proof the clone really is LF and really is the commit you think it is.
git rev-parse --short HEAD
printf 'CR bytes: %s\n' "$(tr -cd '\r' < scripts/load-curriculum.mjs | wc -c)"   # → 0

# Is this machine even allowed to run the repo? (engines.node, measured in V17)
node -p "require('./package.json').engines"
node -v                    # 24.14.0 here → an EBADENGINE warning, but green

# The workflow's install + verify steps, verbatim.
npm ci --no-audit --no-fund
npm run lint               # == npx tsc --noEmit
node --check cloudflare-unified-worker.js
npm test                   # → Test Files 74 passed (74) / Tests 891 passed (891)
node scripts/audit-curriculum.mjs   # → PASSED — 3 file(s) checked
node scripts/audit-quiz-content.mjs

# The e2e job only if you need it (builds, then 37 chromium tests):
npx playwright install --with-deps chromium   # first time on this machine only
npm run build && npx playwright test --project=chromium

# Cleanup (the clone is ~600 MB with node_modules):
rm -rf "$CLONE"
```

Measured in V17 on `616e273`, Node 24.14.0, npm 11.9.0: clone 0 CR bytes in `scripts/load-curriculum.mjs` and in `.github/workflows/ci.yml`; `npm ci` → **620 packages in 33 s**, one `EBADENGINE` warning about this repo's own `engines.node`; `npm run lint` OK; `node --check` OK; **74 files / 891 tests passed**; both audits pass. The same steps are what run in CI — with Node **24.15.0** there, so an `EBADENGINE` warning here is the *only* expected difference.

---

## Copy-paste commands that work here

```bash
# Everything below is run from the workspace root; the repo is in ./katzu
cd katzu

# --- start the dev server (port 3000) -------------------------------------------------
nohup npm run dev > /tmp/katzu-dev.log 2>&1 &
sleep 6
curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://localhost:3000/     # expect 200

# --- verify it is the right server ----------------------------------------------------
tail -5 /tmp/katzu-dev.log

# --- stop it (MSYS: double the leading slash on taskkill flags) -----------------------
PID=$(netstat -ano | grep LISTENING | grep ":3000" | awk '{print $NF}' | sort -u | head -1)
taskkill //F //PID "$PID"

# --- one spec against the dev server --------------------------------------------------
npx playwright test e2e/demo.spec.ts --reporter=line      # 8 s, 1 test

# --- the WHOLE suite against the PRODUCTION bundle (the artifact that ships) ---------
# `E2E_TARGET=preview` makes playwright.config.ts build with the e2e placeholder worker
# origin, serve `dist/` on port 3000 and refuse to reuse an existing server. Use this,
# not a hand-started `vite preview`: a manually started server gets no `webServer.env`,
# so the bundle carries an empty VITE_WORKER_URL, every turn calls the preview server
# itself and 404s, and the suite scores 26-27/37 for reasons that are not the product.
E2E_TARGET=preview npx playwright test --reporter=line    # 37/37, ~4.3 min

# --- one spec against the dev server --------------------------------------------------
# Also let Playwright start the server (it injects VITE_WORKER_URL for the dev server too).
npx playwright test e2e/demo.spec.ts --reporter=line      # 8 s, 1 test

# --- manual preview (only if you must); the build MUST carry the origin ---------------
VITE_WORKER_URL=https://e2e-worker.test npm run build
nohup npx vite preview --port 3000 --strictPort > /tmp/katzu-preview.log 2>&1 &
sleep 6
curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://localhost:3000/     # expect 200

# --- the full unit gate (fast: ~10 s) --------------------------------------------------
npm test                       # 67 files / 799 tests
npx tsc --noEmit               # same as `npm run lint` — run once
npx tsc -p e2e --noEmit

# --- the full T2 release gate ---------------------------------------------------------
npm run lint && npm test && npm run build && node --check cloudflare-unified-worker.js
npm audit --omit=dev --audit-level=high
npx playwright test            # 37 tests, chromium only

# --- search (rg is NOT installed) -----------------------------------------------------
git grep -n "pattern"
grep -rn "pattern" src/

# --- read-only live checks ------------------------------------------------------------
curl -s -m 10 https://katzu-test.ghaidakalosh008.workers.dev/health
npx wrangler d1 execute katzu-content --remote --command "SELECT COUNT(*) FROM scenarios"
```

Do **not** run `npm run deploy:worker`, `wrangler deploy`, or any `wrangler … --commit` load:
`wrangler` on this machine is authenticated with `workers (write)` scope, so a stray deploy
would reach production. §3 forbids it.
