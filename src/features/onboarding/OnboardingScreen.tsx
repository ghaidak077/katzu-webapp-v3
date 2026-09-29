import React, { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db/katzuDb';
import { GlassCard } from '@/components/glass/GlassCard';
import { GlassButton, PrimaryAction } from '@/components/glass/GlassButton';
import { KatzuPresence } from '@/components/v2/KatzuPresence';
import { triggerHaptic } from '@/lib/utils/haptics';
import { track } from '@/lib/analytics/client';
import {
  ARRIVAL_COPY,
  GOAL_COPY,
  PREVIOUS_GERMAN_COPY,
  TARGET_DATE_COPY,
  emptyOnboardingAnswers,
  onboardingPatch,
  placementOffer,
  placementSkipPatch,
  type OnboardingAnswers,
  type PlacementChoice,
} from '@/lib/onboarding/preferences';
import { DAILY_MINUTE_CHOICES, type ArrivalStatus, type DailyMinuteChoice, type LearnerGoal, type PreviousGerman, type TargetDateKind } from '@/types/models';
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock, Compass, Target, GraduationCap } from 'lucide-react';

export interface OnboardingScreenProps {
  /** `first_run` ends with the placement choice; `edit` is a profile edit. */
  mode: 'first_run' | 'edit';
  initial?: Partial<OnboardingAnswers>;
  onDone: (choice: PlacementChoice) => void;
  onBack: () => void;
}

type Step = 'goal' | 'arrival' | 'previous' | 'time' | 'target' | 'placement';

/** The questions proper; `placement` is the offer that follows them. */
const QUESTION_STEPS: Step[] = ['goal', 'arrival', 'previous', 'time', 'target'];

const GOAL_ICONS: Record<LearnerGoal, React.ReactNode> = {
  daily_life: <Compass className="w-5 h-5" />,
  work: <Target className="w-5 h-5" />,
  university: <GraduationCap className="w-5 h-5" />,
  exam: <CheckCircle2 className="w-5 h-5" />,
};

/**
 * Katzu getting to know a new learner.
 *
 * One question per screen, in Katzu's own voice, because these are the first
 * words the app ever says to someone — a settings form here would tell them what
 * kind of product this is before it has taught them anything. Nothing is a
 * survey: the goal reorders the mission, the arrival status decides which
 * situations are urgent, the daily time sets the mission length, and what they
 * tried before decides whether the placement check is offered first. The
 * placement itself stays genuinely optional — skipping marks the level as
 * *unmeasured* rather than silently calling a learner A1.
 */
export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ mode, initial, onDone, onBack }) => {
  const [step, setStep] = useState<Step>('goal');
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => ({
    ...emptyOnboardingAnswers(),
    ...initial,
  }));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (mode === 'first_run') track('onboarding_started');
  }, [mode]);

  const questionIndex = useMemo(() => QUESTION_STEPS.indexOf(step), [step]);
  const isPlacement = step === 'placement';
  const placement = useMemo(() => placementOffer(answers.previousGerman), [answers.previousGerman]);

  const advance = (next: Step) => {
    triggerHaptic('light');
    setStep(next);
  };

  const save = async (choice: PlacementChoice) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await db.users.update('current_user', onboardingPatch(answers));
      if (choice === 'skip') {
        await db.users.update('current_user', placementSkipPatch());
      }
      track('onboarding_completed', { source: choice });
    } catch (error) {
      // A failed local write must not trap the learner: the app continues and
      // the prompt card in the Trail will ask again next time.
      console.warn('Onboarding save failed:', error);
    } finally {
      setIsSaving(false);
      onDone(choice);
    }
  };

  return (
    <main className="min-h-screen bg-kz-black pb-10 text-kz-ink">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 pt-6">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            aria-label="رجوع"
            className="kz-surface flex h-11 w-11 items-center justify-center rounded-2xl"
            data-tier="canvas"
          >
            <ArrowRight className="h-5 w-5 text-kz-inkDim" />
          </button>

          {/* Dots, not a fraction: five questions is a short conversation, and a
              counter makes it feel like a form to be completed. */}
          <div
            className="flex items-center gap-1.5"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={QUESTION_STEPS.length}
            aria-valuenow={isPlacement ? QUESTION_STEPS.length : questionIndex + 1}
            aria-label="تقدم الأسئلة"
          >
            {mode === 'edit' ? (
              <span className="kz-ar-micro text-kz-inkDim">تعديل التفضيلات</span>
            ) : (
              QUESTION_STEPS.map((questionStep, index) => (
                <span
                  key={questionStep}
                  className={`h-1.5 rounded-full transition-all ${
                    isPlacement || index < questionIndex
                      ? 'w-4 bg-kz-lavender/70'
                      : index === questionIndex
                        ? 'w-6 bg-kz-lavender'
                        : 'w-1.5 bg-white/15'
                  }`}
                />
              ))
            )}
          </div>
          <div className="w-11" />
        </div>

        {step === 'goal' && (
          <GlassCard emphasis="primary" className="flex flex-1 flex-col">
            <KatzuPresence state="story" size="md" className="self-start" />
            <h1 className="mt-3 kz-ar-title text-kz-ink">قبل أن نبدأ، عرّفني بنفسك</h1>
            <p className="mt-2 kz-ar-caption leading-relaxed text-kz-inkDim">
              خمسة أسئلة قصيرة، سؤال واحد في كل شاشة. بها أختار لك ما تبدأ به فعلاً — لا أريد أن
              أُضيع وقتك في شيء لن تحتاجه.
            </p>
            <p className="mt-5 kz-ar-body font-bold text-kz-ink">لماذا تتعلّم الألمانية؟</p>
            <p className="mt-1 kz-ar-micro text-kz-inkFaint">هذا يغيّر ترتيب المواقف التي أضعها أمامك أولاً.</p>
            <div className="mt-3 space-y-2.5">
              {(Object.keys(GOAL_COPY) as LearnerGoal[]).map((goal) => (
                <button
                  key={goal}
                  type="button"
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, primaryGoal: goal }));
                    advance('arrival');
                  }}
                  className={`w-full rounded-2xl border p-4 text-start transition-all ${
                    answers.primaryGoal === goal
                      ? 'border-kz-lavender/50 bg-kz-lavender/10'
                      : 'border-white/[0.07] bg-white/[0.02]'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span className="text-kz-lavender">{GOAL_ICONS[goal]}</span>
                    <span>
                      <span className="block kz-ar-body font-bold text-kz-ink">{GOAL_COPY[goal].labelAr}</span>
                      <span className="mt-0.5 block kz-ar-micro text-kz-inkDim">{GOAL_COPY[goal].hintAr}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </GlassCard>
        )}

        {step === 'arrival' && (
          <GlassCard className="flex flex-1 flex-col">
            <KatzuPresence state="practice" size="sm" className="self-start" />
            <h1 className="mt-3 kz-ar-title text-kz-ink">وأين أنت الآن من ألمانيا؟</h1>
            <p className="mt-2 kz-ar-caption leading-relaxed text-kz-inkDim">
              من يستعد للسفر يحتاج الأوراق أولاً، ومن وصل يحتاج السكن والطبيب. هذا يحدد ما أقدّمه لك اليوم.
            </p>
            <div className="mt-4 space-y-2.5">
              {(Object.keys(ARRIVAL_COPY) as ArrivalStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, arrivalStatus: status }));
                    advance('previous');
                  }}
                  className={`min-h-[48px] w-full rounded-2xl border p-4 text-start kz-ar-body transition-all ${
                    answers.arrivalStatus === status
                      ? 'border-kz-lavender/50 bg-kz-lavender/10'
                      : 'border-white/[0.07] bg-white/[0.02]'
                  }`}
                >
                  {ARRIVAL_COPY[status]}
                </button>
              ))}
            </div>
            <BackLink onClick={() => setStep('goal')} />
          </GlassCard>
        )}

        {step === 'previous' && (
          <GlassCard className="flex flex-1 flex-col">
            <KatzuPresence state="practice" size="sm" className="self-start" />
            <h1 className="mt-3 kz-ar-title text-kz-ink">هل جرّبت الألمانية قبل اليوم؟</h1>
            <p className="mt-2 kz-ar-caption leading-relaxed text-kz-inkDim">
              لا لجعل الأمور أسهل أو أصعب — فقط لأعرف من أين أبدأ معك. لن أفترض أنك تعرف شيئاً لم
              تخبرني به.
            </p>
            <div className="mt-4 space-y-2.5">
              {(Object.keys(PREVIOUS_GERMAN_COPY) as PreviousGerman[]).map((previous) => (
                <button
                  key={previous}
                  type="button"
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, previousGerman: previous }));
                    advance('time');
                  }}
                  className={`min-h-[48px] w-full rounded-2xl border p-4 text-start transition-all ${
                    answers.previousGerman === previous
                      ? 'border-kz-lavender/50 bg-kz-lavender/10'
                      : 'border-white/[0.07] bg-white/[0.02]'
                  }`}
                >
                  <span className="block kz-ar-body text-kz-ink">{PREVIOUS_GERMAN_COPY[previous].labelAr}</span>
                  <span className="mt-0.5 block kz-ar-micro text-kz-inkDim">
                    {PREVIOUS_GERMAN_COPY[previous].hintAr}
                  </span>
                </button>
              ))}
            </div>
            <BackLink onClick={() => setStep('arrival')} />
          </GlassCard>
        )}

        {step === 'time' && (
          <GlassCard className="flex flex-1 flex-col">
            <KatzuPresence state="practice" size="sm" className="self-start" />
            <h1 className="mt-3 kz-ar-title text-kz-ink">وكم دقيقة تستطيع أن تعطيني يومياً؟</h1>
            <p className="mt-2 kz-ar-caption leading-relaxed text-kz-inkDim">
              العادة أهم من المدة. اختر ما تستطيع الالتزام به فعلاً — سأبني مهمة اليوم على هذا
              الرقم، ويمكنك تغييره لاحقاً.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {DAILY_MINUTE_CHOICES.map((minutes: DailyMinuteChoice) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, dailyMinutes: minutes }));
                    advance('target');
                  }}
                  className={`min-h-[88px] rounded-2xl border p-4 transition-all ${
                    answers.dailyMinutes === minutes
                      ? 'border-kz-lavender/50 bg-kz-lavender/10'
                      : 'border-white/[0.07] bg-white/[0.02]'
                  }`}
                >
                  <span className="block font-german text-2xl font-bold text-kz-lavender">{minutes}</span>
                  <span className="mt-1 block kz-ar-micro text-kz-inkDim">دقائق</span>
                </button>
              ))}
            </div>
            <BackLink onClick={() => setStep('previous')} />
          </GlassCard>
        )}

        {step === 'target' && (
          <GlassCard className="flex flex-1 flex-col">
            <KatzuPresence state="practice" size="sm" className="self-start" />
            <h1 className="mt-3 kz-ar-title text-kz-ink">هل هناك تاريخ تنتظره؟ (اختياري)</h1>
            <p className="mt-2 kz-ar-caption leading-relaxed text-kz-inkDim">
              امتحان أو مقابلة أو سفر — إن أخبرتني بالتاريخ سأذكّرك بما يتبقى منه داخل التطبيق فقط.
              لن أرسل لك إشعارات، ولن أضغط عليك.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(Object.keys(TARGET_DATE_COPY) as TargetDateKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() =>
                    setAnswers((prev) => ({
                      ...prev,
                      targetDateKind: prev.targetDateKind === kind ? null : kind,
                      targetDate: prev.targetDateKind === kind ? null : prev.targetDate,
                    }))
                  }
                  className={`min-h-[48px] rounded-2xl border p-3 kz-ar-micro font-semibold transition-all ${
                    answers.targetDateKind === kind
                      ? 'border-kz-lavender/50 bg-kz-lavender/10 text-kz-ink'
                      : 'border-white/[0.07] bg-white/[0.02] text-kz-inkDim'
                  }`}
                >
                  {TARGET_DATE_COPY[kind]}
                </button>
              ))}
            </div>

            {answers.targetDateKind && (
              <label className="mt-4 block">
                <span className="mb-1.5 flex items-center gap-1.5 kz-ar-micro text-kz-inkDim">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  التاريخ
                </span>
                <input
                  type="date"
                  dir="ltr"
                  onChange={(event) => {
                    const value = event.target.value ? new Date(event.target.value).getTime() : null;
                    setAnswers((prev) => ({ ...prev, targetDate: value }));
                  }}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 font-german text-sm text-kz-ink outline-none focus:border-kz-lavender/50"
                />
              </label>
            )}

            <div className="mt-4">
              <PrimaryAction
                hintAr={mode === 'edit' ? undefined : 'سؤال أخير: هل أقيس مستواك الآن؟'}
                disabled={mode === 'edit' && isSaving}
                onClick={() => {
                  if (mode === 'edit') void save('take');
                  else advance('placement');
                }}
              >
                {mode === 'edit' ? (isSaving ? 'جارٍ الحفظ…' : 'حفظ التفضيلات') : 'تابع'}
              </PrimaryAction>
            </div>
            {mode === 'first_run' && (
              <GlassButton variant="quiet" fullWidth className="mt-1" onClick={() => advance('placement')}>
                لا يوجد تاريخ محدد
              </GlassButton>
            )}
            <BackLink onClick={() => setStep('time')} />
          </GlassCard>
        )}

        {step === 'placement' && (
          <GlassCard className="flex flex-1 flex-col">
            <div className="flex items-center gap-2 kz-ar-micro text-kz-inkDim">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              دقيقتان تقريباً
            </div>
            <h1 className="mt-2 kz-ar-title text-kz-ink">هل أقيس مستواك الآن؟</h1>
            <p className="mt-2 kz-ar-caption leading-relaxed text-kz-inkDim">
              الاختبار القصير يحدد نقطة البداية الصحيحة (من A1 إلى B2) حتى لا أعلّمك ما تعرفه ولا
              أتجاوز ما لا تعرفه. يمكنك تخطّيه — وسأترك مستواك «غير مقيس» بصراحة، ولن أدّعي أنك
              أتقنت شيئاً لم أقسْه.
            </p>
            <p className="mt-3 kz-ar-caption leading-relaxed text-kz-lavender">{placement.recommendAr}</p>

            <div className="mt-5 space-y-2">
              {placement.primary === 'placement' ? (
                <>
                  <PlacementAction busy={isSaving} onTake={() => void save('take')} />
                  <GlassButton variant="secondary" fullWidth disabled={isSaving} onClick={() => void save('skip')}>
                    لا الآن — ابدأ من A1 وسجّل مستواي كغير مقيس
                  </GlassButton>
                </>
              ) : (
                <>
                  <GlassButton variant="secondary" fullWidth disabled={isSaving} onClick={() => void save('skip')}>
                    ابدأ من A1 مباشرة — سنبدأ بأول مشهد اليوم
                  </GlassButton>
                  <PlacementAction busy={isSaving} onTake={() => void save('take')} variant="quiet" />
                </>
              )}
            </div>

            <p className="mt-4 kz-ar-micro leading-relaxed text-kz-inkFaint">
              لا أطلب أي بيانات شخصية إضافية، ولا أفعّل إشعارات تلقائياً، ولا أطلب دفعاً. الهدف أن
              تبدأ أول درس لك بأسرع وقت.
            </p>
          </GlassCard>
        )}
      </div>
    </main>
  );
};

/** The placement check itself: primary or quiet, depending on the recommendation. */
const PlacementAction: React.FC<{ busy: boolean; onTake: () => void; variant?: 'primary' | 'quiet' }> = ({
  busy,
  onTake,
  variant = 'primary',
}) =>
  variant === 'primary' ? (
    <PrimaryAction
      hintAr="يمكنك الخروج منه في أي وقت — تقدّمك محفوظ."
      disabled={busy}
      onClick={onTake}
      icon={<ArrowLeft className="h-4 w-4 rotate-180" aria-hidden />}
    >
      ابدأ القياس
    </PrimaryAction>
  ) : (
    <GlassButton variant="quiet" fullWidth disabled={busy} onClick={onTake}>
      أمّا القياس فمتاح في أي وقت — ابدأه الآن
    </GlassButton>
  );

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <GlassButton variant="quiet" fullWidth className="mt-4" onClick={onClick}>
      رجوع للسؤال السابق
    </GlassButton>
  );
}
