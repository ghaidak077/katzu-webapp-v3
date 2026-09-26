// ============================================================================
// CONTENT SCHEMA — the one description of the D1 curriculum tables
// ============================================================================
//
// Why this file exists: the admin Content Studio validates uploads, generates its
// add/edit form, and renders its Schema tab. Those three must never disagree, so
// they all read `DB_SCHEMA` below (the form/tab get it over `/admin/schema`).
//
// The column sets here are the *same* contract as `CONTENT_COLUMNS` in
// `src/lib/content/curriculumAudit.ts`, which gates authored curriculum drafts and
// the CLI loader. A drift between the two would mean an upload the admin accepts
// and the audit rejects (or worse, a column one knows and the other silently
// drops), so `tests/contentStudio.test.ts` asserts they are identical. Change one,
// change the other.
//
// `required: true` means "must be present and non-empty". It deliberately mirrors
// the audit's rule, not the SQL schema: D1 columns are mostly nullable text, so
// only this contract stops a half-filled row from reaching learners.

export const CONTENT_LEVELS = ["A1", "A2", "B1", "B2"];

const LEVEL_SET = new Set(CONTENT_LEVELS);

/**
 * Column descriptors. `type` drives validation; `ui` drives the generated form
 * control, so adding a column here adds it to the editor with no frontend change.
 */
const text = (name, note, ui = "text") => ({ name, type: "text", required: true, ui, note });
const optionalText = (name, note, ui = "text") => ({ name, type: "text", required: false, ui, note });
const level = () => ({ name: "level", type: "level", required: true, ui: "select", note: "CEFR level: A1, A2, B1 or B2." });
const integer = (name, note) => ({ name, type: "integer", required: true, ui: "number", note });

export const DB_SCHEMA = {
  scenarios: {
    label: "Scenarios",
    table: "scenarios",
    // Row identity. `scenarios` and `grammar` are keyed by a text `id` the author
    // chooses; `vocabulary` and `starter_phrases` have no unique column, so D1's
    // implicit `rowid` is the only stable handle on a row.
    key: { column: "id", type: "text" },
    dedupe: "upsert-by-id",
    dedupeNote:
      "Rows are keyed by `id`. Re-uploading a row with the same `id` updates it in place — it never inserts a second copy.",
    columns: [
      text("id", "Stable slug the app links to, e.g. `embassy_appointment`. Letters, digits and `_` only."),
      text("title_de", "Scenario title in German."),
      text("title_ar", "Scenario title in Arabic."),
      text("ai_persona", "Who Katzu plays, e.g. `Beamter katze`. Existing personas follow `<Rolle> katze`."),
      text("category", "Must map to a vocabulary topic (see `scenarioVocab.ts`), e.g. `official`, `work`, `housing`."),
      text("icon", "Icon key the app renders in the scenario list."),
      text("initial_message_a1", "Katzu's opening line at A1.", "textarea"),
      text("initial_message_a2", "Katzu's opening line at A2.", "textarea"),
      text("initial_message_b1", "Katzu's opening line at B1.", "textarea"),
      text("initial_message_b2", "Katzu's opening line at B2.", "textarea"),
    ],
  },
  vocabulary: {
    label: "Vocabulary",
    table: "vocabulary",
    key: { column: "rowid", type: "integer" },
    dedupe: "natural-key-then-rowid",
    dedupeNote:
      "No unique column: a row carrying its exported `id` (rowid) updates that exact row; a row without one is treated as new and skipped if `german + level + topic` already exists.",
    columns: [
      text("german", "The headword or expression in German."),
      {
        name: "article",
        type: "enum",
        required: false,
        ui: "select",
        options: ["", "der", "die", "das"],
        note: "`der` / `die` / `das` for nouns; empty for anything else.",
      },
      optionalText("plural", "Plural form, or empty for a noun without one."),
      text("part_of_speech", "e.g. `Noun`, `Verb`, `Adjective`. Nouns must carry an article."),
      text("translation_ar", "Arabic meaning — the side the learner produces German from."),
      text("translation_en", "English gloss, used for the bilingual hint fallback."),
      text("example_de", "Example sentence in German.", "textarea"),
      text("example_ar", "That example in Arabic.", "textarea"),
      text("example_en", "That example in English.", "textarea"),
      level(),
      text("topic", "Vocabulary topic the Study/Quiz join reads, e.g. `documents`, `health`."),
    ],
  },
  grammar: {
    label: "Grammar",
    table: "grammar",
    key: { column: "id", type: "text" },
    dedupe: "upsert-by-id",
    dedupeNote: "Rows are keyed by `id`; re-uploading the same `id` updates the rule instead of duplicating it.",
    columns: [
      text("id", "Stable slug, e.g. `akkusativ_articles`."),
      text("title_ar", "Rule title in Arabic."),
      text("rule_de", "The rule stated in German.", "textarea"),
      text("rule_ar", "The rule stated in Arabic.", "textarea"),
      level(),
      text("explanation_ar", "Longer Arabic explanation shown with the correction.", "textarea"),
      text("example_de", "Correct German example.", "textarea"),
      text("example_ar", "That example in Arabic.", "textarea"),
    ],
  },
  starter_phrases: {
    label: "Starter Phrases",
    table: "starter_phrases",
    key: { column: "rowid", type: "integer" },
    dedupe: "natural-key-then-rowid",
    dedupeNote:
      "No unique column: a row carrying its exported `id` (rowid) updates that exact row; a row without one is treated as new and skipped if `scenario_id + level + sort_order` already exists. `scenario_id` must exist in `scenarios`.",
    columns: [
      text("scenario_id", "Must match an existing `scenarios.id` — an unknown one makes the phrase invisible."),
      level(),
      text("german", "The phrase in German."),
      text("translation_en", "English translation (hint fallback)."),
      text("translation_ar", "Arabic translation."),
      integer("sort_order", "Position inside the scenario; the audit expects a contiguous run from 1."),
    ],
  },
};

export const CONTENT_TYPES = Object.keys(DB_SCHEMA);

/** The value a row must carry to address an existing row: `rowid` or the text `id`. */
export function isRowIdTable(type) {
  const meta = DB_SCHEMA[type];
  return Boolean(meta) && meta.key.column === "rowid";
}

/** Every writable column, in schema order — the allow-list for forms and updates. */
export function contentColumns(type) {
  const meta = DB_SCHEMA[type];
  return meta ? meta.columns.map((c) => c.name) : [];
}

/** Columns a bulk "edit selected" may set: never the identity column. */
export function editableColumns(type) {
  return contentColumns(type).filter((name) => name !== DB_SCHEMA[type].key.column);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

/**
 * Validate one row against `DB_SCHEMA[type]` and normalise it for binding.
 *
 * Returns errors instead of throwing so a single bad row among hundreds can be
 * reported and skipped rather than failing the whole upload. Unknown keys are an
 * error, not silently dropped: a misspelled column would otherwise look like a
 * successful write that changed nothing.
 *
 * @returns {{ ok: boolean, errors: string[], row: Record<string, unknown> | null }}
 */
export function validateContentRow(type, raw, context = {}) {
  const meta = DB_SCHEMA[type];
  const errors = [];
  if (!meta) return { ok: false, errors: [`unknown content type "${type}"`], row: null };

  const where = context.index === undefined ? "" : `row ${context.index + 1}: `;
  if (!isPlainObject(raw)) return { ok: false, errors: [`${where}row must be an object`], row: null };

  const allowed = new Set(contentColumns(type));
  const keyColumn = meta.key.column;
  const row = {};

  // The rowid is an address, never a column: it is read out and bound separately.
  let address = null;
  if (keyColumn === "rowid") {
    if (!isBlank(raw.id)) {
      const asNumber = Number(raw.id);
      if (!Number.isInteger(asNumber) || asNumber <= 0) errors.push(`${where}id must be a positive rowid`);
      else address = asNumber;
    } else if (!isBlank(raw.rowid)) {
      const asNumber = Number(raw.rowid);
      if (!Number.isInteger(asNumber) || asNumber <= 0) errors.push(`${where}rowid must be a positive integer`);
      else address = asNumber;
    }
  }

  for (const column of meta.columns) {
    if (column.name === keyColumn) continue; // handled as the row's identity above
    if (!(column.name in raw)) {
      errors.push(`${where}missing column "${column.name}"`);
      continue;
    }
    const value = raw[column.name];
    if (column.required && isBlank(value)) {
      errors.push(`${where}"${column.name}" is required`);
      continue;
    }
    if (column.type === "level" && !LEVEL_SET.has(String(value).trim())) {
      // The received value is in the message because these errors are read as a
      // list next to a spreadsheet, where the row number alone is not enough.
      errors.push(`${where}"level" must be one of ${CONTENT_LEVELS.join(", ")} (got "${String(value).trim()}")`);
      continue;
    }
    if (column.type === "integer") {
      const asNumber = typeof value === "number" ? value : Number(String(value).trim());
      if (!Number.isInteger(asNumber)) {
        errors.push(`${where}"${column.name}" must be a whole number`);
        continue;
      }
      row[column.name] = asNumber;
      continue;
    }
    if (column.type === "enum") {
      // D1 stores this column as NULL for a non-noun as often as it stores an
      // empty string, so both normalise to the empty option.
      const asString = value === null || value === undefined ? "" : String(value).trim();
      if (!column.options.includes(asString)) {
        errors.push(`${where}"${column.name}" must be one of ${column.options.map((o) => o || "(empty)").join(", ")}`);
        continue;
      }
      row[column.name] = asString;
      continue;
    }
    row[column.name] = typeof value === "string" ? value.trim() : value;
  }

  for (const column of Object.keys(raw)) {
    if (column === keyColumn) continue;
    if (column === "rowid" || column === "id") continue; // export echoes; address handled above
    if (!allowed.has(column)) errors.push(`${where}unknown column "${column}"`);
  }

  // Text `id` tables need their key present and usable as the conflict target.
  if (keyColumn !== "rowid") {
    const id = raw[keyColumn];
    if (isBlank(id)) errors.push(`${where}"${keyColumn}" is required`);
    else row[keyColumn] = String(id).trim();
  }

  if (errors.length > 0) return { ok: false, errors, row: null };
  return { ok: true, errors: [], row, address };
}

/** The natural key that decides whether an id-less row is a duplicate. */
export function naturalKey(type, row) {
  if (type === "vocabulary") return [row.german, row.level, row.topic].map((v) => String(v ?? "").trim().toLowerCase());
  if (type === "starter_phrases") return [row.scenario_id, row.level, String(row.sort_order ?? "")].map((v) => String(v).trim().toLowerCase());
  return null;
}

/**
 * Ordering shared by the list page and the full export, so "the export looks like
 * the table" is true rather than hoped for. Direction is fixed; `contentList`
 * appends an explicit LIMIT/OFFSET.
 */
export function contentOrderBy(type) {
  switch (type) {
    case "scenarios":
      return "category ASC, id ASC";
    case "vocabulary":
      return "level ASC, topic ASC, rowid ASC";
    case "starter_phrases":
      return "scenario_id ASC, sort_order ASC, rowid ASC";
    case "grammar":
      return "level ASC, id ASC";
    default:
      return "rowid ASC";
  }
}
