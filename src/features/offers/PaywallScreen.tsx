import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { GlassCard } from '@/components/glass/GlassCard';
import { GlassButton, PrimaryAction } from '@/components/glass/GlassButton';
import { track } from '@/lib/analytics/client';
import { haptic } from '@/lib/utils/haptics';
import { SubscriptionRedemptionScreen } from '@/features/auth/SubscriptionRedemptionScreen';
import {
  BEST_VALUE_AR,
  FREE_LESSONS_PER_MONTH,
  PLANS,
  PRICING_FOOTNOTE_AR,
  PRICING_HEADLINE_AR,
  PRICING_RULES_AR,
  RECOMMENDED_PLAN,
  REFUND_TEXT,
  formatUsd,
  type PlanId,
} from '@/lib/offers/pricing';
import { priceRowFor, usePricing } from '@/lib/offers/priceSource';
import { paymentInstructionsFor } from '@/lib/offers/paymentInstructions';

/**
 * The paywall: four founding-price plans, one offer.
 *
 * WHAT THIS SCREEN REFUSES TO DO
 * It does not decide a price. Every amount comes from `GET /pricing`, which
 * reads `pricing.config.json`; if that call fails the screen shows no price and
 * no buy button rather than a guess, because a wrong price is worse than an
 * absent one.
 *
 * WHAT IT MUST SHOW, ONCE
 * The founding price, the published future price struck through beside it, and
 * the per-month figure. Under the cards, the three facts a buyer needs before
 * paying: the payment route, the activation promise, and the refund rule. The
 * four rules themselves are printed once, in order, instead of being repeated
 * on every card.
 *
 * The 6-month plan is pre-selected (the panel opens under it) and wears the
 * "Best value" badge — the recommendation is a display decision, never a
 * different price.
 */
export const PaywallScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fromMock = useMemo(
    () => new URLSearchParams(location.search).get('from') === 'mock',
    [location.search],
  );
  const [overlay, setOverlay] = useState<'purchase' | 'redeem' | null>(null);
  // Pre-selected: the plan the badge points at. The panel opens under the card
  // the learner tapped, not at the bottom of the list.
  const [activeProduct, setActiveProduct] = useState<PlanId | null>(null);

  // The same one-call source the modal, the landing page and the redemption
  // screen read, so four surfaces cannot quote four different amounts.
  const { pricing, loaded, group, priceFor } = usePricing();

  const instructions = useMemo(() => paymentInstructionsFor(group), [group]);

  const handleUpgradeClick = useCallback(
    (product: PlanId) => {
      // A plain acknowledgement that the tap landed — `select`, never `success`:
      // nothing has been bought yet.
      haptic('select');
      track('upgrade_click', {
        kind: product,
        region: group || 'standard',
      });
      track('purchase_clicked', { kind: product, state: group || 'standard' });
      setActiveProduct(product);
      setOverlay('purchase');
    },
    [group],
  );

  useEffect(() => {
    if (overlay === null) return;
    document.getElementById('paywall-panel')?.scrollIntoView({ block: 'nearest' });
  }, [overlay, activeProduct]);

  useEffect(() => {
    if (loaded && pricing) {
      track('paywall_view', {
        kind: pricing.group || 'standard',
        region: pricing.group || 'standard',
      });
    }
  }, [loaded, pricing]);

  return (
    <div className="min-h-screen bg-black px-4 py-6 text-kz-ink">
      <div className="mx-auto max-w-md space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="kz-ar-title font-bold">الاشتراك</h1>
          <button
            type="button"
            onClick={() => navigate('/app/trail')}
            className="kz-ar-micro min-h-touch rounded-2xl border border-white/10 px-3 py-2 text-kz-inkDim"
          >
            إغلاق
          </button>
        </div>

        <p className="kz-ar-caption font-bold text-primary">{PRICING_HEADLINE_AR}</p>

        {fromMock ? (
          <GlassCard data-testid="paywall-from-mock">
            <p className="kz-ar-caption font-bold text-primary">أكملت محاكاة B1 الشفوية</p>
            <p className="kz-ar-micro mt-1 text-kz-inkDim">
              الاشتراك يفتح لك التقرير الكامل بجميع التصحيحات، ومحادثات B1 الواقعية، ومحاكاة جديدة متى شئت لتقارن تقديرك التدريبي قبل موعدك.
            </p>
          </GlassCard>
        ) : null}

        {!loaded ? (
          <p className="kz-ar-caption text-kz-inkDim">جارٍ تحميل الأسعار…</p>
        ) : null}

        {loaded && !pricing ? (
          /* No price, no button. The learner is told why, and the mock link still
             works because it costs nothing to look at. */
          <GlassCard>
            <p className="kz-ar-caption text-kz-inkDim">
              تعذّر تحميل الأسعار الآن. لن نعرض رقماً لا نعرفه — أعد المحاولة قليلاً.
            </p>
            <div className="mt-3">
              <GlassButton onClick={() => navigate('/mock')}>
                <span>جرّب محاكاة B1 المجانية بدلاً من ذلك</span>
              </GlassButton>
            </div>
          </GlassCard>
        ) : null}

        {PLANS.map((plan) => {
          const row = priceRowFor(pricing, plan.id);
          const label = priceFor(plan.id);
          const future = row?.futureCents ?? plan.futureCents;
          const perMonth = row?.amountCents
            ? Math.round(row.amountCents / Math.max(1, row.months ?? plan.months))
            : plan.perMonthCents;
          const recommended = row?.recommended ?? plan.recommended;
          const selected = activeProduct === plan.id;
          return (
            <React.Fragment key={plan.id}>
              <GlassCard
                className={
                  recommended
                    ? 'border-primary/50 ring-1 ring-primary/30'
                    : selected
                      ? 'border-white/20'
                      : undefined
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="kz-ar-caption font-bold">{plan.nameAr}</p>
                    {recommended ? (
                      <span className="kz-ar-micro mt-1 inline-block rounded-full bg-primary/15 px-2 py-0.5 font-bold text-primary">
                        {BEST_VALUE_AR}
                      </span>
                    ) : null}
                  </div>
                  {label ? (
                    <div className="shrink-0 text-end">
                      <p
                        data-testid={`price-${plan.id}`}
                        className="kz-de-title font-bold text-primary"
                      >
                        {label}
                      </p>
                      <p className="kz-ar-micro text-kz-inkFaint">
                        <span className="line-through">{formatUsd(future)}</span> بعد انتهاء العرض
                      </p>
                      {plan.months > 1 ? (
                        <p className="kz-ar-micro text-kz-inkDim">
                          {formatUsd(perMonth)} شهرياً
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {label ? (
                  <div className="mt-3">
                    <PrimaryAction onClick={() => handleUpgradeClick(plan.id)}>
                      <span>اختر هذه الباقة</span>
                    </PrimaryAction>
                  </div>
                ) : null}
              </GlassCard>

              {activeProduct === plan.id && overlay ? (
                <div id="paywall-panel" className="space-y-3">
                  {overlay === 'purchase' ? (
                    <GlassCard>
                      {/* The steps are written for the region the SERVER resolved, and
                          say up front which part is outside the app's control. */}
                      <p className="kz-ar-caption font-bold text-kz-ink">{instructions.headingAr}</p>
                      <ol className="mt-2 space-y-1">
                        {instructions.stepsAr.map((step, i) => (
                          <li key={step} className="kz-ar-micro text-kz-inkDim">
                            {`${i + 1}. ${step}`}
                          </li>
                        ))}
                      </ol>
                      {instructions.timingAr ? (
                        <p className="kz-ar-micro mt-3 text-kz-inkFaint">
                          وقت التفعيل: {instructions.timingAr}
                        </p>
                      ) : null}
                      <p className="kz-ar-micro mt-2 text-kz-inkFaint">{instructions.caveatAr}</p>
                      <p className="kz-ar-micro mt-3 text-kz-ink">اشترِ الكود من صفحة البيع الرسمية، ثم فعّله هنا.</p>
                      <div className="mt-3 flex flex-col gap-2">
                        <PrimaryAction onClick={() => setOverlay('redeem')}>
                          <span>لديّ كود — فعّله الآن</span>
                        </PrimaryAction>
                        <GlassButton onClick={() => setOverlay(null)}>
                          <span>لاحقاً</span>
                        </GlassButton>
                      </div>
                    </GlassCard>
                  ) : null}

                  {/* Redemption is the existing code path, untouched: the offer screen only
                      decides whether to show it. */}
                  {overlay === 'redeem' ? (
                    <SubscriptionRedemptionScreen
                      onBack={() => setOverlay(null)}
                      onSuccess={() => navigate('/app/trail')}
                      onGoToSignIn={() => navigate('/signin')}
                      onOpenMock={() => navigate('/mock')}
                    />
                  ) : null}
                </div>
              ) : null}
            </React.Fragment>
          );
        })}

        <GlassCard>
          <p className="kz-ar-caption font-bold text-kz-ink">قواعد العرض</p>
          <ol className="mt-2 space-y-1">
            {PRICING_RULES_AR.map((rule, i) => (
              <li key={rule} className="kz-ar-micro text-kz-inkDim">
                {`${i + 1}. ${rule}`}
              </li>
            ))}
          </ol>
        </GlassCard>

        <GlassCard>
          <p className="kz-ar-micro text-kz-inkDim">{PRICING_FOOTNOTE_AR}</p>
          <p className="kz-ar-micro mt-2 flex items-start gap-1 text-kz-inkFaint">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>{REFUND_TEXT}</span>
          </p>
          <p className="kz-ar-micro mt-2 text-kz-inkFaint">
            {`المجاني يبقى: ${FREE_LESSONS_PER_MONTH} دروس بالذكاء الاصطناعي كل شهر، والمهمة اليومية، ومراجعة أخطائك.`}
          </p>
          <p className="kz-ar-micro mt-2 text-kz-inkFaint">
            التفعيل يتم عبر كود مرتبط بحسابك الموثّق — لا تُدخل أي بيانات بطاقة داخل التطبيق.
          </p>
        </GlassCard>

        <div className="flex flex-col gap-2 pt-1">
          <GlassButton onClick={() => navigate('/mock')}>
            <span>جرّب محاكاة B1 مجاناً أولاً</span>
          </GlassButton>
          <button
            type="button"
            onClick={() => navigate('/app/trail')}
            className="kz-ar-micro min-h-touch text-kz-inkDim"
          >
            المتابعة بالحساب المجاني
          </button>
        </div>
      </div>
    </div>
  );
};
