import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { refreshCurriculumCache } from '@/lib/api/workerClient';
import { countDue } from '@/lib/srs/engine';
import { isProEffective } from '@/lib/utils/subscription';
import { expiryNoticeAr } from '@/lib/entitlement/expiry';
import { servedLevel } from '@/lib/entitlement/trial';
import { BorderBeam } from '@/components/effects/BorderBeam';
import { selectDailyMission, INTRO_SCENARIO_ID } from '@/lib/mission/selectMission';
import { readDailyTasks } from '@/lib/daily/taskStore';
import type { DailyTaskKind } from '@/lib/daily/tasks';
import { DailyTasksPanel } from '@/features/journey/DailyTasksPanel';
import { readJourneyHomeData } from '@/features/journey/journeyHomeData';
import { buildCapabilityModel, capabilityLabel, weakestMeasuredSkill } from '@/lib/capability/model';
import { buildJourneyContext, katzuJourneyLineAr, missionReasonAr } from '@/lib/journey/context';
import { sceneFor } from '@/lib/design/scenes';
import { track } from '@/lib/analytics/client';
import { GermanText } from '@/components/common/GermanText';

import { GlassCard, FloatingControl } from '@/components/glass/GlassCard';
import { GlassButton, PrimaryAction } from '@/components/glass/GlassButton';
import { LtrCounter } from '@/components/common/LtrCounter';
import { ProgressStrip } from '@/components/v2/ProgressStrip';
import { StatusIndicator } from '@/components/v2/StatusIndicator';
import { KatzuPresence } from '@/components/v2/KatzuPresence';
import { useOnlineStatus } from '@/lib/utils/onlineStatus';
import { arCount, arNoun } from '@/lib/i18n/arabicCount';
import { MINUTE_NOM, REVIEW_ITEM_BARE } from '@/lib/i18n/countForms';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { UiStringKey } from '@/lib/i18n/strings';
import { buildWeeklyRecap } from '@/lib/journey/weeklyRecap';
import { isGuidedHomeEnabled } from '@/lib/flags/guidedHome';
import { shouldOfferPro } from '@/lib/entitlement/trial';
import { isFirstSessionDone } from '@/lib/journey/firstSession';
import { isProgressRevealed, isReviewRevealed, sheetReviewCount } from '@/lib/journey/reveal';
import { JourneyMoreSheet } from '@/features/journey/JourneyMoreSheet';

/* V31: counts that reach a learner's eye agree with their noun. The two form
   tables live in `lib/i18n/countForms` now, because the same nouns are written
   by the panel, the sheet and the review row — one place, not four. */
import { ArrowLeft, Brain, ChevronDown, ChevronLeft, RefreshCw, Sparkles, X } from 'lucide-react';
import type { CEFRLevel } from '@/types/models';

export interface JourneyHomeScreenProps {
  /** Opens Story Setup for a scene — the mission's one primary action. */
  onStartMission: (scenarioId: string) => void;
  onOpenReview: () => void;
  onOpenSubscription: () => void;
  /** The scenario library (the pre-V2 trail), kept reachable as a quiet link. */
  onOpenLibrary: () => void;
  onOpenOnboarding?: () => void;
  /** The القواعد section (V21 Phase 4) — browse every rule by level and practise it. */
  onOpenGrammar?: () => void;
  /**
   * The Practice tab's three skills. They were never footer chips on this screen
   * (they live one tap away on the tab bar), but the guided home's «المزيد»
   * gathers the whole "somewhere else" surface in one place, and a learner who
   * opens it looking for listening practice should find it there rather than
   * being sent back to the tab bar.
   */
  onOpenListening?: () => void;
  onOpenWriting?: () => void;
  onOpenCoach?: () => void;
}

/**
 * Journey Home.
 *
 * One question: *what do I do today?* — answered once, by the deterministic
 * mission selector, and rendered as one mission with one action. The status line,
 * the chapter segments and the "why today" line all come from recorded evidence,
 * so a learner can tell at a glance where they are without the screen asserting
 * anything the app has not measured.
 */
export const JourneyHomeScreen: React.FC<JourneyHomeScreenProps> = ({
  onOpenGrammar,
  onStartMission,
  onOpenReview,
  onOpenSubscription,
  onOpenLibrary,
  onOpenOnboarding,
  onOpenListening,
  onOpenWriting,
  onOpenCoach,
}) => {
  const isOnline = useOnlineStatus();
  /**
   * The UI language this screen is written in.
   *
   * Every sentence on this screen goes through `t`, and every count through one
   * of the two helpers below — Arabic needs its four agreement forms, English a
   * singular/plural switch and Indonesian no inflection at all, and a template
   * cannot produce Arabic's. The chapter title and Katzu's line are built in
   * `lib/journey/context`, which takes the same language.
   */
  const { t, uiLanguage } = useLanguage();
  const reviewItemsLabel = (count: number) =>
    uiLanguage === 'ar' ? arCount(count, REVIEW_ITEM_BARE) : `${count} ${uiLanguage === 'en' && count !== 1 ? 'items' : 'item'}`;
  /** The banner's own phrase: the noun alone in Arabic, as it shipped. */
  const reviewNounLabel = (count: number) =>
    uiLanguage === 'ar' ? arNoun(count, REVIEW_ITEM_BARE) : `${count} ${uiLanguage === 'en' && count !== 1 ? 'items' : 'item'}`;
  const minutesLabel = (count: number) =>
    uiLanguage === 'ar' ? arCount(count, MINUTE_NOM) : `${count} ${uiLanguage === 'id' ? 'menit' : 'min'}`;
  /** The «المزيد» sheet. Never auto-opens: a sheet that opens itself is a wall. */
  const [moreOpen, setMoreOpen] = useState(false);
  /**
   * Which banner source finished loading.
   *
   * Storing the src (not a boolean) is what makes a mission change honest: the
   * hero fades the new picture in on its own load instead of inheriting the
   * previous one's opacity, and a source that never arrives leaves the reserved
   * box showing the scene's light.
   */
  const [loadedArt, setLoadedArt] = useState<string | null>(null);

  const user = useLiveQuery(() => db.users.get('current_user'));
  // The three daily tasks (V28 Stage 3). One read for the card and the streak;
  // it observes `daily_tasks` and `review_items`, so a completed task or a new
  // due item refreshes it without a manual re-render.
  const dailyTasks = useLiveQuery(() => readDailyTasks());
  // One bounded read for the whole screen (B4a): eight full-table toArray()s
  // became one transactional live query whose result is projected to exactly the
  // fields the derivations read. Identity-preserving — see journeyHomeData.ts.
  const data = useLiveQuery(readJourneyHomeData);
  /**
   * The guided home (`guidedHome`, owner decision 2026-10-22).
   *
   * On, this screen answers one question — what do I do now? — with the hero,
   * the chapter's path and, once one conversation has finished, the three daily
   * tasks. Step 7 sets the order (`lib/journey/reveal`): the habit panel appears
   * with the first finished session, the review obligation on day 2, and the
   * progress facts after three sessions — so day 0 holds one action and nothing
   * that describes a history the learner has not made yet. The six blocks that
   * describe
   * something *later* (the preferences nag, Katzu's line, the chapter-goal card,
   * the weekly recap, the footer links, and the Pro chip in the header) are not
   * rendered at all rather than pushed below the fold: a block a learner has to
   * scroll past still competes, and this screen's whole problem was that it
   * competed with itself. Nothing is deleted — the same JSX renders with the
   * flag off, which is what keeps "off" honest.
   *
   * `firstSessionDone` gates two more things: the review row, and the Pro offer.
   * Review is the one secondary surface that is an obligation rather than a
   * tour, so it appears as soon as the learner has finished something real — and
   * never on day 0. Pro is the same rule `lib/entitlement/trial` already states
   * for every surface ("after a real episode, never before it"), which the header
   * chip used to break on this screen: a brand-new learner was shown it before
   * their first conversation. It now lives in the sheet, behind that gate.
   *
   * Nothing is lost by the trim: the six blocks are in «المزيد» (one quiet entry
   * point under the tasks), not deleted, and the flag-off branch below still
   * renders the screen that shipped before this one.
   */
  const guided = isGuidedHomeEnabled();
  /**
   * A session row is only written by a conversation that actually finished (see
   * `useLiveConversation`), so one row IS one completed episode — which is the
   * rule `shouldOfferPro` and the review row both need, without a second table
   * or a client-side counter that could disagree with the Worker's ledger.
   */
  const completedEpisodes = data?.allSessions.length ?? 0;
  /**
   * The shared first-session fact.
   *
   * The same function the Practice tab's lock reads (`lib/journey/firstSession`),
   * because the two must not be able to disagree: if this screen said "done"
   * while the tab said "locked", the learner would meet a sheet that explains
   * a lock on a screen that says there is none.
   */
  const firstSessionDone = isFirstSessionDone({
    guided,
    sessionCount: completedEpisodes,
    user,
  });
  const scenarios = data?.scenarios ?? [];
  const training = data?.training ?? [];
  const reviewItems = data?.reviewItems ?? [];
  const skillPractice = data?.skillPractice ?? [];
  const scenarioLevels = data?.scenarioLevels ?? {};
  // A4's weekly recap, from the same single read the screen already does. The
  // projection stays lean and carries scenario IDS, so the titles the recap
  // shows are resolved from the scenario list this screen already has.
  const weeklySessions = useMemo(() => {
    const titles = new Map(scenarios.map((scenario) => [scenario.id, scenario.title_ar || scenario.title_de || '']));
    return (data ? Object.values(data.sessionsByScenario).flat() : []).map((session) => ({
      scenarioTitle: titles.get(session.scenarioId) || '',
      durationSeconds: session.durationSeconds,
      timestamp: session.timestamp,
      independentSentences: session.independentSentences,
    }));
  }, [data, scenarios]);
  const weeklyRecap = useMemo(() => buildWeeklyRecap(weeklySessions), [weeklySessions]);
  const capability = useMemo(
    () =>
      buildCapabilityModel({
        scenarios,
        training,
        sessions: data ? Object.values(data.sessionsByScenario).flat() : [],
        mistakes: data ? Object.values(data.mistakesByScenario).flat() : [],
        reviewItems,
      }),
    [data, scenarios, training, reviewItems],
  );

  const learnerLevel: CEFRLevel = user?.cefrLevel || 'A1';
  const isPro = isProEffective(user);
  // B3: computed from the stored date, not from a response — the notice has to
  // survive an offline open, which is exactly when a learner is most likely to
  // be sitting with the app and no way to renew yet.
  const expiryNotice = expiryNoticeAr(user?.subscriptionExpiresAt, isPro);

  /**
   * The level today's episode runs at — not always the learner's own.
   *
   * The trial serves A1, so a free learner measured above it is given an A1
   * mission on purpose: an episode at their measured level would end in the
   * paywall half-way through their first conversation, which is the one wall the
   * product is not allowed to build. Their own level is what Pro unlocks, and
   * the Debrief is where that gets said — after the win, never before it.
   */
  const level = servedLevel(learnerLevel, isPro);
  const dueCount = useMemo(() => countDue(reviewItems, Date.now()), [reviewItems]);

  const independentScenarioIds = useMemo(
    () =>
      Object.entries(capability.byScenario)
        .filter(([, value]) => value.state === 'INDEPENDENT' || value.state === 'RETAINED')
        .map(([scenarioId]) => scenarioId),
    [capability],
  );

  const context = useMemo(
    () =>
      buildJourneyContext({
        scenarios: scenarios.map((scenario) => ({
          id: scenario.id,
          title_de: scenario.title_de,
          title_ar: scenario.title_ar,
          category: scenario.category,
        })),
        training: training.map((record) => ({
          scenarioId: record.scenarioId,
          studiedAt: record.studiedAt,
          quizAttempted: record.quizAttempted,
          lastScore: record.lastScore,
          updatedAt: record.updatedAt,
        })),
        sessions: data ? data.allSessions : [],
        reviewDueCount: dueCount,
        independentScenarioIds,
        goal: user?.primaryGoal,
        arrivalStatus: user?.arrivalStatus,
        level,
      },
      uiLanguage,
    ),
    [scenarios, training, data, dueCount, independentScenarioIds, user?.primaryGoal, user?.arrivalStatus, level, uiLanguage],
  );

  /**
   * Step 7: progressive reveal — the guided home's own order of disclosure.
   *
   * Two facts, both recorded rather than assumed: `context.dayNumber` comes from
   * the first finished session, and the session count is the same ledger the
   * hero and the review row already read. With the flag off both predicates
   * answer "revealed", so the shipped screen is untouched.
   */
  const reviewRevealed = isReviewRevealed({
    guided,
    firstSessionDone,
    dayNumber: context.dayNumber,
  });
  const progressRevealed = isProgressRevealed({
    guided,
    sessionCount: completedEpisodes,
  });

  /**
   * The scenes with a finished conversation.
   *
   * This is the fact that says an episode is *done*, as opposed to begun — and
   * it is needed because the V2 chain ends at the debrief, not at a quiz, so
   * `scenario_training` for a completed scene still reads `quizAttempted: false`.
   * Without passing this, the day-1 hero kept saying «أكمل من حيث توقفت» about the
   * conversation the learner had just finished. Derived from the recorded
   * sessions only; nothing here can claim a session that did not happen.
   */
  const completedScenarioIds = useMemo(
    () => Object.keys(data?.sessionsByScenario ?? {}),
    [data],
  );

  /**
   * The selector's input, built once.
   *
   * `mission` is the plan the app commits to (review first while the review is
   * revealed); `heroMission` is what the hero shows. They differ on purpose: the
   * hero always describes the next scene, and the review — when it is due — is
   * the ghost row under it. Building the input once keeps the two selections
   * from drifting apart.
   */
  const missionInput = useMemo(
    () => ({
      level,
      goal: user?.primaryGoal,
      scenarios: scenarios.map((scenario) => ({
        id: scenario.id,
        title_de: scenario.title_de,
        title_ar: scenario.title_ar,
        category: scenario.category,
      })),
      training: training.map((record) => ({
        scenarioId: record.scenarioId,
        studiedAt: record.studiedAt,
        quizAttempted: record.quizAttempted,
        lastScore: record.lastScore,
        updatedAt: record.updatedAt,
      })),
      // Both corrections are part of the guided home and are gated with it:
      // the flag's promise is that OFF is the screen that shipped, and a
      // learner on the old home keeps its exact mission logic (including the
      // «أكمل» loop, which is only fixed here until the guided shape is
      // validated).
      // Step 7: review is deferred until it is *returning* work — a finished
      // session and a day between it and today (`isReviewRevealed`). With the
      // flag off the predicate is true, so this is the shipped reviewer.
      reviewItems:
        guided && !reviewRevealed
          ? []
          : reviewItems.map((item) => ({ dueAt: item.dueAt, kind: item.kind, scenarioId: item.scenarioId })),
      completedScenarioIds: guided ? completedScenarioIds : [],
      scenarioLevels,
      weakestSkill: weakestMeasuredSkill(
        {
          sessions: data ? Object.values(data.sessionsByScenario).flat() : [],
          practice: skillPractice,
        },
        uiLanguage,
      ),
      dailyMinutes: user?.dailyGoalMinutes,
      // B6: the learner's own date, as a second fact about today. It never
      // changes WHICH mission is chosen.
      targetDate: user?.targetDate,
      targetDateKind: user?.targetDateKind,
    }),
    [level, user?.primaryGoal, user?.dailyGoalMinutes, user?.targetDate, user?.targetDateKind, data, scenarios, training, reviewItems, scenarioLevels, skillPractice, reviewRevealed, completedScenarioIds, guided, uiLanguage],
  );

  const mission = useMemo(() => selectDailyMission(missionInput), [missionInput]);

  /**
   * The hero's scene.
   *
   * The owner's fix (2026-11-20): the hero shows the next scene even on a review
   * day. Review wins `selectDailyMission` because ignoring it decays memory, but
   * it is one row under the hero — never the hero itself. So the hero's plan is
   * selected with no due items to consider; with the flag off it is the shipped
   * mission, unchanged.
   */
  const heroMission = useMemo(
    () => (guided ? selectDailyMission({ ...missionInput, reviewItems: [] }) : mission),
    [guided, mission, missionInput],
  );


  const missionScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === heroMission.scenarioId) || null,
    [scenarios, heroMission.scenarioId],
  );

  const scene = useMemo(
    () =>
      sceneFor(
        missionScenario
          ? {
              id: missionScenario.id,
              category: missionScenario.category,
              bannerUrl: missionScenario.banner_url,
            }
          : undefined,
      ),
    [missionScenario],
  );

  const reasonAr = missionReasonAr(
    heroMission,
    { goal: user?.primaryGoal, arrivalStatus: user?.arrivalStatus },
    missionScenario,
    uiLanguage,
  );

  // A mission whose content is cached works offline; that is what the indicator
  // is allowed to claim. It never claims the AI conversation will work offline.
  const cachedMission = !!missionScenario && dueCount === 0 && mission.kind !== 'no_content' && mission.kind !== 'review';
  const katzuLineAr = katzuJourneyLineAr({ context, plan: mission, offline: !isOnline, cachedMission }, uiLanguage);
  const katzuState = context.isFirstRun
    ? 'journey'
    : mission.kind === 'review'
      ? 'review_due'
      : context.isAllCaughtUp
        ? 'all_caught_up'
        : !isOnline
          ? 'blocked'
          : 'journey';

  // The most recent genuinely earned capability — the only thing allowed to wear
  // magenta on this screen. Absent until the app has recorded one.
  const latestCapability = useMemo(() => {
    const entries = Object.entries(capability.byScenario)
      .filter(([, value]) => value.state === 'INDEPENDENT' || value.state === 'RETAINED')
      .sort((a, b) => (b[1].lastActivityAt || 0) - (a[1].lastActivityAt || 0));
    const first = entries[0];
    if (!first) return null;
    const scenario = scenarios.find((entry) => entry.id === first[0]);
    if (!scenario) return null;
    return { titleAr: scenario.title_ar, labelAr: capabilityLabel(first[1].state, uiLanguage) };
  }, [capability, scenarios, uiLanguage]);

  const totalMinutes = heroMission.estimatedMinutes || user?.dailyGoalMinutes || 10;

  /**
   * The banner's one label.
   *
   * Guided: always the next scene. The opening episode keeps its own words
   * («لحظة الوصول · أول موقف في القصة») because it is not a scene in the
   * rotation, and `e2e/journey.spec.ts` pins that the first thing a new learner
   * reads names where they are landing. With the flag off the shipped labels
   * stay, including the review mission's own.
   */
  const heroLabelAr =
    heroMission.scenarioId === INTRO_SCENARIO_ID
      ? missionTitleBadge(heroMission.kind, t, dueCount, reviewNounLabel, heroMission.scenarioId)
      : !guided && mission.kind === 'review'
        ? t('home.badge.reviewQuick')
        : t('home.badge.nextScene');

  /**
   * What the review row promises, in the learner's units.
   *
   * Capped: ten items and three minutes. The queue can hold three figures, and a
   * number that size is a backlog, not a plan a learner can say yes to in one
   * tap. The full count is on the review screen, where it is the screen's
   * subject. The estimate is the same arithmetic the review screen uses for its
   * own session length.
   */
  const reviewRowCount = Math.min(dueCount, 10);
  const reviewRowMinutes = Math.min(3, Math.max(1, Math.round(reviewRowCount * 0.3)));

  /**
   * Where «المزيد» lives.
   *
   * The tasks card only renders after the first finished conversation (and
   * always with the flag off), so the entry row is the card's last row while the
   * card exists and one quiet standalone row when it does not. Exactly one, so
   * the sheet has a door on every version of the screen — a hidden card must not
   * hide the only way to the library, preferences and Pro.
   */
  const showTasksCard = !guided || firstSessionDone;
  const moreInTasksCard = showTasksCard && !!dailyTasks;

  /**
   * There is no gate here, on purpose.
   *
   * Today's mission is always startable — on the first run and on the
   * hundredth, at whatever level `servedLevel` says the trial will serve. The trial limit lives in the Worker, which is
   * the only thing that knows how many conversations are left, and the Pro offer
   * is made on the Debrief after a finished episode (see `lib/entitlement/trial`).
   * A wall before the learner has seen what the product does is the one paywall
   * that cannot be defended.
   */
  const handlePrimary = () => {
    if (!heroMission.scenarioId) return;
    track('scenario_started', { scenarioId: heroMission.scenarioId, source: 'journey_home' });
    onStartMission(heroMission.scenarioId);
  };

  /**
   * The daily-task actions.
   *
   * The scenario task reuses today's mission scenario so tapping it starts one
   * real conversation rather than a second, different route to nowhere; when
   * there is no scenario (empty cache) it falls back to the library instead of a
   * dead button. Grammar and review map to their existing screens.
   */
  const handleDailyTaskAction = (kind: DailyTaskKind) => {
    if (kind === 'scenario') {
      if (heroMission.scenarioId) {
        track('scenario_started', { scenarioId: heroMission.scenarioId, source: 'daily_task' });
        onStartMission(heroMission.scenarioId);
      } else {
        onOpenLibrary();
      }
      return;
    }
    if (kind === 'grammar') {
      (onOpenGrammar ?? onOpenLibrary)();
      return;
    }
    onOpenReview();
  };

  /**
   * What «المزيد» lists under «المراجعة»: due items, once review has been
   * revealed — and never while the hero already offers it.
   *
   * With the flag on, the hero never offers review any more: it is always the
   * next scene, and review is the ghost row under it. So the guided sheet may
   * list review whenever the backlog is real. With the flag off the hero can
   * *be* the review, and the shipped rule stands: the sheet yields to it.
   */
  const sheetReviewEntryCount = sheetReviewCount({
    dueCount,
    missionIsReview: !guided && mission.kind === 'review',
    reviewRevealed,
  });
  /** The Pro offer, on the one rule every surface shares (`trial.shouldOfferPro`). */
  const proOfferVisible = shouldOfferPro({ isPro, completedEpisodes });
  /**
   * Never answered the two preferences questions — the row says so instead of
   * dressing a first-run edit as a settings page.
   *
   * `primaryGoal` is part of the test because «تخطَّ الأسئلة» writes the default
   * minutes and the completion stamp while deliberately leaving the goal
   * unanswered. A stamp alone would let the sheet say «تفضيلاتي» to a learner who
   * never told the app why they are here; the mission still works (it falls back
   * to the general order), but the row should offer to finish the question.
   */
  const preferencesIncomplete = !user?.onboardingCompletedAt || !user?.primaryGoal;

  return (
    <div className="kz-tab-scroll min-h-screen bg-kz-black px-5 pt-5">
      <div className="mx-auto max-w-md">
        {/* Orientation: where am I, and how far into this chapter. The chapter's
            steps used to live in a card at the bottom of the screen, under three
            sections of history; the same fact as one thin bar sits under the
            title, which is where a learner reads first. */}
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="kz-ar-micro text-kz-inkDim">
                {t('home.dayChapter', {
                  day: context.dayNumber,
                  index: context.chapterIndex,
                  count: context.chapterCount,
                })}
              </p>
              {/* V35: this heading used to `truncate`, so a chapter title longer than the
                  header clipped its own meaning with no way to read it. Two lines
                  cost nothing here and the title is the one thing this screen
                  states. */}
              <h1 className="kz-ar-title mt-0.5 text-balance text-kz-ink">{context.chapterTitle}</h1>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <StatusIndicator state={isOnline ? 'online' : 'offline'} compact />
              {!guided && !isPro && (
                <GlassButton variant="quiet" onClick={onOpenSubscription} className="min-h-touch px-3 text-micro">
                  <Sparkles className="h-3 w-3" />
                  Katzu Pro
                </GlassButton>
              )}
            </div>
          </div>
          {/* The chapter's own three steps, as one thin bar: segments, never a
              percentage, and the count beside it in muted ink. No `labelAr`: the
              strip would print the chapter title a second time, one line under
              the heading that already says it. Its accessible name falls back to
              «تقدم الفصل», which is what the bar is. */}
          <div className="mt-2.5 flex items-center gap-3" data-testid="chapter-progress">
            <ProgressStrip
              className="flex-1"
              segments={context.chapterSegments}
              completed={context.chapterSegmentsDone}
              activeIndex={context.activeSegment}
              earned={context.chapterSegmentsDone >= context.chapterSegments}
            />
            <span className="kz-ar-micro shrink-0 text-kz-inkDim">
              <LtrCounter value={context.chapterSegmentsDone} total={context.chapterSegments} />{' '}
              {t('home.scenesWord')}
            </span>
          </div>
        </header>

        {/* Learners whose profile predates onboarding answer once, here, and are
            never redirected mid-task. */}
        {/* Same shared dismissal as the Trail: one X here hides it everywhere. */}
        {!guided && user?.isLoggedIn && !user.onboardingCompletedAt && !user.onboardingPromptDismissedAt && onOpenOnboarding && (
          <div className="relative mb-4">
            <GlassButton variant="secondary" fullWidth onClick={onOpenOnboarding} className="justify-between">
              <span className="flex flex-col items-start text-start">
                <span className="kz-ar-caption text-kz-ink">{t('home.preferencesTitle')}</span>
                <span className="kz-ar-micro font-normal text-kz-inkFaint">
                  {t('home.preferencesBody')}
                </span>
              </span>
              <ArrowLeft className="h-4 w-4 shrink-0" />
            </GlassButton>
            <button
              onClick={() => void db.users.update('current_user', { onboardingPromptDismissedAt: Date.now() })}
              aria-label={t('home.dismissBanner')}
              // 44px, not the 26px the icon asked for: an icon-only control is
              // still a control, and `e2e/accessibility.spec.ts` measures the box.
              // Same idiom as Modal's and BottomSheet's close buttons.
              className="absolute top-1.5 end-1.5 flex min-h-touch min-w-touch items-center justify-center rounded-full text-kz-inkFaint pointer-hover:bg-kz-black/10"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}

        {/* The mission. One photograph carries the scene, its words sit on the
            lower third of that photograph, and the single action sits under them
            — the same anatomy as the practice home's next-scene hero, so the two
            tabs describe "what next" the same way. The hero is always the next
            scene: review, when it is due, is the ghost row below. */}
        <BorderBeam role="ambient" className="mb-6">
        <GlassCard
          tier="glass"
          emphasis="none"
          padded={false}
          className="overflow-hidden rounded-panel"
        >
          {/* 140px, reserved before the image arrives: the box keeps its height
              whether the artwork loads, fails, or does not exist, so nothing under
              it moves while the learner is reading. With no source the same box is
              the scene's own light (a violet→black wash plus one accent glow)
              rather than an empty black frame. `loadedArt` compares against the
              current src, so a new mission fades its own picture in instead of
              inheriting the last one. */}
          <div
            data-testid="journey-hero-banner"
            className="relative h-[140px] w-full overflow-hidden bg-kz-black"
            style={{ '--kz-scene-rgb': scene.keyRgb, '--kz-scene-warmth': String(scene.warmth) } as React.CSSProperties}
          >
            <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-kz-lavender/30 via-kz-black/75 to-kz-black" />
            <div aria-hidden className="kz-hero-glow absolute inset-0" />
            {scene.artUrl && (
              <img
                /* The day's banner, cropped into the hero band rather than framed
                   16:9 (that frame belongs to the scenario's own screen). The
                   content editor's `banner_url` still wins here, because it is
                   what `sceneFor` resolved into `artUrl`. */
                data-testid="scenario-banner"
                src={scene.artUrl}
                alt=""
                loading="lazy"
                decoding="async"
                onLoad={() => setLoadedArt(scene.artUrl ?? null)}
                style={{ transitionDuration: '200ms' }}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
                  loadedArt === scene.artUrl ? 'opacity-100' : 'opacity-0'
                }`}
              />
            )}
            {/* Bottom-to-top wash: the words below are the only thing on the
                picture, so the picture must never be brighter than they are. */}
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-kz-black/85 via-kz-black/35 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4">
              <p className="kz-ar-micro text-kz-inkDim">{heroLabelAr}</p>
              {missionScenario ? (
                <>
                  <h2 className="kz-hero-title mt-1 text-kz-ink">{missionScenario.title_ar}</h2>
                  <GermanText className="mt-0.5 block text-caption text-kz-inkDim">{missionScenario.title_de}</GermanText>
                </>
              ) : (
                <h2 className="kz-hero-title mt-1 text-kz-ink">
                  {!guided && mission.kind === 'review' ? t('home.reviewToday') : t('home.missionPreparing')}
                </h2>
              )}
              <p className="mt-1 text-micro text-kz-inkDim">{minutesLabel(totalMinutes)}</p>
            </div>
          </div>

          <div className="p-4">
            <p className="kz-ar-caption text-kz-inkDim">{reasonAr}</p>
            {/* Said out loud rather than discovered mid-conversation: the episode
                runs at a level the free tier serves, and that is why it is not
                the level the placement measured. */}
            {level !== learnerLevel && (
              <p className="kz-ar-micro mt-1 text-kz-inkFaint">
                {t('home.levelNote', { level })}
              </p>
            )}

            <div className="mt-4">
              {/* B6: the days-left line, only inside the last month of an exam and
                  only beside the mission \u2014 never as a reason to replace it. */}
              {heroMission.countdownAr ? (
                <p data-testid="exam-countdown" className="kz-ar-micro mb-3 text-kz-warm">
                  {heroMission.countdownAr}
                </p>
              ) : null}
              {/* Guided: one fixed, bright action. The owner's rule (2026-11-20)
                  is that the hero's job is "continue the story", so the label does
                  not change per mission and the review never borrows it. The only
                  exception is an honest empty state, whose one action is a refresh.
                  With the flag off the shipped wording and branches stay. */}
              {!guided && mission.kind === 'review' ? (
                <PrimaryAction className="min-h-[52px]" onClick={onOpenReview}>
                  {mission.ctaAr}
                </PrimaryAction>
              ) : heroMission.kind === 'no_content' ? (
                // An honest empty state: one useful action, and a real explanation.
                <PrimaryAction
                  className="min-h-[52px]"
                  onClick={() => void refreshCurriculumCache()}
                  icon={<RefreshCw className="h-4 w-4" />}
                >
                  {heroMission.ctaAr}
                </PrimaryAction>
              ) : (
                <button
                  type="button"
                  data-testid="journey-primary-action"
                  onClick={handlePrimary}
                  className="kz-hero-cta flex w-full items-center justify-center px-5 text-body font-semibold"
                >
                  {guided ? t('home.ctaContinue') : heroMission.ctaAr}
                </button>
              )}
            </div>
          </div>
        </GlassCard>
        </BorderBeam>

        {/* Review, as one ghost row: flat, no fill, one hairline under it — the
            same shape the practice home uses for the same job, so the two screens
            do not disagree about how a secondary destination looks. Hidden when
            nothing is due. The hero is always the next scene, so on a review day
            this row is review's only door on the home screen; its count is capped
            at ten (`reviewRowCount`) and the whole backlog stays on the review
            screen. */}
        {guided && firstSessionDone && reviewRevealed && dueCount > 0 && (
          <button
            type="button"
            data-testid="journey-review-row"
            onClick={onOpenReview}
            className="mb-6 flex min-h-control w-full items-center gap-2.5 border-b border-kz-line px-1 text-start transition-colors duration-fast ease-out pointer-hover:bg-kz-ink/5"
          >
            <Brain className="h-4 w-4 shrink-0 text-kz-lavender" aria-hidden />
            <span className="kz-ar-caption flex-1 text-kz-ink">
              {t('home.reviewRow', {
                items: reviewItemsLabel(reviewRowCount),
                minutes: minutesLabel(reviewRowMinutes),
              })}
            </span>
            <ChevronLeft className="h-4 w-4 shrink-0 text-kz-inkDim" aria-hidden />
          </button>
        )}

        {/* The three daily tasks: one scenario session, one grammar step, one
            review batch. Quiet on purpose — the mission above is still the one
            prominent action; this is the habit underneath it.
            Step 7: the panel is a habit surface, not a first-run one — a
            learner on day 0 is shown the one thing to start, and the three
            checkboxes arrive with their first finished conversation. Flag off
            keeps the shipped screen, where the panel is unconditional. */}
        {showTasksCard && (
          <DailyTasksPanel
            snapshot={dailyTasks}
            onAction={handleDailyTaskAction}
            onMore={guided ? () => setMoreOpen(true) : undefined}
          />
        )}

        {/* The guided home's one secondary entry point when the tasks card is not
            on screen (day 0, or no snapshot yet). Quiet on purpose: a 44px text
            row under the hero, so it is reachable without competing with the
            hero's action (the mistake the old home made six times over). It never
            auto-opens, and it exists only while the flag is on. */}
        {guided && !moreInTasksCard && (
          <button
            type="button"
            data-testid="journey-more"
            aria-haspopup="dialog"
            onClick={() => setMoreOpen(true)}
            className="mb-6 flex min-h-touch w-full items-center justify-start gap-1 rounded-control px-1 text-kz-inkDim transition-colors duration-fast ease-out pointer-hover:bg-kz-ink/5"
          >
            <span className="kz-ar-micro">{t('home.more')}</span>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}

        {/* Katzu's one line. Only rendered when a real state produced it. */}
        {!guided && katzuLineAr && (
          <FloatingControl className="mb-4 flex items-start gap-3 p-3.5">
            <KatzuPresence state={katzuState} size="sm" className="shrink-0" />
            <p className="kz-ar-caption min-w-0 flex-1 pt-1 text-kz-inkDim">{katzuLineAr}</p>
          </FloatingControl>
        )}

        {/* Review-due row: quiet, secondary, and only when something is due.
            When review IS today's mission it is not repeated here — two prominent
            CTAs is how a learner does neither. */}
        {dueCount > 0 && mission.kind !== 'review' && !guided && (
          <GlassButton variant="secondary" fullWidth onClick={onOpenReview} className="mb-4 justify-between">
            <span className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-kz-lavender" />
              <span className="kz-ar-caption text-kz-ink">{t('home.reviewDue', { count: dueCount })}</span>
            </span>
            <ArrowLeft className="h-4 w-4 text-kz-inkFaint" />
          </GlassButton>
        )}

        {/* Earned capability. Magenta appears here and nowhere else on this
            screen, and ONLY when the app recorded a real unaided success — the
            state machine (`buildCapabilityModel`) emits INDEPENDENT/RETAINED
            from recorded sessions alone, so an unearned card cannot render
            here by construction. When nothing is earned yet the card shows the
            chapter's goal instead, so the slot motivates rather than lies. */}
        {!guided && (latestCapability ? (
          <GlassCard tier="canvas" className="mb-4">
            <p className="kz-ar-micro kz-earned-text mb-1">
              {t('home.capabilityEarned', { label: latestCapability.labelAr })}
            </p>
            <p className="kz-ar-caption text-kz-ink">
              {t('home.capabilityLine', { title: latestCapability.titleAr })}
            </p>
          </GlassCard>
        ) : (
          <GlassCard tier="canvas" className="mb-4" data-testid="chapter-goal-card">
            <p className="kz-ar-micro mb-1 text-kz-inkDim">{t('home.chapterGoalTitle')}</p>
            <p className="kz-ar-caption text-kz-ink">{t('home.chapterGoalBody')}</p>
          </GlassCard>
        ))}

        {/* The chapter's progress moved into the header, under the title it
            describes: the same fact, read first instead of last. Nothing is lost
            — the segments, their count and the chapter's name are one row now. */}

        {/* B3: the last week of a paid month, said once, where the learner already
            is every day. Nothing said it before: the first news that a
            subscription had ended was the level chip dropping to A1 mid-episode.
            It reads the date the row already holds (refreshed on every open by
            B2), so it works offline and costs no request.
            Step 7 leaves it out of the three-session reveal on purpose: the
            notice exists only when the date itself is actionable, which is the
            plan's own exception ("or when the underlying fact is actionable"). */}
        {expiryNotice && (
          <GlassCard tier="canvas" className="mb-4" data-testid="pro-expiry-card">
            <p className="kz-ar-caption text-kz-ink">{expiryNotice}</p>
            {onOpenSubscription && (
              <GlassButton
                variant="secondary"
                className="mt-2 min-h-touch rounded-chip px-4 text-micro"
                onClick={onOpenSubscription}
              >
                {t('home.renew')}
              </GlassButton>
            )}
          </GlassCard>
        )}

        {/* A4: the week in one honest line. Rendered only when the week actually
            has something in it — the home screen is where the learner is told
            what to do next, not where they are told off for last week. */}
        {!guided && weeklyRecap.episodes > 0 && (
          <GlassCard tier="canvas" className="mb-4" data-testid="weekly-recap-card">
            <p className="kz-ar-micro mb-1 text-kz-inkDim">{t('home.weeklyTitle')}</p>
            <p className="kz-ar-caption text-kz-ink">{weeklyRecap.headlineAr}</p>
            {weeklyRecap.topScenarioTitle && (
              <p className="mt-1 kz-ar-micro text-kz-inkFaint">
                {t('home.weeklyTop')}{' '}
                <GermanText className="text-kz-inkDim">{weeklyRecap.topScenarioTitle}</GermanText>
              </p>
            )}
          </GlassCard>
        )}

        {/* Grammar + library + level: three clear secondary chips (44px) — the
            footer row used to read as unstyled links, and the level was a stray
            label instead of the chip it is. */}
        {!guided && (<div className="flex flex-wrap items-center gap-2">
          {onOpenGrammar && (
            <GlassButton variant="secondary" className="min-h-touch rounded-chip px-4 text-micro" onClick={onOpenGrammar}>
              {t('home.grammarChip')}
            </GlassButton>
          )}
          <GlassButton variant="secondary" className="min-h-touch rounded-chip px-4 text-micro" onClick={onOpenLibrary}>
            {t('home.libraryChip')}
          </GlassButton>
          <span
            className="kz-ar-micro inline-flex min-h-touch items-center rounded-chip border border-kz-line bg-kz-ink/5 px-4 text-kz-inkDim"
            data-testid="journey-level-chip"
          >
            {t('home.levelChip', { level: learnerLevel })}
          </span>
        </div>
        )}

        {/* Everything this screen keeps out of the way, one tap away. Rendered
            inside the scrolling container (`fixed` scrim, so it still covers the
            viewport) rather than as a sibling of it: `.kz-tab-scroll` reserves
            its bottom padding on the last child, and a sibling would take that
            space away from the chips above. */}
        {guided && (
          <JourneyMoreSheet
            isOpen={moreOpen}
            onClose={() => setMoreOpen(false)}
            onOpenLibrary={onOpenLibrary}
            onOpenReview={onOpenReview}
            onOpenSubscription={onOpenSubscription}
            onOpenGrammar={onOpenGrammar}
            onOpenListening={onOpenListening}
            onOpenWriting={onOpenWriting}
            onOpenCoach={onOpenCoach}
            onOpenPreferences={onOpenOnboarding}
            reviewDueCount={sheetReviewEntryCount}
            firstSessionDone={firstSessionDone}
            katzuLineAr={katzuLineAr ?? undefined}
            katzuState={katzuState}
            capability={latestCapability}
            progressVisible={progressRevealed}
            recap={
              weeklyRecap.episodes > 0
                ? { headlineAr: weeklyRecap.headlineAr, topScenarioTitle: weeklyRecap.topScenarioTitle ?? undefined }
                : null
            }
            learnerLevel={learnerLevel}
            isPro={isPro}
            freeSessionsRemaining={user?.freeSessionsRemaining}
            proOfferVisible={proOfferVisible}
            preferencesIncomplete={preferencesIncomplete}
          />
        )}
      </div>

    </div>
  );
};

/**
 * The hero banner's one label.
 *
 * Takes the translator and the already-formatted item phrase rather than a
 * count: Arabic needs `arCount` for «3 عناصر», and a function that formatted it
 * itself would have to know which language it was writing in.
 */
function missionTitleBadge(
  kind: string,
  t: (key: UiStringKey, vars?: Record<string, string | number>) => string,
  dueCount: number,
  itemsLabel: (count: number) => string,
  scenarioId?: string,
): string {
  // The one episode that is not "today's situation": the story's first scene.
  if (scenarioId === INTRO_SCENARIO_ID) return t('home.badge.arrival');
  switch (kind) {
    case 'review':
      return t('home.badge.review', { items: itemsLabel(dueCount) });
    case 'continue':
      return t('home.badge.continue');
    case 'weak_skill':
      return t('home.badge.weakSkill');
    case 'daily':
      return t('home.badge.daily');
    case 'new':
      return t('home.badge.new');
    default:
      return t('home.badge.waiting');
  }
}
