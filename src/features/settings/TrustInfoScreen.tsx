import React from 'react';
import { Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BackButton } from '@/components/common/BackButton';
import { OWNER_FILL, TRUST_CONTENT, type TrustPage } from '@/lib/trust/content';

/**
 * The trust pages, rendered from fields.
 *
 * No prose lives here any more: every sentence comes from `@/lib/trust/content`,
 * where the parts the app can prove from its own code are derived from the code and
 * the parts only the owner can state are `{{OWNER_FILL}}` placeholders. The strict
 * launch check (`LAUNCH_STRICT=1 npm run check:launch`) fails while any placeholder
 * is standing, so this screen cannot ship an unfinished legal page silently.
 *
 * A placeholder is shown to the learner as an honest gap rather than hidden: the
 * page says what is missing instead of pretending the document is complete.
 */

export type { TrustPage };
export interface TrustInfoScreenProps {
  page: TrustPage;
  onBack: () => void;
}

/** What a visitor reads where the owner's sentence will go. */
const OWNER_PENDING_AR = 'يُكمل هذا البند قبل النشر — لم نكتب هنا وعداً لا نستطيع الوفاء به.';

export const TrustInfoScreen: React.FC<TrustInfoScreenProps> = ({ page, onBack }) => {
  const selected = TRUST_CONTENT[page] ?? TRUST_CONTENT.privacy;
  // The token is imported rather than spelled here: `check:launch` greps shipped
  // source for the literal, and a detector that contains the thing it detects
  // reads as a fifth unfinished page.
  const outstanding = selected.sections.filter((section) => section.bodyAr.includes(OWNER_FILL)).length;

  return (
    <div className="min-h-screen bg-black text-text-primary p-4 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BackButton onBack={onBack} label="العودة" />
        <h1 className="text-xl font-bold font-arabic">{selected.titleAr}</h1>
      </div>
      <Card className="p-5 space-y-4">
        <ShieldCheck className="w-7 h-7 text-primary" />
        <p className="text-xs text-text-muted font-arabic">{selected.updatedAr}</p>
        {selected.sections.map((section) => (
          <section key={section.id}>
            <h2 className="text-sm font-bold font-arabic text-text-primary">{section.headingAr}</h2>
            {section.bodyAr.split(String.fromCharCode(10)).map((line, index) => (
              <p key={`${section.id}-${index}`} className="text-sm leading-7 text-text-secondary font-arabic whitespace-pre-line">
                {/* A visitor never reads the raw token. The count below still
                    names how many sections are unfinished, so a page awaiting the
                    owner's wording says so in words instead of in braces — the
                    same choice B1 made for the paywall's refund line. */}
                {line.includes(OWNER_FILL) ? OWNER_PENDING_AR : line}
              </p>
            ))}
          </section>
        ))}

        {/* An unfinished legal page says so. The strict launch check is what turns
            this into a blocking signal before the store submission. */}
        {outstanding > 0 ? (
          <p className="text-xs leading-6 font-arabic text-status-warning">
            هذه الصفحة غير مكتملة بعد — ينقصها {outstanding} بنداً ينتظر استكمال الناشر.
          </p>
        ) : null}

        {page === 'contact' ? (
          <Button
            className="w-full flex items-center justify-center gap-2"
            onClick={() => {
              window.location.href = 'mailto:support@ghaidak.com';
            }}
          >
            <Mail className="w-4 h-4" />
            إرسال بريد الدعم
          </Button>
        ) : null}
      </Card>
    </div>
  );
};
