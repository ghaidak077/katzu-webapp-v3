import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { GlassCard, FloatingControl } from '@/components/glass/GlassCard';
import { GlassButton, PrimaryAction } from '@/components/glass/GlassButton';
import { GlassWell } from '@/components/glass/GlassSurface';
import { GermanText } from '@/components/common/GermanText';
import { KatzuPresence, type KatzuState } from '@/components/v2/KatzuPresence';
import { Modal } from '@/components/ui/Modal';
import { Flame, Share2, Sparkles, ArrowLeft, ChevronDown, Lock } from 'lucide-react';
import { buildSkillSummary, type Skill } from '@/lib/skills/summary';
import { buildCapabilityModel, capabilityLabel } from '@/lib/capability/model';
import { buildMistakeProfile } from '@/lib/coach/profile';
import { categoryLabel } from '@/lib/coach/taxonomy';
import { countDue } from '@/lib/srs/engine';
import { buildGrammarEntries, buildVocabularyEntries } from '@/lib/progress/collections';
import { buildShareCard, buildShareText, isShareTextSafe } from '@/lib/share/card';
import { publicAppUrl } from '@/lib/utils/links';
import { arCount } from '@/lib/i18n/arabicCount';
import { REVIEW_ITEM_ACCUSATIVE } from '@/lib/i18n/countForms';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { UI_LANGUAGE_META, type UiLanguage } from '@/lib/i18n/languages';
import type { UiStringKey } from '@/lib/i18n/strings';
import { scenarioTitle } from '@/lib/content/titles';

import type { SessionEntity } from '@/types/models';

/** A weekday's short name in the UI language, so the habit grid reads natively. */
function weekdayLabel(date: Date, language: UiLanguage): string {
  return new Intl.DateTimeFormat(UI_LANGUAGE_META[language].bcp47, { weekday: 'short' }).format(date);
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export function getLastSevenDays(referenceDate = new Date(), language: UiLanguage = 'ar') {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(referenceDate);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return {
      dateKey: toDateKey(date),
      label: weekdayLabel(date, language),
    };
  });
}

export function getActivityDateKeys(sessions: Array<Pick<SessionEntity, 'timestamp'>>) {
  return new Set(
    sessions.map(({ timestamp }) => {
      const date = new Date(timestamp);
      return toDateKey(date);
    }),
  );
}

const SKILL_LABEL_KEY: Record<Skill, UiStringKey> = {
  speaking: 'progress.skill.speaking',
  listening: 'progress.skill.listening',
  writing: 'progress.skill.writing',
  reading: 'progress.skill.reading',
};

/**
 * The skills Progress lists. Reading has no practice surface, so it is withheld
 * rather than advertised as «قريباً»: a promise with nothing behind it is the
 * dead end this list must not ship (S1.2). Add `'reading'` here when it exists.
 */
const PROGRESS_SKILLS: readonly Skill[] = ['speaking', 'listening', 'writing'];

/** How many rows of each list are visible before the learner asks for more. */
const LIST_PREVIEW = 6;

export interface ProgressScreenProps {
  /** Opens the scenario a capability or a list row came from. */
  onOpenScenario?: (scenarioId: string) => void;
  /** Opens the review queue — the one action this screen can offer. */
  onOpenReview?: () => void;
}

/**
 * The record of what the learner can now do.
 *
 * The order is the whole design: capability first, then the measured evidence
 * behind it (skills, review, open mistakes), then the two lists that make the
 * claim checkable — every word and rule carries the state the review engine
 * recorded for it and the scenario it came from. Habit stats (streak, activity)
 * sit at the bottom, because a streak is a fact about the learner's calendar, not
 * about their German, and it must never be the first thing they read.
 *
 * Nothing on this screen is a number the learner cannot point at: there is no
 * total-sentences tile, no invented score, and an unmeasured skill says so.
 */
export const ProgressScreen: React.FC<ProgressScreenProps> = ({ onOpenScenario, onOpenReview }) => {
  const { t, uiLanguage } = useLanguage();
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [showAllVocabulary, setShowAllVocabulary] = useState(false);
  const [showAllGrammar, setShowAllGrammar] = useState(false);

  const user = useLiveQuery(() => db.users.get('current_user'));
  const sessionsQuery = useLiveQuery(() => db.sessions.toArray());
  const sessions = sessionsQuery ?? [];
  const practiceQuery = useLiveQuery(() => db.skill_practice.toArray());
  const scenariosQuery = useLiveQuery(() => db.scenarios.toArray());
  const trainingQuery = useLiveQuery(() => db.scenario_training.toArray());
  const mistakesQuery = useLiveQuery(() => db.mistakes.toArray());
  const reviewQuery = useLiveQuery(() => db.review_items.toArray());
  const vocabularyQuery = useLiveQuery(() => db.vocabulary.toArray());
  const grammarQuery = useLiveQuery(() => db.grammar.toArray());
  const savedWordsQuery = useLiveQuery(() => db.saved_words.toArray());

  const capability = useMemo(
    () =>
      buildCapabilityModel({
        scenarios: scenariosQuery ?? [],
        training: trainingQuery ?? [],
        sessions,
        mistakes: mistakesQuery ?? [],
        reviewItems: reviewQuery ?? [],
      }, uiLanguage),
    [scenariosQuery, trainingQuery, sessions, mistakesQuery, reviewQuery, uiLanguage],
  );

  const mistakeProfile = useMemo(
    () => buildMistakeProfile(mistakesQuery ?? [], uiLanguage),
    [mistakesQuery, uiLanguage],
  );

  const dueCount = useMemo(() => countDue(reviewQuery ?? [], Date.now()), [reviewQuery]);

  // The queue's size as the call to action says it, in the reader's own grammar.
  const dueCountLabel =
    uiLanguage === 'ar'
      ? arCount(dueCount, REVIEW_ITEM_ACCUSATIVE)
      : `${dueCount} ${t(dueCount === 1 ? 'progress.reviewUnitOne' : 'progress.reviewUnitMany')}`;

  const skillSummary = useMemo(
    () => buildSkillSummary({ sessions, practice: practiceQuery ?? [] }),
    [sessions, practiceQuery],
  );

  const vocabularyEntries = useMemo(
    () =>
      buildVocabularyEntries({
        vocabulary: vocabularyQuery ?? [],
        reviewItems: reviewQuery ?? [],
        savedWords: savedWordsQuery ?? [],
        scenarios: scenariosQuery ?? [],
      }, uiLanguage),
    [vocabularyQuery, reviewQuery, savedWordsQuery, scenariosQuery, uiLanguage],
  );

  const grammarEntries = useMemo(
    () =>
      buildGrammarEntries({
        grammar: grammarQuery ?? [],
        mistakes: mistakesQuery ?? [],
        scenarios: scenariosQuery ?? [],
      }, uiLanguage),
    [grammarQuery, mistakesQuery, scenariosQuery, uiLanguage],
  );

  /** Scenarios with recorded work that is not yet independent — the real "next". */
  const practising = useMemo(
    () =>
      Object.values(capability.byScenario)
        .filter((entry) => entry.state === 'PRACTISING' || entry.state === 'INTRODUCED')
        .sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0))
        .slice(0, 3)
        .map((entry) => ({
          ...entry,
          scenario: (scenariosQuery ?? []).find((scenario) => scenario.id === entry.scenarioId),
        })),
    [capability.byScenario, scenariosQuery],
  );

  const activityDateKeys = useMemo(() => getActivityDateKeys(sessions), [sessions]);
  const days = useMemo(() => getLastSevenDays(new Date(), uiLanguage), [uiLanguage]);
  const hasProgress = sessions.length > 0;
  const streakDays = hasProgress ? user?.streakDays ?? 0 : 0;

  const bestCapability = capability.canDo[0] || null;
  const katzuState: KatzuState = capability.canDo.length > 0 ? 'independent' : hasProgress ? 'assisted' : 'journey';
  const shareCard = useMemo(
    () =>
      buildShareCard({
        displayName: user?.displayName,
        capabilityState: bestCapability?.state ?? 'NOT_STARTED',
        scenarioTitleAr: bestCapability?.titleAr ?? null,
        independentAccuracy: bestCapability
          ? capability.byScenario[bestCapability.scenarioId]?.bestIndependentAccuracy ?? null
          : null,
        streakDays,
        appUrl: publicAppUrl() || undefined,
        language: uiLanguage,
      }),
    [user?.displayName, bestCapability, capability.byScenario, streakDays, uiLanguage],
  );

  const handleShare = async () => {
    if (!shareCard) return;
    const text = buildShareText(shareCard);
    // The card is validated before it can leave the device (no email, no level
    // claim, no transcript-length body).
    if (!isShareTextSafe(text)) {
      setShareStatus(t('progress.shareFailed'));
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: t('progress.shareNativeTitle'), text, url: shareCard.url });
        return;
      }
    } catch {
      // The learner dismissed the native sheet — not an error worth showing.
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareStatus(t('progress.shareCopied'));
    } catch {
      setShareStatus(t('progress.shareCopyFailed'));
    }
  };

  const visibleVocabulary = showAllVocabulary ? vocabularyEntries : vocabularyEntries.slice(0, LIST_PREVIEW);
  const visibleGrammar = showAllGrammar ? grammarEntries : grammarEntries.slice(0, LIST_PREVIEW);

  const openScenario = (scenarioId?: string) => {
    if (scenarioId && onOpenScenario) onOpenScenario(scenarioId);
  };

  return (
    <div className="min-h-screen bg-kz-black pb-28 text-kz-ink">
      <div className="mx-auto max-w-md px-4 pt-6">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="kz-ar-title text-kz-ink">{t('progress.title')}</h1>
            <p className="mt-1 kz-ar-micro leading-relaxed text-kz-inkDim">
              {t('progress.subtitle')}
            </p>
          </div>
          <KatzuPresence state={katzuState} size="sm" className="shrink-0" />
        </header>

        {/* 1. Capability: the claim, each one traceable to the scene it came from. */}
        <GlassCard
          className="mt-5"
          emphasis={capability.canDo.length > 0 ? 'earned' : 'none'}
        >
          {capability.canDo.length > 0 ? (
            <ul className="space-y-3">
              {capability.canDo.slice(0, 3).map((item) => (
                <li key={item.scenarioId}>
                  {onOpenScenario ? (
                    <button
                      type="button"
                      onClick={() => openScenario(item.scenarioId)}
                      className="w-full rounded-2xl border border-white/[0.06] p-3 text-start transition-colors pointer-hover:bg-white/[0.03]"
                    >
                      <CapabilityRow
                        statementAr={item.statementAr}
                        labelAr={capabilityLabel(item.state, uiLanguage)}
                        earned
                      />
                    </button>
                  ) : (
                    <div className="p-1">
                      <CapabilityRow
                        statementAr={item.statementAr}
                        labelAr={capabilityLabel(item.state, uiLanguage)}
                        earned
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div>
              <p className="kz-ar-body leading-relaxed text-kz-ink">
                {hasProgress
                  ? t('progress.notYetIndependent')
                  : t('progress.notStarted')}
              </p>
              {practising.length > 0 && (
                <p className="mt-2 kz-ar-micro text-kz-inkDim">
                  {t('progress.practisingCount', { count: capability.practisingCount })}
                </p>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3 text-center">
            <GlassWell className="p-2.5">
              <div className="font-german text-base font-bold text-kz-neon">{capability.independentCount}</div>
              <span className="kz-ar-micro text-kz-inkDim">{t('progress.independentScenes')}</span>
            </GlassWell>
            <GlassWell className="p-2.5">
              <div className="font-german text-base font-bold text-kz-lavender">{dueCount}</div>
              <span className="kz-ar-micro text-kz-inkDim">{t('progress.reviewsDue')}</span>
            </GlassWell>
            <GlassWell className="p-2.5">
              <div className="font-german text-base font-bold text-kz-warm">{mistakeProfile.open}</div>
              <span className="kz-ar-micro text-kz-inkDim">{t('progress.openMistakes')}</span>
            </GlassWell>
          </div>

          {mistakeProfile.hasEnoughEvidence && mistakeProfile.top.length > 0 && (
            <p className="mt-3 kz-ar-micro leading-relaxed text-kz-inkDim">
              {t('progress.topPatterns', {
                categories: mistakeProfile.top
                  .map((stat) => categoryLabel(stat.category, uiLanguage))
                  .join(' · '),
              })}
            </p>
          )}
        </GlassCard>

        {/* 2. The work in progress — unfinished is a state, not a failure. */}
        {practising.length > 0 && (
          <section className="mt-4">
            <h2 className="kz-ar-caption text-kz-inkDim">{t('progress.inTraining')}</h2>
            <ul className="mt-2 space-y-2">
              {practising.map((entry) => (
                <li key={entry.scenarioId}>
                  <GlassWell className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="kz-ar-caption truncate text-kz-ink">
                        {entry.scenario ? scenarioTitle(entry.scenario, uiLanguage) : entry.scenarioId}
                      </p>
                      <p className="mt-0.5 kz-ar-micro text-kz-inkFaint">
                        {capabilityLabel(entry.state, uiLanguage)}
                        {entry.openMistakes > 0
                          ? t('progress.openMistakesInline', { count: entry.openMistakes })
                          : ''}
                      </p>
                    </div>
                    {onOpenScenario && (
                      <GlassButton
                        variant="secondary"
                        className="shrink-0"
                        onClick={() => openScenario(entry.scenarioId)}
                      >
                        {t('progress.continuePractice')}
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                      </GlassButton>
                    )}
                  </GlassWell>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 3. Skills: measured or honestly unmeasured, never zeroed. */}
        <GlassCard className="mt-4">
          <h2 className="kz-ar-caption text-kz-inkDim">{t('progress.skills')}</h2>
          <p className="mt-1 kz-ar-micro text-kz-inkFaint">{t('progress.skillsNote')}</p>
          <ul className="mt-3 space-y-2.5">
            {skillSummary.stats.filter((stat) => PROGRESS_SKILLS.includes(stat.skill)).map((stat) => (
              <li key={stat.skill} className="flex items-center justify-between gap-3">
                <span className="kz-ar-caption text-kz-ink">{t(SKILL_LABEL_KEY[stat.skill])}</span>
                {stat.score === null ? (
                  <span className="kz-ar-micro text-kz-inkFaint">{t('progress.unmeasured')}</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="kz-ar-micro text-kz-inkFaint">
                      {t('progress.attempts', { count: stat.attempts })}
                    </span>
                    <span className="font-german text-sm font-bold text-kz-lavender">{stat.score}%</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </GlassCard>

        {/* 4. Vocabulary: the state the review engine recorded, and where it came from. */}
        <GlassCard className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="kz-ar-caption text-kz-inkDim">{t('progress.vocabulary')}</h2>
            <span className="kz-ar-micro text-kz-inkFaint">
              {t('progress.inReview', {
                count: vocabularyEntries.filter((entry) => entry.state !== 'unseen').length,
              })}
            </span>
          </div>
          {vocabularyEntries.length === 0 ? (
            <p className="mt-2 kz-ar-micro leading-relaxed text-kz-inkFaint">
              {t('progress.vocabularyEmpty')}
            </p>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {visibleVocabulary.map((entry) => (
                  <li key={entry.id}>
                    <GlassWell className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <GermanText className="kz-de-body block text-kz-ink">{entry.de}</GermanText>
                          <p className="mt-0.5 kz-ar-micro text-kz-inkDim">{entry.ar}</p>
                        </div>
                        <span className="shrink-0 font-german text-[0.68rem] text-kz-inkFaint">
                          {entry.level}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 kz-ar-micro">
                        <span
                          className={
                            entry.state === 'retained'
                              ? 'text-kz-neon'
                              : entry.state === 'learning'
                                ? 'text-kz-lavender'
                                : 'text-kz-inkFaint'
                          }
                        >
                          {entry.stateLabelAr}
                        </span>
                        {entry.scenarioTitleAr && (
                          <>
                            <span className="text-kz-inkFaint">·</span>
                            {onOpenScenario && entry.scenarioId ? (
                              <button
                                type="button"
                                onClick={() => openScenario(entry.scenarioId)}
                                className="underline-offset-2 pointer-hover:underline"
                              >
                                {t('progress.fromScenario', { title: entry.scenarioTitleAr })}
                              </button>
                            ) : (
                              <span className="text-kz-inkFaint">{t('progress.fromScenario', { title: entry.scenarioTitleAr })}</span>
                            )}
                          </>
                        )}
                        {entry.isSaved && (
                          <>
                            <span className="text-kz-inkFaint">·</span>
                            <span className="text-kz-lavender">{t('progress.savedByYou')}</span>
                          </>
                        )}
                      </div>
                    </GlassWell>
                  </li>
                ))}
              </ul>
              {vocabularyEntries.length > LIST_PREVIEW && (
                <GlassButton
                  variant="quiet"
                  fullWidth
                  className="mt-2"
                  onClick={() => setShowAllVocabulary((value) => !value)}
                >
                  {showAllVocabulary
                    ? t('progress.showLess')
                    : t('progress.showAll', { count: vocabularyEntries.length })}
                  <ChevronDown className={showAllVocabulary ? 'h-3.5 w-3.5 rotate-180' : 'h-3.5 w-3.5'} aria-hidden />
                </GlassButton>
              )}
            </>
          )}
        </GlassCard>

        {/* 5. Grammar: only the rules this learner has actually met. */}
        <GlassCard className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="kz-ar-caption text-kz-inkDim">{t('progress.grammar')}</h2>
            <span className="kz-ar-micro text-kz-inkFaint">
              {t('progress.patternsSeen', {
                count: grammarEntries.filter((entry) => entry.mistakeCount > 0).length,
              })}
            </span>
          </div>
          {grammarEntries.length === 0 ? (
            <p className="mt-2 kz-ar-micro leading-relaxed text-kz-inkFaint">
              {t('progress.grammarEmpty')}
            </p>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {visibleGrammar.map((entry) => (
                  <li key={entry.id}>
                    <GlassWell className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 kz-ar-caption text-kz-ink">{entry.titleAr}</p>
                        <span className="shrink-0 font-german text-[0.68rem] text-kz-inkFaint">{entry.level}</span>
                      </div>
                      <p className="mt-1 kz-ar-micro leading-relaxed">
                        <span
                          className={
                            entry.state === 'repeating'
                              ? 'text-kz-warm'
                              : entry.state === 'correcting'
                                ? 'text-kz-lavender'
                                : 'text-kz-inkFaint'
                          }
                        >
                          {entry.stateLabelAr}
                        </span>
                        {entry.mistakeCount > 0 && <span className="text-kz-inkFaint"> ({entry.mistakeCount})</span>}
                        {entry.scenarioTitleAr && (
                          <span className="text-kz-inkFaint"> · {t('progress.fromScenario', { title: entry.scenarioTitleAr })}</span>
                        )}
                      </p>
                    </GlassWell>
                  </li>
                ))}
              </ul>
              {grammarEntries.length > LIST_PREVIEW && (
                <GlassButton
                  variant="quiet"
                  fullWidth
                  className="mt-2"
                  onClick={() => setShowAllGrammar((value) => !value)}
                >
                  {showAllGrammar
                    ? t('progress.showLess')
                    : t('progress.showAll', { count: grammarEntries.length })}
                  <ChevronDown className={showAllGrammar ? 'h-3.5 w-3.5 rotate-180' : 'h-3.5 w-3.5'} aria-hidden />
                </GlassButton>
              )}
            </>
          )}
        </GlassCard>

        {/* 6. Habit: real, but it is a fact about the calendar, not about German. */}
        <GlassCard className="mt-4">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-kz-warm" aria-hidden />
            <span className="kz-ar-caption text-kz-ink">
              {streakDays} {streakDays === 1 ? t('progress.streakOne') : t('progress.streakMany')}
            </span>
            <span className="kz-ar-micro text-kz-inkFaint">
              {hasProgress ? t('progress.habitNote') : t('progress.noSessions')}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-2 text-center">
            {days.map(({ dateKey, label }) => {
              const hasActivity = activityDateKeys.has(dateKey);
              return (
                <div key={dateKey} className="flex flex-col items-center gap-1.5">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-xl text-micro font-bold transition-colors ${
                      hasActivity
                        ? 'bg-kz-lavender/20 text-kz-lavender shadow-kz-lavender'
                        : 'border border-white/[0.06] text-kz-inkFaint'
                    }`}
                  >
                    {hasActivity ? '✓' : ''}
                  </div>
                  <span className="kz-ar-micro text-kz-inkFaint">{label.slice(0, 3)}</span>
                </div>
              );
            })}
          </div>
        </GlassCard>

        <GlassButton
          variant="secondary"
          fullWidth
          className="mt-4"
          onClick={() => {
            setShareStatus(null);
            setShowShareModal(true);
          }}
          disabled={!shareCard}
        >
          <Share2 className="h-4 w-4 text-kz-lavender" aria-hidden />
          {t('progress.shareCardButton')}
          {/* Color is never the only signal: a locked card also shows a lock icon,
              so the disabled state is readable without relying on the muted tint. */}
          {!shareCard && <Lock className="h-3.5 w-3.5 text-kz-inkFaint" aria-hidden />}
        </GlassButton>
        {!shareCard && (
          <p className="mt-2 text-center kz-ar-micro text-kz-inkFaint">
            {t('progress.shareLocked')}
          </p>
        )}
      </div>

      {/* Today's next action, always one tap from here. */}
      {dueCount > 0 && onOpenReview && (
        <FloatingControl className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md rounded-t-[26px] border-t border-white/[0.06] p-4 pb-6">
          <PrimaryAction hintAr={t('progress.reviewHint')} onClick={onOpenReview}>
            {t('progress.reviewNow', { count: dueCountLabel })}
          </PrimaryAction>
        </FloatingControl>
      )}

      {/* Share Modal — the card contains only what was recorded (no email, no
          private mistakes, no level claim the app did not measure). */}
      <Modal isOpen={showShareModal} onClose={() => setShowShareModal(false)} title={t('progress.shareModalTitle')}>
        {shareCard && (
          <>
            <GlassCard emphasis="earned" className="text-center">
              <KatzuPresence state="independent" size="lg" />
              <h3 className="mt-3 kz-ar-title text-kz-ink">{shareCard.name}</h3>
              <p className="mt-1 kz-ar-caption text-kz-inkDim">{shareCard.headlineAr}</p>
              <ul className="mt-3 space-y-1.5">
                {shareCard.linesAr.map((line) => (
                  <li key={line} className="kz-ar-caption leading-relaxed text-kz-ink">
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-3 kz-ar-micro text-kz-inkFaint">{shareCard.dateLabel}</p>
              <p className="kz-ar-micro text-kz-lavender">{shareCard.brandAr}</p>
            </GlassCard>

            <GlassButton variant="primary" size="lg" fullWidth className="mt-4" onClick={handleShare}>
              {t('progress.shareNow')}
            </GlassButton>
            {shareStatus && (
              <p role="status" className="mt-2 text-center kz-ar-micro text-kz-inkDim">
                {shareStatus}
              </p>
            )}
            <p className="mt-3 text-center kz-ar-micro leading-relaxed text-kz-inkFaint">
              {t('progress.sharePrivacy')}
            </p>
          </>
        )}
      </Modal>
    </div>
  );
};

/** One "you can now…" line with the capability label it was measured at. */
const CapabilityRow: React.FC<{ statementAr: string; labelAr: string; earned?: boolean }> = ({
  statementAr,
  labelAr,
  earned = false,
}) => (
  <div className="flex items-start gap-2.5">
    <Sparkles
      className={`mt-1 h-4 w-4 shrink-0 ${earned ? 'text-kz-magenta' : 'text-kz-lavender'}`}
      aria-hidden
    />
    <div className="min-w-0">
      <p className="kz-ar-caption leading-relaxed text-kz-ink">{statementAr}</p>
      <p className={`mt-0.5 kz-ar-micro ${earned ? 'kz-earned-text' : 'text-kz-inkFaint'}`}>{labelAr}</p>
    </div>
  </div>
);
