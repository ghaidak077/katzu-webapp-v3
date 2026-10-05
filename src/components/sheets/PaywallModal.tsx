import React, { useEffect, useMemo, useState } from 'react';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Sparkles, Check, KeyRound, ExternalLink } from 'lucide-react';
import { buildSalesUrl, legalPageUrl } from '@/lib/utils/links';
import { OFFER_COPY } from '@/lib/offers/pricing';
import { usePricing } from '@/lib/offers/priceSource';
import { track } from '@/lib/analytics/client';

/**
 * The two offers the server actually sells, in the order they are worth reading.
 *
 * `pass90` is the 3-month pass and leads: it is the product the free B1 mock is
 * a sample of. `monthly` is the comparison that makes the pass look considered.
 * There is no annual and no student tier here, and there is no env toggle to
 * reveal one: `/pricing` has never priced them, so there is nothing to reveal.
 * Inventing a third card would be inventing an offer.
 */
const OFFERED_TIERS = [
  { product: 'pass90', nameAr: OFFER_COPY.pass90.nameAr, recommended: true },
  { product: 'monthly', nameAr: OFFER_COPY.monthly.nameAr, recommended: false },
] as const;

export interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Opens the in-app subscription screen (status + code redemption). */
  onUpgrade: () => void;
  /** The feature the learner ran into, in Arabic. */
  title?: string;
  /** Why it matters, in the learner's terms. */
  description?: string;
}

/** Referral attribution survives the trip to the sales site. */
function referralFromUrl(): string {
  try {
    return (new URLSearchParams(window.location.search).get('ref') || '').toUpperCase();
  } catch {
    return '';
  }
}

/**
 * One paywall component for every gate in the app.
 *
 * The old modal appeared with different reasoning in different places and its
 * primary button was labelled "upgrade or activate a code" — two different jobs
 * behind one button, and no statement of what the learner keeps for free. A
 * learner who hits a wall must be able to answer three questions in one screen:
 * what is this, why does it matter, and what can I still do without paying.
 */
export const PaywallModal: React.FC<PaywallModalProps> = ({
  isOpen,
  onClose,
  onUpgrade,
  title = 'ما يفتحه Pro — وما يبقى مجانياً',
  description = 'محادثات صوتية بلا حدّ جلسات، وكل المستويات من A0 إلى B2. ويبقى كل ما تعلّمته — المراجعة والمهمة اليومية وبنك أخطائك — مجانياً دائماً.',
}) => {
  const salesUrl = useMemo(() => buildSalesUrl(referralFromUrl()), []);
  // The one price table. No amount is rendered from anything else, and no buy
  // control appears without one: if the server cannot be reached the learner is
  // told so, which is better than a price the app made up.
  const { loaded, headline, priceFor } = usePricing();

  useEffect(() => {
    if (isOpen) track('paywall_viewed', { source: title.slice(0, 64) });
  }, [isOpen, title]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="عضوية Katzu Pro">
      <div className="flex flex-col items-center text-center p-2">
        <KatzuMascot name="badge" glow className="w-24 h-24 mb-3" />

        {/* The price, or the reason there is none. Never a placeholder number. */}
        <Badge variant="primary" size="sm" className="mb-2">
          <Sparkles className="w-3 h-3" aria-hidden />
          {headline ?? (loaded ? 'السعر غير متاح الآن' : 'جارٍ تحميل السعر…')}
        </Badge>

        {/* Two tiers, both priced by the server, 3-month pass recommended. Each
            card is a link out to the official sales page — the app never takes a
            payment itself. */}
        {loaded && headline ? (
          <div className="w-full grid grid-cols-2 gap-2 mb-4">
            {OFFERED_TIERS.map((tier) => {
              const amount = priceFor(tier.product);
              return (
                <a
                  key={tier.product}
                  href={salesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track('purchase_clicked', { source: `paywall_plan_${tier.product}` })}
                  className={`relative flex flex-col items-center gap-0.5 p-2.5 min-h-[44px] rounded-xl bg-surface-subtle border transition-colors border-border-subtle pointer-hover:border-primary/50 ${tier.recommended ? 'border-primary' : ''}`}
                >
                  {tier.recommended && (
                    <span className="absolute -top-2 end-2 px-1.5 py-0.5 rounded-full bg-fill text-on-fill text-micro font-bold font-arabic">
                      موصى به
                    </span>
                  )}
                  <span className="text-micro font-bold font-arabic text-center">{tier.nameAr}</span>
                  {amount ? (
                    <span className="text-sm font-bold text-primary" data-testid={`modal-price-${tier.product}`}>
                      {amount}
                    </span>
                  ) : null}
                </a>
              );
            })}
          </div>
        ) : null}

        <h3 className="text-xl font-bold font-arabic text-text-primary mb-2">{title}</h3>
        <p className="text-xs text-text-secondary font-arabic mb-5 leading-relaxed max-w-xs">{description}</p>

        {/* A plain comparison, and nothing else: no countdown, no price framing,
            no promise the product cannot keep ("fluent in 30 days"). */}
        <div className="w-full space-y-2 mb-4 text-start">
          <p className="text-micro font-arabic text-text-muted">ما يفتحه Pro:</p>
          {[
            'محادثات صوتية بلا حد بعد الجلسات التجريبية',
            'كل المستويات والمشاهد من A0 إلى B2',
            'تغيير الصعوبة أثناء المحادثة وتلميحات إضافية',
          ].map((benefit) => (
            <div
              key={benefit}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-subtle border border-border-subtle text-xs font-semibold"
            >
              <span className="w-4 h-4 shrink-0 rounded-full bg-status-success/20 text-status-success flex items-center justify-center">
                <Check className="w-3 h-3" aria-hidden />
              </span>
              <span className="font-arabic">{benefit}</span>
            </div>
          ))}
        </div>

        {/* What stays free: saying this out loud is what keeps the paywall from
            feeling like a bait-and-switch. */}
        <div className="w-full p-3 rounded-2xl bg-status-success/10 border border-status-success/25 text-start mb-5">
          <p className="text-micro font-arabic text-status-success font-bold mb-1">ويبقى مجانياً دائماً:</p>
          <p className="text-micro font-arabic text-text-secondary leading-relaxed">
            مهمة اليوم، ومراجعة كل ما تعلّمته، والاختبار التحديدي، وبنك أخطائك، ودرسك التجريبي.
            لن نُغلق أمامك ما تعلّمته بالفعل — ولا نطلب منك شيئاً قبل أن تجرّب.
          </p>
        </div>

        <div className="w-full space-y-2.5">
          {/* No server price means no buy control: a "buy" next to a price the
              app cannot name is a dead end, and a price the app invented is a
              worse one. The free path below stays open either way. */}
          {headline ? (
            <a
              href={salesUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                track('purchase_clicked', { source: 'paywall' });
                onClose();
              }}
              className="w-full h-14 rounded-2xl bg-fill text-on-fill font-bold font-arabic flex items-center justify-center gap-2 shadow-glow-purple transition-colors"
            >
              <ExternalLink className="w-4 h-4" aria-hidden />
              اشترِ كود تفعيل Pro
            </a>
          ) : null}

          <Button
            size="md"
            variant="secondary"
            className="w-full"
            onClick={() => {
              onClose();
              onUpgrade();
            }}
          >
            <KeyRound className="w-4 h-4" aria-hidden />
            لديّ كود بالفعل — فعّله الآن
          </Button>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 text-xs font-semibold font-arabic text-text-muted pointer-hover:text-text-secondary min-h-[44px]"
          >
            ليس الآن — تابع بالمجاني
          </button>

          {/* Who is selling to you, and on what terms. These are public routes,
              so a new tab keeps the offer on screen while the learner reads. */}
          <nav
            aria-label="الصفحات القانونية"
            className="flex items-center justify-center gap-1 pt-1 text-micro font-arabic text-text-muted"
          >
            <a
              href={legalPageUrl('privacy')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center min-h-[44px] px-2 underline underline-offset-2 pointer-hover:text-text-secondary"
            >
              سياسة الخصوصية
            </a>
            <span aria-hidden>·</span>
            <a
              href={legalPageUrl('terms')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center min-h-[44px] px-2 underline underline-offset-2 pointer-hover:text-text-secondary"
            >
              شروط الاستخدام
            </a>
          </nav>
        </div>
      </div>
    </Modal>
  );
};
