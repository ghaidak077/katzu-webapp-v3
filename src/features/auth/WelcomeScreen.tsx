import React, { useState } from 'react';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { GoalSelectionBottomSheet } from '@/components/sheets/GoalSelectionBottomSheet';
import { db } from '@/lib/db/katzuDb';
import type { CEFRLevel } from '@/types/models';
import { Sparkles, ArrowLeft } from 'lucide-react';

export interface WelcomeScreenProps {
  onContinue: () => void;
  onGoToSignIn: (mode?: 'signin' | 'signup') => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onContinue, onGoToSignIn }) => {
  const [name, setName] = useState('');
  const [showGoalSheet, setShowGoalSheet] = useState(false);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setShowGoalSheet(true);
  };

  const handleSaveGoal = async (minutes: number, days: number, level: CEFRLevel) => {
    await db.users.update('current_user', {
      displayName: name.trim(),
      dailyGoalMinutes: minutes,
      weeklyGoalDays: days,
      cefrLevel: level,
      updatedAt: Date.now(),
    });
    try {
      localStorage.setItem('katzu_onboarding_completed', 'true');
    } catch {}
    // Google sign-in is essential: proceed directly to account setup
    onGoToSignIn('signup');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-6 bg-black text-text-primary max-w-md mx-auto relative overflow-hidden">
      {/* Background glow circle */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-primary/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header Tag */}
      <div className="w-full flex justify-center pt-4">
        <Badge variant="primary" size="md">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          Katzu AI • رفيقك الذكي
        </Badge>
      </div>

      {/* Hero Sticker & Title */}
      <div className="flex flex-col items-center text-center my-auto">
        <div className="relative mb-6">
          <KatzuMascot name="welcome" glow className="w-56 h-56 object-contain" />
        </div>

        <h1 className="text-3xl font-bold font-arabic mb-3 text-text-primary tracking-tight">
          تحدث الألمانية بدون خوف
        </h1>
        <p className="text-sm font-arabic text-text-secondary leading-relaxed px-4">
          تعلم المحادثة الواقعية مع كَاتْزُو — رفيقك الساخر والذكي لتصحيح نطقك وقواعدك في مواقف حقيقية.
        </p>

        {/* Input & Form */}
        <form onSubmit={handleStart} className="w-full mt-8 space-y-3">
          <input
            type="text"
            placeholder="ما هو اسمك الأول؟"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-14 bg-surface-card border border-border-subtle focus:border-primary rounded-2xl px-5 text-center text-base font-arabic font-semibold outline-none transition-all placeholder:text-text-muted"
            required
          />

          <Button type="submit" size="lg" className="w-full" disabled={!name.trim()}>
            ابدأ رحلتك الآن
            <ArrowLeft className="w-5 h-5 me-2" />
          </Button>

          <div className="flex items-center gap-3 w-full pt-1 pb-0.5">
            <div className="h-[1px] bg-border-subtle flex-1" />
            <span className="text-[11px] font-arabic text-text-muted">أو المتابعة السريعة</span>
            <div className="h-[1px] bg-border-subtle flex-1" />
          </div>

          <Button
            type="button"
            size="lg"
            variant="secondary"
            className="w-full flex items-center justify-center gap-2.5 bg-white text-black hover:bg-neutral-200 border-none font-bold shadow-md active:scale-[0.98] transition-transform"
            onClick={() => onGoToSignIn('signin')}
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span className="font-arabic text-sm">المتابعة باستخدام Google</span>
          </Button>
        </form>
      </div>

      {/* Footer Sign-in / Sign-up link & Attribution */}
      <div className="w-full flex flex-col items-center gap-2.5 pb-2">
        <div className="flex items-center gap-3 text-xs font-semibold text-text-secondary font-arabic">
          <button
            type="button"
            onClick={() => onGoToSignIn('signin')}
            className="hover:text-primary transition-colors"
          >
            لديك حساب؟ <span className="text-primary underline font-bold">تسجيل الدخول</span>
          </button>
          <span className="text-border-subtle">•</span>
          <button
            type="button"
            onClick={() => onGoToSignIn('signup')}
            className="hover:text-primary transition-colors text-text-secondary"
          >
            <span className="text-primary underline font-bold">إنشاء حساب جديد</span>
          </button>
        </div>

        <p className="text-[11px] text-text-muted font-arabic">
          صُنع بواسطة غيدق علوش — ghaidak.com
        </p>
      </div>

      {/* Goal Bottom Sheet */}
      <GoalSelectionBottomSheet
        isOpen={showGoalSheet}
        onClose={() => setShowGoalSheet(false)}
        onSave={handleSaveGoal}
      />
    </div>
  );
};
