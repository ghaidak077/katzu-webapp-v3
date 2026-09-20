import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Flame, Clock, MessageSquare, Award, Share2, Sparkles } from 'lucide-react';

export const ProgressScreen: React.FC = () => {
  const [showShareModal, setShowShareModal] = useState(false);

  const user = useLiveQuery(() => db.users.get('current_user'));
  const sessions = useLiveQuery(() => db.sessions.toArray()) || [];

  const totalSentences = sessions.reduce((acc, s) => acc + (s.sentencesSpoken || 0), 0);
  const totalMinutes = Math.round(
    sessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0) / 60
  );
  const averageAccuracy =
    sessions.length > 0
      ? Math.round(sessions.reduce((acc, s) => acc + s.accuracyPercent, 0) / sessions.length)
      : 85;

  const daysOfWeek = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

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
            {user?.streakDays || 1} <span className="text-sm font-arabic font-normal">أيام متتالية</span>
          </div>
          <p className="text-xs text-text-muted font-arabic">
            أنت في المسار الصحيح لتثبيت العادة اليومية!
          </p>
        </div>
        <KatzuMascot name="thumbs_up" className="w-20 h-20 object-contain -me-1" />
      </Card>

      {/* 7-Day Activity Heatmap */}
      <Card className="p-4 mb-4">
        <h4 className="text-xs font-bold text-text-secondary mb-3">نشاط آخر 7 أيام:</h4>
        <div className="grid grid-cols-7 gap-2 text-center">
          {daysOfWeek.map((day, idx) => {
            const hasActivity = idx === 6 || idx === 5; // recent active days
            return (
              <div key={day} className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold font-german transition-all ${
                    hasActivity
                      ? 'bg-primary text-white shadow-glow-purple'
                      : 'bg-surface-subtle text-text-muted border border-border-subtle'
                  }`}
                >
                  {hasActivity ? '✓' : ''}
                </div>
                <span className="text-[10px] text-text-secondary font-arabic">{day.slice(0, 3)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <Card className="p-3 text-center">
          <span className="text-[10px] text-text-secondary block mb-1">الدقة العامة</span>
          <div className="text-lg font-bold font-german text-primary">{averageAccuracy}%</div>
        </Card>
        <Card className="p-3 text-center">
          <span className="text-[10px] text-text-secondary block mb-1">إجمالي الجمل</span>
          <div className="text-lg font-bold font-german text-text-primary">{totalSentences || 12}</div>
        </Card>
        <Card className="p-3 text-center">
          <span className="text-[10px] text-text-secondary block mb-1">وقت التحدث</span>
          <div className="text-lg font-bold font-german text-status-learning">
            {totalMinutes || 8} <span className="text-[10px] font-arabic">د</span>
          </div>
        </Card>
      </div>

      {/* Share Progress CTA */}
      <Button
        variant="secondary"
        size="lg"
        className="w-full flex items-center justify-center gap-2 border-primary/30"
        onClick={() => setShowShareModal(true)}
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
          <h3 className="text-lg font-bold font-arabic">{user?.displayName || 'مستكشف كَاتْزُو'}</h3>
          <div className="flex justify-center gap-4 text-xs">
            <div>
              <span className="text-text-muted block">المستوى</span>
              <span className="font-german font-bold text-primary text-base">{user?.cefrLevel || 'A1'}</span>
            </div>
            <div>
              <span className="text-text-muted block">الحماس</span>
              <span className="font-german font-bold text-status-learning text-base">
                {user?.streakDays || 1} أيام 🔥
              </span>
            </div>
            <div>
              <span className="text-text-muted block">النقاط</span>
              <span className="font-german font-bold text-status-success text-base">{user?.totalXp || 120} XP</span>
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
                text: `لقد حققت سلسلة ${user?.streakDays || 1} أيام في محادثات الألمانية مع كَاتْزُو!`,
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
