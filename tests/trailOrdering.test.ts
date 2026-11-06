import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { journeyOrderedScenarios, journeyStageFor } from '../src/lib/content/scenarioOrder';

/**
 * The Trail is a journey, not a list, and not the alphabet.
 *
 * This file replaces `tests/trailOrdering.test.ts`'s earlier contract, which
 * pinned `examFirstScenarios`. That function sorted on a `sort_order` field no
 * scenario row has; the comparison was 0 for every pair, so the sort did nothing
 * and the screen kept the object store's key order — alphabetical by id. The
 * tests passed because they exercised the function directly with fixtures that
 * *did* set `sort_order`, so they proved a rule the app never actually ran
 * against a real list. Ordering now lives in `src/lib/content/scenarioOrder.ts`
 * and is tested through the same function the screen calls.
 *
 * The rule is narrow on purpose: reorder, never filter. Nothing about the «اعرض
 * بقية المشاهد» control or the level filter changes, and nothing disappears.
 */

describe('the journey order', () => {
  const list = [
    { id: 'exam_sich_vorstellen', category: 'exam' },
    { id: 'cafe_order', category: 'daily_life' },
    { id: 'anmeldung_buergeramt', category: 'official' },
    { id: 'train_station', category: 'travel' },
    { id: 'airport_arrival', category: 'travel' },
  ];

  it('opens where the learner\'s story opens — at the airport', () => {
    expect(journeyOrderedScenarios(list)[0].id).toBe('airport_arrival');
  });

  it('ends with exam practice', () => {
    expect(journeyOrderedScenarios(list).at(-1)?.id).toBe('exam_sich_vorstellen');
  });

  it('walks the journey in order: arrival, everyday, official, exam', () => {
    expect(journeyOrderedScenarios(list).map((s) => s.id)).toEqual([
      'airport_arrival',
      'train_station',
      'cafe_order',
      'anmeldung_buergeramt',
      'exam_sich_vorstellen',
    ]);
  });

  it('keeps the arrival chain in the order a traveller meets it', () => {
    const arrivals = ['train_first_ride', 'train_station', 'airport_arrival'].map((id) => ({
      id,
      category: 'travel',
    }));
    expect(journeyOrderedScenarios(arrivals).map((s) => s.id)).toEqual([
      'airport_arrival',
      'train_station',
      'train_first_ride',
    ]);
  });

  it('never reads the order it was handed', () => {
    // The defect this replaces was dependency on the caller's order. Shuffling
    // the same rows must not change the screen.
    const shuffled = [list[2], list[4], list[0], list[3], list[1]];
    expect(journeyOrderedScenarios(shuffled).map((s) => s.id)).toEqual(
      journeyOrderedScenarios(list).map((s) => s.id),
    );
  });

  it('hides nothing and does not mutate the array it was given', () => {
    const input = [{ id: 'exam_b' }, { id: 'a' }, { id: 'c' }];
    const copy = input.map((s) => ({ ...s }));
    const result = journeyOrderedScenarios(input);
    expect(result).toHaveLength(input.length);
    expect(input).toEqual(copy);
    expect(result.map((s) => s.id).sort()).toEqual(['a', 'c', 'exam_b']);
  });

  it('places a scenario nobody listed by its category, not at the end', () => {
    // Content grows without this file being edited for every new row: a new
    // travel scenario joins the arrival chain on its own.
    expect(journeyStageFor('taxi_ride_to_hotel', 'travel')).toBe('arrival');
    expect(journeyStageFor('unknown_thing', 'unknown_category')).toBe('other');
    const withNewcomer = journeyOrderedScenarios([
      ...list,
      { id: 'taxi_ride_to_hotel', category: 'travel' },
    ]);
    const airportAt = withNewcomer.findIndex((s) => s.id === 'airport_arrival');
    const taxiAt = withNewcomer.findIndex((s) => s.id === 'taxi_ride_to_hotel');
    const cafeAt = withNewcomer.findIndex((s) => s.id === 'cafe_order');
    expect(taxiAt).toBeGreaterThan(airportAt);
    expect(taxiAt).toBeLessThan(cafeAt);
  });

  it('places the interview family with the interviews, not with the day job', () => {
    expect(journeyStageFor('interview_arzt', 'work')).toBe('professional');
    expect(journeyStageFor('daily_standup', 'work')).toBe('work');
  });

  it('falls back to the author\'s sequence_order inside a stage, then to the id', () => {
    const authored = [
      { id: 'zeta_store', category: 'daily_life', sequence_order: 1 },
      { id: 'alpha_store', category: 'daily_life', sequence_order: 2 },
    ];
    expect(journeyOrderedScenarios(authored).map((s) => s.id)).toEqual(['zeta_store', 'alpha_store']);
    const untitled = [
      { id: 'b_store', category: 'daily_life' },
      { id: 'a_store', category: 'daily_life' },
    ];
    expect(journeyOrderedScenarios(untitled).map((s) => s.id)).toEqual(['a_store', 'b_store']);
  });

  it('copes with an empty list', () => {
    expect(journeyOrderedScenarios([])).toEqual([]);
  });
});

describe('the 12 new situations join the journey where a learner meets them', () => {
  const expected: Array<[string, string]> = [
    ['nahverkehr_ticket', 'arrival'],
    ['paket_abholen', 'everyday'],
    ['handyvertrag', 'everyday'],
    ['sprachcafe', 'everyday'],
    ['jobcenter_termin', 'official'],
    ['integrationskurs_anmelden', 'official'],
    ['polizei_fundbuero', 'official'],
    ['kita_elterngespraech', 'official'],
    ['apotheke', 'health'],
    ['zahnarzt', 'health'],
    ['arzttermin_telefon', 'health'],
    ['notruf_112', 'health'],
  ];

  it.each(expected)('places %s in the %s stage', (id, stage) => {
    expect(journeyStageFor(id)).toBe(stage);
  });

  it('orders them without hiding or dropping any of them', () => {
    const list = expected.map(([id, category]) => ({ id, category }));
    const ordered = journeyOrderedScenarios(list);
    expect(ordered).toHaveLength(list.length);
    expect(ordered.map((s) => s.id).sort()).toEqual(expected.map(([id]) => id).sort());
    expect(ordered[0].id).toBe('nahverkehr_ticket');
    expect(ordered.at(-1)?.id).toBe('notruf_112');
  });
});

describe('the Trail uses the rule and keeps its own controls', () => {
  const TRAIL = readFileSync('src/features/trail/TrailScreen.tsx', 'utf8');

  it('applies the journey order to the scenario list it renders', () => {
    expect(TRAIL).toMatch(/journeyOrderedScenarios\(useLiveQuery/);
    // Not called anywhere — the retired name survives only in the comment that
    // records why it was retired, so assert on the call, not the word.
    expect(TRAIL).not.toMatch(/examFirstScenarios\(/);
  });

  it('keeps the "show the rest" control and its preview count', () => {
    expect(TRAIL).toMatch(/TRAIL_PREVIEW_COUNT/);
    expect(TRAIL).toMatch(/setShowAllScenarios\(true\)/);
    expect(TRAIL).toMatch(/اعرض بقية المشاهد/);
  });

  it('filters the path by the level pills, using the real content index', () => {
    // The pills used to only set state; the path now lists a situation at a
    // level only when its content exists there (or the index is not known yet).
    expect(TRAIL).toMatch(/const pathScenarios = useMemo\(/);
    expect(TRAIL).toMatch(/scenarioLevels\[s\.id\]\.includes\(selectedLevel\)/);
    expect(TRAIL).toMatch(/pathScenarios\.slice\(0, showAllScenarios \? undefined : TRAIL_PREVIEW_COUNT\)/);
  });

  it('gives every card a compact 64px thumbnail, not a full-width banner', () => {
    // Every situation still gets artwork — the old card rendered it
    // conditionally — but the compact card trades the 16:9 banner for a 64px
    // square so three situations fit above the fold.
    expect(TRAIL).not.toMatch(/scene\.artUrl &&/);
    expect(TRAIL).toMatch(/<ScenarioBanner[\s\S]{0,160}className="h-16 w-16 shrink-0 rounded-control"/);
  });

  it('leads each card with the Arabic title and puts the German underneath', () => {
    expect(TRAIL).toMatch(
      /font-arabic text-sm font-bold leading-snug text-text-primary">\s*<bdi dir="rtl">\{scenario\.title_ar\}<\/bdi>/,
    );
    expect(TRAIL).toMatch(
      /<GermanText className="line-clamp-1 block min-w-0 text-xs leading-snug text-text-secondary">\s*\{scenario\.title_de\}\s*<\/GermanText>/,
    );
  });

  it('shows the three evidence stages on every card', () => {
    expect(TRAIL).toMatch(/<MasteryStage done=\{studied\} label="دراسة" \/>/);
    expect(TRAIL).toMatch(/<MasteryStage done=\{withHelp\} label="مع مساعدة" \/>/);
    expect(TRAIL).toMatch(/<MasteryStage done=\{done\} label="وحدك" \/>/);
  });
});

describe('the path has one primary action and one progression system', () => {
  const TRAIL = readFileSync('src/features/trail/TrailScreen.tsx', 'utf8');

  it('renders exactly one primary CTA above the review row', () => {
    expect(TRAIL.match(/data-testid="trail-primary-cta"/g)).toHaveLength(1);
    expect(TRAIL.indexOf('trail-primary-cta')).toBeLessThan(TRAIL.indexOf('trail-review-row'));
  });

  it('never renders the rank card or the ladder on the path', () => {
    // Rank and XP now live on the profile, and the rank-up is celebrated after
    // the session that earned it — so the path carries one progression story.
    expect(TRAIL).not.toMatch(/data-testid="trail-rank-card"/);
    expect(TRAIL).not.toMatch(/trail-rank-pill/);
    expect(TRAIL).not.toMatch(/rankFor\(/);
  });

  it('caps the review action at ten items and puts the backlog in plain text', () => {
    expect(TRAIL).toMatch(/Math\.min\(dueCount, REVIEW_SESSION_CAP\)/);
    expect(TRAIL).toMatch(/reviewBacklog\(dueCount\)/);
    expect(TRAIL).not.toMatch(/راجع \$\{dueCount\}/);
  });

  it('keeps the sticky level bar as the only level control', () => {
    expect(TRAIL).toMatch(/data-testid="trail-level-bar"/);
    expect(TRAIL).toMatch(/const BAR_LEVELS: BarLevel\[\] = \['A1', 'A2', 'B1', 'B2'\]/);
    expect(TRAIL).toMatch(/locked && <Lock className="h-3 w-3"/);
  });
});
