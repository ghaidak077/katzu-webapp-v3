import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { getDisplayStreak, toLocalDateKey } from '@/features/report/metrics';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Flame, Share2 } from 'lucide-react';
import type { SessionEntity } from '@/types/models';

const WEEKDAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export function getLastSevenDays(referenceDate = new Date()) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(referenceDate);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return {
      dateKey: toDateKey(date),
      label: WEEKDAY_NAMES[date.getDay()],
    };
  });
}

export function getActivityDateKeys(sessions: Array<Pick<SessionEntity, 'timestamp'>>) {
  return new Set(
    sessions.map(({ timestamp }) => {
      const date = new Date(timestamp);
      return toDateKey(date);
    }),
  );
}

export const ProgressScreen: React.FC = () => {
  const [showShareModal, setShowShareModal] = useState(false);

  const user = useLiveQuery(() => db.users.get('current_user'));
  const sessionsQuery = useLiveQuery(() => db.sessions.toArray());
  const sessions = sessionsQuery ?? [];

  const totalSentences = sessions.reduce((acc, s) => acc + (s.sentencesSpoken || 0), 0);
  const totalMinutes = Math.round(
    sessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0) / 60
  );
  const accuracies = sessions
    .map((session) => session.accuracyPercent)
    .filter((accuracy): accuracy is number => accuracy !== null && Number.isFinite(accuracy));
  const averageAccuracy =
    accuracies.length > 0
      ? Math.round(accuracies.reduce((total, accuracy) => total + accuracy, 0) / accuracies.length)
      : null;
  const activityDateKeys = useMemo(() => getActivityDateKeys(sessions), [sessions]);
  const days = useMemo(() => getLastSevenDays(), []);
  const hasProgress = sessions.length > 0;
  const streakDays = hasProgress
    ? getDisplayStreak({ streakDays: user?.streakDays ?? 0, lastActiveDate: user?.lastActiveDate || null }, toLocalDateKey())
    : 0;

  return (
    <div className="min-h-screen bg-black text-text-primary p-4 max-w-md mx-auto relative pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold font-arabic">إحصائيات تقدمك</h2>
          <p className="text-xs text-text-secondary">تابع استمرارية تعلمك وتطور دقتك اللغوية</p>
        </div>
        <KatzuMascot name="progress_mascot" className="w-14 h-14 object-contain" />
      </div>

      {/* Streak Hero Card */}
      <Card variant="hero" className="p-5 mb-4 border border-status-learning/40 shadow-glow-purple flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-status-learning font-bold text-sm mb-1">
            <Flame className="w-5 h-5 fill-status-learning" />
            سلسلة الحماس الحالية
          </div>
          <div className="text-3xl font-bold font-german text-text-primary mb-1">
            {streakDays} <span className="text-sm font-arabic font-normal">أيام متتالية</span>
          </div>
          <p className="text-xs text-text-muted font-arabic">
            {hasProgress ? 'استمر في ممارسة الألمانية لبناء عادتك اليومية.' : 'لم تسجل أي جلسات بعد.'}
          </p>
        </div>
        <KatzuMascot name="thumbs_up" className="w-20 h-20 object-contain -me-1" />
      </Card>

      {/* 7-Day Activity Heatmap */}
      <Card className="p-4 mb-4">
        <h4 className="text-xs font-bold text-text-secondary mb-3">نشاط آخر 7 أيام:</h4>
        <div className="grid grid-cols-7 gap-2 text-center">
          {days.map(({ dateKey, label }) => {
            const hasActivity = activityDateKeys.has(dateKey);
            return (
              <div key={dateKey} className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold font-german transition-all ${
                    hasActivity
                      ? 'bg-primary text-white shadow-glow-purple'
                      : 'bg-surface-subtle text-text-muted border border-border-subtle'
                  }`}
                >
                  {hasActivity ? '✓' : ''}
                </div>
                <span className="text-[10px] text-text-secondary font-arabic">{label.slice(0, 3)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <Card className="p-3 text-center">
          <span className="text-[10px] text-text-secondary block mb-1">الدقة العامة</span>
          <div className="text-lg font-bold font-german text-primary">
            {averageAccuracy === null ? '—' : `${averageAccuracy}%`}
          </div>
        </Card>
        <Card className="p-3 text-center">
          <span className="text-[10px] text-text-secondary block mb-1">إجمالي الجمل</span>
          <div className="text-lg font-bold font-german text-text-primary">{totalSentences}</div>
        </Card>
        <Card className="p-3 text-center">
          <span className="text-[10px] text-text-secondary block mb-1">وقت التحدث</span>
          <div className="text-lg font-bold font-german text-status-learning">
            {totalMinutes} <span className="text-[10px] font-arabic">د</span>
          </div>
        </Card>
      </div>

      {/* Share Progress CTA */}
      <Button
        variant="secondary"
        size="lg"
        className="w-full flex items-center justify-center gap-2 border-primary/30"
        onClick={() => setShowShareModal(true)}
        disabled={!hasProgress}
      >
        <Share2 className="w-4 h-4 text-primary" />
        مشاركة بطاقة إنجازك
      </Button>

      {/* Share Modal */}
      <Modal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title="بطاقة إنجاز Katzu"
      >
        <div className="p-4 rounded-3xl bg-surface-hero border border-primary/40 text-center space-y-4 mb-4 shadow-glow-purple">
          <KatzuMascot name="celebrating" glow className="w-24 h-24 mx-auto" />
          <h3 className="text-lg font-bold font-arabic">{user?.displayName || '—'}</h3>
          <div className="flex justify-center gap-4 text-xs">
            <div>
              <span className="text-text-muted block">المستوى</span>
              <span className="font-german font-bold text-primary text-base">{user?.cefrLevel ?? '—'}</span>
            </div>
            <div>
              <span className="text-text-muted block">الحماس</span>
              <span className="font-german font-bold text-status-learning text-base">
                {streakDays} أيام 🔥
              </span>
            </div>
            <div>
              <span className="text-text-muted block">النقاط</span>
              <span className="font-german font-bold text-status-success text-base">{user?.totalXp ?? 0} XP</span>
            </div>
          </div>
          <p className="text-[11px] text-text-secondary italic">
            «أتعلم التحدث بالألمانية بطلاقة مع كَاتْزُو الذكي!»
          </p>
        </div>

        <Button
          size="md"
          className="w-full"
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: 'إنجازي في كَاتْزُو',
                text: `لقد حققت سلسلة ${streakDays} أيام في محادثات الألمانية مع كَاتْزُو!`,
                url: window.location.origin,
              });
            } else {
              alert('تم نسخ رابط إنجازك إلى الحافظة!');
            }
          }}
        >
          مشاركة الآن
        </Button>
      </Modal>
    </div>
  );
};
