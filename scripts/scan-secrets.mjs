#!/usr/bin/env node
/**
 * The secret scan, over the tree AND the full history.
 *
 * WHAT IT PRINTS — and what it must never print
 * `file:line` and the secret's NAME. Never the value, not even truncated: a
 * scanner that echoes what it found has turned a safety net into a distribution
 * channel, and the one place its output is most likely to be pasted is a chat or
 * an issue. A finding names the variable, the file and the line; the owner then
 * rotates that secret without anyone ever having read it.
 *
 * WHY THE HISTORY AND NOT ONLY THE TREE
 * A secret deleted in a later commit is still a leaked secret — it is in every
 * clone and in every CI cache. So the scan walks `git rev-list --all`. This is
 * READ-ONLY: it inspects and prints, and never rewrites, filters or amends
 * history. Rewriting history is the owner's call, and a tool that does it silently
 * would be worse than one that reports.
 *
 * THE FIX LIST IS PRINTED, NOT APPLIED
 * For every NAME the worker reads from the environment it prints the exact
 * `wrangler secret put <NAME>` command the owner runs. Writing a secret is a
 * privileged, production-affecting action; this script does none of it.
 *
 * Usage:
 *   node scripts/scan-secrets.mjs            # report; exit 1 when a real hit exists
 *   node scripts/scan-secrets.mjs --tree     # skip the history walk (faster)
 *   node scripts/scan-secrets.mjs --max-revs=40   # bounded history walk (tests)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const treeOnly = process.argv.includes('--tree');

/**
 * Each pattern carries the NAME of the secret it looks for, so a finding can be
 * acted on without the report ever containing the value.
 *
 * The shapes are vendor-realistic on purpose: a pattern loose enough to match a
 * test fixture string would make every scan noisy and therefore ignored.
 */
const PATTERNS = [
  // ERE, because `git grep -E` is what walks the history: no ``, no `(?:...)`.
  { name: 'GEMINI_API_KEYS', ere: 'AIza[0-9A-Za-z_-]{35}' },
  { name: 'OPENAI_API_KEY', ere: '(^|[^A-Za-z0-9_])sk-(proj-)?[A-Za-z0-9]{32,}' },
  { name: 'ANTHROPIC_API_KEY', ere: 'sk-ant-[A-Za-z0-9-]{32,}' },
  { name: 'NVIDIA_API_KEY', ere: 'nvapi-[A-Za-z0-9_-]{24,}' },
  { name: 'GROQ_API_KEY', ere: 'gsk_[A-Za-z0-9]{32,}' },
  { name: 'STRIPE_SECRET_KEY', ere: 'sk_live_[A-Za-z0-9]{16,}' },
  { name: 'NOWPAYMENTS_API_KEY', ere: 'NP_[A-Za-z0-9]{16,}' },
  { name: 'HMAC_SECRET', ere: 'HMAC_SECRET[[:space:]]*=[[:space:]]*.{16,}' },
  { name: 'GOOGLE_CLIENT_SECRET', ere: 'GOCSPX-[A-Za-z0-9_-]{20,}' },
  { name: 'GOOGLE_CLIENT_ID', ere: '[0-9]{6,}-[a-z0-9]{10,}[.]apps[.]googleusercontent[.]com' },
  { name: 'PRIVATE_KEY_BLOCK', ere: '-----BEGIN [A-Z ]*PRIVATE KEY-----' },
];

/** Where a secret-shaped string is expected and harmless. */
const FIXTURE_PATH = /^(tests|e2e)\//;

/**
 * Identifiers that LOOK like a secret and are not one, recorded here on purpose.
 *
 * `GOOGLE_CLIENT_ID` is public by design: it ships in every browser bundle, and
 * the file says so in the comment above it. Suppressing it silently would make
 * the scan wrong; listing it here makes the decision reviewable — a reviewer can
 * see exactly which shapes are tolerated and why, and adding one requires writing
 * the reason down.
 *
 * Note it is a client ID, never `GOOGLE_CLIENT_SECRET`.
 */
const PUBLIC_IDENTIFIERS = [
  {
    file: 'wrangler.toml',
    name: 'GOOGLE_CLIENT_ID',
    reason: 'public OAuth client id, shipped in the client bundle by design',
  },
];

/**
 * The secrets the worker reads from the environment, so the report can end with
 * the exact commands that (re)set them. Names only — never values, and never a
 * value read from `.env`.
 */
const WRANGLER_SECRET_NAMES = [
  'ADMIN_SECRET',
  'HMAC_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GEMINI_API_KEYS',
  'NOWPAYMENTS_API_KEY',
  'NOWPAYMENTS_IPN_SECRET',
];
// `AI_DAILY_SPEND_CAP` is deliberately NOT here: it is a plain non-secret env var
// (a spend ceiling, not a credential), and printing a `secret put` command for it
// would move a number the owner edits by hand into a secret store.

const findings = new Map();
const fixtures = new Map();
const publicIds = new Map();

function recordFile({ file, sha, lines, isFixture }) {
  lines.forEach((lineText, index) => {
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      if (!re.test(lineText)) continue;
      const entry = `${file}:${index + 1}: ${name}`;
      (isFixture ? fixtures : findings).push(`${sha === 'HEAD' ? '' : `${sha.slice(0, 8)}: `}${entry}`);
    }
  });
}

/** The tracked files at HEAD, or one commit's files in a history walk. */
function trackedFiles(sha) {
  const out = execFileSync('git', ['ls-tree', '-r', '--name-only', sha], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\n').filter(Boolean);
}

function readLines(sha, file) {
  try {
    const content =
      sha === 'WORKTREE'
        ? readFileSync(join(root, file), 'utf8')
        : execFileSync('git', ['show', `${sha}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (!content) return [];
    return content.split('\n');
  } catch {
    return [];
  }
}

function isScannable(file) {
  if (/(^|\/)(node_modules|dist|\.git)\//.test(file)) return false;
  if (/\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|gz|woff2?|ttf|sqlite|db)$/i.test(file)) return false;
  try {
    return statSync(join(root, file)).isFile();
  } catch {
    return false;
  }
}

function lineOf(text) {
  let n = 1;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) n += 1;
  return n;
}

// --- The working tree ---------------------------------------------------------
// One `git grep` per pattern against HEAD is enough: the index is the tree, and a
// single process per pattern keeps a 200-commit repository inside seconds.
function grepAt(revs, patternSource) {
  try {
    return execFileSync(
      'git',
      ['grep', '-n', '-I', '-E', '-e', patternSource, ...revs, '--'],
      { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    );
  } catch (error) {
    // `git grep` exits 1 when nothing matched, which is the normal path here.
    return error.stdout ? String(error.stdout) : '';
  }
}

/**
 * One `sha:file:line:content` line into a finding, WITHOUT the content.
 *
 * The value is the thing that must never be printed, so it is dropped here and
 * never stored: what survives is the commit, the file, the line number and the
 * NAME of the secret.
 */
function recordMatches({ output, name }) {
  for (const raw of String(output).split(String.fromCharCode(10))) {
    if (!raw.trim()) continue;
    // git grep prints `rev:file:line:content` (or `file:line:content` when no rev
    // is given). The content is the secret, so it is dropped immediately and is
    // never stored, printed or counted.
    const parts = raw.split(':');
    let sha = '';
    let file = parts[0];
    let lineNo = parts[1];
    if (parts.length > 3) {
      sha = parts[0];
      file = parts[1];
      lineNo = parts[2];
    }
    if (!file || !/^\d+$/.test(String(lineNo))) continue;
    const key = `${file}:${lineNo}: ${name}`;
    const isPublic = PUBLIC_IDENTIFIERS.some((entry) => entry.file === file && entry.name === name);
    const bucket = FIXTURE_PATH.test(file) ? fixtures : isPublic ? publicIds : findings;
    const existing = bucket.get(key);
    if (existing) existing.commits += 1;
    else bucket.set(key, { key, file, lineNo, name, commits: 1, firstSha: sha });
  }
}

const PATTERN_SOURCES = PATTERNS;

for (const { name, ere } of PATTERN_SOURCES) {
  recordMatches({ output: grepAt(['HEAD'], ere), name });
}

// --- The full history ---------------------------------------------------------
// ONE `git grep` per pattern across every commit: the alternative (a `git show`
// per file per commit) is tens of thousands of processes and does not finish.
if (!treeOnly) {
  // `--max-revs=N` exists so a unit test can exercise this code path in seconds
  // instead of walking 199 commits; the default (and CI) walk is every commit.
  const maxRevs = Number((process.argv.find((arg) => arg.startsWith('--max-revs=')) || '').split('=')[1]);
  const revArgs = ['rev-list', Number.isFinite(maxRevs) && maxRevs > 0 ? '--max-count=' + Math.floor(maxRevs) : '--all', '--all'];
  const revs = execFileSync('git', revArgs, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
.split(String.fromCharCode(10))
    .filter(Boolean);
  for (const { name, ere } of PATTERN_SOURCES) {
    recordMatches({ output: grepAt(revs, ere), name });
  }
}

// --- The report ----------------------------------------------------------------
console.log(`[secret-scan] scope: ${treeOnly ? 'working tree' : 'working tree + full history'}`);
console.log(`[secret-scan] real findings: ${findings.size}`);
for (const finding of [...findings.values()].sort((a, b) => a.key.localeCompare(b.key))) {
  console.log(`  ${finding.file}:${finding.lineNo}: ${finding.name} (${finding.commits} commit(s), first ${finding.firstSha.slice(0, 8)})`);
}
if (publicIds.size > 0) {
  console.log(`[secret-scan] documented public identifiers (NOT secrets): ${publicIds.size}`);
  for (const entry of [...publicIds.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    const allowance = PUBLIC_IDENTIFIERS.find((item) => item.file === entry.file && item.name === entry.name);
    console.log(`  ${entry.file}:${entry.lineNo}: ${entry.name} — ${allowance?.reason ?? 'documented'}`);
  }
}
if (fixtures.size > 0) {
  console.log(`[secret-scan] ignored test fixtures (shape-matched by design): ${fixtures.size}`);
  for (const fixture of [...fixtures.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(0, 20)) {
    console.log(`  ${fixture.file}:${fixture.lineNo}: ${fixture.name}`);
  }
}
console.log('[secret-scan] no values are printed by this tool, ever. If a real finding exists,');
console.log("[secret-scan] rotate that secret — rewriting history is the owner's decision, not this script's:");
for (const name of WRANGLER_SECRET_NAMES) console.log(`  npx wrangler secret put ${name}`);

process.exit(findings.size > 0 ? 1 : 0);
