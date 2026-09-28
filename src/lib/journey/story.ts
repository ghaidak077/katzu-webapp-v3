import type { ArrivalStatus, CEFRLevel, ScenarioEntity } from '@/types/models';

/**
 * The episode opening.
 *
 * Everything here comes from content the app already has: the scenario's own
 * German opener for the learner's level, its Arabic title, its persona. Nothing
 * is generated text and nothing is invented — the story setup introduces a real
 * situation the learner is about to walk into, which is what makes it an episode
 * opening rather than a second start screen.
 */

export interface StorySetup {
  /** Where this happens, in Arabic, e.g. "مقهى في برلين". */
  locationAr: string;
  /** What is happening right now. */
  situationAr: string;
  /** Who the learner will speak to. */
  whoAr: string;
  /** Why it matters today. */
  whyAr: string;
  /** Mission restatement: the concrete task. */
  taskAr: string;
  /** The character's German opener, level-appropriate. */
  openingDe: string;
  /** Which level's opener was actually used (it may fall back below the learner's). */
  openingLevel: CEFRLevel;
  /** One line Katzu says before the learner starts. */
  katzuAr: string;
  /**
   * The learner's own name, when the profile holds a real one. `null` means
   * "no name to use" — never an empty string the UI has to guard against, and
   * never the seeded placeholder, which would address everyone as "explorer".
   */
  learnerName: string | null;
}

/**
 * The seeded/none names that must never be spoken back to the learner.
 *
 * `كجد` is the row `initializeDatabaseSeed` writes before sign-in; greeting a
 * signed-in learner with it would be the app mistaking a placeholder for a name.
 */
const PLACEHOLDER_NAMES = new Set(['مستكشف كَاتْزُو', 'طالب كَاتْزُو', 'متعلّم كاتزو', 'Katzu']);

/**
 * The learner's name, ready to be addressed by — or `null`.
 *
 * First whitespace-separated token only: a Google display name is often a full
 * legal name, and a language app that greets you by your full name reads like a
 * form, not a friend. Anything email-shaped is refused outright, for the same
 * reason `sanitizeDisplayName` refuses it on the share card.
 */
export function learnerName(displayName: string | null | undefined): string | null {
  const raw = String(displayName || '').trim();
  if (!raw || raw.includes('@')) return null;
  if (PLACEHOLDER_NAMES.has(raw)) return null;
  const first = raw.split(/\s+/)[0] || '';
  if (!first || PLACEHOLDER_NAMES.has(first)) return null;
  return first;
}

const LEVEL_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2'];

/** Persona strings come from the CMS ("Barista katze"); map them to real roles. */
/** Exported for the test that asserts every known persona maps to a real role. */
export const PERSONA_ROLES: Array<{ keywords: string[]; roleAr: string }> = [
  // Airport first: it is the story's opening scene, and a border officer is not
  // the generic "موظف في الدائرة الرسمية" the `beamte` entry below would give.
  { keywords: ['grenz', 'zoll', 'passkontrolle', 'flughafen'], roleAr: 'موظف جوازات المطار' },
  { keywords: ['barista', 'café', 'cafe'], roleAr: 'عامل المقهى' },
  { keywords: ['bäcker', 'baecker', 'baker'], roleAr: 'الخبّاز' },
  { keywords: ['doktor', 'arzt', 'doctor'], roleAr: 'الطبيب' },
  { keywords: ['vermieter', 'landlord'], roleAr: 'صاحب الشقة' },
  { keywords: ['chef', 'personal', 'hr'], roleAr: 'مسؤول التوظيف' },
  { keywords: ['bahn', 'schaffner', 'train'], roleAr: 'موظف الاستعلامات في المحطة' },
  { keywords: ['beamte', 'amt', 'verwaltung'], roleAr: 'موظف في الدائرة الرسمية' },
  { keywords: ['nachbar', 'neighbor'], roleAr: 'جارك' },
  { keywords: ['kollege', 'colleague'], roleAr: 'زميلك في العمل' },
];

function roleFor(persona: string | undefined): string {
  const value = String(persona || '').toLowerCase();
  const match = PERSONA_ROLES.find((entry) => entry.keywords.some((keyword) => value.includes(keyword)));
  return match?.roleAr || 'شخص ألماني في هذا الموقف';
}

/**
 * The opener the learner will actually hear. Falling back *below* their level is
 * deliberate: hearing an easier sentence is a usable start, whereas hearing
 * nothing at all is a broken episode.
 */
export function openingFor(scenario: ScenarioEntity, level: CEFRLevel): { text: string; level: CEFRLevel } {
  const startIndex = Math.max(0, LEVEL_ORDER.indexOf(level));
  for (let index = startIndex; index >= 0; index -= 1) {
    const candidate = LEVEL_ORDER[index];
    const value = (scenario as unknown as Record<string, string | undefined>)[`initial_message_${candidate.toLowerCase()}`];
    if (value && value.trim()) return { text: value.trim(), level: candidate };
  }
  for (let index = startIndex + 1; index < LEVEL_ORDER.length; index += 1) {
    const candidate = LEVEL_ORDER[index];
    const value = (scenario as unknown as Record<string, string | undefined>)[`initial_message_${candidate.toLowerCase()}`];
    if (value && value.trim()) return { text: value.trim(), level: candidate };
  }
  return { text: '', level };
}

export interface BuildStoryInput {
  scenario: ScenarioEntity;
  level: CEFRLevel;
  /** Arabic location label from the scene model. */
  locationAr: string;
  /** The "why today" line the mission selector justified. */
  whyAr: string;
  /** The concrete task for the mission that sent the learner here. */
  taskAr?: string;
  /** True when the learner resumed an episode they already started. */
  returning?: boolean;
  /** The learner's display name, straight from the profile row. */
  displayName?: string | null;
  /** Where they are in the move; it decides what Katzu says first. */
  arrivalStatus?: ArrivalStatus | null;
}

export function buildStorySetup(input: BuildStoryInput): StorySetup {
  const { scenario, level, locationAr, whyAr, returning = false } = input;
  const opening = openingFor(scenario, level);
  const who = roleFor(scenario.ai_persona);
  const name = learnerName(input.displayName);
  // "ياسمين، " when the profile holds a real name; nothing at all otherwise, so
  // the sentence never opens on a stray comma.
  const vocative = name ? `${name}، ` : '';

  const situationAr = returning
    ? `عاد المشهد إلى صندوق مهمتك: أنت الآن في ${locationAr}، والمحادثة تنتظرك من حيث توقفت تقريباً.`
    : name
      ? `${vocative}أنت الآن في ${locationAr}. ${who} يقترب منك ويبدأ الحديث بالألمانية.`
      : `أنت الآن في ${locationAr}. ${who} يقترب منك ويبدأ الحديث بالألمانية.`;

  return {
    locationAr,
    situationAr,
    whoAr: who,
    whyAr,
    taskAr: input.taskAr || `ستتحدث مع ${who} وتُخرج جُملَك بنفسك — بالألمانية، بصوتك أو بكتابتك.`,
    openingDe: opening.text,
    openingLevel: opening.level,
    katzuAr: katzuOpeningLineAr({ name, arrivalStatus: input.arrivalStatus, returning }),
    learnerName: name,
  };
}

/**
 * Katzu's first words — the friend at the learner's side, not a system notice.
 *
 * Three things are allowed to change this line, and nothing else: whether the
 * learner has a real name, where they are in the move, and whether this is a
 * new episode or a return to one. A learner still packing gets a promise, one who
 * just landed gets the arrival, and one already living here gets the practical
 * framing — which is the difference between a companion and a slogan.
 */
function katzuOpeningLineAr(input: {
  name: string | null;
  arrivalStatus?: ArrivalStatus | null;
  returning: boolean;
}): string {
  if (input.returning) return 'لا نحتاج أن نتذكر كل شيء — سنستمع أولاً، ثم تتحدث أنت.';

  const vocative = input.name ? `${input.name}، ` : '';
  const role = vocative ? `أنا كَاتْزُو، رفيقك هنا. ` : 'أنا كَاتْزُو، رفيقك في هذه الرحلة. ';

  if (input.arrivalStatus === 'preparing') {
    return `${vocative}${role}سنتدرّب على هذا الموقف قبل أن تقف فيه فعلاً — بلا ضغط وبلا حكم.`;
  }
  if (input.arrivalStatus === 'recently_arrived') {
    return `${vocative}${role}وصلت حديثاً، فلنبدأ بأول موقف ستقابله هنا.`;
  }
  return `${vocative}${role}استمع للجملة الأولى مرة أو مرتين، ثم تحدّث أنت — سأصحّح لك بالعربية بعدها.`;
}
