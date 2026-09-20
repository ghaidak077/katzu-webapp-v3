import React, { useState } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { GermanText } from '../common/GermanText';
import { Badge } from '../ui/Badge';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { Volume2, Bookmark, Check } from 'lucide-react';
import type { VocabularyEntity } from '@/types/models';

export interface WordInsightBottomSheetProps {
  word: VocabularyEntity | null;
  isOpen: boolean;
  onClose: () => void;
  isSaved: boolean;
  onToggleSave: (wordId: number) => void;
}

export const WordInsightBottomSheet: React.FC<WordInsightBottomSheetProps> = ({
  word,
  isOpen,
  onClose,
  isSaved,
  onToggleSave,
}) => {
  const { speak } = useSpeechOutput();

  if (!word) return null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="تفاصيل الكلمة">
      <div className="space-y-4 py-2">
        {/* Word Header */}
        <div className="flex items-center justify-between p-4 rounded-3xl bg-surface-card border border-border-subtle">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {word.article && (
                <Badge
                  variant={
                    word.article === 'der'
                      ? 'der'
                      : word.article === 'die'
                      ? 'die'
                      : 'das'
                  }
                  size="md"
                >
                  {word.article}
                </Badge>
              )}
              <GermanText className="text-xl font-bold text-text-primary">
                {word.german}
              </GermanText>
            </div>
            <div className="text-sm font-arabic font-semibold text-text-secondary">
              {word.translation_ar}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleSave(word.id)}
              className={`p-3 rounded-full border transition-all ${
                isSaved
                  ? 'bg-status-learning/20 border-status-learning/40 text-status-learning'
                  : 'bg-surface-subtle border-border-subtle text-text-secondary hover:text-text-primary'
              }`}
            >
              <Bookmark className="w-5 h-5 fill-current" />
            </button>
            <button
              onClick={() => speak(`${word.article || ''} ${word.german}`)}
              className="p-3 rounded-full bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Example Sentence */}
        {word.example_de && (
          <div className="p-4 rounded-3xl bg-surface-subtle border border-border-subtle space-y-1.5">
            <span className="text-[11px] font-bold text-primary block font-arabic">
              مثال عملي في جملة:
            </span>
            <GermanText className="text-sm font-semibold text-text-primary block">
              {word.example_de}
            </GermanText>
            <div className="text-xs text-text-secondary font-arabic">{word.example_ar}</div>
          </div>
        )}

        {/* Word Type / Level Info */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-3 rounded-2xl bg-surface-card border border-border-subtle">
            <span className="text-text-muted block mb-0.5">نوع الكلمة</span>
            <span className="font-semibold text-text-primary">{word.part_of_speech || 'اسم'}</span>
          </div>
          <div className="p-3 rounded-2xl bg-surface-card border border-border-subtle">
            <span className="text-text-muted block mb-0.5">المستوى</span>
            <span className="font-semibold font-german text-primary">{word.level}</span>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
};
