import type { CEFRLevel, TurnAiResponse } from '@/types/models';
import { logError, logEvent } from '@/lib/utils/diagnostics';

/**
 * Shape-check and map a `/ai/turn` body.
 *
 * Two valid shapes exist:
 *  - a legacy/exam turn: `reply_de`, `reply_ar` and an `evaluation`;
 *  - a scripted turn: `reply_de`, `reply_ar` and `script_turn`, with no
 *    evaluation — the script decides what was answered and the local checker
 *    owns corrections.
 *
 * Anything else is rejected rather than rendered: a half-parsed reply is how a
 * learner ends up with an empty bubble and no correction.
 */
export function mapTurnAiResponse(data: any, level: CEFRLevel): TurnAiResponse {
  const evalData = data?.evaluation;
  const script = data?.script_turn && typeof data.script_turn === 'object' ? data.script_turn : null;
  const hasScriptTurn =
    !!script && typeof script.reply_de === 'string' && typeof script.reply_ar === 'string';
  const hasEvaluation = !!evalData && typeof evalData.is_correct === 'boolean';

  if (
    !data ||
    typeof (data.reply_de ?? script?.reply_de) !== 'string' ||
    typeof (data.reply_ar ?? script?.reply_ar) !== 'string' ||
    (!hasEvaluation && !hasScriptTurn)
  ) {
    const error: any = new Error('تعذر التحقق من رد المحادثة. لم يتم احتساب هذه الجملة.');
    error.code = 'INVALID_AI_RESPONSE';
    error.status = 502;
    logError('ai/turn', 'Response failed schema validation (missing reply_de/reply_ar/evaluation|script_turn)');
    throw error;
  }

  logEvent('ai/turn', `OK (is_correct=${evalData?.is_correct ?? 'script'}, level=${level})`);

  return {
    germanReply: data.reply_de ?? script.reply_de,
    arabicTranslation: data.reply_ar ?? script.reply_ar,
    isCorrect: evalData?.is_correct,
    mistakeSegment: evalData?.original_mistake || '',
    correctedSegment: evalData?.corrected_german || '',
    grammarRule: evalData?.grammar_rule || '',
    explanationAr: evalData?.explanation_ar || '',
    roastComment: evalData?.roast_comment || '',
    positiveNoteAr: evalData?.positive_note_ar || '',
    scriptTurn: hasScriptTurn
      ? {
          replyDe: script.reply_de,
          replyAr: script.reply_ar,
          matched: typeof script.matched === 'boolean' ? script.matched : undefined,
          slot: typeof script.slot === 'string' ? script.slot : undefined,
          value: typeof script.value === 'string' ? script.value : undefined,
          hintDe: typeof script.hint_de === 'string' ? script.hint_de : undefined,
          hintAr: typeof script.hint_ar === 'string' ? script.hint_ar : undefined,
        }
      : undefined,
    hints: Array.isArray(data.hints)
      ? data.hints
          .filter((h: any) => h && typeof h.german === 'string' && h.german.trim())
          .map((h: any) => ({ german: h.german, arabic: h.translation_ar || '' }))
      : [],
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
