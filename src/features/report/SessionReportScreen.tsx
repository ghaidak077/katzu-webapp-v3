import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import confetti from 'canvas-confetti';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { GermanText } from '@/components/common/GermanText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { db } from '@/lib/db/katzuDb';
import { triggerHaptic } from '@/lib/utils/haptics';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import {
  Sparkles,
  Award,
  CheckCircle2,
  ArrowRight,
  Share2,
  TrendingUp,
  Flame,
  Volume2,
} from 'lucide-react';
import type { CEFRLevel } from '@/types/models';

export interface SessionReportScreenProps {
  summary: {
    scenarioId: string;
    scenarioTitle: string;
    cefrLevel: CEFRLevel;
    sentencesSpoken: number;
    accuracyPercent: number;
    durationSeconds: number;
    independentSentences: number;
    assistedSentences: number;
    mistakes: Array<{ original: string; corrected: string; grammarRule: string }>;
  };
  onReturnToTrail: () => void;
}

export const SessionReportScreen: React.FC<SessionReportScreenProps> = ({
  summary,
  onReturnToTrail,
}) => {
  const user = useLiveQuery(() => db.users.get('current_user'));
  const [retypedMistakes, setRetypedMistakes] = useState<Record<number, string>>({});
  const [masteredMistakes, setMasteredMistakes] = useState<Set<number>>(new Set());
  const [isLevelPromoted, setIsLevelPromoted] = useState(false);

  const { speak } = useSpeechOutput({ speed: user?.speechSpeed || 1.0 });

  useEffect(() => {
    // Fire celebratory confetti on mount
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#8B6FE8', '#7FD9A8', '#F0C674'],
    });
  }, []);

  const handleValidateRetype = async (index: number, targetCorrected: string, originalMistake: string) => {
    const input = (retypedMistakes[index] || '').trim().toLowerCase();
    const target = targetCorrected.trim().toLowerCase();

    // Flexible match (ignoring final dot)
    if (input.replace(/\.$/, '') === target.replace(/\.$/, '')) {
      triggerHaptic('success');
      setMasteredMistakes((prev) => new Set(prev).add(index));

      // Rule 9 & DB: Persist mastery status in Dexie
      try {
        const found = await db.mistakes
          .where('scenarioId')
          .equals(summary.scenarioId)
          .and((m) => m.corrected === targetCorrected || m.original === originalMistake)
          .first();
        if (found && found.id) {
          await db.mistakes.update(found.id, { isMastered: true });
        }
      } catch (err) {
        console.warn('Could not update mistake mastery in db:', err);
      }
    } else {
      triggerHaptic('error');
    }
  };

  const nextLevelMap: Record<CEFRLevel, CEFRLevel> = {
    A1: 'A2',
    A2: 'B1',
    B1: 'B2',
    B2: 'B2',
  };
  const targetPromotionLevel = nextLevelMap[summary.cefrLevel];

  const handlePromoteLevel = async () => {
    await db.users.update('current_user', { cefrLevel: targetPromotionLevel });
    setIsLevelPromoted(true);
    triggerHaptic('success');
  };

  const canPromote = summary.accuracyPercent >= 75 && summary.cefrLevel !== 'B2';

  return (
    <div className="min-h-screen bg-black text-text-primary p-6 max-w-md mx-auto relative pb-20">
      {/* Celebration Header */}
      <div className="flex flex-col items-center text-center pt-2 mb-6">
        <KatzuMascot name="celebrating" glow className="w-36 h-36 mb-4 animate-bounce" />
        <Badge variant="success" size="md" className="mb-2">
          تمت الجلسة بنجاح 🎉
        </Badge>
        <h2 className="text-2xl font-bold font-arabic mb-1">إنجاز رائع يا بطل!</h2>
        <p className="text-xs text-text-secondary font-arabic">
          أتممت محادثة «{summary.scenarioTitle}»
        </p>
      </div>

      {/* Trial sessions banner if not Pro */}
      {user && !user.isSubscriptionActive && (
        <div className="w-full p-3 rounded-2xl bg-surface-card border border-primary/30 flex items-center justify-between mb-6 shadow-glow-purple">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-arabic text-text-secondary">الجلسات التجريبية المتبقية:</span>
          </div>
          <span className="text-xs font-bold text-primary px-2.5 py-0.5 rounded-full bg-primary/20">
            {user.freeSessionsRemaining ?? 0} من 3
          </span>
        </div>
      )}

      {/* Metrics Cards Grid (Rule 6: Independent vs Assisted breakdown) */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="p-4 text-center border-primary/30 shadow-glow-purple">
          <span className="text-[11px] text-text-secondary block mb-1">دقة التحدث المستقلة</span>
          <div className="text-2xl font-bold font-german text-primary">{summary.accuracyPercent}%</div>
          <span className="text-[10px] text-text-muted">بدون مساعدة تلميحات</span>
        </Card>

        <Card className="p-4 text-center">
          <span className="text-[11px] text-text-secondary block mb-1">الجمل المنطوقة</span>
          <div className="text-2xl font-bold font-german text-text-primary">{summary.sentencesSpoken}</div>
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-text-muted mt-0.5">
            <span className="text-status-success">{summary.independentSentences} مستقلة</span>
            <span>•</span>
            <span className="text-status-learning">{summary.assistedSentences} بتلميح</span>
          </div>
        </Card>
      </div>

      {/* Level Promotion Card (Rule 9: >=75% promotion) */}
      {canPromote && (
        <Card variant="hero" className="p-4 mb-6 border border-primary/40 shadow-glow-purple flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary mb-1">
              <TrendingUp className="w-4 h-4" />
              ترقية المستوى مستحقة!
            </div>
            <p className="text-xs text-text-secondary">حققت أكثر من 75% دقة في الحوار المستقل.</p>
          </div>
          <Button
            size="sm"
            disabled={isLevelPromoted}
            onClick={handlePromoteLevel}
            className="flex-shrink-0"
          >
            {isLevelPromoted ? 'تمت الترقية ✓' : `ترقية إلى ${targetPromotionLevel}`}
          </Button>
        </Card>
      )}

      {/* Interactive Mistake Practice & Re-type Drill (Rule 9) */}
      {summary.mistakes.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xs font-bold font-arabic text-text-secondary mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            تدريب تثبيت الصواب (أعد كتابة الجملة لتتقنها):
          </h3>

          <div className="space-y-3">
            {summary.mistakes.map((m, idx) => {
              const isMastered = masteredMistakes.has(idx);

              return (
                <div
                  key={idx}
                  className={`p-4 rounded-3xl border transition-all ${
                    isMastered
                      ? 'bg-status-success/15 border-status-success/40'
                      : 'bg-surface-card border-border-subtle'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-text-muted line-through">
                      <GermanText>{m.original}</GermanText>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => speak(m.corrected)}
                        className="p-1 rounded-lg bg-surface-subtle hover:bg-primary/20 text-primary transition-colors"
                        title="استمع للنطق الصحيح"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-status-success font-bold">
                        <GermanText>{m.corrected}</GermanText>
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-text-secondary mb-3 font-arabic">{m.grammarRule}</p>

                  {isMastered ? (
                    <div className="flex items-center gap-1.5 text-status-success text-xs font-bold font-arabic">
                      <CheckCircle2 className="w-4 h-4" />
                      تم إتقان الصواب بنجاح ✓
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="أعد كتابة الجملة الصحيحة هنا..."
                        value={retypedMistakes[idx] || ''}
                        onChange={(e) =>
                          setRetypedMistakes({ ...retypedMistakes, [idx]: e.target.value })
                        }
                        className="flex-1 h-10 bg-surface-subtle border border-border-subtle focus:border-primary rounded-xl px-3 text-xs font-german outline-none"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleValidateRetype(idx, m.corrected, m.original)}
                        disabled={!(retypedMistakes[idx] || '').trim()}
                      >
                        تحقق
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Return CTA */}
      <div className="space-y-2">
        <Button size="lg" className="w-full" onClick={onReturnToTrail}>
          العودة إلى مسار التعلم
          <ArrowRight className="w-5 h-5 ms-2 rotate-180" />
        </Button>
      </div>
    </div>
  );
};
