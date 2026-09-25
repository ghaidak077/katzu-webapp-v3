import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { focusMistakesForReview } from '@/lib/srs/store';
import { buildMistakeProfile, drillForCategory, type CategoryStat } from '@/lib/coach/profile';
import { CATEGORY_COPY } from '@/lib/coach/taxonomy';
import { GermanText } from '@/components/common/GermanText';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { triggerHaptic } from '@/lib/utils/haptics';
import { ArrowLeft, ArrowRight, Flame, Loader2, Target } from 'lucide-react';
import type { MistakeEntity } from '@/types/models';

export interface CoachScreenProps {
  onBack: () => void;
  onStartReview: () => void;
}

/**
 * "ملف أخطائك" — the coach's notebook.
 *
 * A real coach is valuable for one reason above all: they remember what *you*
 * keep getting wrong and come back to it. The conversation engine has always
 * returned a grammar rule with every correction; this screen is where that
 * evidence finally becomes a diagnosis the learner can act on.
 *
 * It shows only what was recorded. When there is not enough evidence to name a
 * pattern it says so instead of inventing a weakness, because a wrong diagnosis
 * sends the learner to practise the wrong thing — the one failure that costs
 * them more than showing nothing at all.
 */
export const CoachScreen: React.FC<CoachScreenProps> = ({ onBack, onStartReview }) => {
  const mistakes = useLiveQuery(() => db.mistakes.toArray(), []);
  const [drilling, setDrilling] = useState<string | null>(null);

  if (!mistakes) {
    return (
      <div className="min-h-screen bg-black text-text-primary p-4 max-w-md mx-auto flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const profile = buildMistakeProfile(mistakes);

  const practise = async (stat: CategoryStat) => {
    if (drilling) return;
    setDrilling(stat.category);
    triggerHaptic('light');
    try {
      const focused = await focusMistakesForReview(drillForCategory(mistakes, stat.category));
      // Nothing to drill means no queue was created; sending the learner to an
      // empty review would look like a broken button, so stay put and re-enable.
      if (focused > 0) onStartReview();
    } finally {
      setDrilling(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-text-primary p-4 max-w-md mx-auto pb-28">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold font-arabic">ملف أخطائك</h2>
          <p className="text-xs text-text-secondary font-arabic">
            هنا يتذكر كَاتْزُو ما يتكرر عندك — لا ما تقوله القائمة.
          </p>
        </div>
        <KatzuMascot name="progress_mascot" className="w-12 h-12 object-contain" />
      </div>

      {profile.total === 0 ? (
        <Card variant="hero" glow className="text-center p-6">
          <KatzuMascot name="thumbs_up" className="w-24 h-24 object-contain mx-auto mb-3" />
          <h3 className="text-lg font-bold font-arabic mb-1">{profile.headlineAr}</h3>
          <p className="text-xs text-text-secondary font-arabic mb-4">{profile.detailAr}</p>
          <Button className="w-full" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
            عد إلى المسار
          </Button>
        </Card>
      ) : (
        <>
          <Card variant="hero" glow className="mb-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 shrink-0 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold font-arabic leading-snug mb-1">
                  {profile.headlineAr}
                </h3>
                <p className="text-[11px] text-text-secondary font-arabic leading-relaxed">
                  {profile.detailAr}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="rounded-2xl bg-surface-subtle p-3 text-center">
                <div className="text-lg font-bold font-german text-status-error">{profile.open}</div>
                <span className="text-[10px] font-arabic text-text-secondary">تحتاج عملاً</span>
              </div>
              <div className="rounded-2xl bg-surface-subtle p-3 text-center">
                <div className="text-lg font-bold font-german text-status-success">
                  {profile.mastered}
                </div>
                <span className="text-[10px] font-arabic text-text-secondary">أتقنتها</span>
              </div>
              <div className="rounded-2xl bg-surface-subtle p-3 text-center">
                <div className="text-lg font-bold font-german text-primary">{profile.total}</div>
                <span className="text-[10px] font-arabic text-text-secondary">إجمالي الأخطاء</span>
              </div>
            </div>
          </Card>

          {profile.hasEnoughEvidence && (
            <div className="mb-4">
              <h3 className="text-sm font-bold font-arabic mb-2 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-status-error" />
                أكثر ثلاثة أنماط عندك
              </h3>
              <div className="space-y-2">
                {profile.top.map((stat) => (
                  <CategoryRow
                    key={stat.category}
                    stat={stat}
                    mistakes={mistakes}
                    isDrilling={drilling === stat.category}
                    disabled={drilling !== null}
                    onPractise={() => practise(stat)}
                  />
                ))}
              </div>
            </div>
          )}

          {!profile.hasEnoughEvidence && (
            <Card className="p-4 mb-4 text-center">
              <KatzuMascot name="listening" className="w-20 h-20 object-contain mx-auto mb-2" />
              <p className="text-[11px] text-text-secondary font-arabic leading-relaxed">
                سجّلت حتى الآن {profile.total} من الأخطاء. تابع الحديث مع كَاتْزُو، وعندما تتضح الصورة
                سأخبرك بأهم ثلاثة أنماط لديك وطريقة علاج كل واحد.
              </p>
            </Card>
          )}

          {profile.hasEnoughEvidence && profile.categories.length > profile.top.length && (
            <Card className="p-4 mb-4">
              <h3 className="text-sm font-bold font-arabic mb-3">بقية الأنماط</h3>
              <div className="space-y-3">
                {profile.categories.slice(3).map((stat) => (
                  <div key={stat.category}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-arabic text-text-secondary">
                        {CATEGORY_COPY[stat.category].labelAr}
                      </span>
                      <span className="text-[11px] font-german text-text-muted">{stat.count}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
                      <div
                        className="h-full rounded-full bg-border-subtle"
                        style={{ width: `${Math.max(stat.sharePercent, 4)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Button variant="secondary" className="w-full" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
            عد إلى المسار
          </Button>
        </>
      )}
    </div>
  );
};

interface CategoryRowProps {
  stat: CategoryStat;
  /** The full bank, not just this category: the row picks its own examples. */
  mistakes: MistakeEntity[];
  isDrilling: boolean;
  disabled: boolean;
  onPractise: () => void;
}

const CategoryRow: React.FC<CategoryRowProps> = ({
  stat,
  mistakes,
  isDrilling,
  disabled,
  onPractise,
}) => {
  const copy = CATEGORY_COPY[stat.category];
  const examples = drillForCategory(mistakes, stat.category, 2);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-bold font-arabic leading-snug">{copy.labelAr}</span>
        <Badge variant="error" size="sm">
          {stat.count}
        </Badge>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle mb-2">
        <div
          className="h-full rounded-full bg-status-error transition-all"
          style={{ width: `${Math.max(stat.sharePercent, 4)}%` }}
        />
      </div>

      <p className="text-[10px] text-text-muted font-arabic mb-2">
        {stat.sharePercent}% من أخطائك
        {stat.mastered > 0 ? ` — أتقنت ${stat.mastered} منها` : ''}
      </p>

      {examples.length > 0 && (
        <div className="rounded-2xl bg-surface-subtle p-3 mb-3 space-y-1.5">
          {examples.map((mistake, index) => (
            <div key={mistake.id ?? index} className="text-[11px] leading-relaxed">
              <span className="text-status-error line-through decoration-status-error/50">
                <GermanText>{mistake.original}</GermanText>
              </span>
              <span className="text-text-muted mx-1">→</span>
              <span className="text-status-success">
                <GermanText>{mistake.corrected}</GermanText>
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-text-secondary font-arabic leading-relaxed mb-3">{copy.adviceAr}</p>

      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={onPractise}
        disabled={disabled}
        isLoading={isDrilling}
      >
        تدرّب على هذا الآن
        <ArrowRight className="w-3.5 h-3.5" />
      </Button>
    </Card>
  );
};
