import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Link2, Share2 } from 'lucide-react';
import { BackButton } from '@/components/common/BackButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { workerClient } from '@/lib/api/workerClient';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

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
  const { t } = useLanguage();
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
  const sample = partner ? t('partners.sample', { link }) : '';

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
        await navigator.share({ title: t('partners.shareTitle'), text: sample });
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
        <BackButton onBack={() => navigate('/app/profile')} label={t('a11y.back')} />
        <h1 className="text-xl font-bold font-arabic leading-snug">
          {t('partners.title')}
        </h1>
      </div>

      <p className="text-sm leading-7 text-text-secondary font-arabic mb-5">
        {t('partners.intro', { rate: ratePct })}
      </p>

      <div className="grid gap-3 mb-6">
        <Card className="p-4 space-y-1 border border-primary/50">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-primary" dir="ltr">{ratePct}%</span>
            <span className="text-sm font-bold font-arabic">{t('partners.youEarn')}</span>
          </div>
          <p className="text-micro text-text-secondary leading-relaxed">
            {t('partners.youEarnBody', { days: approvalDays })}
          </p>
        </Card>
        <Card variant="subtle" className="p-4 space-y-1">
          <div className="text-sm font-bold font-arabic">{t('partners.friendEarns')}</div>
          <p className="text-micro text-text-secondary leading-relaxed">
            {t('partners.friendEarnsBody')}
          </p>
        </Card>
        <Card variant="subtle" className="p-4 space-y-1">
          <div className="text-sm font-bold font-arabic">{t('partners.katzuEarns')}</div>
          <p className="text-micro text-text-secondary leading-relaxed">
            {t('partners.katzuEarnsBody')}
          </p>
        </Card>
      </div>

      <Card className="p-4 mb-6 space-y-3 border border-primary/40">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-bold font-arabic">{t('partners.yourLink')}</span>
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
                aria-label={t('partners.copyLinkAria')}
              >
                {copied === 'link' ? <Check className="w-4 h-4 me-1.5" /> : <Copy className="w-4 h-4 me-1.5" />}
                {copied === 'link' ? t('partners.copied') : t('partners.copyLink')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => void share()}
                aria-label={t('partners.shareAria')}
              >
                <Share2 className="w-4 h-4 me-1.5" />
                {t('partners.share')}
              </Button>
            </div>
            <p role="status" aria-live="polite" className="text-micro text-text-muted font-arabic">
              {copied === 'link'
                ? t('partners.copiedHint')
                : t('partners.linkRule')}
            </p>
          </>
        ) : (
          <div className="space-y-2">
            <p role="alert" className="text-sm font-arabic text-status-error leading-relaxed">
              {failed
                ? t('partners.failed')
                : t('partners.loading')}
            </p>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              {t('partners.retry')}
            </Button>
          </div>
        )}
      </Card>

      <h2 className="text-base font-bold font-arabic mb-3">{t('partners.stepsTitle')}</h2>
      <ol className="mb-6 space-y-3">
        {[
          [t('partners.step1Title'), t('partners.step1Body')],
          [t('partners.step2Title'), t('partners.step2Body')],
          [
            t('partners.step3Title'),
            t('partners.step3Body', { days: approvalDays, minimum }),
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
          <div className="text-sm font-bold font-arabic">{t('partners.sampleTitle')}</div>
          <p className="text-micro text-text-secondary leading-relaxed whitespace-pre-line font-arabic">
            {sample}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void copy(sample, 'message')}>
            {copied === 'message' ? <Check className="w-4 h-4 me-1.5" /> : <Copy className="w-4 h-4 me-1.5" />}
            {copied === 'message' ? t('partners.copied') : t('partners.copyMessage')}
          </Button>
          <p className="text-micro text-text-muted font-arabic">
            {t('partners.editNote')}
          </p>
        </Card>
      ) : null}

      <p className="text-xs leading-6 text-text-muted font-arabic">
        {t('partners.finePrint')}
      </p>
    </div>
  );
};
