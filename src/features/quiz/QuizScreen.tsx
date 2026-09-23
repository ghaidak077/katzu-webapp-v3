import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { triggerHaptic } from '@/lib/utils/haptics';
import { generateQuizQuestions, type QuizQuestion } from '@/lib/utils/quizGenerator';
import { scenarioToVocabTopic } from '@/lib/utils/scenarioVocab';
import type { VocabularyEntity } from '@/types/models';
import { GermanText } from '@/components/common/GermanText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { db } from '@/lib/db/katzuDb';
import { ArrowRight, Volume2, CheckCircle2, XCircle, Sparkles } from 'lucide-react';

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

  const { speak } = useSpeechOutput();

  // Questions are generated from the scenario's real D1 content (vocabulary +
  // starter phrases) — never hardcoded (rule 3). Generated once per mount with
  // a stable seed so the quiz doesn't reshuffle on every re-render.
  const scenarioQ = useLiveQuery(() => db.scenarios.get(scenarioId));
  const phrasesQ = useLiveQuery(
    () => db.starter_phrases.where('scenario_id').equals(scenarioId).toArray(),
    [scenarioId]
  );
  const vocabTopic = scenarioToVocabTopic(scenarioQ);
  const vocabQ = useLiveQuery(
    () => (vocabTopic ? db.vocabulary.where('topic').equals(vocabTopic).toArray() : Promise.resolve<VocabularyEntity[]>([])),
    [vocabTopic]
  );

  // Regenerates only when the underlying D1 content loads/changes — questions
  // stay stable across unrelated re-renders (answer states, score, etc.).
  const questions = useMemo<QuizQuestion[]>(
    () => generateQuizQuestions(vocabQ || [], phrasesQ || []),
    [vocabQ, phrasesQ]
  );

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
    } else {
      const finalAccuracy = Math.round((score / questions.length) * 100);
      await db.scenario_training.update(scenarioId, {
        quizAttempted: true,
        lastScore: finalAccuracy,
        updatedAt: Date.now(),
      });
      setIsQuizCompleted(true);
    }
  };

  return (
    <div className="min-h-screen bg-black text-text-primary p-6 max-w-md mx-auto relative flex flex-col justify-between">
      {/* Top Bar */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="p-2.5 rounded-2xl bg-surface-card border border-border-subtle hover:bg-surface-subtle transition-colors"
          >
            <ArrowRight className="w-5 h-5 text-text-secondary" />
          </button>
          <span className="font-arabic font-bold text-xs text-text-secondary">
            السؤال {currentIndex + 1} من {questions.length}
          </span>
          <div className="w-10" />
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-surface-card rounded-full overflow-hidden mb-8">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
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
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-2">
              ما هو المعنى الصحيح لهذه الجملة؟
            </span>
            <GermanText className="text-xl font-bold text-text-primary mb-3 block">
              {currentQ.germanPrompt}
            </GermanText>
            <button
              onClick={() => speak(currentQ.germanPrompt)}
              className="p-2.5 rounded-full bg-primary/20 text-primary hover:bg-primary/30 mx-auto inline-flex items-center gap-1.5 text-xs font-semibold"
            >
              <Volume2 className="w-4 h-4" />
              استمع للنطق
            </button>
          </Card>

          {/* Options */}
          <div className="space-y-3">
            {currentQ.options.map((opt, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrect = idx === currentQ.correctIndex;

              let style = 'bg-surface-card border-border-subtle text-text-primary hover:border-primary/50';
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
                  className={`w-full p-4 rounded-2xl border text-sm font-semibold font-arabic transition-all flex items-center justify-between ${style}`}
                >
                  <span>{opt}</span>
                  {isAnswerSubmitted && isCorrect && <CheckCircle2 className="w-5 h-5 text-status-success" />}
                  {isAnswerSubmitted && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-status-error" />}
                </button>
              );
            })}
          </div>

          {/* Explanation Banner */}
          {isAnswerSubmitted && (
            <div className="p-4 rounded-2xl bg-surface-subtle border border-border-subtle text-xs animate-fade-in">
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
          <h3 className="text-2xl font-bold font-arabic">أحسنت! أتممت الاختبار</h3>
          <p className="text-sm text-text-secondary font-arabic">
            نتيجتك: {score} من {questions.length} إجابات صحيحة
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
