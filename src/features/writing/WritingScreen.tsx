import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { workerClient } from '@/lib/api/workerClient';
import { enrolMistake } from '@/lib/srs/store';
import { WRITING_TASK_COPY, writingTaskForLevel } from '@/lib/writing/task';
import { GermanText } from '@/components/common/GermanText';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { triggerHaptic } from '@/lib/utils/haptics';
import { ArrowLeft, CheckCircle2, Loader2, PenLine, Sparkles, Volume2, XCircle } from 'lucide-react';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import type { CEFRLevel, WritingFeedback } from '@/types/models';

export interface WritingScreenProps {
  onBack: () => void;
  onOpenSubscription?: () => void;
}

/** The worker owns these limits; mirrored here only to warn before submitting. */
const MIN_CHARS = 20;
const MAX_CHARS = 900;

const DIMENSION_LABELS: Record<string, string> = {
  task: 'تنفيذ المهمة',
  coherence: 'الترابط والتنظيم',
  grammar: 'القواعد',
  vocabulary: 'المفردات',
};

const PAYWALL_CODES = new Set(['PAYWALL_REQUIRED', 'FREE_QUOTA_EXHAUSTED', 'QUOTA_UNAVAILABLE']);

/** Honest verdict wording: the score is a rubric total, not a certificate. */
function verdictAr(percent: number): string {
  if (percent >= 85) return 'قوي — هذا مستوى رسالة تُفهم من أول قراءة.';
  if (percent >= 70) return 'جيد — الفكرة واضحة، وبقيت تفاصيل قواعد تحتاج تثبيتاً.';
  if (percent >= 50) return 'مقبول — وصل المعنى، لكن الأخطاء تعطّل القارئ.';
  return 'يحتاج عملاً — أعد كتابة نفس المهمة بعد مراجعة الملاحظات.';
}

/**
 * Schreiben — the fourth skill, and the one that decides a B1 certificate for a
 * learner writing to a landlord, an employer or an office. The task is derived
 * from the learner's level (the worker validates it), the topic comes from the
 * scenario they are already studying, and every correction is enrolled into the
 * same review queue as the conversation corrections — so what they got wrong
 * comes back until it is right.
 */
export const WritingScreen: React.FC<WritingScreenProps> = ({ onBack, onOpenSubscription }) => {
  const user = useLiveQuery(() => db.users.get('current_user'));
  const trainings = useLiveQuery(() => db.scenario_training.toArray());
  const scenarios = useLiveQuery(() => db.scenarios.toArray());
  const phrases = useLiveQuery(() => db.starter_phrases.toArray());

  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [error, setError] = useState('');
  const [paywall, setPaywall] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { speak } = useSpeechOutput();

  const level: CEFRLevel = user?.cefrLevel || 'A1';
  const taskType = writingTaskForLevel(level);
  const copy = WRITING_TASK_COPY[taskType];

  // The topic is the scenario the learner most recently trained, so the writing
  // task sits inside the situation they are actually preparing for.
  const scenario = useMemo(() => {
    const list = scenarios || [];
    if (!list.length) return null;
    const recent = [...(trainings || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    return list.find((item) => item.id === recent?.scenarioId) || list[0];
  }, [scenarios, trainings]);

  const targetPhrases = useMemo(() => {
    if (!scenario) return [];
    const forScenario = (phrases || []).filter((phrase) => phrase.scenario_id === scenario.id);
    const atLevel = forScenario.filter((phrase) => phrase.level === level);
    return (atLevel.length ? atLevel : forScenario).slice(0, 4).map((phrase) => phrase.german);
  }, [phrases, scenario, level]);

  const trimmedLength = text.trim().length;
  const canSubmit = trimmedLength >= MIN_CHARS && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError('');
    setPaywall(false);

    const result = await workerClient.checkWriting({
      text: text.trim(),
      taskType,
      cefrLevel: level,
      scenarioTitle: scenario?.title_ar || '',
      targetPhrases,
      idToken: user?.sessionToken,
    });

    if (!result.ok) {
      // The learner's text is untouched on every failure path: an AI hiccup must
      // never cost someone a paragraph they just wrote.
      setError(result.error);
      setPaywall(PAYWALL_CODES.has(result.code));
      triggerHaptic('error');
      setIsSubmitting(false);
      return;
    }

    setFeedback(result.feedback);
    triggerHaptic('success');
    setIsSubmitting(false);
    await persistResult(result.feedback);
  };

  /** Corrections become review cards and skill-practice data; nothing else is stored. */
  const persistResult = async (result: WritingFeedback) => {
    const now = Date.now();
    for (const [index, mistake] of result.mistakes.entries()) {
      const row = {
        userId: 'current_user',
        scenarioId: scenario?.id || '',
        original: mistake.original,
        corrected: mistake.corrected,
        grammarRule: mistake.ruleDe || 'صياغة صحيحة',
        roastComment: mistake.explanationAr,
        timestamp: now,
        wasHintUsed: false,
        syncId: `writing:${now}:${index}`,
      };
      const id = await db.mistakes.add(row);
      await enrolMistake({ ...row, id }, now);
    }

    await db.skill_practice.add({
      userId: 'current_user',
      skill: 'writing',
      score: result.percent,
      at: now,
      refId: taskType,
    });

    if (user?.sessionToken) {
      // Same background sync the conversation uses, so these corrections reach the
      // coach on the learner's other devices too.
      workerClient.syncProgress(user.sessionToken).catch(() => {});
    }
  };

  const reset = () => {
    setText('');
    setFeedback(null);
    setError('');
    setPaywall(false);
  };

  if (feedback) {
    return (
      <div className="min-h-screen bg-black text-text-primary p-4 max-w-md mx-auto pb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold font-arabic">تصحيح الكتابة</h2>
            <p className="text-[11px] text-text-secondary font-arabic">{copy.formatDe}</p>
          </div>
          <Badge variant="subtle" size="sm">
            {level}
          </Badge>
        </div>

        <Card variant="hero" glow className="p-5 mb-4 text-center">
          <div className="text-3xl font-bold font-german text-primary mb-1">{feedback.percent}%</div>
          <p className="text-xs font-arabic text-text-secondary leading-relaxed">{verdictAr(feedback.percent)}</p>
        </Card>

        <Card className="p-4 mb-4">
          <h3 className="text-xs font-bold font-arabic text-text-secondary mb-3">معايير التقييم — من {feedback.maxScore}</h3>
          <div className="space-y-2.5">
            {Object.entries(feedback.scores).map(([dimension, score]) => (
              <div key={dimension}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-arabic">{DIMENSION_LABELS[dimension] || dimension}</span>
                  <span className="text-[11px] font-german text-text-secondary">
                    {score} / {feedback.maxScore}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round(((score || 0) / feedback.maxScore) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {feedback.summaryAr && (
          <Card className="p-4 mb-4">
            <h3 className="text-xs font-bold font-arabic text-text-secondary mb-2">ملاحظة المعلّم</h3>
            <p className="text-xs font-arabic leading-relaxed">{feedback.summaryAr}</p>
          </Card>
        )}

        {feedback.correctedDe && (
          <Card className="p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold font-arabic text-text-secondary">النسخة المصححة</h3>
              <button
                type="button"
                onClick={() => speak(feedback.correctedDe)}
                className="p-1.5 rounded-lg bg-surface-subtle hover:bg-primary/20 text-primary transition-colors"
                aria-label="استمع للنسخة المصححة"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <GermanText className="text-sm leading-relaxed">{feedback.correctedDe}</GermanText>
          </Card>
        )}

        {feedback.mistakes.length > 0 && (
          <Card className="p-4 mb-4">
            <h3 className="text-xs font-bold font-arabic text-text-secondary mb-3">
              الأخطاء التي ستعود إليك في المراجعة
            </h3>
            <ul className="space-y-3">
              {feedback.mistakes.map((mistake, index) => (
                <li key={index} className="rounded-2xl bg-surface-subtle p-3">
                  <div className="flex items-start gap-2">
                    <XCircle className="w-3.5 h-3.5 text-status-error mt-0.5 shrink-0" />
                    <span className="text-xs font-german line-through text-text-muted" dir="ltr">
                      {mistake.original}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 mt-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-status-success mt-0.5 shrink-0" />
                    <span className="text-xs font-german text-text-primary" dir="ltr">
                      {mistake.corrected}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] font-arabic text-text-secondary leading-relaxed">
                    {mistake.ruleDe && <span className="text-status-learning">{mistake.ruleDe} — </span>}
                    {mistake.explanationAr}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={reset}>
            <PenLine className="w-4 h-4" /> اكتب من جديد
          </Button>
          <Button className="flex-1" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" /> عد إلى المسار
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-text-primary p-4 max-w-md mx-auto pb-28">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold font-arabic">الكتابة (Schreiben)</h2>
          <p className="text-[11px] text-text-secondary font-arabic">
            مهارة الاختبار التي تُحدد الشهادة — اكتب ثم اعرف بالضبط ما يجب إصلاحه.
          </p>
        </div>
        <KatzuMascot name="practice" className="w-14 h-14 object-contain" />
      </div>

      <Card className="p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="primary" size="sm">
            {copy.titleAr}
          </Badge>
          <span className="text-[10px] font-german text-text-muted">{copy.formatDe}</span>
        </div>
        <p className="text-xs font-arabic leading-relaxed mb-2">{copy.briefAr}</p>
        {scenario && (
          <p className="text-[11px] font-arabic text-text-secondary">
            الموضوع: <span className="text-text-primary">{scenario.title_ar}</span>
          </p>
        )}
      </Card>

      {targetPhrases.length > 0 && (
        <Card className="p-4 mb-4">
          <h3 className="text-[11px] font-bold font-arabic text-text-secondary mb-2">
            عبارات من المشهد — استخدم ما تحتاجه فقط، والأفضل استخدامها بشكل صحيح
          </h3>
          <ul className="space-y-1">
            {targetPhrases.map((phrase) => (
              <li key={phrase} className="text-xs font-german text-text-primary" dir="ltr">
                {phrase}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="p-4 mb-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            dir="ltr"
            rows={7}
            maxLength={MAX_CHARS}
            placeholder="Schreiben Sie hier auf Deutsch..."
            className="w-full resize-y bg-surface-subtle border border-border-subtle focus:border-primary rounded-2xl p-3 text-sm font-german leading-relaxed outline-none transition-all"
          />
          <div className="flex items-center justify-between mt-2">
            <span className={`text-[10px] font-german ${trimmedLength >= MIN_CHARS ? 'text-text-muted' : 'text-status-learning'}`}>
              {trimmedLength} / {MAX_CHARS}
            </span>
            {trimmedLength < MIN_CHARS && (
              <span className="text-[10px] font-arabic text-text-muted">
                {MIN_CHARS - trimmedLength} حرفاً على الأقل ليصبح التصحيح مفيداً
              </span>
            )}
          </div>
        </Card>

        {error && (
          <div className="mb-4 rounded-2xl border border-status-error/40 bg-status-error/10 p-3" role="alert">
            <p className="text-[11px] font-arabic text-text-secondary leading-relaxed">{error}</p>
            {paywall && onOpenSubscription && (
              <Button size="sm" className="mt-2" onClick={onOpenSubscription}>
                <Sparkles className="w-3.5 h-3.5" /> عرض الاشتراك
              </Button>
            )}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={!canSubmit}>
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> جاري التصحيح...
            </>
          ) : (
            <>
              <PenLine className="w-4 h-4" /> صحّح نصّي
            </>
          )}
        </Button>
      </form>

      <p className="mt-3 text-[10px] font-arabic text-text-muted text-center leading-relaxed">
        التصحيح يشرح الأخطاء بالعربية، وكل خطأ يدخل في قائمة مراجعتك حتى لا يتكرر.
      </p>
    </div>
  );
};
