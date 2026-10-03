import React, { useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Send, Sparkles, BookOpen, Languages, Search, Scale, ScrollText, Check, X } from 'lucide-react';
import { db } from '@/lib/db/katzuDb';
import { workerClient } from '@/lib/api/workerClient';
import { enrolMistake } from '@/lib/srs/store';
import { GermanText } from '@/components/common/GermanText';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { triggerHaptic } from '@/lib/utils/haptics';
import { logError } from '@/lib/utils/diagnostics';
import { gradeAskPractice, askPracticeFeedbackAr } from '@/lib/ask/practice';
import { ASK_LEGAL_NOTICE_AR, ASK_PRACTICE_NOTE_AR, ASK_SUGGESTIONS } from '@/lib/ask/notices';
import type { AskAnswer, AskPracticeItem } from '@/types/models';

/**
 * Ask Katzu (V28 Stage 2A) — "ask anything about German".
 *
 * One question (Arabic or German) → one validated answer (a short Arabic
 * explanation, examples, and three short practice items), then a deterministic
 * practice check. The mode is German-only by contract: the worker refuses
 * anything unrelated, and a refusal is rendered as a polite card, never as an
 * error. A wrong practice answer is not lost — it enters the same validated
 * review path the conversation uses, so "I got it wrong" becomes "it comes back".
 *
 * Everything the learner typed stays on the screen through any failure: a
 * network hiccup keeps the question and offers one retry.
 */

export interface AskKatzuScreenProps {
  onBack: () => void;
  onOpenSubscription?: () => void;
}

interface PracticeRow {
  text: string;
  verdict: 'correct' | 'close' | 'wrong' | null;
  feedbackAr: string;
}

const INTENT_ICON: Record<string, React.ReactNode> = {
  translate: <Languages className="h-4 w-4" />,
  grammar: <BookOpen className="h-4 w-4" />,
  word: <Search className="h-4 w-4" />,
  check_sentence: <Check className="h-4 w-4" />,
  official: <Scale className="h-4 w-4" />,
};

const INTENT_LABEL_AR: Record<string, string> = {
  translate: 'ترجمة',
  grammar: 'قاعدة',
  word: 'كلمة',
  check_sentence: 'تصحيح جملة',
  official: 'ألمانية رسمية',
};

export const AskKatzuScreen: React.FC<AskKatzuScreenProps> = ({ onBack, onOpenSubscription }) => {
  const user = useLiveQuery(() => db.users.get('current_user'));
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ dailyLimit: number; isPro: boolean } | null>(null);
  const [practice, setPractice] = useState<Record<number, PracticeRow>>({});

  const level = user?.cefrLevel || 'A1';

  const ask = useCallback(async () => {
    const text = question.trim();
    if (!text || isAsking) return;
    setIsAsking(true);
    setError(null);
    setAnswer(null);
    setPractice({});
    triggerHaptic('light');

    const result = await workerClient.askKatzu({ question: text, cefrLevel: level });
    setIsAsking(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAnswer(result.answer);
    setQuota({ dailyLimit: result.dailyLimit, isPro: result.isPro });
    triggerHaptic(result.answer.inScope ? 'light' : 'error');
  }, [question, isAsking, level]);

  /**
   * Grade one practice item locally (the worker shipped the single correct
   * answer), and on a wrong answer put it on the validated review path. Mastery
   * is never claimed here — the review store owns that (`MASTERED_REPS`).
   */
  const checkPractice = useCallback(
    async (index: number, item: AskPracticeItem) => {
      const row = practice[index];
      const text = (row?.text || '').trim();
      if (!text) return;

      const verdict = gradeAskPractice(item, text);
      setPractice((prev) => ({
        ...prev,
        [index]: { text: row?.text || '', verdict, feedbackAr: askPracticeFeedbackAr(verdict) },
      }));

      if (verdict === 'correct') {
        triggerHaptic('success');
        return;
      }
      triggerHaptic('error');

      try {
        const mistake = {
          userId: 'current_user',
          scenarioId: 'ask_katzu',
          original: text,
          corrected: item.answerDe,
          grammarRule: 'من سؤال كَاتْزُو عن الألمانية',
          timestamp: Date.now(),
          wasHintUsed: false,
        };
        const mistakeId = await db.mistakes.put(mistake);
        await enrolMistake({ ...mistake, id: mistakeId });
      } catch (err) {
        // A storage hiccup must not swallow the feedback the learner already saw.
        logError('ask/practice', `Could not enrol mistake: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [practice],
  );

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-black text-kz-ink">
      <header className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="العودة"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-kz-inkDim"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="kz-ar-caption truncate font-bold text-kz-ink">اسأل كَاتْزُو عن الألمانية</p>
          <p className="kz-ar-micro text-kz-inkFaint">ترجمة · قواعد · كلمة · تصحيح جملة · ألمانية رسمية</p>
        </div>
        <KatzuMascot name="avatar" className="h-9 w-9 shrink-0" />
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* Prompt suggestions: naming the supported tasks makes the German-only
            contract obvious before the learner types anything. */}
        {!answer && (
          <div className="flex flex-wrap gap-2">
            {ASK_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion.labelAr}
                type="button"
                onClick={() => {
                  setQuestion(suggestion.promptAr);
                  setError(null);
                }}
                className="kz-ar-micro rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-kz-inkDim transition-colors hover:border-primary/50 hover:text-primary"
              >
                {suggestion.labelAr}
              </button>
            ))}
          </div>
        )}

        <Card className="p-3.5">
          <label htmlFor="ask-input" className="kz-ar-micro mb-2 block font-semibold text-kz-inkDim">
            اكتب سؤالك أو جملتك — بالعربية أو بالألمانية
          </label>
          <textarea
            id="ask-input"
            dir="auto"
            rows={3}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void ask();
            }}
            placeholder="مثال: ما الفرق بين «seit» و«vor»؟"
            className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 font-arabic text-sm text-kz-ink transition-colors placeholder:text-kz-inkFaint focus:border-primary/60"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="kz-ar-micro text-kz-inkFaint">
              {quota ? `${quota.dailyLimit} سؤالاً يومياً${quota.isPro ? ' (Pro)' : ''}` : 'الألمانية فقط'}
            </span>
            <Button
              size="md"
              className="flex items-center gap-1.5 rounded-2xl px-4"
              disabled={!question.trim() || isAsking}
              onClick={() => void ask()}
            >
              <Send className="h-4 w-4 rotate-180" />
              {isAsking ? 'يسأل…' : 'اسأل'}
            </Button>
          </div>
        </Card>

        {/* Failure keeps the question and offers the retry — never a dead end. */}
        {error && (
          <Card className="border-status-error/40 p-3.5">
            <p className="kz-ar-caption font-bold text-status-error">تعذّر الحصول على شرح</p>
            <p className="kz-ar-micro mt-1 text-kz-inkDim">{error}</p>
            <Button size="sm" variant="secondary" className="mt-2 rounded-xl" onClick={() => void ask()}>
              أعد المحاولة
            </Button>
          </Card>
        )}

        {answer && !answer.inScope && (
          <Card className="p-3.5">
            <p className="kz-ar-caption font-bold text-kz-lavender">كَاتْزُو هنا لتعليم الألمانية فقط</p>
            <p className="kz-ar-body mt-1.5 leading-relaxed text-kz-ink">{answer.refusalAr}</p>
            <button
              type="button"
              onClick={() => {
                setAnswer(null);
                setQuestion('');
              }}
              className="kz-ar-micro mt-2 font-semibold text-primary"
            >
              اسأل عن الألمانية
            </button>
          </Card>
        )}

        {answer && answer.inScope && (
          <>
            <Card className="p-3.5">
              <div className="mb-2 flex items-center gap-2 text-kz-lavender">
                {answer.intent && INTENT_ICON[answer.intent]}
                <span className="kz-ar-micro font-bold">
                  {answer.intent ? INTENT_LABEL_AR[answer.intent] : 'شرح'}
                </span>
              </div>
              <p className="kz-ar-body leading-relaxed text-kz-ink">{answer.explanationAr}</p>

              {answer.examples.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
                  {answer.examples.map((example, index) => (
                    <div key={index}>
                      <GermanText className="font-german text-sm font-semibold text-kz-ink">{example.de}</GermanText>
                      <p className="kz-ar-micro mt-0.5 text-kz-inkDim">{example.ar}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* The not-legal-advice notice, reused verbatim from the scenario
                disclaimer so the app never says two different things. */}
            {answer.legal && (
              <Card className="border-kz-neon/30 p-3">
                <p className="kz-ar-micro flex items-start gap-2 leading-relaxed text-kz-neon">
                  <ScrollText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{ASK_LEGAL_NOTICE_AR}</span>
                </p>
              </Card>
            )}

            {answer.practice.length > 0 && (
              <section className="space-y-3">
                <h2 className="kz-ar-caption text-kz-inkDim">تأكّد أنك فهمت</h2>
                {answer.practice.map((item, index) => {
                  const row = practice[index];
                  const verdict = row?.verdict || null;
                  return (
                    <Card key={index} className="p-3.5">
                      <p className="kz-ar-micro font-semibold text-kz-ink">{item.promptAr}</p>
                      {item.promptDe && (
                        <GermanText className="mt-1 block font-german text-sm text-kz-inkDim">{item.promptDe}</GermanText>
                      )}
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          dir="ltr"
                          aria-label="اكتب الجواب بالألمانية"
                          placeholder="اكتب الجواب بالألمانية"
                          value={row?.text || ''}
                          onChange={(event) =>
                            setPractice((prev) => ({
                              ...prev,
                              [index]: { text: event.target.value, verdict: prev[index]?.verdict || null, feedbackAr: prev[index]?.feedbackAr || '' },
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void checkPractice(index, item);
                          }}
                          className="h-11 min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/40 px-3 font-german text-sm text-kz-ink placeholder:font-arabic placeholder:text-xs placeholder:text-kz-inkFaint focus:border-kz-lavender/50"
                        />
                        <Button
                          size="md"
                          variant="secondary"
                          className="rounded-2xl"
                          disabled={!(row?.text || '').trim()}
                          onClick={() => void checkPractice(index, item)}
                        >
                          تحقّق
                        </Button>
                      </div>
                      {verdict && (
                        <p
                          className={`kz-ar-micro mt-2 flex items-center gap-1.5 ${
                            verdict === 'correct' ? 'text-status-success' : 'text-status-error'
                          }`}
                        >
                          {verdict === 'correct' ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                          {row?.feedbackAr}
                        </p>
                      )}
                    </Card>
                  );
                })}
                <p className="kz-ar-micro flex items-start gap-1.5 leading-relaxed text-kz-inkFaint">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{ASK_PRACTICE_NOTE_AR}</span>
                </p>
              </section>
            )}

            {!quota?.isPro && onOpenSubscription && (
              <Card className="p-3">
                <p className="kz-ar-micro leading-relaxed text-kz-inkDim">
                  خطة Pro تمنحك أسئلة أكثر كل يوم. تبقى المراجعة والمهمة اليومية مجانية دائماً.
                </p>
                <button type="button" onClick={onOpenSubscription} className="kz-ar-micro mt-2 font-semibold text-primary">
                  تفاصيل Pro
                </button>
              </Card>
            )}
          </>
        )}
      </div>
    </main>
  );
};
