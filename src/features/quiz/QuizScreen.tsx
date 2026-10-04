import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { triggerHaptic } from '@/lib/utils/haptics';
import { generateQuizQuestions, quizRngForScenario, type QuizQuestion } from '@/lib/utils/quizGenerator';
import { scenarioToVocabTopic, vocabularyWithinLevelRadius } from '@/lib/utils/scenarioVocab';
import type { VocabularyEntity } from '@/types/models';
import { GermanText } from '@/components/common/GermanText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { db } from '@/lib/db/katzuDb';
import { workerClient } from '@/lib/api/workerClient';
import { logEvent, logError } from '@/lib/utils/diagnostics';
import { enrolStudiedPhrases, enrolStudiedVocabulary } from '@/lib/srs/store';
import { track } from '@/lib/analytics/client';
import { ArrowRight, Volume2, CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { BackButton } from '@/components/common/BackButton';
import { arCount } from '@/lib/i18n/arabicCount';

/** V32: the score line agreed with its number too — "1 إجابات صحيحة". */
const CORRECT_FORMS = { one: 'إجابة واحدة', two: 'إجابتان', few: 'إجابات', many: 'إجابة' } as const;

export interface QuizScreenProps {
  scenarioId: string;
  onBack: () => void;
  onProceedToConversation: () => void;
}

export const QuizScreen: React.FC<QuizScreenProps> = ({
  scenarioId,
  onBack,
  onProceedToConversation,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [isQuizCompleted, setIsQuizCompleted] = useState(false);
  /** V32: this question was revealed rather than answered, so it scored zero. */
  const [didReveal, setDidReveal] = useState(false);

  const { speak } = useSpeechOutput();

  // Questions are generated from the scenario's real D1 content (vocabulary +
  // starter phrases) — never hardcoded (rule 3). Generated once per mount with
  // a stable seed so the quiz doesn't reshuffle on every re-render.
  const scenarioQ = useLiveQuery(() => db.scenarios.get(scenarioId));
  const user = useLiveQuery(() => db.users.get('current_user'));
  const phrasesQ = useLiveQuery(
    () => db.starter_phrases.where('scenario_id').equals(scenarioId).toArray(),
    [scenarioId]
  );
  const vocabTopic = scenarioToVocabTopic(scenarioQ);
  const vocabQ = useLiveQuery(
    () => (vocabTopic ? db.vocabulary.where('topic').equals(vocabTopic).toArray() : Promise.resolve<VocabularyEntity[]>([])),
    [vocabTopic]
  );
  // D5: quiz questions draw from the learner's level ±1 only (never-empty
  // fallback) — an A1 learner is not quizzed on B2 rows while A1 rows exist.

  // The deck is built ONCE and latched.
  //
  // Two defects met here. The generator defaulted to `Math.random`, and the
  // content-heal below bulkPuts this scenario's phrases/topic vocabulary, which
  // re-emits `phrasesQ`/`vocabQ` (plus `scenarioQ`/`user`) several times on the
  // first visit — so the options visibly reordered and the correct index moved
  // about five times before settling. Content is now considered ready only when
  // the scenario, its phrases and the topic query have all settled, the shuffler
  // is seeded from the scenario id (`quizRngForScenario`, same content ⇒ same
  // deck), and the first non-empty deck is frozen for the rest of the visit, so
  // no background write can move an option under the learner.
  const contentReady =
    scenarioQ !== undefined &&
    phrasesQ !== undefined &&
    (vocabTopic === '' || vocabQ !== undefined);
  const questionsRef = useRef<QuizQuestion[] | null>(null);
  const questions = useMemo<QuizQuestion[]>(() => {
    if (questionsRef.current) return questionsRef.current;
    if (!contentReady) return [];
    const built = generateQuizQuestions(
      vocabularyWithinLevelRadius(vocabQ || [], user?.cefrLevel),
      phrasesQ || [],
      quizRngForScenario(scenarioId)
    );
    if (built.length > 0) questionsRef.current = built;
    return built;
  }, [contentReady, vocabQ, phrasesQ, user?.cefrLevel, scenarioId]);

  // Heal stale content on entry: earlier D1 uploads shipped some garbled
  // Arabic translations that persisted in the device's Dexie cache forever,
  // because this screen only read local rows. Re-pull this scenario's real
  // phrases and its topic vocabulary from the worker once per mount —
  // bulkPut overwrites bad rows and the live queries re-render automatically.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await workerClient.fetchScenarioDetail(scenarioId);
        const topic = scenarioToVocabTopic(detail.scenario);
        if (topic) await workerClient.fetchVocabulary(undefined, topic);
        if (!cancelled) logEvent('quiz', 'Content refreshed from worker');
      } catch (e) {
        if (!cancelled) logError('quiz', `Content refresh failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scenarioId]);

  // Content may still be streaming from D1; guard against an empty deck
  // instead of rendering `undefined` properties.
  const currentQ = questions[currentIndex];

  const handleSelectOption = (index: number) => {
    if (!currentQ || isAnswerSubmitted) return;
    setSelectedOption(index);
    setIsAnswerSubmitted(true);

    const isCorrect = index === currentQ.correctIndex;
    if (isCorrect) {
      triggerHaptic('success');
      setScore((s) => s + 1);
    } else {
      triggerHaptic('error');
      // A wrong answer is the clearest possible evidence that this item is not
      // learned yet, so it enters the review queue now (enrolment is idempotent,
      // so re-answering it wrong later does not reset its schedule).
      if (currentQ.sourceKind === 'vocab') {
        const word = (vocabQ || []).find((candidate) => candidate.id === currentQ.sourceId);
        if (word) void enrolStudiedVocabulary([word]);
      } else {
        const phrase = (phrasesQ || []).find((candidate) => candidate.id === currentQ.sourceId);
        if (phrase) void enrolStudiedPhrases([phrase]);
      }
    }
  };

  /**
   * V32: the way out of a question you do not know.
   *
   * The "next" button is disabled until an option is tapped, which made guessing
   * the only way forward — and a learner who guesses to escape is being taught
   * that the app rewards a coin flip. This is the same exit Review already
   * offers («لا أتذكّر — أرني الإجابة»), it costs no score for the learner and
   * no dignity: the question is marked missed, the answer is shown, and the item
   * enters the review queue exactly as a wrong answer does.
   */
  const handleReveal = () => {
    if (!currentQ || isAnswerSubmitted) return;
    setSelectedOption(null);
    setIsAnswerSubmitted(true);
    setDidReveal(true);
    triggerHaptic('error');
    // Same evidence as a wrong answer, so the review queue treats it identically:
    // if the learner could not produce it unprompted, it is not learned yet.
    if (currentQ.sourceKind === 'vocab') {
      const word = (vocabQ || []).find((candidate) => candidate.id === currentQ.sourceId);
      if (word) void enrolStudiedVocabulary([word]);
    } else {
      const phrase = (phrasesQ || []).find((candidate) => candidate.id === currentQ.sourceId);
      if (phrase) void enrolStudiedPhrases([phrase]);
    }
  };

  const handleNext = async () => {
    // No buildable questions (content missing): continue to conversation
    // rather than trapping the learner in an empty quiz.
    if (questions.length === 0) {
      onProceedToConversation();
      return;
    }
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
      setIsAnswerSubmitted(false);
      setDidReveal(false);
    } else {
      const finalAccuracy = Math.round((score / questions.length) * 100);
      await db.scenario_training.update(scenarioId, {
        quizAttempted: true,
        lastScore: finalAccuracy,
        updatedAt: Date.now(),
      });
      track('quiz_completed', { scenarioId, count: finalAccuracy });
      setIsQuizCompleted(true);
    }
  };

  return (
    <div className="min-h-screen bg-black text-text-primary p-6 max-w-md mx-auto relative flex flex-col justify-between">
      {/* Top Bar */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <BackButton onBack={onBack} />
          {/* V36: this screen had no heading of its own — the only one was an
              `<h3>` on the RESULT screen, so a learner using a screen reader was
              told nothing about where they were for every one of the questions.
              The counter already sits here, so the screen's name sits with it. */}
          <div className="text-center">
            <h1 className="font-arabic text-sm font-bold text-text-primary">اختبار سريع</h1>
            <p className="font-arabic text-xs text-text-secondary">
              السؤال {currentIndex + 1} من {questions.length}
            </p>
          </div>
          <div className="w-10" />
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-surface-card rounded-full overflow-hidden mb-8">
          <div
            className="h-full w-full bg-primary origin-right transition-transform duration-panels ease-out"
            style={{ transform: `scaleX(${(currentIndex + 1) / questions.length})` }}
          />
        </div>
      </div>

      {!isQuizCompleted && !currentQ ? (
        <div className="my-auto text-center">
          <p className="text-sm font-arabic text-text-secondary">جاري تحضير الأسئلة...</p>
        </div>
      ) : !isQuizCompleted ? (
        <div className="my-auto space-y-6">
          {/* Prompt Card */}
          <Card variant="hero" className="p-6 text-center relative border border-primary/30 shadow-glow-purple">
            <span className="text-micro font-semibold text-text-secondary uppercase tracking-wider block mb-2">
              {currentQ.kind === 'vocab' ? 'ما معنى هذه الكلمة؟' : 'ما معنى هذه الجملة؟'}
            </span>
            <GermanText className="text-xl font-bold text-text-primary mb-3 block">
              {currentQ.germanPrompt}
            </GermanText>
            {/* Supporting example for word questions: context, never the question
                itself (the prompt above is what the options translate). */}
            {currentQ.kind === 'vocab' && currentQ.exampleSentence && (
              <div className="mb-3">
                <span className="text-micro text-text-muted font-arabic block mb-1">في جملة:</span>
                <GermanText className="text-sm text-text-secondary italic block">
                  {currentQ.exampleSentence}
                </GermanText>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => speak(currentQ.germanPrompt)}
              className="mx-auto"
            >
              <Volume2 className="h-4 w-4" />
              استمع للنطق
            </Button>
          </Card>

          {/* Options */}
          <div className="space-y-3" data-testid="quiz-options">
            {currentQ.options.map((opt, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrect = idx === currentQ.correctIndex;

              let style = 'bg-surface-card border-border-subtle text-text-primary pointer-hover:border-primary/50';
              if (isAnswerSubmitted) {
                if (isCorrect) {
                  style = 'bg-status-success/20 border-status-success text-status-success';
                } else if (isSelected) {
                  style = 'bg-status-error/20 border-status-error text-status-error';
                } else {
                  style = 'bg-surface-card border-border-subtle text-text-muted opacity-50';
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSelectOption(idx)}
                  disabled={isAnswerSubmitted}
                  className={`w-full p-4 rounded-2xl border text-sm font-semibold font-arabic transition-colors flex items-center justify-between ${style}`}
                >
                  <span>{opt}</span>
                  {isAnswerSubmitted && isCorrect && <CheckCircle2 className="w-5 h-5 text-status-success" />}
                  {isAnswerSubmitted && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-status-error" />}
                </button>
              );
            })}
          </div>

          {/* The escape hatch. It sits under the options, visually quiet, and
              exists on EVERY question — a learner must never have to guess to be
              allowed to continue. */}
          {!isAnswerSubmitted && (
            <button
              type="button"
              onClick={handleReveal}
              className="w-full rounded-2xl px-4 py-3 text-center font-arabic text-xs text-text-muted underline decoration-dotted transition-colors pointer-hover:text-primary min-h-touch"
            >
              لا أعرف — أرني الإجابة
            </button>
          )}

          {/* Explanation Banner */}
          {isAnswerSubmitted && (
            <div
              role="status"
              aria-live="polite"
              className="p-4 rounded-2xl bg-surface-subtle border border-border-subtle text-xs"
            >
              {/* V32: after a wrong answer or a reveal, the correct option used to
                  be marked only by a green tint. Remembering which of four was
                  green is work. It is now stated in words. */}
              {(didReveal || (selectedOption !== null && selectedOption !== currentQ.correctIndex)) && (
                <p className="text-text-primary font-semibold mb-2">
                  الصحيحة: <span className="text-status-success">{currentQ.options[currentQ.correctIndex]}</span>
                  {didReveal && <span className="text-text-muted font-normal"> — لم تختر، فهذه لا تُحسب صحيحة.</span>}
                </p>
              )}
              <span className="font-bold text-primary block mb-1">ملاحظة كَاتْزُو:</span>
              <p className="text-text-secondary">{currentQ.explanation}</p>
            </div>
          )}
        </div>
      ) : (
        /* Quiz Complete Screen */
        <div className="my-auto text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-status-success/20 text-status-success flex items-center justify-center mx-auto mb-2 shadow-glow-green">
            <Sparkles className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold font-arabic">أحسنت! أتممت الاختبار</h2>
          <p className="text-sm text-text-secondary font-arabic">
            نتيجتك: {arCount(score, CORRECT_FORMS)} صحيحة من {questions.length}
          </p>
          <div className="text-xs text-text-muted">
            أنت الآن جاهز تماماً لبدء المحادثة الحية المباشرة مع كَاتْزُو بالصوت!
          </div>
        </div>
      )}

      {/* Bottom Button */}
      <div className="pt-6">
        {!isQuizCompleted ? (
          <Button
            size="lg"
            className="w-full"
            disabled={!isAnswerSubmitted}
            onClick={handleNext}
          >
            {currentIndex < questions.length - 1 ? 'السؤال التالي' : 'عرض النتيجة'}
          </Button>
        ) : (
          <Button size="lg" className="w-full" onClick={onProceedToConversation}>
            ابدأ المحادثة الحية الآن 🎙️
          </Button>
        )}
      </div>
    </div>
  );
};
