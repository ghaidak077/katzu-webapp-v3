#!/usr/bin/env node
/**
 * Arabic written for the learner must stay gender-neutral until we know the learner's gender.
 *
 * WHY THIS EXISTS
 * Prompt v11 states the rule for the model, and `cloudflare-roleplay.js` gates the one case that is
 * unambiguous in unvocalised text: a diacritised feminine address (`أنتِ`, `ـكِ`). Authored content —
 * the openers, glosses, hints and feedback the app ships without a model — never went through either
 * check, so a hand-written «كيف حالكِ؟» would reach every learner and nothing would notice.
 *
 * This script scans authored content only, never model output. A hit is either fixed (neutral
 * wording works for both genders) or listed in `scripts/arabic-gender-allowlist.json` with the
 * reason it is correct — a quoted line spoken by a woman, never a line addressed to the learner.
 *
 *   node scripts/lint-arabic-gender.mjs            # exit 1 on an unlisted hit
 *   node scripts/lint-arabic-gender.mjs --json     # same result, machine-readable
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The same two forms the runtime guard uses: the pronoun «أنتِ» and a kasra on the second-person
 * kaf «ـكِ». Copied verbatim — `tests/arabicGender.test.ts` fails if it drifts from
 * `cloudflare-roleplay.js`, because two thresholds for one rule is how a guard becomes theatre.
 */
export const FEMININE_ADDRESS = /أنتِ|[\u0621-\u064A]كِ/u;

/** Where authored Arabic is written. Model output, logs and backups are deliberately absent. */
const SCAN_DIRS = ['docs/content', 'src'];
const SCAN_EXT = /\.(json|ts|tsx|js|mjs|md)$/;
const SKIP_DIRS = /node_modules|\.git|dist|website|backups|\.wrangler|\.tmp/;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST_PATH = join(ROOT, 'scripts/arabic-gender-allowlist.json');

/**
 * An allowlist entry matches one exact line, in one exact file, with its reason. Matching on
 * `file` alone would silence the whole file the first time someone added an entry.
 */
const loadAllowlist = () => {
  if (!existsSync(ALLOWLIST_PATH)) return [];
  const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('arabic-gender-allowlist.json must be a JSON array');
  return parsed;
};

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.test(entry.name)) continue;
      out.push(...walk(`${dir}/${entry.name}`));
    } else if (SCAN_EXT.test(entry.name)) {
      out.push(`${dir}/${entry.name}`);
    }
  }
  return out;
};

/** Every feminine address the scan finds, and which of them an allowlist entry explains. */
export const scan = () => {
  const allowlist = loadAllowlist();
  const files = SCAN_DIRS.filter((dir) => existsSync(join(ROOT, dir))).flatMap(walk).sort();
  const hits = [];
  const allowed = [];
  for (const file of files) {
    const lines = readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!FEMININE_ADDRESS.test(line)) return;
      const hit = { file, line: index + 1, text: line.trim().slice(0, 200) };
      const entry = allowlist.find((item) => item.file === file && line.includes(item.contains));
      entry ? allowed.push({ ...hit, why: entry.why }) : hits.push(hit);
    });
  }
  return { files: files.length, hits, allowed };
};

const main = () => {
  const { files, hits, allowed } = scan();
  const json = process.argv.includes('--json');
  if (!files) {
    console.error('no authored content was found — wrong directory?');
    process.exit(2);
  }
  if (json) {
    console.log(JSON.stringify({ files, hits, allowed }, null, 2));
  } else {
    for (const hit of hits) {
      console.log(`${hit.file}:${hit.line}\n  ${hit.text}`);
    }
    for (const item of allowed) {
      console.log(`allowed ${item.file}:${item.line} — ${item.why}`);
    }
    console.log(
      `\n${files} authored files scanned: ${hits.length} unexplained feminine address(es), ` +
        `${allowed.length} allowed. Neutral wording serves both genders; only a quoted line spoken ` +
        'by a woman belongs in scripts/arabic-gender-allowlist.json.',
    );
  }
  process.exit(hits.length ? 1 : 0);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
