import type { ScenarioEntity } from '@/types/models';

/**
 * D1 vocabulary is organized by *topic* (food, documents, health, housing,
 * work), while scenarios are keyed by *id* (cafe_order, embassy_appointment,
 * job_interview, doctor_visit, apartment_viewing). Scenarios carry their
 * `category` straight from the CMS — that is the join key.
 *
 * The explicit map is the documented fallback contract for content without a
 * category, and `category` itself stays authoritative whenever it exists.
 */
export const SCENARIO_CATEGORY_TO_TOPIC: Record<string, string> = {
  daily_life: 'food',
  official: 'documents',
  work: 'work',
  health: 'health',
  housing: 'housing',
  // Travel/arrival content (the airport, the station). Added additively: before
  // this, a `travel`-category scenario resolved to no topic at all, so its
  // vocabulary was unreachable from Study and Guided Practice.
  travel: 'travel',
  // V23 (master plan §3.1): six more categories the CMS may file new modules
  // under. Each maps 1:1 to the D1 topic of the same name, so a module that
  // ships `topic: 'exam'` vocabulary is reachable from Study, Quiz and Guided
  // Practice the moment its scenarios carry `category: 'exam'`. Purely additive:
  // existing categories and their live content stay exactly where they are.
  basics: 'basics',
  exam: 'exam',
  study: 'study',
  visa: 'visa',
  services: 'services',
  trades: 'trades',
};

export function scenarioToVocabTopic(scenario: Pick<ScenarioEntity, 'id' | 'category'> | null | undefined): string {
  if (!scenario) return '';
  if (scenario.category && SCENARIO_CATEGORY_TO_TOPIC[scenario.category]) {
    return SCENARIO_CATEGORY_TO_TOPIC[scenario.category];
  }
  // Deterministic fallbacks for scenarios missing a category in the CMS.
  if (/cafe|restaurant|food|essen/i.test(scenario.id)) return 'food';
  if (/embassy|b\u00fcrgeramt|visa|doc|anzmeldung/i.test(scenario.id)) return 'documents';
  if (/job|interview|work|arbeits/i.test(scenario.id)) return 'work';
  if (/doctor|arzt|health|apotheke|pharmacy/i.test(scenario.id)) return 'health';
  if (/apartment|wohnung|housing|flat/i.test(scenario.id)) return 'housing';
  return '';
}

/**
 * D5: Study, Quiz and Guided Practice show the learner's own level ±1 — a B1
 * learner gets B0…B2 (A2/B1/B2), an A0 learner gets A0/A1 — so the topic pool
 * never buries them in rows pitched two levels away. The pool must NEVER be
 * empty because of the filter, though: when no row in the topic lives inside
 * the window (a brand-new topic, or a topic that only ships one level so far),
 * the unfiltered pool is returned instead. A smaller-but-real deck beats an
 * empty screen every time.
 *
 * The fallback returns the input rows verbatim (same array), so callers that
 * rely on the full pool when nothing matches keep their existing behaviour.
 */
export const LEVEL_RUNGS = ['A0', 'A1', 'A2', 'B1', 'B2'] as const;

function levelRank(level: string | null | undefined): number {
  const index = LEVEL_RUNGS.indexOf(String(level || '').trim().toUpperCase() as (typeof LEVEL_RUNGS)[number]);
  return index;
}

export function vocabularyWithinLevelRadius<
  T extends { level?: string | null },
>(
  vocabulary: T[],
  learnerLevel: string | null | undefined,
  radius = 1,
): T[] {
  const rows = vocabulary || [];
  const learnerRank = levelRank(learnerLevel);
  if (learnerRank === -1) return rows;
  const windowed = rows.filter((row) => {
    const rank = levelRank(row?.level);
    return rank !== -1 && Math.abs(rank - learnerRank) <= radius;
  });
  return windowed.length > 0 ? windowed : rows;
}

/**
 * V21: `part_of_speech` casing is inconsistent in live data (measured:
 * `noun` 75 / `Noun` 183, `verb` 23 / `Verb` 51, `adjective` 16 / `Adjective`
 * 29), so any grouping or filter on the raw string splits. Every reader goes
 * through this normalizer; the content fix (Title case in D1) is a separate,
 * owner-approved data patch (master plan D4).
 */
export function normalizedPartOfSpeech(raw: string | null | undefined): string {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Gate 6 (legal & trust): scenarios that roleplay a professional domain carry a
 * short Arabic disclaimer on the scenario screen — practice only, not real
 * advice. Keyed by the CMS category, so new content inherits the rule without a
 * code change; the worker's AI prompt applies the same set (see
 * cloudflare-ai-chat.js SAFETY_DISCLAIMER_CATEGORIES) so the persona and the
 * UI can never disagree about which scenarios are sensitive.
 */
export function safetyDisclaimerFor(scenario: Pick<ScenarioEntity, 'id' | 'category'> | null | undefined): string {
  if (!scenario) return '';
  const category = scenario.category || scenarioToVocabTopic(scenario);
  if (category === 'health' || /doctor|arzt|apotheke|pharmacy/i.test(scenario.id)) {
    return 'هذا تدريب للمحادثة فقط، وليس استشارة طبية. لأي قرار صحيّ راجع طبيباً أو مختصاً حقيقياً.';
  }
  if (category === 'official' || category === 'documents' || /embassy|amt|visa|aufenthalt/i.test(scenario.id)) {
    return 'هذا تدريب للمحادثة فقط، وليس استشارة قانونية أو هجرة. تحقق دائماً من المعلومات الرسمية لدى الجهات المختصة.';
  }
  if (category === 'housing' || /apartment|wohnung|contract|miet/i.test(scenario.id)) {
    return 'هذا تدريب للمحادثة فقط، وليس استشارة قانونية. راجع العقد ومختصاً قبل أي التزام.';
  }
  // V23: visa/consulate roleplays inherit the official-category rule with their
  // own wording — the stakes (immigration status) are the highest in the app.
  if (category === 'visa' || /botschaft|konsulat|visum/i.test(scenario.id)) {
    return 'هذا تدريب للمحادثة فقط، وليس استشارة هجرة أو تأشيرات. كل معلومة رسمية تحققها من السفارة أو المصدر الرسمي.';
  }
  // V23: exam-format practice must never claim to BE the official exam.
  if (category === 'exam' || /pruefung|prüf/i.test(scenario.id)) {
    return 'هذا تدريب بأسلوب الامتحانات الرسمية (DTZ، Goethe/ÖSD) وبمواضيع خاصة بنا — ليس الامتحان الرسمي نفسه ولا جهة معتمدة.';
  }
  return '';
}
