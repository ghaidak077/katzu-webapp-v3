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
 * The ten units, in path order. Every served id appears exactly once.
 *
 * Titles are plain Arabic; the outcome line is what the unit has the learner
 * practise — never a promise about fluency, a result or a certificate.
 */
export const UNITS: Unit[] = [
  unit(
    'u1-first-words',
    'أول كلماتك',
    'في هذه الوحدة تتدرّب على التحيات والأرقام والأسعار والطلب في المقهى والمخبز والسوق والمطعم.',
    'A1',
    ['general', 'family', 'travel'],
    [
      'first_greetings',
      'numbers_and_prices',
      'cafe_order',
      'bakery_shopping',
      'supermarket_checkout',
      'restaurant_besonders',
    ],
  ),
  unit(
    'u2-embassy-arrival',
    'من السفارة إلى ألمانيا',
    'في هذه الوحدة تتدرّب على موعد السفارة والجوازات والوثائق والوصول في المطار والتنقّل بالقطار.',
    'A1',
    ['family', 'travel', 'general'],
    ['embassy_appointment', 'pass_und_dokumente', 'airport_arrival', 'train_station', 'train_first_ride'],
  ),
  unit(
    'u3-paperwork',
    'أوراقك ومعاملاتك',
    'في هذه الوحدة تتدرّب على التسجيل في البلدية وملء النماذج وفتح حساب بنكي وحجز موعد للامتحان.',
    'A1',
    ['family', 'general', 'work'],
    ['anmeldung_buergeramt', 'letters_and_forms', 'banking_first_visit', 'pruefung_anmeldung'],
  ),
  unit(
    'u4-new-home',
    'بيت جديد',
    'في هذه الوحدة تتدرّب على معاينة شقة وقراءة عقد الإيجار والتسليم والمتابعة مع المؤجّر.',
    'A2',
    ['family', 'general', 'work'],
    ['apartment_viewing', 'wohnung_besichtigen_tiefer', 'mietvertrag_uebergabe', 'landlord_followup'],
  ),
  unit(
    'u5-health',
    'صحتك ومواعيدك',
    'في هذه الوحدة تتدرّب على زيارة الطبيب وحجز المواعيد والتأمين الصحي والحديث عن صحتك.',
    'A2',
    ['general', 'family', 'work'],
    ['doctor_visit', 'termin_online_buchen', 'krankenkasse_anmelden', 'gesundheit_alltag', 'patient_conversation_basics'],
  ),
  unit(
    'u6-work-people',
    'العمل والناس',
    'في هذه الوحدة تتدرّب على أول يوم عمل وحديث الزملاء والكانتين ولقاء صديق.',
    'A2',
    ['work', 'general', 'family'],
    ['erster_arbeitstag', 'kollegen_smalltalk', 'betriebs_kantine', 'friend_catchup'],
  ),
  unit(
    'u7-office',
    'في المكتب',
    'في هذه الوحدة تتدرّب على تسليم المناوبة والاجتماع القصير والتحدّث مع الدعم في المكتب.',
    'B1',
    ['work', 'study'],
    ['station_uebergabe', 'buero_gespraech_tiefer', 'daily_standup', 'support_ticket', 'tech_kuechenpause'],
  ),
  unit(
    'u8-training',
    'التدريب والاعتراف بشهادتك',
    'في هذه الوحدة تتدرّب على التقدّم للتدريب ويوم المدرسة المهنية وإجراءات الاعتراف بشهادتك.',
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
    'u9-interviews',
    'مقابلات العمل',
    'في هذه الوحدة تتدرّب على أسئلة مقابلة العمل وشرح خبرتك في مجالك.',
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
    'u10-exam-style',
    'محادثة بأسلوب الامتحان',
    'في هذه الوحدة تتدرّب على الحديث بأسلوب الامتحان الشفوي — تدريب فقط، لا يمنح شهادة.',
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
