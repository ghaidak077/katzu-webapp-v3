import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { GermanText } from '@/components/common/GermanText';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PaywallModal } from '@/components/sheets/PaywallModal';
import type { CEFRLevel, ScenarioEntity } from '@/types/models';
import { Sparkles, CheckCircle2, Lock, Play, Flame } from 'lucide-react';

export interface TrailScreenProps {
  onSelectScenario: (scenarioId: string) => void;
  onOpenSubscription: () => void;
}

export const TrailScreen: React.FC<TrailScreenProps> = ({
  onSelectScenario,
  onOpenSubscription,
}) => {
  const [selectedLevel, setSelectedLevel] = useState<CEFRLevel>('A1');
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallReason, setPaywallReason] = useState({ title: '', description: '' });

  const user = useLiveQuery(() => db.users.get('current_user'));
  const scenarios = useLiveQuery(() => db.scenarios.toArray()) || [];
  const trainingRecords = useLiveQuery(() => db.scenario_training.toArray()) || [];

  const isPro = !!user?.isSubscriptionActive;
  const levels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2'];
  const dailyScenario = scenarios.find((scenario) => scenario.id === 'cafe_order') || scenarios[0];

  const getTrainingStatus = (scenarioId: string) => {
    const record = trainingRecords.find((r) => r.scenarioId === scenarioId);
    if (record?.quizAttempted && (record?.lastScore || 0) >= 80) return 'MASTERED';
    if (record?.studiedAt) return 'ACTIVE';
    return 'UNLOCKED';
  };

  const handleLevelSelect = (lvl: CEFRLevel) => {
    if (lvl !== 'A1' && !isPro) {
      setPaywallReason({
        title: `المستوى ${lvl} متاح لمشتركي Pro`,
        description: `يتضمن المستوى ${lvl} سيناريوهات عمل متقدمة، مواقف رسمية، ومفردات دقيقة تتطلب اشتراك Katzu Pro.`,
      });
      setShowPaywall(true);
      return;
    }
    setSelectedLevel(lvl);
  };

  const handleScenarioClick = (scenarioId: string) => {
    if (selectedLevel !== 'A1' && !isPro) {
      setPaywallReason({
        title: 'سيناريو مخصص لمشتركي Pro',
        description: 'رَقِّ حسابك الآن لفتح جميع السيناريوهات المتقدمة من A1 حتى B2.',
      });
      setShowPaywall(true);
      return;
    }
    onSelectScenario(scenarioId);
  };

  return (
    <div className="min-h-screen bg-black text-text-primary pb-28 pt-4 px-4 max-w-md mx-auto relative">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <KatzuMascot name="avatar" className="w-10 h-10" />
          <div>
            <h2 className="text-base font-bold font-arabic leading-tight">{user?.displayName || 'مستكشف كَاتْزُو'}</h2>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="flex items-center gap-1 text-learning font-bold">
                <Flame className="w-3.5 h-3.5 fill-learning text-learning" />
                {user?.streakDays ?? 0} أيام حماس
              </span>
              <span>•</span>
              <span className="text-primary font-bold">{user?.totalXp ?? 0} XP</span>
            </div>
          </div>
        </div>

        {!isPro ? (
          <button
            onClick={onOpenSubscription}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/40 text-primary text-xs font-bold shadow-glow-purple active:scale-95 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>اكتشف مزايا Pro</span>
          </button>
        ) : (
          <Badge variant="success" size="sm">
            Katzu Pro نشط
          </Badge>
        )}
      </div>

      {/* Hero Daily Focus Card */}
      <Card variant="hero" className="p-4 mb-6 relative overflow-hidden flex items-center justify-between border border-primary/40 shadow-glow-purple">
        <div className="z-10 max-w-[65%]">
          <Badge variant="primary" size="sm" className="mb-2">
            مهمتك اليومية
          </Badge>
          {dailyScenario ? (
            <>
              <GermanText className="text-base font-bold text-text-primary block mb-1 leading-snug">
                {dailyScenario.title_de}
              </GermanText>
              <p className="text-xs text-text-secondary font-arabic">
                {dailyScenario.title_ar}
              </p>
            </>
          ) : (
            <>
              <h3 className="text-base font-bold font-arabic mb-1 leading-snug">
                مهمتك اليومية قيد التجهيز
              </h3>
              <p className="text-xs text-text-secondary font-arabic">
                نزّل المحتوى عند توفر الاتصال لبدء تدريبك التالي.
              </p>
            </>
          )}
        </div>
        <KatzuMascot name="trail_header" className="w-24 h-24 object-contain -me-2 z-10" />
      </Card>

      {/* CEFR Level Selector Pills */}
      <div className="flex items-center justify-between gap-2 p-1.5 bg-surface-card border border-border-subtle rounded-2xl mb-8">
        {levels.map((lvl) => {
          const isLvlLocked = lvl !== 'A1' && !isPro;
          return (
            <button
              key={lvl}
              onClick={() => handleLevelSelect(lvl)}
              className={`flex-1 py-2 rounded-xl text-xs font-german font-bold transition-all flex items-center justify-center gap-1 ${
                selectedLevel === lvl
                  ? 'bg-primary text-white shadow-glow-purple'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <span>{lvl}</span>
              {isLvlLocked && <Lock className="w-3 h-3 text-text-muted" />}
            </button>
          );
        })}
      </div>

      {/* Vertical Curriculum Trail Roadmap */}
      <div className="relative flex flex-col items-center space-y-6">
        {/* Glowing Path Line */}
        <div className="absolute top-4 bottom-4 w-1 bg-gradient-to-b from-primary via-primary/30 to-border-subtle z-0" />

        {scenarios.map((scenario: ScenarioEntity, index: number) => {
          const status = getTrainingStatus(scenario.id);
          const isMastered = status === 'MASTERED';
          const isOffsetLeft = index % 2 === 0;

          return (
            <div
              key={scenario.id}
              className={`w-full flex items-center z-10 ${
                isOffsetLeft ? 'justify-start pe-8' : 'justify-end ps-8'
              }`}
            >
              <div
                onClick={() => handleScenarioClick(scenario.id)}
                className={`relative w-[82%] p-4 rounded-3xl cursor-pointer border transition-all transform active:scale-95 ${
                  isMastered
                    ? 'bg-surface-card border-status-success/40 shadow-glow-green'
                    : 'bg-surface-card border-border-subtle hover:border-primary/50'
                }`}
              >
                {/* Status Indicator Icon */}
                <div className="flex items-center justify-between mb-2">
                  <Badge variant={isMastered ? 'success' : 'primary'} size="sm">
                    {selectedLevel}
                  </Badge>
                  {isMastered ? (
                    <CheckCircle2 className="w-5 h-5 text-status-success" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                      <Play className="w-3.5 h-3.5 fill-primary text-primary" />
                    </div>
                  )}
                </div>

                <GermanText className="text-base font-bold text-text-primary block mb-0.5">
                  {scenario.title_de}
                </GermanText>
                <div className="text-xs text-text-secondary font-arabic line-clamp-1">
                  {scenario.title_ar}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Paywall Modal */}
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onUpgrade={onOpenSubscription}
        title={paywallReason.title}
        description={paywallReason.description}
      />
    </div>
  );
};
