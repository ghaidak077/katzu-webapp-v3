import React, { useEffect, useMemo, useState } from 'react';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Sparkles, Check, KeyRound, ExternalLink } from 'lucide-react';
import { getProPriceLabel, FALLBACK_PRICE_LABEL, buildSalesUrl } from '@/lib/utils/links';
import { track } from '@/lib/analytics/client';

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
  description = 'محادثات صوتية بلا حد، وكل المستويات من A1 إلى B2. ويبقى كل ما تعلّمته — المراجعة والمهمة اليومية وبنك أخطائك — مجانياً دائماً.',
}) => {
  const salesUrl = useMemo(() => buildSalesUrl(referralFromUrl()), []);
  const [priceLabel, setPriceLabel] = useState<string | null>(null);

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
    if (isOpen) track('paywall_viewed', { source: title.slice(0, 64) });
  }, [isOpen, title]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="عضوية Katzu Pro">
      <div className="flex flex-col items-center text-center p-2">
        <KatzuMascot name="badge" glow className="w-24 h-24 mb-3" />

        <Badge variant="primary" size="sm" className="mb-2">
          <Sparkles className="w-3 h-3" aria-hidden />
          {priceLabel ?? FALLBACK_PRICE_LABEL}
        </Badge>

        <h3 className="text-xl font-bold font-arabic text-text-primary mb-2">{title}</h3>
        <p className="text-xs text-text-secondary font-arabic mb-5 leading-relaxed max-w-xs">{description}</p>

        {/* A plain comparison, and nothing else: no countdown, no price framing,
            no promise the product cannot keep ("fluent in 30 days"). */}
        <div className="w-full space-y-2 mb-4 text-start">
          <p className="text-[11px] font-arabic text-text-muted">ما يفتحه Pro:</p>
          {[
            'محادثات صوتية بلا حد بعد الجلسات التجريبية',
            'كل المستويات والمشاهد من A1 إلى B2',
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
          <p className="text-[11px] font-arabic text-status-success font-bold mb-1">ويبقى مجانياً دائماً:</p>
          <p className="text-[11px] font-arabic text-text-secondary leading-relaxed">
            مهمة اليوم، ومراجعة كل ما تعلّمته، والاختبار التحديدي، وبنك أخطائك، ودرسك التجريبي.
            لن نُغلق أمامك ما تعلّمته بالفعل — ولا نطلب منك شيئاً قبل أن تجرّب.
          </p>
        </div>

        <div className="w-full space-y-2.5">
          <a
            href={salesUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              track('purchase_clicked', { source: 'paywall' });
              onClose();
            }}
            className="w-full h-14 rounded-2xl bg-primary text-white font-bold font-arabic flex items-center justify-center gap-2 shadow-glow-purple active:scale-[0.98] transition-all"
          >
            <ExternalLink className="w-4 h-4" aria-hidden />
            اشترِ كود تفعيل Pro
          </a>

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
            className="w-full py-3 text-xs font-semibold font-arabic text-text-muted hover:text-text-secondary min-h-[44px]"
          >
            ليس الآن — تابع بالمجاني
          </button>
        </div>
      </div>
    </Modal>
  );
};
