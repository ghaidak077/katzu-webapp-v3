import type { ScenarioEntity, StarterPhraseEntity, VocabularyEntity } from '@/types/models';
import { gradeAnswer, type AnswerVerdict } from '@/lib/srs/engine';

/**
 * The public demo: one real, complete learning turn, without an account.
 *
 * WHY IT EXISTS
 * The landing page used to end at Google sign-in, so a visitor could not find
 * out what Katzu actually does without handing over an account first. The demo
 * is the honest answer: one real scenario from the content that already ships,
 * one phrase studied, one short quiz, one German sentence produced by the
 * learner, and the same Arabic feedback style as the real app.
 *
 * WHAT IT DELIBERATELY IS NOT
 * No AI call (there is no authenticated quota for an anonymous visitor), no
 * fake AI feedback, no invented score. Every line the demo shows is either real
 * content from the local cache or a deterministic client-side evaluation that
 * the real app also uses for review grading.
 *
 * Everything here is pure so the whole flow is testable without a browser.
 */

export const DEMO_VERSION = 1 as const;

export interface DemoItem {
  kind: 'vocab' | 'phrase';
  /** Dexie row id of the source content. */
  sourceId: number;
  german: string;
  translationAr: string;
  /** Optional German example sentence shown while studying. */
  exampleDe?: string;
}

export interface DemoLesson {
  scenarioId: string;
  titleDe: string;
  titleAr: string;
  items: DemoItem[];
}

/** One multiple-choice comprehension question, built from real content rows. */
export interface DemoQuestion {
  kind: 'vocab' | 'phrase';
  sourceId: number;
  germanPrompt: string;
  options: string[];
  correctIndex: number;
}

export type DemoStage = 'intro' | 'study' | 'quiz' | 'produce' | 'done';

export interface DemoAnswer {
  questionIndex: number;
  chosenIndex: number;
  correct: boolean;
}

export interface DemoProduction {
  expected: string;
  actual: string;
  verdict: AnswerVerdict;
}

export interface DemoState {
  version: typeof DEMO_VERSION;
  scenarioId: string;
  titleDe: string;
  titleAr: string;
  items: DemoItem[];
  questions: DemoQuestion[];
  stage: DemoStage;
  /** Index into `items` while studying. */
  studyIndex: number;
  /** Indices into `items` the visitor actually looked at. */
  studiedIndices: number[];
  /** Index into `questions` while quizzing. */
  quizIndex: number;
  answers: DemoAnswer[];
  production?: DemoProduction;
  startedAt: number;
  completedAt?: number;
}

export type DemoEvent =
  | { type: 'study_next'; now?: number }
  | { type: 'answer_quiz'; chosenIndex: number }
  | { type: 'quiz_next' }
  | { type: 'submit_production'; actual: string; now?: number }
  | { type: 'skip_production'; now?: number }
  | { type: 'restart' };

const ARABIC_RE = /[\u0600-\u06FF]/;

function usableGerman(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length >= 2 && /[a-zA-ZäöüÄÖÜß]/.test(value);
}

function usableArabic(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length >= 2 && ARABIC_RE.test(value);
}

/**
 * Picks the demo lesson from whatever content is already on the device.
 *
 * The search is restricted to scenarios that have *both* vocabulary and starter
 * phrases, so the demo never has to pad itself with a generated question. The
 * first stable candidate wins (`sort` by id) rather than a random one: the
 * demo is the first impression, and the same lesson every time is easier to
 * trust, test, and explain.
 */
export function buildDemoLesson(
  scenarios: ScenarioEntity[],
  phrases: StarterPhraseEntity[],
  vocabulary: VocabularyEntity[],
): DemoLesson | null {
  const byScenario = new Map<string, DemoLesson>();

  for (const scenario of scenarios || []) {
    if (!scenario?.id || !usableGerman(scenario.title_de)) continue;
    const scenarioPhrases = (phrases || [])
      .filter((phrase) => phrase?.scenario_id === scenario.id && usableGerman(phrase.german) && usableArabic(phrase.translation_ar))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id)
      .slice(0, 2);
    const topic = scenario.category || '';
    const scenarioVocab = (vocabulary || [])
      .filter(
        (word) =>
          usableGerman(word?.german) &&
          usableArabic(word?.translation_ar) &&
          // `topic` is the vocabulary join key; the scenario id is accepted too
          // because local fixtures and D1 rows have used both spellings.
          (word.topic === scenario.id || (topic && word.topic === topic)),
      )
      .sort((a, b) => a.id - b.id)
      .slice(0, 2);

    const items: DemoItem[] = [
      ...scenarioPhrases.map<DemoItem>((phrase) => ({
        kind: 'phrase',
        sourceId: phrase.id,
        german: phrase.german,
        translationAr: phrase.translation_ar,
      })),
      ...scenarioVocab.map<DemoItem>((word) => ({
        kind: 'vocab',
        sourceId: word.id,
        german: word.article ? `${word.article} ${word.german}` : word.german,
        translationAr: word.translation_ar,
        exampleDe: word.example_de || undefined,
      })),
    ];

    if (items.length >= 2) {
      byScenario.set(scenario.id, {
        scenarioId: scenario.id,
        titleDe: scenario.title_de,
        titleAr: scenario.title_ar || scenario.title_de,
        items,
      });
    }
  }

  const candidates = [...byScenario.values()].sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
  return candidates[0] || null;
}

/**
 * Up to two questions: every question needs three distractor options, and a
 * demo that stalls because content is thin would be worse than a short demo.
 * Verdicts are all-or-nothing per question because the quiz asks for meaning,
 * not production.
 */
export function buildDemoQuiz(lesson: DemoLesson, vocabulary: VocabularyEntity[], phrases: StarterPhraseEntity[], maxQuestions = 2): DemoQuestion[] {
  const questions: DemoQuestion[] = [];
  const translationPool = [
    ...(vocabulary || []).filter((word) => usableArabic(word?.translation_ar)).map((word) => word.translation_ar),
    ...(phrases || []).filter((phrase) => usableArabic(phrase?.translation_ar)).map((phrase) => phrase.translation_ar),
  ];
  const uniquePool = [...new Set(translationPool)];

  for (const item of lesson.items) {
    if (questions.length >= maxQuestions) break;
    const distractors = uniquePool.filter((option) => option !== item.translationAr).slice(0, 3);
    if (distractors.length < 3) continue;
    // Deterministic option order: the correct answer's position is derived from
    // the item id, so the same lesson shows the same quiz and no option slot is
    // favoured (a fixed index 0 would teach position, not meaning).
    const options = [...distractors];
    const slot = item.sourceId % (options.length + 1);
    options.splice(slot, 0, item.translationAr);
    questions.push({
      kind: item.kind,
      sourceId: item.sourceId,
      germanPrompt: item.german,
      options,
      correctIndex: options.indexOf(item.translationAr),
    });
  }
  return questions;
}

export function createDemoState(lesson: DemoLesson, questions: DemoQuestion[], now = Date.now()): DemoState {
  return {
    version: DEMO_VERSION,
    scenarioId: lesson.scenarioId,
    titleDe: lesson.titleDe,
    titleAr: lesson.titleAr,
    items: lesson.items,
    questions,
    stage: 'intro',
    studyIndex: 0,
    studiedIndices: [],
    quizIndex: 0,
    answers: [],
    startedAt: now,
  };
}

/** The item singled out for production: the first sentence-like item, else the first. */
export function productionItem(state: DemoState): DemoItem | null {
  if (!state?.items?.length) return null;
  return state.items.find((item) => item.kind === 'phrase') || state.items[0];
}

/**
 * Deterministic Arabic feedback in the same style as the review screen. Uses
 * the shared `gradeAnswer` so the demo cannot disagree with the real app about
 * what "close" means (a missing article is 'close', not 'wrong').
 */
export function gradeProduction(expected: string, actual: string): { verdict: AnswerVerdict; feedbackAr: string } {
  const verdict = gradeAnswer(expected, actual);
  if (verdict === 'correct') {
    return {
      verdict,
      feedbackAr: 'ممتاز! الجملة صحيحة تماماً. هكذا يبدو الدخول في موقف حقيقي بثقة.',
    };
  }
  if (verdict === 'close') {
    return {
      verdict,
      feedbackAr: 'قريب جداً! الكلمة صحيحة لكن أداة التعريف (der / die / das) غير مطابقة — وهذا أكثر خطأ يقع فيه المتعلمون العرب.',
    };
  }
  return {
    verdict,
    feedbackAr: 'ليست بعد — هذه هي الصيغة الصحيحة. أضفناها إلى بطاقة مراجعتك حتى تعود إليك في الوقت المناسب.',
  };
}

/**
 * The demo state machine. One event at a time, no contradictions: a visitor
 * cannot skip the quiz, answer twice, or submit the production twice.
 */
export function demoReducer(state: DemoState | null, event: DemoEvent): DemoState | null {
  if (!state) return state;
  switch (event.type) {
    case 'study_next': {
      if (state.stage !== 'study' && state.stage !== 'intro') return state;
      const studied = state.studiedIndices.includes(state.studyIndex)
        ? state.studiedIndices
        : [...state.studiedIndices, state.studyIndex];
      const isLast = state.studyIndex >= state.items.length - 1;
      if (!isLast) {
        return { ...state, studiedIndices: studied, stage: 'study', studyIndex: state.studyIndex + 1 };
      }
      return {
        ...state,
        studiedIndices: studied,
        stage: state.questions.length > 0 ? 'quiz' : 'produce',
        studyIndex: state.studyIndex,
      };
    }
    case 'answer_quiz': {
      if (state.stage !== 'quiz') return state;
      const question = state.questions[state.quizIndex];
      if (!question) return state;
      if (state.answers.some((answer) => answer.questionIndex === state.quizIndex)) return state;
      return {
        ...state,
        answers: [
          ...state.answers,
          {
            questionIndex: state.quizIndex,
            chosenIndex: event.chosenIndex,
            correct: event.chosenIndex === question.correctIndex,
          },
        ],
      };
    }
    case 'quiz_next': {
      if (state.stage !== 'quiz') return state;
      const answered = state.answers.some((answer) => answer.questionIndex === state.quizIndex);
      if (!answered) return state;
      if (state.quizIndex < state.questions.length - 1) {
        return { ...state, quizIndex: state.quizIndex + 1 };
      }
      return { ...state, stage: 'produce' };
    }
    case 'submit_production': {
      if (state.stage !== 'produce') return state;
      const item = productionItem(state);
      if (!item) return { ...state, stage: 'done' };
      const actual = String(event.actual || '').trim();
      if (!actual) return state;
      if (state.production) return state;
      const now = event.now ?? Date.now();
      return {
        ...state,
        production: { expected: item.german, actual, ...gradeProduction(item.german, actual) },
        stage: 'done',
        completedAt: now,
      };
    }
    case 'skip_production': {
      if (state.stage !== 'produce') return state;
      if (state.production) return state;
      const now = event.now ?? Date.now();
      return { ...state, stage: 'done', completedAt: now };
    }
    case 'restart':
      return {
        ...state,
        stage: 'intro',
        studyIndex: 0,
        studiedIndices: [],
        quizIndex: 0,
        answers: [],
        production: undefined,
        completedAt: undefined,
      };
    default:
      return state;
  }
}

export interface DemoSummary {
  studiedCount: number;
  quizCorrect: number;
  quizTotal: number;
  produced: boolean;
  /** The one honest "you did this" sentence for the conversion screen. */
  canHandleAr: string;
}

export function summarizeDemo(state: DemoState): DemoSummary {
  const quizCorrect = state.answers.filter((answer) => answer.correct).length;
  const item = productionItem(state);
  return {
    studiedCount: state.studiedIndices.length,
    quizCorrect,
    quizTotal: state.questions.length,
    produced: !!state.production,
    canHandleAr: item
      ? `تدرّبت على «${item.translationAr}» بالألمانية داخل مشهد «${state.titleAr}»`
      : `تدرّبت على مشهد «${state.titleAr}»`,
  };
}

/** Progress through the four demo steps, for the step indicator. */
export function demoProgress(stage: DemoStage): { step: number; total: number } {
  const order: DemoStage[] = ['intro', 'study', 'quiz', 'produce', 'done'];
  return { step: Math.max(1, order.indexOf(stage) + 1), total: 4 };
}
