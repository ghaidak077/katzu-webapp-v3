import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { journeyOrderedScenarios, journeyStageFor } from '../src/lib/content/scenarioOrder';
import { UI_STRINGS } from '../src/lib/i18n/strings';

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

  it('renders one vertical unit map with the current unit expanded', () => {
    expect(TRAIL).toMatch(/data-testid="trail-unit-map"/);
    expect(TRAIL).toMatch(/const openUnitId = expandedUnitId \?\? currentUnitId/);
    expect(TRAIL).toMatch(/const expanded = entry\.unit\.id === openUnitId/);
    // The unit header is the only place the unit's name and count appear, and
    // the timeline exists only inside the open unit.
    // 010 i18n: the header renders the key, and the key's Arabic is the sentence.
    expect(TRAIL).toMatch(/t\('trail\.unit\.index', \{ index: index \+ 1, title: entry\.unit\.titleAr \}\)/);
    expect(UI_STRINGS.ar['trail.unit.index']).toBe('الوحدة {index} · {title}');
    expect(TRAIL).toMatch(/data-testid="trail-unit-count"[\s\S]{0,400}<LtrCounter value=\{entry\.done\} total=\{entry\.total\}/);
    expect(TRAIL).toMatch(/\{expanded && !headerLocked && \(/);
    expect(TRAIL.match(/data-testid="trail-timeline"/g)).toHaveLength(1);
  });

  it('never renders a level selector in the main flow', () => {
    // The level is what the server serves; the learner chooses nothing here.
    expect(TRAIL).not.toMatch(/data-testid="trail-level-bar"/);
    expect(TRAIL).not.toMatch(/BAR_LEVELS/);
    expect(TRAIL).not.toMatch(/setSelectedLevel/);
    expect(TRAIL).toMatch(/const episodeLevel = servedLevel\(learnerLevel, isPro\)/);
  });

  it('draws the unit as a timeline instead of tinted category artwork', () => {
    // The path carries no category glyph and no blurred scene art: a situation
    // is a node on one line, and the node says done / current / number.
    expect(TRAIL).not.toMatch(/scene\.artUrl &&/);
    expect(TRAIL).not.toMatch(/<ScenarioBanner/);
    expect(TRAIL).not.toMatch(/CATEGORY_VISUALS/);
    expect(TRAIL).not.toMatch(/visualFor\(/);
    expect(TRAIL).toMatch(/data-testid="trail-scenario-card"/);
    const rowAt = TRAIL.indexOf('data-testid="trail-scenario-card"');
    const nodeAt = TRAIL.indexOf('<span aria-hidden className="flex w-7 shrink-0 flex-col items-center">');
    const germanAt = TRAIL.indexOf('<GermanText className="line-clamp-2 min-w-0 flex-1');
    expect(nodeAt, 'every row opens with its timeline node').toBeGreaterThan(rowAt);
    expect(nodeAt, 'the node precedes the title and the German subtitle').toBeLessThan(germanAt);
    expect(TRAIL.match(/className="mt-1 w-px flex-1 bg-border-subtle"/g)).toHaveLength(1);
    // Rows are separated by a hairline, never by a card: the only filled surface
    // above the fold is the current row's tint.
    expect(TRAIL).toMatch(/className=\{last \? '' : 'border-b border-border-subtle'\}/);
    expect(TRAIL).not.toMatch(/data-testid="trail-unit-header"[\s\S]{0,700}rounded-control border/);
    expect(TRAIL).toMatch(/done \? \(\s*<Check/);
    expect(TRAIL).toMatch(/current \? \(\s*<Play/);
  });

  it('leads each row with the Arabic title and puts the German underneath', () => {
    expect(TRAIL).toMatch(
      /font-arabic text-sm font-bold leading-snug text-text-primary">\s*\{scenario\.title_ar\}/,
    );
    expect(TRAIL).toMatch(
      /<GermanText className="line-clamp-2 min-w-0 flex-1 text-micro leading-snug text-text-secondary">\s*\{scenario\.title_de\}\s*<\/GermanText>/,
    );
  });

  it('shows the three evidence stages as one labelled meter on the current row only', () => {
    expect(TRAIL).toMatch(/const STAGES: SessionStage\[\] = \['study', 'with_help', 'solo'\]/);
    expect(TRAIL).toMatch(/const states = \[studied, withHelp, done\]/);
    expect(TRAIL).toMatch(
      /STAGE_LABEL_AR\[stageFor\(scenario\.id, \{ evidence, lastEase: user\?\.lastSessionEase \?\? null \}\)\]/,
    );
    expect(TRAIL).toMatch(/data-testid="trail-stage-segment"/);
    expect(TRAIL).toMatch(/key=\{STAGES\[index\]\}/);
    expect(TRAIL).toMatch(/<StageMeter\s+studied=\{studiedSet\.has\(scenario\.id\)\}\s+withHelp=\{practisedSet\.has\(scenario\.id\)\}\s+done=\{done\}/);
    // A lesson yet to be reached never shows filled stages: the meter and the
    // minutes live inside the current row's branch only.
    expect(TRAIL.match(/<StageMeter/g)).toHaveLength(1);
    expect(TRAIL.indexOf('<StageMeter')).toBeGreaterThan(TRAIL.indexOf('{current && ('));
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

  it('caps the review action at ten items and shows the backlog as plain text', () => {
    expect(TRAIL).toMatch(/Math\.min\(dueCount, REVIEW_SESSION_CAP\)/);
    // The row states how much is waiting; the cap and the minutes belong to the
    // action's accessible name and to the review screen, not to a badge.
    expect(TRAIL).toMatch(/t\('trail\.review\.waiting', \{ count: dueCount \}\)/);
    expect(UI_STRINGS.ar['trail.review.waiting']).toBe('{count} بانتظار');
    expect(TRAIL).not.toMatch(/trail-review-badge/);
    expect(TRAIL).not.toMatch(/في الانتظار/);
    expect(TRAIL).not.toMatch(/راجع \$\{dueCount\}/);
  });

  it('states the free sessions as one labelled line, never a bare number', () => {
    expect(TRAIL).toMatch(/data-testid="trail-free-sessions"/);
    expect(TRAIL).toMatch(
      /t\('trail\.freeSessions\.label', \{ left: freeSessions, total: FREE_SESSION_TOTAL \}\)/,
    );
    expect(UI_STRINGS.ar['trail.freeSessions.label']).toBe('جلسة مجانية {left} من {total}');
  });

  it('keeps the next marker quiet and drops the duplicate new label', () => {
    expect(TRAIL).not.toMatch(/data-testid="trail-status-pill"/);
    expect(TRAIL).toMatch(/data-testid="trail-next-label"/);
    // The timeline node carries «current», so a second label per row was the
    // same sentence twice.
    expect(TRAIL).not.toMatch(/data-testid="trail-new-label"/);
    expect(TRAIL).toMatch(/aria-current=\{stage === nextStage \? 'step' : undefined\}/);
  });

  it('states the level once in the screen header, not on a fifth card', () => {
    expect(TRAIL).not.toMatch(/data-testid="trail-level-card"/);
    expect(TRAIL).toMatch(/data-testid="trail-level-line"/);
    expect(TRAIL).toMatch(/\{currentUnitEntry\.unit\.level\} · \{currentLevelPercent\}%/);
    // One level line for the screen; it never repeats inside a unit header.
    expect(TRAIL.match(/data-testid="trail-level-line"/g)).toHaveLength(1);
    // Rank names belong to the profile; the path carries no rank wording.
    expect(TRAIL).not.toMatch(/رتبتك/);
  });
});

describe('the path screen is a header, one hero and one timeline', () => {
  const TRAIL = readFileSync('src/features/trail/TrailScreen.tsx', 'utf8');

  it('greets by name, marks Pro once, and carries a single streak chip', () => {
    expect(TRAIL).toMatch(
      /<h1 className="truncate font-arabic text-base font-bold leading-tight">\s*\{t\('trail\.greeting', \{ name: user\?\.displayName \|\| t\('profile\.defaultName'\) \}\)\}/,
    );
    expect(UI_STRINGS.ar['trail.greeting']).toBe('أهلاً {name}');
    expect(TRAIL).toMatch(/data-testid="trail-pro-label"/);
    // One chip, two branches of the same slot: a streak, or an invitation to
    // start one. Never a second chip opposite it.
    expect(TRAIL.match(/data-testid="trail-streak-chip"/g)).toHaveLength(2);
    expect(TRAIL.match(/<header className=/g)).toHaveLength(1);
    expect(TRAIL).toMatch(/<KatzuMascot name="avatar"/);
  });

  it('removes the «0 / 20» goal ring from a screen that names the next action', () => {
    // The ring was today's recorded minutes against the daily goal — a
    // scoreboard, not a plan. Progress lives on the profile.
    expect(TRAIL).not.toMatch(/trail-goal-ring/);
    expect(TRAIL).not.toMatch(/todayMinutes/);
    expect(TRAIL).not.toMatch(/dailyGoalMinutes/);
  });

  it('puts the German subtitle in an LTR-isolated element', () => {
    expect(TRAIL).toMatch(/<GermanText className="mt-0\.5 block truncate text-xs text-text-secondary">\s*\{nextScenario\.title_de\}/);
  });

  it('opens the situation sheet with the three stages and the recommended start', () => {
    expect(TRAIL).toMatch(/<BottomSheet\s+isOpen=\{Boolean\(sheetScenario\)\}/);
    expect(TRAIL).toMatch(/const sheetStage: SessionStage = sheetScenario\s*\? stageFor\(sheetScenario\.id, \{ evidence, lastEase: user\?\.lastSessionEase \?\? null \}\)\s*: 'study'/);
    expect(TRAIL).toMatch(/data-testid="trail-sheet-start"/);
    expect(TRAIL).toMatch(/\{t\('trail\.suggested'\)\}/);
    expect(UI_STRINGS.ar['trail.suggested']).toBe('المقترحة');
    // The row opens the sheet; only the sheet's button starts the scene.
    expect(TRAIL).toMatch(/setSheetScenarioId\(scenario\.id\)/);
    expect(TRAIL).toMatch(/const startSheetScenario = \(\) => \{[\s\S]{0,400}handleScenarioClick\(scenarioId, sheetLevel\)/);
  });
});
