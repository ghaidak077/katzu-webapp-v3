import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Link2, Share2 } from 'lucide-react';
import { BackButton } from '@/components/common/BackButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { workerClient } from '@/lib/api/workerClient';

/**
 * `/partners` — the signed-in half of the partner programme.
 *
 * WHY THIS SCREEN EXISTS
 * The site's `/affiliate` page explains the programme and then says «احصل على
 * رابطك الآن». Before this screen that button landed on a 404-shaped redirect:
 * the programme was application-only, and a learner who wanted to recommend
 * Katzu had to email support. The link is now created on the first visit, from
 * the account already signed in, so the promise on the page is true.
 *
 * WHAT IT SHOWS
 * The same three facts the site states — 20% of the first subscription, paid
 * 14 days after activation, weekly once $20 is reached — plus the link, a share
 * message the learner may edit, and the fine print. The numbers come from the
 * server (`POST /affiliate/me`), never from a constant in this file, so a change
 * to the programme cannot leave the screen promising an older rate.
 *
 * WHAT IT NEVER DOES
 * It never shows a balance the ledger has not computed, never invents a
 * testimonial, and never promises a visa or an exam result. The sample message is
 * deliberately plain: a person recommending something they use.
 */

const SITE_ORIGIN = 'https://website.katzuai.com';

/** Cents to the words a learner reads, matching the site's own formatting. */
function formatUsd(cents: number): string {
  const whole = Math.floor(cents / 100);
  const rest = Math.round(cents % 100);
  return rest === 0 ? `$${whole}` : `$${whole}.${String(rest).padStart(2, '0')}`;
}

type PartnerInfo = NonNullable<Awaited<ReturnType<typeof workerClient.getPartnerInfo>>>;

export const PartnersScreen: React.FC = () => {
  const navigate = useNavigate();
  const [partner, setPartner] = useState<PartnerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState<'link' | 'message' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const info = await workerClient.getPartnerInfo();
    setPartner(info);
    setFailed(!info);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const link = partner ? `${SITE_ORIGIN}/?ref=${partner.code}` : '';
  const ratePct = partner ? Math.round(partner.rate * 100) : 20;
  const approvalDays = partner?.approvalDays ?? 14;
  const minimum = formatUsd(partner?.minPayoutCents ?? 2000);
  const sample = partner
    ? `أنا أتعلّم الألمانية على كاتزو: دروس قصيرة وتدريب على الكلام مع تصحيح بالعربية.\nجرّبه إن كان يناسب هدفك: ${link}`
    : '';

  const copy = async (text: string, which: 'link' | 'message') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // A refused clipboard is not a failure worth a modal: the field is
      // select-all, so the learner can still copy it by hand.
    }
  };

  const share = async () => {
    if (!partner) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Katzu — تعلّم الألمانية', text: sample });
        return;
      } catch {
        // Cancelled or unsupported: fall through to the clipboard.
      }
    }
    await copy(sample, 'message');
  };

  return (
    <div className="min-h-screen bg-black text-text-primary p-4 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BackButton onBack={() => navigate('/app/profile')} label="العودة" />
        <h1 className="text-xl font-bold font-arabic leading-snug">
          ساعد صديقاً على تحقيق هدفه، واربح معه
        </h1>
      </div>

      <p className="text-sm leading-7 text-text-secondary font-arabic mb-5">
        شارك كاتزو مع من يتعلّم الألمانية أو يستعد للسفر. حين يشترك، يخطو هو نحو هدفه، وتحصل أنت
        على {ratePct}% من أول اشتراك له.
      </p>

      <div className="grid gap-3 mb-6">
        <Card className="p-4 space-y-1 border border-primary/50">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-primary" dir="ltr">{ratePct}%</span>
            <span className="text-sm font-bold font-arabic">تربح أنت</span>
          </div>
          <p className="text-micro text-text-secondary leading-relaxed">
            من أول اشتراك يدفعه صديقك، تُضاف إلى رصيدك بعد {approvalDays} يوماً من التفعيل.
          </p>
        </Card>
        <Card variant="subtle" className="p-4 space-y-1">
          <div className="text-sm font-bold font-arabic">يربح صديقك</div>
          <p className="text-micro text-text-secondary leading-relaxed">
            يتعلّم الألمانية بخطة واضحة ودروس قصيرة وتدريب على الكلام، ويقترب من هدفه خطوة كل يوم.
          </p>
        </Card>
        <Card variant="subtle" className="p-4 space-y-1">
          <div className="text-sm font-bold font-arabic">يربح كاتزو</div>
          <p className="text-micro text-text-secondary leading-relaxed">
            يصل التطبيق إلى من يحتاجه فعلاً، فنستمر في بناء الدروس والتصحيح والتدريب.
          </p>
        </Card>
      </div>

      <Card className="p-4 mb-6 space-y-3 border border-primary/40">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-bold font-arabic">رابطك</span>
        </div>

        {loading ? (
          <div role="status" aria-live="polite" className="h-11 rounded-xl bg-surface-subtle animate-pulse" />
        ) : partner ? (
          <>
            <div
              className="flex items-center justify-center rounded-xl bg-black border border-border-subtle px-3 py-2.5 font-mono text-sm text-primary select-all break-all text-center"
              dir="ltr"
            >
              {link}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={() => void copy(link, 'link')}
                aria-label="انسخ رابط الشراكة"
              >
                {copied === 'link' ? <Check className="w-4 h-4 me-1.5" /> : <Copy className="w-4 h-4 me-1.5" />}
                {copied === 'link' ? 'تم النسخ' : 'انسخ الرابط'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => void share()}
                aria-label="شارك رابط الشراكة"
              >
                <Share2 className="w-4 h-4 me-1.5" />
                شارك
              </Button>
            </div>
            <p role="status" aria-live="polite" className="text-micro text-text-muted font-arabic">
              {copied === 'link'
                ? 'نُسخ الرابط. أرسله لمن تظن أنه يستفيد.'
                : 'كل اشتراك يأتي من هذا الرابط يُحسب لك مرة واحدة، على أول اشتراك فقط.'}
            </p>
          </>
        ) : (
          <div className="space-y-2">
            <p role="alert" className="text-sm font-arabic text-status-error leading-relaxed">
              {failed
                ? 'تعذّر إنشاء رابطك الآن. تحقق من اتصالك ثم أعد المحاولة.'
                : 'جارٍ تجهيز رابطك…'}
            </p>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              أعد المحاولة
            </Button>
          </div>
        )}
      </Card>

      <h2 className="text-base font-bold font-arabic mb-3">ثلاث خطوات</h2>
      <ol className="mb-6 space-y-3">
        {[
          ['افتح التطبيق', 'ادخل إلى «الشركاء» ويظهر رابطك فوراً.'],
          ['شارك مع من يهمّه الأمر', 'أصدقاء وأقارب ومجموعات على واتساب وتلغرام وفيسبوك.'],
          [
            'اربح معه',
            `يدخل رصيدك بعد ${approvalDays} يوماً من تفعيل اشتراكه، وندفع أسبوعياً عند بلوغه ${minimum}.`,
          ],
        ].map(([title, detail], index) => (
          <li key={title} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 border border-primary/50 text-xs font-bold text-primary"
            >
              {index + 1}
            </span>
            <div>
              <div className="text-sm font-bold font-arabic">{title}</div>
              <p className="text-micro text-text-secondary leading-relaxed">{detail}</p>
            </div>
          </li>
        ))}
      </ol>

      {partner ? (
        <Card className="p-4 mb-6 space-y-3">
          <div className="text-sm font-bold font-arabic">رسالة جاهزة</div>
          <p className="text-micro text-text-secondary leading-relaxed whitespace-pre-line font-arabic">
            {sample}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void copy(sample, 'message')}>
            {copied === 'message' ? <Check className="w-4 h-4 me-1.5" /> : <Copy className="w-4 h-4 me-1.5" />}
            {copied === 'message' ? 'تم النسخ' : 'انسخ الرسالة'}
          </Button>
          <p className="text-micro text-text-muted font-arabic">
            عدّلها كما تحب: الصدق أهم من أي صياغة.
          </p>
        </Card>
      ) : null}

      <p className="text-xs leading-6 text-text-muted font-arabic">
        العمولة على أول اشتراك فقط، وتُلغى عند الاسترداد أو الإحالة الذاتية. الدفع عبر USDT أو
        Syriatel/MTN Cash أو تحويل بنكي أو Wise. وصِّ بكاتزو بصدق، دون وعود بتأشيرة أو نتيجة امتحان.
      </p>
    </div>
  );
};
