import type { ArrivalStatus, CEFRLevel, ScenarioEntity } from '@/types/models';
import type { UiLanguage } from '@/lib/i18n/languages';
import { translate, type UiStringKey } from '@/lib/i18n/strings';

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
  /**
   * Where this happens, e.g. "مقهى في برلين".
   *
   * The `*Ar` suffixes below are historical: every one of these fields holds the
   * text in the language the caller asked for (`BuildStoryInput.language`), which
   * is Arabic when no language is passed. Renaming them is a separate, mechanical
   * change; keeping the names is what let the language work land without touching
   * the tests and docs that already named them.
   */
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
export const PERSONA_ROLES: Array<{ keywords: string[]; roleAr: string; roleKey: UiStringKey }> = [
  // Airport first: it is the story's opening scene, and a border officer is not
  // the generic "موظف في الدائرة الرسمية" the `beamte` entry below would give.
  { keywords: ['grenz', 'zoll', 'passkontrolle', 'flughafen'], roleAr: 'موظف جوازات المطار', roleKey: 'story.role.border' },
  { keywords: ['barista', 'café', 'cafe'], roleAr: 'عامل المقهى', roleKey: 'story.role.cafe' },
  { keywords: ['bäcker', 'baecker', 'baker'], roleAr: 'الخبّاز', roleKey: 'story.role.baker' },
  { keywords: ['doktor', 'arzt', 'doctor'], roleAr: 'الطبيب', roleKey: 'story.role.doctor' },
  { keywords: ['vermieter', 'landlord'], roleAr: 'صاحب الشقة', roleKey: 'story.role.landlord' },
  { keywords: ['chef', 'personal', 'hr'], roleAr: 'مسؤول التوظيف', roleKey: 'story.role.hiring' },
  { keywords: ['bahn', 'schaffner', 'train'], roleAr: 'موظف الاستعلامات في المحطة', roleKey: 'story.role.station' },
  { keywords: ['beamte', 'amt', 'verwaltung'], roleAr: 'موظف في الدائرة الرسمية', roleKey: 'story.role.official' },
  // V23: roles for the new module categories. An examiner plays by exam rules
  // (timing, tasks, no advice) — a label that says "موظف" would misread the scene.
  { keywords: ['prüfer', 'pruefer', 'prüfungspartner', 'pruefungspartner', 'examiner'], roleAr: 'ممتحن في الامتحان التجريبي', roleKey: 'story.role.examiner' },
  { keywords: ['dozent', 'lektor', 'professor', 'seminar'], roleAr: 'أستاذ في الدورة اللغوية', roleKey: 'story.role.teacher' },
  { keywords: ['visum', 'botschaft', 'konsulat'], roleAr: 'موظف شؤون التأشيرات', roleKey: 'story.role.visa' },
  { keywords: ['handwerker', 'meister', 'werkstatt'], roleAr: 'حرفي أو فني صيانة', roleKey: 'story.role.tradesperson' },
  { keywords: ['nachbar', 'neighbor'], roleAr: 'جارك', roleKey: 'story.role.neighbour' },
  { keywords: ['kollege', 'colleague'], roleAr: 'زميلك في العمل', roleKey: 'story.role.colleague' },
];

function roleFor(persona: string | undefined, language: UiLanguage = 'ar'): string {
  const value = String(persona || '').toLowerCase();
  const match = PERSONA_ROLES.find((entry) => entry.keywords.some((keyword) => value.includes(keyword)));
  return translate(language, match?.roleKey || 'story.role.other');
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
  /** The UI language every sentence is written in. Arabic by default. */
  language?: UiLanguage;
}

export function buildStorySetup(input: BuildStoryInput): StorySetup {
  const { scenario, level, locationAr, whyAr, returning = false } = input;
  const language = input.language ?? 'ar';
  const opening = openingFor(scenario, level);
  const who = roleFor(scenario.ai_persona, language);
  const name = learnerName(input.displayName);
  // The comma after the name belongs to the sentence, so it lives in the
  // dictionary entry (`story.situation.named`), not in a concatenation here.
  const situationAr = returning
    ? translate(language, 'story.situation.returning', { location: locationAr })
    : name
      ? translate(language, 'story.situation.named', { name, location: locationAr, who })
      : translate(language, 'story.situation.plain', { location: locationAr, who });

  return {
    locationAr,
    situationAr,
    whoAr: who,
    whyAr,
    taskAr: input.taskAr || translate(language, 'story.task', { who }),
    openingDe: opening.text,
    openingLevel: opening.level,
    katzuAr: katzuOpeningLine({
      name,
      arrivalStatus: input.arrivalStatus,
      returning,
      language,
    }),
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
 *
 * The name separator and the correction language are interpolated rather than
 * concatenated: an English sentence does not open on an Arabic comma, and
 * "سأصحّح لك بالعربية" has to become "I will correct you in English" when that
 * is the language being read.
 */
function katzuOpeningLine(input: {
  name: string | null;
  arrivalStatus?: ArrivalStatus | null;
  returning: boolean;
  language: UiLanguage;
}): string {
  const { language } = input;
  if (input.returning) return translate(language, 'story.katzu.returning');

  // Arabic writes «ياسمين،» with the Arabic comma; English writes «Yasmin,» with
  // the Latin one. Concatenating the wrong one is the smallest possible tell
  // that a screen was translated rather than written.
  const vocative = input.name ? `${input.name}${language === 'ar' ? '، ' : ', '}` : '';
  const role = translate(language, input.name ? 'story.katzu.roleWithName' : 'story.katzu.roleGeneric');
  const correctionLanguage =
    language === 'ar' ? 'بالعربية' : language === 'id' ? 'dalam bahasa Indonesia' : 'in English';

  const body =
    input.arrivalStatus === 'preparing'
      ? 'story.katzu.preparing'
      : input.arrivalStatus === 'recently_arrived'
        ? 'story.katzu.arrived'
        : 'story.katzu.default';
  return translate(language, body, { vocative, role, correctionLanguage });
}
