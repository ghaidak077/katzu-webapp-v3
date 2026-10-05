import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { GlassCard } from '@/components/glass/GlassCard';
import { GlassButton, PrimaryAction } from '@/components/glass/GlassButton';
import { workerClient } from '@/lib/api/workerClient';
import { track } from '@/lib/analytics/client';
import { SubscriptionRedemptionScreen } from '@/features/auth/SubscriptionRedemptionScreen';
import {
  OFFER_COPY,
  OFFER_ORDER,
  REFUND_TEXT,
  priceLabel,
  type OfferProduct,
} from '@/lib/offers/pricing';

/**
 * The paywall: Exam Pass first, Monthly second, a single mock as a link.
 *
 * WHAT THIS SCREEN REFUSES TO DO
 * It does not decide a price. Every amount comes from `GET /pricing`, which read
 * the learner's country from the request the app already made; if that call fails
 * the screen shows no price and no buy button rather than a guess, because a
 * wrong price is worse than an absent one.
 *
 * It does not make a promise the product cannot keep: no "unlimited", no
 * "lifetime", no guaranteed pass. Where there is a limit it is stated in the
 * card that carries the price, and the refund line is the `{{OWNER_FILL}}`
 * placeholder the owner has to replace before launch (C1 makes that the only
 * thing standing between this screen and a strict launch pass).
 *
 * Ordering is a decision, not a coincidence: the pass is what the free mock is
 * for, the subscription is the comparison that makes the pass look considered,
 * and the one-off mock is the honest entry for someone who only wants one test.
 */

interface PriceRow {
  product: string;
  amountCents: number;
  currency: string;
  group: string;
  cell: number | null;
}

interface PricingAnswer {
  prices?: PriceRow[];
  group?: string;
  unproven?: boolean;
}

export const PaywallScreen: React.FC = () => {
  const navigate = useNavigate();
  const [pricing, setPricing] = useState<PricingAnswer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [overlay, setOverlay] = useState<'purchase' | 'redeem' | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const answer = await workerClient.getPricing();
        if (!cancelled) setPricing(answer);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const priceByProduct = useMemo(() => {
    const map = new Map<string, PriceRow>();
    for (const row of pricing?.prices ?? []) {
      if (row && typeof row.product === 'string') map.set(row.product, row);
    }
    return map;
  }, [pricing]);

  const handleUpgradeClick = useCallback(
    (product: OfferProduct) => {
      // The funnel needs the product and the cell the learner was actually shown,
      // never a guess — B5 reads both off this event.
      track('purchase_clicked', { kind: product, state: pricing?.group || 'standard' });
      setOverlay('purchase');
    },
    [pricing?.group],
  );

  useEffect(() => {
    if (loaded && pricing) {
      track('paywall_view', { kind: pricing.group || 'standard', state: 'offer' });
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

        {OFFER_ORDER.map((product) => {
          const copy = OFFER_COPY[product];
          const label = priceLabel(priceByProduct.get(product));
          const lead = !copy.isLink;
          return (
            <GlassCard key={product}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="kz-ar-caption font-bold">{copy.nameAr}</p>
                  <p className="kz-ar-micro mt-1 text-kz-inkDim">{copy.pitchAr}</p>
                </div>
                {label ? (
                  <p
                    data-testid={`price-${product}`}
                    className={`kz-de-title shrink-0 font-bold ${lead ? 'text-primary' : 'text-kz-lavender'}`}
                  >
                    {label}
                  </p>
                ) : null}
              </div>

              <ul className="mt-3 space-y-1">
                {copy.includesAr.map((line) => (
                  <li key={line} className="kz-ar-micro text-kz-inkDim">
                    — {line}
                  </li>
                ))}
              </ul>

              {copy.fairUseAr ? (
                <p className="kz-ar-micro mt-3 flex items-start gap-1 text-kz-inkFaint">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>{copy.fairUseAr}</span>
                </p>
              ) : null}

              {label ? (
                lead ? (
                  <div className="mt-3">
                    <PrimaryAction onClick={() => handleUpgradeClick(product)}>
                      <span>فعّل بكود</span>
                    </PrimaryAction>
                  </div>
                ) : (
                  <div className="mt-3">
                    <GlassButton onClick={() => handleUpgradeClick(product)}>
                      <span>خذ هذه المحاكاة</span>
                    </GlassButton>
                  </div>
                )
              ) : null}
            </GlassCard>
          );
        })}

        <GlassCard>
          <p className="kz-ar-micro text-kz-inkFaint">
            {/* Placeholder on purpose: the app must not invent a refund promise. */}
            سياسة الاسترداد: {REFUND_TEXT}
          </p>
          <p className="kz-ar-micro mt-2 text-kz-inkFaint">
            التفعيل يتم عبر كود مرتبط بحسابك الموثّق — لا تُدخل أي بيانات بطاقة داخل التطبيق.
          </p>
        </GlassCard>

        {overlay === 'purchase' ? (
          <GlassCard>
            <p className="kz-ar-caption text-kz-ink">اشترِ الكود من صفحة البيع الرسمية، ثم فعّله هنا.</p>
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