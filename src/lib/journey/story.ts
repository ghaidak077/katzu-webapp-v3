import type { CEFRLevel, ScenarioEntity } from '@/types/models';

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
}

const LEVEL_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2'];

/** Persona strings come from the CMS ("Barista katze"); map them to real roles. */
/** Exported for the test that asserts every known persona maps to a real role. */
export const PERSONA_ROLES: Array<{ keywords: string[]; roleAr: string }> = [
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
}

export function buildStorySetup(input: BuildStoryInput): StorySetup {
  const { scenario, level, locationAr, whyAr, returning = false } = input;
  const opening = openingFor(scenario, level);
  const who = roleFor(scenario.ai_persona);

  const situationAr = returning
    ? `عاد المشهد إلى صندوق مهمتك: أنت الآن في ${locationAr}، والمحادثة تنتظرك من حيث توقفت تقريباً.`
    : `أنت الآن في ${locationAr}. ${who} يقترب منك ويبدأ الحديث بالألمانية.`;

  return {
    locationAr,
    situationAr,
    whoAr: who,
    whyAr,
    taskAr: input.taskAr || `ستتحدث مع ${who} وتُخرج جُملَك بنفسك — بالألمانية، بصوتك أو بكتابتك.`,
    openingDe: opening.text,
    openingLevel: opening.level,
    katzuAr: returning
      ? 'لا نحتاج أن نتذكر كل شيء — سنستمع أولاً، ثم تتحدث أنت.'
      : 'استمع للجملة الأولى مرة أو مرتين. لا تحفظها — فقط تعرّف على الموقف.',
  };
}
