import React from 'react';
import { ChevronLeft, Sparkles } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { KatzuPresence, type KatzuState } from '@/components/v2/KatzuPresence';
import { freeSessionsCopy } from '@/lib/entitlement/trialCopy';
import type { CEFRLevel } from '@/types/models';

/**
 * «المزيد» — everything the guided home keeps out of the way, one tap away.
 *
 * The guided home (`guidedHome`) shows the hero, the chapter's path and the day's
 * tasks, and nothing else. That trim is only defensible if the six blocks it
 * removed are still *reachable*, so this sheet is where they live: the footer
 * chips, the review row, the earned/goal card, the weekly recap, the Pro offer
 * and the preferences edit. Nothing was deleted from the product — only moved
 * behind one quiet entry point.
 *
 * Three rules this file keeps:
 *
 *  1. It decides nothing. Every gate (is there a review due, is a session done,
 *     may the Pro offer be shown, is there a recap) is computed on the home
 *     screen from recorded evidence and passed in already answered. A sheet that
 *     re-derived them could disagree with the screen behind it.
 *  2. It renders no empty row. A learner on day 0 sees «تابع التعلّم», the goal
 *     card and «تفضيلاتك» — not a review row for cards they have never made and
 *     not a recap of a week they have not started.
 *  3. Every row is one tap, 44px tall, and closes the sheet before it navigates,
 *     so a learner never lands on a new screen with a sheet still over it.
 */
export interface JourneyMoreCapability {
  /** The scenario whose capability was earned — the card's subject. */
  titleAr: string;
  /** «مستقلة» / «محفوظة», from `CAPABILITY_LABEL_AR`. */
  labelAr: string;
}

export interface JourneyMoreRecap {
  headlineAr: string;
  topScenarioTitle?: string;
}

export interface JourneyMoreSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLibrary: () => void;
  onOpenReview: () => void;
  onOpenSubscription: () => void;
  onOpenGrammar?: () => void;
  onOpenListening?: () => void;
  onOpenWriting?: () => void;
  onOpenCoach?: () => void;
  /** The preferences edit the old home nag pointed at (`/onboarding?mode=edit`). */
  onOpenPreferences?: () => void;
  /**
   * Items the SRS says are due now, or 0 to hide the row. The home screen passes
   * 0 on day 0, where due cards can exist (a demo visitor) but nothing has been
   * finished yet, so a review list would be an empty promise.
   */
  reviewDueCount: number;
  /** Katzu's one line, when a real state produced it. */
  katzuLineAr?: string;
  katzuState?: KatzuState;
  /** The most recent genuinely earned capability, or null. */
  capability: JourneyMoreCapability | null;
  /** This week, when it actually has something in it. */
  recap: JourneyMoreRecap | null;
  learnerLevel: CEFRLevel;
  isPro: boolean;
  /**
   * The Worker's trial ledger, as last reconciled. `null`/undefined is "not
   * known right now", which `freeSessionsCopy` says out loud — it never prints a
   * stale local number as if the server had confirmed it.
   */
  freeSessionsRemaining: number | null | undefined;
  /** `shouldOfferPro(...)` — false on day 0 and for a Pro learner. */
  proOfferVisible: boolean;
  /** True when the learner has never answered the preferences questions. */
  preferencesIncomplete: boolean;
}

/** One tap target. 44px floor, name-first, chevron trailing (RTL: points in). */
const Row: React.FC<{
  label: string;
  hint?: string;
  testId?: string;
  onClick: () => void;
}> = ({ label, hint, testId, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={testId}
    className="flex min-h-touch w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-start transition-colors pointer-hover:bg-white/[0.04]"
  >
    <span className="min-w-0">
      <span className="kz-ar-caption block text-kz-ink">{label}</span>
      {hint ? <span className="kz-ar-micro block text-kz-inkFaint">{hint}</span> : null}
    </span>
    <ChevronLeft className="h-4 w-4 shrink-0 text-kz-inkFaint" aria-hidden />
  </button>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-4 first:mt-0">
    <p className="kz-ar-micro mb-1 px-3 text-kz-inkFaint">{title}</p>
    <div className="divide-y divide-white/[0.06]">{children}</div>
  </section>
);

export const JourneyMoreSheet: React.FC<JourneyMoreSheetProps> = ({
  isOpen,
  onClose,
  onOpenLibrary,
  onOpenReview,
  onOpenSubscription,
  onOpenGrammar,
  onOpenListening,
  onOpenWriting,
  onOpenCoach,
  onOpenPreferences,
  reviewDueCount,
  katzuLineAr,
  katzuState = 'journey',
  capability,
  recap,
  learnerLevel,
  isPro,
  freeSessionsRemaining,
  proOfferVisible,
  preferencesIncomplete,
}) => {
  // Close first, then navigate: the sheet must not still be mounted over the
  // screen it opened, and the close is what the learner's tap means.
  const go = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="المزيد">
      <div className="pb-2">
        {/* Katzu's line. It was one of the six blocks the guided home removed, so
            it is moved here rather than dropped — the mascot is what makes it
            read as a line about *this* learner, not a system notice. */}
        {katzuLineAr ? (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <KatzuPresence state={katzuState} size="sm" className="shrink-0" />
            <p className="kz-ar-caption min-w-0 flex-1 pt-1 text-kz-inkDim">{katzuLineAr}</p>
          </div>
        ) : null}

        <Section title="تابع التعلّم">
          <Row label="كل المشاهد والمستويات" hint="كل المواقف، مرتّبة بالمستوى" testId="more-library" onClick={go(onOpenLibrary)} />
          {onOpenGrammar && (
            <Row label="القواعد" hint="قاعدة واحدة في كل مرة، مع تمرين قصير" testId="more-grammar" onClick={go(onOpenGrammar)} />
          )}
          {onOpenListening && (
            <Row label="الاستماع" hint="تدرّب على فهم الألمانية المنطوقة" testId="more-listening" onClick={go(onOpenListening)} />
          )}
          {onOpenWriting && (
            <Row label="الكتابة" hint="اكتب سطوراً قصيرة وتُصحَّح" testId="more-writing" onClick={go(onOpenWriting)} />
          )}
          {onOpenCoach && (
            <Row label="المدرّب" hint="اسأل عن أي شيء في الألمانية" testId="more-coach" onClick={go(onOpenCoach)} />
          )}
        </Section>

        {/* Review is an obligation, not a tour: it appears once the learner has
            something real to review. `reviewDueCount` is 0 on day 0 by
            construction (`firstSessionDone` on the home screen), so this row
            cannot show up before a single finished conversation. It is listed
            even when the hero is today's review: a menu with a hole in it is
            how a learner concludes the queue is gone. */}
        {reviewDueCount > 0 && (
          <Section title="المراجعة">
            <Row
              label={`مراجعة مستحقة: ${reviewDueCount}`}
              hint="البطاقات جاهزة على جهازك وتعمل بدون اتصال"
              testId="more-review"
              onClick={go(onOpenReview)}
            />
          </Section>
        )}

        <Section title="تقدّمك">
          {/* The evidence gate lives here, not in the wording: `capability` is
              built from INDEPENDENT/RETAINED states only, so an unearned card
              cannot reach this slot. With nothing earned the slot shows the
              chapter's goal instead — motivation, not a claim. */}
          {capability ? (
            <div className="rounded-xl p-3" data-testid="capability-card">
              <p className="kz-ar-micro kz-earned-text mb-1">قدرة مكتسبة · {capability.labelAr}</p>
              <p className="kz-ar-caption text-kz-ink">
                تستطيع التعامل مع «{capability.titleAr}» بالألمانية بدون مساعدة.
              </p>
            </div>
          ) : (
            <div className="rounded-xl p-3" data-testid="chapter-goal-card">
              <p className="kz-ar-micro mb-1 text-kz-inkDim">هدفك في هذا الفصل</p>
              <p className="kz-ar-caption text-kz-ink">
                أنهِ مشاهد هذا الفصل لتتقن التعامل مع موقفه بالألمانية بدون مساعدة.
              </p>
            </div>
          )}
          {recap && (
            <div className="rounded-xl p-3" data-testid="weekly-recap-card">
              <p className="kz-ar-micro mb-1 text-kz-inkDim">أسبوعك في كَاتْزُو</p>
              <p className="kz-ar-caption text-kz-ink">{recap.headlineAr}</p>
              {recap.topScenarioTitle ? (
                <p className="kz-ar-micro mt-1 text-kz-inkFaint">أكثر مشهد زرته: {recap.topScenarioTitle}</p>
              ) : null}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 px-3 py-2" data-testid="journey-level-line">
            <span className="kz-ar-micro text-kz-inkDim">مستواك الحالي</span>
            <span className="kz-ar-micro text-kz-ink">{learnerLevel}</span>
          </div>
        </Section>

        <Section title="حسابك وخطتك">
          {/* Always visible, and only ever the Worker's own number: the free
              conversations are a server ledger, so this says "not known right
              now" rather than printing a local guess as a balance. */}
          <div className="px-3 py-2">
            <p className="kz-ar-micro text-kz-inkDim">
              {isPro ? 'عضوية Pro نشطة — كل المستويات وجلسات بلا حدود.' : freeSessionsCopy(freeSessionsRemaining)}
            </p>
          </div>
          {isPro ? (
            <Row label="إدارة الاشتراك" hint="الفوترة والتجديد" testId="more-manage-plan" onClick={go(onOpenSubscription)} />
          ) : proOfferVisible ? (
            <Row
              label="Katzu Pro"
              hint="يفتح بقية المستويات حتى B2"
              testId="more-pro"
              onClick={go(onOpenSubscription)}
            />
          ) : null}
        </Section>

        {onOpenPreferences && (
          <Section title="تفضيلاتك">
            <Row
              label={preferencesIncomplete ? 'أكمل تفضيلاتك (30 ثانية)' : 'تفضيلاتي'}
              hint="هدفك ووقتك ومستواك — تغييرها يغيّر مهمة اليوم"
              testId="more-preferences"
              onClick={go(onOpenPreferences)}
            />
          </Section>
        )}

        {/* The one thing this sheet cannot offer: a Pro learner's invoice is a
            browser page, not a screen in the app. Said quietly, and only where
            someone would look for it. */}
        <p className="kz-ar-micro mt-4 flex items-center gap-1.5 px-3 text-kz-inkFaint">
          <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
          كل ما تعلّمته يبقى على جهازك.
        </p>
      </div>
    </BottomSheet>
  );
};
