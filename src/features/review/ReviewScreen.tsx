import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { workerClient } from '@/lib/api/workerClient';
import { gradeReviewItem } from '@/lib/srs/store';
import { SESSION_LIMIT, buildReviewQueue, countDue, type AnswerVerdict } from '@/lib/srs/engine';
import {
  buildReviewTask,
  buildWordBank,
  dedupeReviewItems,
  diffGermanTokens,
  gradeTaskAnswer,
  isServableReviewItem,
  type ReviewTask,
} from '@/lib/review/validate';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { GermanText } from '@/components/common/GermanText';
import { GlassCard, FloatingControl } from '@/components/glass/GlassCard';
import { GlassButton, PrimaryAction } from '@/components/glass/GlassButton';
import { Button } from '@/components/ui/Button';
import { GlassWell } from '@/components/glass/GlassSurface';
import { KatzuPresence } from '@/components/v2/KatzuPresence';
import { ProgressRail } from '@/components/v2/ProgressStrip';
import { triggerHaptic } from '@/lib/utils/haptics';
import { track } from '@/lib/analytics/client';
import { ArrowLeft, CheckCircle2, Lightbulb, RotateCcw, Sparkles, Volume2 } from 'lucide-react';
import type { ReviewGrade, ReviewItemEntity } from '@/types/models';
import { arCount } from '@/lib/i18n/arabicCount';

/** V31: agreement for the sentence under the tally. See `arabicCount`. */
const REVIEW_ITEM_FORMS = { one: 'عنصر', two: 'عنصرين', few: 'عناصر', many: 'عنصراً' } as const;

export interface ReviewScreenProps {
  onBack: () => void;
}

/** Both filters: a row must be valid AND produce a task the screen can show. */
function isShowableReviewItem(item: ReviewItemEntity): boolean {
  return isServableReviewItem(item) && buildReviewTask(item) !== null;
}

function formatGap(from: number, to: number): string {
  const minutes = Math.max(1, Math.round((to - from) / 60000));
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ساعة`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'غداً' : `${days} أيام`;
}

/** `die` + plural, unless the stored plural already carries its article. */
function pluralPhrase(task: ReviewTask): string | undefined {
  const plural = task.pluralDe?.trim();
  if (!plural) return undefined;
  return /^(der|die|das)\s/i.test(plural) ? plural : `die ${plural}`;
}

/**
 * Review — one explicit task per card.
 *
 * The owner's report from real use was "many questions are illogical, with no
 * clear question or no clear answer." A card used to mix a topic label, a
 * fragment and an answer, and changed the task underneath the learner. V41
 * decides the task first (`buildReviewTask`) and then renders exactly that task:
 * a German word from an Arabic word, a German sentence from an Arabic meaning,
 * a read-and-reveal meaning, or a correction with the learner's own sentence.
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
  // `null` = still answering. `giveup` = the learner asked for the answer on a
  // typed card (one block, one action). `self` = read-and-reveal meaning.
  const [revealed, setRevealed] = useState<'giveup' | 'self' | null>(null);
  // The hint is a second attempt aid, never a default: it unlocks only after the
  // learner has actually missed this item once in this session.
  const [hintOpen, setHintOpen] = useState(false);
  const [missed, setMissed] = useState<Record<string, boolean>>({});
  // One immediate retry per item, so a wrong attempt can use the hint without
  // turning the session into an endless loop for someone who keeps revealing.
  const [retried, setRetried] = useState<Record<string, boolean>>({});
  const [tally, setTally] = useState({ correct: 0, close: 0, wrong: 0 });
  const [saving, setSaving] = useState(false);
  // Guards the one immediate 'again' write per queue position (a reveal followed
  // by a click must never grade the same attempt twice).
  const recordedRef = useRef<number | null>(null);
  const { speak } = useSpeechOutput();

  useEffect(() => {
    if (startedRef.current || !items) return;
    startedRef.current = true;
    // Suppressed, duplicate, or unanswerable items never reach the learner.
    const due = buildReviewQueue(dedupeReviewItems(items.filter(isShowableReviewItem)), Date.now(), SESSION_LIMIT);
    setQueue(due);
    if (due.length > 0) track('review_started', { count: due.length });
  }, [items]);

  const remainingDue = useMemo(
    () => (items ? countDue(items.filter(isShowableReviewItem), Date.now()) : 0),
    [items],
  );
  const current = queue && index < queue.length ? queue[index] : null;
  const isFinished = queue !== null && index >= queue.length;
  const task = useMemo(() => (current ? buildReviewTask(current) : null), [current]);

  // The hint is the words of the answer. It is only useful where the learner
  // must PRODUCE German; for a correction those words are the answer, and for a
  // read-and-reveal card the answer is already on screen.
  const wordBank = useMemo(
    () => (task && task.typed && task.kind !== 'correction' && task.answerDe ? buildWordBank(task.answerDe) : []),
    [task],
  );
  const canHint = Boolean(current && task?.typed && wordBank.length > 0 && missed[current.refId]);
  const canSubmit = Boolean(task?.typed && answer.trim());

  const resetCard = () => {
    setAnswer('');
    setVerdict(null);
    setRevealed(null);
    setHintOpen(false);
    recordedRef.current = null;
  };

  const advance = (requeue: boolean) => {
    if (!current) return;
    const alreadyRetried = Boolean(retried[current.refId]);
    if (requeue && !alreadyRetried) {
      setRetried((prev) => ({ ...prev, [current.refId]: true }));
      setQueue((prev) => {
        if (!prev) return prev;
        // A forgotten item comes straight back once — the point of a failed
        // retrieval is to retrieve it again with the hint available, not never.
        return prev.length < SESSION_LIMIT * 2 ? [...prev, current] : prev;
      });
    }
    resetCard();
    setIndex((i) => i + 1);
  };

  const recordAgain = (item: ReviewItemEntity) => {
    if (recordedRef.current === index) return;
    recordedRef.current = index;
    setMissed((prev) => (prev[item.refId] ? prev : { ...prev, [item.refId]: true }));
    setTally((prev) => ({ ...prev, wrong: prev.wrong + 1 }));
    void gradeReviewItem(item, 'again').catch(() => {
      // Offline storage hiccup: the card stays local and is re-offered.
    });
  };

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
  }, [isFinished, items, user?.sessionToken]);

  const speakAnswer = () => {
    if (task?.answerDe) speak(task.answerDe);
  };

  const handleCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !task?.typed || !answer.trim()) return;
    const result = gradeTaskAnswer(task, answer);
    setVerdict(result);
    setRevealed(null);
    triggerHaptic(result === 'correct' ? 'success' : result === 'close' ? 'light' : 'error');
    speakAnswer();
    // The article is part of the answer: a wrong/missing article is a miss, not
    // a clean recall. It is recorded now so the schedule is honest even if the
    // learner closes the app on the feedback.
    if (result !== 'correct') recordAgain(current);
  };

  const handleReveal = () => {
    if (!current || !task) return;
    track('review_revealed', { skill: 'review', kind: current.kind });
    triggerHaptic('light');
    if (task.typed) {
      recordedRef.current = index;
      setMissed((prev) => (prev[current.refId] ? prev : { ...prev, [current.refId]: true }));
      setTally((prev) => ({ ...prev, wrong: prev.wrong + 1 }));
      void gradeReviewItem(current, 'again').catch(() => {});
      setRevealed('giveup');
      speakAnswer();
      return;
    }
    setRevealed('self');
    speakAnswer();
  };

  const handleRating = async (grade: ReviewGrade) => {
    if (!current || saving) return;
    setSaving(true);
    const assisted = revealed === 'self';
    try {
      await gradeReviewItem(current, grade);
      setTally((prev) =>
        grade === 'again'
          ? { ...prev, wrong: prev.wrong + 1 }
          : assisted || grade === 'hard'
            ? { ...prev, close: prev.close + 1 }
            : { ...prev, correct: prev.correct + 1 },
      );
      // The answer is on screen; repeating it immediately is copying, not
      // retrieval. The scheduler brings a forgotten item back soon.
      advance(false);
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    // A wrong answer gets one immediate retry (so the hint is usable); a reveal
    // means the learner has seen the answer and must move on.
    advance(verdict !== null);
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
      .filter(isShowableReviewItem)
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
                <span className="kz-ar-micro text-kz-inkDim">بمساعدة</span>
              </GlassWell>
              <GlassWell className="p-3 text-center">
                <div className="font-german text-lg font-bold text-kz-warm">{tally.wrong}</div>
                <span className="kz-ar-micro text-kz-inkDim">يحتاج تثبيتاً</span>
              </GlassWell>
            </div>
            <p className="mt-3 kz-ar-micro leading-relaxed text-kz-inkDim">
              {remainingDue > 0
                ? `لا يزال ${arCount(remainingDue, REVIEW_ITEM_FORMS)} مستحقاً — جلسة أخرى قصيرة تكفي.`
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

  if (!current || !task) {
    // A stale queue entry is not a dead end: skip it without inventing a task.
    return (
      <div className="flex min-h-screen items-center justify-center bg-kz-black">
        <button type="button" className="kz-ar-body text-kz-inkDim" onClick={() => advance(false)}>
          متابعة
        </button>
      </div>
    );
  }

  const plural = pluralPhrase(task);
  const correctionDiff = task.wrongDe ? diffGermanTokens(task.wrongDe, task.answerDe ?? '') : null;
  const answerDiff = task.answerDe ? diffGermanTokens(task.answerDe, answer) : null;

  return (
    <div className="flex min-h-screen flex-col bg-kz-black text-kz-ink">
      <div className="mx-auto w-full max-w-md px-5 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="kz-ar-title text-kz-ink">مراجعة الذاكرة</h1>
            <p className="mt-1 kz-ar-micro leading-relaxed text-kz-inkDim">
              كل بطاقة تسألك سؤالاً واحداً واضحاً. الاسترجاع هو ما يثبّت.
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            aria-label="إنهاء المراجعة والعودة للرحلة"
            data-testid="review-close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-white/10 bg-white/[0.04]"
          >
            <ArrowLeft className="h-5 w-5 rotate-180 text-kz-inkDim" aria-hidden />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="kz-ar-micro text-kz-inkDim" data-testid="review-counter">
            {index + 1} من {queue.length}
          </span>
          <span className="kz-ar-micro text-kz-inkFaint">مراجعة الذاكرة</span>
        </div>
        <ProgressRail value={index} max={queue.length} className="mt-1.5" />

        <GlassCard className="mt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Screen 3.2: ONE type chip, and it names the task type only. */}
            <span className="kz-ar-micro rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-kz-lavender">
              {task.chipAr}
            </span>
            {current.level && (
              <span className="font-german text-micro rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-kz-inkFaint">
                {current.level}
              </span>
            )}
          </div>

          <h2 className="mt-3.5 kz-ar-caption font-bold text-kz-ink">{task.headerAr}</h2>

          {task.kind === 'sentence_de_to_ar' ? (
            <>
              <p className="mt-1.5 kz-ar-micro text-kz-inkFaint">ماذا تعني هذه الجملة؟</p>
              <div className="mt-1 flex items-start gap-2">
                <GermanText className="block text-2xl font-bold leading-relaxed text-kz-ink">
                  {task.sourceDe}
                </GermanText>
                <button
                  type="button"
                  onClick={speakAnswer}
                  className="mt-1 rounded-full p-1.5 text-kz-lavender transition-colors pointer-hover:bg-white/5"
                  aria-label="استمع للنطق الألماني"
                >
                  <Volume2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1.5 kz-ar-title leading-relaxed text-kz-ink">{task.meaningAr}</p>
              {task.kind === 'vocab' && task.glossAr && (
                <p className="mt-1 kz-ar-caption leading-relaxed text-kz-inkDim">{task.glossAr}</p>
              )}
            </>
          )}

          {task.kind === 'correction' && task.wrongDe && correctionDiff && (
            <GlassWell className="mt-3 p-3">
              <span className="kz-ar-micro block text-kz-inkFaint">إجابتك السابقة</span>
              <p className="mt-1 font-german text-sm leading-relaxed text-kz-inkDim" dir="ltr" lang="de">
                <bdi dir="ltr" lang="de">
                  {correctionDiff.map((token, tokenIndex) => (
                    <React.Fragment key={`${token.text}-${tokenIndex}`}>
                      <span
                        className={
                          token.changed
                            ? 'rounded-sm bg-kz-warm/15 text-kz-warm underline decoration-kz-warm/50'
                            : ''
                        }
                      >
                        {token.text}
                      </span>
                      {tokenIndex < correctionDiff.length - 1 ? ' ' : ''}
                    </React.Fragment>
                  ))}
                </bdi>
              </p>
            </GlassWell>
          )}

          {task.kind === 'sentence_ar_to_de' && task.glossAr && (
            <p className="mt-2 kz-ar-micro leading-relaxed text-kz-inkDim">{task.glossAr}</p>
          )}

          {verdict === null && revealed === null && (
            <>
              {task.typed ? (
                <form onSubmit={handleCheck} className="mt-4 space-y-3">
                  {task.kind === 'correction' && (
                    <p className="kz-ar-micro font-semibold text-kz-ink">أعد كتابتها صحيحة</p>
                  )}

                  {canHint && !hintOpen && (
                    <GlassButton
                      type="button"
                      variant="outline"
                      fullWidth
                      className="min-h-[44px]"
                      onClick={() => {
                        setHintOpen(true);
                      }}
                    >
                      <Lightbulb className="h-4 w-4" aria-hidden />
                      تلميح: أول كلمات الإجابة
                    </GlassButton>
                  )}

                  {hintOpen && wordBank.length > 0 && (
                    <div data-testid="word-bank">
                      <span className="kz-ar-micro block text-kz-inkFaint">اضغط الكلمة لتضيفها</span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5" dir="ltr">
                        {wordBank.map((word, wordIndex) => (
                          <button
                            type="button"
                            key={`${word}-${wordIndex}`}
                            onClick={() => {
                              track('word_bank_tapped', { skill: 'review', kind: current.kind });
                              setAnswer((prev) => (prev ? `${prev} ${word}` : word));
                            }}
                            className="rounded-xl kz-chip border border-white/10 bg-white/5 px-2.5 py-1 font-german text-sm text-kz-ink transition-colors pointer-hover:border-kz-lavender/50"
                          >
                            {word}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <input
                    type="text"
                    aria-label="إجابتك بالألمانية"
                    dir="ltr"
                    lang="de"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoFocus
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder={
                      task.kind === 'vocab'
                        ? 'اكتب الكلمة الألمانية…'
                        : task.kind === 'correction'
                          ? 'أعد كتابتها صحيحة…'
                          : 'اكتب الجملة بالألمانية…'
                    }
                    data-testid="review-input"
                    className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-left font-german text-base text-kz-ink placeholder:font-arabic placeholder:text-kz-inkFaint focus:border-kz-lavender/50"
                  />

                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    type="submit"
                    disabled={!canSubmit}
                    style={canSubmit ? undefined : { opacity: 1 }}
                    className={canSubmit ? '' : 'kz-primary-disabled'}
                  >
                    تحقّق من إجابتي
                  </Button>

                  <GlassButton
                    type="button"
                    variant="outline"
                    fullWidth
                    className="min-h-[44px]"
                    onClick={handleReveal}
                  >
                    لا أتذكّر — أرني الإجابة
                  </GlassButton>
                </form>
              ) : (
                <div className="mt-4 space-y-3">
                  <Button variant="primary" size="lg" fullWidth onClick={handleReveal}>
                    اكشف المعنى
                  </Button>
                  <GlassButton
                    type="button"
                    variant="outline"
                    fullWidth
                    className="min-h-[44px]"
                    onClick={() => {
                      track('review_revealed', { skill: 'review', kind: current.kind });
                      setRevealed('self');
                      speakAnswer();
                    }}
                  >
                    لا أتذكّر — أرني المعنى
                  </GlassButton>
                </div>
              )}
            </>
          )}

          {verdict !== null && (
            <div className="kz-flip-in mt-4 space-y-3">
              <GlassWell
                className={`p-3 ${verdict === 'correct' ? 'kz-pop' : verdict === 'close' ? '' : 'kz-shake'}`}
                role="status"
                aria-live="polite"
              >
                <div className="flex items-start gap-2">
                  {verdict === 'correct' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-kz-neon" aria-hidden />
                  ) : verdict === 'close' ? (
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-kz-lavender" aria-hidden />
                  ) : null}
                  <div className="min-w-0">
                    <p className="kz-ar-caption font-bold text-kz-ink">
                      {verdict === 'correct'
                        ? 'إجابة صحيحة'
                        : verdict === 'close'
                          ? 'المعنى صحيح — راجع الأداة'
                          : 'الصيغة الصحيحة'}
                    </p>
                    <div className="mt-1.5 flex items-start gap-2">
                      <bdi dir="ltr" lang="de" className="font-german text-sm font-bold leading-relaxed text-kz-ink">
                        {(answerDiff ?? []).map((token, tokenIndex) => (
                          <React.Fragment key={`${token.text}-${tokenIndex}`}>
                            <span
                              className={
                                verdict === 'correct'
                                  ? ''
                                  : token.changed
                                    ? 'rounded-sm bg-kz-warm/15 text-kz-warm underline decoration-kz-warm/50'
                                    : ''
                              }
                            >
                              {token.text}
                            </span>
                            {tokenIndex < (answerDiff?.length ?? 0) - 1 ? ' ' : ''}
                          </React.Fragment>
                        ))}
                      </bdi>
                      <button
                        type="button"
                        onClick={speakAnswer}
                        className="rounded-full p-1 text-kz-lavender transition-colors pointer-hover:bg-white/5"
                        aria-label="استمع للنطق الصحيح"
                      >
                        <Volume2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                    <p className="mt-1.5 kz-ar-micro leading-relaxed text-kz-inkDim">{task.meaningAr}</p>
                    {plural && (
                      <p className="mt-1 kz-ar-micro leading-relaxed text-kz-inkDim">
                        الجمع: <GermanText className="font-german text-kz-ink">{plural}</GermanText>
                      </p>
                    )}
                    {task.reasonAr && (
                      <p className="mt-1.5 kz-ar-micro leading-relaxed text-kz-inkDim">{task.reasonAr}</p>
                    )}
                  </div>
                </div>
              </GlassWell>

              {verdict === 'correct' ? (
                <>
                  <p className="text-center kz-ar-micro text-kz-inkFaint">
                    كيف كان استرجاعك؟ هذا ما يحدّد موعد عودتها.
                  </p>
                  <div className="flex gap-2">
                    <GlassButton variant="secondary" className="flex-1" disabled={saving} onClick={() => handleRating('hard')}>
                      صعبة
                    </GlassButton>
                    <GlassButton variant="secondary" className="flex-1" disabled={saving} onClick={() => handleRating('good')}>
                      سهلة
                    </GlassButton>
                  </div>
                </>
              ) : (
                <Button variant="primary" size="lg" fullWidth onClick={handleNext}>
                  التالي
                </Button>
              )}
            </div>
          )}

          {revealed === 'giveup' && (
            <div className="kz-flip-in mt-4 space-y-3">
              <GlassWell className="p-3" role="status" aria-live="polite">
                <p className="kz-ar-caption font-bold text-kz-ink">الصيغة الصحيحة</p>
                <div className="mt-1.5 flex items-start gap-2">
                  <GermanText className="font-german text-sm font-bold leading-relaxed text-kz-ink">
                    {task.answerDe}
                  </GermanText>
                  <button
                    type="button"
                    onClick={speakAnswer}
                    className="rounded-full p-1 text-kz-lavender transition-colors pointer-hover:bg-white/5"
                    aria-label="استمع للنطق الصحيح"
                  >
                    <Volume2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <p className="mt-1.5 kz-ar-micro leading-relaxed text-kz-inkDim">{task.meaningAr}</p>
                {plural && (
                  <p className="mt-1 kz-ar-micro leading-relaxed text-kz-inkDim">
                    الجمع: <GermanText className="font-german text-kz-ink">{plural}</GermanText>
                  </p>
                )}
                {task.reasonAr && (
                  <p className="mt-1.5 kz-ar-micro leading-relaxed text-kz-inkDim">{task.reasonAr}</p>
                )}
              </GlassWell>
              <Button variant="primary" size="lg" fullWidth onClick={handleNext}>
                فهمت، التالي
              </Button>
            </div>
          )}

          {revealed === 'self' && (
            <div className="kz-flip-in mt-4 space-y-3">
              <GlassWell className="p-3" role="status" aria-live="polite">
                <p className="kz-ar-caption font-bold text-kz-ink">المعنى</p>
                <p className="mt-1.5 kz-ar-title leading-relaxed text-kz-ink">{task.meaningAr}</p>
                {task.glossAr && (
                  <p className="mt-1.5 kz-ar-micro leading-relaxed text-kz-inkDim">{task.glossAr}</p>
                )}
              </GlassWell>
              <p className="text-center kz-ar-micro text-kz-inkFaint">
                كيف كان فهمك؟ هذا ما يحدّد موعد عودتها.
              </p>
              <div className="flex gap-2">
                <GlassButton variant="secondary" className="flex-1" disabled={saving} onClick={() => handleRating('again')}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  لم أتذكّر
                </GlassButton>
                <GlassButton variant="secondary" className="flex-1" disabled={saving} onClick={() => handleRating('hard')}>
                  بصعوبة
                </GlassButton>
                <GlassButton variant="secondary" className="flex-1" disabled={saving} onClick={() => handleRating('good')}>
                  بسهولة
                </GlassButton>
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
};
