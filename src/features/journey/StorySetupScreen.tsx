import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { useLiveRow } from '@/lib/db/useLiveRow';
import { workerClient } from '@/lib/api/workerClient';
import { sceneFor } from '@/lib/design/scenes';
import { buildStorySetup } from '@/lib/journey/story';
import { loadMissionBrief } from '@/lib/journey/brief';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { useOnlineStatus } from '@/lib/utils/onlineStatus';
import { isProEffective } from '@/lib/utils/subscription';
import { servedLevel } from '@/lib/entitlement/trial';
import { logError } from '@/lib/utils/diagnostics';
import { GermanText } from '@/components/common/GermanText';
import { GlassCard } from '@/components/glass/GlassCard';
import { GlassButton, PrimaryAction } from '@/components/glass/GlassButton';
import { SceneBackdrop } from '@/components/glass/SceneBackdrop';
import { StatusIndicator } from '@/components/v2/StatusIndicator';
import { KatzuPresence } from '@/components/v2/KatzuPresence';
import { ArrowRight, Volume2, Languages, RefreshCw } from 'lucide-react';
import { KatzuThinking } from '@/components/effects/KatzuThinking';

export interface StorySetupScreenProps {
  scenarioId: string;
  onBack: () => void;
  /** `بدء` — the one action that opens Guided Practice. */
  onStart: () => void;
}

/**
 * Story Setup: the episode opening.
 *
 * A near-full-bleed scene with a glass panel that tells the learner where they
 * are, who they are about to speak to, and what they will have to do. The German
 * opener is the character's own line, level-appropriate from real content, and
 * it can be listened to before the conversation starts — which is the whole point
 * of the screen.
 */
export const StorySetupScreen: React.FC<StorySetupScreenProps> = ({ scenarioId, onBack, onStart }) => {
  const user = useLiveQuery(() => db.users.get('current_user'));
  // A slow read is never announced as a missing scene, and a wedged one is not an
  // endless spinner — see `useLiveRow`.
  const scenarioRow = useLiveRow(() => db.scenarios.get(scenarioId), [scenarioId]);
  const scenario = scenarioRow.row;
  const training = useLiveQuery(() => db.scenario_training.get(scenarioId));
  const isOnline = useOnlineStatus();

  const [translationAr, setTranslationAr] = useState<string | null>(null);
  const [translationState, setTranslationState] = useState<'idle' | 'pending' | 'unavailable'>('idle');

  // The opener is the character's own line at the level this episode runs at,
  // which is the level the conversation will actually be served at — a learner
  // must never read one sentence and then be spoken to at another level.
  const level = servedLevel(user?.cefrLevel, isProEffective(user));
  const scene = useMemo(
    () => sceneFor(scenario ? { id: scenario.id, category: scenario.category } : { id: scenarioId }),
    [scenario, scenarioId],
  );

  const brief = useMemo(() => loadMissionBrief(scenarioId), [scenarioId]);

  const story = useMemo(() => {
    if (!scenario) return null;
    return buildStorySetup({
      scenario,
      level,
      locationAr: scene.locationAr,
      whyAr: brief?.reasonAr || 'هذا الموقف من المواقف التي ستخوضها فعلاً في ألمانيا.',
      taskAr: brief?.taskAr,
      returning: !!training?.studiedAt,
      // The learner is the main character, so the opening addresses them by name
      // when the profile holds a real one, and Katzu's greeting follows where they
      // are in the move. Both are read from the profile row, never generated.
      displayName: user?.displayName,
      arrivalStatus: user?.arrivalStatus,
    });
  }, [scenario, level, scene.locationAr, brief, training?.studiedAt, user?.displayName, user?.arrivalStatus]);

  const { speak, isPlaying } = useSpeechOutput({ speed: user?.speechSpeed || 1.0 });

  /**
   * The Arabic gloss of the opener. It comes from the same edge-cached translate
   * route the live conversation uses, and a failure is shown as a retry rather
   * than an empty line — the learner must never face an untranslatable first
   * sentence with no way to ask again.
   */
  const requestTranslation = useCallback(
    async (germanText: string) => {
      if (!germanText.trim()) return;
      setTranslationState('pending');
      try {
        const arabic = await workerClient.translateTextReliable(germanText);
        if (arabic && arabic.trim()) {
          setTranslationAr(arabic.trim());
          setTranslationState('idle');
          return;
        }
        setTranslationState('unavailable');
      } catch {
        logError('story/translate', 'Opener translation unavailable after one retry');
        setTranslationState('unavailable');
      }
    },
    [],
  );

  useEffect(() => {
    if (story?.openingDe) void requestTranslation(story.openingDe);
  }, [story?.openingDe, requestTranslation]);

  if (!scenario) {
    const stalled = scenarioRow.kind === 'reading' && scenarioRow.stalled;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-6">
        <p className="kz-ar-body text-center text-kz-inkDim">
          {scenarioRow.kind === 'missing'
            ? 'لم نجد هذا المشهد على هذا الجهاز بعد.'
            : stalled
              ? 'تأخّر تجهيز المشهد — قد يكون التحديث معلّقاً في تبويب آخر.'
              : 'جارٍ تجهيز المشهد…'}
        </p>
        {scenarioRow.kind === 'missing' && (
          <p className="kz-ar-caption text-center text-kz-inkFaint">
            قد يكون هذا المشهد لم يُنزَّل على الجهاز بعد — يمكنك المتابعة بمشهد آخر من مسارك.
          </p>
        )}
        {/* A wedged read is a state with a way out, never a spinner forever. */}
        {stalled && (
          <GlassButton variant="secondary" onClick={scenarioRow.retry}>
            إعادة المحاولة
          </GlassButton>
        )}
        <GlassButton variant="quiet" onClick={onBack}>
          العودة
        </GlassButton>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-black">
      {/* Scene: full floating panel with the episode's own light. */}
      <SceneBackdrop
        scene={scene}
        drift
        className="absolute inset-0 h-full w-full animate-kz-rise"
        aria-hidden
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-4 pt-5">
          <button
            type="button"
            onClick={onBack}
            aria-label="العودة"
            className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/10 bg-black/35 backdrop-blur-md"
          >
            <ArrowRight className="h-5 w-5 text-kz-inkDim" />
          </button>
          <span className="kz-ar-micro rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-kz-inkDim backdrop-blur-md">
            {scene.locationAr}
          </span>
        </header>

        <div className="flex flex-1 items-end px-4 pb-6">
          <div className="w-full space-y-3">
            {/* Who the learner is about to meet, stated before the first sentence. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="kz-ar-micro rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-kz-inkDim backdrop-blur-md">
                {story?.whoAr}
              </span>
              {/* You are the main character: the learner's own name sits beside the
                  character they are about to meet, and only appears when the
                  profile actually holds a name. */}
              {story?.learnerName && (
                <span className="kz-ar-micro rounded-full border border-kz-lavender/30 bg-kz-lavender/10 px-3 py-1.5 text-kz-lavender backdrop-blur-md">
                  أنت: {story.learnerName}
                </span>
              )}
              {training?.studiedAt && (
                <span className="kz-ar-micro rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-kz-inkFaint backdrop-blur-md">
                  عدت إلى هذا المشهد
                </span>
              )}
            </div>

            <GlassCard tier="glass" className="animate-kz-rise">
              <h1 className="kz-ar-title text-kz-ink">{scenario.title_ar}</h1>
              <GermanText className="mt-1 block text-[0.8rem] text-kz-inkDim">{scenario.title_de}</GermanText>

              <p className="kz-ar-body mt-3 text-kz-ink">{story?.situationAr}</p>

              <div className="kz-ar-caption mt-3 space-y-1.5 text-kz-inkDim">
                <p>
                  <span className="text-kz-inkFaint">لماذا اليوم: </span>
                  {story?.whyAr}
                </p>
                <p>
                  <span className="text-kz-inkFaint">مهمتك: </span>
                  {story?.taskAr}
                </p>
              </div>
            </GlassCard>

            {/* The character's first line, hearable before the conversation. */}
            {story?.openingDe && (
              <GlassCard tier="canvas" className="animate-kz-rise">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => speak(story.openingDe)}
                    aria-label="استمع للجملة الأولى"
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors ${
                      isPlaying
                        ? 'border-kz-lavender/50 bg-kz-lavender/15 text-kz-lavender'
                        : 'border-white/10 bg-black/30 text-kz-inkDim'
                    }`}
                  >
                    <Volume2 className="h-5 w-5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <GermanText className="kz-de-body block text-kz-ink">{story.openingDe}</GermanText>
                    {translationAr && (
                      <p className="kz-ar-caption mt-1.5 text-kz-inkDim">{translationAr}</p>
                    )}
                    {translationState === 'pending' && !translationAr && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Languages className="h-3.5 w-3.5 text-kz-inkFaint" />
                        <KatzuThinking size={18} layout="inline" labelAr="جارٍ الترجمة…" className="gap-1.5" />
                      </div>
                    )}
                    {translationState === 'unavailable' && !translationAr && (
                      <button
                        type="button"
                        onClick={() => requestTranslation(story.openingDe)}
                        className="kz-ar-micro mt-1.5 flex min-h-[36px] items-center gap-1.5 text-kz-amber"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        تعذرت الترجمة — إعادة المحاولة
                      </button>
                    )}
                  </div>
                </div>
              </GlassCard>
            )}

            {story?.katzuAr && <KatzuPresence state="story" size="sm" lineAr={story.katzuAr} inline />}

            {/* The conversation itself needs the worker; saying so here is honest,
                and it is not a dead end — the phrases are all local. */}
            {!isOnline && (
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md">
                <StatusIndicator state="offline" detailAr="المحادثة الحيّة تحتاج اتصالاً — يمكنك التدريب الآن" />
              </div>
            )}

            <PrimaryAction hintAr="خطوتان قصيرتان ثم تبدأ المحادثة." onClick={onStart}>
              بدء
            </PrimaryAction>

            <GlassButton variant="quiet" fullWidth onClick={onBack}>
              ليس الآن
            </GlassButton>
          </div>
        </div>
      </div>
    </div>
  );
};
