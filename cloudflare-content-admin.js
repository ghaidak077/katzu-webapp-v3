/**
 * CONTENT MANAGEMENT — the D1 content surface of the new admin panel.
 *
 * Why this is a separate module: `cloudflare-admin-api.js` owns the internal
 * `/internal/admin/*` door (token, rate limit, dispatch). This module owns the
 * semantics of editing curriculum rows, and it is the only place that knows how
 * a draft becomes published content.
 *
 * The rules it exists to keep:
 *   1. Learners never see a half-edited row. Edits land in `content_drafts`;
 *      the four learner-facing tables change only on an explicit publish.
 *   2. Nothing is lost. Delete moves the row to `content_trash`; every
 *      content-changing action stores the exact before/after row; undo replays
 *      the before-state.
 *   3. Every write is audited with who, when and both states
 *      (`content_audit`), separate from the panel's `admin_audit`.
 *   4. A dated snapshot of all four tables (plus a D1 bookmark) is taken before
 *      the first write of a day.
 *   5. Bundled content is read-only. Only review notes are writable, and they
 *      live in `content_reviews` — never in the app bundle.
 *
 * SQL rules, same as the rest of the repo: table and column names come only
 * from `DB_SCHEMA`; every value is bound; the statement shapes stay simple
 * (no joins) so the in-memory test database models them faithfully.
 */

import {
  CONTENT_LEVELS,
  CONTENT_TYPES,
  DB_SCHEMA,
  contentColumns,
  validateContentRow,
} from "./cloudflare-content-schema.js";

export const CONTENT_ADMIN_TABLES = [
  "content_drafts",
  "content_audit",
  "content_trash",
  "content_backups",
  "content_reviews",
];

/** Columns an editor may set, in schema order. Exported for the panel's meta. */
export const CONTENT_MAX_ROWS = 5000;
export const CONTENT_LIST_LIMIT = 50;
const MAX_BODY_CHARS = 2 * 1024 * 1024;

const LIMITS = {
  id: 64,
  german: 200,
  title_de: 200,
  title_ar: 200,
  ai_persona: 120,
  category: 60,
  icon: 60,
  article: 10,
  plural: 120,
  part_of_speech: 40,
  translation_ar: 300,
  translation_en: 300,
  topic: 60,
  example_de: 1000,
  example_ar: 1000,
  example_en: 1000,
  rule_de: 1000,
  rule_ar: 1000,
  explanation_ar: 1000,
  initial_message_a0: 1000,
  initial_message_a1: 1000,
  initial_message_a2: 1000,
  initial_message_b1: 1000,
  initial_message_b2: 1000,
  banner_url: 400,
  scenario_id: 64,
};

const ARABIC_FIELDS = /(_ar|^title_ar|^translation_ar|^example_ar|^rule_ar|^explanation_ar)$/;
const GERMAN_FIELDS = /(^german$|^title_de$|^example_de$|^rule_de$|^initial_message_)/;
const ARABIC_LETTER = /[\u0600-\u06FF]/;
const LATIN_LETTER = /[A-Za-zÄÖÜäöüß]/;
const HTML_PATTERN = /[<>]/;

const tablesEnsured = new WeakMap();

function createTableSql(name, columns) {
  return `CREATE TABLE IF NOT EXISTS ${name} (${columns})`;
}

/** Idempotent, additive: the panel's own tables, never a learner table. */
export function ensureContentAdminTables(env) {
  const db = env?.DB;
  if (!db || typeof db.prepare !== "function") return Promise.resolve(false);
  const memo = tablesEnsured.get(db);
  if (memo) return memo;

  const statements = [
    createTableSql(
      "content_drafts",
      "uid TEXT PRIMARY KEY, table_name TEXT NOT NULL, row_key TEXT NOT NULL, operation TEXT NOT NULL, " +
        "payload TEXT, base_state TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, actor TEXT, note TEXT",
    ),
    createTableSql(
      "content_audit",
      "uid TEXT PRIMARY KEY, ts INTEGER NOT NULL, actor TEXT, action TEXT NOT NULL, table_name TEXT, row_key TEXT, " +
        "before_state TEXT, after_state TEXT, undone INTEGER NOT NULL DEFAULT 0, note TEXT",
    ),
    createTableSql(
      "content_trash",
      "uid TEXT PRIMARY KEY, table_name TEXT NOT NULL, row_key TEXT NOT NULL, payload TEXT NOT NULL, " +
        "deleted_at INTEGER NOT NULL, actor TEXT, audit_uid TEXT",
    ),
    createTableSql(
      "content_backups",
      "uid TEXT PRIMARY KEY, backup_id TEXT NOT NULL, ts INTEGER NOT NULL, actor TEXT, table_name TEXT NOT NULL, " +
        "row_count INTEGER, bookmark TEXT, payload TEXT",
    ),
    createTableSql(
      "content_reviews",
      "uid TEXT PRIMARY KEY, kind TEXT NOT NULL, entry_key TEXT NOT NULL, needs_review INTEGER NOT NULL DEFAULT 1, " +
        "note TEXT, corrected_ar TEXT, updated_at INTEGER NOT NULL, actor TEXT",
    ),
    "CREATE INDEX IF NOT EXISTS content_drafts_table ON content_drafts (table_name, row_key)",
    "CREATE INDEX IF NOT EXISTS content_audit_row ON content_audit (table_name, row_key)",
    "CREATE INDEX IF NOT EXISTS content_trash_table ON content_trash (table_name)",
    "CREATE INDEX IF NOT EXISTS content_backups_id ON content_backups (backup_id)",
    "CREATE INDEX IF NOT EXISTS content_reviews_key ON content_reviews (kind, entry_key)",
  ];

  const attempt = (async () => {
    let ok = true;
    for (const sql of statements) {
      try {
        await env.DB.prepare(sql).run();
      } catch (error) {
        ok = false;
        console.error("[content-admin] table ensure failed:", String(error?.message || error).slice(0, 160));
        break;
      }
    }
    return ok;
  })();

  tablesEnsured.set(db, attempt);
  attempt.then((ok) => {
    if (!ok && tablesEnsured.get(db) === attempt) tablesEnsured.delete(db);
  });
  return attempt;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

class HttpError extends Error {
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra || {};
  }
}

function clip(value, max) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

function newUid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function parseJson(value) {
  if (value === null || value === undefined || value === "") return null;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

async function queryAll(env, sql, binds = []) {
  const result = await env.DB.prepare(sql).bind(...binds).all();
  return Array.isArray(result?.results) ? result.results : [];
}

async function queryOne(env, sql, binds = []) {
  return (await env.DB.prepare(sql).bind(...binds).first()) || null;
}

async function runSql(env, sql, binds = []) {
  return env.DB.prepare(sql).bind(...binds).run();
}

function metaFor(type) {
  const meta = DB_SCHEMA[type];
  if (!meta) throw new HttpError(400, "invalid_type", { allowed: CONTENT_TYPES });
  return meta;
}

function isRowId(type) {
  return metaFor(type).key.column === "rowid";
}

/** The value that addresses one row in its table. */
function addressOf(type, key) {
  if (!isRowId(type)) return clip(key, 200);
  const raw = String(key || "").replace(/^rowid:/, "");
  const number = Number(raw);
  if (!Number.isInteger(number) || number <= 0) throw new HttpError(400, "invalid_key");
  return number;
}

function keyOf(type, row) {
  const meta = metaFor(type);
  if (meta.key.column === "rowid") {
    const value = row?.rowid ?? row?.id;
    return `rowid:${value}`;
  }
  return String(row?.[meta.key.column] ?? "");
}

function selectSql(type) {
  return isRowId(type)
    ? `SELECT rowid AS id, * FROM ${DB_SCHEMA[type].table}`
    : `SELECT * FROM ${DB_SCHEMA[type].table}`;
}

/** All rows of one content table. Small tables by design, capped defensively. */
async function readTable(env, type) {
  const rows = await queryAll(env, selectSql(type));
  return rows.slice(0, CONTENT_MAX_ROWS);
}

// ---------------------------------------------------------------------------
// Validation (schema + the extra rules this panel adds)
// ---------------------------------------------------------------------------

/**
 * Reject the things `validateContentRow` deliberately leaves alone: HTML in a
 * curriculum field, texts longer than a phone can render, an Arabic field with
 * no Arabic, and a duplicate natural key.
 */
export function validateContent(type, raw, options = {}) {
  const meta = metaFor(type);
  const base = validateContentRow(type, raw, options.index === undefined ? {} : { index: options.index });
  const errors = [...base.errors];
  if (!base.ok) return { ok: false, errors, row: null };

  const row = base.row;
  for (const column of meta.columns) {
    const name = column.name;
    if (column.type === "integer") continue;
    if (column.type === "level" || column.type === "enum") continue;
    const value = row[name] === null || row[name] === undefined ? "" : String(row[name]);
    const limit = LIMITS[name] || 400;
    if (value.length > limit) errors.push(`"${name}" is longer than ${limit} characters`);
    if (HTML_PATTERN.test(value)) errors.push(`"${name}" must not contain HTML`);
    if (ARABIC_FIELDS.test(name) && value && !ARABIC_LETTER.test(value)) {
      errors.push(`"${name}" must contain Arabic text`);
    }
    if (GERMAN_FIELDS.test(name) && value && !LATIN_LETTER.test(value)) {
      errors.push(`"${name}" must contain German text`);
    }
    if (name === "id" && value && !/^[A-Za-z0-9_-]+$/.test(value)) {
      errors.push(`"id" may use letters, digits, "_" and "-" only`);
    }
  }

  const existing = options.existing || [];
  const selfKey = options.selfKey || null;
  const keyColumn = meta.key.column;
  if (keyColumn !== "rowid") {
    const id = String(row[keyColumn] || "");
    const clash = existing.find((candidate) => String(candidate?.[keyColumn] || "") === id && keyOf(type, candidate) !== selfKey);
    if (clash) errors.push(`"${keyColumn}" "${id}" already exists`);
  } else if (type === "vocabulary") {
    const signature = [row.german, row.level, row.topic].map((value) => String(value || "").trim().toLowerCase()).join("\u0001");
    const clash = existing.find(
      (candidate) =>
        keyOf(type, candidate) !== selfKey &&
        [candidate.german, candidate.level, candidate.topic]
          .map((value) => String(value || "").trim().toLowerCase())
          .join("\u0001") === signature,
    );
    if (clash) errors.push("a vocabulary row with the same german + level + topic already exists");
  } else if (type === "starter_phrases") {
    const signature = [row.scenario_id, row.level, String(row.sort_order ?? "")].map((value) => String(value).trim().toLowerCase()).join("\u0001");
    const clash = existing.find(
      (candidate) =>
        keyOf(type, candidate) !== selfKey &&
        [candidate.scenario_id, candidate.level, String(candidate.sort_order ?? "")]
          .map((value) => String(value).trim().toLowerCase())
          .join("\u0001") === signature,
    );
    if (clash) errors.push("a starter phrase with the same scenario + level + sort_order already exists");
    const scenarioIds = options.scenarioIds;
    if (Array.isArray(scenarioIds) && scenarioIds.length && !scenarioIds.includes(String(row.scenario_id))) {
      errors.push(`scenario "${row.scenario_id}" does not exist`);
    }
  }

  return { ok: errors.length === 0, errors, row: errors.length ? null : row };
}

/** Every per-type extra validation needs the whole table plus the scenario ids. */
async function validateAgainstBase(env, type, raw, selfKey) {
  const existing = await readTable(env, type);
  const scenarioIds =
    type === "starter_phrases"
      ? (await readTable(env, "scenarios")).map((row) => String(row.id || ""))
      : undefined;
  return validateContent(type, raw, { existing, selfKey, scenarioIds });
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

function dayKey(now = new Date()) {
  return `content-${now.toISOString().slice(0, 10)}`;
}

async function captureBookmark(env) {
  try {
    if (typeof env?.DB?.withSession !== "function") return "";
    const session = env.DB.withSession("first-primary");
    await session.prepare("SELECT 1 AS ok").first();
    const bookmark = typeof session.getBookmark === "function" ? session.getBookmark() : "";
    return bookmark ? String(bookmark).slice(0, 400) : "";
  } catch {
    return "";
  }
}

/**
 * The snapshot every first write of the day waits for. It is deliberately one
 * row per table, because a single multi-megabyte JSON cell is a worse backup
 * than five bounded ones.
 */
export async function ensureContentBackup(env, actor, options = {}) {
  const backupId = options.backupId || dayKey();
  const existing = await queryOne(env, `SELECT * FROM content_backups WHERE backup_id = ? LIMIT 1`, [backupId]);
  if (existing && !options.force) {
    return { backup_id: backupId, created: false, ts: Number(existing.ts || 0), bookmark: existing.bookmark || "" };
  }
  if (options.force && existing) {
    // A forced backup gets a time suffix so the daily one is never overwritten.
    return ensureContentBackup(env, actor, {
      backupId: `content-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}Z`,
      force: false,
    });
  }

  const ts = Date.now();
  const bookmark = await captureBookmark(env);
  const tables = {};
  for (const type of CONTENT_TYPES) {
    const rows = await readTable(env, type);
    tables[type] = rows.length;
    await runSql(
      env,
      `INSERT INTO content_backups (uid, backup_id, ts, actor, table_name, row_count, bookmark, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newUid(), backupId, ts, actor, type, rows.length, bookmark || null, JSON.stringify(rows)],
    );
  }
  return { backup_id: backupId, created: true, ts, bookmark, tables };
}

async function readBackup(env, backupId) {
  const rows = backupId
    ? await queryAll(env, `SELECT * FROM content_backups WHERE backup_id = ?`, [backupId])
    : await queryAll(env, `SELECT * FROM content_backups`);
  if (!rows.length) return null;
  const latestId = backupId || rows.reduce((best, row) => (Number(row.ts) > Number(best.ts) ? row : best), rows[0]).backup_id;
  const chosen = rows.filter((row) => row.backup_id === latestId);
  const tables = {};
  for (const row of chosen) tables[row.table_name] = parseJson(row.payload) || [];
  return {
    backup_id: latestId,
    ts: Number(chosen[0].ts || 0),
    bookmark: chosen[0].bookmark || "",
    tables,
  };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

async function writeAudit(env, entry) {
  const uid = newUid();
  await runSql(
    env,
    `INSERT INTO content_audit (uid, ts, actor, action, table_name, row_key, before_state, after_state, undone, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uid,
      Date.now(),
      entry.actor || "internal",
      entry.action,
      entry.table || null,
      entry.key || null,
      entry.before ? JSON.stringify(entry.before).slice(0, 20000) : null,
      entry.after ? JSON.stringify(entry.after).slice(0, 20000) : null,
      0,
      entry.note ? clip(entry.note, 400) : null,
    ],
  );
  return uid;
}

async function readHistory(env, type, key, limit = 50) {
  const rows = key
    ? await queryAll(
        env,
        `SELECT * FROM content_audit WHERE table_name = ? AND row_key = ? ORDER BY rowid DESC LIMIT ${Math.max(1, Math.min(200, limit))}`,
        [type, key],
      )
    : await queryAll(
        env,
        `SELECT * FROM content_audit WHERE table_name = ? ORDER BY rowid DESC LIMIT ${Math.max(1, Math.min(200, limit))}`,
        [type],
      );
  return rows.map((row) => ({
    uid: row.uid,
    ts: Number(row.ts || 0),
    actor: row.actor || "",
    action: row.action,
    key: row.row_key || "",
    before: parseJson(row.before_state),
    after: parseJson(row.after_state),
    undone: Number(row.undone || 0) === 1,
    note: row.note || "",
    undoable: !Number(row.undone || 0) && ["publish", "delete", "restore"].includes(String(row.action)),
  }));
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

function draftShape(row) {
  return {
    uid: row.uid,
    key: row.row_key,
    operation: row.operation,
    payload: parseJson(row.payload),
    base_state: parseJson(row.base_state),
    created_at: Number(row.created_at || 0),
    updated_at: Number(row.updated_at || 0),
    actor: row.actor || "",
    note: row.note || "",
  };
}

async function draftsFor(env, type) {
  const rows = await queryAll(env, `SELECT * FROM content_drafts WHERE table_name = ?`, [type]);
  return rows.map(draftShape);
}

function diffRows(base, next) {
  const columns = Array.from(new Set([...Object.keys(base || {}), ...Object.keys(next || {})])).filter(
    (column) => column !== "id" && column !== "rowid",
  );
  return columns
    .map((column) => ({
      column,
      before: base ? base[column] ?? null : null,
      after: next ? next[column] ?? null : null,
    }))
    .filter((entry) => String(entry.before ?? "") !== String(entry.after ?? ""));
}

async function saveDraft(env, type, actor, body) {
  const key = clip(body?.key, 200);
  const note = clip(body?.note, 300);
  const rows = await readTable(env, type);
  const current = key ? rows.find((row) => keyOf(type, row) === key) || null : null;
  const existingDrafts = await draftsFor(env, type);
  const priorDraft = key ? existingDrafts.find((draft) => draft.key === key) || null : null;
  // A create-draft has no published row to look up, so its own key is the only
  // address: without this, every save of a new row would fork a second draft.
  if (key && !current && !(priorDraft && priorDraft.operation === "create")) {
    throw new HttpError(404, "row_not_found");
  }

  const selfKey = current ? keyOf(type, current) : null;
  const validated = await validateAgainstBase(env, type, body?.row, selfKey);
  if (!validated.ok) throw new HttpError(400, "invalid_content", { errors: validated.errors });
  const payload = validated.row;
  const draftKey = current
    ? selfKey
    : priorDraft
      ? key
      : isRowId(type)
        ? `new:${newUid()}`
        : String(payload[metaFor(type).key.column] || "");

  const existing = existingDrafts.find((draft) => draft.key === draftKey) || null;
  const now = Date.now();
  const draft = {
    uid: existing?.uid || newUid(),
    key: draftKey,
    operation: current ? "update" : "create",
    payload,
    base_state: current,
    created_at: existing?.created_at || now,
    updated_at: now,
    actor,
    note,
  };

  if (existing) {
    await runSql(
      env,
      `UPDATE content_drafts SET operation = ?, payload = ?, base_state = ?, updated_at = ?, actor = ?, note = ? WHERE uid = ?`,
      [draft.operation, JSON.stringify(payload), current ? JSON.stringify(current) : null, now, actor, note || null, draft.uid],
    );
  } else {
    await runSql(
      env,
      `INSERT INTO content_drafts (uid, table_name, row_key, operation, payload, base_state, created_at, updated_at, actor, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [draft.uid, type, draft.key, draft.operation, JSON.stringify(payload), current ? JSON.stringify(current) : null, now, now, actor, note || null],
    );
  }

  await writeAudit(env, {
    actor,
    action: "draft_save",
    table: type,
    key: draft.key,
    before: current,
    after: payload,
    note,
  });
  return { ...draft, diff: diffRows(current, payload) };
}

// ---------------------------------------------------------------------------
// Row writes
// ---------------------------------------------------------------------------

function writableColumns(type) {
  return contentColumns(type).filter((column) => column !== metaFor(type).key.column);
}

function rowValues(type, row, columns) {
  // An absent value binds as NULL, which is what D1 stored for a column that was
  // never filled in. Writing "" instead would make an undo or a restore differ
  // from the row it is putting back. Validation still normalises edited input to
  // "" before it reaches a draft, so new content stays readable.
  return columns.map((column) => (row?.[column] === undefined ? null : row[column]));
}

function placeholders(count) {
  return new Array(count).fill("?").join(", ");
}

async function insertRow(env, type, row, explicitRowid = null) {
  // A text-keyed table stores its key as a normal column; a rowid table has no
  // column to write, so every schema column is content here.
  const columns = contentColumns(type);
  if (isRowId(type) && explicitRowid) {
    try {
      await runSql(
        env,
        `INSERT INTO ${metaFor(type).table} (rowid, ${columns.join(", ")}) VALUES (?, ${placeholders(columns.length)})`,
        [explicitRowid, ...rowValues(type, row, columns)],
      );
      return;
    } catch (error) {
      if (/unique|constraint/i.test(String(error?.message || error))) throw error;
      /* the rowid is taken: the content matters more than the number */
    }
  }
  await runSql(
    env,
    `INSERT INTO ${metaFor(type).table} (${columns.join(", ")}) VALUES (${placeholders(columns.length)})`,
    rowValues(type, row, columns),
  );
}

async function updateRow(env, type, key, row) {
  const columns = writableColumns(type);
  const where = metaFor(type).key.column;
  return runSql(
    env,
    `UPDATE ${metaFor(type).table} SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE ${where} = ?`,
    [...rowValues(type, row, columns), addressOf(type, key)],
  );
}

async function deleteRow(env, type, key) {
  const where = metaFor(type).key.column;
  return runSql(env, `DELETE FROM ${metaFor(type).table} WHERE ${where} IN (?)`, [addressOf(type, key)]);
}

/** Re-read the row by its identity after a write (rowid tables need this). */
async function findRow(env, type, key) {
  const rows = await readTable(env, type);
  return rows.find((row) => keyOf(type, row) === key) || null;
}

async function findInserted(env, type, payload) {
  const rows = await readTable(env, type);
  const columns = contentColumns(type);
  const signature = JSON.stringify(rowValues(type, payload, columns));
  return rows.find((row) => JSON.stringify(rowValues(type, row, columns)) === signature) || null;
}

// ---------------------------------------------------------------------------
// List / meta / export
// ---------------------------------------------------------------------------

function matchesQuery(type, row, query) {
  if (!query) return true;
  const needle = query.toLowerCase();
  if (keyOf(type, row).toLowerCase().includes(needle)) return true;
  return contentColumns(type).some((column) => String(row?.[column] ?? "").toLowerCase().includes(needle));
}

async function listContent(env, type, url) {
  const query = clip(url.searchParams.get("q"), 120);
  const level = clip(url.searchParams.get("level"), 10);
  const scenario = clip(url.searchParams.get("scenario"), 80);
  const status = clip(url.searchParams.get("status"), 20) || "all";
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit")) || CONTENT_LIST_LIMIT));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const [baseRows, drafts, trashRows] = await Promise.all([
    readTable(env, type),
    draftsFor(env, type),
    queryAll(env, `SELECT * FROM content_trash WHERE table_name = ?`, [type]),
  ]);

  const draftByKey = new Map(drafts.map((draft) => [draft.key, draft]));
  const entries = baseRows.map((row) => {
    const key = keyOf(type, row);
    return { key, published: row, draft: draftByKey.get(key) || null };
  });
  // A create-draft has no published row yet; it is shown only with its draft.
  for (const draft of drafts) {
    if (entries.some((entry) => entry.key === draft.key)) continue;
    entries.push({ key: draft.key, published: null, draft });
  }

  const trashByKey = new Map();
  for (const row of trashRows) {
    const list = trashByKey.get(row.row_key) || [];
    list.push({ uid: row.uid, deleted_at: Number(row.deleted_at || 0), actor: row.actor || "", payload: parseJson(row.payload) });
    trashByKey.set(row.row_key, list);
  }

  let filtered = entries.filter((entry) => {
    const row = entry.draft?.payload || entry.published;
    if (!row) return false;
    if (status === "draft" && !entry.draft) return false;
    if (status === "published" && !entry.published) return false;
    if (level && String(row.level || "") !== level) return false;
    if (scenario) {
      const haystack = type === "starter_phrases" ? String(row.scenario_id || "") : keyOf(type, row);
      if (!haystack.toLowerCase().includes(scenario.toLowerCase())) return false;
    }
    return matchesQuery(type, row, query) || matchesQuery(type, entry.published || {}, query);
  });

  if (status === "trash") {
    filtered = trashRows.map((row) => ({
      key: row.row_key,
      published: null,
      draft: null,
      trash: { uid: row.uid, deleted_at: Number(row.deleted_at || 0), actor: row.actor || "", payload: parseJson(row.payload) },
    }));
    if (query) filtered = filtered.filter((entry) => matchesQuery(type, entry.trash.payload || {}, query));
  }

  filtered.sort((left, right) => {
    const a = left.draft?.payload || left.published || left.trash?.payload || {};
    const b = right.draft?.payload || right.published || right.trash?.payload || {};
    return String(a.level || "").localeCompare(String(b.level || "")) || left.key.localeCompare(right.key);
  });

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit).map((entry) => {
    const row = entry.draft?.payload || entry.published || entry.trash?.payload || {};
    return {
      key: entry.key,
      status: entry.trash ? "trash" : entry.draft ? "draft" : "published",
      row,
      published: entry.published,
      draft: entry.draft
        ? {
            uid: entry.draft.uid,
            operation: entry.draft.operation,
            updated_at: entry.draft.updated_at,
            actor: entry.draft.actor,
            note: entry.draft.note,
          }
        : null,
      trash: entry.trash || (trashByKey.get(entry.key) || [])[0] || null,
      diff: entry.draft ? diffRows(entry.published, entry.draft.payload) : [],
    };
  });

  return {
    type,
    limit,
    offset,
    total,
    counts: {
      rows: baseRows.length,
      drafts: drafts.length,
      trash: trashRows.length,
    },
    rows: page,
  };
}

async function metaPayload(env) {
  const counts = {};
  const drafts = {};
  const trash = {};
  for (const type of CONTENT_TYPES) {
    counts[type] = (await readTable(env, type)).length;
    drafts[type] = (await draftsFor(env, type)).length;
    trash[type] = (await queryAll(env, `SELECT * FROM content_trash WHERE table_name = ?`, [type])).length;
  }
  const latest = await queryOne(env, `SELECT * FROM content_backups ORDER BY rowid DESC LIMIT 1`);
  return {
    types: CONTENT_TYPES.map((type) => ({
      type,
      label: DB_SCHEMA[type].label,
      key: DB_SCHEMA[type].key.column,
      dedupe: DB_SCHEMA[type].dedupe,
      columns: DB_SCHEMA[type].columns.map((column) => ({
        name: column.name,
        type: column.type,
        required: Boolean(column.required),
        ui: column.ui || "text",
        options: column.options || null,
        note: column.note || "",
      })),
    })),
    levels: CONTENT_LEVELS,
    counts,
    drafts,
    trash,
    last_backup: latest
      ? { backup_id: latest.backup_id, ts: Number(latest.ts || 0), bookmark: latest.bookmark || "" }
      : null,
    bundled: { editable: false, source: "/bundled-content.json" },
  };
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(type, rows) {
  const columns = isRowId(type) ? ["id", ...contentColumns(type)] : contentColumns(type);
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(","));
  return lines.join("\r\n");
}

/** A small RFC 4180 reader — no dependency, and it never guesses. */
export function parseCsv(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const nonEmpty = rows.filter((entry) => entry.some((value) => String(value).trim() !== ""));
  if (nonEmpty.length < 1) return [];
  const headers = nonEmpty[0].map((header) => header.trim());
  return nonEmpty.slice(1).map((entry) => {
    const object = {};
    headers.forEach((header, index) => {
      object[header] = entry[index] === undefined ? "" : entry[index];
    });
    return object;
  });
}

function parseImportBody(body) {
  const format = clip(body?.format, 10) || "json";
  const content = body?.content;
  if (format === "csv") {
    if (typeof content !== "string") throw new HttpError(400, "content_required");
    if (content.length > MAX_BODY_CHARS) throw new HttpError(413, "content_too_large");
    return { format, rows: parseCsv(content) };
  }
  let parsed = content;
  if (typeof content === "string") {
    if (content.length > MAX_BODY_CHARS) throw new HttpError(413, "content_too_large");
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new HttpError(400, "invalid_json");
    }
  }
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : null;
  if (!rows) throw new HttpError(400, "rows_required");
  return { format: "json", rows };
}

/**
 * One import plan, used by both the dry run and the apply step, so the numbers
 * the operator sees are the ones that are executed.
 */
async function planImport(env, type, rows) {
  const existing = await readTable(env, type);
  const scenarioIds =
    type === "starter_phrases" ? (await readTable(env, "scenarios")).map((row) => String(row.id || "")) : undefined;
  const errors = [];
  const planned = [];
  const seen = new Set();

  rows.forEach((raw, index) => {
    const address = clip(raw?.id ?? raw?.rowid, 40);
    const current = address
      ? existing.find((row) => (isRowId(type) ? String(row.id) === address : String(row.id) === address)) || null
      : null;
    const key = current ? keyOf(type, current) : null;
    const result = validateContent(type, raw, { index, existing, selfKey: key, scenarioIds });
    if (!result.ok) {
      errors.push(...result.errors);
      return;
    }
    const signature = key || JSON.stringify(result.row);
    if (seen.has(signature)) {
      errors.push(`row ${index + 1}: duplicated inside the import`);
      return;
    }
    seen.add(signature);
    planned.push({ index, operation: current ? "update" : "create", key, row: result.row });
  });

  return {
    total: rows.length,
    valid: planned.length,
    invalid: rows.length - planned.length,
    creates: planned.filter((entry) => entry.operation === "create").length,
    updates: planned.filter((entry) => entry.operation === "update").length,
    errors,
    planned,
  };
}

// ---------------------------------------------------------------------------
// Publish / discard / duplicate / delete / restore / undo
// ---------------------------------------------------------------------------

async function publishDraft(env, type, actor, key, note) {
  const drafts = await draftsFor(env, type);
  const draft = drafts.find((entry) => entry.key === key);
  if (!draft) throw new HttpError(404, "draft_not_found");

  const currentRows = await readTable(env, type);
  const current = currentRows.find((row) => keyOf(type, row) === key) || null;
  const recheck = await validateAgainstBase(env, type, draft.payload, current ? key : null);
  if (!recheck.ok) throw new HttpError(409, "invalid_content", { errors: recheck.errors });
  const payload = recheck.row;

  let after = null;
  if (current) {
    await updateRow(env, type, key, payload);
    after = (await findRow(env, type, key)) || { ...payload };
  } else {
    try {
      await insertRow(env, type, payload);
    } catch (error) {
      if (/unique|constraint/i.test(String(error?.message || error))) throw new HttpError(409, "duplicate_row");
      throw error;
    }
    after = isRowId(type) ? await findInserted(env, type, payload) : await findRow(env, type, keyOf(type, payload));
  }

  const finalKey = after ? keyOf(type, after) : key;
  await runSql(env, `DELETE FROM content_drafts WHERE uid IN (?)`, [draft.uid]);
  const auditUid = await writeAudit(env, {
    actor,
    action: "publish",
    table: type,
    key: finalKey,
    before: current,
    after,
    note: note || draft.note,
  });
  return { key: finalKey, operation: draft.operation, before: current, after, audit_uid: auditUid };
}

async function discardDraft(env, type, actor, key) {
  const drafts = await draftsFor(env, type);
  const draft = drafts.find((entry) => entry.key === key);
  if (!draft) throw new HttpError(404, "draft_not_found");
  await runSql(env, `DELETE FROM content_drafts WHERE uid IN (?)`, [draft.uid]);
  await writeAudit(env, {
    actor,
    action: "draft_discard",
    table: type,
    key,
    before: draft.payload,
    after: null,
    note: "draft discarded",
  });
  return { discarded: true, key };
}

function nextCopyId(baseId, taken) {
  const safe = String(baseId || "copy").replace(/[^A-Za-z0-9_-]/g, "_");
  let candidate = `${safe}_copy`.slice(0, 64);
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${safe}_copy${counter}`.slice(0, 64);
    counter += 1;
  }
  return candidate;
}

async function duplicateRow(env, type, actor, key, body) {
  const rows = await readTable(env, type);
  const source = rows.find((row) => keyOf(type, row) === key);
  if (!source) throw new HttpError(404, "row_not_found");
  const copy = { ...source };
  if (!isRowId(type)) {
    const taken = new Set(rows.map((row) => String(row.id || "")));
    copy.id = clip(body?.id, 64) || nextCopyId(source.id, taken);
  }
  const draft = await saveDraft(env, type, actor, { row: copy, note: body?.note || `duplicated from ${key}` });
  await writeAudit(env, { actor, action: "duplicate", table: type, key: draft.key, before: source, after: draft.payload });
  return draft;
}

async function deleteRowToTrash(env, type, actor, key) {
  const row = await findRow(env, type, key);
  if (!row) throw new HttpError(404, "row_not_found");
  const trashUid = newUid();
  await runSql(
    env,
    `INSERT INTO content_trash (uid, table_name, row_key, payload, deleted_at, actor, audit_uid) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [trashUid, type, key, JSON.stringify(row), Date.now(), actor, null],
  );
  await deleteRow(env, type, key);
  const auditUid = await writeAudit(env, { actor, action: "delete", table: type, key, before: row, after: null });
  return { deleted: true, key, trash_uid: trashUid, audit_uid: auditUid, row };
}

async function restoreTrash(env, type, actor, trashUid) {
  const row = await queryOne(env, `SELECT * FROM content_trash WHERE uid = ?`, [trashUid]);
  if (!row || row.table_name !== type) throw new HttpError(404, "trash_not_found");
  const payload = parseJson(row.payload) || {};
  await insertRow(env, type, payload, isRowId(type) ? addressOf(type, row.row_key) : null);
  await runSql(env, `DELETE FROM content_trash WHERE uid IN (?)`, [trashUid]);
  const restored = await findRow(env, type, row.row_key);
  const auditUid = await writeAudit(env, {
    actor,
    action: "restore",
    table: type,
    key: row.row_key,
    before: null,
    after: restored || payload,
    note: "restored from trash",
  });
  return { restored: true, key: row.row_key, row: restored || payload, audit_uid: auditUid };
}

async function undoAudit(env, type, actor, auditUid) {
  const entry = await queryOne(env, `SELECT * FROM content_audit WHERE uid = ?`, [auditUid]);
  if (!entry || entry.table_name !== type) throw new HttpError(404, "audit_not_found");
  if (Number(entry.undone || 0) === 1) throw new HttpError(409, "already_undone");
  if (!["publish", "delete", "restore"].includes(String(entry.action))) throw new HttpError(409, "not_undoable");

  const key = String(entry.row_key || "");
  const before = parseJson(entry.before_state);
  const current = await findRow(env, type, key);

  if (before) {
    const restored = await validateAgainstBase(env, type, before, key);
    if (!restored.ok) throw new HttpError(409, "restore_invalid", { errors: restored.errors });
    // Write the stored row, not the validation's normalized copy: the point of an
    // undo is field-for-field equality with the before-state, including NULLs.
    if (current) await updateRow(env, type, key, before);
    else await insertRow(env, type, before, isRowId(type) ? addressOf(type, key) : null);
    if (entry.action === "delete") {
      // The row is live again: the trash entry that delete created would
      // otherwise offer a second, confusing restore of the same content.
      const stale = await queryAll(env, `SELECT * FROM content_trash WHERE table_name = ? AND row_key = ?`, [type, key]);
      if (stale.length) await runSql(env, `DELETE FROM content_trash WHERE uid IN (?)`, [stale.map((row) => row.uid)]);
    }
  } else if (current) {
    await deleteRow(env, type, key);
    if (entry.action === "restore") {
      await runSql(
        env,
        `INSERT INTO content_trash (uid, table_name, row_key, payload, deleted_at, actor, audit_uid) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newUid(), type, key, JSON.stringify(current), Date.now(), actor, null],
      );
    }
  }

  await runSql(env, `UPDATE content_audit SET undone = ? WHERE uid = ?`, [1, auditUid]);
  const after = before ? await findRow(env, type, key) : null;
  const undoUid = await writeAudit(env, {
    actor,
    action: "undo",
    table: type,
    key,
    before: current,
    after,
    note: `undo ${entry.action}`,
  });
  return { undone: true, audit_uid: auditUid, undo_uid: undoUid, key, before: current, after };
}

// ---------------------------------------------------------------------------
// Bundled content reviews (the content itself is never writable here)
// ---------------------------------------------------------------------------

const REVIEW_KINDS = ["opener", "gloss"];

async function listReviews(env, url) {
  const kind = clip(url.searchParams.get("kind"), 20);
  const rows = kind
    ? await queryAll(env, `SELECT * FROM content_reviews WHERE kind = ?`, [kind])
    : await queryAll(env, `SELECT * FROM content_reviews`);
  return {
    rows: rows.map((row) => ({
      uid: row.uid,
      kind: row.kind,
      key: row.entry_key,
      needs_review: Number(row.needs_review || 0) === 1,
      note: row.note || "",
      corrected_ar: row.corrected_ar || "",
      updated_at: Number(row.updated_at || 0),
      actor: row.actor || "",
    })),
  };
}

async function saveReview(env, actor, body) {
  const kind = clip(body?.kind, 20);
  if (!REVIEW_KINDS.includes(kind)) throw new HttpError(400, "invalid_kind", { allowed: REVIEW_KINDS });
  const key = clip(body?.key, 200);
  if (!key) throw new HttpError(400, "key_required");
  const note = clip(body?.note, 500);
  const corrected = clip(body?.corrected_ar, 1000);
  if (HTML_PATTERN.test(note) || HTML_PATTERN.test(corrected) || HTML_PATTERN.test(key)) {
    throw new HttpError(400, "invalid_content", { errors: ["HTML is not allowed in review fields"] });
  }
  if (corrected && !ARABIC_LETTER.test(corrected)) {
    throw new HttpError(400, "invalid_content", { errors: ["corrected Arabic must contain Arabic text"] });
  }
  const needsReview = body?.needs_review === true || body?.needs_review === 1;

  const existing = await queryAll(env, `SELECT * FROM content_reviews WHERE kind = ?`, [kind]);
  const current = existing.find((row) => row.entry_key === key) || null;
  const uid = current?.uid || newUid();
  const now = Date.now();
  if (current) {
    await runSql(
      env,
      `UPDATE content_reviews SET needs_review = ?, note = ?, corrected_ar = ?, updated_at = ?, actor = ? WHERE uid = ?`,
      [needsReview ? 1 : 0, note || null, corrected || null, now, actor, uid],
    );
  } else {
    await runSql(
      env,
      `INSERT INTO content_reviews (uid, kind, entry_key, needs_review, note, corrected_ar, updated_at, actor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uid, kind, key, needsReview ? 1 : 0, note || null, corrected || null, now, actor],
    );
  }
  await writeAudit(env, {
    actor,
    action: "review_update",
    table: "bundled",
    key: `${kind}:${key}`.slice(0, 200),
    before: current ? { needs_review: Number(current.needs_review || 0) === 1, note: current.note, corrected_ar: current.corrected_ar } : null,
    after: { needs_review: needsReview, note, corrected_ar: corrected },
  });
  return { uid, kind, key, needs_review: needsReview, note, corrected_ar: corrected, updated_at: now };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function bodyOf(request) {
  return request
    .json()
    .then((body) => (body && typeof body === "object" ? body : {}))
    .catch(() => ({}));
}

/**
 * @param {string[]} segments path after `/internal/admin/content`
 * @returns {Promise<Response|null>} null when the path is not a content route
 */
export async function handleContentAdminRequest(segments, options) {
  const { method, url, request, env, ctx, actor } = options;
  const who = clip(actor, 120) || "internal";
  const type = segments[0] || "";

  try {
    await ensureContentAdminTables(env);
    if (!env?.DB) return json({ error: "db_unbound" }, 500);

    if (segments.length === 0) return null;

    // Static namespace routes first, so a content type can never shadow them.
    if (segments[0] === "meta" && segments.length === 1) {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return json(await metaPayload(env), 200);
    }

    if (segments[0] === "backup" && segments.length === 1) {
      if (method === "POST") {
        await ensureContentAdminTables(env);
        const result = await ensureContentBackup(env, who, { force: true });
        await writeAudit(env, { actor: who, action: "backup", table: "content", key: result.backup_id });
        return json(result, 200);
      }
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      if (url.searchParams.get("list") === "1") {
        // One row per table per backup; collapse them into one entry per date so
        // the panel can show a short, honest history.
        const rows = await queryAll(env, `SELECT * FROM content_backups ORDER BY rowid DESC`);
        const seen = new Map();
        for (const row of rows) {
          const entry = seen.get(row.backup_id);
          if (entry) entry.tables += 1;
          else seen.set(row.backup_id, { backup_id: row.backup_id, ts: Number(row.ts || 0), bookmark: row.bookmark || "", tables: 1 });
        }
        return json({ backups: [...seen.values()] }, 200);
      }
      const backup = await readBackup(env, clip(url.searchParams.get("id"), 80) || null);
      if (!backup) return json({ error: "backup_not_found" }, 404);
      if (url.searchParams.get("download") === "1") {
        return json(backup, 200, {
          "Content-Disposition": `attachment; filename="katzu-content-${backup.backup_id}.json"`,
        });
      }
      return json(backup, 200);
    }

    if (segments[0] === "audit" && segments.length === 1) {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit")) || 50));
      const rows = await queryAll(env, `SELECT * FROM content_audit ORDER BY rowid DESC LIMIT ${limit}`);
      return json({ rows: rows.map((row) => ({
        uid: row.uid,
        ts: Number(row.ts || 0),
        actor: row.actor || "",
        action: row.action,
        table: row.table_name || "",
        key: row.row_key || "",
        undone: Number(row.undone || 0) === 1,
        note: row.note || "",
      })) }, 200);
    }

    if (segments[0] === "import" && segments.length === 1) {
      if (method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const body = await bodyOf(request);
      if (!CONTENT_TYPES.includes(body.type)) throw new HttpError(400, "invalid_type", { allowed: CONTENT_TYPES });
      const parsed = parseImportBody(body);
      const plan = await planImport(env, body.type, parsed.rows);
      if (body.apply !== true) {
        return json({ type: body.type, applied: false, format: parsed.format, ...plan, planned: undefined }, 200);
      }
      if (plan.invalid > 0) {
        return json({ type: body.type, applied: false, error: "dry_run_failed", ...plan, planned: undefined }, 400);
      }
      await ensureContentBackup(env, who);
      const drafts = [];
      for (const entry of plan.planned) {
        if (entry.operation === "update") {
          drafts.push(await saveDraft(env, body.type, who, { key: entry.key, row: entry.row, note: `import row ${entry.index + 1}` }));
        } else {
          drafts.push(await saveDraft(env, body.type, who, { row: entry.row, note: `import row ${entry.index + 1}` }));
        }
      }
      await writeAudit(env, {
        actor: who,
        action: "import_apply",
        table: body.type,
        key: `${drafts.length} drafts`,
        note: `format=${parsed.format} valid=${plan.valid}`,
      });
      return json({ type: body.type, applied: true, format: parsed.format, ...plan, planned: undefined, drafts: drafts.length }, 200);
    }

    if (segments[0] === "export" && segments.length === 1) {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      const exportType = clip(url.searchParams.get("type"), 30);
      if (!CONTENT_TYPES.includes(exportType)) throw new HttpError(400, "invalid_type", { allowed: CONTENT_TYPES });
      const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
      const rows = await readTable(env, exportType);
      const stamp = new Date().toISOString().slice(0, 10);
      await writeAudit(env, { actor: who, action: "export", table: exportType, key: `${rows.length} rows` });
      if (format === "csv") {
        return new Response(toCsv(exportType, rows), {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="katzu-${exportType}-${stamp}.csv"`,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      return json({ type: exportType, exported_at: Date.now(), rows }, 200, {
        "Content-Disposition": `attachment; filename="katzu-${exportType}-${stamp}.json"`,
      });
    }

    if (segments[0] === "reviews" && segments.length === 2 && segments[1] === "export") {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      const kind = clip(url.searchParams.get("kind"), 20);
      if (!REVIEW_KINDS.includes(kind)) throw new HttpError(400, "invalid_kind", { allowed: REVIEW_KINDS });
      const rows = await queryAll(env, `SELECT * FROM content_reviews WHERE kind = ?`, [kind]);
      const corrections = {};
      const notes = {};
      const flagged = [];
      for (const row of rows) {
        if (row.corrected_ar) corrections[row.entry_key] = row.corrected_ar;
        if (row.note) notes[row.entry_key] = row.note;
        if (Number(row.needs_review || 0) === 1) flagged.push(row.entry_key);
      }
      await writeAudit(env, {
        actor: who,
        action: "review_export",
        table: "bundled",
        key: `${kind}:${Object.keys(corrections).length} corrections`,
      });
      return json(
        {
          format: "katzu-bundled-corrections-v1",
          kind,
          generated_at: Date.now(),
          corrections,
          notes,
          needs_review: flagged,
        },
        200,
        { "Content-Disposition": `attachment; filename="katzu-${kind}-corrections.json"` },
      );
    }

    if (segments[0] === "reviews" && segments.length === 1) {
      if (method === "GET") return json(await listReviews(env, url), 200);
      if (method === "POST") {
        const body = await bodyOf(request);
        await ensureContentBackup(env, who);
        return json(await saveReview(env, who, body), 200);
      }
      return json({ error: "method_not_allowed" }, 405);
    }

    if (!CONTENT_TYPES.includes(type)) return json({ error: "not_found" }, 404);
    const action = segments[1] || "";

    if (segments.length === 1) {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return json(await listContent(env, type, url), 200);
    }

    if (segments.length !== 2) return json({ error: "not_found" }, 404);

    if (action === "export" && method === "GET") {
      const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
      const rows = await readTable(env, type);
      await writeAudit(env, { actor: who, action: "export", table: type, key: `${rows.length} rows` });
      if (format === "csv") {
        return new Response(toCsv(type, rows), {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="katzu-${type}.csv"`,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      return json({ type, exported_at: Date.now(), rows }, 200, {
        "Content-Disposition": `attachment; filename="katzu-${type}.json"`,
      });
    }

    if (action === "history" && method === "GET") {
      const key = clip(url.searchParams.get("key"), 200);
      const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit")) || 50));
      return json({ type, key: key || null, rows: await readHistory(env, type, key, limit) }, 200);
    }

    if (method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = await bodyOf(request);

    if (action === "draft") {
      await ensureContentBackup(env, who);
      const draft = await saveDraft(env, type, who, body);
      return json({ draft }, 200);
    }

    if (action === "publish") {
      await ensureContentBackup(env, who);
      const result = await publishDraft(env, type, who, clip(body.key, 200), clip(body.note, 300));
      return json(result, 200);
    }

    if (action === "publish-all") {
      await ensureContentBackup(env, who);
      const drafts = await draftsFor(env, type);
      const published = [];
      const failed = [];
      for (const draft of drafts) {
        try {
          published.push(await publishDraft(env, type, who, draft.key, "publish all"));
        } catch (error) {
          failed.push({ key: draft.key, error: error?.code || "publish_failed", details: error?.extra?.errors || [] });
        }
      }
      return json({ type, published: published.length, failed }, 200);
    }

    if (action === "discard") {
      return json(await discardDraft(env, type, who, clip(body.key, 200)), 200);
    }

    if (action === "duplicate") {
      await ensureContentBackup(env, who);
      const draft = await duplicateRow(env, type, who, clip(body.key, 200), body);
      return json({ draft }, 200);
    }

    if (action === "delete") {
      await ensureContentBackup(env, who);
      const result = await deleteRowToTrash(env, type, who, clip(body.key, 200));
      return json(result, 200);
    }

    if (action === "restore") {
      await ensureContentBackup(env, who);
      const result = await restoreTrash(env, type, who, clip(body.trash_uid, 80));
      return json(result, 200);
    }

    if (action === "undo") {
      await ensureContentBackup(env, who);
      const result = await undoAudit(env, type, who, clip(body.audit_uid, 80));
      return json(result, 200);
    }

    return json({ error: "not_found" }, 404);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.code, ...error.extra }, error.status);
    console.error("[content-admin]", String(error?.message || error).slice(0, 200));
    return json({ error: "internal_error" }, 500);
  }
}
