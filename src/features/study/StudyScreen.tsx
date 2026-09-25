import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { enrolStudiedVocabulary } from '@/lib/srs/store';
import { scenarioToVocabTopic } from '@/lib/utils/scenarioVocab';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { GermanText } from '@/components/common/GermanText';
import { AudioWaveform } from '@/components/common/AudioWaveform';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ArrowRight, Volume2, Bookmark, Check } from 'lucide-react';
import type { VocabularyEntity, GrammarEntity, StarterPhraseEntity } from '@/types/models';

export interface StudyScreenProps {
  scenarioId: string;
  onBack: () => void;
  onProceedToQuiz: () => void;
}

export const StudyScreen: React.FC<StudyScreenProps> = ({
  scenarioId,
  onBack,
  onProceedToQuiz,
}) => {
  const [activeTab, setActiveTab] = useState<'phrases' | 'vocab' | 'grammar'>('phrases');
  const [speed, setSpeed] = useState<number>(1.0);
  const [playingText, setPlayingText] = useState<string | null>(null);

  const scenario = useLiveQuery(() => db.scenarios.get(scenarioId));
  const phrasesQ = useLiveQuery(() => db.starter_phrases.where('scenario_id').equals(scenarioId).toArray());
  const phrases = phrasesQ || [];
  // Vocabulary lives in the D1 *topic* namespace (food, documents, health,
  // housing, work) — scenarios map there via their CMS category (scenarioVocab).
  const vocabTopic = scenarioToVocabTopic(scenario);
  const vocabQ = useLiveQuery(
    () => (vocabTopic ? db.vocabulary.where('topic').equals(vocabTopic).toArray() : Promise.resolve<VocabularyEntity[]>([])),
    [vocabTopic]
  );
  const vocabulary = vocabQ || [];
  const grammar = useLiveQuery(() => db.grammar.toArray()) || [];
  const savedWords = useLiveQuery(() => db.saved_words.toArray()) || [];

  // Open on the fullest tab: if this scenario ships no starter phrases but has
  // vocabulary, start the learner on words instead of an empty screen.
  useEffect(() => {
    if (phrasesQ !== undefined && phrasesQ.length === 0 && (vocabQ?.length ?? 0) > 0) {
      setActiveTab('vocab');
    }
  }, [phrasesQ, vocabQ]);

  const { speak, isPlaying } = useSpeechOutput({
    speed,
    onEnd: () => setPlayingText(null),
  });

  const handlePlay = (text: string) => {
    setPlayingText(text);
    speak(text);
  };

  const toggleSaveWord = async (wordId: number) => {
    const exists = savedWords.some((w) => w.wordId === wordId);
    if (exists) {
      await db.saved_words.delete(wordId);
    } else {
      await db.saved_words.put({ wordId, savedAt: Date.now() });
    }
  };

  const markStudiedAndProceed = async () => {
    await db.scenario_training.put({
      scenarioId,
      userId: 'current_user',
      studiedAt: Date.now(),
      quizAttempted: false,
      lastScore: 0,
      effectiveLevel: 'A1',
      updatedAt: Date.now(),
    });
    // What was studied today becomes what gets reviewed later: this enrolment is
    // what turns a flashcard deck into memory.
    await enrolStudiedVocabulary(vocabulary);
    onProceedToQuiz();
  };

  return (
    <div className="min-h-screen bg-black text-text-primary p-6 max-w-md mx-auto relative pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="p-2.5 rounded-2xl bg-surface-card border border-border-subtle hover:bg-surface-subtle transition-colors"
        >
          <ArrowRight className="w-5 h-5 text-text-secondary" />
        </button>

        {/* Speed Toggle (1.0x / 0.8x) */}
        <button
          onClick={() => setSpeed((s) => (s === 1.0 ? 0.8 : 1.0))}
          className="px-3 py-1.5 rounded-xl bg-surface-card border border-border-subtle text-xs font-german font-bold text-text-secondary hover:text-primary transition-colors"
        >
          سرعة الصوت: {speed === 1.0 ? '1.0x عادية' : '0.8x هادئة'}
        </button>
      </div>

      <h2 className="text-xl font-bold font-arabic mb-1">جلسة الدراسة التمهيدية</h2>
      <p className="text-xs text-text-secondary font-arabic mb-4">
        {scenario?.title_ar} — استمع وكرر العبارات لتجهيز لسانك للمحادثة
      </p>

      {/* Tabs */}
      <div className="flex bg-surface-card border border-border-subtle rounded-2xl p-1 mb-6">
        <button
          onClick={() => setActiveTab('phrases')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'phrases' ? 'bg-primary text-white shadow-glow-purple' : 'text-text-secondary'
          }`}
        >
          العبارات ({phrases.length})
        </button>
        <button
          onClick={() => setActiveTab('vocab')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'vocab' ? 'bg-primary text-white shadow-glow-purple' : 'text-text-secondary'
          }`}
        >
          المفردات ({vocabulary.length})
        </button>
        <button
          onClick={() => setActiveTab('grammar')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'grammar' ? 'bg-primary text-white shadow-glow-purple' : 'text-text-secondary'
          }`}
        >
          القواعد
        </button>
      </div>

      {/* Content List */}
      <div className="space-y-3 mb-8">
        {activeTab === 'phrases' && phrases.length === 0 && (
          <div className="p-6 rounded-3xl bg-surface-card border border-border-subtle text-center">
            <p className="text-xs font-arabic text-text-secondary">
              لم تُضف عبارات لهذا السيناريو بعد — جرّب تبويب المفردات.
            </p>
          </div>
        )}
        {activeTab === 'phrases' &&
          phrases.map((p: StarterPhraseEntity) => (
            <div
              key={p.id}
              className="p-4 rounded-3xl bg-surface-card border border-border-subtle flex items-center justify-between"
            >
              <div className="flex-1 pe-3">
                <GermanText className="text-sm font-bold text-text-primary block mb-1">
                  {p.german}
                </GermanText>
                <div className="text-xs text-text-secondary font-arabic">{p.translation_ar}</div>
              </div>
              <button
                onClick={() => handlePlay(p.german)}
                className="w-10 h-10 rounded-full bg-primary/20 text-primary hover:bg-primary/30 flex items-center justify-center flex-shrink-0"
              >
                {playingText === p.german && isPlaying ? (
                  <AudioWaveform isPlaying={true} />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
            </div>
          ))}

        {activeTab === 'vocab' && vocabulary.length === 0 && (
          <div className="p-6 rounded-3xl bg-surface-card border border-border-subtle text-center">
            <p className="text-xs font-arabic text-text-secondary">
              {vocabQ === undefined
                ? 'جاري تحميل المفردات...'
                : 'لم يتم ربط مفردات هذا السيناريو بعد — سيتم إضافتها قريباً.'}
            </p>
          </div>
        )}
        {activeTab === 'vocab' &&
          vocabulary.map((v: VocabularyEntity) => {
            const isSaved = savedWords.some((sw) => sw.wordId === v.id);
            return (
              <div
                key={v.id}
                className="p-4 rounded-3xl bg-surface-card border border-border-subtle flex items-center justify-between"
              >
                <div className="flex-1 pe-3">
                  <div className="flex items-center gap-2 mb-1">
                    {v.article && (
                      <Badge
                        variant={
                          v.article === 'der'
                            ? 'der'
                            : v.article === 'die'
                            ? 'die'
                            : 'das'
                        }
                        size="sm"
                      >
                        {v.article}
                      </Badge>
                    )}
                    <GermanText className="text-base font-bold text-text-primary">
                      {v.german}
                    </GermanText>
                  </div>
                  <div className="text-xs text-text-secondary font-arabic mb-1">{v.translation_ar}</div>
                  <GermanText className="text-[11px] text-text-muted italic block">
                    {v.example_de}
                  </GermanText>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => toggleSaveWord(v.id)}
                    className={`p-2 rounded-full border transition-colors ${
                      isSaved
                        ? 'bg-status-learning/20 border-status-learning/40 text-status-learning'
                        : 'bg-surface-subtle border-border-subtle text-text-muted hover:text-text-primary'
                    }`}
                  >
                    <Bookmark className="w-4 h-4 fill-current" />
                  </button>
                  <button
                    onClick={() => handlePlay(`${v.article || ''} ${v.german}`)}
                    className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}

        {activeTab === 'grammar' &&
          grammar.map((g: GrammarEntity) => (
            <div key={g.id} className="p-4 rounded-3xl bg-surface-card border border-border-subtle space-y-2">
              <Badge variant="primary" size="sm">
                قاعدة نحوية
              </Badge>
              <h4 className="text-sm font-bold font-arabic text-text-primary">{g.title_ar}</h4>
              <p className="text-xs text-text-secondary font-arabic leading-relaxed">{g.explanation_ar}</p>
              <div className="p-2.5 rounded-2xl bg-surface-subtle border border-border-subtle text-xs">
                <GermanText className="font-bold text-primary block mb-0.5">{g.example_de}</GermanText>
                <span className="text-text-muted font-arabic">{g.example_ar}</span>
              </div>
            </div>
          ))}
      </div>

      {/* Floating Bottom CTA */}
      <div className="fixed bottom-0 start-0 end-0 p-4 bg-gradient-to-t from-black via-black to-transparent max-w-md mx-auto z-20">
        <Button size="lg" className="w-full" onClick={markStudiedAndProceed}>
          انتقل للاختبار السريع (كويز)
          <ArrowRight className="w-5 h-5 ms-2 rotate-180" />
        </Button>
      </div>
    </div>
  );
};
