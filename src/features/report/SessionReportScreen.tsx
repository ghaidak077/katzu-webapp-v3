import React, { useCallback, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { sceneFor } from '@/lib/design/scenes';
import { SceneBackdrop } from '@/components/glass/SceneBackdrop';
import { GlassCard, FloatingControl } from '@/components/glass/GlassCard';
import { GlassButton, PrimaryAction } from '@/components/glass/GlassButton';
import { GlassWell } from '@/components/glass/GlassSurface';
import { GermanText } from '@/components/common/GermanText';
import { KatzuPresence, type KatzuState } from '@/components/v2/KatzuPresence';
import { ProgressRail } from '@/components/v2/ProgressStrip';
import { triggerHaptic } from '@/lib/utils/haptics';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { CAPABILITY_LABEL_AR, capabilityFromSession } from '@/lib/capability/model';
import { completedEpisodeCount, shouldOfferPro } from '@/lib/entitlement/trial';
import { isProEffective } from '@/lib/utils/subscription';
import { MASTERED_REPS, gradeCorrectionRetype, reviewRefId } from '@/lib/srs/engine';
import { enrolMistake, gradeReviewItem } from '@/lib/srs/store';
import { CATEGORY_COPY, classifyMistake, type MistakeCategory } from '@/lib/coach/taxonomy';
import type { SessionDebrief } from '@/lib/debrief/debrief';
import { buildExamCard, firstNameOf, MOCK_NOTICE_AR, type ExamCard } from '@/lib/debrief/examCard';
import { useExamShareImage } from '@/lib/debrief/examShareImage';
import { Volume2, Check, TrendingUp, CalendarClock, Sparkles } from 'lucide-react';
import type { CapabilityState, CEFRLevel, MistakeEntity } from '@/types/models';
import {
  getNextPromotionLevel,
  isEligibleForPromotion,
  type PromotionSession,
} from '@/features/report/metrics';

export interface SessionReportScreenProps {
  summary: {
    scenarioId: string;
    scenarioTitle: string;
    cefrLevel: CEFRLevel;
    sentencesSpoken: number;
    accuracyPercent: number | null;
    durationSeconds: number;
    independentSentences: number;
    assistedSentences: number;
    mistakes: Array<{ original: string; corrected: string; grammarRule: string }>;
    debrief: SessionDebrief;
  };
  onReturnToTrail: () => void;
  /** The review screen — offered when this session produced real corrections. */
  onOpenReview?: () => void;
  /** The subscription screen, where the Pro offer (after a win) leads. */
  onOpenSubscription?: () => void;
}

/** One row of the retype drill: either answered, or waiting for the learner. */
type DrillState =
  | { status: 'correct'; mastered: boolean; messageAr: string }
  | { status: 'wrong'; messageAr: string };

/**
 * Katzu's line per outcome, and the pose that goes with it.
 *
 * Deliberately not interchangeable: an assisted session never gets the earned
 * pose or the magenta treatment, and a difficult session gets support instead of
 * a consolation prize. The report's job is to state what happened, in one voice
 * with the Progress screen, using the same thresholds (`capabilityFromSession`).
 */
const OUTCOME: Record<
  CapabilityState,
  { pose: KatzuState; lineAr: string; headlineAr: (title: string) => string }
> = {
  NOT_STARTED: {
    pose: 'incomplete',
    lineAr: 'لم تُسجَّل جملة بعد في هذا المشهد.',
    headlineAr: (title) => `لم نبدأ «${title}» فعلياً بعد.`,
  },
  INTRODUCED: {
    pose: 'incomplete',
    lineAr: 'المحاولة الأولى تكون صعبة دائماً — المهم أنك أنتجت جُملًا بالألمانية.',
    headlineAr: (title) => `تعرّفت على «${title}» وبدأت تنتج جُملك الأولى فيه.`,
  },
  PRACTISING: {
    pose: 'assisted',
    lineAr: 'أكملنا الجلسة بمساعدة تلميحاتي. المرة القادمة سنحتاج تلميحات أقل — هكذا يُبنى التدريب.',
    headlineAr: (title) => `تدرّبت على «${title}» — لم تصبح مستقلاً فيه بعد، وهذا طبيعي في هذه المرحلة.`,
  },
  INDEPENDENT: {
    pose: 'independent',
    lineAr: 'أتممت الموقف بنفسك، بلا تلميحات. هذه هي الحالة التي نريد تكرارها.',
    headlineAr: (title) => `أصبحت قادراً على التعامل مع «${title}» بالألمانية بدون مساعدة.`,
  },
  RETAINED: {
    pose: 'independent',
    lineAr: 'الموقف ثبت في ذاكرتك — نجحت فيه مرة أخرى بعد مراجعة مجدولة.',
    headlineAr: (title) => `«${title}» ثابت في ذاكرتك.`,
  },
};

/**
 * The Debrief.
 *
 * The conversation just ended, so the learner's question is "did that count, and
 * what now?" — answered with the evidence the app actually recorded: how many
 * turns were unaided, what was corrected, and when those corrections come back.
 * Celebration is not rendered here at all; magenta appears only when the session
 * crossed the same independence threshold the Progress screen uses, which is why
 * the two screens can never disagree.
 */
export const SessionReportScreen: React.FC<SessionReportScreenProps> = ({
  summary,
  onReturnToTrail,
  onOpenReview,
  onOpenSubscription,
}) => {
  const user = useLiveQuery(() => db.users.get('current_user'));
  const scenario = useLiveQuery(() => db.scenarios.get(summary.scenarioId));
  const sessions = useLiveQuery(() => db.sessions.toArray()) || [];
  const [drill, setDrill] = useState<Record<number, { text: string; result: DrillState | null }>>({});
  const [isLevelPromoted, setIsLevelPromoted] = useState(false);

  // V24 Phase 5: the mock-exam result card — exam scenarios only, built from
  // the same numbers this screen already shows. No AI call behind it.
  const isExamScenario = scenario?.category === 'exam';
  const examCard: ExamCard | null = useMemo(
    () =>
      isExamScenario
        ? buildExamCard({
            scenarioTitle: summary.scenarioTitle,
            sentencesSpoken: summary.sentencesSpoken,
            independentSentences: summary.independentSentences,
            accuracyPercent: summary.accuracyPercent,
            mistakes: summary.mistakes,
            debrief: summary.debrief,
          })
        : null,
    [isExamScenario, summary],
  );

  const { speak } = useSpeechOutput({ speed: user?.speechSpeed || 1.0 });

  const scene = useMemo(
    () => sceneFor(scenario ? { id: scenario.id, category: scenario.category } : { id: summary.scenarioId }),
    [scenario, summary.scenarioId],
  );

  /**
   * One retyped correction is practice, not mastery.
   *
   * The old version wrote `isMastered` after a single correct retype, while the
   * review engine defines mastery as three consecutive good recalls
   * (`MASTERED_REPS`). Two definitions of the same word is a defect, so this
   * grades through the review store and reports whichever of the two is true.
   */
  const handleValidateRetype = useCallback(
    async (index: number, mistake: { original: string; corrected: string; grammarRule: string }) => {
      const answer = drill[index]?.text || '';
      // The learner may retype the correction as a full sentence, not only the
      // fragment the AI returned; `gradeCorrectionRetype` accepts either.
      const verdict = gradeCorrectionRetype(mistake.corrected, answer);

      if (verdict !== 'correct') {
        triggerHaptic('error');
        setDrill((prev) => ({
          ...prev,
          [index]: { ...prev[index], result: { status: 'wrong', messageAr: 'ليست الصيغة الصحيحة بعد — قارنها بالجملة أعلاه ثم أعد الكتابة.' } },
        }));
        return;
      }

      triggerHaptic('success');

      let mastered = false;
      let messageAr = 'صحيحة. ستعود هذه الجملة في مراجعتك المجدولة حتى تُتقنها.';
      try {
        const stored = await db.mistakes
          .where('scenarioId')
          .equals(summary.scenarioId)
          .and((m) => m.corrected === mistake.corrected || m.original === mistake.original)
          .first();
        const reviewItem = stored?.id
          ? await db.review_items.where('refId').equals(reviewRefId('mistake', stored.id)).first()
          : undefined;

        if (reviewItem) {
          await gradeReviewItem(reviewItem, 'good');
          mastered = (reviewItem.reps || 0) + 1 >= MASTERED_REPS;
        } else if (stored) {
          // Older mistakes predate the review queue; enrolling is idempotent.
          await enrolMistake(stored as MistakeEntity);
        }
        if (mastered) messageAr = 'أتقنتها: تذكّرتها بنجاح في ثلاث مرات متتالية.';
      } catch (err) {
        console.warn('Could not record the retyped correction:', err);
      }

      setDrill((prev) => ({ ...prev, [index]: { ...prev[index], result: { status: 'correct', mastered, messageAr } } }));
    },
    [drill, summary.scenarioId],
  );

  const targetPromotionLevel = getNextPromotionLevel(summary.cefrLevel);
  const currentSessionTimestamp = Date.now();
  const currentSessionAlreadySaved = sessions.some(
    (session) =>
      session.cefrLevel === summary.cefrLevel &&
      session.sentencesSpoken === summary.sentencesSpoken &&
      session.timestamp >= currentSessionTimestamp - 10_000,
  );
  const promotionSessions: PromotionSession[] = [
    ...sessions.map((session) => ({
      cefrLevel: session.cefrLevel,
      independentSentences:
        (session as typeof session & { independentSentences?: number }).independentSentences ?? 0,
      accuracyPercent: session.accuracyPercent,
      timestamp: session.timestamp,
    })),
    ...(currentSessionAlreadySaved
      ? []
      : [
          {
            cefrLevel: summary.cefrLevel,
            independentSentences: summary.independentSentences,
            accuracyPercent: summary.accuracyPercent,
            timestamp: currentSessionTimestamp,
          },
        ]),
  ];

  const handlePromoteLevel = async () => {
    if (!targetPromotionLevel) return;
    await db.users.update('current_user', { cefrLevel: targetPromotionLevel });
    setIsLevelPromoted(true);
    triggerHaptic('success');
  };

  const canPromote =
    targetPromotionLevel !== null && isEligibleForPromotion(summary.cefrLevel, promotionSessions);

  const capabilityState = capabilityFromSession({
    accuracyPercent: summary.accuracyPercent,
    independentSentences: summary.independentSentences,
    assistedSentences: summary.assistedSentences,
  });
  const outcome = OUTCOME[capabilityState];
  const totalTurns = summary.independentSentences + summary.assistedSentences;
  const weaknessCounts = new Map<MistakeCategory, number>();
  for (const mistake of summary.mistakes) {
    const category = classifyMistake(mistake.grammarRule, mistake.original, mistake.corrected);
    weaknessCounts.set(category, (weaknessCounts.get(category) || 0) + 1);
  }
  const mainWeakness = [...weaknessCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  const answeredCorrect = Object.values(drill).filter((row) => row.result?.status === 'correct').length;
  const openCorrections = Math.max(0, summary.mistakes.length - answeredCorrect);

  // This screen is where the episode ends, so it is the one place the Pro offer
  // can be made honestly: the learner has just finished something real. Nothing
  // is blocked by dismissing it, and the offer never appears before this point.
  const offerPro = shouldOfferPro({
    isPro: isProEffective(user),
    completedEpisodes: completedEpisodeCount(sessions),
  });

  // `conversation_completed` is already emitted once by the conversation when
  // it finishes (with the same scenario id), so this screen must not send it
  // again — two events for one session would inflate the funnel it feeds.

  return (
    <div className="relative min-h-screen bg-kz-black text-kz-ink">
      <SceneBackdrop scene={scene} className="pointer-events-none absolute inset-x-0 top-0 h-[300px]" />

      <div className="relative z-10 mx-auto max-w-md px-5 pb-40 pt-8">
        {/* Header: the outcome first, Katzu present but not performing. */}
        <KatzuPresence state={outcome.pose} lineAr={outcome.lineAr} size="lg" />

        <div className="mt-5 text-center">
          <p className="kz-ar-micro text-kz-inkFaint">
            ملخّص الجلسة · <GermanText className="text-kz-inkDim">{summary.scenarioTitle}</GermanText>
          </p>
          <h1 className="mt-2 kz-ar-title leading-relaxed text-kz-ink">{outcome.headlineAr(summary.scenarioTitle)}</h1>
        </div>

        {/* The capability card carries the earned treatment only when the same
            threshold the Progress screen uses was actually crossed. */}
        <GlassCard
          emphasis={capabilityState === 'INDEPENDENT' || capabilityState === 'RETAINED' ? 'earned' : 'primary'}
          className="mt-5"
        >
          <p
            className={
              capabilityState === 'INDEPENDENT' || capabilityState === 'RETAINED'
                ? 'kz-ar-caption kz-earned-text'
                : 'kz-ar-caption text-kz-lavender'
            }
          >
            {CAPABILITY_LABEL_AR[capabilityState]}
          </p>
          <ul className="mt-3 space-y-3">
            <li>
              <div className="flex items-baseline justify-between gap-3">
                <span className="kz-ar-caption text-kz-inkDim">جُمل نطقتها بلا مساعدة</span>
                <span className="font-german text-sm font-bold text-kz-ink">
                  {summary.independentSentences}
                  <span className="text-kz-inkFaint"> / {Math.max(totalTurns, summary.independentSentences)}</span>
                </span>
              </div>
              <ProgressRail
                value={summary.independentSentences}
                max={Math.max(totalTurns, summary.independentSentences)}
                earned={capabilityState === 'INDEPENDENT' || capabilityState === 'RETAINED'}
                className="mt-2"
              />
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span className="kz-ar-caption text-kz-inkDim">دقة الجُمل المستقلة</span>
              <span className="text-end">
                <span className="font-german text-sm font-bold text-kz-ink">
                  {summary.accuracyPercent === null ? '—' : `${summary.accuracyPercent}%`}
                </span>
                {summary.accuracyPercent === null && (
                  <span className="mt-0.5 block kz-ar-micro text-kz-inkFaint">
                    لا توجد جُمل مستقلة كافية للحكم بعد
                  </span>
                )}
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span className="kz-ar-caption text-kz-inkDim">تصحيحات هذه الجلسة</span>
              <span className="font-german text-sm font-bold text-kz-ink">
                {summary.mistakes.length === 0 ? 'لا شيء' : summary.mistakes.length}
              </span>
            </li>
            {mainWeakness && (
              <li className="flex items-baseline justify-between gap-3">
                <span className="kz-ar-caption text-kz-inkDim">أبرز ما يحتاج تثبيتاً</span>
                <span className="kz-ar-caption text-kz-ink">
                  {CATEGORY_COPY[mainWeakness[0]].labelAr} ({mainWeakness[1]})
                </span>
              </li>
            )}
            <li className="flex items-start gap-2 border-t border-white/[0.06] pt-3">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-kz-neon" aria-hidden />
              <span className="kz-ar-micro leading-relaxed text-kz-inkDim">
                {summary.mistakes.length > 0
                  ? 'أضفنا ما أخطأت فيه إلى مراجعتك المجدولة — أول موعد غداً، ثم تتباعد المواعيد كلما تذكّرتها بنجاح.'
                  : 'لم تدخل جمل جديدة إلى المراجعة من هذه الجلسة — لا تصحيحات.'}
              </span>
            </li>
          </ul>
        </GlassCard>

        {/* The Phase-2 debrief: a deterministic narration of what this episode
            proved — same numbers as this screen, no extra AI call behind it. */}
        <GlassCard className="mt-4">
          <p className="kz-ar-caption text-kz-lavender">خلاصة الجلسة</p>
          <p className="kz-ar-micro text-kz-inkDim mt-1">غداً: مشهد جديد ينتظرك — دقيقتان تكفيان.</p>
          <p className="mt-1.5 kz-ar-body font-bold leading-relaxed text-kz-ink">{summary.debrief.headlineAr}</p>
          {summary.debrief.didWellAr.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {summary.debrief.didWellAr.map((line, index) => (
                <li key={index} className="flex items-start gap-1.5 kz-ar-micro leading-relaxed text-kz-inkDim">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kz-neon" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
          {summary.mistakes.length === 0 && summary.debrief.topMistakesAr.length > 0 && (
            <div className="mt-3 space-y-2">
              {summary.debrief.topMistakesAr.map((mistake, index) => (
                <div key={index} className="border-t border-white/[0.06] pt-2">
                  <p className="font-german text-[0.78rem] leading-relaxed text-kz-inkFaint line-through">
                    <GermanText>{mistake.original}</GermanText>
                  </p>
                  <p className="font-german text-caption font-medium leading-relaxed text-kz-ink">
                    <GermanText>{mistake.corrected}</GermanText>
                  </p>
                  <p className="mt-1 kz-ar-micro leading-relaxed text-kz-inkDim">{mistake.grammarRule} — {mistake.noteAr}</p>
                </div>
              ))}
            </div>
          )}
          {summary.debrief.keepPhrases.length > 0 && (
            <div className="mt-3 border-t border-white/[0.06] pt-2">
              <p className="kz-ar-micro text-kz-inkDim">عبارات تحتفظ بها من هذه الجلسة:</p>
              <ul className="mt-1.5 space-y-1">
                {summary.debrief.keepPhrases.map((phrase, index) => (
                  <li key={index} className="flex items-center justify-between gap-2">
                    <span className="font-german text-xs text-kz-ink">
                      <GermanText>{phrase.german}</GermanText>
                    </span>
                    <button
                      type="button"
                      onClick={() => speak(phrase.german)}
                      className="shrink-0 rounded-full p-1 text-kz-lavender transition-colors pointer-hover:bg-white/5"
                      aria-label="استمع إلى العبارة"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 flex items-start gap-1.5 border-t border-white/[0.06] pt-3 kz-ar-micro leading-relaxed text-kz-neon">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{summary.debrief.canNowAr}</span>
          </p>
          {summary.debrief.compareToLastAr && (
            <p className="mt-2 flex items-start gap-1.5 kz-ar-micro leading-relaxed text-kz-inkDim">
              <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kz-lavender" aria-hidden />
              <span>{summary.debrief.compareToLastAr}</span>
            </p>
          )}
        </GlassCard>

        {/* The mock-exam card (V24 Phase 5): exam scenarios only. It says
            محاكاة, never claims a score, and carries the share image built from
            the first name + the session's own numbers. */}
        {examCard && (
          <ExamResultCard
            card={examCard}
            firstName={firstNameOf(user?.displayName)}
            scenarioTitle={summary.scenarioTitle}
            sentencesSpoken={summary.sentencesSpoken}
            independentSentences={summary.independentSentences}
          />
        )}

        {/* Level promotion: an offer backed by the same eligibility rule as
            before. Still the learner's decision, so it sits in a quiet card. */}
        {canPromote && targetPromotionLevel && (
          <GlassCard emphasis="primary" className="mt-4">
            <div className="flex items-start gap-2.5">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-kz-lavender" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="kz-ar-body font-bold text-kz-ink">أصبحت جاهزاً لمستوى {targetPromotionLevel}</p>
                <p className="mt-1 kz-ar-micro leading-relaxed text-kz-inkDim">
                  وصلت إلى دقة {summary.accuracyPercent}% في جلسة مستقلة كاملة. الترقية اختيارك — يمكنك البقاء في
                  {' '}
                  {summary.cefrLevel} إن أردت تثبيتاً أكثر.
                </p>
                <GlassButton
                  variant="secondary"
                  className="mt-3"
                  disabled={isLevelPromoted}
                  onClick={handlePromoteLevel}
                >
                  {isLevelPromoted ? 'تمت الترقية' : `الترقية إلى ${targetPromotionLevel}`}
                </GlassButton>
              </div>
            </div>
          </GlassCard>
        )}

        {/* The Pro offer, after the win and never before it. Plain comparison,
            one action, and it can be ignored — the Debrief's own primary action
            below is about the learner's next step, not about paying. */}
        {offerPro && onOpenSubscription && (
          <GlassCard className="mt-4">
            <p className="kz-ar-caption text-kz-inkDim">ما يفتحه Pro — وما يبقى مجانياً</p>
            <ul className="mt-3 space-y-2">
              <li className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kz-lavender" aria-hidden />
                <span className="kz-ar-micro leading-relaxed text-kz-ink">
                  محادثات صوتية بلا حدّ جلسات، وكل المستويات من A0 إلى B2
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kz-neon" aria-hidden />
                <span className="kz-ar-micro leading-relaxed text-kz-inkDim">
                  ويبقى مجانياً دائماً: مهمة اليوم، ومراجعة كل ما تعلّمته، وبنك أخطائك
                </span>
              </li>
            </ul>
            <GlassButton variant="secondary" className="mt-3" onClick={onOpenSubscription}>
              تفاصيل Pro
            </GlassButton>
          </GlassCard>
        )}

        {/* Corrections: the one place where a mistake is worth something, because
            retyping it correctly is a real second retrieval. */}
        {summary.mistakes.length > 0 && (
          <section className="mt-6">
            <h2 className="kz-ar-caption text-kz-inkDim">
              أثبّت الصيغة الصحيحة — أعد كتابتها مرة واحدة الآن
            </h2>
            <div className="mt-3 space-y-3">
              {summary.mistakes.map((mistake, index) => {
                const row = drill[index];
                const result = row?.result || null;
                // The debrief's level-aware coaching note rides on the row of
                // the correction it names — each correction is rendered exactly
                // once on this screen (V21 Phase-11 deduplication).
                const debriefNote = summary.debrief.topMistakesAr.find(
                  (named) => named.corrected === mistake.corrected,
                )?.noteAr;
                return (
                  <GlassWell key={index} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 font-german text-[0.78rem] leading-relaxed text-kz-inkFaint line-through">
                        <GermanText>{mistake.original}</GermanText>
                      </p>
                      <button
                        type="button"
                        onClick={() => speak(mistake.corrected)}
                        className="shrink-0 rounded-full p-1.5 text-kz-lavender transition-colors pointer-hover:bg-white/5"
                        aria-label="استمع إلى النطق الصحيح"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <p className="mt-1.5 font-german text-[0.86rem] font-medium leading-relaxed text-kz-ink">
                      <GermanText>{mistake.corrected}</GermanText>
                    </p>
                    <p className="mt-1.5 kz-ar-micro leading-relaxed text-kz-inkDim">{mistake.grammarRule}</p>
                    {debriefNote && (
                      <p className="mt-1 kz-ar-micro leading-relaxed text-kz-inkDim">{debriefNote}</p>
                    )}

                    {result?.status === 'correct' ? (
                      <p className="mt-3 flex items-start gap-1.5 kz-ar-micro leading-relaxed text-kz-neon">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span>{result.messageAr}</span>
                      </p>
                    ) : (
                      <div className="mt-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            dir="ltr"
                            inputMode="text"
                            aria-label="اكتب الجملة الصحيحة"
                            placeholder="اكتب الجملة الصحيحة"
                            value={row?.text || ''}
                            onChange={(event) =>
                              setDrill((prev) => ({
                                ...prev,
                                [index]: { text: event.target.value, result: prev[index]?.result || null },
                              }))
                            }
                            className="h-11 min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/40 px-3 font-german text-xs text-kz-ink placeholder:font-arabic placeholder:text-kz-inkFaint focus:border-kz-lavender/50"
                          />
                          <GlassButton
                            variant="secondary"
                            disabled={!(row?.text || '').trim()}
                            onClick={() => handleValidateRetype(index, mistake)}
                          >
                            تحقّق
                          </GlassButton>
                        </div>
                        {result?.status === 'wrong' && (
                          <p className="mt-2 kz-ar-micro leading-relaxed text-kz-warm">{result.messageAr}</p>
                        )}
                      </div>
                    )}
                  </GlassWell>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Dock: one obvious next action, plus the way back. */}
      <FloatingControl className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md rounded-t-[26px] border-t border-white/[0.06] p-4 pb-6">
        {openCorrections > 0 && onOpenReview ? (
          <>
            <PrimaryAction
              hintAr={`بقي ${openCorrections} تصحيحاً لم تُثبّتها هنا — نفس الجمل ستعود في المراجعة المجدولة.`}
              onClick={onOpenReview}
            >
              راجع تصحيحات هذه الجلسة
            </PrimaryAction>
            <GlassButton variant="quiet" fullWidth className="mt-1" onClick={onReturnToTrail}>
              العودة إلى الرحلة
            </GlassButton>
          </>
        ) : (
          <PrimaryAction
            hintAr={
              capabilityState === 'INDEPENDENT' || capabilityState === 'RETAINED'
                ? 'المحافظة على الموقف تأتي من تكراره في يوم آخر — وليس من جلسة واحدة.'
                : 'التكرار في يوم آخر هو ما يثبّت هذا الموقف.'
            }
            onClick={onReturnToTrail}
          >
            العودة إلى الرحلة
          </PrimaryAction>
        )}
      </FloatingControl>
    </div>
  );
};

/**
 * The mock-exam result card (V24 Phase 5).
 *
 * Deterministic (built by buildExamCard from session data), Arabic-first, and
 * hard-bounded: it says محاكاة, it never renders a score/pass/fail, and the
 * share image carries only the learner's first name plus numbers the session
 * computed. The image is optional — a canvas-less browser simply hides it.
 */
const ExamResultCard: React.FC<{ card: ExamCard; firstName?: string; scenarioTitle?: string; sentencesSpoken?: number; independentSentences?: number }> = ({
  card,
  firstName = '',
  scenarioTitle = '',
  sentencesSpoken = 0,
  independentSentences = 0,
}) => {
  const shareUrl = useExamShareImage({ firstName, scenarioTitle, sentencesSpoken, independentSentences });

  const handleShare = useCallback(async () => {
    if (!shareUrl) return;
    try {
      const blob = await fetch(shareUrl).then((r) => r.blob());
      const file = new File([blob], 'katzu-mock-exam.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'محاكاة كَاتْزُو' });
      } else {
        const link = document.createElement('a');
        link.href = shareUrl;
        link.download = 'katzu-mock-exam.png';
        link.click();
      }
    } catch {
      // The learner cancelled the share sheet — nothing to recover from.
    }
  }, [shareUrl]);

  return (
    <GlassCard emphasis="primary" className="mt-4">
      <p className="kz-ar-caption text-kz-lavender">نتيجة المحاكاة</p>
      <p className="mt-1.5 kz-ar-body font-bold leading-relaxed text-kz-ink">{card.taskDoneAr}</p>

      <ul className="mt-3 space-y-1.5">
        {card.fluencyAr.map((line, index) => (
          <li key={index} className="flex items-start gap-1.5 kz-ar-micro leading-relaxed text-kz-inkDim">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kz-neon" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {card.topCorrections.length > 0 && (
        <div className="mt-3 space-y-2">
          {card.topCorrections.map((correction, index) => (
            <div key={index} className="border-t border-white/[0.06] pt-2">
              <p className="font-german text-[0.78rem] leading-relaxed text-kz-inkFaint line-through">
                <GermanText>{correction.original}</GermanText>
              </p>
              <p className="font-german text-caption font-medium leading-relaxed text-kz-ink">
                <GermanText>{correction.corrected}</GermanText>
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 flex items-start gap-1.5 border-t border-white/[0.06] pt-3 kz-ar-micro leading-relaxed text-kz-neon">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{card.nextStepAr}</span>
      </p>

      <p className="mt-2 rounded-lg bg-white/[0.04] px-2.5 py-2 text-center kz-ar-micro leading-relaxed text-kz-lavender">
        {card.noticeAr}
      </p>

      {shareUrl && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <img
            src={shareUrl}
            alt="صورة مشاركة نتيجة المحاكاة"
            className="h-40 w-40 rounded-2xl border border-white/10"
          />
          <GlassButton variant="quiet" onClick={handleShare}>
            شارك نتيجة المحاكاة
          </GlassButton>
        </div>
      )}
    </GlassCard>
  );
};
