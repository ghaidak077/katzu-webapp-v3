import React, { useState } from 'react';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { GoogleSignInButton } from '@/components/common/GoogleMark';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { GoalSelectionBottomSheet } from '@/components/sheets/GoalSelectionBottomSheet';
import { db } from '@/lib/db/katzuDb';
import type { CEFRLevel } from '@/types/models';
import { Sparkles, ArrowLeft } from 'lucide-react';

/** V32: what Katzu calls you when you would rather not say. */
const DEFAULT_DISPLAY_NAME = 'متعلم';

export interface WelcomeScreenProps {
  onGoToSignIn: (mode?: 'signin' | 'signup') => void;
  /** Public demo: a real lesson without creating an account. */
  onTryDemo?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onGoToSignIn, onTryDemo }) => {
  const [name, setName] = useState('');
  const [showGoalSheet, setShowGoalSheet] = useState(false);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowGoalSheet(true);
  };

  const handleSaveGoal = async (minutes: number, days: number, level: CEFRLevel) => {
    await db.users.update('current_user', {
      // V32: the name is optional. An empty field means "متعلم", not a blocked
      // door — a required free-text box at the front of the app buys nothing the
      // screen has not already promised (no email, no personal data), and it is
      // editable later in Profile. The field stays because Katzu addressing
      // someone by name makes the conversation warmer, and the default keeps it
      // warm for anyone who would rather not type.
      displayName: name.trim() || DEFAULT_DISPLAY_NAME,
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
            aria-label="اسمك داخل المحادثة (اختياري)"
            placeholder="اسمك داخل المحادثة — اختياري"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-14 bg-surface-card border border-border-subtle focus:border-primary rounded-2xl px-5 text-center text-base font-arabic font-semibold transition-colors placeholder:text-text-muted"
          />
          <p className="text-micro font-arabic text-text-muted px-2">
            اختياري — إن لم تكتب شيئاً سأُدعى «{DEFAULT_DISPLAY_NAME}». نستخدم الاسم داخل المحادثة فقط، ولا بريد ولا بيانات شخصية.
          </p>

          <Button type="submit" size="lg" className="w-full">
            ابدأ رحلتك الآن
            <ArrowLeft className="w-5 h-5 me-2" />
          </Button>

          <div className="flex items-center gap-3 w-full pt-1 pb-0.5">
            <div className="h-[1px] bg-border-subtle flex-1" />
            <span className="text-micro font-arabic text-text-muted">أو المتابعة السريعة</span>
            <div className="h-[1px] bg-border-subtle flex-1" />
          </div>

          {onTryDemo && (
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="w-full min-h-[44px]"
              onClick={onTryDemo}
            >
              جرّب درساً كاملاً بدون حساب
            </Button>
          )}

          <GoogleSignInButton onClick={() => onGoToSignIn('signin')} />
        </form>
      </div>

      {/* Footer Sign-in / Sign-up link & Attribution */}
      <div className="w-full flex flex-col items-center gap-2.5 pb-2">
        <div className="flex items-center gap-3 text-xs font-semibold text-text-secondary font-arabic">
          <button
            type="button"
            onClick={() => onGoToSignIn('signin')}
            className="min-h-touch -mx-2 px-2 flex items-center pointer-hover:text-primary transition-colors duration-fast ease-out"
          >
            لديك حساب؟ <span className="text-primary underline font-bold">تسجيل الدخول</span>
          </button>
          <span className="text-border-subtle">•</span>
          <button
            type="button"
            onClick={() => onGoToSignIn('signup')}
            className="min-h-touch -mx-2 px-2 flex items-center pointer-hover:text-primary transition-colors duration-fast ease-out text-text-secondary"
          >
            <span className="text-primary underline font-bold">إنشاء حساب جديد</span>
          </button>
        </div>

        <p className="text-micro text-text-muted font-arabic">
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
