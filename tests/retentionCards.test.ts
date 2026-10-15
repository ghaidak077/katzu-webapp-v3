import { describe, expect, it } from 'vitest';
import { buildTomorrowTeaser, nextScenarioAfter, tomorrowTeaserAr } from '../src/lib/debrief/tomorrow';
import { buildFollowUpCard } from '../src/lib/debrief/followUpCard';
import { WEEK_MS, buildWeeklyRecap, type WeeklySessionInput } from '../src/lib/journey/weeklyRecap';

/**
 * A4's three retention surfaces — deterministic, and honest about what they do
 * not know. The unit under test is the DECISION (which line, which card, which
 * numbers), so the assertions pin wording rules and the fallbacks rather than
 * re-stating one string.
 */

describe('buildTomorrowTeaser', () => {
  it('names tomorrow\'s scene and the reviews that are actually due', () => {
    const teaser = buildTomorrowTeaser({ nextScenarioTitle: 'في المقهى', dueCount: 3 });
    expect(teaser.missionAr).toBe('غداً: «في المقهى»');
    expect(teaser.reviewAr).toContain('3 مراجعات');
    expect(tomorrowTeaserAr({ nextScenarioTitle: 'في المقهى', dueCount: 3 })).toContain('«في المقهى»');
  });

  it('agrees the review count the way Arabic requires (1 / 2 / 3 / 11)', () => {
    expect(buildTomorrowTeaser({ dueCount: 1 }).reviewAr).toContain('مراجعة واحدة');
    expect(buildTomorrowTeaser({ dueCount: 2 }).reviewAr).toContain('مراجعتان');
    expect(buildTomorrowTeaser({ dueCount: 3 }).reviewAr).toContain('3 مراجعات');
    expect(buildTomorrowTeaser({ dueCount: 11 }).reviewAr).toContain('11 مراجعة');
  });

  it('stays generic instead of empty when the scene cannot be named', () => {
    const line = tomorrowTeaserAr({ nextScenarioTitle: '   ', dueCount: null });
    expect(line).toContain('مشهد جديد من رحلتك');
    // No due count is "nothing pending", not "0 reviews" and not a crash.
    expect(buildTomorrowTeaser({}).reviewAr).toContain('ولا شيء معلّق');
  });

  it('is deterministic for identical input', () => {
    expect(tomorrowTeaserAr({ nextScenarioTitle: 'المطار', dueCount: 2 })).toBe(
      tomorrowTeaserAr({ nextScenarioTitle: 'المطار', dueCount: 2 }),
    );
  });
});

describe('nextScenarioAfter', () => {
  const scenarios = [
    { id: 'third', title: 'الثالث', category: 'daily', sequence_order: 3 },
    { id: 'first', title: 'الأول', category: 'daily', sequence_order: 1 },
    { id: 'second', title: 'الثاني', category: 'daily', sequence_order: 2 },
  ];

  it('walks the journey order, not the array order', () => {
    expect(nextScenarioAfter(scenarios, 'first')).toEqual({ id: 'second', title: 'الثاني' });
    expect(nextScenarioAfter(scenarios, 'second')).toEqual({ id: 'third', title: 'الثالث' });
  });

  it('returns null at the end of the path and for no content at all', () => {
    expect(nextScenarioAfter(scenarios, 'third')).toBeNull();
    expect(nextScenarioAfter([], 'first')).toBeNull();
    expect(nextScenarioAfter(undefined, 'first')).toBeNull();
  });
});

describe('buildFollowUpCard', () => {
  const base = {
    cefrLevel: 'A1' as const,
    previousGerman: 'can_hold' as const,
    arrivalStatus: 'preparing' as const,
    primaryGoal: 'work' as const,
    targetDate: null,
  };

  it('asks nothing before the learner has completed an episode', () => {
    expect(buildFollowUpCard({ user: base, hasCompletedEpisode: false })).toBeNull();
  });

  it('offers the placement when the level was never measured', () => {
    const card = buildFollowUpCard({ user: base, hasCompletedEpisode: true });
    expect(card?.kind).toBe('placement');
    expect(card?.skipAr).toBeTruthy();
  });

  it('does not offer the placement to a from-zero first-timer', () => {
    const card = buildFollowUpCard({
      user: { ...base, previousGerman: 'first_time' },
      hasCompletedEpisode: true,
    });
    expect(card).toBeNull();
  });

  it('offers it to someone already living in Germany, even without prior study', () => {
    const card = buildFollowUpCard({
      user: { ...base, previousGerman: 'first_time', arrivalStatus: 'living_in_germany' },
      hasCompletedEpisode: true,
    });
    expect(card?.kind).toBe('placement');
  });

  it('never shows twice: a stamped learner gets nothing', () => {
    expect(
      buildFollowUpCard({ user: { ...base, followUpCardSeenAt: Date.now() }, hasCompletedEpisode: true }),
    ).toBeNull();
  });

  it('switches to the missing exam date once the level is known', () => {
    const card = buildFollowUpCard({
      user: { ...base, placementCompletedAt: Date.now(), primaryGoal: 'exam', targetDate: null },
      hasCompletedEpisode: true,
    });
    expect(card?.kind).toBe('target-date');

    const dated = buildFollowUpCard({
      user: { ...base, placementCompletedAt: Date.now(), primaryGoal: 'exam', targetDate: Date.now() + WEEK_MS },
      hasCompletedEpisode: true,
    });
    expect(dated).toBeNull();
  });
});

describe('buildWeeklyRecap', () => {
  const now = Date.UTC(2026, 4, 20, 12, 0, 0); // a fixed Wednesday
  const session = (over: Partial<WeeklySessionInput> = {}): WeeklySessionInput => ({
    scenarioTitle: 'في المقهى',
    durationSeconds: 120,
    timestamp: now - 60_000,
    sentencesSpoken: 4,
    independentSentences: 3,
    ...over,
  });

  it('counts only the last seven days', () => {
    const recap = buildWeeklyRecap(
      [session(), session({ timestamp: now - 8 * 24 * 60 * 60 * 1000 })],
      now,
    );
    expect(recap.episodes).toBe(1);
  });

  it('adds minutes, unaided sentences and distinct days', () => {
    const recap = buildWeeklyRecap(
      [
        session({ durationSeconds: 90 }),
        session({ timestamp: now - 24 * 60 * 60 * 1000, durationSeconds: 90, independentSentences: 1 }),
      ],
      now,
    );
    expect(recap.minutes).toBe(3);
    expect(recap.independentSentences).toBe(4);
    expect(recap.activeDays).toBe(2);
    // Arabic writes the dual as a word, not as "2 جلسات" — see arabicCount.
    expect(recap.headlineAr).toContain('جلستان');
    expect(recap.headlineAr).toContain('3 دقائق');
    expect(recap.headlineAr).toContain('4 جمل');
  });

  it('does not invent minutes for sessions that recorded no duration', () => {
    const recap = buildWeeklyRecap([session({ durationSeconds: null })], now);
    expect(recap.minutes).toBe(0);
    expect(recap.headlineAr).not.toContain('دقيقة');
  });

  it('picks the most-visited scene, breaking ties by speaking time', () => {
    const recap = buildWeeklyRecap(
      [
        session({ scenarioTitle: 'في المقهى', durationSeconds: 30 }),
        session({ scenarioTitle: 'في المقهى' }),
        session({ scenarioTitle: 'في المطار', durationSeconds: 600 }),
      ],
      now,
    );
    expect(recap.topScenarioTitle).toBe('في المقهى');
  });

  it('says an empty week plainly instead of rendering zeroes', () => {
    const recap = buildWeeklyRecap([session({ timestamp: now - WEEK_MS - 1 })], now);
    expect(recap.episodes).toBe(0);
    expect(recap.headlineAr).toContain('لم نسجّل جلسة');
    expect(buildWeeklyRecap(undefined, now).episodes).toBe(0);
  });
});
