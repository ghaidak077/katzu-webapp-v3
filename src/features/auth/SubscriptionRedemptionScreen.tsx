import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import confetti from 'canvas-confetti';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { db } from '@/lib/db/katzuDb';
import { workerClient } from '@/lib/api/workerClient';
import { ArrowRight, Check, KeyRound, UserCheck, AlertCircle, Gift, ExternalLink, ShoppingCart, ShieldCheck } from 'lucide-react';
import { getProPriceLabel, FALLBACK_PRICE_LABEL, SALES_URL, buildSalesUrl } from '@/lib/utils/links';
import { track } from '@/lib/analytics/client';
import { BackButton } from '@/components/common/BackButton';
import { useReducedMotion } from '@/components/glass/GlassSurface';
import { freeSessionsCopy } from '@/lib/entitlement/trialCopy';

export interface SubscriptionRedemptionScreenProps {
  onBack: () => void;
  onSuccess: () => void;
  onGoToSignIn?: () => void;
}

export const SubscriptionRedemptionScreen: React.FC<SubscriptionRedemptionScreenProps> = ({
  onBack,
  onSuccess,
}) => {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  // Confetti was the one animated subsystem in the app that ignored this.
  const reducedMotion = useReducedMotion();
  const [referralCode, setReferralCode] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return (params.get('ref') || '').toUpperCase();
    } catch {
      return '';
    }
  });
  const [referralMessage, setReferralMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const user = useLiveQuery(() => db.users.get('current_user'));const [priceLabel, setPriceLabel] = useState(FALLBACK_PRICE_LABEL);
  /**
   * V31: how many free conversations the SERVER says are left. `null` until the
   * ledger answers, and it stays `null` if it cannot — which is a different
   * thing from zero, and the copy below says exactly that instead of printing
   * the locally-seeded 3 forever.
   */
  const [freeSessions, setFreeSessions] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    getProPriceLabel().then((label) => {
      if (alive) setPriceLabel(label);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const token = user?.sessionToken?.trim();
    if (!token) return;
    workerClient
      .checkSubscriptionStatus(token)
      .then((status) => {
        if (alive) setFreeSessions(typeof status.freeSessionsRemaining === 'number' ? status.freeSessionsRemaining : null);
      })
      .catch(() => {
        /* the copy falls back to "unknown", which is honest — never to a guess */
      });
    return () => {
      alive = false;
    };
  }, [user?.sessionToken]);

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
        // Celebration, unless the learner has asked their OS for less motion.
        // The subscription is granted either way — this is decoration, not
        // part of the outcome, so it is the only thing gated.
        if (!reducedMotion) {
          try {
            confetti({
              particleCount: 100,
              spread: 80,
              origin: { y: 0.6 },
            });
          } catch {
            // A celebration is never worth an unhandled error.
          }
        }

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
        track('code_redeemed', { source: 'activation_code', count: grantedMonths });

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
        <BackButton onBack={onBack} />
        <span className="font-arabic font-bold text-sm text-text-secondary">عضوية Katzu Pro</span>
        <div className="w-10" />
      </div>

      <div className="flex flex-col items-center text-center my-auto">
        <KatzuMascot name="badge" glow className="w-28 h-28 mb-3" />

        <h2 className="text-2xl font-bold font-arabic mb-2">أطلق العنان لقدراتك مع Pro</h2>

        {/* Status first: a learner must be able to see what they already have
            before being sold anything. */}
        <Card className="w-full p-3.5 mb-4 bg-surface-card border-border-subtle text-start">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-arabic font-bold text-text-secondary">
              <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
              حالة الاشتراك
            </span>
            <span
              className={`text-micro font-arabic font-bold px-2 py-0.5 rounded-full ${
                user?.isSubscriptionActive
                  ? 'bg-status-success/20 text-status-success'
                  : 'bg-surface-subtle text-text-secondary border border-border-subtle'
              }`}
            >
              {user?.isSubscriptionActive ? 'Pro نشط' : 'الحساب المجاني'}
            </span>
          </div>
          <p className="mt-2 text-micro font-arabic text-text-secondary leading-relaxed">
            {user?.isSubscriptionActive
              ? user.subscriptionExpiresAt
                ? `ينتهي الاشتراك في ${new Date(user.subscriptionExpiresAt).toLocaleDateString('ar')} — يمكنك تفعيل كود جديد في أي وقت لإضافة المدة.`
                : 'اشتراكك نشط بدون تاريخ انتهاء محدد.'
              : freeSessionsCopy(freeSessions)}
          </p>
          <p className="mt-2 text-micro font-arabic text-text-muted leading-relaxed">
            الدفع يتم على صفحة الشراء الرسمية، ثم تُفعّل الكود هنا. لا نحتفظ بأي بيانات بطاقة في التطبيق.
          </p>
        </Card>

        {/* The fast path for someone who already paid: straight to the input. */}
        <a
          href="#redeem-code"
          className="w-full mb-4 h-11 rounded-2xl border border-primary/40 bg-primary/10 text-primary text-xs font-bold font-arabic flex items-center justify-center gap-2 "
        >
          <KeyRound className="w-3.5 h-3.5" aria-hidden />
          اشتريت كوداً بالفعل؟ فعّله الآن
        </a>
        <p className="text-xs text-text-secondary font-arabic mb-5 max-w-xs leading-relaxed">
          محادثات ذكية بلا حدّ على عدد الجلسات، مع تصحيح فوري للنطق والقواعد لجميع المستويات (A0 - B2).
        </p>

        {/* Feature Highlights */}
        <div className="w-full space-y-2 mb-5 text-start">
          {[
            'محادثات صوتية بلا حدّ جلسات مع كَاتْزُو بالذكاء الاصطناعي',
            'فتح كامل مسار المستويات الواقعية من A0 إلى B2',
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

        <p className="w-full mb-4 text-micro font-arabic text-text-muted leading-relaxed text-center">
          نطبّق حدّاً عادلاً للاستخدام يحمي الخدمة من الإساءة، ولا يمسّ الاستخدام اليومي العادي.
        </p>

        {/* Account Link Status */}
        {user?.email && (
          <div className="w-full p-3 mb-4 rounded-xl bg-surface-card border border-border-subtle text-xs flex items-center justify-between text-start font-arabic">
            <div className="flex items-center gap-2 text-text-secondary">
              <UserCheck className="w-4 h-4 text-status-success flex-shrink-0" />
              <span>الحساب المتصل: <span className="font-mono text-text-primary font-bold">{user.email}</span></span>
            </div>
            <span className="text-micro px-2 py-0.5 rounded-full bg-status-success/20 text-status-success font-bold">
              Google ✓
            </span>
          </div>
        )}

        {/* Referral Code Claim (new accounts, pre-purchase) */}
        {!user?.isSubscriptionActive && (
          <Card className="w-full p-4 bg-surface-card border-status-learning/40 text-start mb-4">
            <label className="flex items-center gap-1.5 text-xs font-bold text-text-secondary mb-2 font-arabic">
              <Gift className="w-3.5 h-3.5 text-status-learning" />
              كود إحالة من صديق؟ (اختياري)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                aria-label="كود إحالة من صديق"
                placeholder="REF-XXXXXXXX"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                dir="ltr"
                className="flex-1 h-11 bg-black border border-border-subtle focus:border-status-learning rounded-xl px-3 text-xs font-mono font-bold uppercase tracking-wider text-status-learning"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!referralCode.trim()}
                onClick={async () => {
                  setReferralMessage(null);
                  const activeToken = user?.sessionToken?.trim();
                  if (!user?.isLoggedIn || !activeToken) {
                    setReferralMessage({ kind: 'error', text: 'يلزم تسجيل الدخول بحساب Google أولاً.' });
                    return;
                  }
                  const result = await workerClient.claimReferral(referralCode, activeToken);
                  setReferralMessage(
                    result.success
                      ? { kind: 'success', text: 'تم ربط حسابك بكود الإحالة ✓ بعد أول اشتراك سيحصل صديقك على شهر Pro.' }
                      : { kind: 'error', text: result.error || 'تعذر تطبيق كود الإحالة.' },
                  );
                }}
              >
                ربط
              </Button>
            </div>
            {referralMessage && (
              <div
                className={`mt-2.5 p-2 rounded-lg text-micro font-semibold ${
                  referralMessage.kind === 'success'
                    ? 'bg-status-success/15 border border-status-success/30 text-status-success'
                    : 'bg-status-error/15 border border-status-error/30 text-status-error'
                }`}
              >
                {referralMessage.text}
              </div>
            )}
          </Card>
        )}

        {/* Where a code comes from: the separate sales site (cards/crypto + local
            Syria payment). The app never takes a payment itself. */}
        <Card className="w-full p-4 bg-surface-subtle border-primary/30 text-start mb-4">
          <label className="flex items-center gap-1.5 text-xs font-bold text-text-secondary mb-2 font-arabic">
            <ShoppingCart className="w-3.5 h-3.5 text-primary" />
            لا تملك كود تفعيل بعد؟
          </label>
          <p className="text-micro text-text-secondary font-arabic leading-relaxed mb-3">
            اشترِ كوداً من صفحة الشراء الرسمية بـ {priceLabel} — الدفع بالبطاقة أو العملات الرقمية،
            وللمقيمين في سوريا خيارات الدفع المحلي (سيرياتيل كاش، MTN كاش، حوالة بنكية). يصل الكود
            إليك مباشرة ثم تفعّله هنا.
          </p>
          <div className="flex gap-2">
            <a
              href={buildSalesUrl(referralCode)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('purchase_clicked', { source: 'subscription_screen' })}
              className="flex-1 h-11 rounded-2xl bg-fill text-on-fill text-xs font-bold font-arabic flex items-center justify-center gap-1.5 pointer-hover:opacity-90 transition-opacity"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              اشترِ كود تفعيل الآن
            </a>
          </div>
          <div className="mt-2 text-micro text-text-muted font-mono break-all text-center" dir="ltr">
            {SALES_URL}
          </div>
        </Card>

        {/* Activation Code Redemption Box */}
        <Card id="redeem-code" className="w-full p-4 bg-surface-subtle border-border-subtle text-start mb-4 scroll-mt-24">
          <label className="flex items-center gap-1.5 text-xs font-bold text-text-secondary mb-2 font-arabic">
            <KeyRound className="w-3.5 h-3.5 text-primary" />
            هل لديك كود تفعيل؟ (مثال: DE-1M-...)
          </label>
          <form onSubmit={handleRedeem} className="flex gap-2">
            <input
              type="text"
              aria-label="كود تفعيل الاشتراك"
              placeholder="DE-6M-A1B2C3D4-E5F6G7H8"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="flex-1 h-11 bg-surface-card border border-border-subtle focus:border-primary rounded-xl px-3 text-xs font-mono font-bold uppercase tracking-wider text-cyan-300"
            />
            <Button type="submit" size="sm" isLoading={isLoading} disabled={!code.trim()}>
              تفعيل
            </Button>
          </form>

          {errorMessage && (
            <div
              role="alert"
              className="mt-2.5 p-2 rounded-lg bg-status-error/15 border border-status-error/30 text-status-error text-micro font-semibold flex items-center gap-1.5"
            >
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div
              role="status"
              aria-live="polite"
              className="mt-2.5 p-2 rounded-lg bg-status-success/15 border border-status-success/30 text-status-success text-micro font-semibold flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </Card>

        {/* Plans info */}
        <p className="w-full mb-3 text-center text-micro text-text-muted font-arabic">
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
