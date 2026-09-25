import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { enrolStudiedPhrases, enrolStudiedVocabulary } from '@/lib/srs/store';
import { workerClient } from '@/lib/api/workerClient';
import {
  DRILL_SIZE,
  buildDrillQueue,
  describeDrillResult,
  diffDictation,
  type DictationResult,
  type DrillItem,
} from '@/lib/listening/drill';
import { GermanText } from '@/components/common/GermanText';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { triggerHaptic } from '@/lib/utils/haptics';
import { ArrowLeft, CheckCircle2, Headphones, RotateCcw, Sparkles, Volume2, XCircle } from 'lucide-react';

export interface ListeningScreenProps {
  onBack: () => void;
}

/** How long the sentence stays visible in the no-audio fallback. */
const PEEK_MS = 3000;

function speechIsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Dictation: hear German, write German. The German text is never on screen before
 * the learner answers — that is the whole exercise — and on a device with no
 * speech synthesis the sentence is shown briefly and hidden instead, so the drill
 * still works rather than becoming a dead end.
 */
export const ListeningScreen: React.FC<ListeningScreenProps> = ({ onBack }) => {
  const user = useLiveQuery(() => db.users.get('current_user'));

  const [queue, setQueue] = useState<DrillItem[] | null>(null);
  const startedRef = useRef(false);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<DictationResult | null>(null);
  const [tally, setTally] = useState({ correct: 0, close: 0 });
  const [peekVisible, setPeekVisible] = useState(false);

  const audioAvailable = useMemo(() => speechIsAvailable(), []);
  const { speak } = useSpeechOutput({ speed: user?.speechSpeed || 1.0 });
  const { speak: speakSlow } = useSpeechOutput({ speed: 0.8 });

  useEffect(() => {
    // Waits for the stored level: starting before it loads would drill every
    // learner at A1. Every read below resolves even when it fails, so the screen
    // can never be left on a spinner.
    if (startedRef.current || !user) return;
    startedRef.current = true;
    void (async () => {
      // Starter phrases are otherwise fetched one scenario at a time, so a learner
      // who has not opened one yet would only ever hear single words — but
      // understanding a whole sentence is the point. Top the pool up in parallel.
      const scenarios = await db.scenarios.toArray().catch(() => []);
      await Promise.all(
        scenarios.map((scenario) => workerClient.fetchScenarioDetail(scenario.id).catch(() => null)),
      );
      const [vocabulary, phrases] = await Promise.all([
        db.vocabulary.toArray().catch(() => []),
        db.starter_phrases.toArray().catch(() => []),
      ]);
      setQueue(buildDrillQueue({ vocabulary, phrases }, user.cefrLevel || 'A1', DRILL_SIZE));
    })();
  }, [user]);

  const current = queue && index < queue.length ? queue[index] : null;
  const finished = queue !== null && index >= queue.length;

  // The drill's result used to exist only on this screen, so "how is your
  // listening?" had no honest answer anywhere in the app. One row per finished
  // drill is what the skills card reads.
  const recordedRef = useRef(false);
  useEffect(() => {
    if (!finished || recordedRef.current || index === 0) return;
    recordedRef.current = true;
    void db.skill_practice.add({
      userId: 'current_user',
      skill: 'listening',
      score: Math.round((tally.correct / index) * 100),
      at: Date.now(),
    });
  }, [finished, index, tally.correct]);

  // Play (or briefly show) the sentence when a new item appears.
  useEffect(() => {
    if (!current) return;
    setTyped('');
    setResult(null);
    if (audioAvailable) {
      speak(current.german);
      return;
    }
    setPeekVisible(true);
    const timer = setTimeout(() => setPeekVisible(false), PEEK_MS);
    return () => clearTimeout(timer);
  }, [current, audioAvailable, speak]);

  const check = (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !typed.trim()) return;
    const outcome = diffDictation(current.german, typed);
    setResult(outcome);
    if (outcome.verdict === 'correct') setTally((prev) => ({ ...prev, correct: prev.correct + 1 }));
    if (outcome.verdict === 'close') setTally((prev) => ({ ...prev, close: prev.close + 1 }));
    triggerHaptic(outcome.verdict === 'correct' ? 'success' : 'error');
    speak(current.german);
  };

  const next = async () => {
    if (current && result && result.verdict !== 'correct') {
      // What the ear missed comes back: this is the same queue the rest of the app
      // reviews from, so listening gaps are not a separate forgotten list.
      if (current.kind === 'vocab') {
        const word = await db.vocabulary.get(current.sourceId);
        if (word) await enrolStudiedVocabulary([word]);
      } else {
        const phrase = await db.starter_phrases.get(current.sourceId);
        if (phrase) await enrolStudiedPhrases([phrase]);
      }
    }
    setIndex((i) => i + 1);
  };

  if (queue === null) {
    return (
      <div className="min-h-screen bg-black text-text-primary flex items-center justify-center" role="status" aria-live="polite">
        <span className="font-arabic text-text-secondary">جاري تحضير تدريب الاستماع...</span>
      </div>
    );
  }

  if (!queue.length) {
    return (
      <div className="min-h-screen bg-black text-text-primary p-6 max-w-md mx-auto flex flex-col items-center justify-center text-center">
        <KatzuMascot name="peace" className="w-36 h-36 object-contain mb-4" />
        <h2 className="text-xl font-bold font-arabic mb-2">لا يوجد محتوى للاستماع بعد</h2>
        <p className="text-sm font-arabic text-text-secondary leading-relaxed max-w-xs">
          يحتاج هذا التدريب جمل المفردات والعبارات. افتح مشهداً أولاً، وسأجهّز لك تدريباً من محتواه.
        </p>
        <Button className="mt-6" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" /> عد إلى المسار
        </Button>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="min-h-screen bg-black text-text-primary p-6 max-w-md mx-auto flex flex-col justify-center">
        <Card variant="hero" glow className="text-center">
          <KatzuMascot name="celebrating" className="w-28 h-28 object-contain mx-auto mb-3" />
          <h2 className="text-xl font-bold font-arabic mb-1">انتهى تدريب الاستماع</h2>
          <p className="text-xs text-text-secondary font-arabic mb-4">
            سمعت {index} جملة — {tally.correct} بدقة، و{tally.close} قريبة.
          </p>
          <p className="text-[11px] text-text-muted font-arabic mb-4 leading-relaxed">
            {describeDrillResult(tally.correct, index)}
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
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold font-arabic">تدريب الاستماع</h2>
          <p className="text-[11px] text-text-secondary font-arabic">
            استمع واكتب ما تسمعه بالألمانية
          </p>
        </div>
        <Badge variant="subtle" size="sm">
          <Headphones className="w-3 h-3" />
          {index + 1} / {queue.length}
        </Badge>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle mb-5">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
      </div>

      {!audioAvailable && (
        <p className="mb-3 rounded-2xl border border-status-learning/40 bg-status-learning/10 p-3 text-[11px] font-arabic text-text-secondary">
          متصفحك لا يدعم النطق، لذلك ستظهر الجملة {PEEK_MS / 1000} ثوانٍ ثم تختفي — اكتبها بعد ذلك.
        </p>
      )}

      {current && (
        <Card className="p-5 mb-4">
          <div className="text-center py-3">
            {audioAvailable ? (
              <>
                <button
                  type="button"
                  onClick={() => speak(current.german)}
                  className="w-20 h-20 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto transition-all active:scale-95"
                  aria-label="تشغيل الجملة"
                >
                  <Volume2 className="w-8 h-8" />
                </button>
                <div className="flex items-center justify-center gap-3 mt-3">
                  <button
                    type="button"
                    onClick={() => speakSlow(current.german)}
                    className="text-[11px] font-arabic text-text-secondary hover:text-primary transition-colors"
                  >
                    تشغيل بطيء 0.8x
                  </button>
                  <span className="text-text-muted">•</span>
                  <button
                    type="button"
                    onClick={() => speak(current.german)}
                    className="text-[11px] font-arabic text-text-secondary hover:text-primary transition-colors"
                  >
                    إعادة
                  </button>
                </div>
              </>
            ) : (
              <div className="min-h-[96px] flex flex-col items-center justify-center">
                {peekVisible && !result ? (
                  <GermanText className="text-xl font-bold text-text-primary">{current.german}</GermanText>
                ) : (
                  <>
                    <p className="text-xs font-arabic text-text-muted mb-3">اختفت الجملة — اكتبها الآن</p>
                    <button
                      type="button"
                      onClick={() => {
                        setPeekVisible(true);
                        setTimeout(() => setPeekVisible(false), PEEK_MS);
                      }}
                      className="text-[11px] font-arabic text-primary hover:underline"
                    >
                      اعرضها مرة أخرى
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {result === null ? (
            <form onSubmit={check} className="space-y-3">
              <input
                type="text"
                dir="ltr"
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="اكتب ما سمعته بالألمانية..."
                aria-label="ما سمعته بالألمانية"
                className="w-full h-12 bg-surface-subtle border border-border-subtle focus:border-primary rounded-2xl px-4 text-base font-german outline-none transition-all"
              />
              <Button type="submit" className="w-full" disabled={!typed.trim()}>
                تحقّق
              </Button>
            </form>
          ) : (
            <div className="space-y-3">
              <div
                className={`flex items-start gap-2 rounded-2xl p-3 ${
                  result.verdict === 'correct'
                    ? 'bg-status-success/15 border border-status-success/40'
                    : result.verdict === 'close'
                      ? 'bg-status-learning/15 border border-status-learning/40'
                      : 'bg-status-error/15 border border-status-error/40'
                }`}
                role="status"
                aria-live="polite"
              >
                {result.verdict === 'correct' ? (
                  <CheckCircle2 className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
                ) : result.verdict === 'close' ? (
                  <Sparkles className="w-4 h-4 text-status-learning mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-status-error mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold font-arabic">
                    {result.verdict === 'correct'
                      ? 'سمعتها بدقة'
                      : `أمسكت ${result.matched} من ${result.total} كلمات`}
                  </p>
                  {result.missedWords.length > 0 && (
                    <p className="mt-1 text-[11px] font-arabic text-text-secondary">
                      الكلمات التي فاتتك:{' '}
                      <GermanText className="font-bold text-status-error">
                        {result.missedWords.join('، ')}
                      </GermanText>
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-surface-subtle p-3">
                <span className="text-[10px] font-arabic text-text-muted block mb-1">الجملة كاملة</span>
                <GermanText className="text-sm font-bold text-text-primary">{current.german}</GermanText>
                <p className="mt-1 text-[11px] font-arabic text-text-secondary">{current.translationAr}</p>
              </div>

              <Button className="w-full" onClick={next}>
                {index + 1 >= queue.length ? 'أظهر النتيجة' : 'الجملة التالية'}
              </Button>
            </div>
          )}
        </Card>
      )}

      <button
        onClick={onBack}
        className="w-full text-center text-xs font-arabic text-text-muted hover:text-text-primary transition-colors py-2"
      >
        <RotateCcw className="w-3 h-3 inline me-1" />
        إنهاء التدريب والعودة
      </button>
    </div>
  );
};
