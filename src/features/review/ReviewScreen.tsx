import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { gradeReviewItem } from '@/lib/srs/store';
import { SESSION_LIMIT, buildReviewQueue, countDue, gradeAnswer, type AnswerVerdict } from '@/lib/srs/engine';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { GermanText } from '@/components/common/GermanText';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { triggerHaptic } from '@/lib/utils/haptics';
import { ArrowLeft, CheckCircle2, RotateCcw, Sparkles, Volume2, XCircle, Brain } from 'lucide-react';
import type { ReviewGrade, ReviewItemEntity } from '@/types/models';

export interface ReviewScreenProps {
  onBack: () => void;
}

const KIND_LABELS: Record<ReviewItemEntity['kind'], string> = {
  vocab: 'مفردة',
  phrase: 'جملة جاهزة',
  mistake: 'خطأ سابق',
};

/**
 * Retrieval practice, not recognition: the learner produces the German from the
 * Arabic prompt. Multiple choice would feel smoother and teach less, because
 * recognising an answer never requires retrieving it.
 */
const KIND_VARIANTS = {
  vocab: 'primary',
  phrase: 'learning',
  mistake: 'error',
} as const;

function formatGap(from: number, to: number): string {
  const minutes = Math.max(1, Math.round((to - from) / 60000));
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ساعة`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'غداً' : `${days} أيام`;
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({ onBack }) => {
  const items = useLiveQuery(() => db.review_items.where('userId').equals('current_user').toArray());

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
    setQueue(buildReviewQueue(items, Date.now(), SESSION_LIMIT));
  }, [items]);

  const remainingDue = useMemo(() => (items ? countDue(items, Date.now()) : 0), [items]);
  const current = queue && index < queue.length ? queue[index] : null;
  const isFinished = queue !== null && index >= queue.length;

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
      <div className="min-h-screen bg-black text-text-primary flex items-center justify-center" role="status" aria-live="polite">
        <span className="font-arabic text-text-secondary">جاري تجهيز المراجعة...</span>
      </div>
    );
  }

  if (!queue.length) {
    const nextDueAt = (items || [])
      .map((i) => i.dueAt)
      .filter((dueAt) => dueAt > Date.now())
      .sort((a, b) => a - b)[0];
    return (
      <div className="min-h-screen bg-black text-text-primary p-6 max-w-md mx-auto flex flex-col items-center justify-center text-center">
        <KatzuMascot name="peace" className="w-40 h-40 object-contain mb-4" />
        <h2 className="text-xl font-bold font-arabic mb-2">لا توجد مراجعة مستحقة الآن</h2>
        <p className="text-sm text-text-secondary font-arabic leading-relaxed max-w-xs">
          {nextDueAt
            ? `ذاكرتك مرتاحة. سأعيد عليك ما تعلمته ${formatGap(Date.now(), nextDueAt)} — وأنت لا تحتاج أن تتذكر شيئاً بنفسك.`
            : 'ابدأ مشهداً جديداً وسأبني لك مراجعتك من الكلمات التي تدرسها ومن أخطائك.'}
        </p>
        <Button className="mt-6" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" /> عد إلى المسار
        </Button>
      </div>
    );
  }

  if (isFinished) {
    const graded = tally.correct + tally.close + tally.wrong;
    return (
      <div className="min-h-screen bg-black text-text-primary p-6 max-w-md mx-auto flex flex-col justify-center">
        <Card variant="hero" glow className="text-center">
          <KatzuMascot name="celebrating" className="w-28 h-28 object-contain mx-auto mb-3" />
          <h2 className="text-xl font-bold font-arabic mb-1">أنهيت مراجعة اليوم</h2>
          <p className="text-xs text-text-secondary font-arabic mb-4">
            راجعت {graded} عنصراً — هذا ما جعل ما تعلمته يبقى.
          </p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-2xl bg-surface-subtle p-3">
              <div className="text-lg font-bold font-german text-status-success">{tally.correct}</div>
              <span className="text-[10px] font-arabic text-text-secondary">من أول محاولة</span>
            </div>
            <div className="rounded-2xl bg-surface-subtle p-3">
              <div className="text-lg font-bold font-german text-status-learning">{tally.close}</div>
              <span className="text-[10px] font-arabic text-text-secondary">قريب (الأداة)</span>
            </div>
            <div className="rounded-2xl bg-surface-subtle p-3">
              <div className="text-lg font-bold font-german text-status-error">{tally.wrong}</div>
              <span className="text-[10px] font-arabic text-text-secondary">يحتاج تثبيتاً</span>
            </div>
          </div>
          <p className="text-[11px] text-text-muted font-arabic mb-4">
            {remainingDue > 0
              ? `لا يزال ${remainingDue} عنصراً مستحقاً — جلسة أخرى قصيرة تكفي.`
              : 'لا شيء مستحق بعد الآن. سأعيدها عليك في الوقت المناسب.'}
          </p>
          <Button className="w-full" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" /> عد إلى المسار
          </Button>
        </Card>
      </div>
    );
  }

  const progressPercent = Math.round((index / queue.length) * 100);

  return (
    <div className="min-h-screen bg-black text-text-primary p-4 max-w-md mx-auto pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold font-arabic">مراجعة الذاكرة</h2>
          <p className="text-[11px] text-text-secondary font-arabic">
            اكتب الألمانية من معناها العربي — الاسترجاع هو ما يثبّت.
          </p>
        </div>
        <Badge variant="subtle" size="sm">
          <Brain className="w-3 h-3" />
          {index + 1} / {queue.length}
        </Badge>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle mb-5">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
      </div>

      {current && (
        <Card className="p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge variant={KIND_VARIANTS[current.kind]} size="sm">
              {KIND_LABELS[current.kind]}
            </Badge>
            {current.level && (
              <Badge variant="subtle" size="sm">
                {current.level}
              </Badge>
            )}
          </div>

          {/* The Arabic side: what it means, or the rule that was broken. */}
          <p className="text-[11px] text-text-muted font-arabic mb-1">
            {current.kind === 'mistake' ? 'القاعدة التي أخطأت فيها' : 'المعنى بالعربية'}
          </p>
          <div className="text-xl font-bold font-arabic text-text-primary leading-relaxed mb-3">
            {current.promptAr}
          </div>

          {current.kind === 'mistake' && current.contextDe && (
            <div className="rounded-2xl bg-surface-subtle p-3 mb-3">
              <span className="text-[10px] font-arabic text-text-muted block mb-1">ما كتبته سابقاً</span>
              <GermanText className="text-sm text-status-error line-through">{current.contextDe}</GermanText>
            </div>
          )}

          {verdict === null ? (
            <form onSubmit={handleCheck} className="space-y-3">
              <input
                type="text"
                dir="ltr"
                autoFocus
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="اكتب بالألمانية..."
                aria-label="إجابتك بالألمانية"
                className="w-full h-12 bg-surface-subtle border border-border-subtle focus:border-primary rounded-2xl px-4 text-base font-german outline-none transition-all"
              />
              <Button type="submit" className="w-full" disabled={!answer.trim()}>
                تحقّق من إجابتي
              </Button>
            </form>
          ) : (
            <div className="space-y-3">
              <div
                className={`flex items-start gap-2 rounded-2xl p-3 ${
                  verdict === 'correct'
                    ? 'bg-status-success/15 border border-status-success/40'
                    : verdict === 'close'
                      ? 'bg-status-learning/15 border border-status-learning/40'
                      : 'bg-status-error/15 border border-status-error/40'
                }`}
                role="status"
                aria-live="polite"
              >
                {verdict === 'correct' ? (
                  <CheckCircle2 className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
                ) : verdict === 'close' ? (
                  <Sparkles className="w-4 h-4 text-status-learning mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-status-error mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold font-arabic">
                    {verdict === 'correct'
                      ? 'إجابة صحيحة'
                      : verdict === 'close'
                        ? 'المعنى صحيح — لكن الأداة (der / die / das) ليست هي'
                        : 'ليس بعد — هذه هي الصيغة الصحيحة'}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <GermanText className="text-sm font-bold text-text-primary">{current.answerDe}</GermanText>
                    <button
                      type="button"
                      onClick={() => speak(current.answerDe)}
                      className="p-1 rounded-lg bg-surface-subtle hover:bg-primary/20 text-primary transition-colors"
                      aria-label="استمع للنطق الصحيح"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {current.explanationAr && (
                    <p className="mt-1.5 text-[11px] font-arabic text-text-secondary leading-relaxed">
                      {current.explanationAr}
                    </p>
                  )}
                </div>
              </div>

              <p className="text-[11px] font-arabic text-text-muted text-center">
                كيف كان استرجاعك؟ هذا ما يحدّد موعد عودتها.
              </p>
              <div className="flex gap-2">
                <Button variant="danger" size="sm" className="flex-1" onClick={() => handleGrade('again')}>
                  <RotateCcw className="w-3.5 h-3.5" /> لم أتذكر
                </Button>
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => handleGrade('hard')}>
                  بصعوبة
                </Button>
                <Button size="sm" className="flex-1" onClick={() => handleGrade('good')}>
                  سهل
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <button
        onClick={onBack}
        className="w-full text-center text-xs font-arabic text-text-muted hover:text-text-primary transition-colors py-2"
      >
        إنهاء المراجعة والعودة للمسار
      </button>
    </div>
  );
};
