#!/usr/bin/env node
/**
 * STEP 6 — One-time, GATED backfill of the `users` registry from legacy KV.
 *
 * WHY
 * Before this migration, a user's existence was recorded in exactly one place:
 * `REDEEMED_CODES` KV key `email_index:<email>` (written only inside handleVerify)
 * plus `account:<sub>` (their subscription record). Users who signed in with
 * Google but never redeemed a code had no KV footprint at all, so there is
 * nothing to backfill from — they are registered going forward (Step 3a) but
 * cannot be reconstructed retroactively. This script reports that honestly
 * instead of fabricating rows.
 *
 * HOW IT IS MEANT TO RUN
 *   1. Export the KV namespace to JSON (Cloudflare KV has no key-listing API
 *      from a script; use the dashboard or `wrangler kv key list`).
 *        mail: [{"key":"email_index:a@b.com","value":"<google-sub>"}, ...]
 *        account keys: [{"key":"account:<google-sub>","value":"{\"email\":..}"}]
 *   2. Dry-run (DEFAULT — writes nothing, prints a full plan):
 *        node scripts/backfill-user-registry.mjs --input kv-export.json
 *   3. Emit the SQL for review against a STAGING D1:
 *        node scripts/backfill-user-registry.mjs --input kv-export.json --emit-sql > backfill.sql
 *        npx wrangler d1 execute katzu-content --local   --file=backfill.sql
 *        npx wrangler d1 execute katzu-content --remote  --file=backfill.sql   # staging only!
 *
 * PRODUCTION IS REFUSED unless BOTH flags are present:
 *        --apply --confirm-production
 *
 * This script never deletes or mutates any existing table or KV key. It only
 * INSERT ... ON CONFLICT(id) DO UPDATE into the additive `users` table.
 */

import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Pure logic (exported so it can be unit-tested without network or credentials)
// ---------------------------------------------------------------------------

/** SQL string literal with escaping. */
function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function normalizeKvEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e.key === 'string')
    .map((e) => ({
      key: e.key,
      value: typeof e.value === 'string' ? e.value : e.value === undefined ? null : String(e.value),
    }));
}

/**
 * Builds the backfill plan from exported KV entries.
 * @param {{key:string,value:string|null}[]} entries
 * @param {{existingUserIds?: string[], now?: number, staleAfterMs?: number}} opts
 */
export function buildBackfillPlan(entries, opts = {}) {
  const now = opts.now ?? Date.now();
  const existing = new Set(opts.existingUserIds ?? []);

  const emailIndex = new Map(); // email -> sub
  const accounts = new Map(); // sub -> { email, expiresAt }
  const problems = [];
  let accountKeysSeen = 0;

  for (const { key, value } of entries) {
    if (key.startsWith('email_index:')) {
      const email = key.slice('email_index:'.length).toLowerCase().trim();
      if (!email || !value) {
        problems.push({ key, reason: 'empty_email_or_value' });
        continue;
      }
      emailIndex.set(email, String(value).trim());
      continue;
    }
    if (key.startsWith('account:')) {
      accountKeysSeen += 1;
      const sub = key.slice('account:'.length).trim();
      if (!sub) {
        problems.push({ key, reason: 'empty_sub' });
        continue;
      }
      // An unreadable account record is SKIPPED, never turned into a row:
      // fabricating a user from a corrupt value would be worse than missing one.
      let parsed = null;
      try {
        parsed = value ? JSON.parse(value) : null;
      } catch {
        problems.push({ key, reason: 'unparseable_account_json' });
        continue;
      }
      if (!parsed || typeof parsed !== 'object') {
        problems.push({ key, reason: 'account_not_an_object' });
        continue;
      }
      accounts.set(sub, {
        email: parsed.email ? String(parsed.email).toLowerCase().trim() : null,
        expiresAt: parsed.expiresAt ?? null,
      });
      continue;
    }
    // code:* and other keys are intentionally ignored.
  }

  const candidates = new Map(); // sub -> row

  for (const [sub, account] of accounts) {
    candidates.set(sub, {
      id: sub,
      email: account.email,
      plan: 'pro',
      plan_expires_at: account.expiresAt ? new Date(account.expiresAt).getTime() : null,
      created_at: null,
      source: 'account',
    });
  }

  for (const [email, sub] of emailIndex) {
    const existingRow = candidates.get(sub);
    if (existingRow) {
      if (!existingRow.email) existingRow.email = email;
      if (existingRow.source === 'account') existingRow.source = 'account+email_index';
      continue;
    }
    candidates.set(sub, {
      id: sub,
      email,
      plan: 'pro',
      plan_expires_at: null,
      created_at: null,
      source: 'email_index',
    });
  }

  const rows = [...candidates.values()];
  const alreadyRegistered = rows.filter((r) => existing.has(r.id));
  const toInsert = rows.filter((r) => !existing.has(r.id));

  return {
    stats: {
      kv_keys_scanned: entries.length,
      email_index_keys: emailIndex.size,
      account_keys_seen: accountKeysSeen,
      account_keys: accounts.size, // successfully parsed (readable) records
      distinct_candidates: rows.length,
      already_in_users_table: alreadyRegistered.length,
      would_insert: toInsert.length,
      problems,
    },
    candidates: toInsert.map((r) => ({
      id: r.id,
      email: r.email,
      plan: r.plan,
      plan_expires_at: r.plan_expires_at,
      source: r.source,
    })),
    unrecoverable: {
      note:
        'Free users who never redeemed an activation code have no KV footprint (no email_index, no account key) and CANNOT be backfilled retroactively. They are registered from the next sign-in onward via the /auth/session write-through.',
      count_estimable: false,
    },
  };
}

/** Idempotent, additive upsert statements. Safe to re-run. */
export function toSqlStatements(candidates, now = Date.now()) {
  const header = [
    '-- Katzu users-registry backfill (additive, idempotent).',
    '-- Only INSERT ... ON CONFLICT(id) DO UPDATE. No DROP / ALTER / DELETE.',
    `-- Generated: ${new Date(now).toISOString()}`,
    '',
  ];
  const statements = candidates.map((c) => {
    const expiresAt = c.plan_expires_at ? Number(c.plan_expires_at) : null;
    return [
      'INSERT INTO users (id, email, created_at, last_seen_at, plan, plan_expires_at, last_ip, platform)',
      `VALUES (${sqlString(c.id)}, ${sqlString(c.email)}, ${now}, ${now}, 'pro', ${expiresAt ?? 'NULL'}, NULL, 'backfill')`,
      'ON CONFLICT(id) DO UPDATE SET',
      '  plan = \'pro\',',
      '  plan_expires_at = excluded.plan_expires_at,',
      '  email = COALESCE(excluded.email, users.email);',
    ].join('\n');
  });
  return `${header.join('\n')}${statements.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { input: null, apply: false, emitSql: false, confirmProduction: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--input') args.input = argv[++i];
    else if (a === '--apply') args.apply = true;
    else if (a === '--emit-sql') args.emitSql = true;
    else if (a === '--confirm-production') args.confirmProduction = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const USAGE = `
Katzu users-registry backfill (Step 6) — read-only by default.

  node scripts/backfill-user-registry.mjs --input <kv-export.json> [options]

Options:
  --input <file>        JSON array of { key, value } KV entries (required).
  --emit-sql            Print idempotent INSERT..ON CONFLICT SQL for review.
  --apply               Actually run the backfill (requires --confirm-production).
  --confirm-production  Explicit acknowledgement that the target is production.
  -h, --help            This message.

Default behaviour is a DRY RUN: nothing is written anywhere.
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    process.stdout.write(USAGE);
    process.exit(args.input ? 0 : 1);
  }

  if (args.apply && !args.confirmProduction) {
    process.stderr.write(
      'REFUSED: --apply requires --confirm-production.\n' +
        'Run against a STAGING D1 instance first and review --emit-sql output.\n'
    );
    process.exit(2);
  }

  const entries = normalizeKvEntries(JSON.parse(readFileSync(args.input, 'utf8')));
  // existingUserIds is supplied by the operator (e.g. `SELECT id FROM users`).
  const existingUserIds = process.env.EXISTING_USER_IDS
    ? process.env.EXISTING_USER_IDS.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const plan = buildBackfillPlan(entries, { existingUserIds });

  // With --emit-sql, stdout must be pure SQL (`--emit-sql > file.sql`), so the
  // human-readable plan goes to stderr instead — the usual machine-readable CLI.
  const log = args.emitSql ? process.stderr : process.stdout;
  log.write(`${JSON.stringify(plan.stats, null, 2)}\n`);
  log.write(`\nUnrecoverable: ${plan.unrecoverable.note}\n`);
  if (plan.candidates.length) {
    log.write(`\nFirst candidates:\n${JSON.stringify(plan.candidates.slice(0, 10), null, 2)}\n`);
  }

  if (args.emitSql) {
    process.stdout.write(toSqlStatements(plan.candidates));
  }

  if (args.apply) {
    process.stderr.write(
      '\n--apply was requested. This script intentionally does NOT open a D1\n' +
        'connection itself: pipe the emitted SQL into wrangler so the operator\n' +
        'chooses the target explicitly, e.g.\n' +
        '  node scripts/backfill-user-registry.mjs --input kv.json --emit-sql > backfill.sql\n' +
        '  npx wrangler d1 execute katzu-content --local  --file=backfill.sql\n' +
        '  npx wrangler d1 execute katzu-content --remote --file=backfill.sql   # staging only\n'
    );
    process.exit(3);
  }

  if (!args.emitSql) process.stdout.write('\nDRY RUN complete — nothing was written.\n');
  else process.stderr.write('\nSQL written to stdout. Nothing was executed.\n');
}

// Only run the CLI when executed directly (importing for tests must be side-effect free).
if (process.argv[1] && process.argv[1].endsWith('backfill-user-registry.mjs')) {
  main().catch((e) => {
    process.stderr.write(`backfill failed: ${String(e?.message || e)}\n`);
    process.exit(1);
  });
}
