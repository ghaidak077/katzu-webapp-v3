/**
 * Arabic labels for the conversational move each hint makes.
 *
 * The worker tags every hint with one of a closed set of intents
 * (`cloudflare-hints.js`); the labels live here so the same intent always reads
 * the same way in the hint sheet and nothing is hardcoded in the AI prompt.
 */
export const HINT_INTENT_LABELS: Record<string, string> = {
  answer: 'إجابة مباشرة',
  agree: 'اتفاق',
  disagree: 'اعتراض مهذّب',
  add_detail: 'تفصيل إضافي',
  ask_followup: 'سؤال متابعة',
  clarify: 'استفسار / لم أفهم',
  express_uncertainty: 'عدم تأكد',
  deflect: 'تجنّب مهذّب',
};

export function hintIntentLabel(intent?: string | null): string | null {
  if (!intent) return null;
  return HINT_INTENT_LABELS[intent] || null;
}
