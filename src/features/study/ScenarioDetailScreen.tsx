import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { GermanText } from '@/components/common/GermanText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PaywallModal } from '@/components/sheets/PaywallModal';
import { ArrowRight, BookOpen, CheckCircle, MessagesSquare, Sparkles } from 'lucide-react';

export interface ScenarioDetailScreenProps {
  scenarioId: string;
  onBack: () => void;
  onStartStudy: () => void;
  onStartQuiz: () => void;
  onStartConversation: () => void;
  onOpenSubscription?: () => void;
}

export const ScenarioDetailScreen: React.FC<ScenarioDetailScreenProps> = ({
  scenarioId,
  onBack,
  onStartStudy,
  onStartQuiz,
  onStartConversation,
  onOpenSubscription,
}) => {
  const [showPaywall, setShowPaywall] = useState(false);

  const scenario = useLiveQuery(() => db.scenarios.get(scenarioId));
  const starterPhrases = useLiveQuery(() => db.starter_phrases.where('scenario_id').equals(scenarioId).toArray()) || [];
  const training = useLiveQuery(() => db.scenario_training.get(scenarioId));
  const user = useLiveQuery(() => db.users.get('current_user'));

  if (!scenario) {
    return <div className="p-6 text-center text-text-secondary">جاري التحميل...</div>;
  }

  const isPro = !!user?.isSubscriptionActive;
  const handleConversationClick = () => {
    onStartConversation();
  };

  const isStudied = !!training?.studiedAt;
  const isQuizPassed = !!training?.quizAttempted && (training?.lastScore || 0) >= 60;

  return (
    <div className="min-h-screen bg-black text-text-primary p-6 max-w-md mx-auto relative pb-16">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="p-2.5 rounded-2xl bg-surface-card border border-border-subtle hover:bg-surface-subtle transition-colors"
        >
          <ArrowRight className="w-5 h-5 text-text-secondary" />
        </button>
        <Badge variant="primary" size="md">
          {user?.cefrLevel || 'A1'} • محادثة واقعية
        </Badge>
        <div className="w-10" />
      </div>

      {/* Host Card */}
      <Card variant="hero" className="p-5 mb-6 relative overflow-hidden border border-primary/30 flex items-center justify-between">
        <div className="max-w-[70%]">
          <GermanText as="h2" className="text-xl font-bold text-text-primary mb-1">
            {scenario.title_de}
          </GermanText>
          <h3 className="text-sm font-arabic font-semibold text-text-secondary mb-3">
            {scenario.title_ar}
          </h3>
          <p className="text-xs text-text-muted font-arabic italic">
            «أنا كاتزو في هذا الموقف، خض التجربة وتحدث بثقة بدون تردد!»
          </p>
        </div>
        <KatzuMascot name="scenario_host" className="w-24 h-24 object-contain" />
      </Card>

      {/* 3 Step Action Cards */}
      <div className="space-y-3.5 mb-8">
        <h4 className="text-xs font-bold font-arabic text-text-secondary">خطة الإتقان للموقف:</h4>

        {/* Step 1: Study */}
        <div
          onClick={onStartStudy}
          className="p-4 rounded-3xl bg-surface-card border border-border-subtle hover:border-primary/50 cursor-pointer flex items-center justify-between transition-all active:scale-98"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isStudied ? 'bg-status-success/20 text-status-success' : 'bg-primary/20 text-primary'}`}>
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold font-arabic">1. دراسة العبارات والمفردات</div>
              <div className="text-xs text-text-secondary">استمع للنطق الصحيح واحفظ الكلمات الأساسية</div>
            </div>
          </div>
          {isStudied && <CheckCircle className="w-5 h-5 text-status-success" />}
        </div>

        {/* Step 2: Quiz */}
        <div
          onClick={onStartQuiz}
          className="p-4 rounded-3xl bg-surface-card border border-border-subtle hover:border-primary/50 cursor-pointer flex items-center justify-between transition-all active:scale-98"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isQuizPassed ? 'bg-status-success/20 text-status-success' : 'bg-primary/20 text-primary'}`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold font-arabic">2. اختبار سريع (كويز)</div>
              <div className="text-xs text-text-secondary">تأكد من فهمك للمعاني قبل التحدث الحي</div>
            </div>
          </div>
          {isQuizPassed && <CheckCircle className="w-5 h-5 text-status-success" />}
        </div>

        {/* Step 3: Live Conversation */}
        <div
          onClick={handleConversationClick}
          className="p-4 rounded-3xl bg-surface-card border border-primary/40 hover:border-primary shadow-glow-purple cursor-pointer flex items-center justify-between transition-all active:scale-98"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-primary text-white">
              <MessagesSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold font-arabic text-primary">
                  3. المحادثة الحية مع كَاتْزُو
                </span>
                {!isPro && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold">تحقق الحصة عند البدء</span>}
              </div>
              <div className="text-xs text-text-secondary">تحدث بصوتك مباشرة وخض الحوار التفاعلي</div>
            </div>
          </div>
        </div>
      </div>

      {/* Starter Phrases Preview */}
      {starterPhrases.length > 0 && (
        <div>
          <h4 className="text-xs font-bold font-arabic text-text-secondary mb-3">عبارات مساعدة للبدء:</h4>
          <div className="space-y-2">
            {starterPhrases.slice(0, 3).map((sp) => (
              <div key={sp.id} className="p-3 rounded-2xl bg-surface-subtle border border-border-subtle text-xs">
                <GermanText className="font-bold text-text-primary block mb-0.5">{sp.german}</GermanText>
                <div className="text-text-secondary font-arabic">{sp.translation_ar}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Paywall Dialog */}
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onUpgrade={() => {
          if (onOpenSubscription) onOpenSubscription();
        }}
      />
    </div>
  );
};
