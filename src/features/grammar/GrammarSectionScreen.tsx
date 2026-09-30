import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { GermanText } from '@/components/common/GermanText';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { enrolMistake } from '@/lib/srs/store';
import {
  buildGrammarExercises,
  gradeGrammarAttempt,
  grammarAttemptMistake,
  grammarLevelSort,
  seededRng,
  type GrammarExercise,
} from '@/lib/grammar/exercises';
import type { CEFRLevel, GrammarEntity } from '@/types/models';
import { SCENARIO_GRAMMAR_IDS } from '@/lib/content/scenarioGrammar';
import { Check, X, RotateCcw, ArrowLeft } from 'lucide-react';
import { triggerHaptic } from '@/lib/utils/haptics';

export interface GrammarSectionScreenProps {
  onBack: () => void;
  onOpenScenario: (scenarioId: string) => void;
}

/**
 * القواعد (V21 Phase 4): the grammar SECTION, not just rows.
 *
 * Topics grouped by level; each topic opens into the short Arabic explanation,
 * the German examples, the Arabic-speaker watch-out, and 3 production
 * exercises with immediate feedback and independent retry. A wrong attempt is
 * recorded through the SAME mistake store the conversation uses — so the tutor
 * memory and the review queue pick it up, and nothing here claims mastery from
 * one answer.
 */

/** The scenario each live grammar row teaches (SCENARIO_GRAMMAR_IDS, inverted). */
const GRAMMAR_SCENARIOS: Record<string, string> = Object.entries(SCENARIO_GRAMMAR_IDS).reduce<Record<string, string>>(
  (acc, [scenarioId, ids]) => {
    for (const id of ids) if (!acc[id]) acc[id] = scenarioId;
    return acc;
  },
  {},
);

type Verdict = 'correct' | 'close' | 'wrong';

interface AttemptState {
  text: string;
  verdict: Verdict | null;
}

const GrammarSectionScreen: React.FC<GrammarSectionScreenProps> = ({ onBack, onOpenScenario }) => {
  const grammar = useLiveQuery(() => db.grammar.toArray()) || [];
  const [activeLevel, setActiveLevel] = useState<CEFRLevel | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<Record<string, AttemptState>>({});

  const levels = useMemo(() => {
    const present = [...new Set(grammar.map((row) => row.level))];
    return present.sort(grammarLevelSort);
  }, [grammar]);

  const visible = useMemo(() => {
    const rows = activeLevel === 'all' ? grammar : grammar.filter((row) => row.level === activeLevel);
    const order: CEFRLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2'];
    return [...rows].sort(
      (a, b) => order.indexOf(a.level) - order.indexOf(b.level) || a.id.localeCompare(b.id),
    );
  }, [grammar, activeLevel]);

  const openRow = openId ? grammar.find((row) => row.id === openId) : null;
  const exercises = useMemo(
    () => (openRow ? buildGrammarExercises(openRow, seededRng(42)) : []),
    [openRow],
  );

  const handleAttempt = async (row: GrammarEntity, exercise: GrammarExercise, index: number, given: string) => {
    const key = `${row.id}:${index}`;
    const verdict = gradeGrammarAttempt(exercise, given);
    triggerHaptic(verdict === 'correct' ? 'success' : 'error');
    setAttempts((prev) => ({ ...prev, [key]: { text: given, verdict } }));

    // Only a genuinely wrong production enters the memory — a 'close' (article
    // slip) is feedback here, but a 'wrong' sentence is what the tutor and the
    // review queue must remember. The mistake row is stored, then scheduled by
    // the SAME idempotent enrolment every other surface uses. Nothing claims
    // mastery from one answer; analytics stay quiet (mistakes never leave the
    // device — the event allowlist's own rule).
    if (verdict === 'wrong') {
      const miss = grammarAttemptMistake(row, exercise, given);
      const row_ = {
        userId: 'current_user',
        scenarioId: GRAMMAR_SCENARIOS[row.id] || 'grammar_practice',
        original: miss.original,
        corrected: miss.corrected,
        grammarRule: miss.grammarRule,
        grammarId: miss.grammarId,
        timestamp: Date.now(),
        wasHintUsed: false,
      };
      const id = await db.mistakes.add(row_);
      await enrolMistake({ ...row_, id });
    }
  };

  if (openRow) {
    return (
      <div className="min-h-screen bg-black text-text-primary">
        <div className="mx-auto max-w-md p-5">
          <button
            onClick={() => {
              setOpenId(null);
              setAttempts({});
            }}
            className="mb-4 flex items-center gap-2 text-xs font-arabic text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
            كل القواعد
          </button>

          <Badge variant="primary" size="sm">{openRow.level}</Badge>
          <h1 className="mt-2 text-lg font-bold font-arabic leading-relaxed">{openRow.title_ar}</h1>

          <Card className="mt-4 p-4 space-y-3">
            <p className="text-sm font-arabic text-text-secondary leading-relaxed">{openRow.rule_ar}</p>
            <div className="rounded-2xl bg-surface-subtle border border-border-subtle p-3">
              <GermanText className="block text-sm text-text-primary">{openRow.example_de}</GermanText>
              <p className="mt-1 text-xs font-arabic text-text-muted">{openRow.example_ar}</p>
            </div>
            <p className="text-xs font-arabic text-text-muted leading-relaxed">
              <span className="font-bold text-primary">انتبه كمتحدث عربية: </span>
              {openRow.explanation_ar}
            </p>
          </Card>

          <h2 className="mt-6 mb-3 text-sm font-bold font-arabic text-text-secondary">
            تدرّب — ثلاثة تمارين، وكل محاولة تُصحَّح فوراً
          </h2>
          <div className="space-y-4">
            {exercises.map((exercise, index) => {
              const key = `${openRow.id}:${index}`;
              const attempt = attempts[key];
              return (
                <Card key={key} className="p-4 space-y-2">
                  <p className="text-xs font-arabic text-text-muted">{exercise.promptAr}</p>
                  {exercise.displayDe && (
                    <GermanText className="block text-sm text-text-primary">{exercise.displayDe}</GermanText>
                  )}
                  {exercise.displayAr && (
                    <p className="text-sm font-arabic text-text-primary">{exercise.displayAr}</p>
                  )}
                  {exercise.tokens && (
                    <div className="flex flex-wrap gap-1.5">
                      {exercise.tokens.map((token, tokenIndex) => (
                        <span key={tokenIndex} className="rounded-lg bg-surface-subtle border border-border-subtle px-2 py-1 font-german text-xs text-text-primary">
                          {token}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      value={attempt?.text || ''}
                      onChange={(event) =>
                        setAttempts((prev) => ({
                          ...prev,
                          [key]: { text: event.target.value, verdict: null },
                        }))
                      }
                      placeholder="اكتب بالألمانية"
                      className="h-10 min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface-subtle px-3 font-german text-xs text-text-primary outline-none placeholder:font-arabic placeholder:text-text-muted focus:border-primary/60"
                    />
                    <Button size="sm" onClick={() => handleAttempt(openRow, exercise, index, attempt?.text || '')}>
                      تحقّق
                    </Button>
                  </div>
                  {attempt?.verdict && (
                    <div className="flex items-start gap-1.5">
                      {attempt.verdict === 'correct' ? (
                        <p className="flex items-center gap-1.5 text-[11px] font-arabic text-status-success">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          صحيحة — ستعود لك هذه القاعدة في مراجعتك المجدولة.
                        </p>
                      ) : attempt.verdict === 'close' ? (
                        <p className="text-[11px] font-arabic text-status-learning">
                          قريبة جداً — القاعدة نفسها لكن بصيغة مختلفة. قارن: <GermanText>{exercise.answerDe}</GermanText>
                        </p>
                      ) : (
                        <div className="space-y-1">
                          <p className="flex items-center gap-1.5 text-[11px] font-arabic text-status-error">
                            <X className="w-3.5 h-3.5 shrink-0" />
                            ليست صحيحة بعد. الصواب: <GermanText>{exercise.answerDe}</GermanText>
                          </p>
                          <p className="text-[10px] font-arabic text-text-muted">
                            سجّلنا المحاولة في ذاكرتك — سنعيد إليك هذه القاعدة.
                          </p>
                          <button
                            onClick={() => setAttempts((prev) => ({ ...prev, [key]: { text: '', verdict: null } }))}
                            className="flex items-center gap-1 text-[11px] font-arabic text-primary hover:underline"
                          >
                            <RotateCcw className="w-3 h-3" />
                            أعد المحاولة من جديد
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {GRAMMAR_SCENARIOS[openRow.id] && (
            <button
              onClick={() => onOpenScenario(GRAMMAR_SCENARIOS[openRow.id])}
              className="mt-6 w-full text-center text-xs font-arabic text-primary hover:underline transition-colors py-2"
            >
              تدرّب القاعدة في موقف حقيقي ←
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-text-primary">
      <div className="mx-auto max-w-md p-5">
        <div className="mb-5 text-center">
          <KatzuMascot name="practice" glow className="mx-auto mb-2 h-24 w-24 object-contain" />
          <h1 className="text-xl font-bold font-arabic">القواعد</h1>
          <p className="mt-1 text-xs font-arabic text-text-muted leading-relaxed">
            قواعد الألمانية بشرح عربي بسيط، مع ملاحظة لكل قاعدة يخطئ فيها العرب تحديداً — وتمارين إنتاج قصيرة.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveLevel('all')}
            className={`rounded-full px-3 py-1.5 text-xs font-arabic font-bold border transition-all ${
              activeLevel === 'all'
                ? 'bg-primary/20 border-primary text-primary'
                : 'bg-surface-subtle border-border-subtle text-text-secondary'
            }`}
          >
            الكل
          </button>
          {levels.map((level) => (
            <button
              key={level}
              onClick={() => setActiveLevel(level)}
              className={`rounded-full px-3 py-1.5 text-xs font-german font-bold border transition-all ${
                activeLevel === level
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-surface-subtle border-border-subtle text-text-secondary'
              }`}
            >
              {level}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="py-10 text-center text-xs font-arabic text-text-muted">
            لا توجد قواعد محمّلة بعد على هذا الجهاز — اتصل بالإنترنت مرة واحدة لتظهر.
          </p>
        ) : (
          <div className="space-y-2">
            {visible.map((row) => (
              <button
                key={row.id}
                onClick={() => {
                  setOpenId(row.id);
                  setAttempts({});
                }}
                className="w-full rounded-2xl border border-border-subtle bg-surface-card p-4 text-start transition-all hover:border-primary/40"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="primary" size="sm">{row.level}</Badge>
                  <span className="text-sm font-arabic font-bold text-text-primary leading-relaxed">{row.title_ar}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[11px] font-arabic text-text-muted">{row.rule_ar}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export { GrammarSectionScreen };
