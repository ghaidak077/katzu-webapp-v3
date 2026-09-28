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
  return '';
}
