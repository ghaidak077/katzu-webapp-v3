import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { workerClient } from '@/lib/api/workerClient';
import { gradeReviewItem } from '@/lib/srs/store';
import { SESSION_LIMIT, buildReviewQueue, countDue, gradeAnswer, type AnswerVerdict } from '@/lib/srs/engine';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { GermanText } from '@/components/common/GermanText';
import { GlassCard, FloatingControl } from '@/components/glass/GlassCard';
import { GlassButton, PrimaryAction } from '@/components/glass/GlassButton';
import { GlassWell } from '@/components/glass/GlassSurface';
import { KatzuPresence } from '@/components/v2/KatzuPresence';
import { ProgressRail } from '@/components/v2/ProgressStrip';
import { triggerHaptic } from '@/lib/utils/haptics';
import { track } from '@/lib/analytics/client';
import { ArrowLeft, CheckCircle2, RotateCcw, Sparkles, Volume2, XCircle } from 'lucide-react';
import type { ReviewGrade, ReviewItemEntity } from '@/types/models';

export interface ReviewScreenProps {
  onBack: () => void;
}

const KIND_LABELS: Record<ReviewItemEntity['kind'], string> = {
  vocab: 'مفردة',
  phrase: 'جملة جاهزة',
  mistake: 'خطأ سابق',
};

/** Chip tint per kind: the type of memory being tested, not a severity. */
const KIND_TONE: Record<ReviewItemEntity['kind'], string> = {
  vocab: 'text-kz-lavender',
  phrase: 'text-kz-neon',
  mistake: 'text-kz-warm',
};

function formatGap(from: number, to: number): string {
  const minutes = Math.max(1, Math.round((to - from) / 60000));
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ساعة`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'غداً' : `${days} أيام`;
}

/**
 * Review — the memory loop, in the same language as the rest of V2.
 *
 * Retrieval practice, not recognition: the learner produces the German from the
 * Arabic prompt. Multiple choice would feel smoother and teach less, because
 * recognising an answer never requires retrieving it.
 *
 * The self-grading controls carry equal weight on purpose. Making "سهل" the
 * highlighted button would teach the learner to press it, and the interval it
 * buys would be unearned — the schedule is only as honest as the answer here.
 */
export const ReviewScreen: React.FC<ReviewScreenProps> = ({ onBack }) => {
  const items = useLiveQuery(() => db.review_items.where('userId').equals('current_user').toArray());
  const user = useLiveQuery(() => db.users.get('current_user'));

  // The queue is frozen when the session starts: the learner's next question must
  // never change under them because a background write touched the table.
  const [queue, setQueue] = useState<ReviewItemEntity[] | null>(null);
  const startedRef = useRef(false);

  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [verdict, setVerdict] = useState<AnswerVerdict | null>(null);
  const [tally, setTally] = useState({ correct: 0, close: 0, wrong: 0, again: 0 });
  const { speak } = useSpeechOutput();

  useEffect(() => {
    if (startedRef.current || !items) return;
    startedRef.current = true;
    const due = buildReviewQueue(items, Date.now(), SESSION_LIMIT);
    setQueue(due);
    if (due.length > 0) track('review_started', { count: due.length });
  }, [items]);

  const remainingDue = useMemo(() => (items ? countDue(items, Date.now()) : 0), [items]);
  const current = queue && index < queue.length ? queue[index] : null;
  const isFinished = queue !== null && index >= queue.length;

  // A finished session is when the schedule has changed most, and it is the only
  // moment the learner cannot notice the upload: the next device they open Katzu
  // on already knows what they are about to forget.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!isFinished || syncedRef.current) return;
    syncedRef.current = true;
    track('review_completed', { count: (items || []).length });
    if (user?.sessionToken) {
      workerClient.syncReviewQueue(user.sessionToken).catch(() => {
        // Offline: the queue stays local and is re-offered on the next sync.
      });
    }
  }, [isFinished, user?.sessionToken]);

  const handleCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !answer.trim()) return;
    const result = gradeAnswer(current.answerDe, answer);
    setVerdict(result);
    triggerHaptic(result === 'correct' ? 'success' : result === 'close' ? 'light' : 'error');
    speak(current.answerDe);
  };

  const handleGrade = async (grade: ReviewGrade) => {
    if (!current) return;
    await gradeReviewItem(current, grade);

    setTally((prev) => ({
      ...prev,
      correct: prev.correct + (verdict === 'correct' ? 1 : 0),
      close: prev.close + (verdict === 'close' ? 1 : 0),
      wrong: prev.wrong + (verdict === 'wrong' ? 1 : 0),
      again: prev.again + (grade === 'again' ? 1 : 0),
    }));

    setQueue((prev) => {
      if (!prev) return prev;
      // A forgotten item comes straight back, at the end of this same session —
      // the point of a failed retrieval is to retrieve it again soon, not never.
      const reinstate = grade === 'again' && prev.length < SESSION_LIMIT * 2 ? [...prev, current] : prev;
      return reinstate;
    });

    setAnswer('');
    setVerdict(null);
    setIndex((i) => i + 1);
  };

  if (queue === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-kz-black" role="status" aria-live="polite">
        <span className="font-arabic text-sm text-kz-inkDim">جارٍ تجهيز المراجعة…</span>
      </div>
    );
  }

  if (!queue.length) {
    const nextDueAt = (items || [])
      .map((i) => i.dueAt)
      .filter((dueAt) => dueAt > Date.now())
      .sort((a, b) => a - b)[0];
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-kz-black px-6 text-center text-kz-ink">
        <KatzuPresence state="all_caught_up" size="xl" />
        <h1 className="mt-4 kz-ar-title text-kz-ink">لا توجد مراجعة مستحقة الآن</h1>
        <p className="mt-2 max-w-xs kz-ar-body leading-relaxed text-kz-inkDim">
          {nextDueAt
            ? `ذاكرتك مرتاحة. سأعيد عليك ما تعلّمته ${formatGap(Date.now(), nextDueAt)} — ولا تحتاج أن تتذكّر شيئاً بنفسك.`
            : 'ابدأ مشهداً جديداً وسأبني مراجعتك من الكلمات التي تدرسها ومن أخطائك.'}
        </p>
        <div className="mt-6 w-full">
          <PrimaryAction hintAr="الراحة بين الجلسات جزء من الحفظ، لا انقطاعاً عنه." onClick={onBack}>
            العودة إلى الرحلة
          </PrimaryAction>
        </div>
      </div>
    );
  }

  if (isFinished) {
    const graded = tally.correct + tally.close + tally.wrong;
    const clean = graded >= 3 && tally.wrong === 0;
    return (
      <div className="relative min-h-screen bg-kz-black pb-36 text-kz-ink">
        <div className="mx-auto max-w-md px-5 pt-10">
          <KatzuPresence
            state={clean ? 'independent' : 'assisted'}
            size="lg"
            lineAr={
              clean
                ? 'استرجعت كل عنصر من أول محاولة — هذا هو الأثر الذي نريده.'
                : 'أنهيت مراجعة اليوم. ما أخطأت فيه سيعود أقرب من غيره، وهذا عمله.'
            }
          />
          <h1 className="mt-5 text-center kz-ar-title text-kz-ink">مراجعة اليوم</h1>

          <GlassCard className="mt-5" emphasis={clean ? 'earned' : 'none'}>
            <p className="kz-ar-caption text-kz-inkDim">ما حدث بالأرقام</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <GlassWell className="p-3 text-center">
                <div className="font-german text-lg font-bold text-kz-neon">{tally.correct}</div>
                <span className="kz-ar-micro text-kz-inkDim">من أول محاولة</span>
              </GlassWell>
              <GlassWell className="p-3 text-center">
                <div className="font-german text-lg font-bold text-kz-lavender">{tally.close}</div>
                <span className="kz-ar-micro text-kz-inkDim">أداة مختلفة</span>
              </GlassWell>
              <GlassWell className="p-3 text-center">
                <div className="font-german text-lg font-bold text-kz-warm">{tally.wrong}</div>
                <span className="kz-ar-micro text-kz-inkDim">يحتاج تثبيتاً</span>
              </GlassWell>
            </div>
            <p className="mt-3 kz-ar-micro leading-relaxed text-kz-inkDim">
              {remainingDue > 0
                ? `لا يزال ${remainingDue} عنصراً مستحقاً — جلسة أخرى قصيرة تكفي.`
                : 'لا شيء مستحق بعد الآن — سأعيدها عليك في الوقت المناسب.'}
            </p>
          </GlassCard>
        </div>

        <FloatingControl className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md rounded-t-[26px] border-t border-white/[0.06] p-4 pb-6">
          <PrimaryAction
            hintAr="المراجعة القادمة تُبنى من نتائج اليوم، وليست قائمة تنتظرك."
            onClick={onBack}
            icon={<ArrowLeft className="h-4 w-4 rotate-180" aria-hidden />}
          >
            العودة إلى الرحلة
          </PrimaryAction>
        </FloatingControl>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-kz-black pb-28 text-kz-ink">
      <div className="mx-auto max-w-md px-5 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="kz-ar-title text-kz-ink">مراجعة الذاكرة</h1>
            <p className="mt-1 kz-ar-micro leading-relaxed text-kz-inkDim">
              اكتب الألمانية من معناها العربي — الاسترجاع هو ما يثبّت.
            </p>
          </div>
          <GlassWell className="shrink-0 px-3 py-1.5">
            <span className="font-german text-xs font-bold text-kz-inkDim">
              {index + 1} / {queue.length}
            </span>
          </GlassWell>
        </div>
        <ProgressRail value={index} max={queue.length} className="mt-4" />

        {current && (
          <GlassCard className="mt-5">
            <div className="flex items-center gap-2">
              <span className={`kz-ar-micro ${KIND_TONE[current.kind]}`}>{KIND_LABELS[current.kind]}</span>
              {current.level && (
                <>
                  <span className="text-kz-inkFaint">·</span>
                  <span className="font-german text-[0.72rem] text-kz-inkFaint">{current.level}</span>
                </>
              )}
            </div>

            {/* The Arabic side: what it means, or the rule that was broken. */}
            <p className="mt-4 kz-ar-micro text-kz-inkFaint">
              {current.kind === 'mistake' ? 'القاعدة التي أخطأت فيها' : 'المعنى بالعربية'}
            </p>
            <p className="mt-1 kz-ar-title leading-relaxed text-kz-ink">{current.promptAr}</p>

            {current.kind === 'mistake' && current.contextDe && (
              <GlassWell className="mt-3 p-3">
                <span className="kz-ar-micro block text-kz-inkFaint">ما كتبته سابقاً</span>
                <GermanText className="mt-1 font-german text-sm text-kz-inkDim line-through">
                  {current.contextDe}
                </GermanText>
              </GlassWell>
            )}

            {verdict === null ? (
              <form onSubmit={handleCheck} className="mt-4 space-y-3">
                <input
                  type="text"
                  dir="ltr"
                  autoFocus
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="اكتب بالألمانية…"
                  aria-label="إجابتك بالألمانية"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 font-german text-base text-kz-ink outline-none placeholder:font-arabic placeholder:text-kz-inkFaint focus:border-kz-lavender/50"
                />
                <GlassButton variant="primary" size="lg" fullWidth type="submit" disabled={!answer.trim()}>
                  تحقّق من إجابتي
                </GlassButton>
              </form>
            ) : (
              <div className="mt-4 space-y-3">
                <GlassWell
                  className="p-3"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-start gap-2">
                    {verdict === 'correct' ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-kz-neon" aria-hidden />
                    ) : verdict === 'close' ? (
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-kz-lavender" aria-hidden />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-kz-warm" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <p className="kz-ar-caption font-bold text-kz-ink">
                        {verdict === 'correct'
                          ? 'إجابة صحيحة'
                          : verdict === 'close'
                            ? 'المعنى صحيح — لكن الأداة (der / die / das) ليست هي'
                            : 'ليس بعد — هذه هي الصيغة الصحيحة'}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <GermanText className="font-german text-sm font-bold text-kz-ink">
                          {current.answerDe}
                        </GermanText>
                        <button
                          type="button"
                          onClick={() => speak(current.answerDe)}
                          className="rounded-full p-1.5 text-kz-lavender transition-colors hover:bg-white/5"
                          aria-label="استمع للنطق الصحيح"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {current.explanationAr && (
                        <p className="mt-1.5 kz-ar-micro leading-relaxed text-kz-inkDim">
                          {current.explanationAr}
                        </p>
                      )}
                    </div>
                  </div>
                </GlassWell>

                <p className="text-center kz-ar-micro text-kz-inkFaint">
                  كيف كان استرجاعك؟ هذا ما يحدّد موعد عودتها.
                </p>
                {/* Equal weight on purpose: no option is nudged. */}
                <div className="flex gap-2">
                  <GlassButton variant="secondary" className="flex-1" onClick={() => handleGrade('again')}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    لم أتذكّر
                  </GlassButton>
                  <GlassButton variant="secondary" className="flex-1" onClick={() => handleGrade('hard')}>
                    بصعوبة
                  </GlassButton>
                  <GlassButton variant="secondary" className="flex-1" onClick={() => handleGrade('good')}>
                    بسهولة
                  </GlassButton>
                </div>
              </div>
            )}
          </GlassCard>
        )}

        <GlassButton variant="quiet" fullWidth className="mt-3" onClick={onBack}>
          إنهاء المراجعة والعودة للرحلة
        </GlassButton>
      </div>
    </div>
  );
};
