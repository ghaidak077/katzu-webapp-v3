import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock3, Lock, Sparkles } from 'lucide-react';
import { GlassCard } from '@/components/glass/GlassCard';
import { GlassButton, PrimaryAction } from '@/components/glass/GlassButton';
import { GermanText } from '@/components/common/GermanText';
import { workerClient, type MockExamPart, type MockStartResponse } from '@/lib/api/workerClient';
import { debriefView, estimatePracticeScore, formatPartClock, type MockPartResult } from '@/lib/mockexam/score';
import { buildShareLink, buildShareText } from '@/lib/offers/share';
import { LiveConversationScreen } from '@/features/conversation/LiveConversationScreen';
import { track } from '@/lib/analytics/client';
import type { SessionDebrief } from '@/lib/debrief/debrief';
import type { CEFRLevel } from '@/types/models';

/**
 * The free B1 speaking mock, end to end.
 *
 * WHAT THIS SCREEN IS NOT
 * It is not a scoring machine and it does not pretend to be an exam. It runs
 * three parts — plan together, present a topic, react to questions — on the same
 * live-conversation engine as every other scene, and afterwards shows a number
 * that is explicitly a practice estimate computed from what the learner actually
 * said. There is no pass mark anywhere, and the notice travels with the result.
 *
 * WHO DECIDES WHAT
 * `/mock/start` (before the first part) decides whether this mock is the one free
 * seat, a credit or a paid repeat, and returns the parts, the timings and what the
 * debrief may show. This screen renders that answer; it never widens it. A free
 * learner sees the estimate and the two most useful corrections, and is told how
 * many are locked — not shown a wall of errors as a bribe.
 *
 * The conversation engine borrows a scenario row for the turn's scene, but the
 * worker replaces the persona, the level and the safety category when the grant
 * verifies, so the examiner's behaviour comes from the server, not from here.
 */

/** The scene the engine borrows. The persona is overridden server-side for a mock. */
const MOCK_SCENARIO_ID = 'cafe_order';

interface PartSummary {
  result: MockPartResult;
  debrief: SessionDebrief;
}

export const MockExamScreen: React.FC = () => {
  const navigate = useNavigate();
  // Stable for the life of this screen: it is the idempotency key the server
  // replays, so a re-render or a retry must not look like a second mock.
  const sessionId = useRef(`mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`).current;
  const [claim, setClaim] = useState<MockStartResponse | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [partIndex, setPartIndex] = useState(0);
  const [summaries, setSummaries] = useState<PartSummary[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number>(Date.now());

  const parts: MockExamPart[] = claim?.brief?.parts ?? [];
  const currentPart = parts[partIndex] ?? null;
  const finished = parts.length > 0 && partIndex >= parts.length;

  // One claim per screen. A failed claim never retries by itself: the learner is
  // shown the reason and a route to buy, not a spinner that never resolves.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const answer = await workerClient.startMock(sessionId);
      if (cancelled) return;
      if (!answer.allowed || !answer.brief || !answer.grant) {
        setClaimError(answer.message || 'تعذّر بدء المحاكاة الآن.');
        return;
      }
      setClaim(answer);
      track('mock_start', { kind: answer.source || 'free' });
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // The part clock. It warns and it counts; it never stops the learner talking,
  // because a mock that goes silent at zero teaches nothing.
  useEffect(() => {
    if (!currentPart || finished) return;
    setSecondsLeft(currentPart.seconds);
    setStartedAt(Date.now());
    const tick = window.setInterval(() => {
      setSecondsLeft((current) => (current === null ? null : Math.max(0, current - 1)));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [currentPart, finished]);

  const handlePartComplete = useCallback(
    (summary: {
      scenarioId: string;
      scenarioTitle: string;
      cefrLevel: CEFRLevel;
      sentencesSpoken: number;
      accuracyPercent: number | null;
      durationSeconds: number;
      independentSentences: number;
      assistedSentences: number;
      mistakes: Array<{ original: string; corrected: string; grammarRule: string }>;
      debrief: SessionDebrief;
    }) => {
      setSummaries((previous) => [
        ...previous,
        {
          debrief: summary.debrief,
          result: {
            partIndex: partIndex + 1,
            sentencesSpoken: summary.sentencesSpoken,
            independentSentences: summary.independentSentences,
            accuracyPercent: summary.accuracyPercent,
            durationSeconds: summary.durationSeconds,
            mistakes: summary.mistakes,
          },
        },
      ]);
      track('mock_finish', { kind: `part_${partIndex + 1}` });
      setPartIndex(partIndex + 1);
    },
    [partIndex],
  );

  const estimate = useMemo(
    () => estimatePracticeScore(summaries.map((row) => row.result), parts[0]?.seconds ?? 300),
    [summaries, parts],
  );

  if (claimError) {
    return (
      <MockShell titleAr="محاكاة B1" onExit={() => navigate('/subscription')}>
        <GlassCard>
          <p className="kz-ar-body text-kz-ink">{claimError}</p>
          <div className="mt-4 flex flex-col gap-2">
            <PrimaryAction onClick={() => navigate('/subscription')}>
              <Sparkles className="h-5 w-5" />
              <span>اعرف الخيارات</span>
            </PrimaryAction>
            <GlassButton onClick={() => navigate('/app/trail')}>
              <span>العودة إلى المسار</span>
            </GlassButton>
          </div>
        </GlassCard>
      </MockShell>
    );
  }

  if (!claim || !claim.grant || !parts.length) {
    return (
      <MockShell titleAr="محاكاة B1" onExit={() => navigate('/app/trail')}>
        <p className="kz-ar-caption text-kz-inkDim">جارٍ تجهيز المحاكاة…</p>
      </MockShell>
    );
  }

  if (finished) {
    return (
      <MockResultScreen
        claim={claim}
        summaries={summaries}
        estimate={estimate}
        onExit={() => navigate('/app/trail')}
        onOpenSubscription={() => navigate('/subscription')}
      />
    );
  }

  return (
    <>
      <LiveConversationScreen
        key={`${sessionId}-${currentPart!.id}`}
        scenarioId={MOCK_SCENARIO_ID}
        mockPart={{ grant: claim.grant, partIndex, openerDe: currentPart!.openerDe }}
        autoStartMode="real"
        examChrome={
          <ExamBanner
            part={currentPart!}
            partNumber={partIndex + 1}
            totalParts={parts.length}
            secondsLeft={secondsLeft}
          />
        }
        onBack={() => navigate('/app/trail')}
        onOpenSubscription={() => navigate('/subscription')}
        onCompleteSession={handlePartComplete}
      />
    </>
  );
};

/** The banner: which part, how long, and what it asks — in Arabic, once. */
const ExamBanner: React.FC<{
  part: MockExamPart;
  partNumber: number;
  totalParts: number;
  secondsLeft: number | null;
}> = ({ part, partNumber, totalParts, secondsLeft }) => {
  const over = secondsLeft === 0;
  return (
    <div className="relative z-10 shrink-0 border-b border-white/[0.06] bg-kz-soft-black/40 px-4 py-2 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="kz-ar-micro text-primary">
          الجزء {partNumber} من {totalParts}
        </p>
        <p
          data-testid="mock-clock"
          className={`kz-de-caption flex items-center gap-1 font-bold ${over ? 'text-primary' : 'text-kz-lavender'}`}
        >
          <Clock3 className="h-3.5 w-3.5" />
          {formatPartClock(secondsLeft ?? 0)}
        </p>
      </div>
      <p className="kz-ar-caption mt-1 text-kz-ink">{part.titleAr}</p>
      <p className="kz-ar-micro mt-0.5 text-kz-inkDim">{part.briefAr}</p>
      {over ? (
        <p className="kz-ar-micro mt-1 text-primary">
          انتهى الوقت المقترح لهذا الجزء. أكمل ما بدأت به ثم انتقل للجزء التالي.
        </p>
      ) : null}
    </div>
  );
};

/**
 * The debrief.
 *
 * Free tier: the estimate, the notice and two corrections. Paid tier: every
 * correction plus the per-part breakdown and a repeat. The locked count is stated
 * rather than hidden — a learner who is told exactly what the upgrade adds can
 * decide; one who is merely told to upgrade cannot.
 */
const MockResultScreen: React.FC<{
  claim: MockStartResponse;
  summaries: PartSummary[];
  estimate: ReturnType<typeof estimatePracticeScore>;
  onExit: () => void;
  onOpenSubscription: () => void;
}> = ({ claim, summaries, estimate, onExit, onOpenSubscription }) => {
  const [shareNote, setShareNote] = useState<string | null>(null);

  /**
   * Share the result, never a certificate.
   *
   * The text says "practice estimate" in the same words the card uses, so a
   * screenshot of the share cannot claim more than the app claims. The link
   * carries the learner's referral code and nothing else — no transcript, no
   * mistakes, no account id.
   */
  const handleShare = useCallback(async () => {
    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const referralCode = await workerClient
      .getReferralInfo()
      .then((info) => info?.referral_code || null)
      .catch(() => null);
    const link = buildShareLink({ appUrl, referralCode });
    const text = `${buildShareText({ appUrl, referralCode, estimate: estimate.score, level: 'B1' })} ${link}`.trim();
    track('share_click', { kind: 'mock_result', source: referralCode ? 'referral' : 'plain' });
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: 'Katzu', text, url: link });
        return;
      }
      await navigator.clipboard?.writeText(text);
      setShareNote('نُسخ الرابط — شاركه مع من يستعد للامتحان.');
    } catch {
      setShareNote('تعذّر النسخ الآن. جرّب مرة أخرى.');
    }
  }, [estimate.score]);
  const allMistakes = summaries.flatMap((row) =>
    row.result.mistakes.map((mistake) => ({ original: mistake.original, corrected: mistake.corrected })),
  );
  const view = debriefView(allMistakes, claim.debrief);
  const noticeAr = claim.brief?.noticeAr ?? '';

  useEffect(() => {
    track('debrief_view', { kind: claim.source || 'free' });
  }, [claim.source]);

  return (
    <MockShell titleAr="نتيجة المحاكاة" onExit={onExit}>
      <GlassCard>
        <p className="kz-ar-title font-bold">تقدير تدريبي</p>
        {estimate.score !== null ? (
          <>
            <p data-testid="mock-score" className="kz-ar-display mt-2 font-bold text-primary">
              {estimate.score}
              <span className="kz-ar-caption ms-2 text-kz-inkDim">من 100</span>
            </p>
            <p className="kz-ar-caption mt-2 text-kz-ink">{estimate.headlineAr}</p>
          </>
        ) : (
          <p className="kz-ar-caption mt-2 text-kz-inkDim">{estimate.headlineAr}</p>
        )}
        <p className="kz-ar-micro mt-3 text-kz-inkDim">{estimate.noticeAr}</p>
        {noticeAr ? <p className="kz-ar-micro mt-1 text-kz-inkFaint">{noticeAr}</p> : null}
      </GlassCard>

      <GlassCard>
        <p className="kz-ar-caption font-bold">أهم الأخطاء</p>
        {view.visible.length === 0 ? (
          <p className="kz-ar-caption mt-2 text-kz-inkDim">لم تُسجَّل أخطاء في هذه المحاكاة.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {view.visible.map((mistake, index) => (
              <li key={`${index}-${mistake.original}`} className="rounded-2xl bg-white/[0.04] p-3">
                <GermanText as="span" className="text-sm text-kz-inkDim line-through">
                  {mistake.original}
                </GermanText>
                <GermanText as="span" className="mt-1 text-sm text-primary">
                  {mistake.corrected}
                </GermanText>
              </li>
            ))}
          </ul>
        )}
        {!view.full && view.lockedCount > 0 ? (
          <div className="mt-3 rounded-2xl border border-primary/30 bg-primary/10 p-3">
            <p className="kz-ar-micro flex items-center gap-1 text-primary">
              <Lock className="h-3.5 w-3.5" />
              <span>
                {view.lockedCount} تصحيحاً آخر في التقرير الكامل — مع شرح كل خطأ وخطوات للتكرار.
              </span>
            </p>
            <div className="mt-3">
              <PrimaryAction onClick={onOpenSubscription}>
                <Sparkles className="h-5 w-5" />
                <span>افتح التقرير الكامل</span>
              </PrimaryAction>
            </div>
          </div>
        ) : null}
      </GlassCard>

      {view.full ? (
        <GlassCard>
          <p className="kz-ar-caption font-bold">أجزاء المحاكاة</p>
          <ul className="mt-2 space-y-1">
            {summaries.map((row) => (
              <li key={row.result.partIndex} className="kz-ar-micro text-kz-inkDim">
                الجزء {row.result.partIndex}: {row.result.sentencesSpoken} جملة،{' '}
                {row.result.independentSentences} بلا تلميح
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <PrimaryAction onClick={onOpenSubscription}>
              <Sparkles className="h-5 w-5" />
              <span>احجز محاكاة أخرى</span>
            </PrimaryAction>
          </div>
        </GlassCard>
      ) : null}

      <GlassButton onClick={() => void handleShare()}>
        <span>شارك تقديرك مع صديق</span>
      </GlassButton>
      {shareNote ? <p className="kz-ar-micro text-kz-inkDim">{shareNote}</p> : null}

      <GlassButton onClick={onExit}>
        <span>العودة إلى المسار</span>
      </GlassButton>
    </MockShell>
  );
};

/** The frame every mock screen shares, so the exam never borrows a chat layout. */
const MockShell: React.FC<{ titleAr: string; onExit: () => void; children: React.ReactNode }> = ({
  titleAr,
  onExit,
  children,
}) => (
  <div className="min-h-screen bg-black px-4 py-6 text-kz-ink">
    <div className="mx-auto max-w-md space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="kz-ar-title font-bold">{titleAr}</h1>
        <button
          type="button"
          onClick={onExit}
          className="kz-ar-micro min-h-touch rounded-2xl border border-white/10 px-3 py-2 text-kz-inkDim"
        >
          إغلاق
        </button>
      </div>
      {children}
    </div>
  </div>
);