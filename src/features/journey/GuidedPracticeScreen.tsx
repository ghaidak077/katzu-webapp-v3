import React, { useCallback, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import type { VocabularyEntity } from '@/types/models';
import { enrolStudiedPhrases, enrolStudiedVocabulary } from '@/lib/srs/store';
import { scenarioToVocabTopic } from '@/lib/utils/scenarioVocab';
import { sceneFor } from '@/lib/design/scenes';
import { buildGuidedPractice, gradeRepeat, gradeTypedProduction, type PracticeCard } from '@/lib/journey/practice';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { useVoiceCapture, voiceStartFailureMessageAr } from '@/lib/audio/useVoiceCapture';
import { track } from '@/lib/analytics/client';
import { triggerHaptic } from '@/lib/utils/haptics';
import { isProEffective } from '@/lib/utils/subscription';
import { servedLevel } from '@/lib/entitlement/trial';
import { GermanText } from '@/components/common/GermanText';
import { GlassCard, FloatingControl } from '@/components/glass/GlassCard';
import { GlassButton, PrimaryAction } from '@/components/glass/GlassButton';
import { GlassWell } from '@/components/glass/GlassSurface';
import { SceneBackdrop } from '@/components/glass/SceneBackdrop';
import { ProgressRail } from '@/components/v2/ProgressStrip';
import { KatzuThinking } from '@/components/effects/KatzuThinking';
import { KatzuPresence } from '@/components/v2/KatzuPresence';
import { ArrowRight, Volume2, Mic, MicOff, Check, Sparkles, ChevronLeft } from 'lucide-react';

export interface GuidedPracticeScreenProps {
  scenarioId: string;
  onBack: () => void;
  /** `أنا جاهز` — straight into the live conversation. */
  onReady: (mode: 'quick' | 'immersion') => void;
  /** Optional deep practice (the full study screen) for learners who want more. */
  onDeepPractice?: () => void;
}

type RetrievalOutcome = { verdict: 'correct' | 'close' | 'wrong'; tone: 'earned' | 'neutral'; messageAr: string };

/**
 * Guided Practice.
 *
 * Short on purpose: two or three phrases, one retrieval, one listening moment,
 * then out — the conversation is where the learning happens. Everything here is
 * a rehearsal of a real line from real content, and both graded moments use the
 * review engine's own comparators, so "correct" means the same thing on every
 * screen that ever says it.
 *
 * Voice is preferred and typing is always available; a microphone that is denied
 * or unsupported degrades into a text box, never into a dead end.
 */
export const GuidedPracticeScreen: React.FC<GuidedPracticeScreenProps> = ({
  scenarioId,
  onBack,
  onReady,
  onDeepPractice,
}) => {
  const user = useLiveQuery(() => db.users.get('current_user'));
  const scenario = useLiveQuery(() => db.scenarios.get(scenarioId));
  const phrasesQ = useLiveQuery(() => db.starter_phrases.where('scenario_id').equals(scenarioId).toArray());
  const vocabTopic = scenarioToVocabTopic(scenario);
  const vocabQ = useLiveQuery(
    () => (vocabTopic ? db.vocabulary.where('topic').equals(vocabTopic).toArray() : Promise.resolve<VocabularyEntity[]>([])),
    [vocabTopic],
  );

  const [retrievalAnswer, setRetrievalAnswer] = useState('');
  const [retrievalOutcome, setRetrievalOutcome] = useState<RetrievalOutcome | null>(null);
  const [heardText, setHeardText] = useState('');
  const [repeatMessage, setRepeatMessage] = useState<string | null>(null);
  const [repeatTone, setRepeatTone] = useState<'earned' | 'neutral'>('neutral');
  const [micError, setMicError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // The rehearsal deck is drawn at the level the episode runs at — the level the
  // conversation that follows will be served at.
  const level = servedLevel(user?.cefrLevel, isProEffective(user));
  const scene = useMemo(
    () => sceneFor(scenario ? { id: scenario.id, category: scenario.category } : { id: scenarioId }),
    [scenario, scenarioId],
  );

  const practice = useMemo(
    () => buildGuidedPractice({ phrases: phrasesQ || [], vocabulary: vocabQ || [], level }),
    [phrasesQ, vocabQ, level],
  );

  const { speak, isPlaying, activeCharIndex } = useSpeechOutput({ speed: user?.speechSpeed || 1.0 });

  // Same pipeline as the live conversation: record, then recognise on the worker.
  // The browser's own speech API is gone from the app — it recorded nothing on
  // Android and it plays a system chime no page can mute.
  const voice = useVoiceCapture({
    onTranscript: (transcript) => {
      setHeardText(transcript);
      if (!practice.listening) return;
      const result = gradeRepeat(practice.listening.de, transcript);
      setRepeatTone(result.verdict === 'correct' ? 'earned' : 'neutral');
      setRepeatMessage(result.messageAr);
    },
    onFailure: (_failure, messageAr) => setMicError(messageAr),
  });

  /** Deep practice and the conversation both work from what was shown here. */
  const persistPractice = useCallback(async () => {
    const phraseIds = practice.cards
      .filter((card) => card.id.startsWith('phrase_'))
      .map((card) => Number(card.id.replace('phrase_', '')));
    const vocabIds = practice.cards
      .filter((card) => card.id.startsWith('vocab_'))
      .map((card) => Number(card.id.replace('vocab_', '')));

    const phrases = (phrasesQ || []).filter((phrase) => phraseIds.includes(Number(phrase.id)));
    const words = (vocabQ || []).filter((word) => vocabIds.includes(Number(word.id)));

    await enrolStudiedPhrases(phrases);
    await enrolStudiedVocabulary(words);
    // The mission selector reads this record: without it, today's scenario still
    // looks untouched and the learner would be offered it again tomorrow.
    await db.scenario_training.put({
      scenarioId,
      userId: 'current_user',
      studiedAt: Date.now(),
      quizAttempted: false,
      lastScore: 0,
      effectiveLevel: level,
      updatedAt: Date.now(),
    });
    track('scenario_studied', { scenarioId });
  }, [practice.cards, phrasesQ, vocabQ, scenarioId, level]);

  const handleReady = async () => {
    setIsSaving(true);
    try {
      await persistPractice();
    } catch {
      // Failing to write the review enrolment must never block the conversation:
      // the learner's practice still happened, and the live session enrols its
      // own mistakes independently.
    }
    setIsSaving(false);
    onReady('quick');
  };

  const handleCheckRetrieval = () => {
    if (!practice.retrieval) return;
    const outcome = gradeTypedProduction(practice.retrieval.answerDe, retrievalAnswer);
    setRetrievalOutcome(outcome);
    triggerHaptic(outcome.verdict === 'correct' ? 'success' : 'light');
  };

  const handleOpenDeepPractice = async () => {
    try {
      await persistPractice();
    } catch {
      /* deep practice is optional; a failed enrolment must not block navigation */
    }
    onDeepPractice?.();
  };

  const playCard = (card: PracticeCard) => {
    triggerHaptic('light');
    speak(card.de);
  };

  const handled = [retrievalOutcome !== null, repeatMessage !== null].filter(Boolean).length;

  // The deck comes from local content, so this is usually a single frame on a warm
  // cache — but it is still a load, and it is announced in the app's one processing
  // language rather than flashed as a blank screen.
  if (phrasesQ === undefined || vocabQ === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <KatzuThinking size={64} labelAr="نُجهّز تدريب اليوم…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-4 pb-32 pt-5">
      <div className="mx-auto max-w-md">
        <header className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            aria-label="العودة إلى القصة"
            className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.04]"
          >
            <ArrowRight className="h-5 w-5 text-kz-inkDim" />
          </button>
          <div className="text-end">
            <p className="kz-ar-micro text-kz-inkFaint">تدريب موجّه · {practice.cards.length} عبارات</p>
            <p className="kz-ar-caption text-kz-ink">{scene.locationAr}</p>
          </div>
        </header>

        {/* A small scene fragment keeps this screen in the same episode. */}
        <SceneBackdrop scene={scene} className="mb-4 h-24 w-full rounded-squircle" readability>
          <div className="flex h-full items-end justify-between p-3">
            <p className="kz-ar-micro text-kz-inkDim">جهّز لسانك — ثم نتحدث</p>
            <KatzuPresence state="practice" size="sm" className="-mb-1" />
          </div>
        </SceneBackdrop>

        {practice.empty ? (
          <GlassCard tier="glass" className="text-center">
            <KatzuPresence state="blocked" size="md" className="mx-auto mb-2" />
            <p className="kz-ar-body text-kz-ink">لا توجد عبارات محفوظة لهذا المشهد على جهازك بعد.</p>
            <p className="kz-ar-caption mt-2 text-kz-inkFaint">
              يمكنك المتابعة إلى المحادثة الآن؛ ستحتاج اتصالاً بالإنترنت.
            </p>
          </GlassCard>
        ) : (
          <>
            {/* 1. The phrases. Playable, LTR-isolated, with the Arabic gloss. */}
            <ul className="space-y-2.5">
              {practice.cards.map((card) => (
                <li key={card.id}>
                  <GlassCard tier="glass" className="animate-kz-rise">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => playCard(card)}
                        aria-label={`استمع: ${card.de}`}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors ${
                          isPlaying && activeCharIndex !== null
                            ? 'border-kz-lavender/50 bg-kz-lavender/15 text-kz-lavender'
                            : 'border-white/10 bg-white/[0.04] text-kz-inkDim'
                        }`}
                      >
                        <Volume2 className="h-5 w-5" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <GermanText className="kz-de-body block text-kz-ink">{card.de}</GermanText>
                        <p className="kz-ar-caption mt-1 text-kz-inkDim">{card.ar}</p>
                        {card.noteAr && <p className="kz-ar-micro mt-1 text-kz-inkFaint">{card.noteAr}</p>}
                        <span className="kz-ar-micro mt-1.5 inline-block text-kz-inkFaint">{card.level}</span>
                      </div>
                    </div>
                  </GlassCard>
                </li>
              ))}
            </ul>

            {/* 2. One retrieval: produce the German from the Arabic meaning. */}
            {practice.retrieval && (
              <GlassCard tier="glass" className="mt-4">
                <p className="kz-ar-micro mb-2 text-kz-inkFaint">استرجاع سريع</p>
                <p className="kz-ar-body text-kz-ink">
                  قل أو اكتب بالألمانية: <span className="font-bold">{practice.retrieval.promptAr}</span>
                </p>
                <input
                  type="text"
                  dir="ltr"
                  value={retrievalAnswer}
                  onChange={(event) => setRetrievalAnswer(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleCheckRetrieval()}
                  placeholder="Schreibe hier auf Deutsch…"
                  aria-label="اكتب الجملة بالألمانية"
                  className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 font-german text-sm text-kz-ink outline-none transition-colors placeholder:font-arabic placeholder:text-[0.72rem] placeholder:text-kz-inkFaint focus:border-kz-lavender/50"
                />
                <div className="mt-3 flex items-center gap-2">
                  <GlassButton
                    variant={retrievalOutcome?.tone === 'earned' ? 'earned' : 'secondary'}
                    onClick={handleCheckRetrieval}
                    disabled={!retrievalAnswer.trim()}
                    className="flex-1"
                  >
                    <Check className="h-4 w-4" />
                    تحقق
                  </GlassButton>
                  {retrievalOutcome?.verdict !== 'correct' && (
                    <GlassButton
                      variant="quiet"
                      onClick={() =>
                        setRetrievalOutcome({
                          verdict: 'wrong',
                          tone: 'neutral',
                          messageAr: `الجملة الصحيحة: ${practice.retrieval!.answerDe}`,
                        })
                      }
                    >
                      أرني الصحيحة
                    </GlassButton>
                  )}
                </div>
                {retrievalOutcome && (
                  <p
                    className={`kz-ar-caption mt-3 ${
                      retrievalOutcome.tone === 'earned' ? 'kz-earned-text' : 'text-kz-inkDim'
                    }`}
                  >
                    {retrievalOutcome.messageAr}
                  </p>
                )}
              </GlassCard>
            )}

            {/* 3. One listening moment: hear it, repeat it, and see what was heard. */}
            {practice.listening && (
              <GlassCard tier="glass" className="mt-4">
                <p className="kz-ar-micro mb-2 text-kz-inkFaint">استمع وكرّر</p>
                <GermanText className="kz-de-body block text-kz-ink">{practice.listening.de}</GermanText>
                <p className="kz-ar-caption mt-1 text-kz-inkDim">{practice.listening.ar}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <GlassButton variant="secondary" onClick={() => speak(practice.listening!.de)}>
                    <Volume2 className="h-4 w-4" />
                    استمع
                  </GlassButton>
                  {voice.isSupported ? (
                    <GlassButton
                      variant={voice.isRecording ? 'earned' : 'secondary'}
                      onClick={() => {
                        setMicError(null);
                        setRepeatMessage(null);
                        setHeardText('');
                        if (voice.isRecording) {
                          voice.stop();
                          return;
                        }
                        // A microphone that never opens has to say so here as well.
                        // `start()` returns the reason (`onFailure` only covers what
                        // happens once recording is under way), so discarding the
                        // return value made a denied tap look like a dead button.
                        void voice.start().then((failure) => {
                          if (failure) setMicError(voiceStartFailureMessageAr(failure));
                        });
                      }}
                    >
                      {voice.isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      {voice.isRecording ? 'أوقف التسجيل' : 'كرّر بصوتك'}
                    </GlassButton>
                  ) : (
                    <span className="kz-ar-micro text-kz-inkFaint">
                      الإدخال الصوتي غير متاح في هذا المتصفح — اكتب ما سمعته.
                    </span>
                  )}
                </div>

                {/* Typed fallback, always usable — including after a denied mic. */}
                <input
                  type="text"
                  dir="ltr"
                  value={heardText}
                  onChange={(event) => setHeardText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    const result = gradeRepeat(practice.listening!.de, heardText);
                    setRepeatTone(result.verdict === 'correct' ? 'earned' : 'neutral');
                    setRepeatMessage(result.messageAr);
                  }}
                  placeholder="اكتب ما سمعته…"
                  aria-label="اكتب ما سمعته بالألمانية"
                  className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 font-german text-sm text-kz-ink outline-none transition-colors placeholder:font-arabic placeholder:text-[0.72rem] placeholder:text-kz-inkFaint focus:border-kz-lavender/50"
                />

                {/* The learner's own words while they speak: the platform recogniser
                    returns them as they are said, so a repeat is not a leap of faith
                    until the recording ends. */}
                {voice.isRecording && voice.interimText && (
                  <p data-testid="live-caption" className="mt-2 flex items-baseline gap-2">
                    <span className="kz-ar-micro shrink-0 font-semibold text-kz-lavender">أسمع</span>
                    <span dir="ltr" className="min-w-0 flex-1 truncate font-german text-sm text-kz-ink">
                      {voice.interimText}
                    </span>
                  </p>
                )}

                {micError && (
                  <p className="kz-ar-micro mt-2 leading-relaxed text-kz-amber">{micError}</p>
                )}
                {repeatMessage && (
                  <p className={`kz-ar-caption mt-2 ${repeatTone === 'earned' ? 'kz-earned-text' : 'text-kz-inkDim'}`}>
                    {repeatMessage}
                  </p>
                )}
              </GlassCard>
            )}

            {/* Optional deeper work, kept quiet: it must not compete with `أنا جاهز`. */}
            {onDeepPractice && (
              <button
                type="button"
                onClick={handleOpenDeepPractice}
                className="kz-ar-caption mt-4 flex min-h-[44px] w-full items-center justify-center gap-1.5 text-kz-inkFaint transition-colors hover:text-kz-inkDim"
              >
                <Sparkles className="h-3.5 w-3.5" />
                تدريب أعمق على هذا المشهد (اختياري)
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}

        <GlassWell className="mt-5 p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="kz-ar-micro text-kz-inkDim">جاهزيتك لهذا الموقف</span>
            <span className="kz-ar-micro text-kz-inkFaint">{handled} من ٢ خطوات</span>
          </div>
          <ProgressRail value={handled} max={2} />
          <p className="kz-ar-micro mt-2 text-kz-inkFaint">
            هذا ليس تقييماً — إنه تمرين. المحادثة هي المكان الذي نقيس فيه فعلاً.
          </p>
        </GlassWell>
      </div>

      {/* The one action, docked above the safe area. */}
      <FloatingControl className="fixed bottom-0 start-0 end-0 z-20 mx-auto max-w-md p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <PrimaryAction
          hintAr="بعدها تبدأ المحادثة الحقيقية — بالصوت أو بالكتابة."
          onClick={handleReady}
          disabled={isSaving}
        >
          أنا جاهز
        </PrimaryAction>
      </FloatingControl>
    </div>
  );
};

export default GuidedPracticeScreen;
