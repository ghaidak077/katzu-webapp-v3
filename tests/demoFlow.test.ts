import { describe, expect, it } from 'vitest';
import {
  buildDemoLesson,
  buildDemoQuiz,
  createDemoState,
  demoReducer,
  gradeProduction,
  productionItem,
  summarizeDemo,
} from '../src/lib/demo/demoFlow';
import { planDemoMigration } from '../src/lib/demo/migration';
import type { ScenarioEntity, StarterPhraseEntity, VocabularyEntity } from '../src/types/models';

const scenarios: ScenarioEntity[] = [
  {
    id: 'cafe_order',
    title_de: 'Im Café bestellen',
    title_ar: 'الطلب في المقهى',
    ai_persona: 'Barista',
    category: 'food',
    icon: 'coffee',
    initial_message_a1: 'Hallo!',
    initial_message_a2: 'Hallo!',
    initial_message_b1: 'Hallo!',
    initial_message_b2: 'Hallo!',
  },
  {
    id: 'doctor_visit',
    title_de: 'Beim Arzt',
    title_ar: 'عند الطبيب',
    ai_persona: 'Arzt',
    category: 'health',
    icon: 'heart',
    initial_message_a1: 'Guten Tag.',
    initial_message_a2: 'Guten Tag.',
    initial_message_b1: 'Guten Tag.',
    initial_message_b2: 'Guten Tag.',
  },
];

const phrases: StarterPhraseEntity[] = [
  {
    id: 1,
    scenario_id: 'cafe_order',
    level: 'A1',
    german: 'Ich möchte bitte einen Kaffee.',
    translation_en: 'I want a coffee.',
    translation_ar: 'أريد قهوة من فضلك.',
    sort_order: 1,
  },
  {
    id: 2,
    scenario_id: 'cafe_order',
    level: 'A1',
    german: 'Wie viel kostet das?',
    translation_en: 'How much is that?',
    translation_ar: 'كم يكلف هذا؟',
    sort_order: 2,
  },
  {
    id: 7,
    scenario_id: 'doctor_visit',
    level: 'A1',
    german: 'Mein Kopf tut weh.',
    translation_en: 'My head hurts.',
    translation_ar: 'رأسي يؤلمني.',
    sort_order: 1,
  },
];

const vocabulary: VocabularyEntity[] = [
  {
    id: 1,
    german: 'Kaffee',
    article: 'der',
    plural: 'Kaffees',
    part_of_speech: 'Noun',
    translation_ar: 'قهوة',
    translation_en: 'Coffee',
    example_de: 'Der Kaffee ist heiß.',
    example_ar: 'القهوة ساخنة.',
    topic: 'food',
    level: 'A1',
  },
  {
    id: 3,
    german: 'Rechnung',
    article: 'die',
    plural: 'Rechnungen',
    part_of_speech: 'Noun',
    translation_ar: 'فاتورة',
    translation_en: 'Bill',
    example_de: 'Die Rechnung bitte.',
    example_ar: 'الفاتورة من فضلك.',
    topic: 'cafe_order',
    level: 'A1',
  },
  {
    id: 6,
    german: 'Schmerz',
    article: 'der',
    plural: 'Schmerzen',
    part_of_speech: 'Noun',
    translation_ar: 'ألم',
    translation_en: 'Pain',
    example_de: 'Ich habe Schmerzen.',
    example_ar: 'لدي ألم.',
    topic: 'health',
    level: 'A1',
  },
];

describe('demo lesson', () => {
  it('selects the first scenario that has both phrases and vocabulary', () => {
    const lesson = buildDemoLesson(scenarios, phrases, vocabulary);
    expect(lesson?.scenarioId).toBe('cafe_order');
    expect(lesson?.items.some((item) => item.kind === 'phrase')).toBe(true);
    expect(lesson?.items.some((item) => item.kind === 'vocab')).toBe(true);
  });

  it('returns null instead of inventing content when nothing is usable', () => {
    expect(buildDemoLesson([], [], [])).toBeNull();
    expect(buildDemoLesson(scenarios, [], [])).toBeNull();
  });

  it('builds a deterministic quiz whose marked answer is the real translation', () => {
    const lesson = buildDemoLesson(scenarios, phrases, vocabulary)!;
    const quiz = buildDemoQuiz(lesson, vocabulary, phrases);
    expect(quiz.length).toBeGreaterThan(0);
    for (const question of quiz) {
      expect(question.options).toHaveLength(4);
      const item = lesson.items.find((candidate) => candidate.sourceId === question.sourceId);
      expect(question.options[question.correctIndex]).toBe(item?.translationAr);
    }
    expect(buildDemoQuiz(lesson, vocabulary, phrases)).toEqual(quiz);
  });
});

describe('demo state machine', () => {
  const lesson = buildDemoLesson(scenarios, phrases, vocabulary)!;
  const quiz = buildDemoQuiz(lesson, vocabulary, phrases);

  it('walks study → quiz → produce → done once', () => {
    let state = createDemoState(lesson, quiz, 1);
    expect(state.stage).toBe('intro');
    state = demoReducer(state, { type: 'study_next' });
    expect(state.stage).toBe('study');
    while (state.stage === 'study') {
      state = demoReducer(state, { type: 'study_next' });
    }
    expect(state.stage).toBe('quiz');

    state = demoReducer(state, { type: 'quiz_next' });
    expect(state.stage).toBe('quiz'); // not answered yet — no skipping

    state = demoReducer(state, { type: 'answer_quiz', chosenIndex: 0 });
    const duplicate = demoReducer(state, { type: 'answer_quiz', chosenIndex: 1 });
    expect(duplicate.answers).toHaveLength(1); // one answer per question, ever

    while (state.stage === 'quiz') {
      state = demoReducer(state, { type: 'answer_quiz', chosenIndex: state.questions[state.quizIndex]?.correctIndex ?? 0 });
      state = demoReducer(state, { type: 'quiz_next' });
    }
    expect(state.stage).toBe('produce');

    const item = productionItem(state)!;
    state = demoReducer(state, { type: 'submit_production', actual: item.german, now: 2 });
    expect(state.stage).toBe('done');
    expect(state.production?.verdict).toBe('correct');

    // A second submit cannot overwrite the recorded attempt.
    const again = demoReducer(state, { type: 'submit_production', actual: 'etwas anderes' });
    expect(again.production?.actual).toBe(item.german);
  });

  it('blocks an empty production submission', () => {
    let state = createDemoState(lesson, quiz, 1);
    state = { ...state, stage: 'produce' };
    const next = demoReducer(state, { type: 'submit_production', actual: '   ' });
    expect(next.production).toBeUndefined();
    expect(next.stage).toBe('produce');
  });

  it('allows an honest skip and still completes', () => {
    let state = { ...createDemoState(lesson, quiz, 1), stage: 'produce' as const };
    state = demoReducer(state, { type: 'skip_production', now: 3 });
    expect(state.stage).toBe('done');
    expect(state.production).toBeUndefined();
    expect(state.completedAt).toBe(3);
  });

  it('grades production with the same rules as the real review engine', () => {
    expect(gradeProduction('Der Kaffee ist heiß.', 'Der Kaffee ist heiß.').verdict).toBe('correct');
    expect(gradeProduction('die Rechnung', 'Rechnung').verdict).toBe('close');
    expect(gradeProduction('Ich möchte einen Kaffee', 'Ich will Bier').verdict).toBe('wrong');
    expect(gradeProduction('die Rechnung', 'Rechnung').feedbackAr).toContain('der');
  });
});

describe('demo → account migration', () => {
  const lesson = buildDemoLesson(scenarios, phrases, vocabulary)!;
  const quiz = buildDemoQuiz(lesson, vocabulary, phrases);

  function completedState() {
    let state = createDemoState(lesson, quiz, 1);
    while (state.stage !== 'done') {
      if (state.stage === 'intro' || state.stage === 'study') state = demoReducer(state, { type: 'study_next' });
      else if (state.stage === 'quiz') {
        state = demoReducer(state, {
          type: 'answer_quiz',
          chosenIndex: state.questions[state.quizIndex]?.correctIndex ?? 0,
        });
        state = demoReducer(state, { type: 'quiz_next' });
      } else {
        state = demoReducer(state, { type: 'skip_production', now: 42 });
      }
    }
    return state;
  }

  it('refuses to migrate an unfinished demo', () => {
    const state = createDemoState(lesson, quiz, 1);
    expect(planDemoMigration(state)).toBeNull();
    expect(planDemoMigration(null)).toBeNull();
  });

  it('migrates only the studied content and the study timestamp — never scores', () => {
    const state = completedState();
    const plan = planDemoMigration(state)!;
    expect(plan).not.toBeNull();
    expect(plan.scenarioId).toBe('cafe_order');
    expect(plan.studiedAt).toBe(state.completedAt);
    expect(plan.vocabSourceIds.length + plan.phraseSourceIds.length).toBeGreaterThan(0);
    // No score, accuracy, quiz result or verdict may cross into the account.
    expect(JSON.stringify(plan)).not.toContain('correct');
    expect(JSON.stringify(plan)).not.toContain('verdict');
  });

  it('summarises the demo honestly', () => {
    const summary = summarizeDemo(completedState());
    expect(summary.quizTotal).toBeGreaterThan(0);
    expect(summary.studiedCount).toBeGreaterThan(0);
    expect(summary.canHandleAr).toContain('تدرّبت');
  });
});
