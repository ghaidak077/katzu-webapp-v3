import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { workerClient } from '@/lib/api/workerClient';
import { gradeReviewItem } from '@/lib/srs/store';
import { SESSION_LIMIT, buildReviewQueue, countDue, gradeAnswer, gradeCorrectionRetype, type AnswerVerdict } from '@/lib/srs/engine';
import { buildWordBank, clozeContext, dedupeReviewItems, gradeArabicAnswer, isServableReviewItem } from '@/lib/review/validate';
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
  // "I could not recall it" — the explicit way out the screen used to lack. Before
  // this, a learner who simply did not know a word had no move except to type a
  // guess and be graded, which made the honest answer impossible to give.
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState({ correct: 0, close: 0, wrong: 0, again: 0 });
  const { speak } = useSpeechOutput();

  useEffect(() => {
    if (startedRef.current || !items) return;
    startedRef.current = true;
    // Suppressed and duplicate items never reach the learner (V28 Stage 1B).
    const due = buildReviewQueue(dedupeReviewItems(items.filter(isServableReviewItem)), Date.now(), SESSION_LIMIT);
    setQueue(due);
    if (due.length > 0) track('review_started', { count: due.length });
  }, [items]);

  const remainingDue = useMemo(() => (items ? countDue(items, Date.now()) : 0), [items]);
  const current = queue && index < queue.length ? queue[index] : null;
  const isFinished = queue !== null && index >= queue.length;

  // The word bank helps only where the learner must PRODUCE German they may not
  // own. For `de_to_ar` the prompt is the German, and for a mistake correction the
  // words ARE the answer — handing either over would erase the task.
  const wordBank = useMemo(
    () =>
      current && current.kind !== 'mistake' && current.direction !== 'de_to_ar'
        ? buildWordBank(current.answerDe)
        : [],
    [current],
  );

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

  const handleReveal = () => {
    if (!current) return;
    // The give-up signal the word bank is meant to reduce: an explicit reveal,
    // recorded with the card's kind so it can be compared against bank use.
    track('review_revealed', { skill: 'review', kind: current.kind });
    setRevealed(true);
    // A reveal is a miss. It is tallied through `handleGrade` (`verdict: 'wrong'`
    // is exactly the miss bucket) so the item is counted once, not twice.
    setVerdict('wrong');
    triggerHaptic('light');
    speak(current.answerDe);
  };

  const handleCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !answer.trim()) return;
    const result =
      current.direction === 'de_to_ar'
        ? gradeArabicAnswer(current.promptAr, answer)
        : current.kind === 'mistake'
          ? gradeCorrectionRetype(current.answerDe, answer)
          : gradeAnswer(current.answerDe, answer);
    setRevealed(false);
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
    setRevealed(false);
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
              اكتب الألمانية من معناها العربي، أو المعنى من الألمانية — الاسترجاع هو ما يثبّت.
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
                  <span className="font-german text-micro text-kz-inkFaint">{current.level}</span>
                </>
              )}
            </div>

            {/* The Arabic side: what it means, or the rule that was broken. */}
            <p className="mt-4 kz-ar-micro text-kz-inkFaint">
              {current.direction === 'de_to_ar'
                ? 'المعنى الألماني — اكتب المعنى بالعربية'
                : current.kind === 'mistake'
                  ? 'صحّح الجملة التي كتبتها سابقاً'
                  : 'المعنى بالعربية'}
            </p>
            {current.direction === 'de_to_ar' ? (
              <GermanText className="mt-1 block text-2xl font-bold leading-relaxed text-kz-ink">
                {current.answerDe}
              </GermanText>
            ) : (
              <p className="mt-1 kz-ar-title leading-relaxed text-kz-ink">{current.promptAr}</p>
            )}

            {current.kind === 'mistake' && current.grammarId && current.grammarReference?.id === current.grammarId && (
              <GlassWell className="mt-3 p-3">
                <span className="kz-ar-micro block text-kz-inkFaint">قاعدة من التدريب الموجّه</span>
                <p className="mt-1 kz-ar-caption font-semibold text-kz-lavender">{current.grammarReference.titleAr}</p>
                <p className="mt-1 kz-ar-micro leading-relaxed text-kz-inkDim">{current.grammarReference.ruleAr}</p>
                <GermanText className="mt-1 block font-german text-xs text-kz-inkDim">
                  {current.grammarReference.exampleDe}
                </GermanText>
              </GlassWell>
            )}

            {current.kind === 'mistake' && current.contextDe && (
              <GlassWell className="mt-3 p-3">
                <span className="kz-ar-micro block text-kz-inkFaint">ما كتبته سابقاً</span>
                <GermanText className="mt-1 font-german text-sm text-kz-inkDim line-through">
                  {current.contextDe}
                </GermanText>
              </GlassWell>
            )}

            {current.direction !== 'de_to_ar' &&
              current.kind !== 'mistake' &&
              (() => {
                const cloze = clozeContext(current.contextDe, current.answerDe);
                return cloze ? (
                  <GlassWell className="mt-3 p-3">
                    <span className="kz-ar-micro block text-kz-inkFaint">في السياق</span>
                    <GermanText className="mt-1 block font-german text-sm text-kz-inkDim">{cloze}</GermanText>
                  </GlassWell>
                ) : null;
              })()}

            {verdict === null ? (
              <form onSubmit={handleCheck} className="mt-4 space-y-3">
                {/* The words of the sentence, tappable: the learner who knows the
                    meaning but not the vocabulary can still build the answer. */}
                {wordBank.length > 0 && (
                  <div data-testid="word-bank">
                    <span className="kz-ar-micro block text-kz-inkFaint">بنك الكلمات — اضغط لتضيف الكلمة</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5" dir="ltr">
                      {wordBank.map((word, wordIndex) => (
                        <button
                          type="button"
                          key={`${word}-${wordIndex}`}
                          onClick={() => {
                            track('word_bank_tapped', { skill: 'review', kind: current.kind });
                            setAnswer((prev) => (prev ? `${prev} ${word}` : word));
                          }}
                          className="rounded-xl kz-chip border border-white/10 bg-white/5 px-2.5 py-1 font-german text-sm text-kz-ink transition-colors hover:border-kz-lavender/50"
                        >
                          {word}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <input
                  type="text"
                  dir={current.direction === 'de_to_ar' ? 'rtl' : 'ltr'}
                  autoFocus
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={current.direction === 'de_to_ar' ? 'اكتب المعنى بالعربية…' : 'اكتب بالألمانية…'}
                  aria-label={current.direction === 'de_to_ar' ? 'إجابتك بالعربية' : 'إجابتك بالألمانية'}
                  className={`h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-base text-kz-ink placeholder:font-arabic placeholder:text-kz-inkFaint focus:border-kz-lavender/50 ${current.direction === 'de_to_ar' ? 'font-arabic' : 'font-german'}`}
                />
                <GlassButton variant="primary" size="lg" fullWidth type="submit" disabled={!answer.trim()}>
                  تحقّق من إجابتي
                </GlassButton>
                {/* The honest way out: no guess, no shame, just the answer and a
                    soon-due repeat. */}
                <button
                  type="button"
                  onClick={handleReveal}
                  className="kz-ar-micro w-full text-center text-kz-inkDim underline decoration-dotted underline-offset-4 transition-colors hover:text-kz-ink"
                >
                  لا أتذكّر — أرني الإجابة
                </button>
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
                          {current.direction === 'de_to_ar' ? current.promptAr : current.answerDe}
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

                {revealed && (
                  <p className="text-center kz-ar-micro text-kz-inkDim">
                    كشفت الإجابة — الأصدق أن تختار «لم أتذكّر» فتعود قريباً.
                  </p>
                )}
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
