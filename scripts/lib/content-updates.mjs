/**
 * Pure helpers behind `scripts/load-content-updates.mjs`.
 *
 * Split out on 2026-11-01 when the loader crossed the repo's 500-line script
 * budget. Nothing here does I/O: `tests/loadContentUpdates.test.ts` imports
 * these directly, and the loader re-exports them so importers keep one path.
 */

import { DB_SCHEMA } from '../../cloudflare-content-schema.js';

export const SCENARIO_TYPE = 'scenarios';
export const OPENER_LEVELS = ['a0', 'a1', 'a2', 'b1', 'b2'];
/** The exact columns the studio can write for a scenario, in schema order. */
export const SCENARIO_COLUMNS = DB_SCHEMA.scenarios.columns.map((column) => column.name);
/** Columns whose absence from the catalogue would destroy live content. */
const MANDATORY_AUTHORED = ['id', 'title_de', 'title_ar', 'ai_persona', 'category', 'icon'];

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in tests/loadContentUpdates.test.ts)
// ---------------------------------------------------------------------------

/** The catalogue's scenario array, whether the file wraps it or not. */
export function scenarioRows(catalogue) {
  if (Array.isArray(catalogue)) return catalogue;
  return Array.isArray(catalogue?.scenarios) ? catalogue.scenarios : [];
}

/** Empty, null and undefined are one "no value" for comparison purposes. */
function norm(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Only the scenario columns, with null for anything the source omitted. */
export function pickScenarioColumns(row) {
  const picked = {};
  for (const column of SCENARIO_COLUMNS) picked[column] = row?.[column] ?? null;
  return picked;
}

/**
 * One catalogue row → one full `scenarios` payload.
 *
 * `banner_url` always comes from the live row: the catalogue does not author
 * artwork, and the studio's update writes every declared column.
 */
export function scenarioPayload(row, liveRow = {}) {
  const openers = row?.openers ?? {};
  const payload = {
    id: row?.id,
    title_de: row?.title_de,
    title_ar: row?.title_ar,
    ai_persona: row?.ai_persona,
    category: row?.category,
    icon: row?.icon,
  };
  for (const level of OPENER_LEVELS) {
    payload[`initial_message_${level}`] = openers?.[level]?.[0];
  }
  payload.banner_url = liveRow?.banner_url ?? null;
  return payload;
}

/**
 * Everything that must be authored before a row may be written. A missing opener
 * is not a cosmetic problem: `scenarioPayload` would send `undefined`, and the
 * studio would replace the live German line with an empty one.
 */
export function payloadIssues(rows) {
  const issues = [];
  rows.forEach((row, index) => {
    const label = String(row?.id ?? `row ${index + 1}`);
    for (const column of MANDATORY_AUTHORED) {
      if (!norm(row?.[column]).trim()) issues.push(`${label}: ${column} is empty`);
    }
    for (const level of OPENER_LEVELS) {
      const german = row?.openers?.[level]?.[0];
      const arabic = row?.openers?.[level]?.[1];
      if (!norm(german).trim()) issues.push(`${label}: opener ${level} has no German text`);
      if (!norm(arabic).trim()) issues.push(`${label}: opener ${level} has no Arabic text`);
    }
  });
  return issues;
}

export function liveIdMap(liveRows) {
  return new Map((liveRows ?? []).map((row) => [String(row?.id ?? ''), row]));
}

/**
 * Catalogue rows that are live, with their full payload; and the ids that are
 * not live. The second list is never written — this loader cannot create.
 */
export function scenarioTargets(catalogueRows, liveRows) {
  const live = liveIdMap(liveRows);
  const targets = [];
  const notLive = [];
  for (const row of catalogueRows ?? []) {
    const id = String(row?.id ?? '');
    if (!id) continue;
    if (!live.has(id)) {
      notLive.push(id);
      continue;
    }
    targets.push({ id, payload: scenarioPayload(row, live.get(id)) });
  }
  return { targets, notLive };
}

/** Every target's field-level difference from the live row. */
export function diffScenarios(targets, liveRows) {
  const live = liveIdMap(liveRows);
  const rows = [];
  for (const { id, payload } of targets ?? []) {
    const current = live.get(id);
    if (!current) continue;
    const changes = [];
    for (const column of SCENARIO_COLUMNS) {
      if (column === 'id') continue;
      const before = current[column] ?? null;
      const after = payload[column] ?? null;
      if (norm(before) !== norm(after)) changes.push({ column, before, after });
    }
    if (changes.length > 0) rows.push({ id, changes });
  }
  return rows;
}

/** `{ column: number of rows changing it }`, biggest first. */
export function summarizeChanges(diff) {
  const counts = {};
  for (const row of diff ?? []) {
    for (const change of row.changes ?? []) {
      counts[change.column] = (counts[change.column] ?? 0) + 1;
    }
  }
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
  );
}

/** Why this plan must not run. An empty list means it is safe to write. */
export function scopeProblems(targets, liveRows) {
  const problems = [];
  const live = liveIdMap(liveRows);
  const writable = new Set(SCENARIO_COLUMNS);
  const seen = new Set();
  for (const target of targets ?? []) {
    if (seen.has(target.id)) problems.push(`${target.id}: appears twice in the catalogue`);
    seen.add(target.id);
    if (!live.has(target.id)) problems.push(`${target.id}: not live — this loader never creates rows`);
    if (target.payload?.id !== target.id) problems.push(`${target.id}: the payload would change the id`);
    for (const column of Object.keys(target.payload ?? {})) {
      if (!writable.has(column)) problems.push(`${target.id}: "${column}" is not a writable scenarios column`);
    }
  }
  return problems;
}

/**
 * Compare live rows against either side of a manifest. Used to prove the write
 * landed (after) and that an undo restored the exact values (before).
 */
export function manifestMismatches(manifest, liveRows, phase) {
  const live = liveIdMap(liveRows);
  const expected = phase === 'before' ? manifest?.before : manifest?.after;
  const mismatches = [];
  for (const id of manifest?.ids ?? []) {
    const want = expected?.[id];
    const have = live.get(id);
    if (!have) {
      mismatches.push(`${id}: missing from the live table`);
      continue;
    }
    for (const column of SCENARIO_COLUMNS) {
      const wantValue = want?.[column] ?? null;
      const haveValue = have[column] ?? null;
      if (norm(wantValue) !== norm(haveValue)) {
        mismatches.push(`${id}.${column}: live ${JSON.stringify(haveValue)} ≠ expected ${JSON.stringify(wantValue)}`);
      }
    }
  }
  return mismatches;
}

/**
 * Rows outside the manifest that the run must not have touched. A publish-all
 * that caught an unrelated draft, or a delete, shows up here.
 */
export function untouchedProblems(beforeRows, afterRows, targetIds) {
  const target = new Set(targetIds ?? []);
  const before = liveIdMap(beforeRows);
  const after = liveIdMap(afterRows);
  const problems = [];
  for (const [id, row] of before) {
    if (target.has(id)) continue;
    const next = after.get(id);
    if (!next) {
      problems.push(`${id}: disappeared from the live table`);
      continue;
    }
    for (const column of SCENARIO_COLUMNS) {
      if (norm(row?.[column]) !== norm(next?.[column])) {
        problems.push(`${id}.${column}: changed although it was not a target`);
      }
    }
  }
  for (const id of after.keys()) {
    if (!before.has(id) && !target.has(id)) problems.push(`${id}: appeared in the live table`);
  }
  return problems;
}

/**
 * The undo record. `before` and `after` are keyed by scenario id and hold every
 * writable column, so a later run can prove both what was written and that the
 * undo put it back exactly.
 */
export function buildManifest(input) {
  const ids = input.ids ?? [];
  return {
    version: 1,
    kind: 'katzu-scenario-update',
    created_at: new Date(input.createdAt ?? Date.now()).toISOString(),
    base_url: input.baseUrl ?? null,
    backup_id: input.backupId ?? null,
    bookmark: input.bookmark ?? null,
    ids,
    columns: SCENARIO_COLUMNS,
    changed_fields: summarizeChanges(input.diff ?? []),
    before: input.before ?? {},
    after: input.after ?? {},
    audit_uids: input.auditUids ?? [],
  };
}
