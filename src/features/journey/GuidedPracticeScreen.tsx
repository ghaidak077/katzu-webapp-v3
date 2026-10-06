import React, { useCallback, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import type { VocabularyEntity } from '@/types/models';
import { enrolStudiedPhrases, enrolStudiedVocabulary } from '@/lib/srs/store';
import { scenarioToVocabTopic } from '@/lib/utils/scenarioVocab';
import { sceneFor } from '@/lib/design/scenes';
import { buildGuidedPractice, gradeRepeat, gradeTypedProduction, type PracticeCard } from '@/lib/journey/practice';
import { buildWordBank } from '@/lib/utils/wordBank';
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
  /** `أنا جاهز` — straight into the live conversation with what this practice showed. */
  onReady: (context: { vocabulary: string[]; grammarId?: string }) => void;
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
  // `grammar` rows are global (the D1 table has no scenario link), so the rule
  // for today is chosen from the whole table in `selectGrammarRule`.
  const grammarQ = useLiveQuery(() => db.grammar.toArray());

  const [retrievalAnswer, setRetrievalAnswer] = useState('');
  const [retrievalOutcome, setRetrievalOutcome] = useState<RetrievalOutcome | null>(null);
  const [grammarAnswer, setGrammarAnswer] = useState('');
  const [grammarOutcome, setGrammarOutcome] = useState<RetrievalOutcome | null>(null);
  const [heardText, setHeardText] = useState('');
  const [repeatMessage, setRepeatMessage] = useState<string | null>(null);
  const [repeatTone, setRepeatTone] = useState<'earned' | 'neutral'>('neutral');
  const [micError, setMicError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  /**
   * Launch polish (Screen 2.1/2.5): the deeper beats are collapsed by default
   * and ONE section is open at a time, so the default view is phrases + CTA
   * and at most one text field is ever on screen.
   */
  const [openSection, setOpenSection] = useState<'grammar' | 'retrieval' | 'listening' | null>(null);

  // The rehearsal deck is drawn at the level the episode runs at — the level the
  // conversation that follows will be served at.
  const level = servedLevel(user?.cefrLevel, isProEffective(user));
  const scene = useMemo(
    () => sceneFor(scenario ? { id: scenario.id, category: scenario.category } : { id: scenarioId }),
    [scenario, scenarioId],
  );

  const practice = useMemo(
    () => buildGuidedPractice({ phrases: phrasesQ || [], vocabulary: vocabQ || [], grammar: grammarQ || [], level }),
    [phrasesQ, vocabQ, grammarQ, level],
  );

  // The words of each production target, tappable. The owner's report was that
  // these two beats ask the learner to build a German sentence with no way to
  // find the vocabulary; the bank is that way.
  const grammarBank = useMemo(
    () => (practice.grammar ? buildWordBank(practice.grammar.exampleDe) : []),
    [practice.grammar],
  );
  const retrievalBank = useMemo(
    () => (practice.retrieval ? buildWordBank(practice.retrieval.answerDe) : []),
    [practice.retrieval],
  );

  const renderBank = (bank: string[], onPick: (word: string) => void) =>
    bank.length > 0 ? (
      <div className="mt-2">
        <p className="kz-ar-micro text-kz-inkFaint">رتّب الكلمات</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2" dir="ltr">
          {bank.map((word, wordIndex) => (
            <button
              key={`${word}-${wordIndex}`}
              type="button"
              onClick={() => onPick(word)}
              className="flex min-h-[44px] items-center rounded-xl border border-white/10 bg-white/[0.04] px-3 font-german text-sm text-kz-ink transition-colors pointer-hover:border-kz-lavender/50"
            >
              {word}
            </button>
          ))}
        </div>
      </div>
    ) : null;

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
    onReady({
      vocabulary: practice.vocabularyContext,
      grammarId: practice.grammar?.id,
    });
  };

  const handleCheckRetrieval = () => {
    if (!practice.retrieval) return;
    const outcome = gradeTypedProduction(practice.retrieval.answerDe, retrievalAnswer);
    setRetrievalOutcome(outcome);
    triggerHaptic(outcome.verdict === 'correct' ? 'success' : 'light');
  };

  /**
   * The rule's own example, produced from its Arabic meaning.
   *
   * Deliberately a production and not a recognition tap: the grammar beat has to
   * cost the learner the same thing every other step does — recalling German —
   * otherwise it is a reading card wearing a drill's clothes.
   */
  const handleCheckGrammar = () => {
    if (!practice.grammar) return;
    const outcome = gradeTypedProduction(practice.grammar.exampleDe, grammarAnswer);
    setGrammarOutcome(outcome);
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

  const handled = [retrievalOutcome !== null, grammarOutcome !== null, repeatMessage !== null].filter(Boolean).length;
  // Two steps without a rule on this device, three with one — the rail must
  // never promise a step the learner has no way to finish.
  const totalSteps = practice.grammar ? 3 : 2;
  const totalStepsAr = String(totalSteps);

  // The deck comes from local content, so this is usually a single frame on a warm
  // cache — but it is still a load, and it is announced in the app's one processing
  // language rather than flashed as a blank screen.
  if (phrasesQ === undefined || vocabQ === undefined || grammarQ === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <KatzuThinking size={64} labelAr="نُجهّز تدريب اليوم…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-4 pt-5" style={{ paddingBottom: 'calc(132px + env(safe-area-inset-bottom))' }}>
      <div className="mx-auto max-w-md">
        <header className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            aria-label="العودة إلى القصة"
            className="flex h-11 w-11 items-center justify-center rounded-control border border-white/10 bg-white/[0.04]"
          >
            <ArrowRight className="h-5 w-5 text-kz-inkDim" />
          </button>
          <div className="text-end">
            {/* V36: this screen had no heading of its own — the only heading in
                the file was an `<h3>` for a grammar title halfway down the page,
                so a screen reader could never name this screen. The line that
                already says what this is becomes the `<h1>`; same classes, same
                pixels, a name at last. Screen 2.6: the level lives HERE as a
                chip; the per-phrase floating level is gone. */}
            <h1 className="kz-ar-micro text-kz-inkFaint">
              تدريب موجّه · {practice.cards.length} عبارات
            </h1>
            <p className="kz-ar-caption text-kz-ink">{scene.locationAr}</p>
            <span
              data-testid="practice-level-chip"
              className="kz-ar-micro mt-1 inline-block rounded-full border border-kz-lavender/30 bg-kz-lavender/10 px-2.5 py-0.5 font-semibold text-kz-lavender"
            >
              {level}
            </span>
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
            <ul className={practice.cards.length === 0 ? 'hidden' : 'space-y-2.5'}>
              {practice.cards.map((card) => (
                <li key={card.id}>
                  <GlassCard tier="glass">
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
                      </div>
                    </div>
                  </GlassCard>
                </li>
              ))}
            </ul>

            {/* 2. Today's rule — INSIDE the deeper-practice accordion (Screen 2.1).
                   Everything the launch review named (grammar rule, quick
                   retrieval, listen-and-repeat) stays here with its logic and
                   its graders untouched; only the DEFAULT VISIBILITY changed.
                   One section open at a time (2.5): opening a section closes the
                   others, so no screen ever shows three inputs. */}
            {practice.grammar && (
              <GlassCard tier="glass" data-testid="grammar-card" className="mt-4">
                <AccordionHeader
                  labelAr="قاعدة اليوم"
                  level={practice.grammar.level}
                  open={openSection === 'grammar'}
                  onToggle={() => setOpenSection(openSection === 'grammar' ? null : 'grammar')}
                />
                {openSection === 'grammar' && (
                <div>
                <h2 className="kz-ar-body text-kz-ink">{practice.grammar.titleAr}</h2>
                <p className="kz-ar-caption mt-1.5 leading-relaxed text-kz-inkDim">{practice.grammar.ruleAr}</p>
                {practice.grammar.ruleDe && (
                  <GermanText className="kz-de-caption mt-1.5 block text-kz-inkFaint">
                    {practice.grammar.ruleDe}
                  </GermanText>
                )}

                <p className="kz-ar-caption mt-3 text-kz-ink">
                  اكتب بالألمانية ما تعنيه:{' '}
                  <span className="font-bold">{practice.grammar.exampleAr}</span>
                </p>
                {renderBank(grammarBank, (word) => {
                  track('word_bank_tapped', { skill: 'practice', kind: 'grammar' });
                  setGrammarAnswer((prev) => (prev ? `${prev} ${word}` : word));
                })}
                {/* V32: each box now says which question it answers. Two boxes
                    sharing "Schreibe hier auf Deutsch…" left the learner reading
                    upwards to work out where the answer went. */}
                <label className="kz-ar-micro mt-2 block text-kz-inkDim" htmlFor="grammar-answer">
                  إجابتك عن القاعدة بالألمانية
                </label>
                <input
                  id="grammar-answer"
                  type="text"
                  dir="ltr"
                  value={grammarAnswer}
                  onChange={(event) => setGrammarAnswer(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleCheckGrammar()}
                  placeholder="اكتب جملتك بالألمانية هنا…"
                  aria-label="اكتب جملة القاعدة بالألمانية"
                  className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 font-german text-sm text-kz-ink transition-colors placeholder:font-arabic placeholder:text-micro placeholder:text-kz-inkFaint focus:border-kz-lavender/50"
                />
                <div className="mt-3 flex items-center gap-2">
                  <GlassButton
                    variant={grammarOutcome?.tone === 'earned' ? 'earned' : 'secondary'}
                    onClick={handleCheckGrammar}
                    disabled={!grammarAnswer.trim()}
                    className="flex-1"
                  >
                    <Check className="h-4 w-4" />
                    تحقق
                  </GlassButton>
                  {grammarOutcome?.verdict !== 'correct' && (
                    <GlassButton
                      variant="quiet"
                      onClick={() =>
                        setGrammarOutcome({
                          verdict: 'wrong',
                          tone: 'neutral',
                          messageAr: `الجملة الصحيحة: ${practice.grammar!.exampleDe}`,
                        })
                      }
                    >
                      أرني الصحيحة
                    </GlassButton>
                  )}
                </div>
                {grammarOutcome && (
                  <>
                    <p
                      className={`kz-ar-caption mt-3 ${
                        grammarOutcome.tone === 'earned' ? 'kz-earned-text' : 'text-kz-inkDim'
                      }`}
                    >
                      {grammarOutcome.messageAr}
                    </p>
                    <GermanText className="kz-de-body mt-1 block text-kz-ink">
                      {practice.grammar.exampleDe}
                    </GermanText>
                    {practice.grammar.explanationAr && (
                      <p className="kz-ar-micro mt-2 leading-relaxed text-kz-inkFaint">
                        {practice.grammar.explanationAr}
                      </p>
                    )}
                  </>
                )}
                </div>
                )}
              </GlassCard>
            )}

            {/* 3. One retrieval (collapsed by default, same grading). */}
            {practice.retrieval && (
              <GlassCard tier="glass" data-testid="retrieval-card" className="mt-4">
                <AccordionHeader
                  labelAr="استرجاع سريع"
                  open={openSection === 'retrieval'}
                  onToggle={() => setOpenSection(openSection === 'retrieval' ? null : 'retrieval')}
                />
                {openSection === 'retrieval' && (
                <div>
                <p className="kz-ar-body text-kz-ink">
                  قل أو اكتب بالألمانية: <span className="font-bold">{practice.retrieval.promptAr}</span>
                </p>
                {renderBank(retrievalBank, (word) => {
                  track('word_bank_tapped', { skill: 'practice', kind: 'retrieval' });
                  setRetrievalAnswer((prev) => (prev ? `${prev} ${word}` : word));
                })}
                <label className="kz-ar-micro mt-2 block text-kz-inkDim" htmlFor="retrieval-answer">
                  جملتك بالألمانية
                </label>
                <input
                  id="retrieval-answer"
                  type="text"
                  dir="ltr"
                  value={retrievalAnswer}
                  onChange={(event) => setRetrievalAnswer(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleCheckRetrieval()}
                  placeholder="اكتب الجملة التي قالها Katzu…"
                  aria-label="اكتب الجملة بالألمانية"
                  className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 font-german text-sm text-kz-ink transition-colors placeholder:font-arabic placeholder:text-micro placeholder:text-kz-inkFaint focus:border-kz-lavender/50"
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
                </div>
                )}
              </GlassCard>
            )}

            {/* 4. One listening moment (collapsed by default, same grading). */}
            {practice.listening && (
              <GlassCard tier="glass" className="mt-4">
                <AccordionHeader
                  labelAr="استمع وكرّر"
                  open={openSection === 'listening'}
                  onToggle={() => setOpenSection(openSection === 'listening' ? null : 'listening')}
                />
                {openSection === 'listening' && (
                <div>
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
                  aria-label="اكتب ما سمعته بالألمانية"
                  value={heardText}
                  onChange={(event) => setHeardText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    const result = gradeRepeat(practice.listening!.de, heardText);
                    setRepeatTone(result.verdict === 'correct' ? 'earned' : 'neutral');
                    setRepeatMessage(result.messageAr);
                  }}
                  placeholder="اكتب ما سمعته…"
                  className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 font-german text-sm text-kz-ink transition-colors placeholder:font-arabic placeholder:text-micro placeholder:text-kz-inkFaint focus:border-kz-lavender/50"
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
                </div>
                )}
              </GlassCard>
            )}

            {/* Optional deeper work, kept quiet: it must not compete with `أنا جاهز`. */}
            {onDeepPractice && (
              <button
                type="button"
                onClick={handleOpenDeepPractice}
                className="kz-ar-caption mt-4 flex min-h-[44px] w-full items-center justify-center gap-1.5 text-kz-inkFaint transition-colors pointer-hover:text-kz-inkDim"
              >
                <Sparkles className="h-3.5 w-3.5" />
                تدريب أعمق على هذا المشهد (اختياري)
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}

        {/* Readiness (Screen 2.7): collapsed progress dots + the number — the
            card it used to be spent a whole panel saying what three dots say. */}
        <div className="mt-5 flex items-center justify-between" data-testid="readiness">
          <span className="kz-ar-micro text-kz-inkDim">جاهزيتك لهذا الموقف</span>
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1.5" aria-hidden>
              {Array.from({ length: totalSteps }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2 w-2 rounded-full ${i < handled ? 'bg-kz-lavender/90' : 'bg-white/[0.16]'}`}
                />
              ))}
            </span>
            <span className="kz-ar-micro text-kz-inkFaint">
              {handled} من {totalStepsAr}
            </span>
          </span>
        </div>
      </div>

      {/* The one action, docked above the safe area (Screen 2.2): solid blurred
          backdrop so content scrolls BENEATH it, safe-area padding, and enough
          reserved space below the content that no input is ever covered. */}
      <FloatingControl className="fixed bottom-0 start-0 end-0 z-20 mx-auto max-w-md rounded-t-sheet border-t border-white/[0.06] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <PrimaryAction
          hintAr="بعدها تبدأ المحادثة الحقيقية — بالصوت أو بالكتابة."
          onClick={handleReady}
          disabled={isSaving}
        >
          أنا جاهز
        </PrimaryAction>
        {/* The reassurance sits directly under the CTA now, instead of at the
            bottom of the page where it read as fine print about nothing. */}
        <p className="kz-ar-micro mt-2 text-center text-kz-inkFaint">
          هذا ليس تقييماً — إنه تمرين.
        </p>
      </FloatingControl>
    </div>
  );
};

export default GuidedPracticeScreen;

/**
 * One accordion header for the deeper-practice group (launch polish, Screen
 * 2.1): a 44px chevron row, the section name, and the rule's level chip kept
 * with the section it belongs to. Rendering the BODY is the caller's job —
 * the header is the only new shape.
 */
function AccordionHeader({
  labelAr,
  open,
  onToggle,
  level,
}: {
  labelAr: string;
  open: boolean;
  onToggle: () => void;
  level?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex min-h-[44px] w-full items-center justify-between gap-2 text-start"
    >
      <span className="flex items-center gap-2">
        <span className="kz-ar-micro text-kz-inkDim">{labelAr}</span>
        {level && <span className="font-german text-micro text-kz-inkFaint">{level}</span>}
      </span>
      <ChevronLeft
        aria-hidden
        className={`h-4 w-4 text-kz-inkFaint transition-transform ${open ? '-rotate-90' : ''}`}
      />
    </button>
  );
}
