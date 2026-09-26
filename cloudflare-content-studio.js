// ============================================================================
// CONTENT STUDIO — the admin API behind the dashboard's Content/Schema tabs
// ============================================================================
//
// Why this is a separate module: `cloudflare-admin.js` owns the admin routes but
// its dashboard renderer is a single large template, and the content surface is
// the half that changes most. Keeping it here keeps the whole thing reviewable.
//
// Every handler returns `{ status, body }` and never builds a Response: the caller
// (`handleAdminRoutes`) owns CORS and the JSON envelope, so exactly one place
// decides what an admin response looks like.
//
// Auth is NOT checked here — `handleAdminRoutes` has already validated the bearer
// secret before dispatching. One gate, not two.
//
// SQL rules followed throughout:
//   - table and column names come only from `DB_SCHEMA`, never from a request;
//   - every value is bound, never interpolated;
//   - multi-row writes go through one `env.DB.batch`, so a failed upload cannot
//     leave the curriculum half-updated.

import {
  CONTENT_LEVELS,
  CONTENT_TYPES,
  DB_SCHEMA,
  contentColumns,
  contentOrderBy,
  editableColumns,
  isRowIdTable,
  naturalKey,
  validateContentRow,
} from "./cloudflare-content-schema.js";

/** One upload is a curriculum revision, not a data migration. */
const MAX_UPLOAD_ROWS = 2000;
/** D1 caps bound parameters per statement; keep IN (…) lists well inside it. */
const CHUNK = 50;
/** A confirmation dialog is useless if the sample overflows the page. */
const SAMPLE_DELETE_IDS = 20;
const MAX_REPORTED_ERRORS = 25;

const fail = (status, error, extra = {}) => ({ status, body: { error, ...extra } });

async function queryAll(env, sql, params = []) {
  const stmt = env.DB.prepare(sql);
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all();
  return results || [];
}

async function queryOne(env, sql, params = []) {
  const stmt = env.DB.prepare(sql);
  return await (params.length ? stmt.bind(...params) : stmt).first();
}

/** `rowid` tables expose D1's implicit rowid as `id`; `id` tables already have one. */
function projection(type) {
  return isRowIdTable(type) ? "rowid AS id, *" : "*";
}

/** Identity column used in WHERE clauses: the row's address, not a data column. */
function identityColumn(type) {
  return isRowIdTable(type) ? "rowid" : DB_SCHEMA[type].key.column;
}

function table(type) {
  return DB_SCHEMA[type].table;
}

function parsePagination(url) {
  const rawLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
  const rawOffset = Number.parseInt(url.searchParams.get("offset") || "0", 10);
  return {
    limit: Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 200),
    offset: Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0),
  };
}

/**
 * `sort` may only name a column of that table (or its identity), and the direction
 * is a closed enum — an allow-list, never interpolation of user input.
 */
function parseSort(type, url) {
  const requested = url.searchParams.get("sort");
  if (!requested) return null;
  const allowed = new Set([...contentColumns(type), DB_SCHEMA[type].key.column, "id"]);
  if (!allowed.has(requested)) return null;
  const dir = url.searchParams.get("dir") === "desc" ? "DESC" : "ASC";
  const column = requested === "id" ? identityColumn(type) : requested;
  return `${column} ${dir}`;
}

function searchColumns(type) {
  switch (type) {
    case "scenarios":
      return ["id", "title_de", "title_ar", "category"];
    case "grammar":
      return ["id", "title_ar", "rule_de"];
    default:
      return ["german", "translation_ar", "translation_en"];
  }
}

/** The one column each table may be filtered by beyond `level`. */
const FACET_COLUMN = { scenarios: "category", vocabulary: "topic", starter_phrases: "scenario_id" };

/** Builds the WHERE clause and its bound values from the query string. */
function buildFilters(type, url) {
  const clauses = [];
  const params = [];

  const level = url.searchParams.get("level");
  if (level) {
    clauses.push("level = ?");
    params.push(level);
  }
  const facet = FACET_COLUMN[type];
  const facetValue = facet ? url.searchParams.get(facet) : null;
  if (facetValue) {
    clauses.push(`${facet} = ?`);
    params.push(facetValue);
  }
  const q = url.searchParams.get("q");
  if (q) {
    const columns = searchColumns(type);
    clauses.push(`(${columns.map((column) => `${column} LIKE ?`).join(" OR ")})`);
    for (let i = 0; i < columns.length; i++) params.push(`%${q}%`);
  }

  return { where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", params };
}

// ---------------------------------------------------------------------------
// Profiles: /admin/schema and /admin/export-all
// ---------------------------------------------------------------------------

/** Row counts for the type switcher's badges. Fail-soft: a missing table must
 *  never take the whole dashboard down. */
async function tableCounts(env) {
  const counts = {};
  for (const type of CONTENT_TYPES) {
    try {
      const row = await queryOne(env, `SELECT COUNT(*) AS total FROM ${table(type)}`);
      counts[type] = Number(row?.total ?? 0);
    } catch {
      counts[type] = 0;
    }
  }
  return counts;
}

export async function contentSchema(env) {
  if (!env.DB) return fail(500, "db_unbound");
  return {
    status: 200,
    body: {
      generated_at: new Date().toISOString(),
      upload_endpoint: "/admin/upload",
      valid_content_types: CONTENT_TYPES,
      valid_levels: CONTENT_LEVELS,
      current_row_counts: await tableCounts(env),
      schema: DB_SCHEMA,
    },
  };
}

export async function contentExportAll(env) {
  if (!env.DB) return fail(500, "db_unbound");
  const data = {};
  const counts = {};
  const errors = [];
  for (const type of CONTENT_TYPES) {
    try {
      const rows = await queryAll(env, `SELECT ${projection(type)} FROM ${table(type)} ORDER BY ${contentOrderBy(type)}`);
      data[type] = rows;
      counts[type] = rows.length;
    } catch (err) {
      data[type] = [];
      counts[type] = 0;
      errors.push({ type, message: String(err?.message || err).slice(0, 200) });
    }
  }
  return {
    status: 200,
    body: {
      exported_at: new Date().toISOString(),
      counts,
      schema: DB_SCHEMA,
      data,
      ...(errors.length ? { errors } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function contentList(env, url) {
  const type = url.searchParams.get("type");
  if (!CONTENT_TYPES.includes(type)) return fail(400, "invalid_type", { allowed: CONTENT_TYPES });
  if (!env.DB) return fail(500, "db_unbound");

  const { where, params } = buildFilters(type, url);
  const { limit, offset } = parsePagination(url);
  const order = parseSort(type, url) || contentOrderBy(type);

  const totalRow = await queryOne(env, `SELECT COUNT(*) AS total FROM ${table(type)}${where}`, params);
  const rows = await queryAll(
    env,
    `SELECT ${projection(type)} FROM ${table(type)}${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  // LIMIT/OFFSET are formatted rather than bound: both are integers from
  // parsePagination, and a literal keeps the generated SQL readable in a tail log.
  return {
    status: 200,
    body: { type, count: rows.length, total: Number(totalRow?.total ?? 0), limit, offset, rows },
  };
}

// ---------------------------------------------------------------------------
// Row validation shared by every write path
// ---------------------------------------------------------------------------

/**
 * Validate a batch of rows, keeping the good ones.
 *
 * One malformed cell in a 500-row sheet must not throw the other 499 away, so
 * errors are collected and reported per row instead of failing the batch. The
 * accepted entries keep their original index so an error message still points at
 * the row number the admin sees in their spreadsheet.
 */
function screenRows(type, rows) {
  const accepted = [];
  const errors = [];
  rows.forEach((raw, index) => {
    const result = validateContentRow(type, raw, { index });
    if (result.ok) accepted.push({ index, address: result.address, row: result.row });
    else errors.push(...result.errors);
  });
  return { accepted, errors };
}

/**
 * Decide what each accepted row does, without touching the database.
 *
 * On a rowid table a row that carries an id this database has never seen is
 * deliberately *not* treated as an update of nothing: it falls through to the
 * natural-key check and inserts, so importing a sheet exported from another
 * database cannot silently drop rows.
 */
function planRows(type, accepted, existing) {
  const meta = DB_SCHEMA[type];
  const columns = contentColumns(type);
  const rowidTable = isRowIdTable(type);
  const inserts = [];
  const updates = [];
  let duplicates = 0;

  const knownAddresses = new Set(existing.map((row) => String(row.id)));
  const knownKeys = new Set(
    existing.map((row) => {
      const key = naturalKey(type, row);
      return key ? key.join("|") : "";
    }),
  );

  for (const entry of accepted) {
    const values = columns.map((column) => entry.row[column]);

    if (!rowidTable) {
      const assigns = columns
        .filter((column) => column !== meta.key.column)
        .map((column) => `${column} = excluded.${column}`)
        .join(", ");
      const sql =
        `INSERT INTO ${meta.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})` +
        (assigns ? ` ON CONFLICT(${meta.key.column}) DO UPDATE SET ${assigns}` : "");
      const target = knownAddresses.has(String(entry.row[meta.key.column])) ? updates : inserts;
      target.push({ sql, values });
      continue;
    }

    if (entry.address !== null && knownAddresses.has(String(entry.address))) {
      updates.push({
        sql: `UPDATE ${meta.table} SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE rowid = ?`,
        values: [...values, entry.address],
      });
      continue;
    }

    const key = naturalKey(type, entry.row)?.join("|");
    if (entry.address === null && key && knownKeys.has(key)) {
      duplicates += 1;
      continue;
    }
    inserts.push({
      sql: `INSERT INTO ${meta.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      values,
    });
  }

  return { inserts, updates, duplicates };
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * `POST /admin/upload` — validated, per-row-tolerant, batched.
 *
 * Sync mode never deletes on the first call: it answers with the count and a
 * sample of what *would* go, and only a second call carrying `syncConfirmed`
 * writes. Destructive bulk actions in this product always require that second
 * step (same bar as the account-deletion flow).
 */
export async function contentUpload(env, body, deps = {}) {
  if (!env.DB) return fail(500, "db_unbound");

  const type = body?.contentType;
  if (!CONTENT_TYPES.includes(type)) return fail(400, "invalid_contentType", { allowed: CONTENT_TYPES });

  const rows = body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return fail(400, "invalid_body", { detail: "contentType and a non-empty rows array are required" });
  }
  if (rows.length > MAX_UPLOAD_ROWS) {
    return fail(400, "too_many_rows", { detail: `split the upload into batches of ${MAX_UPLOAD_ROWS}`, max: MAX_UPLOAD_ROWS });
  }

  const meta = DB_SCHEMA[type];
  const rowidTable = isRowIdTable(type);
  const sync = body?.sync === true;
  const syncConfirmed = body?.syncConfirmed === true;

  const { accepted, errors } = screenRows(type, rows);

  // A starter phrase pointing at a scenario that does not exist is invisible in
  // the app, so it is rejected here rather than written and forgotten.
  if (type === "starter_phrases" && accepted.length > 0) {
    let known;
    try {
      known = new Set((await queryAll(env, "SELECT id FROM scenarios")).map((row) => String(row.id)));
    } catch (err) {
      return fail(500, "scenario_lookup_failed", { detail: String(err?.message || err).slice(0, 200) });
    }
    for (let i = accepted.length - 1; i >= 0; i--) {
      const scenarioId = String(accepted[i].row.scenario_id);
      if (known.has(scenarioId)) continue;
      errors.push(`row ${accepted[i].index + 1}: scenario_id "${scenarioId}" is not in scenarios — phrase skipped`);
      accepted.splice(i, 1);
    }
  }

  const skippedInvalid = rows.length - accepted.length;

  if (sync && rowidTable && accepted.some((entry) => entry.address === null)) {
    return fail(400, "sync_requires_ids", {
      detail:
        `${meta.table} rows must carry their exported "id" for sync mode — without it a row cannot be told apart ` +
        "from one about to be deleted. Export the table first, edit it, then upload that file.",
    });
  }

  // One read of the table gives both the identity set and the natural keys the
  // dedupe rule needs.
  const existing = await queryAll(
    env,
    `SELECT ${rowidTable ? "rowid AS id, *" : "id"} FROM ${meta.table}`,
  );
  const uploaded = new Set(accepted.map((entry) => String(entry.address ?? entry.row[meta.key.column])));
  const wouldDelete = existing.filter((row) => !uploaded.has(String(row.id))).map((row) => row.id);

  if (sync && !syncConfirmed) {
    return {
      status: 200,
      body: {
        success: false,
        requiresSyncConfirmation: true,
        contentType: type,
        wouldDelete: wouldDelete.length,
        sampleDeleteIds: wouldDelete.slice(0, SAMPLE_DELETE_IDS),
        totalSubmitted: rows.length,
      },
    };
  }

  const { inserts, updates, duplicates } = planRows(type, accepted, existing);
  const deleted = sync && syncConfirmed ? wouldDelete : [];

  const statements = [];
  for (const entry of inserts) statements.push(env.DB.prepare(entry.sql).bind(...entry.values));
  for (const entry of updates) statements.push(env.DB.prepare(entry.sql).bind(...entry.values));
  for (let i = 0; i < deleted.length; i += CHUNK) {
    const chunk = deleted.slice(i, i + CHUNK);
    statements.push(
      env.DB.prepare(
        `DELETE FROM ${meta.table} WHERE ${identityColumn(type)} IN (${chunk.map(() => "?").join(", ")})`,
      ).bind(...chunk),
    );
  }
  if (statements.length > 0) await env.DB.batch(statements);

  const payload = {
    success: true,
    contentType: type,
    inserted: inserts.length,
    updated: updates.length,
    deleted: deleted.length,
    skippedDuplicates: duplicates,
    skippedInvalid,
    totalSubmitted: rows.length,
    errors: errors.slice(0, MAX_REPORTED_ERRORS),
    ...(errors.length > MAX_REPORTED_ERRORS ? { errorsTruncated: errors.length - MAX_REPORTED_ERRORS } : {}),
    // Back-compat: `scripts/load-curriculum.mjs` reads `count` as "rows written".
    count: inserts.length + updates.length,
  };
  if (deps.recordActivity) {
    await deps.recordActivity(env, null, "content_bulk_upload", {
      type,
      submitted: rows.length,
      inserted: payload.inserted,
      updated: payload.updated,
      deleted: payload.deleted,
      skipped: payload.skippedDuplicates + payload.skippedInvalid,
    });
  }
  return { status: 200, body: payload };
}

// ---------------------------------------------------------------------------
// Single-row create / update / delete
// ---------------------------------------------------------------------------

/**
 * `POST /admin/api/content-create` — one row, through the same validator the
 * bulk path uses. A create that would land on an existing identity is refused
 * rather than silently turned into an update: "Add" and "Edit" must mean what
 * they say.
 */
export async function contentCreate(env, body, deps = {}) {
  if (!env.DB) return fail(500, "db_unbound");
  const type = body?.type;
  if (!CONTENT_TYPES.includes(type)) return fail(400, "invalid_type", { allowed: CONTENT_TYPES });

  const meta = DB_SCHEMA[type];
  const rowidTable = isRowIdTable(type);
  const validated = validateContentRow(type, body?.row, {});
  if (!validated.ok) return fail(400, "invalid_row", { errors: validated.errors });
  if (rowidTable && body?.row?.id !== undefined && body?.row?.id !== null && String(body.row.id).trim() !== "") {
    return fail(400, "unexpected_id", { detail: "a new row must not carry an id; use content-update to edit one" });
  }

  const identity = identityColumn(type);
  const address = rowidTable ? null : validated.row[meta.key.column];
  if (!rowidTable) {
    const clash = await queryOne(env, `SELECT ${identity} AS id FROM ${meta.table} WHERE ${identity} = ?`, [address]);
    if (clash) return fail(409, "duplicate_id", { detail: `a ${type} row with id "${address}" already exists` });
  } else {
    const duplicate = naturalKey(type, validated.row);
    if (duplicate) {
      const columns = type === "vocabulary" ? ["german", "level", "topic"] : ["scenario_id", "level", "sort_order"];
      const row = await queryOne(
        env,
        `SELECT rowid AS id FROM ${meta.table} WHERE ${columns.map((column) => `${column} = ?`).join(" AND ")}`,
        columns.map((column) => validated.row[column]),
      );
      if (row) return fail(409, "duplicate_row", { detail: "an equivalent row already exists — edit it instead", existing_id: row.id });
    }
  }

  const columns = contentColumns(type);
  const inserted = await env.DB.prepare(
    `INSERT INTO ${meta.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
  )
    .bind(...columns.map((column) => validated.row[column]))
    .run();

  if (deps.recordActivity) await deps.recordActivity(env, null, "content_create", { type, id: address ?? inserted?.meta?.last_row_id ?? null });
  return {
    status: 201,
    body: { success: true, type, id: address ?? inserted?.meta?.last_row_id ?? null },
  };
}

export async function contentUpdate(env, body, deps = {}) {
  if (!env.DB) return fail(500, "db_unbound");
  const type = body?.type;
  if (!CONTENT_TYPES.includes(type)) return fail(400, "invalid_type", { allowed: CONTENT_TYPES });

  const meta = DB_SCHEMA[type];
  const rowidTable = isRowIdTable(type);
  const allowed = editableColumns(type);
  const updates = Array.isArray(body?.updates) ? body.updates : [];
  if (updates.length === 0) {
    return fail(400, "invalid_body", { detail: "updates must be a non-empty array of { id, fields }" });
  }

  const statements = [];
  const keys = [];
  for (let i = 0; i < updates.length; i++) {
    const target = updates[i]?.id;
    const fields = updates[i]?.fields;
    if (rowidTable && (!Number.isInteger(Number(target)) || Number(target) <= 0)) {
      return fail(400, "invalid_id", { detail: `updates[${i}].id must be the positive rowid of an existing row` });
    }
    if (!rowidTable && (target === undefined || target === null || String(target).trim() === "")) {
      return fail(400, "invalid_id", { detail: `updates[${i}].id must be the "${meta.key.column}" of an existing row` });
    }
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      return fail(400, "invalid_fields", { detail: `updates[${i}].fields must be an object` });
    }
    const requested = Object.keys(fields);
    const columns = requested.filter((column) => allowed.includes(column));
    if (columns.length === 0 || columns.length !== requested.length) {
      return fail(400, "invalid_columns", { allowed, got: requested });
    }
    if (columns.includes("level") && !CONTENT_LEVELS.includes(String(fields.level).trim())) {
      return fail(400, "invalid_level", { detail: `updates[${i}].level must be one of ${CONTENT_LEVELS.join(", ")}` });
    }
    for (const column of columns) {
      const spec = meta.columns.find((candidate) => candidate.name === column);
      if (spec?.type === "integer" && !Number.isInteger(Number(fields[column]))) {
        return fail(400, "invalid_value", { detail: `updates[${i}].${column} must be a whole number` });
      }
    }
    if (type === "starter_phrases" && columns.includes("scenario_id")) {
      const scenario = await queryOne(env, "SELECT id FROM scenarios WHERE id = ?", [String(fields.scenario_id)]);
      if (!scenario) {
        return fail(400, "unknown_scenario", { detail: `updates[${i}].scenario_id "${fields.scenario_id}" is not a scenario` });
      }
    }
    statements.push(
      env.DB.prepare(
        `UPDATE ${meta.table} SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE ${identityColumn(type)} = ?`,
      ).bind(...columns.map((column) => fields[column]), rowidTable ? Number(target) : String(target)),
    );
    keys.push(rowidTable ? Number(target) : String(target));
  }

  await env.DB.batch(statements);
  // Read the rows back so the response is the write, not a claim about it.
  const identity = identityColumn(type);
  const rows = await queryAll(
    env,
    `SELECT ${projection(type)} FROM ${meta.table} WHERE ${identity} IN (${keys.map(() => "?").join(", ")}) ORDER BY ${identity} ASC`,
    keys,
  );
  if (deps.recordActivity) await deps.recordActivity(env, null, "content_update", { type, count: keys.length });
  return { status: 200, body: { type, updated: keys.length, rows } };
}

/** `POST /admin/api/content-delete` — powers both the row action and "delete selected". */
export async function contentDelete(env, body, deps = {}) {
  if (!env.DB) return fail(500, "db_unbound");
  const type = body?.type;
  if (!CONTENT_TYPES.includes(type)) return fail(400, "invalid_type", { allowed: CONTENT_TYPES });

  const meta = DB_SCHEMA[type];
  const rowidTable = isRowIdTable(type);
  const identity = identityColumn(type);

  const raw = Array.isArray(body?.ids) ? body.ids : [];
  const ids = [];
  for (const value of raw) {
    if (rowidTable) {
      const asNumber = Number(value);
      if (!Number.isInteger(asNumber) || asNumber <= 0) {
        return fail(400, "invalid_id", { detail: `"${value}" is not a positive rowid` });
      }
      ids.push(asNumber);
    } else {
      const asString = String(value ?? "").trim();
      if (!asString) return fail(400, "invalid_id", { detail: "ids must be non-empty strings" });
      ids.push(asString);
    }
  }
  if (ids.length === 0) return fail(400, "invalid_body", { detail: "ids must be a non-empty array" });

  const unique = [...new Set(ids)];
  const existing = await queryAll(
    env,
    `SELECT ${identity} AS id FROM ${meta.table} WHERE ${identity} IN (${unique.map(() => "?").join(", ")})`,
    unique,
  );
  const found = new Set(existing.map((row) => String(row.id)));
  const notFound = unique.filter((id) => !found.has(String(id)));
  const toDelete = unique.filter((id) => found.has(String(id)));

  const statements = [];
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const chunk = toDelete.slice(i, i + CHUNK);
    statements.push(
      env.DB.prepare(`DELETE FROM ${meta.table} WHERE ${identity} IN (${chunk.map(() => "?").join(", ")})`).bind(...chunk),
    );
  }
  if (statements.length > 0) await env.DB.batch(statements);

  if (deps.recordActivity) {
    await deps.recordActivity(env, null, "content_delete", { type, count: toDelete.length, missing: notFound.length });
  }
  return { status: 200, body: { type, deleted: toDelete.length, notFound } };
}
