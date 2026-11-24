import React, { useState } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Clock, Calendar, Sparkles } from 'lucide-react';
import type { CEFRLevel } from '@/types/models';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

export interface GoalSelectionBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (goalMinutes: number, goalDays: number, level: CEFRLevel) => void;
  initialMinutes?: number;
  initialDays?: number;
  initialLevel?: CEFRLevel;
}

export const GoalSelectionBottomSheet: React.FC<GoalSelectionBottomSheetProps> = ({
  isOpen,
  onClose,
  onSave,
  initialMinutes = 15,
  initialDays = 5,
  initialLevel = 'A1',
}) => {
  const { t } = useLanguage();
  const [minutes, setMinutes] = useState(initialMinutes);
  const [days, setDays] = useState(initialDays);
  const [level, setLevel] = useState<CEFRLevel>(initialLevel);

  const timeOptions = [
    { label: t('sheet.goal.light'), value: 5 },
    { label: t('sheet.goal.regular'), value: 15 },
    { label: t('sheet.goal.intensive'), value: 30 },
  ];

  const dayOptions = [3, 5, 7];
  const levels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2'];

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={t('sheet.goal.title')}>
      <div className="space-y-6 py-2">
        {/* Daily Time Commitment */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-text-secondary mb-3">
            <Clock className="w-4 h-4 text-primary" />
            {t('sheet.goal.minutesQuestion')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {timeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMinutes(opt.value)}
                className={`py-3 px-2 rounded-2xl text-xs font-semibold border transition-colors text-center ${
                  minutes === opt.value
                    ? 'bg-primary/20 border-primary text-primary shadow-glow-purple'
                    : 'bg-surface-subtle border-border-subtle text-text-secondary pointer-hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Weekly Frequency */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-text-secondary mb-3">
            <Calendar className="w-4 h-4 text-primary" />
            {t('sheet.goal.daysQuestion')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {dayOptions.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`py-3 rounded-2xl text-sm font-bold border transition-colors ${
                  days === d
                    ? 'bg-primary/20 border-primary text-primary shadow-glow-purple'
                    : 'bg-surface-subtle border-border-subtle text-text-secondary pointer-hover:text-text-primary'
                }`}
              >
                {t('sheet.goal.days', { count: d })}
              </button>
            ))}
          </div>
        </div>

        {/* CEFR Level */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-text-secondary mb-3">
            <Sparkles className="w-4 h-4 text-primary" />
            {t('sheet.goal.levelQuestion')}
          </label>
          <div className="grid grid-cols-4 gap-2">
            {levels.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevel(lvl)}
                className={`py-3 rounded-2xl font-german font-bold text-sm border transition-colors ${
                  level === lvl
                    ? 'bg-fill text-on-fill border-primary shadow-glow-purple'
                    : 'bg-surface-subtle border-border-subtle text-text-secondary pointer-hover:text-text-primary'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <Button
          className="w-full mt-4"
          size="lg"
          onClick={() => {
            onSave(minutes, days, level);
            onClose();
          }}
        >
          {t('sheet.goal.save')}
        </Button>
      </div>
    </BottomSheet>
  );
};
