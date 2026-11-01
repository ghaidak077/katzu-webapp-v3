import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OPENER_LEVELS,
  SCENARIO_COLUMNS,
  buildManifest,
  diffScenarios,
  manifestMismatches,
  payloadIssues,
  pickScenarioColumns,
  scenarioPayload,
  scenarioRows,
  scenarioTargets,
  scopeProblems,
  summarizeChanges,
  untouchedProblems,
} from '../scripts/load-content-updates.mjs';

/**
 * Why these tests exist: `scripts/load-content-updates.mjs` is the only sanctioned
 * way to change a scenario row that is already live in production. Every rule that
 * keeps that write safe is a pure function tested here, so a later refactor cannot
 * quietly turn "update 49 known rows" into "create whatever the catalogue says" or
 * "publish the drafts someone else left behind".
 *
 * The script itself only runs `main()` as an entry point; importing it here is part
 * of the assertion — a regression in that guard would start a load inside the suite.
 */

const cataloguePath = fileURLToPath(
  new URL('../docs/content/catalogue/scenarios-catalogue.json', import.meta.url),
);
const catalogue = JSON.parse(readFileSync(cataloguePath, 'utf8'));
const catalogueRows = scenarioRows(catalogue);

const liveRow = (overrides = {}) => ({
  id: 'first_greetings',
  title_de: 'Erste Worte',
  title_ar: 'أول الكلمات',
  ai_persona: 'Nachbarin katze',
  category: 'daily_life',
  icon: 'users',
  initial_message_a0: '',
  initial_message_a1: 'Hallo!',
  initial_message_a2: 'Hallo, ich wohne neu hier.',
  initial_message_b1: 'Hallo, ich bin neu.',
  initial_message_b2: 'Hallo, ich bin neu hier.',
  sequence_order: 1,
  banner_url: '',
  ...overrides,
});

const authoredRow = (overrides = {}) => ({
  id: 'first_greetings',
  title_de: 'Erste Worte: Hallo und Tschüss',
  title_ar: 'أول الكلمات: مرحباً وإلى اللقاء',
  ai_persona: 'Nachbarin katze',
  category: 'daily_life',
  icon: 'users',
  openers: Object.fromEntries(OPENER_LEVELS.map((level) => [level, [`Deutsch ${level}`, `عربي ${level}`]])),
  ...overrides,
});

describe('the catalogue is a complete source for a scenario update', () => {
  it('authors every opener and every required field for all 61 scenes', () => {
    expect(catalogueRows).toHaveLength(61);
    expect(payloadIssues(catalogueRows)).toEqual([]);
  });

  it('accepts the array shape too, so a hand-written file cannot silently load nothing', () => {
    expect(scenarioRows({ scenarios: [{ id: 'a' }] })).toHaveLength(1);
    expect(scenarioRows([{ id: 'a' }])).toHaveLength(1);
    expect(scenarioRows({ rows: [{ id: 'a' }] })).toEqual([]);
    expect(scenarioRows(null)).toEqual([]);
  });

  it('names each gap instead of letting an empty opener blank the live line', () => {
    const broken = authoredRow({
      title_ar: '',
      openers: { a0: ['Hallo', ''], a1: ['', 'أهلاً'] },
    });
    const issues = payloadIssues([broken]);
    expect(issues.some((line) => line.includes('title_ar is empty'))).toBe(true);
    expect(issues.some((line) => line.includes('opener a0 has no Arabic text'))).toBe(true);
    expect(issues.some((line) => line.includes('opener a1 has no German text'))).toBe(true);
  });
});

describe('the loader never creates a row', () => {
  it('writes only catalogue ids that are live and reports the rest', () => {
    const live = [liveRow(), liveRow({ id: 'doctor_visit' })];
    const rows = [authoredRow(), authoredRow({ id: 'doctor_visit' }), authoredRow({ id: 'nahverkehr_ticket' })];
    const { targets, notLive } = scenarioTargets(rows, live);

    expect(targets.map((target) => target.id)).toEqual(['first_greetings', 'doctor_visit']);
    expect(notLive).toEqual(['nahverkehr_ticket']);
  });

  it('maps openers to the five level columns and keeps live artwork', () => {
    const payload = scenarioPayload(authoredRow(), liveRow({ banner_url: 'https://cdn/x.webp' }));
    expect(payload.initial_message_a0).toBe('Deutsch a0');
    expect(payload.initial_message_b2).toBe('Deutsch b2');
    expect(payload.banner_url).toBe('https://cdn/x.webp');
    // `sequence_order` is not a column the studio can write; it must not appear.
    expect(payload).not.toHaveProperty('sequence_order');
    expect(Object.keys(payload).sort()).toEqual([...SCENARIO_COLUMNS].sort());
  });

  it('produces no target when nothing in the catalogue is live', () => {
    const { targets, notLive } = scenarioTargets(catalogueRows, []);
    expect(targets).toEqual([]);
    expect(notLive).toHaveLength(61);
  });
});

describe('the dry run lists every field that would change', () => {
  it('reports before and after per column and skips empty-vs-null noise', () => {
    const live = [liveRow()];
    const { targets } = scenarioTargets([authoredRow()], live);
    const diff = diffScenarios(targets, live);

    expect(diff).toHaveLength(1);
    expect(diff[0].id).toBe('first_greetings');
    const columns = diff[0].changes.map((change) => change.column);
    expect(columns).toContain('title_de');
    expect(columns).toContain('initial_message_a0'); // '' -> "Deutsch a0"
    expect(columns).not.toContain('banner_url'); // carried over from live
    expect(columns).not.toContain('id');

    const a0 = diff[0].changes.find((change) => change.column === 'initial_message_a0');
    expect(a0).toEqual({ column: 'initial_message_a0', before: '', after: 'Deutsch a0' });
  });

  it('treats null and empty as the same value, so a re-run is a no-op', () => {
    const live = [liveRow({ initial_message_a0: null, banner_url: null })];
    const payload = scenarioPayload(authoredRow(), live[0]);
    const diff = diffScenarios([{ id: 'first_greetings', payload }], live);
    expect(diff.some((row) => row.changes.some((change) => change.column === 'initial_message_a0'))).toBe(true);

    // Second run: the live row is now exactly what the first run wrote.
    const second = diffScenarios([{ id: 'first_greetings', payload }], [payload]);
    expect(second).toEqual([]);
  });

  it('summarises the change list biggest first', () => {
    const summary = summarizeChanges(
      diffScenarios(
        scenarioTargets(
          [authoredRow(), authoredRow({ id: 'doctor_visit', title_de: 'Arzt' })],
          [liveRow(), liveRow({ id: 'doctor_visit' })],
        ).targets,
        [liveRow(), liveRow({ id: 'doctor_visit' })],
      ),
    );
    expect(summary.initial_message_a0).toBe(2);
    expect(summary.title_de).toBe(2);
    expect(Object.keys(summary)[0]).toBe('initial_message_a0');
  });
});

describe('scope guards refuse before anything is written', () => {
  it('accepts a clean plan', () => {
    const live = [liveRow()];
    const { targets } = scenarioTargets([authoredRow()], live);
    expect(scopeProblems(targets, live)).toEqual([]);
  });

  it('refuses a duplicate id, a non-live id and an unwritable column', () => {
    const live = [liveRow()];
    const problems = scopeProblems(
      [
        { id: 'first_greetings', payload: { ...pickScenarioColumns(liveRow()), id: 'first_greetings' } },
        { id: 'first_greetings', payload: { ...pickScenarioColumns(liveRow()), id: 'first_greetings' } },
        { id: 'nahverkehr_ticket', payload: { ...pickScenarioColumns(liveRow()), id: 'nahverkehr_ticket' } },
        { id: 'first_greetings', payload: { ...pickScenarioColumns(liveRow()), id: 'first_greetings', sequence_order: 2 } },
      ],
      live,
    );
    expect(problems.some((line) => line.includes('appears twice'))).toBe(true);
    expect(problems.some((line) => line.includes('never creates rows'))).toBe(true);
    expect(problems.some((line) => line.includes('sequence_order'))).toBe(true);
  });

  it('refuses a payload whose id differs from its target', () => {
    const target = { id: 'first_greetings', payload: { ...pickScenarioColumns(liveRow()), id: 'doctor_visit' } };
    expect(scopeProblems([target], [liveRow()]).some((line) => line.includes('change the id'))).toBe(true);
  });
});

describe('verification and undo compare against the manifest', () => {
  const after = (overrides = {}) => ({
    ...pickScenarioColumns(liveRow()),
    title_ar: 'عنوان مصحح',
    ...overrides,
  });

  const manifest = buildManifest({
    createdAt: 1_700_000_000_000,
    baseUrl: 'https://katzu.test',
    backupId: 'content-test',
    bookmark: 'bm',
    ids: ['first_greetings'],
    diff: [{ id: 'first_greetings', changes: [{ column: 'title_ar', before: 'أول الكلمات', after: 'عنوان مصحح' }] }],
    before: { first_greetings: pickScenarioColumns(liveRow()) },
    after: { first_greetings: after() },
    auditUids: [{ id: 'first_greetings', uid: 'audit-1' }],
  });

  it('records both sides of the write and the reusable audit uids', () => {
    expect(manifest.kind).toBe('katzu-scenario-update');
    expect(manifest.created_at).toBe('2023-11-14T22:13:20.000Z');
    expect(manifest.changed_fields).toEqual({ title_ar: 1 });
    expect(manifest.audit_uids).toEqual([{ id: 'first_greetings', uid: 'audit-1' }]);
    expect(manifest.columns).toEqual(SCENARIO_COLUMNS);
  });

  it('passes only when the live row matches the requested side', () => {
    expect(manifestMismatches(manifest, [liveRow()], 'before')).toEqual([]);
    expect(manifestMismatches(manifest, [after()], 'after')).toEqual([]);
    expect(
      manifestMismatches(manifest, [liveRow()], 'after').some((line) => line.includes('title_ar')),
    ).toBe(true);
  });

  it('reports a row that vanished instead of silently skipping it', () => {
    expect(manifestMismatches(manifest, [], 'after')).toEqual(['first_greetings: missing from the live table']);
  });

  it('detects collateral change to a row outside the plan', () => {
    const before = [liveRow(), liveRow({ id: 'doctor_visit' })];
    const changed = [liveRow({ title_de: 'Erste Worte', initial_message_a0: 'x' }), liveRow({ id: 'doctor_visit', icon: 'cross' })];
    const problems = untouchedProblems(before, changed, ['first_greetings']);
    expect(problems).toEqual(['doctor_visit.icon: changed although it was not a target']);
  });

  it('detects a row that appeared or disappeared', () => {
    const before = [liveRow(), liveRow({ id: 'doctor_visit' })];
    expect(untouchedProblems(before, [liveRow()], ['first_greetings'])).toEqual([
      'doctor_visit: disappeared from the live table',
    ]);
    expect(untouchedProblems([liveRow()], [liveRow(), liveRow({ id: 'new_scene' })], ['first_greetings'])).toEqual([
      'new_scene: appeared in the live table',
    ]);
  });
});
