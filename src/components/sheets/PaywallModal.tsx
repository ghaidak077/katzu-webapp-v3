import React from 'react';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Sparkles, Check, KeyRound, ArrowRight } from 'lucide-react';
import { PRO_PRICE_LABEL, SALES_URL } from '@/lib/utils/links';

export interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  title?: string;
  description?: string;
}

export const PaywallModal: React.FC<PaywallModalProps> = ({
  isOpen,
  onClose,
  onUpgrade,
  title = 'أكمل رحلتك مع Katzu Pro',
  description = 'لقد استنفدت الجلسات التجريبية المجانية. رَقِّ حسابك الآن لخوض محادثات غير محدودة مع الذكاء الاصطناعي.',
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="عضوية Katzu Pro">
      <div className="flex flex-col items-center text-center p-2">
        <KatzuMascot name="badge" glow className="w-24 h-24 mb-3" />

        <h3 className="text-xl font-bold font-arabic text-text-primary mb-2">
          {title}
        </h3>

        <p className="text-xs text-text-secondary font-arabic mb-5 leading-relaxed max-w-xs">
          {description}
        </p>

        {/* Pro Benefits */}
        <div className="w-full space-y-2 mb-6 text-start">
          {[
            'محادثات صوتية غير محدودة وبدون حد يومي',
            'فتح كافة السيناريوهات من المستوى A1 حتى B2',
            'تصحيح فوري فائق الدقة وشرح القواعد بالعربية',
            'توليد تلميحات ذكية مخصصة لكل خطوة في المحادثة',
          ].map((benefit, i) => (
            <div
              key={i}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-subtle border border-border-subtle text-xs font-semibold"
            >
              <div className="w-4 h-4 rounded-full bg-status-success/20 text-status-success flex items-center justify-center flex-shrink-0">
                <Check className="w-3 h-3" />
              </div>
              <span>{benefit}</span>
            </div>
          ))}
        </div>

        {/* Upgrade & Redeem Action */}
        <div className="w-full space-y-2.5">
          <Button
            size="lg"
            className="w-full shadow-glow-purple flex items-center justify-center gap-2 font-bold font-arabic"
            onClick={() => {
              onClose();
              onUpgrade();
            }}
          >
            <Sparkles className="w-4 h-4" />
            ترقية الحساب أو تفعيل كود
          </Button>

          <a
            href={SALES_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="w-full py-1 flex items-center justify-center gap-1.5 text-[11px] font-arabic text-text-secondary hover:text-primary transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5" />
            شراء كود تفعيل ({PRO_PRICE_LABEL}) — دفع بالبطاقة أو بالعملات الرقمية أو دفع محلي في سوريا
          </a>

          <button
            onClick={onClose}
            className="w-full py-2 text-xs font-semibold text-text-muted hover:text-text-secondary transition-colors"
          >
            ربما لاحقاً
          </button>
        </div>
      </div>
    </Modal>
  );
};
