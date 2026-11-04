import type { ChatMessage } from '@/types/models';

/**
 * One "bad reply" report is exactly one exchange: the learner sentence that
 * prompted a Katzu reply, plus that reply. Nothing else from the transcript is
 * sent — not the opener, not neighbouring turns, not the learner's translation
 * preference or hint usage.
 *
 * The pairing is explicit because the report button sits on Katzu's bubble but
 * the text belongs to the learner's previous message. A reply with no learner
 * sentence before it (the scenario opener) therefore cannot be reported: there
 * is no exchange, and inventing one would send text the learner never wrote.
 */
export interface ConversationReportExchange {
  learnerText: string;
  replyText: string;
  /** Index of the learner turn in the transcript, for ordering only. */
  turnIndex: number;
}

export function buildReportExchange(
  messages: ChatMessage[],
  replyId: string,
): ConversationReportExchange | null {
  const replyIndex = messages.findIndex((message) => message.id === replyId);
  if (replyIndex < 1) return null;
  const reply = messages[replyIndex];
  if (reply.sender !== 'KATZU') return null;

  for (let index = replyIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.sender !== 'USER') continue;
    if (candidate.sendFailed) return null;
    const learnerText = candidate.germanText.trim();
    const replyText = reply.germanText.trim();
    if (!learnerText || !replyText) return null;
    return { learnerText, replyText, turnIndex: index };
  }
  return null;
}
