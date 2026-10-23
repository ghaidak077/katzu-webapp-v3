import React, { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db/katzuDb';
import { GlassCard } from '@/components/glass/GlassCard';
import { GlassButton, PrimaryAction } from '@/components/glass/GlassButton';
import { KatzuPresence } from '@/components/v2/KatzuPresence';
import { triggerHaptic } from '@/lib/utils/haptics';
import { isGuidedHomeEnabled } from '@/lib/flags/guidedHome';
import { track } from '@/lib/analytics/client';
import { ONBOARDING_SKIP_SOURCE } from '@/lib/analytics/events';
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

/**
 * A3: the front door asks once. A first-run learner answers TWO questions — why
 * they are learning and how many minutes a day — and nothing else. Arrival,
 * previous German, the target date and the placement offer move to the debrief
 * card (A4). The edit screen keeps the full set.
 */
const FIRST_RUN_STEPS: Step[] = ['goal', 'time'];
const EDIT_STEPS: Step[] = ['goal', 'arrival', 'previous', 'time', 'target'];

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

  const questionSteps = mode === 'edit' ? EDIT_STEPS : FIRST_RUN_STEPS;
  const questionIndex = useMemo(() => questionSteps.indexOf(step), [questionSteps, step]);
  const isPlacement = step === 'placement';
  /**
   * The first question of a first run has nothing behind it.
   *
   * The header's back control calls the route's `onBack`, which for a first run
   * is `/welcome` — the signed-up learner would be walked back out of their own
   * account to the screen that asks them to create one. There is no earlier step
   * to return to either, so on this one screen the control is simply absent (the
   * spacer keeps the progress dots centred). Guide-only: flag off is untouched.
   */
  const guided = isGuidedHomeEnabled();
  const hideBackOnFirstQuestion = guided && mode === 'first_run' && !isPlacement && questionIndex === 0;
  const placement = useMemo(() => placementOffer(answers.previousGerman), [answers.previousGerman]);

  const advance = (next: Step) => {
    triggerHaptic('light');
    setStep(next);
  };

  /**
   * Writes the answers and ends the flow.
   *
   * `source` is what the funnel sees, and it is NOT always the placement
   * choice: skipping the FIRST question is a different act from skipping the
   * placement check, and the funnel has to be able to tell them apart — a
   * learner who walked past the goal question is a different cohort from one
   * who answered it and then declined the test.
   */
  const save = async (
    choice: PlacementChoice,
    overrides: Partial<OnboardingAnswers> = {},
    source: string = choice,
  ) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // `overrides` carries the answer from the step that ends the flow: that
      // click sets state and saves in the same tick, so the state update is not
      // visible to this closure yet — the explicit value is the one just chosen.
      await db.users.update('current_user', onboardingPatch({ ...answers, ...overrides }));
      // Only the edit flow records an explicit placement skip. A first-run learner
      // is never asked, so their level stays unmeasured rather than being written
      // as "skipped" — the debrief card (A4) offers the placement later.
      if (choice === 'skip' && mode === 'edit') {
        await db.users.update('current_user', placementSkipPatch());
      }
      track('onboarding_completed', { source });
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
    <div className="min-h-screen bg-kz-black pb-10 text-kz-ink">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 pt-6">
        <div className="mb-6 flex items-center justify-between">
          {hideBackOnFirstQuestion ? (
            <div className="h-11 w-11" aria-hidden />
          ) : (
            <button
              type="button"
              onClick={onBack}
              aria-label="رجوع"
              className="kz-surface flex h-11 w-11 items-center justify-center rounded-2xl"
              data-tier="canvas"
            >
              <ArrowRight className="h-5 w-5 text-kz-inkDim" />
            </button>
          )}

          {/* Dots, not a fraction: five questions is a short conversation, and a
              counter makes it feel like a form to be completed. */}
          <div
            className="flex items-center gap-1.5"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={questionSteps.length}
            aria-valuenow={isPlacement ? questionSteps.length : questionIndex + 1}
            aria-label="تقدم الأسئلة"
          >
            {mode === 'edit' ? (
              <span className="kz-ar-micro text-kz-inkDim">تعديل التفضيلات</span>
            ) : (
              questionSteps.map((questionStep, index) => (
                <span
                  key={questionStep}
                  className={`h-1.5 rounded-full transition-[width] duration-panels ease-out ${
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

        {/* One line of orientation on the first run, not a second question: the
            dots already say "two", these words say what the two are for. */}
        {mode === 'first_run' && isGuidedHomeEnabled() && (
          <p className="mb-4 kz-ar-micro text-kz-inkFaint">سؤالان فقط — ثم أفتح لك أول موقف.</p>
        )}

        {step === 'goal' && (
          <GlassCard emphasis="primary" className="flex flex-1 flex-col">
            <KatzuPresence state="story" size="md" className="self-start" />
            <h1 className="mt-3 kz-ar-title text-kz-ink">قبل أن نبدأ، عرّفني بنفسك</h1>
            <p className="mt-2 kz-ar-caption leading-relaxed text-kz-inkDim">
              أسئلة قصيرة، سؤال واحد في كل شاشة. بها أختار لك ما تبدأ به فعلاً — لا أريد أن
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
                    // A5: the first funnel step. The answer arrives with `goal`
                    // on every later event too, but without this line the
                    // funnel's opening step has no rows at all — the owner
                    // could see who finished and not who began.
                    track('onboarding_goal', { kind: goal, source: mode });
                    advance(mode === 'edit' ? 'arrival' : 'time');
                  }}
                  className={`w-full rounded-2xl border p-4 text-start transition-colors ${
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

            {/* The way past the first question.
                One question stands between a new learner and their first
                conversation, and a question nobody is obliged to answer is a
                wall. The guided home opens that conversation, so the goal
                question may be skipped — nothing is written for it, the level
                stays unmeasured, and the funnel is told this learner walked
                past it (`source: 'skip_first'`) rather than that they declined
                the placement check. */}
            {mode === 'first_run' && guided && (
              <GlassButton
                variant="quiet"
                fullWidth
                className="mt-4"
                disabled={isSaving}
                onClick={() => void save('skip', {}, ONBOARDING_SKIP_SOURCE)}
              >
                تخطَّ الآن وابدأ
              </GlassButton>
            )}
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
                  className={`min-h-[48px] w-full rounded-2xl border p-4 text-start kz-ar-body transition-colors ${
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
                  className={`min-h-[48px] w-full rounded-2xl border p-4 text-start transition-colors ${
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
                    // A3: first-run ends here — save and go straight to the mission;
                    // the edit flow keeps the remaining questions.
                    if (mode === 'edit') advance('target');
                    else void save('skip', { dailyMinutes: minutes });
                  }}
                  className={`min-h-[88px] rounded-2xl border p-4 transition-colors ${
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
            {mode === 'first_run' && isGuidedHomeEnabled() && (
              /* An exit that is not an answer. It saves the default minutes and
                 the completion stamp, so the app never asks again, and leaves the
                 goal unanswered rather than inventing one — the mission then falls
                 back to the general order, which is what "no preference" means. */
              <GlassButton
                variant="quiet"
                fullWidth
                className="mt-4"
                disabled={isSaving}
                onClick={() => void save('skip')}
              >
                تخطَّ الأسئلة وابدأ الآن
              </GlassButton>
            )}
            {/* First run has two questions, and «previous» is the edit flow's
                third one — offering it here opened the previous-German screen the
                first run never asks, and then came back to the same grid. Back
                now returns to the question that was actually asked. */}
            <BackLink onClick={() => setStep(guided && mode === 'first_run' ? 'goal' : 'previous')} />
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
                  className={`min-h-[48px] rounded-2xl border p-3 kz-ar-micro font-semibold transition-colors ${
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
                    // The lead time in DAYS, never the date: a date is the kind of
                    // thing a learner would recognise in a log, and "how far out
                    // is this person" is the question the event actually answers.
                    // Empty and cleared both report 0 — there is no intent to read
                    // in "they removed it again".
                    const days = value ? Math.max(0, Math.round((value - Date.now()) / 86_400_000)) : 0;
                    track('exam_date_set', { kind: answers.targetDateKind || 'exam', count: days });
                  }}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 font-german text-sm text-kz-ink focus:border-kz-lavender/50"
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
              الاختبار القصير يحدد نقطة البداية الصحيحة (من A0 إلى B2) حتى لا أعلّمك ما تعرفه ولا
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
    </div>
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
