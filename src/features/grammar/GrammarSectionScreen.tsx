import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { GermanText } from '@/components/common/GermanText';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { enrolMistake } from '@/lib/srs/store';
import {
  buildGrammarExercises,
  gradeGrammarAttempt,
  grammarAttemptMistake,
  seededRng,
  type GrammarExercise,
} from '@/lib/grammar/exercises';
import {
  buildGrammarPath,
  isQualifyingAttempt,
  isTestOutPass,
  lessonState,
  mixedReviewLessonIds,
} from '@/lib/grammar/path';
import { markLessonTestedOut, recordLessonAttempt } from '@/lib/grammar/pathStore';
import type { GrammarEntity } from '@/types/models';
import { SCENARIO_GRAMMAR_IDS } from '@/lib/content/scenarioGrammar';
import { Check, X, RotateCcw, ArrowLeft, Lock, CheckCircle2, FastForward, Trophy } from 'lucide-react';
import { triggerHaptic } from '@/lib/utils/haptics';

export interface GrammarSectionScreenProps {
  onBack: () => void;
  onOpenScenario: (scenarioId: string) => void;
}

/**
 * القواعد as a locked PATH (V28 Stage 2B), replacing the flat level list.
 *
 * The rows are ordered into one course (A0 → B2, one lesson after another by
 * `orderGrammarLessons`) and only the frontier is open: a lesson unlocks when the
 * one before it is passed. The pass rule is the pure `lessonState` — a threshold
 * reached in at least two separate sessions — so one lucky answer never promotes
 * anyone, and a deliberate test-out is the honest shortcut. A learner placed
 * above the start sees the earlier lessons as optional review, never a wall.
 *
 * The screen owns no rules: it reads `buildGrammarPath`, records attempts through
 * `pathStore`, and keeps the same memory contract the section always had (a
 * genuinely wrong production writes a mistake row and enrols a review item).
 */

/** The scenario each live grammar row teaches (SCENARIO_GRAMMAR_IDS, inverted). */
const GRAMMAR_SCENARIOS: Record<string, string> = Object.entries(SCENARIO_GRAMMAR_IDS).reduce<Record<string, string>>(
  (acc, [scenarioId, ids]) => {
    for (const id of ids) if (!acc[id]) acc[id] = scenarioId;
    return acc;
  },
  {},
);

type Verdict = 'correct' | 'close' | 'wrong';

interface AttemptState {
  text: string;
  verdict: Verdict | null;
}

const verdictStyle: Record<Verdict, string> = {
  correct: 'text-status-success',
  close: 'text-status-learning',
  wrong: 'text-status-error',
};

/** One exercise: prompt, input, verdict, and its Arabic feedback line. */
const ExerciseCard: React.FC<{
  exercise: GrammarExercise;
  attempt: AttemptState | undefined;
  onType: (text: string) => void;
  onCheck: () => void;
  onRetry: () => void;
  reviewLabel?: string;
}> = ({ exercise, attempt, onType, onCheck, onRetry, reviewLabel }) => (
  <Card className="p-4 space-y-2">
    {reviewLabel && (
      <p className="text-[10px] font-arabic font-bold text-primary">{reviewLabel}</p>
    )}
    <p className="text-xs font-arabic text-text-muted">{exercise.promptAr}</p>
    {exercise.displayDe && (
      <GermanText className="block text-sm text-text-primary">{exercise.displayDe}</GermanText>
    )}
    {exercise.displayAr && <p className="text-sm font-arabic text-text-primary">{exercise.displayAr}</p>}
    {exercise.tokens && (
      <div className="flex flex-wrap gap-1.5">
        {exercise.tokens.map((token, tokenIndex) => (
          <span
            key={tokenIndex}
            className="rounded-lg bg-surface-subtle border border-border-subtle px-2 py-1 font-german text-xs text-text-primary"
          >
            {token}
          </span>
        ))}
      </div>
    )}
    <div className="flex gap-2">
      <input
        type="text"
        dir="ltr"
        value={attempt?.text || ''}
        onChange={(event) => onType(event.target.value)}
        placeholder="اكتب بالألمانية"
        className="h-10 min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface-subtle px-3 font-german text-xs text-text-primary outline-none placeholder:font-arabic placeholder:text-text-muted focus:border-primary/60"
      />
      <Button size="sm" onClick={onCheck}>
        تحقّق
      </Button>
    </div>
    {attempt?.verdict && (
      <div className="flex items-start gap-1.5">
        {attempt.verdict === 'correct' ? (
          <p className={`flex items-center gap-1.5 text-[11px] font-arabic ${verdictStyle.correct}`}>
            <Check className="w-3.5 h-3.5 shrink-0" />
            صحيحة.
          </p>
        ) : attempt.verdict === 'close' ? (
          <p className={`text-[11px] font-arabic ${verdictStyle.close}`}>
            قريبة جداً — القاعدة نفسها لكن بصيغة مختلفة. قارن: <GermanText>{exercise.answerDe}</GermanText>
          </p>
        ) : (
          <div className="space-y-1">
            <p className={`flex items-center gap-1.5 text-[11px] font-arabic ${verdictStyle.wrong}`}>
              <X className="w-3.5 h-3.5 shrink-0" />
              ليست صحيحة بعد. الصواب: <GermanText>{exercise.answerDe}</GermanText>
            </p>
            <p className="text-[10px] font-arabic text-text-muted">سجّلنا المحاولة في ذاكرتك — سنعيد إليك هذه القاعدة.</p>
            <button
              onClick={onRetry}
              className="flex items-center gap-1 text-[11px] font-arabic text-primary hover:underline"
            >
              <RotateCcw className="w-3 h-3" />
              أعد المحاولة من جديد
            </button>
          </div>
        )}
      </div>
    )}
  </Card>
);

const GrammarSectionScreen: React.FC<GrammarSectionScreenProps> = ({ onBack, onOpenScenario }) => {
  const grammar = useLiveQuery(() => db.grammar.toArray()) || [];
  const progressRows = useLiveQuery(() => db.grammar_lessons.toArray()) || [];
  const user = useLiveQuery(() => db.users.get('current_user'));

  const progress = useMemo(
    () => Object.fromEntries(progressRows.map((row) => [row.lessonId, row])),
    [progressRows],
  );
  const path = useMemo(
    () => buildGrammarPath(grammar, progress, user?.cefrLevel),
    [grammar, progress, user?.cefrLevel],
  );

  const [openId, setOpenId] = useState<string | null>(null);
  // One id per lesson sitting: two attempts in the same sitting are one session,
  // which is what makes the two-session pass rule mean anything.
  const [sessionId, setSessionId] = useState('');
  const [attempts, setAttempts] = useState<Record<string, AttemptState>>({});
  const [submitted, setSubmitted] = useState<'none' | 'attempt' | 'testout_pass' | 'testout_fail'>('none');
  const [checkingOut, setCheckingOut] = useState(false);

  const openRow = openId ? grammar.find((row) => row.id === openId) : null;
  const openIndex = openId ? path.nodes.findIndex((node) => node.lesson.id === openId) : -1;
  const openNode = openIndex >= 0 ? path.nodes[openIndex] : null;
  const openState = openNode ? lessonState(progress[openNode.lesson.id]) : 'not_started';

  const exercises = useMemo(
    () => (openRow ? buildGrammarExercises(openRow, seededRng(42)) : []),
    [openRow],
  );
  // A small mixed review of the lessons just before this one (retrieval, not
  // re-reading) — one exercise each, deterministic, only for an unlocked lesson.
  const reviewItems = useMemo(() => {
    type ReviewItem = { row: GrammarEntity; exercise: GrammarExercise };
    if (!openRow || openIndex < 0) return [] as ReviewItem[];
    return mixedReviewLessonIds(
      path.nodes.map((node) => node.lesson),
      openIndex,
      2,
    )
      .map((id) => grammar.find((row) => row.id === id))
      .filter((row): row is GrammarEntity => Boolean(row))
      .map((row): ReviewItem | null => {
        const exercise = buildGrammarExercises(row, seededRng(7))[0];
        return exercise ? { row, exercise } : null;
      })
      .filter((item): item is ReviewItem => Boolean(item));
  }, [openRow, openIndex, path.nodes, grammar]);

  const attemptKey = (prefix: string, index: number) => `${prefix}:${index}`;

  const openLesson = (id: string) => {
    setOpenId(id);
    setSessionId(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setAttempts({});
    setSubmitted('none');
    setCheckingOut(false);
  };

  const closeLesson = () => {
    setOpenId(null);
    setAttempts({});
    setSubmitted('none');
    setCheckingOut(false);
  };

  const handleAttempt = async (
    row: GrammarEntity,
    exercise: GrammarExercise,
    key: string,
    given: string,
  ) => {
    const verdict = gradeGrammarAttempt(exercise, given);
    triggerHaptic(verdict === 'correct' ? 'success' : 'error');
    setAttempts((prev) => ({ ...prev, [key]: { text: given, verdict } }));

    // Only a genuinely wrong production enters the memory — a 'close' (article
    // slip) is feedback here, but a 'wrong' sentence is what the tutor and the
    // review queue must remember.
    if (verdict === 'wrong') {
      const miss = grammarAttemptMistake(row, exercise, given);
      const mistakeRow = {
        userId: 'current_user',
        scenarioId: GRAMMAR_SCENARIOS[row.id] || 'grammar_practice',
        original: miss.original,
        corrected: miss.corrected,
        grammarRule: miss.grammarRule,
        grammarId: miss.grammarId,
        timestamp: Date.now(),
        wasHintUsed: false,
      };
      const id = await db.mistakes.add(mistakeRow);
      await enrolMistake({ ...mistakeRow, id });
    }
  };

  const ownKeys = exercises.map((_, index) => attemptKey(openRow?.id || '', index));
  const ownVerdicts = ownKeys.map((key) => attempts[key]?.verdict ?? null);
  const allAnswered = ownVerdicts.length > 0 && ownVerdicts.every((verdict) => verdict !== null);
  const correctCount = ownVerdicts.filter((verdict) => verdict === 'correct').length;
  const qualified = exercises.length > 0 && isQualifyingAttempt({ correct: correctCount, total: exercises.length, at: 0, sessionId });

  const submitAttempt = async () => {
    if (!openRow || !allAnswered) return;
    await recordLessonAttempt(openRow.id, {
      correct: correctCount,
      total: exercises.length,
      sessionId,
    });
    setSubmitted('attempt');
  };

  const submitTestOut = async () => {
    if (!openRow || !allAnswered) return;
    if (isTestOutPass(correctCount, exercises.length)) {
      await markLessonTestedOut(openRow.id);
      setSubmitted('testout_pass');
    } else {
      setSubmitted('testout_fail');
    }
  };

  const nextNode = openIndex >= 0 ? path.nodes[openIndex + 1] : null;

  // ---------------------------------------------------------------------------
  // Lesson detail
  // ---------------------------------------------------------------------------
  if (openRow && openNode) {
    const cleared = openState === 'passed' || openState === 'tested_out';
    const showNextButton = cleared && nextNode && nextNode.unlocked;
    return (
      <div className="min-h-screen bg-black text-text-primary">
        <div className="mx-auto max-w-md p-5">
          <button
            onClick={closeLesson}
            className="mb-4 flex items-center gap-2 text-xs font-arabic text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
            كل الدروس
          </button>

          <div className="flex items-center gap-2">
            <Badge variant="primary" size="sm">
              الدرس {openNode.lesson.order} من {path.totalCount}
            </Badge>
            <Badge variant="primary" size="sm">{openRow.level}</Badge>
            {cleared && <CheckCircle2 className="w-4 h-4 text-status-success" />}
          </div>
          <h1 className="mt-2 text-lg font-bold font-arabic leading-relaxed">{openRow.title_ar}</h1>

          <Card className="mt-4 p-4 space-y-3">
            <p className="text-sm font-arabic text-text-secondary leading-relaxed">{openRow.rule_ar}</p>
            <div className="rounded-2xl bg-surface-subtle border border-border-subtle p-3">
              <GermanText className="block text-sm text-text-primary">{openRow.example_de}</GermanText>
              <p className="mt-1 text-xs font-arabic text-text-muted">{openRow.example_ar}</p>
            </div>
            <p className="text-xs font-arabic text-text-muted leading-relaxed">
              <span className="font-bold text-primary">انتبه كمتحدث عربية: </span>
              {openRow.explanation_ar}
            </p>
          </Card>

          {cleared && (
            <Card className="mt-4 flex items-center gap-3 p-4 border-status-success/40">
              <Trophy className="w-5 h-5 shrink-0 text-status-success" />
              <p className="text-xs font-arabic text-text-secondary leading-relaxed">
                {openState === 'tested_out'
                  ? 'تجاوزت هذا الدرس في اختبار قصير. يمكنك مراجعته في أي وقت.'
                  : 'أتممت هذا الدرس. الدرس التالي مفتوح.'}
              </p>
            </Card>
          )}

          <h2 className="mt-6 mb-3 text-sm font-bold font-arabic text-text-secondary">
            {checkingOut ? 'اختبار تجاوز — أجب صحيحاً على كل التمارين' : 'تدرّب — ثلاثة تمارين، وكل محاولة تُصحَّح فوراً'}
          </h2>
          <div className="space-y-4">
            {exercises.map((exercise, index) => {
              const key = attemptKey(openRow.id, index);
              return (
                <ExerciseCard
                  key={key}
                  exercise={exercise}
                  attempt={attempts[key]}
                  onType={(text) => setAttempts((prev) => ({ ...prev, [key]: { text, verdict: null } }))}
                  onCheck={() => void handleAttempt(openRow, exercise, key, attempts[key]?.text || '')}
                  onRetry={() => setAttempts((prev) => ({ ...prev, [key]: { text: '', verdict: null } }))}
                />
              );
            })}
          </div>

          {reviewItems.length > 0 && !checkingOut && (
            <>
              <h2 className="mt-6 mb-3 text-sm font-bold font-arabic text-text-secondary">
                مراجعة سريعة من دروس سابقة
              </h2>
              <div className="space-y-4">
                {reviewItems.map(({ row, exercise }, index) => {
                  const key = attemptKey(`${openRow.id}:review`, index);
                  return (
                    <ExerciseCard
                      key={key}
                      exercise={exercise}
                      attempt={attempts[key]}
                      onType={(text) => setAttempts((prev) => ({ ...prev, [key]: { text, verdict: null } }))}
                      onCheck={() => void handleAttempt(row, exercise, key, attempts[key]?.text || '')}
                      onRetry={() => setAttempts((prev) => ({ ...prev, [key]: { text: '', verdict: null } }))}
                      reviewLabel="من درس سابق"
                    />
                  );
                })}
              </div>
            </>
          )}

          <div className="mt-6 space-y-3">
            {!cleared && (
              <Button
                className="w-full"
                disabled={!allAnswered}
                onClick={() => void (checkingOut ? submitTestOut() : submitAttempt())}
              >
                {checkingOut ? 'إرسال اختبار التجاوز' : 'أنهيت التمارين — احسب محاولتي'}
              </Button>
            )}

            {submitted === 'attempt' && (
              <p
                className={`text-center text-xs font-arabic leading-relaxed ${
                  qualified ? 'text-status-success' : 'text-status-learning'
                }`}
              >
                {qualified
                  ? `محاولة ناجحة (${correctCount} من ${exercises.length}). تحتاج محاولة ناجحة أخرى في جلسة منفصلة لإتمام الدرس — والصواب يبقى معك في المراجعة.`
                  : `نتيجتك ${correctCount} من ${exercises.length}. لم تصل بعد للحد المطلوب (${Math.ceil(
                      (exercises.length * 2) / 3,
                    )} من ${exercises.length}) — راجع الشرح وأعد المحاولة.`}
              </p>
            )}
            {submitted === 'testout_fail' && (
              <p className="text-center text-xs font-arabic text-status-error leading-relaxed">
                لم تنجح محاولة التجاوز ({correctCount} من {exercises.length}). تدرّب على الدرس أولاً، أو حاول اختبار التجاوز مرة أخرى.
              </p>
            )}

            {!cleared && !checkingOut && (
              <button
                onClick={() => {
                  setCheckingOut(true);
                  setAttempts({});
                  setSubmitted('none');
                }}
                className="flex w-full items-center justify-center gap-1.5 py-1 text-xs font-arabic text-text-muted hover:text-primary transition-colors"
              >
                <FastForward className="w-3.5 h-3.5" />
                أعرف القاعدة؟ اختبر نفسك لتتجاوز الدرس
              </button>
            )}

            {showNextButton && (
              <Button className="w-full" onClick={() => openLesson(nextNode.lesson.id)}>
                الدرس التالي:{' '}
                {nextNode.lesson.titleAr.length > 34
                  ? `${nextNode.lesson.titleAr.slice(0, 34)}…`
                  : nextNode.lesson.titleAr}
              </Button>
            )}
          </div>

          {GRAMMAR_SCENARIOS[openRow.id] && (
            <button
              onClick={() => onOpenScenario(GRAMMAR_SCENARIOS[openRow.id])}
              className="mt-6 w-full text-center text-xs font-arabic text-primary hover:underline transition-colors py-2"
            >
              تدرّب القاعدة في موقف حقيقي ←
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // The path
  // ---------------------------------------------------------------------------
  const nextLesson = path.nextId ? path.nodes.find((node) => node.lesson.id === path.nextId)?.lesson : null;

  return (
    <div className="min-h-screen bg-black text-text-primary">
      <div className="mx-auto max-w-md p-5">
        <div className="mb-5 text-center">
          <KatzuMascot name="practice" glow className="mx-auto mb-2 h-24 w-24 object-contain" />
          <h1 className="text-xl font-bold font-arabic">مسار القواعد</h1>
          <p className="mt-1 text-xs font-arabic text-text-muted leading-relaxed">
            دروس مرتّبة من الأسهل إلى الأصعب. يُفتح الدرس التالي بعد أن تُتمّ الدرس الذي قبله — وكل درس بشرح عربي بسيط وتمارين قصيرة.
          </p>
        </div>

        {path.totalCount > 0 && (
          <Card className="mb-4 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-arabic font-bold text-text-secondary">
                أكملت {path.completedCount} من {path.totalCount}
              </p>
              {path.completedCount === path.totalCount && <Trophy className="w-4 h-4 text-primary" />}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-subtle">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${path.totalCount ? (path.completedCount / path.totalCount) * 100 : 0}%` }}
              />
            </div>
          </Card>
        )}

        {nextLesson && (
          <Button className="mb-5 w-full" onClick={() => openLesson(nextLesson.id)}>
            تابع: الدرس {nextLesson.order} —{' '}
            {nextLesson.titleAr.length > 30 ? `${nextLesson.titleAr.slice(0, 30)}…` : nextLesson.titleAr}
          </Button>
        )}

        {path.totalCount === 0 ? (
          <p className="py-10 text-center text-xs font-arabic text-text-muted">
            لا توجد قواعد محمّلة بعد على هذا الجهاز — اتصل بالإنترنت مرة واحدة لتظهر.
          </p>
        ) : (
          <div className="space-y-2">
            {path.nodes.map((node) => {
              const locked = !node.unlocked;
              return (
                <button
                  key={node.lesson.id}
                  disabled={locked}
                  onClick={() => openLesson(node.lesson.id)}
                  className={`w-full rounded-2xl border p-4 text-start transition-all ${
                    node.isNext
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border-subtle bg-surface-card hover:border-primary/40'
                  } ${locked ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-[11px] font-bold text-text-secondary">
                      {node.lesson.order}
                    </span>
                    <Badge variant="primary" size="sm">{node.lesson.level}</Badge>
                    <span className="min-w-0 flex-1 text-sm font-arabic font-bold text-text-primary leading-relaxed">
                      {node.lesson.titleAr}
                    </span>
                    {locked ? (
                      <Lock className="w-3.5 h-3.5 shrink-0 text-text-muted" />
                    ) : node.state === 'passed' || node.state === 'tested_out' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-status-success" />
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    {node.isNext && (
                      <span className="text-[10px] font-arabic font-bold text-primary">التالي</span>
                    )}
                    {node.optional && node.state !== 'passed' && node.state !== 'tested_out' && (
                      <span className="text-[10px] font-arabic text-text-muted">مراجعة اختيارية</span>
                    )}
                    {node.state === 'tested_out' && (
                      <span className="text-[10px] font-arabic text-status-success">تجاوزته</span>
                    )}
                    {node.state === 'in_progress' && (
                      <span className="text-[10px] font-arabic text-status-learning">قيد التقدّم</span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] font-arabic text-text-muted">{node.lesson.ruleAr}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export { GrammarSectionScreen };
