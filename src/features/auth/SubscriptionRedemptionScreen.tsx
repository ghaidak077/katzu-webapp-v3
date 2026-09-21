import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import confetti from 'canvas-confetti';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { db } from '@/lib/db/katzuDb';
import { workerClient } from '@/lib/api/workerClient';
import { ArrowRight, Check, KeyRound, Sparkles, UserCheck, AlertCircle } from 'lucide-react';

export interface SubscriptionRedemptionScreenProps {
  onBack: () => void;
  onSuccess: () => void;
  onGoToSignIn?: () => void;
}

export const SubscriptionRedemptionScreen: React.FC<SubscriptionRedemptionScreenProps> = ({
  onBack,
  onSuccess,
  onGoToSignIn,
}) => {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const user = useLiveQuery(() => db.users.get('current_user'));
  const isLoggedIn = !!user?.isLoggedIn && !!user?.email;

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return;

    setErrorMessage('');
    setSuccessMessage('');

    const activeToken = user?.sessionToken?.trim();
    if (!user?.isLoggedIn || !activeToken) {
      setErrorMessage('يلزم تسجيل الدخول بحساب Google موثّق قبل تفعيل الكود.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await workerClient.verifyCode(cleanCode, activeToken);

      if (res.success && res.valid === true && res.months && res.expiresAt) {
        // Trigger celebratory confetti
        try {
          confetti({
            particleCount: 100,
            spread: 80,
            origin: { y: 0.6 },
          });
        } catch (_) {}

        const grantedMonths = res.months;
        const expiryIso = res.expiresAt;

        setSuccessMessage(`تم تفعيل اشتراك Katzu Pro بنجاح لمدة ${grantedMonths} أشهر! مبروك 🎉`);

        await db.users.update('current_user', {
          isSubscriptionActive: true,
          subscriptionExpiresAt: expiryIso,
          updatedAt: Date.now(),
        });

        await db.redeemed_codes.put({
          code: cleanCode,
          redeemedAt: Date.now(),
          monthsGranted: grantedMonths,
        });

        setTimeout(() => {
          onSuccess();
        }, 1500);
      } else {
        setErrorMessage(res.error || 'كود التفعيل غير صالح أو انتهت صلاحيته.');
      }
    } catch {
      setErrorMessage('حدث خطأ أثناء الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-6 bg-black text-text-primary max-w-md mx-auto relative overflow-y-auto">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="p-2.5 rounded-2xl bg-surface-card border border-border-subtle hover:bg-surface-subtle transition-colors"
        >
          <ArrowRight className="w-5 h-5 text-text-secondary" />
        </button>
        <span className="font-arabic font-bold text-sm text-text-secondary">عضوية Katzu Pro</span>
        <div className="w-10" />
      </div>

      <div className="flex flex-col items-center text-center my-auto">
        <KatzuMascot name="badge" glow className="w-28 h-28 mb-3" />

        <h2 className="text-2xl font-bold font-arabic mb-2">أطلق العنان لقدراتك مع Pro</h2>
        <p className="text-xs text-text-secondary font-arabic mb-5 max-w-xs leading-relaxed">
          محادثات ذكية غير محدودة بدون قيود يومية، مع تصحيح فوري للنطق والقواعد لجميع المستويات (A1 - B2).
        </p>

        {/* Feature Highlights */}
        <div className="w-full space-y-2 mb-5 text-start">
          {[
            'محادثات صوتية غير محدودة مع كَاتْزُو بالذكاء الاصطناعي',
            'فتح كامل مسار المستويات الواقعية من A1 إلى B2',
            'تحليل وتصحيح فوري للقواعد مع شرح باللغة العربية',
            'بنك مخصص لمراجعة الأخطاء وتثبيت المفردات',
          ].map((feat, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-surface-card border border-border-subtle text-xs font-semibold"
            >
              <div className="w-5 h-5 rounded-full bg-status-success/20 text-status-success flex items-center justify-center flex-shrink-0">
                <Check className="w-3.5 h-3.5" />
              </div>
              <span>{feat}</span>
            </div>
          ))}
        </div>

        {/* Account Link Status */}
        {user?.email && (
          <div className="w-full p-3 mb-4 rounded-xl bg-surface-card border border-border-subtle text-xs flex items-center justify-between text-start font-arabic">
            <div className="flex items-center gap-2 text-text-secondary">
              <UserCheck className="w-4 h-4 text-status-success flex-shrink-0" />
              <span>الحساب المتصل: <span className="font-mono text-text-primary font-bold">{user.email}</span></span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-success/20 text-status-success font-bold">
              Google ✓
            </span>
          </div>
        )}

        {/* Activation Code Redemption Box */}
        <Card className="w-full p-4 bg-surface-subtle border-border-subtle text-start mb-4">
          <label className="flex items-center gap-1.5 text-xs font-bold text-text-secondary mb-2 font-arabic">
            <KeyRound className="w-3.5 h-3.5 text-primary" />
            هل لديك كود تفعيل؟ (مثال: DE-1M-...)
          </label>
          <form onSubmit={handleRedeem} className="flex gap-2">
            <input
              type="text"
              placeholder="DE-6M-A1B2C3D4-E5F6G7H8"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="flex-1 h-11 bg-surface-card border border-border-subtle focus:border-primary rounded-xl px-3 text-xs font-mono font-bold uppercase tracking-wider outline-none text-cyan-300"
            />
            <Button type="submit" size="sm" isLoading={isLoading} disabled={!code.trim()}>
              تفعيل
            </Button>
          </form>

          {errorMessage && (
            <div className="mt-2.5 p-2 rounded-lg bg-status-error/15 border border-status-error/30 text-status-error text-[11px] font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="mt-2.5 p-2 rounded-lg bg-status-success/15 border border-status-success/30 text-status-success text-[11px] font-semibold flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </Card>

        {/* Plans info */}
        <p className="w-full mb-3 text-center text-[11px] text-text-muted font-arabic">
          التفعيل متاح حالياً عبر كود مرتبط بحسابك الموثّق.
        </p>
      </div>

      <div className="pt-2 text-center">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-xs text-text-muted">
          المتابعة بالحساب المجاني
        </Button>
      </div>
    </div>
  );
};
