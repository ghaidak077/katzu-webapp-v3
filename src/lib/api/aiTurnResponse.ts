import type { CEFRLevel, ContextualHint, TurnAiResponse } from '@/types/models';
import { logError, logEvent } from '@/lib/utils/diagnostics';

/**
 * Shape-check and map a `/ai/turn` body.
 *
 * Two valid shapes exist:
 *  - a roleplay turn (every ordinary conversation, all 49 scenarios): `reply_de`,
 *    `reply_ar` and the roleplay fields (`objectives_done`, `close`, `hint_*`);
 *  - a mock-exam turn: `reply_de`, `reply_ar` and an `evaluation`.
 *
 * Anything else is rejected rather than rendered: a half-parsed reply is how a
 * learner ends up with an empty bubble and no correction. The caller keeps the
 * learner's sentence in the composer and offers «أعد المحاولة».
 */
export function mapTurnAiResponse(data: any, level: CEFRLevel): TurnAiResponse {
  const evalData = data?.evaluation;
  const hasEvaluation = !!evalData && typeof evalData.is_correct === 'boolean';
  const hasRoleplay =
    Array.isArray(data?.objectives_done) &&
    Number.isFinite(Number(data?.objectives_total)) &&
    typeof data?.reply_de === 'string' &&
    typeof data?.reply_ar === 'string';

  if (!data || typeof data.reply_de !== 'string' || typeof data.reply_ar !== 'string' || (!hasEvaluation && !hasRoleplay)) {
    const error: any = new Error('تعذر التحقق من رد المحادثة. لم يتم احتساب هذه الجملة.');
    error.code = 'INVALID_AI_RESPONSE';
    error.status = 502;
    logError('ai/turn', 'Response failed schema validation (missing reply_de/reply_ar/roleplay|evaluation)');
    throw error;
  }

  const hintDe = typeof data.hint_de === 'string' ? data.hint_de.trim() : '';
  const hintAr = typeof data.hint_ar === 'string' ? data.hint_ar.trim() : '';
  const hint: ContextualHint | null = hintDe ? { german: hintDe, arabic: hintAr } : null;

  logEvent(
    'ai/turn',
    `OK (${hasRoleplay ? `roleplay ${Number(data.objectives_done.length)}/${Number(data.objectives_total)}${data.close ? ' close' : ''}` : `is_correct=${evalData?.is_correct}`}, level=${level})`,
  );

  return {
    germanReply: data.reply_de,
    arabicTranslation: data.reply_ar,
    isCorrect: evalData?.is_correct,
    mistakeSegment: evalData?.original_mistake || '',
    correctedSegment: evalData?.corrected_german || '',
    grammarRule: evalData?.grammar_rule || '',
    explanationAr: evalData?.explanation_ar || '',
    roastComment: evalData?.roast_comment || '',
    positiveNoteAr: evalData?.positive_note_ar || '',
    roleplay: hasRoleplay
      ? {
          understoodDe: typeof data.understood_de === 'string' ? data.understood_de : '',
          fixReasonAr: typeof data.fix_reason_ar === 'string' ? data.fix_reason_ar : '',
          objectivesDone: data.objectives_done.filter((id: any) => typeof id === 'string').slice(0, 12),
          objectivesTotal: Math.max(0, Math.min(12, Number(data.objectives_total) || 0)),
          close: data.close === true,
          hint: hint && /[a-zA-ZäöüÄÖÜß]/.test(hint.german) ? hint : null,
        }
      : undefined,
    hints: hint ? [hint] : [],
    followupAr: typeof data.followup_ar === 'string' ? data.followup_ar : '',
    grammarId:
      typeof evalData?.grammar_id === 'string' && /^[a-z0-9_]{1,80}$/i.test(evalData.grammar_id)
        ? evalData.grammar_id
        : undefined,
    grammarReference:
      data.grammar_reference &&
      typeof data.grammar_reference.id === 'string' &&
      data.grammar_reference.id === evalData?.grammar_id &&
      /^[a-z0-9_]{1,80}$/i.test(data.grammar_reference.id)
        ? {
            id: data.grammar_reference.id,
            titleAr:
              typeof data.grammar_reference.title_ar === 'string'
                ? data.grammar_reference.title_ar.slice(0, 160)
                : '',
            ruleAr:
              typeof data.grammar_reference.rule_ar === 'string'
                ? data.grammar_reference.rule_ar.slice(0, 320)
                : '',
            ruleDe:
              typeof data.grammar_reference.rule_de === 'string'
                ? data.grammar_reference.rule_de.slice(0, 320)
                : '',
            exampleDe:
              typeof data.grammar_reference.example_de === 'string'
                ? data.grammar_reference.example_de.slice(0, 240)
                : '',
          }
        : undefined,
  };
}
