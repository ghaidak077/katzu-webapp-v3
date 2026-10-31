import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FakeD1 } from './helpers/fakeD1';
import {
  INTERNAL_TOKEN_KV_KEY,
  handleInternalAdminRoutes,
  resetInternalRateLimit,
} from '../cloudflare-admin-api';
import { ensureContentAdminTables } from '../cloudflare-content-admin';
import { contentColumns } from '../cloudflare-content-schema';

/**
 * The content surface of the new panel. Every route goes through the real
 * internal door (token, rate limit, dispatch) over a real in-memory database, so
 * these tests prove the promises a content editor makes:
 *
 *   - nothing is published until someone says publish;
 *   - a delete is recoverable and a restore is exact;
 *   - an undo puts back the row that was there, not an approximation;
 *   - a dry run changes nothing, including the backup table;
 *   - every mutation leaves an audit row;
 *   - bad input is refused before it reaches a learner table.
 */

const TOKEN = 'ika_' + 'a'.repeat(64);

const scenario = (overrides: Record<string, unknown> = {}) => ({
  id: 'embassy_appointment',
  title_de: 'Termin bei der Botschaft',
  title_ar: 'موعد في السفارة',
  ai_persona: 'Beamter katze',
  category: 'official',
  icon: 'building',
  initial_message_a1: 'Guten Tag. Wie kann ich Ihnen helfen?',
  initial_message_a2: 'Guten Tag. Was ist der Grund Ihres Besuchs heute?',
  initial_message_b1: 'Guten Tag, bitte nehmen Sie Platz.',
  initial_message_b2: 'Guten Tag, schildern Sie mir bitte Ihr Anliegen.',
  ...overrides,
});

const vocabulary = (overrides: Record<string, unknown> = {}) => ({
  german: 'der Termin',
  article: 'der',
  plural: 'die Termine',
  part_of_speech: 'Noun',
  translation_ar: 'الموعد',
  translation_en: 'the appointment',
  example_de: 'Ich habe morgen einen Termin.',
  example_ar: 'لدي موعد غداً.',
  example_en: 'I have an appointment tomorrow.',
  level: 'A1',
  topic: 'appointments',
  ...overrides,
});

const grammar = (overrides: Record<string, unknown> = {}) => ({
  id: 'akkusativ_articles',
  title_ar: 'أدوات النصب',
  rule_de: 'Der Akkusativ steht nach bestimmten Verben.',
  rule_ar: 'حالة النصب تأتي بعد أفعال معينة.',
  level: 'A1',
  explanation_ar: 'نستخدم حالة النصب للمفعول به المباشر.',
  example_de: 'Ich sehe den Mann.',
  example_ar: 'أرى الرجل.',
  ...overrides,
});

const starter = (overrides: Record<string, unknown> = {}) => ({
  scenario_id: 'embassy_appointment',
  level: 'A1',
  german: 'Ich habe einen Termin.',
  translation_en: 'I have an appointment.',
  translation_ar: 'لدي موعد.',
  sort_order: 1,
  ...overrides,
});

function request(path: string, options: { method?: string; body?: unknown; token?: string | null; actor?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.token === null) headers.authorization = 'Bearer wrong-token-that-is-long-enough';
  else headers.authorization = `Bearer ${options.token || TOKEN}`;
  if (options.actor) headers['x-admin-actor'] = options.actor;
  const method = options.method || 'GET';
  return new Request(`https://katzu.test${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(options.body === undefined ? {} : options.body),
  });
}

function envFor(db: FakeD1) {
  return {
    DB: db,
    USER_PROGRESS: {
      get: async (key: string) => (key === INTERNAL_TOKEN_KV_KEY ? TOKEN : null),
      put: async () => undefined,
    },
  };
}

async function call(
  db: FakeD1,
  path: string,
  options: { method?: string; body?: unknown; token?: string | null; actor?: string } = {},
) {
  resetInternalRateLimit();
  const url = new URL(`https://katzu.test${path}`);
  const response = await handleInternalAdminRoutes(
    url,
    request(path, options),
    envFor(db),
    null,
    { waitUntil: () => {} },
    {},
  );
  if (!response) throw new Error('route_not_handled');
  return response;
}

async function json(db: FakeD1, path: string, options: { method?: string; body?: unknown; actor?: string } = {}) {
  const response = await call(db, path, options);
  const body = await response.json();
  return { status: response.status, body };
}

/**
 * A real D1 row carries every column, with NULL for the ones never filled in.
 * The fixtures are partial, so padding them here keeps "the row came back
 * exactly as it was" a meaningful assertion instead of a fixture artefact.
 */
function pad(type: string, rows: Array<Record<string, unknown>>) {
  return rows.map((row) =>
    Object.fromEntries(contentColumns(type).map((column) => [column, row[column] ?? null])),
  );
}

async function seeded() {
  const db = new FakeD1();
  db.seed('scenarios', pad('scenarios', [scenario()]));
  db.seed('vocabulary', pad('vocabulary', [vocabulary()]));
  db.seed('grammar', pad('grammar', [grammar()]));
  db.seed('starter_phrases', pad('starter_phrases', [starter()]));
  await ensureContentAdminTables({ DB: db });
  return db;
}

beforeEach(() => resetInternalRateLimit());

describe('content routes are internal only', () => {
  const routes: Array<[string, string]> = [
    ['GET', '/internal/admin/content/meta'],
    ['GET', '/internal/admin/content/vocabulary'],
    ['POST', '/internal/admin/content/vocabulary/draft'],
    ['POST', '/internal/admin/content/vocabulary/publish'],
    ['POST', '/internal/admin/content/vocabulary/publish-all'],
    ['POST', '/internal/admin/content/vocabulary/discard'],
    ['POST', '/internal/admin/content/vocabulary/duplicate'],
    ['POST', '/internal/admin/content/vocabulary/delete'],
    ['POST', '/internal/admin/content/vocabulary/restore'],
    ['POST', '/internal/admin/content/vocabulary/undo'],
    ['GET', '/internal/admin/content/vocabulary/history'],
    ['GET', '/internal/admin/content/vocabulary/export'],
    ['POST', '/internal/admin/content/import'],
    ['GET', '/internal/admin/content/backup'],
    ['POST', '/internal/admin/content/backup'],
    ['GET', '/internal/admin/content/audit'],
    ['GET', '/internal/admin/content/reviews'],
    ['POST', '/internal/admin/content/reviews'],
    ['GET', '/internal/admin/content/reviews/export'],
  ];

  it.each(routes)('refuses %s %s without the internal token', async (method, path) => {
    const db = await seeded();
    const response = await call(db, path, { method, token: null });
    expect(response.status).toBe(401);
  });

  it('answers 401 before 404 for an unknown content path', async () => {
    const db = await seeded();
    const response = await call(db, '/internal/admin/content/not-a-type', { token: null });
    expect(response.status).toBe(401);
  });
});

describe('list, search and filters', () => {
  it('lists a table with its meta and only the matching rows', async () => {
    const db = await seeded();
    db.seed('vocabulary', [
      vocabulary(),
      vocabulary({ german: 'die Rechnung', translation_ar: 'الفاتورة', level: 'A2', topic: 'money' }),
    ]);

    const all = await json(db, '/internal/admin/content/vocabulary');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);

    const filtered = await json(db, '/internal/admin/content/vocabulary?level=A2&q=Rechnung');
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.rows[0].row.german).toBe('die Rechnung');

    const meta = await json(db, '/internal/admin/content/meta');
    expect(meta.body.types.map((entry: { type: string }) => entry.type)).toEqual([
      'scenarios',
      'vocabulary',
      'grammar',
      'starter_phrases',
    ]);
    expect(meta.body.levels).toEqual(['A0', 'A1', 'A2', 'B1', 'B2']);
  });
});

describe('drafts are not learner content', () => {
  it('creates, edits and publishes a draft without touching the base table first', async () => {
    const db = await seeded();
    const before = db.snapshot('vocabulary');

    const drafted = await json(db, '/internal/admin/content/vocabulary/draft', {
      method: 'POST',
      body: { row: vocabulary({ german: 'die Anmeldung', translation_ar: 'التسجيل', topic: 'official' }), note: 'new word' },
      actor: 'owner@example.com',
    });
    expect(drafted.status).toBe(200);
    expect(drafted.body.draft.operation).toBe('create');
    expect(db.snapshot('vocabulary')).toHaveLength(before.length);

    const pending = await json(db, '/internal/admin/content/vocabulary?status=draft');
    expect(pending.body.total).toBe(1);
    expect(pending.body.rows[0].status).toBe('draft');

    const published = await json(db, '/internal/admin/content/vocabulary/publish', {
      method: 'POST',
      body: { key: drafted.body.draft.key },
      actor: 'owner@example.com',
    });
    expect(published.status).toBe(200);
    expect(db.snapshot('vocabulary')).toHaveLength(before.length + 1);

    const audit = await json(db, '/internal/admin/content/audit');
    const publishRow = audit.body.rows.find((row: { action: string }) => row.action === 'publish');
    expect(publishRow.actor).toBe('owner@example.com');
  });

  it('shows a field diff and never shows a half-edited row to the list until published', async () => {
    const db = await seeded();
    const key = 'rowid:1';

    const drafted = await json(db, '/internal/admin/content/vocabulary/draft', {
      method: 'POST',
      body: { key, row: vocabulary({ translation_ar: 'الموعد المحدد' }) },
    });
    expect(drafted.body.draft.diff).toEqual([
      { column: 'translation_ar', before: 'الموعد', after: 'الموعد المحدد' },
    ]);
    expect(db.snapshot('vocabulary')[0].translation_ar).toBe('الموعد');

    await json(db, '/internal/admin/content/vocabulary/publish', { method: 'POST', body: { key } });
    expect(db.snapshot('vocabulary')[0].translation_ar).toBe('الموعد المحدد');
  });

  it('discards a draft and leaves the published row alone', async () => {
    const db = await seeded();
    const key = 'rowid:1';
    await json(db, '/internal/admin/content/vocabulary/draft', {
      method: 'POST',
      body: { key, row: vocabulary({ translation_ar: 'خطأ' }) },
    });
    const discarded = await json(db, '/internal/admin/content/vocabulary/discard', {
      method: 'POST',
      body: { key },
    });
    expect(discarded.body.discarded).toBe(true);
    expect(db.snapshot('vocabulary')[0].translation_ar).toBe('الموعد');
  });
});

describe('undo restores the exact before-state', () => {
  it('undoes an edit to the previous values, field for field', async () => {
    const db = await seeded();
    const before = db.snapshot('vocabulary')[0];
    const key = 'rowid:1';

    await json(db, '/internal/admin/content/vocabulary/draft', {
      method: 'POST',
      body: { key, row: vocabulary({ translation_ar: 'تغيير', example_de: 'Ein neuer Satz.' }) },
    });
    const published = await json(db, '/internal/admin/content/vocabulary/publish', {
      method: 'POST',
      body: { key },
    });

    const undone = await json(db, '/internal/admin/content/vocabulary/undo', {
      method: 'POST',
      body: { audit_uid: published.body.audit_uid },
      actor: 'owner@example.com',
    });
    expect(undone.status).toBe(200);
    expect(db.snapshot('vocabulary')[0]).toEqual(before);

    const second = await json(db, '/internal/admin/content/vocabulary/undo', {
      method: 'POST',
      body: { audit_uid: published.body.audit_uid },
    });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('already_undone');
  });

  it('undoes a delete: the row comes back and leaves the trash', async () => {
    const db = await seeded();
    const before = db.snapshot('vocabulary')[0];

    const deleted = await json(db, '/internal/admin/content/vocabulary/delete', {
      method: 'POST',
      body: { key: 'rowid:1' },
    });
    expect(db.snapshot('vocabulary')).toHaveLength(0);

    const trash = await json(db, '/internal/admin/content/vocabulary?status=trash');
    expect(trash.body.rows[0].status).toBe('trash');

    const undone = await json(db, '/internal/admin/content/vocabulary/undo', {
      method: 'POST',
      body: { audit_uid: deleted.body.audit_uid },
    });
    expect(undone.status).toBe(200);
    expect(db.snapshot('vocabulary')[0]).toEqual(before);

    const after = await json(db, '/internal/admin/content/vocabulary?status=trash');
    expect(after.body.total).toBe(0);
  });
});

describe('restore is exact', () => {
  it('restores a deleted row with its original rowid and content', async () => {
    const db = await seeded();
    const before = db.snapshot('vocabulary')[0];
    const deleted = await json(db, '/internal/admin/content/vocabulary/delete', {
      method: 'POST',
      body: { key: 'rowid:1' },
    });
    const restored = await json(db, '/internal/admin/content/vocabulary/restore', {
      method: 'POST',
      body: { trash_uid: deleted.body.trash_uid },
    });
    expect(restored.status).toBe(200);
    expect(db.snapshot('vocabulary')[0]).toEqual(before);
  });

  it('restores a text-keyed row and refuses an unknown trash entry', async () => {
    const db = await seeded();
    const before = db.snapshot('scenarios')[0];
    const deleted = await json(db, '/internal/admin/content/scenarios/delete', {
      method: 'POST',
      body: { key: 'embassy_appointment' },
    });
    const restored = await json(db, '/internal/admin/content/scenarios/restore', {
      method: 'POST',
      body: { trash_uid: deleted.body.trash_uid },
    });
    expect(restored.status).toBe(200);
    expect(db.snapshot('scenarios')[0]).toEqual(before);

    const missing = await json(db, '/internal/admin/content/scenarios/restore', {
      method: 'POST',
      body: { trash_uid: 'nope' },
    });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('trash_not_found');
  });
});

describe('duplicate', () => {
  it('creates a draft copy with a fresh id and no published twin', async () => {
    const db = await seeded();
    const before = db.snapshot('scenarios');
    const copied = await json(db, '/internal/admin/content/scenarios/duplicate', {
      method: 'POST',
      body: { key: 'embassy_appointment' },
    });
    expect(copied.status).toBe(200);
    expect(copied.body.draft.operation).toBe('create');
    expect(copied.body.draft.payload.id).toBe('embassy_appointment_copy');
    expect(db.snapshot('scenarios')).toEqual(before);
  });

  it('refuses a duplicate id the operator picks', async () => {
    const db = await seeded();
    const response = await json(db, '/internal/admin/content/scenarios/duplicate', {
      method: 'POST',
      body: { key: 'embassy_appointment', id: 'embassy_appointment' },
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_content');
  });
});

describe('validation', () => {
  it('refuses HTML, a wrong level, a missing field and a natural-key duplicate', async () => {
    const db = await seeded();

    const html = await json(db, '/internal/admin/content/vocabulary/draft', {
      method: 'POST',
      body: { row: vocabulary({ translation_ar: '<script>alert(1)</script>' }) },
    });
    expect(html.status).toBe(400);
    expect(html.body.errors.join(' ')).toContain('must not contain HTML');

    const level = await json(db, '/internal/admin/content/vocabulary/draft', {
      method: 'POST',
      body: { row: vocabulary({ level: 'C9' }) },
    });
    expect(level.status).toBe(400);

    const missing = await json(db, '/internal/admin/content/vocabulary/draft', {
      method: 'POST',
      body: { row: { german: 'nur ein Wort' } },
    });
    expect(missing.status).toBe(400);
    expect(missing.body.errors.some((error: string) => error.includes('missing column'))).toBe(true);

    const duplicate = await json(db, '/internal/admin/content/vocabulary/draft', {
      method: 'POST',
      body: { row: vocabulary({ german: 'DER TERMIN' }) },
    });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.errors.join(' ')).toContain('already exists');
  });

  it('refuses a starter phrase whose scenario does not exist', async () => {
    const db = await seeded();
    const response = await json(db, '/internal/admin/content/starter_phrases/draft', {
      method: 'POST',
      body: { row: starter({ scenario_id: 'missing_scenario', sort_order: 9 }) },
    });
    expect(response.status).toBe(400);
    expect(response.body.errors.join(' ')).toContain('does not exist');
  });
});

describe('import and export', () => {
  it('dry run reports the plan and changes nothing at all', async () => {
    const db = await seeded();
    const rows = [vocabulary({ german: 'die Prüfung', translation_ar: 'الامتحان', topic: 'exam' })];
    const response = await json(db, '/internal/admin/content/import', {
      method: 'POST',
      body: { type: 'vocabulary', format: 'json', content: JSON.stringify(rows), apply: false },
    });
    expect(response.status).toBe(200);
    expect(response.body.applied).toBe(false);
    expect(response.body.valid).toBe(1);
    expect(response.body.creates).toBe(1);
    expect(db.snapshot('vocabulary')).toHaveLength(1);
    expect(db.snapshot('content_drafts')).toHaveLength(0);
    expect(db.snapshot('content_backups')).toHaveLength(0);
    expect(db.snapshot('content_audit')).toHaveLength(0);
  });

  it('applies an import as drafts only, then publishes them explicitly', async () => {
    const db = await seeded();
    const rows = [vocabulary({ german: 'die Prüfung', translation_ar: 'الامتحان', topic: 'exam' })];
    const applied = await json(db, '/internal/admin/content/import', {
      method: 'POST',
      body: { type: 'vocabulary', format: 'json', content: JSON.stringify(rows), apply: true },
    });
    expect(applied.status).toBe(200);
    expect(applied.body.drafts).toBe(1);
    expect(db.snapshot('vocabulary')).toHaveLength(1);
    expect(db.snapshot('content_drafts')).toHaveLength(1);

    const published = await json(db, '/internal/admin/content/vocabulary/publish-all', {
      method: 'POST',
      body: {},
    });
    expect(published.body.published).toBe(1);
    expect(db.snapshot('vocabulary')).toHaveLength(2);
  });

  it('refuses to apply when the dry run found an error', async () => {
    const db = await seeded();
    const rows = [{ german: 'kaputt' }];
    const response = await json(db, '/internal/admin/content/import', {
      method: 'POST',
      body: { type: 'vocabulary', format: 'json', content: JSON.stringify(rows), apply: true },
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('dry_run_failed');
    expect(db.snapshot('vocabulary')).toHaveLength(1);
  });

  it('exports CSV with the rowid so a re-import updates instead of duplicating', async () => {
    const db = await seeded();
    const response = await call(db, '/internal/admin/content/vocabulary/export?format=csv');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('katzu-vocabulary');
    const csv = await response.text();
    expect(csv.split('\r\n')[0].startsWith('id,')).toBe(true);
    expect(csv).toContain('der Termin');
  });
});

describe('backup before the first write', () => {
  it('takes one dated snapshot and records it in meta', async () => {
    const db = await seeded();
    const drafted = await json(db, '/internal/admin/content/vocabulary/draft', {
      method: 'POST',
      body: { row: vocabulary({ german: 'die Prüfung', translation_ar: 'الامتحان', topic: 'exam' }) },
    });
    expect(drafted.status).toBe(200);
    const rows = db.snapshot('content_backups');
    expect(rows).toHaveLength(4);
    const types = rows.map((row) => row.table_name).sort();
    expect(types).toEqual(['grammar', 'scenarios', 'starter_phrases', 'vocabulary']);
    expect(JSON.parse(String(rows[0].payload))).toHaveLength(1);

    const meta = await json(db, '/internal/admin/content/meta');
    expect(meta.body.last_backup.backup_id).toContain('content-');
  });

  it('serves the backup as a download without changing content', async () => {
    const db = await seeded();
    await json(db, '/internal/admin/content/backup', { method: 'POST', body: {} });
    const before = db.snapshot('vocabulary');
    const response = await call(db, '/internal/admin/content/backup?download=1');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('katzu-content-');
    const body = await response.json();
    expect(body.tables.vocabulary).toHaveLength(1);
    expect(db.snapshot('vocabulary')).toEqual(before);
  });
});

describe('bundled content stays read-only', () => {
  it('stores a proofreading note without touching any content table', async () => {
    const db = await seeded();
    const before = {
      vocabulary: db.snapshot('vocabulary'),
      scenarios: db.snapshot('scenarios'),
    };
    const saved = await json(db, '/internal/admin/content/reviews', {
      method: 'POST',
      body: {
        kind: 'opener',
        key: 'Guten Tag. Wie kann ich Ihnen helfen?',
        needs_review: true,
        note: 'A0: check the greeting',
        corrected_ar: 'نهارك سعيد. كيف أستطيع مساعدتك؟',
      },
      actor: 'owner@example.com',
    });
    expect(saved.status).toBe(200);
    expect(before.vocabulary).toEqual(db.snapshot('vocabulary'));
    expect(before.scenarios).toEqual(db.snapshot('scenarios'));

    const listed = await json(db, '/internal/admin/content/reviews?kind=opener');
    expect(listed.body.rows).toHaveLength(1);
    expect(listed.body.rows[0].needs_review).toBe(true);

    const exported = await call(db, '/internal/admin/content/reviews/export?kind=opener');
    expect(exported.status).toBe(200);
    expect(exported.headers.get('content-disposition')).toContain('katzu-opener-corrections.json');
    const file = await exported.json();
    expect(file.format).toBe('katzu-bundled-corrections-v1');
    expect(file.corrections['Guten Tag. Wie kann ich Ihnen helfen?']).toContain('أستطيع');
  });

  it('refuses HTML and non-Arabic corrections', async () => {
    const db = await seeded();
    const html = await json(db, '/internal/admin/content/reviews', {
      method: 'POST',
      body: { kind: 'gloss', key: 'tag', note: '<b>bad</b>' },
    });
    expect(html.status).toBe(400);

    const notArabic = await json(db, '/internal/admin/content/reviews', {
      method: 'POST',
      body: { kind: 'gloss', key: 'tag', corrected_ar: 'Tag' },
    });
    expect(notArabic.status).toBe(400);
  });

  it('the bundled snapshot matches the two generated source files', () => {
    const snapshot = JSON.parse(
      readFileSync('admin-worker/public/bundled-content.json', 'utf8'),
    );
    expect(snapshot.counts.openers).toBe(223);
    expect(snapshot.counts.glosses).toBe(892);
    expect(snapshot.openers).toHaveLength(223);
    expect(snapshot.glosses).toHaveLength(892);
    expect(snapshot.glosses.every((entry: { level: string }) => ['A0', 'A1', 'A2', 'B1', 'B2'].includes(entry.level))).toBe(true);
  });
});

describe('history and undo agree with each other', () => {
  it('lists the audit trail newest first and exposes an undo for a publish', async () => {
    const db = await seeded();
    const saved = await json(db, '/internal/admin/content/scenarios/draft', {
      method: 'POST',
      body: { key: 'embassy_appointment', row: scenario({ title_ar: 'موعد السفارة' }) },
    });
    expect(saved.status).toBe(200);
    await json(db, '/internal/admin/content/scenarios/publish', {
      method: 'POST',
      body: { key: saved.body.draft.key },
    });

    const history = await json(db, '/internal/admin/content/scenarios/history?key=embassy_appointment');
    expect(history.status).toBe(200);
    expect(history.body.rows[0].action).toBe('publish');
    expect(history.body.rows[0].undoable).toBe(true);
    expect(history.body.rows[0].before.title_ar).toBe('موعد في السفارة');
    expect(history.body.rows[0].after.title_ar).toBe('موعد السفارة');
  });

  it('undoing a restore sends the row back to trash, so trash and base never disagree', async () => {
    const db = await seeded();
    const deleted = await json(db, '/internal/admin/content/scenarios/delete', {
      method: 'POST',
      body: { key: 'embassy_appointment' },
    });
    expect(deleted.status).toBe(200);
    const restored = await json(db, '/internal/admin/content/scenarios/restore', {
      method: 'POST',
      body: { trash_uid: deleted.body.trash_uid },
    });
    expect(restored.status).toBe(200);

    const undone = await json(db, '/internal/admin/content/scenarios/undo', {
      method: 'POST',
      body: { audit_uid: restored.body.audit_uid },
    });
    expect(undone.status).toBe(200);
    expect(db.snapshot('scenarios')).toHaveLength(0);
    expect(db.snapshot('content_trash')).toHaveLength(1);
    expect(String(db.snapshot('content_trash')[0].row_key)).toBe('embassy_appointment');

    const trash = await json(db, '/internal/admin/content/scenarios?status=trash');
    expect(trash.body.rows).toHaveLength(1);
    expect(trash.body.rows[0].row.title_ar).toBe('موعد في السفارة');
  });
});

describe('saving a create draft twice keeps one draft', () => {
  it('binds the draft key the server returned instead of forking a new draft', async () => {
    const db = await seeded();
    const first = await json(db, '/internal/admin/content/vocabulary/draft', {
      method: 'POST',
      body: { row: vocabulary({ german: 'die Botschaft', translation_ar: 'السفارة' }) },
    });
    expect(first.status).toBe(200);
    expect(first.body.draft.key).toMatch(/^new:/);

    const second = await json(db, '/internal/admin/content/vocabulary/draft', {
      method: 'POST',
      body: { key: first.body.draft.key, row: vocabulary({ german: 'die Botschaft', translation_ar: 'سفارة' }) },
    });
    expect(second.status).toBe(200);
    expect(second.body.draft.uid).toBe(first.body.draft.uid);

    const drafts = await json(db, '/internal/admin/content/vocabulary?status=draft');
    expect(drafts.body.counts.drafts).toBe(1);
    expect(drafts.body.rows).toHaveLength(1);
    expect(drafts.body.rows[0].row.translation_ar).toBe('سفارة');
  });

  it('does the same for a text-keyed table', async () => {
    const db = await seeded();
    const row = grammar({ id: 'dativ_articles', title_ar: 'أدوات الجر' });
    const first = await json(db, '/internal/admin/content/grammar/draft', { method: 'POST', body: { row } });
    expect(first.status).toBe(200);
    const second = await json(db, '/internal/admin/content/grammar/draft', {
      method: 'POST',
      body: { key: first.body.draft.key, row: { ...row, explanation_ar: 'نستخدم حالة الجر.' } },
    });
    expect(second.status).toBe(200);
    const drafts = await json(db, '/internal/admin/content/grammar?status=draft');
    expect(drafts.body.counts.drafts).toBe(1);
    expect(drafts.body.rows[0].row.explanation_ar).toBe('نستخدم حالة الجر.');
  });
});

describe('CSV import', () => {
  it('round-trips the export format: dry run, apply, publish', async () => {
    const db = await seeded();
    const csv = [
      'german,article,plural,part_of_speech,translation_ar,translation_en,example_de,example_ar,example_en,level,topic',
      '"die Botschaft","die","die Botschaften","Noun","السفارة","the embassy","Die Botschaft ist offen.","السفارة مفتوحة.","The embassy is open.","A1","official"',
    ].join('\r\n');

    const dry = await json(db, '/internal/admin/content/import', {
      method: 'POST',
      body: { type: 'vocabulary', format: 'csv', content: csv, apply: false },
    });
    expect(dry.status).toBe(200);
    expect(dry.body.total).toBe(1);
    expect(dry.body.creates).toBe(1);
    expect(dry.body.invalid).toBe(0);
    expect(dry.body.applied).toBe(false);
    expect(db.snapshot('vocabulary')).toHaveLength(1);
    expect(db.snapshot('content_drafts')).toHaveLength(0);

    const apply = await json(db, '/internal/admin/content/import', {
      method: 'POST',
      body: { type: 'vocabulary', format: 'csv', content: csv, apply: true },
    });
    expect(apply.status).toBe(200);
    expect(apply.body.applied).toBe(true);
    expect(apply.body.drafts).toBe(1);
    // Applying only stores a draft: the learner table is still the original row.
    expect(db.snapshot('vocabulary')).toHaveLength(1);
    expect(db.snapshot('content_drafts')).toHaveLength(1);

    const published = await json(db, '/internal/admin/content/vocabulary/publish-all', {
      method: 'POST',
      body: {},
    });
    expect(published.body.published).toBe(1);
    expect(db.snapshot('vocabulary').some((row) => row.german === 'die Botschaft')).toBe(true);
  });
});
