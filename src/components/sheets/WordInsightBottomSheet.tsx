import React, { useState } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { GermanText } from '../common/GermanText';
import { Badge } from '../ui/Badge';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { Volume2, Bookmark, Check } from 'lucide-react';
import type { VocabularyEntity } from '@/types/models';
import { normalizedPartOfSpeech } from '@/lib/utils/scenarioVocab';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { translate, type UiStringKey } from '@/lib/i18n/strings';
import type { UiLanguage } from '@/lib/i18n/languages';

/**
 * The card speaks Arabic; the data stores German/Latin parts of speech. Before
 * this map the card printed «Verb» next to «نوع الكلمة» (or «—» when the word
 * was unknown), which read as a bug in the Arabic UI.
 */
const POS_KEY: Record<string, UiStringKey> = {
  noun: 'sheet.word.pos.noun',
  verb: 'sheet.word.pos.verb',
  adjective: 'sheet.word.pos.adjective',
  adverb: 'sheet.word.pos.adverb',
  pronoun: 'sheet.word.pos.pronoun',
  article: 'sheet.word.pos.article',
  preposition: 'sheet.word.pos.preposition',
  conjunction: 'sheet.word.pos.conjunction',
  numeral: 'sheet.word.pos.numeral',
  interjection: 'sheet.word.pos.interjection',
  particle: 'sheet.word.pos.particle',
  'proper noun': 'sheet.word.pos.properNoun',
  phrase: 'sheet.word.pos.phrase',
};

const posLabel = (raw: string | null | undefined, language: UiLanguage): string => {
  const key = POS_KEY[String(raw || '').trim().toLowerCase()];
  return key ? translate(language, key) : normalizedPartOfSpeech(raw);
};

export interface WordInsightBottomSheetProps {
  word: VocabularyEntity | null;
  isOpen: boolean;
  onClose: () => void;
  isSaved: boolean;
  onToggleSave: (wordId: number) => void;
  /**
   * The word is outside the shipped content. The card then shows an honest retry
   * state — never the old «هذه الكلمة ليست في محتوى مشهدك بعد» dead end.
   */
  unresolved?: boolean;
  onRetry?: () => void;
}

export const WordInsightBottomSheet: React.FC<WordInsightBottomSheetProps> = ({
  word,
  isOpen,
  onClose,
  isSaved,
  onToggleSave,
  unresolved = false,
  onRetry,
}) => {
  const { t, uiLanguage } = useLanguage();
  const { speak } = useSpeechOutput();

  if (!word) return null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={t('sheet.word.title')}>
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
              {unresolved
                ? t('sheet.word.unresolved')
                : word.translation_ar}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleSave(word.id)}
              className={`p-3 rounded-full border transition-colors ${
                isSaved
                  ? 'bg-status-learning/20 border-status-learning/40 text-status-learning'
                  : 'bg-surface-subtle border-border-subtle text-text-secondary pointer-hover:text-text-primary'
              }`}
            >
              <Bookmark className="w-5 h-5 fill-current" />
            </button>
            <button
              onClick={() => speak(`${word.article || ''} ${word.german}`)}
              className="p-3 rounded-full bg-primary/20 text-primary pointer-hover:bg-primary/30 transition-colors"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {unresolved && (
          <div className="p-4 rounded-3xl bg-surface-card border border-border-subtle space-y-2">
            <p className="text-xs font-arabic text-text-secondary leading-relaxed">
              {t('sheet.word.retryHint')}
            </p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="w-full py-2 rounded-2xl bg-primary/20 text-primary font-arabic text-sm font-bold pointer-hover:bg-primary/30 transition-colors"
              >
                {t('sheet.word.retry')}
              </button>
            )}
          </div>
        )}

        {/* Example Sentence */}
        {word.example_de && (
          <div className="p-4 rounded-3xl bg-surface-subtle border border-border-subtle space-y-1.5">
            <span className="text-micro font-bold text-primary block font-arabic">
              {t('sheet.word.example')}
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
            <span className="text-text-muted block mb-0.5">{t('sheet.word.pos')}</span>
            <span className="font-semibold text-text-primary">
              {unresolved
                ? t('sheet.word.unknown')
                : posLabel(word.part_of_speech, uiLanguage) || t('sheet.word.defaultPos')}
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-surface-card border border-border-subtle">
            <span className="text-text-muted block mb-0.5">{t('sheet.word.level')}</span>
            <span className="font-semibold font-german text-primary">{word.level}</span>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
};
