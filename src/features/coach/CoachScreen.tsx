import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { focusMistakesForReview } from '@/lib/srs/store';
import {
  buildCategoryTrends,
  buildMistakeProfile,
  buildWeeklyCoachSummary,
  drillForCategory,
  type CategoryStat,
  type CategoryTrend,
  type TrendDirection,
} from '@/lib/coach/profile';
import { categoryAdvice, categoryLabel } from '@/lib/coach/taxonomy';
import { track } from '@/lib/analytics/client';
import { GermanText } from '@/components/common/GermanText';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { UI_LANGUAGE_META, type UiLanguage } from '@/lib/i18n/languages';
import type { UiStringKey } from '@/lib/i18n/strings';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { triggerHaptic } from '@/lib/utils/haptics';
import { ArrowLeft, ArrowRight, Flame, Target } from 'lucide-react';
import { KatzuThinking } from '@/components/effects/KatzuThinking';
import type { MistakeEntity } from '@/types/models';

export interface CoachScreenProps {
  onBack: () => void;
  onStartReview: () => void;
}

/**
 * The coach's notebook.
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
  const { t, uiLanguage } = useLanguage();
  const mistakes = useLiveQuery(() => db.mistakes.toArray(), []);
  const reviewItems = useLiveQuery(() => db.review_items.toArray(), []);
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const [drilling, setDrilling] = useState<string | null>(null);
  const [drillNotice, setDrillNotice] = useState<string | null>(null);

  useEffect(() => {
    track('coach_viewed');
  }, []);

  const now = Date.now();
  const trends: CategoryTrend[] = mistakes ? buildCategoryTrends(mistakes, reviewItems || [], now) : [];
  const trendByCategory = new Map(trends.map((trend) => [trend.category, trend]));
  const weekly = mistakes
    ? buildWeeklyCoachSummary(
        {
          mistakes,
          sessions: sessions || [],
          dueReviewCount: (reviewItems || []).filter((item) => (Number(item.dueAt) || 0) <= now).length,
        },
        now,
        uiLanguage,
      )
    : null;

  if (!mistakes) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-4 text-text-primary">
        <KatzuThinking size={64} labelAr={t('coach.loading')} />
      </div>
    );
  }

  const profile = buildMistakeProfile(mistakes, uiLanguage);

  const practise = async (stat: CategoryStat) => {
    if (drilling) return;
    setDrilling(stat.category);
    setDrillNotice(null);
    triggerHaptic('light');
    try {
      const focused = await focusMistakesForReview(drillForCategory(mistakes, stat.category));
      // Nothing to drill means no queue was created; sending the learner to an
      // empty review would look like a broken button, so say why and stay put.
      // A correction needs a stored Arabic meaning to be a real task (V41), so
      // the notice must not claim there are no mistakes at all.
      if (focused > 0) onStartReview();
      else setDrillNotice(t('coach.drillEmpty'));
    } finally {
      setDrilling(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-text-primary p-4 max-w-md mx-auto pb-28">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold font-arabic">{t('coach.title')}</h2>
          <p className="text-xs text-text-secondary font-arabic">
            {t('coach.subtitle')}
          </p>
        </div>
        <KatzuMascot name="progress_mascot" className="w-12 h-12 object-contain" />
      </div>

      {drillNotice && (
        <p role="status" className="mb-4 rounded-2xl bg-surface-subtle p-3 text-micro font-arabic text-text-secondary leading-relaxed">
          {drillNotice}
        </p>
      )}

      {profile.total === 0 ? (
        <Card variant="hero" glow className="text-center p-6">
          <KatzuMascot name="thumbs_up" className="w-24 h-24 object-contain mx-auto mb-3" />
          <h3 className="text-lg font-bold font-arabic mb-1">{profile.headlineAr}</h3>
          <p className="text-xs text-text-secondary font-arabic mb-4">{profile.detailAr}</p>
          <Button className="w-full" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
            {t('coach.back')}
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
                <p className="text-micro text-text-secondary font-arabic leading-relaxed">
                  {profile.detailAr}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="rounded-2xl bg-surface-subtle p-3 text-center">
                <div className="text-lg font-bold font-german text-status-error">{profile.open}</div>
                <span className="text-micro font-arabic text-text-secondary">{t('coach.openLabel')}</span>
              </div>
              <div className="rounded-2xl bg-surface-subtle p-3 text-center">
                <div className="text-lg font-bold font-german text-status-success">
                  {profile.mastered}
                </div>
                <span className="text-micro font-arabic text-text-secondary">{t('coach.masteredLabel')}</span>
              </div>
              <div className="rounded-2xl bg-surface-subtle p-3 text-center">
                <div className="text-lg font-bold font-german text-primary">{profile.total}</div>
                <span className="text-micro font-arabic text-text-secondary">{t('coach.totalLabel')}</span>
              </div>
            </div>
          </Card>

          {profile.hasEnoughEvidence && (
            <div className="mb-4">
              <h3 className="text-sm font-bold font-arabic mb-2 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-status-error" />
                {t('coach.topTitle')}
              </h3>
              <div className="space-y-2">
                {profile.top.map((stat) => (
                  <CategoryRow
                    key={stat.category}
                    stat={stat}
                    trend={trendByCategory.get(stat.category)}
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
              <p className="text-micro text-text-secondary font-arabic leading-relaxed">
                {t('coach.notEnoughBody', { count: profile.total })}
              </p>
            </Card>
          )}

          {profile.hasEnoughEvidence && profile.categories.length > profile.top.length && (
            <Card className="p-4 mb-4">
              <h3 className="text-sm font-bold font-arabic mb-3">{t('coach.restTitle')}</h3>
              <div className="space-y-3">
                {profile.categories.slice(3).map((stat) => (
                  <div key={stat.category}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-micro font-arabic text-text-secondary">
                        {categoryLabel(stat.category, uiLanguage)}
                      </span>
                      <span className="text-micro font-german text-text-muted">{stat.count}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
                      <div
                        className="h-full w-full rounded-full bg-border-subtle origin-right"
                        style={{ transform: `scaleX(${Math.max(stat.sharePercent, 4) / 100})` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {weekly && (
            <Card className="p-4 mb-4">
              <h3 className="text-sm font-bold font-arabic mb-3">{t('coach.weekTitle')}</h3>
              <ul className="space-y-2.5 text-micro font-arabic leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="shrink-0 text-status-success" aria-hidden>
                    ✓
                  </span>
                  <span className="text-text-secondary">
                    <span className="text-text-primary font-bold">{t('coach.improvedLabel')}</span>
                    {weekly.improvedAr}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0 text-status-error" aria-hidden>
                    ↻
                  </span>
                  <span className="text-text-secondary">
                    <span className="text-text-primary font-bold">{t('coach.repeatedLabel')}</span>
                    {weekly.repeatedAr}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0 text-primary" aria-hidden>
                    ←
                  </span>
                  <span className="text-text-secondary">
                    <span className="text-text-primary font-bold">{t('coach.nextLabel')}</span>
                    {weekly.nextAr}
                  </span>
                </li>
              </ul>
              {!weekly.hasData && (
                <p className="mt-3 text-micro font-arabic text-text-muted leading-relaxed">
                  {t('coach.honestNote')}
                </p>
              )}
            </Card>
          )}

          <Button variant="secondary" className="w-full" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
            {t('coach.back')}
          </Button>
        </>
      )}
    </div>
  );
};

interface CategoryRowProps {
  stat: CategoryStat;
  /** Trend + schedule for this category, when enough evidence exists. */
  trend?: CategoryTrend;
  /** The full bank, not just this category: the row picks its own examples. */
  mistakes: MistakeEntity[];
  isDrilling: boolean;
  disabled: boolean;
  onPractise: () => void;
}

/** A trend's wording, shown only when the evidence supports it. */
const TREND_COPY: Record<TrendDirection, { key: UiStringKey; variant: 'success' | 'error' | 'subtle' }> = {
  improving: { key: 'coach.trend.improving', variant: 'success' },
  worsening: { key: 'coach.trend.worsening', variant: 'error' },
  steady: { key: 'coach.trend.steady', variant: 'subtle' },
  insufficient: { key: 'coach.trend.insufficient', variant: 'subtle' },
};

function formatDay(date: number, language: UiLanguage): string {
  return new Intl.DateTimeFormat(UI_LANGUAGE_META[language].bcp47, { day: 'numeric', month: 'short' }).format(
    new Date(date),
  );
}

const CategoryRow: React.FC<CategoryRowProps> = ({
  stat,
  trend,
  mistakes,
  isDrilling,
  disabled,
  onPractise,
}) => {
  const { t, uiLanguage } = useLanguage();
  const examples = drillForCategory(mistakes, stat.category, 2);
  const trendCopy = trend ? TREND_COPY[trend.trend] : null;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-bold font-arabic leading-snug">{categoryLabel(stat.category, uiLanguage)}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {trendCopy && trend && trend.trend !== 'insufficient' && (
            <Badge variant={trendCopy.variant} size="sm">
              {t(trendCopy.key)}
            </Badge>
          )}
          <Badge variant="error" size="sm">
            {stat.count}
          </Badge>
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle mb-2">
        <div
          className="h-full w-full rounded-full bg-status-error origin-right transition-transform duration-panels ease-out"
          style={{ transform: `scaleX(${Math.max(stat.sharePercent, 4) / 100})` }}
        />
      </div>

      <p className="text-micro text-text-muted font-arabic mb-2">
        {t('coach.shareOfMistakes', { percent: stat.sharePercent })}
        {stat.mastered > 0 ? t('coach.masteredOf', { count: stat.mastered }) : ''}
      </p>

      {examples.length > 0 && (
        <div className="rounded-2xl bg-surface-subtle p-3 mb-3 space-y-1.5">
          {examples.map((mistake, index) => (
            <div key={mistake.id ?? index} className="text-micro leading-relaxed">
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

      <p className="text-micro text-text-secondary font-arabic leading-relaxed mb-3">{categoryAdvice(stat.category, uiLanguage)}</p>

      {trend && (
        <p className="text-micro font-arabic text-text-muted mb-3 flex flex-wrap gap-x-3 gap-y-1">
          {trend.lastPracticedAt && (
            <span>{t('coach.lastPractised', { date: formatDay(trend.lastPracticedAt, uiLanguage) })}</span>
          )}
          {trend.nextReviewAt && (
            <span>{t('coach.nextReview', { date: formatDay(trend.nextReviewAt, uiLanguage) })}</span>
          )}
          {trend.open > 0 && <span>{t('coach.openCount', { count: trend.open })}</span>}
        </p>
      )}

      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={onPractise}
        disabled={disabled}
        isLoading={isDrilling}
      >
        {t('coach.practiseNow')}
        <ArrowRight className="w-3.5 h-3.5" />
      </Button>
    </Card>
  );
};
