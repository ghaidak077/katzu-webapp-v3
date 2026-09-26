import { describe, expect, it, beforeEach } from 'vitest';
import { handleAdminRoutes } from '../cloudflare-admin';
import { CONTENT_TYPES, DB_SCHEMA, contentColumns, validateContentRow } from '../cloudflare-content-schema';
import { CONTENT_COLUMNS, CONTENT_LEVELS, LOADABLE_TYPES } from '../src/lib/content/curriculumAudit';
import { FakeD1, type Row } from './helpers/fakeD1';

/**
 * The Content Studio: schema, export, validated bulk upload (including sync mode)
 * and single-row CRUD for all four curriculum tables.
 *
 * Why these tests exist: the surface writes to the curriculum every learner reads
 * through Study/Quiz, and the destructive path (sync mode) can delete rows. Each
 * behaviour below is one an admin depends on and that a plausible refactor could
 * quietly break — especially "a re-uploaded export edits rows instead of copying
 * them", which is the bug this whole change was written to remove.
 */

const SECRET = 'test-admin-secret';

function scenario(overrides: Row = {}): Row {
  return {
    id: 'cafe_order',
    title_de: 'Im Café bestellen',
    title_ar: 'الطلب في المقهى',
    ai_persona: 'Barista katze',
    category: 'daily_life',
    icon: 'coffee',
    initial_message_a1: 'Hallo! Was möchtest du?',
    initial_message_a2: 'Hallo! Was darf es sein?',
    initial_message_b1: 'Guten Tag, was hätten Sie gern?',
    initial_message_b2: 'Guten Tag, darf ich Ihnen etwas bringen?',
    ...overrides,
  };
}

function vocab(overrides: Row = {}): Row {
  return {
    german: 'einreichen',
    article: '',
    plural: '',
    part_of_speech: 'Verb',
    translation_ar: 'يقدّم',
    translation_en: 'to submit',
    example_de: 'Ich reiche den Antrag ein.',
    example_ar: 'أقدّم الطلب.',
    example_en: 'I submit the application.',
    level: 'B1',
    topic: 'documents',
    ...overrides,
  };
}

function phrase(overrides: Row = {}): Row {
  return {
    scenario_id: 'cafe_order',
    level: 'A1',
    german: 'Ich möchte einen Kaffee, bitte.',
    translation_en: 'I would like a coffee, please.',
    translation_ar: 'أريد قهوة من فضلك.',
    sort_order: 1,
    ...overrides,
  };
}

function grammar(overrides: Row = {}): Row {
  return {
    id: 'akkusativ_articles',
    title_ar: 'أدوات النصب',
    rule_de: 'Nach „für“ steht der Akkusativ.',
    rule_ar: 'بعد „für“ يأتي النصب.',
    level: 'A1',
    explanation_ar: 'يتغير شكل الأداة في حالة النصب.',
    example_de: 'Das ist für den Chef.',
    example_ar: 'هذا من أجل المدير.',
    ...overrides,
  };
}

function makeEnv(): { DB: FakeD1; ADMIN_SECRET: string } {
  const db = new FakeD1();
  db.seed('scenarios', [scenario(), scenario({ id: 'doctor_visit', category: 'health' })]);
  db.seed('grammar', [grammar()]);
  db.seed('vocabulary', [
    vocab(),
    vocab({ german: 'vorlegen', article: '', translation_ar: 'يُبرز', level: 'B2', topic: 'documents' }),
    vocab({ german: 'Termin', article: 'der', part_of_speech: 'Noun', translation_ar: 'موعد', level: 'A1', topic: 'health' }),
  ]);
  db.seed('starter_phrases', [phrase(), phrase({ level: 'A2', german: 'Einen Kaffee, bitte.', sort_order: 2 })]);
  return { DB: db, ADMIN_SECRET: SECRET };
}

function adminRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`https://katzu.test${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}`, ...(init.headers || {}) },
  });
}

async function call(env: { DB: FakeD1; ADMIN_SECRET: string }, path: string, init?: RequestInit) {
  const url = new URL(`https://katzu.test${path}`);
  const res = await handleAdminRoutes(url, adminRequest(path, init), env as never, {});
  if (!res) throw new Error(`route not handled: ${path}`);
  return { status: res.status, body: await res.json() };
}

const post = (env: { DB: FakeD1; ADMIN_SECRET: string }, path: string, payload: unknown) =>
  call(env, path, { method: 'POST', body: JSON.stringify(payload) });

describe('content studio — the schema is the single contract', () => {
  it('serves DB_SCHEMA with live counts and the valid types/levels', async () => {
    const env = makeEnv();
    const res = await call(env, '/admin/schema');
    expect(res.status).toBe(200);
    expect(res.body.valid_content_types).toEqual(['scenarios', 'vocabulary', 'grammar', 'starter_phrases']);
    expect(res.body.valid_levels).toEqual(['A1', 'A2', 'B1', 'B2']);
    expect(res.body.current_row_counts).toEqual({ scenarios: 2, vocabulary: 3, grammar: 1, starter_phrases: 2 });
    expect(Object.keys(res.body.schema)).toEqual(['scenarios', 'vocabulary', 'grammar', 'starter_phrases']);
    expect(res.body.upload_endpoint).toBe('/admin/upload');
  });

  it('matches the app-side curriculum audit column for column', async () => {
    // One contract, two readers: the Worker validates uploads against DB_SCHEMA and
    // the CLI loader/audit uses CONTENT_COLUMNS. Drift between them would mean a
    // row the admin accepts and the loader cannot write (or vice versa).
    // Same set, not necessarily the same order: the studio tab order is a UI
    // choice, the contract is which tables exist.
    expect([...CONTENT_TYPES].sort()).toEqual([...LOADABLE_TYPES].sort());
    for (const type of CONTENT_TYPES) {
      expect(contentColumns(type as keyof typeof DB_SCHEMA)).toEqual([...CONTENT_COLUMNS[type as keyof typeof CONTENT_COLUMNS]]);
    }
    expect(DB_SCHEMA.scenarios.columns.length).toBeGreaterThan(0);
    expect(CONTENT_LEVELS).toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('treats a NULL article the same as an empty one', () => {
    const result = validateContentRow('vocabulary', vocab({ article: null }));
    expect(result.ok).toBe(true);
    expect(result.row?.article).toBe('');
  });

  it('refuses every studio route without the admin bearer secret', async () => {
    const env = makeEnv();
    for (const path of ['/admin/schema', '/admin/export-all']) {
      const url = new URL(`https://katzu.test${path}`);
      const res = await handleAdminRoutes(url, new Request(url.toString()), env as never, {});
      expect(res?.status, path).toBe(401);
    }
    const upload = await handleAdminRoutes(
      new URL('https://katzu.test/admin/upload'),
      new Request('https://katzu.test/admin/upload', { method: 'POST', body: '{}' }),
      env as never,
      {},
    );
    expect(upload?.status).toBe(401);
  });
});

describe('content studio — list', () => {
  let env: { DB: FakeD1; ADMIN_SECRET: string };
  beforeEach(() => {
    env = makeEnv();
  });

  it('paginates and reports the total, not just the page', async () => {
    const res = await call(env, '/admin/api/content-list?type=vocabulary&limit=2&offset=0');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.total).toBe(3);
    // Default order is level → topic → rowid, so the A1 row comes first.
    expect(res.body.rows[0].id).toBe(3);

    const second = await call(env, '/admin/api/content-list?type=vocabulary&limit=2&offset=2');
    expect(second.body.count).toBe(1);
    expect(second.body.total).toBe(3);
  });

  it('filters by level, by topic and by free text', async () => {
    const level = await call(env, '/admin/api/content-list?type=vocabulary&level=B2');
    expect(level.body.rows.map((row: Row) => row.german)).toEqual(['vorlegen']);

    const topic = await call(env, '/admin/api/content-list?type=vocabulary&topic=health');
    expect(topic.body.total).toBe(1);

    // The Arabic gloss is what a learner sees, so search has to cover it.
    const arabic = await call(env, '/admin/api/content-list?type=vocabulary&q=' + encodeURIComponent('موعد'));
    expect(arabic.body.rows.map((row: Row) => row.german)).toEqual(['Termin']);

    const scenarios = await call(env, '/admin/api/content-list?type=scenarios&category=health');
    expect(scenarios.body.rows.map((row: Row) => row.id)).toEqual(['doctor_visit']);
  });

  it('rejects an unknown type with the full allow-list', async () => {
    const res = await call(env, '/admin/api/content-list?type=users');
    expect(res.status).toBe(400);
    expect(res.body.allowed).toEqual(['scenarios', 'vocabulary', 'grammar', 'starter_phrases']);
  });

  it('ignores an unknown sort column instead of interpolating it', async () => {
    const res = await call(env, '/admin/api/content-list?type=vocabulary&sort=' + encodeURIComponent('id; DROP TABLE vocabulary'));
    expect(res.status).toBe(200);
    expect(env.DB.log.some((sql) => /DROP/i.test(sql))).toBe(false);
    expect(env.DB.snapshot('vocabulary')).toHaveLength(3);
  });

  it('sorts on a real column when asked', async () => {
    const res = await call(env, '/admin/api/content-list?type=vocabulary&sort=german&dir=desc');
    // Plain string order — 'vorlegen' > 'einreichen' > 'Termin' by code point.
    expect(res.body.rows.map((row: Row) => row.german)).toEqual(['vorlegen', 'einreichen', 'Termin']);
  });
});

describe('content studio — create', () => {
  let env: { DB: FakeD1; ADMIN_SECRET: string };
  beforeEach(() => {
    env = makeEnv();
  });

  it('creates a vocabulary row through the shared validator', async () => {
    const res = await post(env, '/admin/api/content-create', {
      type: 'vocabulary',
      row: vocab({ german: 'Antrag', article: 'der', part_of_speech: 'Noun', translation_ar: 'طلب' }),
    });
    expect(res.status).toBe(201);
    expect(env.DB.snapshot('vocabulary')).toHaveLength(4);
  });

  it('refuses an equivalent row, because vocabulary has no unique key', async () => {
    const res = await post(env, '/admin/api/content-create', { type: 'vocabulary', row: vocab() });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('duplicate_row');
    expect(env.DB.snapshot('vocabulary')).toHaveLength(3);
  });

  it('creates a scenario by id and refuses to quietly overwrite an existing one', async () => {
    const created = await post(env, '/admin/api/content-create', { type: 'scenarios', row: scenario({ id: 'renting', category: 'housing' }) });
    expect(created.status).toBe(201);

    const clash = await post(env, '/admin/api/content-create', { type: 'scenarios', row: scenario() });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toBe('duplicate_id');
    expect(env.DB.snapshot('scenarios')).toHaveLength(3);
  });

  it('rejects an invalid level and an unknown column before writing', async () => {
    const level = await post(env, '/admin/api/content-create', { type: 'vocabulary', row: vocab({ level: 'C1' }) });
    expect(level.status).toBe(400);
    expect(level.body.errors.join(' ')).toContain('level');

    const column = await post(env, '/admin/api/content-create', { type: 'vocabulary', row: { ...vocab(), bogus: 'x' } });
    expect(column.status).toBe(400);
    expect(column.body.errors.join(' ')).toContain('bogus');
    expect(env.DB.snapshot('vocabulary')).toHaveLength(3);
  });
});

describe('content studio — update and delete', () => {
  let env: { DB: FakeD1; ADMIN_SECRET: string };
  beforeEach(() => {
    env = makeEnv();
  });

  it('edits rows in every table, and only through schema columns', async () => {
    const vocabEdit = await post(env, '/admin/api/content-update', {
      type: 'vocabulary',
      updates: [{ id: 1, fields: { translation_ar: 'يقدّم طلباً' } }],
    });
    expect(vocabEdit.status).toBe(200);
    expect(vocabEdit.body.rows[0].translation_ar).toBe('يقدّم طلباً');

    const grammarEdit = await post(env, '/admin/api/content-update', {
      type: 'grammar',
      updates: [{ id: 'akkusativ_articles', fields: { level: 'A2' } }],
    });
    expect(grammarEdit.status).toBe(200);
    expect(grammarEdit.body.rows[0].level).toBe('A2');

    const scenarioEdit = await post(env, '/admin/api/content-update', {
      type: 'scenarios',
      updates: [{ id: 'doctor_visit', fields: { title_ar: 'زيارة الطبيب' } }],
    });
    expect(scenarioEdit.status).toBe(200);

    const bad = await post(env, '/admin/api/content-update', {
      type: 'scenarios',
      updates: [{ id: 'doctor_visit', fields: { id: 'hijack' } }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('invalid_columns');
  });

  it('rejects a starter phrase pointing at a scenario that does not exist', async () => {
    const res = await post(env, '/admin/api/content-update', {
      type: 'starter_phrases',
      updates: [{ id: 1, fields: { scenario_id: 'nope' } }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unknown_scenario');
  });

  it('deletes by rowid and reports the ids that were not there', async () => {
    const res = await post(env, '/admin/api/content-delete', { type: 'vocabulary', ids: [1, 999] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);
    expect(res.body.notFound).toEqual([999]);
    expect(env.DB.snapshot('vocabulary').map((row) => row.id)).toEqual([2, 3]);
  });

  it('deletes by text id on the tables keyed by one', async () => {
    const res = await post(env, '/admin/api/content-delete', { type: 'grammar', ids: ['akkusativ_articles'] });
    expect(res.body.deleted).toBe(1);
    expect(env.DB.snapshot('grammar')).toHaveLength(0);
  });
});

describe('content studio — bulk upload', () => {
  let env: { DB: FakeD1; ADMIN_SECRET: string };
  beforeEach(() => {
    env = makeEnv();
  });

  it('keeps the loader-compatible response shape', async () => {
    const res = await post(env, '/admin/upload', {
      contentType: 'vocabulary',
      rows: [vocab({ german: 'Mietvertrag', article: 'der', part_of_speech: 'Noun', translation_ar: 'عقد الإيجار' })],
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // scripts/load-curriculum.mjs reads `count` as "rows written".
    expect(res.body.count).toBe(1);
    expect(res.body).toMatchObject({ inserted: 1, updated: 0, deleted: 0, skippedInvalid: 0 });
  });

  it('edits a row that carries its exported id instead of inserting a copy', async () => {
    const exported = (await call(env, '/admin/export-all')).body.data.vocabulary as Row[];
    const edited = exported.map((row) => (row.id === 1 ? { ...row, translation_ar: 'يقدّم طلباً' } : row));

    const res = await post(env, '/admin/upload', { contentType: 'vocabulary', rows: edited });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(3);
    expect(res.body.inserted).toBe(0);
    expect(env.DB.snapshot('vocabulary')).toHaveLength(3);
    expect(env.DB.snapshot('vocabulary')[0].translation_ar).toBe('يقدّم طلباً');
  });

  it('skips an id-less duplicate by natural key', async () => {
    const first = await post(env, '/admin/upload', {
      contentType: 'vocabulary',
      rows: [vocab({ german: 'Antrag', article: 'der', part_of_speech: 'Noun', translation_ar: 'طلب' })],
    });
    expect(first.body.inserted).toBe(1);

    const again = await post(env, '/admin/upload', {
      contentType: 'vocabulary',
      rows: [vocab({ german: 'Antrag', article: 'der', part_of_speech: 'Noun', translation_ar: 'طلب' })],
    });
    expect(again.body.inserted).toBe(0);
    expect(again.body.skippedDuplicates).toBe(1);
    expect(env.DB.snapshot('vocabulary')).toHaveLength(4);
  });

  it('reports per-row problems without discarding the rest of the batch', async () => {
    const res = await post(env, '/admin/upload', {
      contentType: 'vocabulary',
      rows: [
        vocab({ german: 'Antrag', article: 'der', part_of_speech: 'Noun', translation_ar: 'طلب' }),
        vocab({ german: 'kaputt', level: 'C1' }),
        { ...vocab({ german: 'typo' }), bogus: 'nope' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
    expect(res.body.skippedInvalid).toBe(2);
    expect(res.body.totalSubmitted).toBe(3);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(2);
    expect(res.body.errors.join(' ')).toContain('C1');
  });

  it('skips a starter phrase whose scenario_id is unknown', async () => {
    const res = await post(env, '/admin/upload', {
      contentType: 'starter_phrases',
      rows: [phrase({ scenario_id: 'ghost_scenario', german: 'Hallo', sort_order: 9 })],
    });
    expect(res.body.inserted).toBe(0);
    expect(res.body.skippedInvalid).toBe(1);
    expect(res.body.errors.join(' ')).toContain('ghost_scenario');
  });

  it('upserts scenarios and grammar by id', async () => {
    const res = await post(env, '/admin/upload', {
      contentType: 'scenarios',
      rows: [scenario({ title_de: 'Im Café bestellen (neu)' }), scenario({ id: 'renting', category: 'housing' })],
    });
    expect(res.body.updated).toBe(1);
    expect(res.body.inserted).toBe(1);
    expect(env.DB.snapshot('scenarios')).toHaveLength(3);
  });

  it('refuses an upload with no rows', async () => {
    const res = await post(env, '/admin/upload', { contentType: 'vocabulary', rows: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_body');
  });
});

describe('content studio — sync mode never deletes without a second call', () => {
  let env: { DB: FakeD1; ADMIN_SECRET: string };
  beforeEach(() => {
    env = makeEnv();
  });

  it('answers with the count and a sample, and writes nothing', async () => {
    const exported = (await call(env, '/admin/export-all')).body.data.vocabulary as Row[];
    const onlyFirst = [exported[0]];

    const res = await post(env, '/admin/upload', { contentType: 'vocabulary', rows: onlyFirst, sync: true });
    expect(res.status).toBe(200);
    expect(res.body.requiresSyncConfirmation).toBe(true);
    expect(res.body.wouldDelete).toBe(2);
    expect(res.body.sampleDeleteIds).toEqual([1, 2]);
    expect(env.DB.snapshot('vocabulary')).toHaveLength(3);

    const confirmed = await post(env, '/admin/upload', {
      contentType: 'vocabulary',
      rows: onlyFirst,
      sync: true,
      syncConfirmed: true,
    });
    expect(confirmed.body.deleted).toBe(2);
    expect(env.DB.snapshot('vocabulary')).toHaveLength(1);
  });

  it('refuses sync mode when the rows carry no ids to match against', async () => {
    const res = await post(env, '/admin/upload', {
      contentType: 'vocabulary',
      rows: [vocab({ german: 'Antrag', article: 'der', part_of_speech: 'Noun', translation_ar: 'طلب' })],
      sync: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('sync_requires_ids');
    expect(env.DB.snapshot('vocabulary')).toHaveLength(3);
  });

  it('deletes by id on the tables keyed by one', async () => {
    const res = await post(env, '/admin/upload', {
      contentType: 'grammar',
      rows: [grammar()],
      sync: true,
      syncConfirmed: true,
    });
    expect(res.body.deleted).toBe(0);
    expect(env.DB.snapshot('grammar')).toHaveLength(1);
  });
});

describe('content studio — export and telemetry', () => {
  let env: { DB: FakeD1; ADMIN_SECRET: string };
  beforeEach(() => {
    env = makeEnv();
  });

  it('exports every table, ordered, with counts and the schema', async () => {
    const res = await call(env, '/admin/export-all');
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ scenarios: 2, vocabulary: 3, grammar: 1, starter_phrases: 2 });
    expect(Object.keys(res.body.data)).toEqual(['scenarios', 'vocabulary', 'grammar', 'starter_phrases']);
    expect(res.body.schema).toBeDefined();
    // vocabulary is exported level/topic ordered, so an edit lands next to its peers.
    expect(res.body.data.vocabulary.map((row: Row) => row.level)).toEqual(['A1', 'B1', 'B2']);
    // The rowid travels with the row so a re-upload can address it.
    expect(res.body.data.vocabulary[0].id).toBe(3);
  });

  it('records every content mutation in the activity feed', async () => {
    await post(env, '/admin/api/content-create', {
      type: 'vocabulary',
      row: vocab({ german: 'Antrag', article: 'der', part_of_speech: 'Noun', translation_ar: 'طلب' }),
    });
    await post(env, '/admin/api/content-update', { type: 'vocabulary', updates: [{ id: 1, fields: { level: 'A1' } }] });
    await post(env, '/admin/api/content-delete', { type: 'vocabulary', ids: [2] });
    await post(env, '/admin/upload', { contentType: 'vocabulary', rows: [vocab({ german: 'Mietvertrag', article: 'der', part_of_speech: 'Noun', translation_ar: 'عقد الإيجار' })] });

    const events = env.DB.snapshot('activity_log').map((row) => row.event_type);
    expect(events).toContain('content_create');
    expect(events).toContain('content_update');
    expect(events).toContain('content_delete');
    expect(events).toContain('content_bulk_upload');
  });
});
