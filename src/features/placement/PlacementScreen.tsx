import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { enrolStudiedPhrases, enrolStudiedVocabulary } from '@/lib/srs/store';
import {
  MAX_ITEMS,
  applyPlacementResponse,
  createPlacementState,
  describePlacementResult,
  isPlacementFinished,
  missedPlacementSourceIds,
  placementEstimate,
  type PlacementState,
} from '@/lib/placement/engine';
import {
  buildPlacementItem,
  nearestLevelWithItems,
  shouldUseListening,
  type PlacementItem,
} from '@/lib/placement/generator';
import { GermanText } from '@/components/common/GermanText';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { triggerHaptic } from '@/lib/utils/haptics';
import { track } from '@/lib/analytics/client';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { UiStringKey } from '@/lib/i18n/strings';
import { Volume2, ArrowLeft, Headphones, Sparkles, SlidersHorizontal } from 'lucide-react';
import type { CEFRLevel } from '@/types/models';

export interface PlacementScreenProps {
  onDone: () => void;
}

type Phase = 'intro' | 'question' | 'result' | 'manual';

const LEVELS: CEFRLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2'];

const LEVEL_LABEL_KEY: Record<CEFRLevel, UiStringKey> = {
  A0: 'placement.level.A0',
  A1: 'placement.level.A1',
  A2: 'placement.level.A2',
  B1: 'placement.level.B1',
  B2: 'placement.level.B2',
};

/** Best-effort capability check: a listening question on a silent device is a dead end. */
function speechIsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export const PlacementScreen: React.FC<PlacementScreenProps> = ({ onDone }) => {
  const { t, uiLanguage } = useLanguage();
  const vocabulary = useLiveQuery(() => db.vocabulary.toArray()) || [];
  const phrases = useLiveQuery(() => db.starter_phrases.toArray()) || [];

  const [phase, setPhase] = useState<Phase>('intro');
  const [state, setState] = useState<PlacementState>(() => createPlacementState());
  const [item, setItem] = useState<PlacementItem | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const usedIds = useRef<Set<string>>(new Set());
  const { speak } = useSpeechOutput();

  const result = useMemo(() => describePlacementResult(state, uiLanguage), [state, uiLanguage]);
  const askedCount = state.responses.length;

  /** Draws the next question for the level the staircase is currently resting at. */
  const drawItem = (fromState: PlacementState): PlacementItem | null => {
    const pool = { vocabulary, phrases };
    const level = nearestLevelWithItems(pool, fromState.level);
    if (!level) return null;

    const isListening = shouldUseListening(fromState.responses.length, speechIsAvailable());
    const next = buildPlacementItem(pool, level, usedIds.current, Math.random, isListening);
    if (!next) {
      // Nothing left at this level: step to the closest level that still has content.
      const fallbackLevel = nearestLevelWithItems(
        { vocabulary: vocabulary.filter((v) => !usedIds.current.has(`vocab:${v.id}`)), phrases },
        fromState.level,
      );
      if (!fallbackLevel || fallbackLevel === level) return null;
      return buildPlacementItem(pool, fallbackLevel, usedIds.current, Math.random, false);
    }
    return next;
  };

  /**
   * Marks each question used as it is shown, so no row can be asked twice and a
   * second pass over a level cannot repeat itself.
   */
  const showItem = (next: PlacementItem | null) => {
    if (next) usedIds.current.add(next.id);
    setItem(next);
    setChosen(null);
    setPhase(next ? 'question' : 'result');
  };

  const startQuestioning = () => {
    usedIds.current = new Set();
    const fresh = createPlacementState();
    setState(fresh);
    showItem(drawItem(fresh));
  };

  // Listening questions are played when they appear; the learner can replay them.
  useEffect(() => {
    if (phase !== 'question' || !item?.isListening) return;
    speak(item.german);
  }, [phase, item, speak]);

  const answer = (index: number) => {
    if (!item || chosen !== null) return;
    const correct = index === item.correctIndex;
    setChosen(index);
    triggerHaptic(correct ? 'success' : 'error');

    const nextState = applyPlacementResponse(state, {
      kind: item.kind,
      level: item.level,
      correct,
      wasListening: item.isListening,
      sourceId: item.sourceId,
    });
    setState(nextState);
  };

  // Funnel event: the placement is the first thing a new learner measures, and
  // whether they finish it (vs. skip it) is the clearest onboarding signal.
  useEffect(() => {
    track('placement_started');
  }, []);

  const advance = () => {
    if (isPlacementFinished(state)) {
      setPhase('result');
      return;
    }
    const next = drawItem(state);
    if (!next) {
      // Content ran out mid-check: report honestly rather than showing a blank question.
      setPhase('result');
      return;
    }
    showItem(next);
  };

  /** Commits the level and turns the missed questions into the first review session. */
  const finishWith = async (level: CEFRLevel, how: 'measured' | 'chosen', completedState?: PlacementState) => {
    setSaving(true);
    try {
      await db.users.update('current_user', {
        cefrLevel: level,
        updatedAt: Date.now(),
        ...(how === 'measured'
          ? { placementCompletedAt: Date.now(), placementEstimatedLevel: level }
          : { placementSkippedAt: Date.now() }),
      });
      track('placement_completed', { source: how, state: level });

      if (how === 'measured' && completedState) {
        const missed = missedPlacementSourceIds(completedState);
        if (missed.length) {
          const missedWords = await db.vocabulary.bulkGet(missed);
          const missedPhrases = await db.starter_phrases.bulkGet(missed);
          await enrolStudiedVocabulary(missedWords.filter((word): word is NonNullable<typeof word> => !!word));
          await enrolStudiedPhrases(missedPhrases.filter((phrase): phrase is NonNullable<typeof phrase> => !!phrase));
        }
      }
    } catch {
      // The level is a preference, not learner content: losing it must never trap
      // someone on this screen, so we proceed and they can set it again in Profile.
    } finally {
      setSaving(false);
      onDone();
    }
  };

  if (phase === 'intro') {
    return (
      <div className="min-h-screen bg-black text-text-primary p-6 max-w-md mx-auto flex flex-col justify-center">
        <div className="text-center mb-6">
          <KatzuMascot name="welcome" glow className="w-36 h-36 object-contain mx-auto mb-3" />
          <h1 className="text-2xl font-bold font-arabic mb-2">{t('placement.introTitle')}</h1>
          <p className="text-sm font-arabic text-text-secondary leading-relaxed">
            {t('placement.introBody')}
          </p>
        </div>

        <Card className="p-4 mb-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-arabic text-text-secondary">
            <GermanText className="font-bold text-text-primary">1.</GermanText>
            {t('placement.introItem1')}
          </div>
          <div className="flex items-center gap-2 text-xs font-arabic text-text-secondary">
            <Headphones className="w-4 h-4 text-primary shrink-0" />
            {t('placement.introItem2')}
          </div>
          <div className="flex items-center gap-2 text-xs font-arabic text-text-secondary">
            <SlidersHorizontal className="w-4 h-4 text-primary shrink-0" />
            {t('placement.introItem3')}
          </div>
        </Card>

        <Button size="lg" className="w-full" onClick={startQuestioning}>
          {t('placement.startTest')}
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <button
          disabled={saving}
          onClick={() => finishWith('A0', 'chosen')}
          className="mt-3 w-full text-center text-xs font-arabic text-text-muted pointer-hover:text-text-primary transition-colors py-2"
        >
          {t('placement.knowNothing')}
        </button>
        <button
          onClick={() => setPhase('manual')}
          className="mt-3 w-full text-center text-xs font-arabic text-text-muted pointer-hover:text-text-primary transition-colors py-2"
        >
          {t('placement.chooseMyself')}
        </button>
      </div>
    );
  }

  if (phase === 'manual') {
    return (
      <div className="min-h-screen bg-black text-text-primary p-6 max-w-md mx-auto flex flex-col justify-center">
        <h1 className="text-xl font-bold font-arabic mb-1 text-center">{t('placement.manualTitle')}</h1>
        <p className="text-xs font-arabic text-text-secondary text-center mb-6">
          {t('placement.manualBody')}
        </p>
        <div className="space-y-2">
          {LEVELS.map((level) => (
            <button
              key={level}
              disabled={saving}
              onClick={() => finishWith(level, 'chosen')}
              className="w-full flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-card p-4 text-start transition-colors pointer-hover:border-primary/40 disabled:opacity-50"
            >
              <Badge variant="primary" size="md" className="shrink-0">
                {level}
              </Badge>
              <span className="text-xs font-arabic text-text-secondary">{t(LEVEL_LABEL_KEY[level])}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setPhase('intro')}
          className="mt-4 w-full text-center text-xs font-arabic text-text-muted pointer-hover:text-text-primary transition-colors py-2"
        >
          {t('placement.backToTest')}
        </button>
      </div>
    );
  }

  if (phase === 'result' && askedCount === 0) {
    // Nothing could be measured (the content cache is empty). Claiming a level
    // here would be a lie, so say so and let the learner decide instead.
    return (
      <div className="min-h-screen bg-black text-text-primary p-6 max-w-md mx-auto flex flex-col justify-center text-center">
        <KatzuMascot name="peace" className="w-32 h-32 object-contain mx-auto mb-4" />
        <h1 className="text-xl font-bold font-arabic mb-2">{t('placement.noMeasureTitle')}</h1>
        <p className="text-sm font-arabic text-text-secondary leading-relaxed mb-6">
          {t('placement.noMeasureBody')}
        </p>
        <Button className="w-full" onClick={() => setPhase('manual')}>
          {t('placement.chooseManually')}
        </Button>
        <button
          onClick={onDone}
          className="mt-3 w-full text-center text-xs font-arabic text-text-muted pointer-hover:text-text-primary transition-colors py-2"
        >
          {t('placement.skipNow')}
        </button>
      </div>
    );
  }

  if (phase === 'result') {
    return (
      <div className="min-h-screen bg-black text-text-primary p-6 max-w-md mx-auto flex flex-col justify-center">
        <Card variant="hero" glow className="text-center">
          <KatzuMascot name="celebrating" className="w-28 h-28 object-contain mx-auto mb-3" />
          <p className="text-micro font-arabic text-text-muted mb-1">{t('placement.resultLabel')}</p>
          <h1 className="text-2xl font-bold font-arabic mb-3">{result.headlineAr}</h1>
          <p className="text-sm font-arabic text-text-secondary leading-relaxed mb-4">{result.detailAr}</p>
          <p className="text-micro font-arabic text-text-muted mb-5">
            {t('placement.resultCount', { count: askedCount })}
          </p>
          <Button
            size="lg"
            className="w-full"
            disabled={saving}
            isLoading={saving}
            onClick={() => finishWith(placementEstimate(state), 'measured', state)}
          >
            <Sparkles className="w-4 h-4" />
            {t('placement.startPractice')}
          </Button>
        </Card>
        <button
          onClick={() => setPhase('manual')}
          className="mt-3 w-full text-center text-xs font-arabic text-text-muted pointer-hover:text-text-primary transition-colors py-2"
        >
          {t('placement.notMyLevel')}
        </button>
      </div>
    );
  }

  // phase === 'question'
  if (!item) {
    return (
      <div className="min-h-screen bg-black text-text-primary flex items-center justify-center">
        <span className="font-arabic text-text-secondary">{t('placement.preparing')}</span>
      </div>
    );
  }

  const answered = chosen !== null;
  const progressPercent = Math.round((askedCount / MAX_ITEMS) * 100);

  return (
    <div className="min-h-screen bg-black text-text-primary p-4 max-w-md mx-auto pb-28">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold font-arabic">{t('placement.screenTitle')}</h2>
          <p className="text-micro text-text-secondary font-arabic">
            {item.isListening ? t('placement.hintListening') : t('placement.hintReading')}
          </p>
        </div>
        <Badge variant="subtle" size="sm">
          {askedCount + 1}
        </Badge>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle mb-5">
        <div className="h-full w-full rounded-full bg-primary origin-right transition-transform duration-panels ease-out" style={{ transform: `scaleX(${progressPercent / 100})` }} />
      </div>

      <Card className="p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Badge variant={item.isListening ? 'learning' : 'primary'} size="sm">
            {item.isListening ? (
              <>
                <Headphones className="w-3 h-3" /> {t('placement.tagListening')}
              </>
            ) : item.kind === 'vocab' ? (
              t('placement.tagWord')
            ) : (
              t('placement.tagSentence')
            )}
          </Badge>
        </div>

        {item.isListening ? (
          <div className="text-center py-4">
            <button
              type="button"
              onClick={() => speak(item.german)}
              className="w-20 h-20 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto transition-colors"
              aria-label={t('placement.replayAria')}
            >
              <Volume2 className="w-8 h-8" />
            </button>
            <p className="mt-3 text-micro font-arabic text-text-muted">
              {t('placement.replayHint')}
            </p>
          </div>
        ) : (
          <div className="text-center py-2">
            <GermanText className="text-2xl font-bold text-text-primary">{item.german}</GermanText>
          </div>
        )}
      </Card>

      <div className="space-y-2 mb-4">
        {item.options.map((option, index) => {
          const isCorrect = index === item.correctIndex;
          const isChosen = index === chosen;
          const tone = !answered
            ? 'border-border-subtle bg-surface-card pointer-hover:border-primary/40'
            : isCorrect
              ? 'border-status-success/50 bg-status-success/15 kz-pop'
              : isChosen
                ? 'border-status-error/50 bg-status-error/15 kz-shake'
                : 'border-border-subtle bg-surface-card opacity-60';
          return (
            <button
              key={`${item.id}-${index}`}
              disabled={answered}
              onClick={() => answer(index)}
              className={`w-full rounded-2xl border p-4 text-start font-arabic text-sm transition-colors ${tone}`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {answered && (
        <Card role="status" aria-live="polite" className="p-4 mb-4">
          <p className="text-xs font-arabic leading-relaxed text-text-secondary">
            {chosen === item.correctIndex ? t('placement.correct') : t('placement.correctAnswer')}
            {chosen !== item.correctIndex && <GermanText className="text-text-primary">{item.german}</GermanText>}
            {chosen !== item.correctIndex && ' — '}
            {item.explanationAr}
          </p>
        </Card>
      )}

      <Button className="w-full" disabled={!answered} onClick={advance}>
        {isPlacementFinished(state) ? t('placement.showResult') : t('placement.nextQuestion')}
      </Button>
    </div>
  );
};
