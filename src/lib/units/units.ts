import type { CEFRLevel, LearnerGoal } from '@/types/models';

/**
 * The unit map — the one ladder the learner climbs.
 *
 * WHY A UNIT AND NOT A LEVEL SCREEN
 * Levels are a measurement, not a plan. A learner who is told «B1» still does
 * not know what to do after breakfast. A unit is small enough to finish in a
 * handful of sittings and specific enough to answer «what can I do now?»: it
 * names a slice of the journey and an outcome, and it owns the exact served
 * scenarios that deliver it.
 *
 * The 49 ids are the ones the Worker actually serves (same source as the
 * served-opener gate). The authored 61-row catalogue is not the contract: a
 * scenario that reaches a learner must be in exactly one unit, or the gate
 * reddens. `scripts/audit-unit-coverage.mjs` and `tests/units.test.ts` both
 * check that rule.
 *
 * Ordering is level first, then goal, then the authored order. Goal reordering
 * therefore never jumps an A2 unit ahead of an unfinished A1 unit — it only
 * decides which unit inside the same level comes first.
 */

/** The five signup goals, in the order the question shows them. */
export type UnitGoal = 'family' | 'work' | 'study' | 'travel' | 'general';

export const UNIT_GOALS: UnitGoal[] = ['family', 'work', 'study', 'travel', 'general'];

export const UNIT_GOAL_LABEL_AR: Record<UnitGoal, string> = {
  family: 'لمّ الشمل',
  work: 'العمل',
  study: 'الدراسة',
  travel: 'السفر',
  general: 'عام',
};

export type UnitLevel = Exclude<CEFRLevel, 'A0'>;

/**
 * Bridge the stored profile goal to the unit goal tags.
 *
 * Old rows carry `daily_life | work | university | exam`; new signups carry
 * `family | work | study | travel | general`. Both resolve here, so a learner
 * who signed up last year gets the same reordering a new one does, and no row
 * has to be rewritten.
 */
export function unitGoalForLearnerGoal(goal?: LearnerGoal | null): UnitGoal | undefined {
  switch (goal) {
    case 'family':
      return 'family';
    case 'work':
      return 'work';
    case 'university':
    case 'exam':
    case 'study':
      return 'study';
    case 'travel':
      return 'travel';
    case 'daily_life':
    case 'general':
      return 'general';
    default:
      return undefined;
  }
}

/** Level order as the learner meets it. */
export const UNIT_LEVEL_ORDER: UnitLevel[] = ['A1', 'A2', 'B1', 'B2'];

export interface Unit {
  /** Stable id, used by tests and analytics — never a display string. */
  id: string;
  titleAr: string;
  /** One finished sentence, shown verbatim under the title. */
  outcomeAr: string;
  level: UnitLevel;
  goalTags: UnitGoal[];
  /**
   * Scenarios in the order the learner meets them. Checkpoint scenarios are
   * always last; the loader below enforces that rather than trusting authors.
   */
  scenarioIds: string[];
}

/** A checkpoint is exam-style evidence, and it never leads a unit. */
export function isCheckpointScenario(scenarioId: string): boolean {
  return String(scenarioId || '').startsWith('exam_');
}

function unit(
  id: string,
  titleAr: string,
  outcomeAr: string,
  level: UnitLevel,
  goalTags: UnitGoal[],
  scenarioIds: string[],
): Unit {
  return { id, titleAr, outcomeAr, level, goalTags, scenarioIds };
}

/**
 * The nine units, in level order. Every served id appears exactly once.
 *
 * Titles are plain Arabic; the outcome line is what the learner can do after
 * the unit, never a promise about fluency or a certificate.
 */
export const UNITS: Unit[] = [
  unit(
    'u1-first-words',
    'أول كلماتك',
    'بعد هذه الوحدة تستطيع أن تعرّف بنفسك وتطلب ما تحتاجه في المقهى والمتجر.',
    'A1',
    ['general', 'family', 'travel'],
    [
      'first_greetings',
      'numbers_and_prices',
      'letters_and_forms',
      'supermarket_checkout',
      'bakery_shopping',
      'cafe_order',
    ],
  ),
  unit(
    'u2-arrival',
    'الوصول والتنقّل',
    'بعد هذه الوحدة تستطيع أن تصل من المطار وتتحرك بالقطار وتفهم السعر والتذكرة.',
    'A1',
    ['travel', 'general', 'family'],
    ['airport_arrival', 'train_first_ride', 'train_station', 'pass_und_dokumente', 'banking_first_visit'],
  ),
  unit(
    'u3-out-and-about',
    'يومك خارج البيت',
    'بعد هذه الوحدة تستطيع أن تسجّل عنوانك وتحجز موعداً وتتعامل مع الطبيب والصديق والمطعم.',
    'A1',
    ['general', 'family', 'work'],
    ['anmeldung_buergeramt', 'termin_online_buchen', 'doctor_visit', 'friend_catchup', 'restaurant_besonders'],
  ),
  unit(
    'u4-new-home',
    'بيت جديد',
    'بعد هذه الوحدة تستطيع أن تعاين شقة وتوقّع عقداً وتتابع مع المؤجّر وتؤمّن صحتك.',
    'A2',
    ['family', 'general', 'work'],
    [
      'apartment_viewing',
      'wohnung_besichtigen_tiefer',
      'mietvertrag_uebergabe',
      'landlord_followup',
      'krankenkasse_anmelden',
      'gesundheit_alltag',
    ],
  ),
  unit(
    'u5-working-day',
    'العمل والحياة اليومية',
    'بعد هذه الوحدة تستطيع أن تبدأ يوم عملك وتتعامل مع الزملاء والمواعيد الرسمية وحديث المريض.',
    'A2',
    ['work', 'general', 'study'],
    [
      'erster_arbeitstag',
      'kollegen_smalltalk',
      'betriebs_kantine',
      'patient_conversation_basics',
      'embassy_appointment',
      'pruefung_anmeldung',
    ],
  ),
  unit(
    'u6-office',
    'في المكتب',
    'بعد هذه الوحدة تستطيع أن تشارك في اجتماع قصير وتسلّم مناوبة وتتعامل مع مشكلة عميل.',
    'B1',
    ['work', 'study'],
    ['station_uebergabe', 'buero_gespraech_tiefer', 'daily_standup', 'support_ticket', 'tech_kuechenpause'],
  ),
  unit(
    'u7-training',
    'التدريب والمدرسة',
    'بعد هذه الوحدة تستطيع أن تتقدم لمقعد تدريب وتتابع يوم المدرسة المهنية وتفهم إجراءات معادلة الشهادات.',
    'B1',
    ['work', 'study'],
    [
      'bewerbung_ausbildung',
      'ausbildung_alltag',
      'berufsschule_tag',
      'pruefungstag',
      'anerkennung_gespraech',
      'anerkennung_it_zertifikate',
    ],
  ),
  unit(
    'u8-interview',
    'مقابلة العمل',
    'بعد هذه الوحدة تستطيع أن تخوض مقابلة عمل في مجالك وتشرح خبرتك ومهاراتك.',
    'B1',
    ['work', 'study'],
    [
      'job_interview',
      'interview_pflegefachkraft',
      'interview_arzt',
      'interview_it_fachkraft',
      'interview_entwickler',
    ],
  ),
  unit(
    'u9-exam',
    'استعداد الامتحان',
    'بعد هذه الوحدة تستطيع أن تتعامل مع أسئلة الامتحان الشفوي: التعريف، الخبرات، التخطيط، العرض، والتفاعل.',
    'B2',
    ['study', 'work', 'family'],
    [
      'exam_sich_vorstellen',
      'exam_erfahrungen_sprechen',
      'exam_gemeinsam_planen',
      'exam_thema_praesentieren',
      'exam_auf_partner_reagieren',
    ],
  ),
];

/** Checkpoint-last, stable within the authored order. */
export function orderUnitScenarios(scenarioIds: string[]): string[] {
  return [...scenarioIds].sort(
    (a, b) => Number(isCheckpointScenario(a)) - Number(isCheckpointScenario(b)),
  );
}

const UNIT_BY_SCENARIO = new Map<string, Unit>();
for (const entry of UNITS) {
  entry.scenarioIds = orderUnitScenarios(entry.scenarioIds);
  for (const scenarioId of entry.scenarioIds) {
    if (!UNIT_BY_SCENARIO.has(scenarioId)) UNIT_BY_SCENARIO.set(scenarioId, entry);
  }
}

/** The one unit that owns a served scenario, or undefined for an unknown id. */
export function unitForScenario(scenarioId: string): Unit | undefined {
  return UNIT_BY_SCENARIO.get(String(scenarioId || ''));
}

/** Every scenario id in level order. Used by the coverage gate and the tests. */
export function allUnitScenarioIds(): string[] {
  return UNITS.flatMap((entry) => entry.scenarioIds);
}

/** How many scenarios a unit owns — the denominator in «3 من 6». */
export function unitSize(unit: Pick<Unit, 'id'>): number {
  return unitById(unit.id)?.scenarioIds.length ?? 0;
}

export function unitById(unitId: string): Unit | undefined {
  return UNITS.find((entry) => entry.id === unitId);
}

function goalRank(unitEntry: Unit, goal: UnitGoal | undefined | null): number {
  if (!goal) return 0;
  const index = unitEntry.goalTags.indexOf(goal);
  return index === -1 ? UNIT_GOALS.length : index;
}

function levelRank(level: UnitLevel): number {
  const index = UNIT_LEVEL_ORDER.indexOf(level);
  return index === -1 ? UNIT_LEVEL_ORDER.length : index;
}

/**
 * Units in the order this learner meets them: level, then goal fit, then the
 * authored order. Deterministic, and never mutates `UNITS`.
 */
export function orderedUnits(goal?: UnitGoal | null): Unit[] {
  return [...UNITS].sort((a, b) => {
    const byLevel = levelRank(a.level) - levelRank(b.level);
    if (byLevel !== 0) return byLevel;
    const byGoal = goalRank(a, goal) - goalRank(b, goal);
    if (byGoal !== 0) return byGoal;
    return UNITS.indexOf(a) - UNITS.indexOf(b);
  });
}

/** The first unit a learner at this level should meet. A0 joins at A1. */
export function startUnitIndexForLevel(level: CEFRLevel | undefined | null): number {
  const target: UnitLevel = !level || level === 'A0' ? 'A1' : level;
  const index = orderedUnits().findIndex((entry) => entry.level === target);
  return index === -1 ? 0 : index;
}

/**
 * The scenario order from the learner's starting unit onward, with checkpoint
 * scenarios still last inside their own unit.
 */
export function learnerScenarioOrder(
  level: CEFRLevel | undefined | null,
  goal?: UnitGoal | null,
): string[] {
  const units = orderedUnits(goal);
  const start = startUnitIndexForLevel(level);
  return units.slice(start).flatMap((entry) => entry.scenarioIds);
}

/** Which unit in the learner's ordered path owns this scenario. */
export function learnerUnitIndex(
  scenarioId: string,
  level: CEFRLevel | undefined | null,
  goal?: UnitGoal | null,
): number {
  const unitEntry = unitForScenario(scenarioId);
  if (!unitEntry) return -1;
  const units = orderedUnits(goal);
  const start = startUnitIndexForLevel(level);
  return units.findIndex((entry, index) => index >= start && entry.id === unitEntry.id);
}
