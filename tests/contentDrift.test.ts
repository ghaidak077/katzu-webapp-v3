import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  compareDrafts,
  displayKey,
  fetchLive,
  loadDrafts,
  matchKey,
  norm,
  summarise,
} from '../scripts/check-content-drift.mjs';

/**
 * The post-load consistency check (V15).
 *
 * `scripts/check-content-drift.mjs` compares the deployed Worker's public content
 * endpoints against the repository's drafts and reports differences — the check
 * that did not exist when V14-1 shipped a scenario title that only production
 * disagreed with, and when V14-2 silently dropped 19 vocabulary rows to the
 * loader's skip rule.
 *
 * Two things must hold for it to be trustworthy, and both are tested here:
 *   1. the comparison logic classifies differences correctly (one injected defect
 *      per class), and
 *   2. the script cannot write anything: it only ever issues GETs on the four
 *      public content paths, with no request method and no admin header.
 */

interface Draft {
  file: string;
  kind: 'module' | 'supplement';
  draft: Record<string, any>;
}

function moduleDraft(vocabulary: unknown[] = [], scenarios: unknown[] = []): Draft {
  return { file: 'docs/content/curriculum-test.json', kind: 'module', draft: { scenarios, vocabulary } };
}

const AUD = 'Am Flughafen: das Gepäck';
const AR = 'في المطار: الأمتعة';

function vocabularyRow(overrides: Record<string, unknown> = {}) {
  return {
    german: 'Brot',
    article: 'das',
    plural: 'die Brote',
    part_of_speech: 'Noun',
    translation_ar: 'الخبز',
    translation_en: 'bread',
    example_de: 'Ist das Brot frisch?',
    example_ar: 'هل الخبز طازج؟',
    example_en: 'Is the bread fresh?',
    level: 'A1',
    topic: 'food',
    ...overrides,
  };
}

function liveOf(overrides: Record<string, any[]>) {
  return { scenarios: [], vocabulary: [], starter_phrases: [], grammar: [], ...overrides };
}

describe('drift check — matching', () => {
  it('keys rows the way the loader does, case-insensitively', () => {
    expect(displayKey('vocabulary', { level: 'A1', german: 'Brot', topic: 'food' })).toBe('A1|Brot|food');
    expect(matchKey('vocabulary', { level: 'A1', german: 'Brot', topic: 'food' })).toBe('a1|brot|food');
    expect(matchKey('vocabulary', { level: 'a1', german: 'brot', topic: 'food' })).toBe('a1|brot|food');
    expect(matchKey('starter_phrases', { scenario_id: 'cafe_order', german: 'Ein Kaffee, bitte.' })).toBe(
      'cafe_order|ein kaffee, bitte.',
    );
  });

  it('treats null, undefined and empty as the same absence', () => {
    expect(norm(null)).toBe('');
    expect(norm(undefined)).toBe('');
    expect(norm('  ')).toBe('');
    expect(norm(3)).toBe('3');
  });

  it('reports nothing when the draft and production agree', () => {
    const draft = moduleDraft([vocabularyRow()]);
    const { differences, totals } = summarise(
      compareDrafts([draft], liveOf({ vocabulary: [vocabularyRow()] })),
    );
    expect(differences).toBe(0);
    expect(totals.diverged).toBe(0);
  });
});

describe('drift check — every class fires', () => {
  it('flags a field that differs, as the V14 title case would have been', () => {
    const draft = moduleDraft([], [{ id: 'airport_arrival', title_de: AUD, title_ar: AR }]);
    const live = liveOf({ scenarios: [{ id: 'airport_arrival', title_de: 'Am Flughafen: fehlendes Gepäck', title_ar: 'في المطار: الأمتعة المفقودة' }] });
    const comparison = compareDrafts([draft], live);
    const [entry] = comparison.tables.find((table) => table.table === 'scenarios')!.detail;

    expect(entry.kind).toBe('diverged');
    expect(entry.key).toBe('airport_arrival');
    expect(entry.fields.map((field: any) => field.field).sort()).toEqual(['title_ar', 'title_de']);
    expect(summarise(comparison).differences).toBe(1);
  });

  it('flags a module row production does not have at all', () => {
    const comparison = compareDrafts([moduleDraft([vocabularyRow()])], liveOf({}));
    const table = comparison.tables.find((entry) => entry.table === 'vocabulary')!;
    expect(table.absent).toBe(1);
    expect(table.diverged).toBe(0);
    expect(table.detail[0].kind).toBe('absent');
  });

  it('calls the same thing "pending" for a supplement, because supplements are knowingly unloaded', () => {
    const supplement: Draft = {
      file: 'docs/content/supplements/grammar-basics.json',
      kind: 'supplement',
      draft: { grammar: [{ id: 'g_articles_a1', level: 'A1', rule_de: 'der/die/das' }] },
    };
    const comparison = compareDrafts([supplement], liveOf({}));
    const table = comparison.tables.find((entry) => entry.table === 'grammar')!;
    expect(table.pending).toBe(1);
    expect(table.absent).toBe(0);
  });

  it('flags one natural key declared by two drafts, and says whether they disagree', () => {
    const first = moduleDraft([vocabularyRow()]);
    const other = (row: Record<string, unknown>): Draft => ({
      ...moduleDraft([row]),
      file: 'docs/content/curriculum-other.json',
    });
    const second = other(vocabularyRow({ example_de: 'Ich möchte etwas Brot.' }));
    const identical = compareDrafts([first, other(vocabularyRow())], liveOf({}));

    const disagreeing = compareDrafts([first, second], liveOf({}));
    expect(disagreeing.duplicates).toEqual([
      {
        table: 'vocabulary',
        key: 'A1|Brot|food',
        files: ['docs/content/curriculum-other.json', 'docs/content/curriculum-test.json'],
        disagreeing: true,
      },
    ]);
    expect(identical.duplicates[0].disagreeing).toBe(false);
  });

  it('counts both sides of a one-sided duplicate, and keeps --strict meaningful', () => {
    // The by-design classes alone must not be a hard failure; an absent module row
    // or a key two drafts fight over must be.
    const onlyDiverged = summarise(compareDrafts([moduleDraft([vocabularyRow()])], liveOf({ vocabulary: [vocabularyRow({ plural: 'Brote' })] })));
    expect(onlyDiverged.differences).toBe(1);
    expect(onlyDiverged.totals.absent).toBe(0);
    expect(onlyDiverged.totals.duplicates).toBe(0);
  });
});

describe('drift check — the shipped drafts', () => {
  it('reads every shipped draft — modules and supplement — and tags each shape', () => {
    const drafts = loadDrafts();
    expect(drafts.map(({ file, kind }) => `${kind} ${file}`)).toEqual([
      'module docs/content/curriculum-30day-module1.json',
      'module docs/content/curriculum-a0-foundations.json',
      'module docs/content/curriculum-arrival-module2.json',
      'module docs/content/curriculum-ausbildung-exams.json',
      'module docs/content/curriculum-coverage-fix.json',
      'module docs/content/curriculum-exam-speaking.json',
      'module docs/content/curriculum-interview-medical.json',
      'module docs/content/curriculum-interview-tech.json',
      'supplement docs/content/supplements/grammar-basics.json',
      'supplement docs/content/supplements/grammar-essentials-v21.json',
      'supplement docs/content/supplements/grammar-legacy-d4-patch.json',
    ]);
  });

  it('reports nothing at all against itself, so a clean production run is believable', () => {
    // Feeding the drafts back as their own production is the only offline way to
    // show the comparator is not simply always red. Until V16 this was 6: the two
    // modules both declared Miete, Mietvertrag and Kaution with different example
    // sentences, so one draft's copy had to diverge (and production held a third,
    // older wording). module1 no longer declares them.
    const drafts = loadDrafts();
    const live = { scenarios: [], vocabulary: [], starter_phrases: [], grammar: [] as Record<string, unknown>[] };
    for (const { draft } of drafts) {
      live.scenarios.push(...(draft.scenarios ?? []));
      live.vocabulary.push(...(draft.vocabulary ?? []));
      live.starter_phrases.push(...(draft.starter_phrases ?? []));
      live.grammar.push(...(draft.grammar ?? []));
    }
    const comparison = compareDrafts(drafts, live);
    const { differences, totals } = summarise(comparison);
    expect(comparison.tables.flatMap((table) => table.detail.map((entry: any) => `${entry.kind} ${entry.key}`))).toEqual([]);
    expect(differences).toBe(0);
    expect(totals.duplicates).toBe(0);
  });

  it('finds no natural key declared twice across the shipped drafts (the V16 invariant)', () => {
    // The cross-file rule no per-file validator can express: one `level|german|topic`
    // may be declared once, by one draft. The loader writes the first file it is
    // given and skips the rest, so a second declaration is content that can never
    // land — silently.
    const { duplicates } = compareDrafts(loadDrafts(), liveOf({}));
    expect(duplicates).toEqual([]);
  });

  it('still fails when two drafts do declare one key — the invariant is not vacuous', () => {
    const one = moduleDraft([vocabularyRow()]);
    const two = { ...moduleDraft([vocabularyRow({ example_de: 'Ich möchte etwas Brot.' })]), file: 'docs/content/curriculum-other.json' };
    const { duplicates } = compareDrafts([one, two], liveOf({}));
    expect(duplicates.map((entry: any) => entry.key)).toEqual(['A1|Brot|food']);
  });
});

describe('drift check — approved-but-unloaded scenarios (V24-1)', () => {
  function jsonFetch(statusByUrl: (url: string) => number) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/scenarios')
        ? []
        : url.endsWith('/vocabulary')
          ? []
          : url.endsWith('/grammar')
            ? []
            : { starter_phrases: [] };
      return new Response(JSON.stringify(body), { status: statusByUrl(url), headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch);
  }

  it('skips a scenario that is not live (404) instead of aborting, so its rows classify as absent/pending', async () => {
    const drafts = [
      {
        ...moduleDraft([], [{ id: 'loaded_scenario' }, { id: 'unloaded_scenario' }]),
        draft: {
          scenarios: [{ id: 'loaded_scenario' }, { id: 'unloaded_scenario' }],
          vocabulary: [],
          starter_phrases: [
            { id: 'p1', scenario_id: 'unloaded_scenario', german: 'Guten Tag', level: 'A1', sort_order: 1 },
          ],
        },
      },
    ];
    let detailCalls = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/scenarios')) return new Response(JSON.stringify([{ id: 'loaded_scenario' }]), { status: 200 });
      if (url.endsWith('/vocabulary')) return new Response('[]', { status: 200 });
      if (url.endsWith('/grammar')) return new Response('[]', { status: 200 });
      detailCalls += 1;
      if (url.endsWith('/scenarios/unloaded_scenario')) {
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      return new Response(JSON.stringify({ starter_phrases: [] }), { status: 200 });
    }) as unknown as typeof fetch);

    let live: Awaited<ReturnType<typeof fetchLive>>;
    try {
      live = await fetchLive('https://worker.test', drafts);
    } finally {
      fetchSpy.mockRestore();
    }

    expect(detailCalls).toBe(1); // only the loaded scenario's detail GET ran
    const comparison = compareDrafts(drafts, live);
    const phrases = comparison.tables.find((t) => t.table === 'starter_phrases');
    expect(phrases?.absent).toBe(1);
    expect(summarise(comparison).totals.pending).toBe(0);
    expect(summarise(comparison).totals.absent).toBeGreaterThanOrEqual(1);
  });

  it('still aborts on a real server error (500) — the skip rule is 404-only', async () => {
    const drafts = [moduleDraft([], [{ id: 'loaded_scenario' }])];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/scenarios')) return new Response(JSON.stringify([{ id: 'loaded_scenario' }]), { status: 200 });
      if (url.endsWith('/vocabulary')) return new Response('[]', { status: 200 });
      if (url.endsWith('/grammar')) return new Response('[]', { status: 200 });
      return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
    }) as unknown as typeof fetch);

    try {
      await expect(fetchLive('https://worker.test', drafts)).rejects.toThrow(/HTTP 500/);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('does not even GET the detail path for an unloaded scenario (the 404 never has to happen)', async () => {
    const drafts = [moduleDraft([], [{ id: 'ghost_scenario' }])];
    const urls: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: RequestInfo | URL) => {
      urls.push(String(input));
      const body = String(input).endsWith('/scenarios') || String(input).endsWith('/vocabulary') || String(input).endsWith('/grammar')
        ? '[]'
        : JSON.stringify({ starter_phrases: [] });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch);

    try {
      await fetchLive('https://worker.test', drafts);
    } finally {
      fetchSpy.mockRestore();
    }

    expect(urls.some((u) => u.includes('ghost_scenario'))).toBe(false);
  });
});

describe('drift check — it cannot write', () => {
  it('only GETs the four public content paths, with no method and no admin header', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const body = url.endsWith('/scenarios') ? [] : url.endsWith('/vocabulary') ? [] : url.endsWith('/grammar') ? [] : { starter_phrases: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch);

    try {
      await fetchLive('https://worker.test', loadDrafts());
    } finally {
      fetchSpy.mockRestore();
    }

    expect(calls.length).toBeGreaterThan(0);
    for (const { url, init } of calls) {
      expect(url).toMatch(
        /^https:\/\/worker\.test\/(scenarios|vocabulary|grammar)(\/[^/]+)?$/,
      );
      expect(init?.method ?? 'GET').toBe('GET');
      expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/authorization|bearer|admin/i);
    }
  });

  it('names no secret and no write verb, so it cannot be repurposed into an admin call', () => {
    const source = readFileSync('scripts/check-content-drift.mjs', 'utf8');
    expect(source).not.toMatch(/ADMIN_SECRET/);
    expect(source).not.toMatch(/method\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/i);
    expect(source).not.toMatch(/Authorization/i);
  });
});
