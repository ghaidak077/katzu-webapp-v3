import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { GermanText } from '@/components/common/GermanText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useVoiceCapture, voiceStartFailureMessageAr } from '@/lib/audio/useVoiceCapture';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { triggerHaptic } from '@/lib/utils/haptics';
import { logError } from '@/lib/utils/diagnostics';
import {
  buildDemoLesson,
  buildDemoQuiz,
  createDemoState,
  demoProgress,
  demoReducer,
  productionItem,
  summarizeDemo,
  type DemoState,
} from '@/lib/demo/demoFlow';
import { loadDemoState, saveDemoState } from '@/lib/demo/migration';
import { track } from '@/lib/analytics/client';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  Sparkles,
  Volume2,
  XCircle,
} from 'lucide-react';

export interface DemoScreenProps {
  onHome: () => void;
  onSignUp: () => void;
  onStartPlacement: () => void;
}

/**
 * The public demo — value before the account.
 *
 * A visitor studies one real phrase and one real word from their own device
 * cache, answers a two-question comprehension check, then produces one German
 * sentence and gets the same Arabic correction style the authenticated app uses.
 * No AI endpoint is called: anonymous requests have no quota owner, and the
 * deterministic grading is the same engine the review queue already trusts.
 *
 * The demo's result stays local (localStorage) and only its *studied content*
 * is migrated after sign-in — never its unverifiable score.
 */
export const DemoScreen: React.FC<DemoScreenProps> = ({ onHome, onSignUp, onStartPlacement }) => {
  const scenarios = useLiveQuery(() => db.scenarios.toArray());
  const phrases = useLiveQuery(() => db.starter_phrases.toArray());
  const vocabulary = useLiveQuery(() => db.vocabulary.toArray());
  const { speak } = useSpeechOutput({ speed: 1.0 });

  const lesson = useMemo(() => {
    if (!scenarios || !phrases || !vocabulary) return null;
    return buildDemoLesson(scenarios, phrases, vocabulary);
  }, [scenarios, phrases, vocabulary]);

  const questions = useMemo(
    () => (lesson ? buildDemoQuiz(lesson, vocabulary || [], phrases || []) : []),
    [lesson, vocabulary, phrases],
  );

  // Resume an in-progress demo instead of restarting it: a visitor who was
  // interrupted mid-lesson should not lose the turn they already did.
  const initialState = useMemo<DemoState | null>(() => {
    const stored = loadDemoState();
    if (stored && lesson && stored.scenarioId === lesson.scenarioId && stored.stage !== 'done') return stored;
    if (!lesson) return null;
    return createDemoState(lesson, questions);
  }, [lesson, questions]);

  // The lesson is read from Dexie, so on the first render it does not exist yet
  // and `initialState` is null. A reducer cannot adopt a later initial value —
  // React keeps the one from mount — so the state is hydrated explicitly, once,
  // when the lesson (and any resumable progress) actually exists. Without this
  // the demo kept the `null` of render one and showed its "preparing" line
  // forever on every device, signed out and signed in alike.
  const [state, dispatch] = useReducer(demoReducer, null);
  useEffect(() => {
    if (!state && initialState) dispatch({ type: 'hydrate', state: initialState });
  }, [state, initialState]);
  const [input, setInput] = useState('');
  const [contentUnavailable, setContentUnavailable] = useState(false);
  // A visitor who taps the microphone and gets nothing has no way to tell a
  // permission refusal from a broken app. The typed path already works without
  // saying anything; this is the one line that keeps the button honest.
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // The demo speaks through the same pipeline as the app: record with
  // MediaRecorder, recognise on the worker. A failed microphone leaves the typed
  // path untouched and is recorded for diagnostics rather than swallowed.
  const voice = useVoiceCapture({
    onTranscript: (text) => setInput(text),
    onFailure: (failure, messageAr) => {
      logError('demo/stt', `${failure}: ${messageAr}`);
      setVoiceError(messageAr);
    },
  });

  useEffect(() => {
    if (state) saveDemoState(state);
  }, [state]);

  useEffect(() => {
    if (state?.stage === 'intro') track('demo_started', { scenarioId: state.scenarioId });
  }, [state?.stage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state?.stage === 'done') track('demo_completed', { scenarioId: state.scenarioId });
  }, [state?.stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // The seed runs at app start; if this device has genuinely no content cached
  // and the fetch cannot reach the worker, say so instead of showing a lesson
  // with fabricated material.
  useEffect(() => {
    if (scenarios && phrases && vocabulary && !lesson) setContentUnavailable(true);
  }, [scenarios, phrases, vocabulary, lesson]);

  if (!state) {
    return (
      <main className="min-h-screen bg-black text-text-primary max-w-md mx-auto p-6 flex flex-col">
        <TopBar onHome={onHome} />
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
          <KatzuMascot name={contentUnavailable ? 'listening' : 'avatar'} className="w-24 h-24 object-contain" />
          {contentUnavailable ? (
            <>
              <h1 className="text-xl font-bold font-arabic">المحتوى غير متاح على هذا الجهاز بعد</h1>
              <p className="text-sm text-text-secondary font-arabic leading-relaxed">
                يحتاج الدرس التجريبي إلى تحميل المحتوى مرة واحدة. تحقق من اتصالك بالإنترنت ثم أعد المحاولة —
                لن نعرض لك محتوى غير حقيقي.
              </p>
              <Button size="lg" onClick={() => window.location.reload()}>
                <RefreshCw className="w-4 h-4" />
                إعادة المحاولة
              </Button>
            </>
          ) : (
            <p className="text-sm text-text-secondary font-arabic animate-pulse">جارٍ تحضير الدرس التجريبي…</p>
          )}
        </div>
      </main>
    );
  }

  const progress = demoProgress(state.stage);
  const studyItem = state.items[state.studyIndex];
  const question = state.questions[state.quizIndex];
  const answer = state.answers.find((entry) => entry.questionIndex === state.quizIndex);
  const production = productionItem(state);
  const summary = summarizeDemo(state);

  return (
    <main className="min-h-screen bg-black text-text-primary max-w-md mx-auto pb-10">
      <div className="p-4">
        <TopBar onHome={onHome} />
      </div>

      <div className="px-4">
        {/* Step indicator: a visitor should always know how long this takes. */}
        <div className="flex items-center justify-between mb-4">
          <Badge variant="subtle" size="sm">
            خطوة {Math.min(progress.step, progress.total)} من {progress.total}
          </Badge>
          <span className="text-[11px] font-arabic text-text-muted">بدون تسجيل · بدون بيانات شخصية</span>
        </div>

        {state.stage === 'intro' && (
          <Card variant="hero" glow className="text-center">
            <KatzuMascot name="welcome" glow className="w-28 h-28 mx-auto object-contain mb-2" />
            <h1 className="text-xl font-bold font-arabic mb-1">جرّب كَاتْزُو الآن — بدون حساب</h1>
            <p className="text-xs text-text-secondary font-arabic leading-relaxed mb-4">
              مشهد حقيقي واحد: تتعلّم عبارة، تفهم معناها، ثم تُنتج جملة ألمانية بنفسك وتتلقى تصحيحاً بالعربية.
            </p>
            <Card variant="subtle" className="text-start mb-4">
              <GermanText className="text-base font-bold block mb-1">{state.titleDe}</GermanText>
              <p className="text-xs font-arabic text-text-secondary">{state.titleAr}</p>
            </Card>
            <ul className="text-[11px] font-arabic text-text-secondary text-start space-y-1.5 mb-5">
              <li>• تستمع إلى العبارة وتقرأ ترجمتها</li>
              <li>• تجيب على سؤالين قصيرين</li>
              <li>• تكتب جملة أو ترفعها بصوتك وتأخذ تصحيحاً فورياً</li>
            </ul>
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                triggerHaptic('light');
                dispatch({ type: 'study_next' });
              }}
            >
              ابدأ الدرس التجريبي
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Card>
        )}

        {state.stage === 'study' && studyItem && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-arabic text-text-secondary">
                {state.studyIndex + 1} / {state.items.length}
              </span>
              <Badge variant="primary" size="sm">
                {studyItem.kind === 'phrase' ? 'عبارة' : 'مفردة'}
              </Badge>
            </div>

            <div className="flex items-center justify-between gap-2 mb-3">
              <GermanText className="text-lg font-bold leading-snug">{studyItem.german}</GermanText>
              <button
                type="button"
                onClick={() => speak(studyItem.german)}
                aria-label="استمع إلى النطق"
                className="p-3 rounded-2xl bg-surface-subtle border border-border-subtle text-primary min-h-[44px] min-w-[44px]"
              >
                <Volume2 className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm font-arabic text-text-secondary mb-3">{studyItem.translationAr}</p>
            {studyItem.exampleDe && (
              <p className="text-[11px] font-arabic text-text-muted mb-3 border-s-2 border-border-subtle ps-2.5">
                <GermanText>{studyItem.exampleDe}</GermanText>
              </p>
            )}

            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                triggerHaptic('light');
                dispatch({ type: 'study_next' });
              }}
            >
              {state.studyIndex >= state.items.length - 1 ? 'فهمتها — إلى السؤال' : 'فهمتها — التالي'}
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Card>
        )}

        {state.stage === 'quiz' && question && (
          <Card>
            <p className="text-xs font-arabic text-text-secondary mb-2">ما معنى هذه الجملة بالألمانية؟</p>
            <GermanText className="text-lg font-bold block mb-4">{question.germanPrompt}</GermanText>

            <div className="space-y-2 mb-4">
              {question.options.map((option, index) => {
                const isChosen = answer?.chosenIndex === index;
                const isCorrect = index === question.correctIndex;
                const reveal = !!answer;
                return (
                  <button
                    key={index}
                    type="button"
                    disabled={reveal}
                    onClick={() => {
                      triggerHaptic('light');
                      dispatch({ type: 'answer_quiz', chosenIndex: index });
                    }}
                    className={`w-full text-start rounded-2xl border p-3.5 text-sm font-arabic transition-all min-h-[44px] ${
                      reveal && isCorrect
                        ? 'bg-status-success/15 border-status-success/50 text-status-success'
                        : isChosen
                          ? 'bg-status-error/15 border-status-error/50 text-status-error'
                          : 'bg-surface-subtle border-border-subtle text-text-primary'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>{option}</span>
                      {reveal && isCorrect && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                      {reveal && isChosen && !isCorrect && <XCircle className="w-4 h-4 shrink-0" />}
                    </span>
                  </button>
                );
              })}
            </div>

            {answer && (
              <p className="text-[11px] font-arabic text-text-secondary mb-3">
                {answer.correct
                  ? 'إجابة صحيحة — هكذا يبدو الفهم الحقيقي، لا التخمين.'
                  : 'الإجابة الصحيحة مظللة بالأخضر. الخطأ هنا جزء من التعلّم، وسنعيد إليك هذه الكلمة في المراجعة.'}
              </p>
            )}

            <Button
              size="lg"
              className="w-full"
              disabled={!answer}
              onClick={() => dispatch({ type: 'quiz_next' })}
            >
              {state.quizIndex >= state.questions.length - 1 ? 'إلى التحدث' : 'السؤال التالي'}
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Card>
        )}

        {state.stage === 'produce' && production && (
          <Card>
            <p className="text-xs font-arabic text-text-secondary mb-2">
              اكتب هذه بالعربية… بالألمانية. جرّب من ذاكرتك، ولا بأس إن أخطأت:
            </p>
            <p className="text-lg font-arabic font-bold mb-4">{production.translationAr}</p>

            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                dir="ltr"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={voice.isRecording ? 'أنا أستمع إليك…' : 'اكتب بالألمانية...'}
                className="flex-1 h-12 bg-surface-card border border-border-subtle focus:border-primary rounded-2xl px-4 text-sm font-german outline-none transition-all"
                aria-label="جملتك بالألمانية"
              />
              {voice.isSupported && (
                <button
                  type="button"
                  onClick={() => {
                    if (voice.isRecording) {
                      voice.stop();
                      return;
                    }
                    setVoiceError(null);
                    // See `voiceStartFailureMessageAr`: the reason a recording could
                    // not *start* comes back as a return value, not through
                    // `onFailure`, so a visitor's denied tap is answered here.
                    void voice.start().then((failure) => {
                      if (failure) setVoiceError(voiceStartFailureMessageAr(failure));
                    });
                  }}
                  aria-label={voice.isRecording ? 'إيقاف الإدخال الصوتي' : 'ابدأ الإدخال الصوتي'}
                  className={`p-3.5 rounded-2xl border transition-all min-h-[44px] min-w-[44px] ${
                    voice.isRecording
                      ? 'bg-status-error border-status-error text-white animate-pulse'
                      : 'bg-surface-card border-border-subtle text-primary'
                  }`}
                >
                  {voice.isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              )}
            </div>

            {/* A visitor's own words, as they are said — the first voice interaction
                in the product should not feel like sending a message into a void. */}
            {voice.isRecording && voice.interimText && (
              <p data-testid="live-caption" className="mb-3 flex items-baseline gap-2">
                <span className="shrink-0 text-xs font-arabic font-semibold text-kz-lavender">أسمع</span>
                <span dir="ltr" className="min-w-0 flex-1 truncate font-german text-sm text-kz-ink">
                  {voice.interimText}
                </span>
              </p>
            )}

            {voiceError && (
              <p role="alert" className="mb-3 text-xs font-arabic leading-relaxed text-kz-amber">
                {voiceError}
              </p>
            )}

            <Button
              size="lg"
              className="w-full mb-2"
              disabled={!input.trim()}
              onClick={() => {
                triggerHaptic('success');
                dispatch({ type: 'submit_production', actual: input });
              }}
            >
              <Send className="w-4 h-4 rotate-180" />
              تحقّق من جملتي
            </Button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'skip_production' })}
              className="w-full py-2 text-xs font-arabic text-text-muted hover:text-text-secondary min-h-[44px]"
            >
              تخطّي هذه الخطوة
            </button>
          </Card>
        )}

        {state.stage === 'done' && (
          <>
            <Card variant="hero" glow className="text-center mb-3">
              <KatzuMascot name="celebrating" glow className="w-28 h-28 mx-auto object-contain mb-2" />
              <h1 className="text-xl font-bold font-arabic mb-1">أكملت درسك الأول</h1>
              <p className="text-xs font-arabic text-text-secondary">{summary.canHandleAr}</p>
            </Card>

            {state.production && (
              <Card className="mb-3 text-start">
                <p className="text-[11px] font-arabic text-text-muted mb-1">قلت:</p>
                <GermanText className="text-sm block mb-2 line-through decoration-status-error/50">
                  {state.production.actual}
                </GermanText>
                <p className="text-[11px] font-arabic text-text-muted mb-1">الصيغة الصحيحة:</p>
                <GermanText className="text-sm font-bold text-status-success block mb-3">
                  {state.production.expected}
                </GermanText>
                <p className="text-[11px] font-arabic text-text-secondary leading-relaxed">
                  {state.production.verdict === 'correct'
                    ? 'أحسنت! جملة صحيحة تماماً — هكذا يبدو الدخول في موقف حقيقي بثقة.'
                    : 'كرة التعلّم: سنعيد هذه العبارة إليك في المراجعة حتى تثبت.'}
                </p>
              </Card>
            )}

            <Card className="mb-4 text-start">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold font-arabic">بطاقة مراجعة واحدة جاهزة</span>
              </div>
              <p className="text-[11px] font-arabic text-text-secondary leading-relaxed">
                أنشأنا لعبارة تدرّبت عليها بطاقة مراجعة مبدئية. أنشئ حساباً مجانياً لتُحفظ في ذاكرتك
                الدائمة وتعود إليك في الوقت المناسب — التقدّم الذي جمعته في التجربة سينتقل معك.
              </p>
              {state.production && (
                <div className="mt-3 rounded-xl border border-border-subtle bg-surface-card p-3">
                  <p className="text-[11px] font-arabic text-text-muted mb-1">البطاقة:</p>
                  <GermanText className="text-sm font-bold block">{state.production.expected}</GermanText>
                </div>
              )}
            </Card>
            <p className="text-[11px] font-arabic text-text-muted text-center mb-3">
              غداً: مشهد جديد ينتظرك — دقيقتان تكفيان.
            </p>

            {/* Conversion: the only place the demo asks for an account, and only
                after the visitor has actually learned something. */}
            <div className="space-y-2.5">
              <Button size="lg" className="w-full" onClick={onSignUp}>
                أنشئ حسابك المجاني واحفظ تقدّمك
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <Button size="md" variant="secondary" className="w-full" onClick={onStartPlacement}>
                أكمل بالاختبار التحديدي (٦ دقائق)
              </Button>
              <button
                type="button"
                onClick={onHome}
                className="w-full py-2 text-xs font-arabic text-text-muted hover:text-text-secondary min-h-[44px]"
              >
                العودة إلى الصفحة الرئيسية
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
};

function TopBar({ onHome }: { onHome: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onHome}
        aria-label="العودة إلى الصفحة الرئيسية"
        className="p-2.5 rounded-2xl bg-surface-card border border-border-subtle min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <ArrowRight className="w-5 h-5 text-text-secondary" />
      </button>
      <span className="font-arabic text-sm font-bold text-text-secondary">تجربة كَاتْزُو</span>
      <div className="w-10" />
    </div>
  );
}
