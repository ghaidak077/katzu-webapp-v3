import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { enrolMistake, enrolSavedWord, gradeReviewItem } from '@/lib/srs/store';
import { gradeCorrectionRetype, reviewRefId } from '@/lib/srs/engine';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { GermanText } from '@/components/common/GermanText';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { triggerHaptic } from '@/lib/utils/haptics';
import {
  BookOpen,
  Volume2,
  Bookmark,
  Search,
  Sparkles,
  RotateCcw,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Headphones,
  ArrowLeft,
  Target,
  PenLine,
} from 'lucide-react';
import type { VocabularyEntity, GrammarEntity, MistakeEntity } from '@/types/models';

export interface PracticeScreenProps {
  onOpenListening?: () => void;
  onOpenWriting?: () => void;
  onOpenCoach?: () => void;
  onOpenAsk?: () => void;
}

export const PracticeScreen: React.FC<PracticeScreenProps> = ({ onOpenListening, onOpenWriting, onOpenCoach, onOpenAsk }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Modals
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [showGrammarModal, setShowGrammarModal] = useState(false);
  const [showMistakesModal, setShowMistakesModal] = useState(false);

  // Flashcards state
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Mistake practice drill state (Rule 9)
  const [retypedMistakes, setRetypedMistakes] = useState<Record<number, string>>({});
  // "Answered correctly just now" — not "mastered". Mastery is the review store's
  // three consecutive good recalls (MASTERED_REPS); keeping one definition of the
  // word is why this set exists instead of a mastered one.
  const [correctMistakeIds, setCorrectMistakeIds] = useState<Set<number>>(new Set());

  const vocabulary = useLiveQuery(() => db.vocabulary.toArray()) || [];
  const savedWords = useLiveQuery(() => db.saved_words.toArray()) || [];
  const mistakes = useLiveQuery(() => db.mistakes.toArray()) || [];
  const grammarList = useLiveQuery(() => db.grammar.toArray()) || [];

  const { speak } = useSpeechOutput();

  const filteredVocab = vocabulary.filter((v) => {
    const matchesSearch =
      v.german.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.translation_ar.includes(searchQuery);
    if (selectedCategory === 'SAVED') {
      return matchesSearch && savedWords.some((sw) => sw.wordId === v.id);
    }
    return matchesSearch;
  });

  const toggleSaveWord = async (wordId: number) => {
    const exists = savedWords.some((sw) => sw.wordId === wordId);
    if (exists) {
      await db.saved_words.delete(wordId);
    } else {
      await db.saved_words.put({ wordId, savedAt: Date.now() });
      // Bookmarking is an explicit "I want to know this" — schedule it rather
      // than leaving it in a list the learner has to remember to open.
      await enrolSavedWord(wordId);
    }
  };

  /**
   * The mistake drill: retype the correction. Two defects lived here. The matcher
   * compared the strings exactly, so a correct full sentence written around the
   * corrected fragment was rejected (the same false negative the session debrief
   * had). And a single correct retype wrote `isMastered`, while the review engine
   * defines mastery as three consecutive good recalls (`MASTERED_REPS`) — two
   * definitions of one word, and this one was the wrong one.
   *
   * The retype now grades through the review store exactly as the debrief does:
   * `gradeCorrectionRetype` accepts the fragment inside a real sentence, and
   * `gradeReviewItem` owns `isMastered`, writing it to the mistake row only when
   * the item reaches `MASTERED_REPS`. The row is a live query, so it flips
   * reactively once the third good recall lands.
   */
  const handleValidateMistakeRetype = async (mistake: MistakeEntity & { id: number }) => {
    const answer = retypedMistakes[mistake.id] || '';
    if (gradeCorrectionRetype(mistake.corrected, answer) !== 'correct') {
      triggerHaptic('error');
      return;
    }

    triggerHaptic('success');
    setCorrectMistakeIds((prev) => new Set(prev).add(mistake.id));

    try {
      const reviewItem = await db.review_items
        .where('[kind+refId]')
        .equals(['mistake', reviewRefId('mistake', mistake.id)])
        .first();
      if (reviewItem) await gradeReviewItem(reviewItem, 'good');
      // Older mistakes predate the review queue; enrolling is idempotent.
      else await enrolMistake(mistake);
    } catch (err) {
      console.warn('Could not record the retyped correction:', err);
    }
  };

  const currentFlashcard = vocabulary[flashcardIndex];

  return (
    <div className="min-h-screen bg-black text-text-primary p-4 max-w-md mx-auto relative pb-28">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold font-arabic">مركز التدريب والمراجعة</h2>
          <p className="text-xs text-text-secondary">ثبّت حصيلتك اللغوية وراجع أخطاءك السابقة</p>
        </div>
        <KatzuMascot name="practice" className="w-12 h-12 object-contain" />
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <Card className="p-3 text-center">
          <span className="text-micro text-text-secondary block">إجمالي المفردات</span>
          <div className="text-lg font-bold font-german text-primary">{vocabulary.length}</div>
        </Card>
        <Card className="p-3 text-center">
          <span className="text-micro text-text-secondary block">المحفوظة</span>
          <div className="text-lg font-bold font-german text-status-learning">{savedWords.length}</div>
        </Card>
        <Card className="p-3 text-center">
          <span className="text-micro text-text-secondary block">بنك الأخطاء</span>
          <div className="text-lg font-bold font-german text-status-error">{mistakes.length}</div>
        </Card>
      </div>

      {/* The coach comes first: knowing which pattern to fix is worth more than
          any single drill, and this bank is where the evidence already lives. */}
      <button
        onClick={() => {
          triggerHaptic('light');
          onOpenCoach?.();
        }}
        className="w-full mb-4 p-4 rounded-2xl bg-surface-card border border-border-subtle hover:border-primary/40 flex items-center gap-3 text-start transition-all"
      >
        <div className="w-10 h-10 shrink-0 rounded-full bg-status-error/20 text-status-error flex items-center justify-center">
          <Target className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold font-arabic block">ملف أخطائك</span>
          <span className="text-micro text-text-secondary font-arabic">
            {mistakes.length > 0
              ? `اعرف نمط أخطائك في ${mistakes.length} تصحيحاً سابقاً، وتدرّب على الأكثر تكراراً`
              : 'ابدأ بالحديث وسأجمع أخطاءك هنا وأخبرك بما يتكرر'}
          </span>
        </div>
        <ArrowLeft className="w-4 h-4 text-text-muted shrink-0" />
      </button>

      {/* Ask Katzu (V28 Stage 2A): a free-text tutor for anything German the learner
          is stuck on — translation, grammar, a word, a sentence, official German —
          followed by a short check. It sits beside the mistake bank because both
          turn "I don't understand" into something the learner owns. */}
      {onOpenAsk && (
        <button
          onClick={() => {
            triggerHaptic('light');
            onOpenAsk();
          }}
          className="w-full mb-4 p-4 rounded-2xl bg-surface-card border border-border-subtle hover:border-primary/40 flex items-center gap-3 text-start transition-all"
        >
          <div className="w-10 h-10 shrink-0 rounded-full bg-primary/20 text-primary flex items-center justify-center">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-bold font-arabic block">اسأل كَاتْزُو عن الألمانية</span>
            <span className="text-micro text-text-secondary font-arabic">
              ترجمة، قاعدة، كلمة، صحّح جملتك، أو نصّ ألماني رسمي — ثم تمرين قصير يتأكد أنك فهمت
            </span>
          </div>
          <ArrowLeft className="w-4 h-4 text-text-muted shrink-0" />
        </button>
      )}

      {/* Quick Action Hub */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        <button
          onClick={() => {
            setFlashcardIndex(0);
            setIsFlipped(false);
            setShowFlashcards(true);
          }}
          className="p-3 rounded-2xl bg-surface-card border border-border-subtle hover:border-primary/40 flex flex-col items-center gap-1.5 transition-all"
        >
          <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold font-arabic">فلاش كاردز</span>
        </button>

        <button
          onClick={() => setShowGrammarModal(true)}
          className="p-3 rounded-2xl bg-surface-card border border-border-subtle hover:border-primary/40 flex flex-col items-center gap-1.5 transition-all"
        >
          <div className="w-8 h-8 rounded-full bg-status-learning/20 text-status-learning flex items-center justify-center">
            <BookOpen className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold font-arabic">ملخص القواعد</span>
        </button>

        <button
          onClick={() => setShowMistakesModal(true)}
          className="p-3 rounded-2xl bg-surface-card border border-border-subtle hover:border-primary/40 flex flex-col items-center gap-1.5 transition-all"
        >
          <div className="w-8 h-8 rounded-full bg-status-error/20 text-status-error flex items-center justify-center">
            <AlertCircle className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold font-arabic">بنك الأخطاء</span>
        </button>

        <button
          onClick={onOpenListening}
          className="p-3 rounded-2xl bg-surface-card border border-border-subtle hover:border-primary/40 flex flex-col items-center gap-1.5 transition-all"
        >
          <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center">
            <Headphones className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold font-arabic">الاستماع</span>
        </button>

        {onOpenWriting && (
          <button
            onClick={onOpenWriting}
            className="p-3 rounded-2xl bg-surface-card border border-border-subtle hover:border-primary/40 flex flex-col items-center gap-1.5 transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-status-learning/20 text-status-learning flex items-center justify-center">
              <PenLine className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold font-arabic">الكتابة</span>
          </button>
        )}
      </div>

      {/* Search & Category Filter */}
      <div className="space-y-3 mb-6">
        <div className="relative">
          <Search className="w-4 h-4 text-text-muted absolute start-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ابحث عن كلمة ألمانية أو معناها بالعربية..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 bg-surface-card border border-border-subtle focus:border-primary rounded-2xl ps-10 pe-4 text-xs font-arabic"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              selectedCategory === 'ALL'
                ? 'bg-fill text-on-fill shadow-glow-purple'
                : 'bg-surface-card text-text-secondary border border-border-subtle'
            }`}
          >
            الكل ({vocabulary.length})
          </button>
          <button
            onClick={() => setSelectedCategory('SAVED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              selectedCategory === 'SAVED'
                ? 'bg-status-learning text-black font-bold'
                : 'bg-surface-card text-text-secondary border border-border-subtle'
            }`}
          >
            المحفوظة ({savedWords.length})
          </button>
        </div>
      </div>

      {/* Vocabulary List */}
      <div className="space-y-2.5">
        {/* An empty result is the commonest dead end on this screen: a search
            that matches nothing, or a saved list on a learner who has not saved
            anything yet. Name the state and offer the way out of it. */}
        {filteredVocab.length === 0 && (
          <div className="rounded-2xl border border-border-subtle bg-surface-card p-6 text-center">
            <p className="text-sm font-arabic text-text-secondary">
              {searchQuery
                ? `لا توجد كلمة تطابق «${searchQuery}». جرّب كلمة ألمانية أخرى أو امسح البحث.`
                : selectedCategory === 'SAVED'
                  ? 'لم تحفظ أي كلمة بعد. اضغط أيقونة الحفظ في أي كلمة وستبقى هنا لوحدك.'
                  : 'لم يصل بعد أي محتوى إلى هذا الجهاز. افتح مشهداً أو تحقق من اتصالك، ثم ستظهر مفرداته هنا.'}
            </p>
            <Button
              variant="secondary"
              size="md"
              className="mt-3"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('ALL');
              }}
            >
              {searchQuery || selectedCategory === 'SAVED' ? 'اعرض كل الكلمات' : 'أعد المحاولة'}
            </Button>
          </div>
        )}
        {filteredVocab.map((v) => {
          const isSaved = savedWords.some((sw) => sw.wordId === v.id);
          return (
            <div
              key={v.id}
              className="p-3.5 rounded-2xl bg-surface-card border border-border-subtle flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  {v.article && (
                    <Badge
                      variant={
                        v.article === 'der' ? 'der' : v.article === 'die' ? 'die' : 'das'
                      }
                      size="sm"
                    >
                      {v.article}
                    </Badge>
                  )}
                  <GermanText className="text-sm font-bold text-text-primary">
                    {v.german}
                  </GermanText>
                </div>
                <div className="text-xs text-text-secondary font-arabic">{v.translation_ar}</div>
              </div>

              <div className="flex items-center gap-1.5">
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
                  onClick={() => speak(`${v.article || ''} ${v.german}`)}
                  className="p-2 rounded-full bg-primary/20 text-primary hover:bg-primary/30"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Flashcards Modal */}
      <Modal
        isOpen={showFlashcards}
        onClose={() => setShowFlashcards(false)}
        title="تدريب البطاقات التفاعلية (Flashcards)"
      >
        {currentFlashcard ? (
          <div className="space-y-6 py-2">
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className="h-60 rounded-3xl bg-surface-hero border border-primary/40 shadow-glow-purple p-6 flex flex-col items-center justify-center text-center cursor-pointer select-none transition-all transform hover:scale-[1.02]"
            >
              {!isFlipped ? (
                <>
                  <span className="text-micro text-primary font-bold mb-3 font-arabic">
                    الوجه الألماني (اضغط للقلب)
                  </span>
                  {currentFlashcard.article && (
                    <Badge variant="primary" size="md" className="mb-2">
                      {currentFlashcard.article}
                    </Badge>
                  )}
                  <GermanText className="text-2xl font-bold text-text-primary">
                    {currentFlashcard.german}
                  </GermanText>
                  <span className="text-xs text-text-muted mt-3">اضغط لكشف المعنى بالعربية 👆</span>
                </>
              ) : (
                <>
                  <span className="text-micro text-status-success font-bold mb-3 font-arabic">
                    المعنى العربي
                  </span>
                  <div className="text-2xl font-bold font-arabic text-text-primary mb-2">
                    {currentFlashcard.translation_ar}
                  </div>
                  <GermanText className="text-xs text-text-secondary italic">
                    {currentFlashcard.example_de}
                  </GermanText>
                </>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>البطاقة {flashcardIndex + 1} من {vocabulary.length}</span>
              <button
                onClick={() => speak(currentFlashcard.german)}
                className="flex items-center gap-1 text-primary hover:underline font-arabic"
              >
                <Volume2 className="w-4 h-4" /> استمع للنطق
              </button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setIsFlipped(false);
                  setFlashcardIndex((i) => (i + 1) % vocabulary.length);
                }}
              >
                أحتاج مراجعتها 🔁
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setIsFlipped(false);
                  setFlashcardIndex((i) => (i + 1) % vocabulary.length);
                }}
              >
                أعرفها تماماً ✓
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm font-arabic text-text-secondary">
              لا توجد بطاقات بعد. بطاقاتك تُبنى تلقائياً من الكلمات التي تحفظها أثناء المشاهد،
              فاحفظ ما تريد تثبيته وستجده هنا.
            </p>
            <Button variant="secondary" size="md" onClick={() => setShowFlashcards(false)}>
              تصفّح المفردات
            </Button>
          </div>
        )}
      </Modal>

      {/* Grammar Sheet Modal */}
      <Modal
        isOpen={showGrammarModal}
        onClose={() => setShowGrammarModal(false)}
        title="ملخص قواعد كَاتْزُو السريعة"
      >
        <div className="space-y-4 py-2">
          {grammarList.map((g: GrammarEntity) => (
            <div key={g.id} className="p-4 rounded-2xl bg-surface-card border border-border-subtle space-y-1.5">
              <h4 className="text-sm font-bold font-arabic text-primary">{g.title_ar}</h4>
              <p className="text-xs text-text-secondary leading-relaxed">{g.explanation_ar}</p>
              <div className="p-2 rounded-xl bg-surface-subtle text-xs">
                <GermanText className="font-bold text-text-primary block">{g.example_de}</GermanText>
                <span className="text-text-muted">{g.example_ar}</span>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Mistakes Bank Modal (Rule 9: Interactive Mistake Practice) */}
      <Modal
        isOpen={showMistakesModal}
        onClose={() => setShowMistakesModal(false)}
        title="بنك أخطائك والتدريب التفاعلي"
      >
        <div className="space-y-3 py-2">
          {mistakes.length === 0 ? (
            <div className="space-y-3 py-8 text-center">
              <p className="text-sm font-arabic text-text-muted">
                بنك أخطائك فارغ الآن. كل خطأ يرصده كاتزو خلال مشهد يُسجَّل هنا، لتعيد كتابته
                حتى يصبح صحيحاً من أول محاولة.
              </p>
              <Button variant="secondary" size="md" onClick={() => setShowMistakesModal(false)}>
                العودة إلى التدريب
              </Button>
            </div>
          ) : (
            mistakes.map((m: MistakeEntity) => {
              const mId = m.id || 0;
              const isMastered = !!m.isMastered;
              const isCorrect = correctMistakeIds.has(mId);

              return (
                <div
                  key={m.id}
                  className={`p-3.5 rounded-2xl border transition-all space-y-2 ${
                    isMastered
                      ? 'bg-status-success/15 border-status-success/40'
                      : 'bg-surface-card border-border-subtle'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-status-error line-through">
                      <GermanText>{m.original}</GermanText>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => speak(m.corrected)}
                        className="p-1 rounded-lg bg-surface-subtle hover:bg-primary/20 text-primary transition-colors"
                        title="استمع للنطق الصحيح"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-status-success font-bold">
                        <GermanText>{m.corrected}</GermanText>
                      </span>
                    </div>
                  </div>

                  <p className="text-micro text-text-secondary font-arabic">{m.grammarRule}</p>

                  {isMastered ? (
                    <div className="flex items-center gap-1.5 text-status-success text-xs font-bold font-arabic pt-1 border-t border-border-subtle/40">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      تم إتقان الصواب بنجاح ✓
                    </div>
                  ) : isCorrect ? (
                    <div className="flex items-center gap-1.5 text-status-success text-xs font-arabic pt-1 border-t border-border-subtle/40">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      صحيحة. ستعود هذه الجملة في مراجعتك المجدولة حتى تُتقنها.
                    </div>
                  ) : (
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="أعد كتابة الصواب للتثبيت..."
                        value={retypedMistakes[mId] || ''}
                        onChange={(e) =>
                          setRetypedMistakes({ ...retypedMistakes, [mId]: e.target.value })
                        }
                        className="flex-1 h-9 bg-surface-subtle border border-border-subtle focus:border-primary rounded-xl px-2.5 text-xs font-german"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleValidateMistakeRetype({ ...m, id: mId })}
                        disabled={!(retypedMistakes[mId] || '').trim()}
                      >
                        تثبيت
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Modal>
    </div>
  );
};
