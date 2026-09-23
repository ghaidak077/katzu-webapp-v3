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
