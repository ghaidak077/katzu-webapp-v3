/**
 * How many AI calls a session actually made — COUNTS ONLY (V30).
 *
 * The point of the V30 work was that the opener and a tapped word no longer need a
 * model at all, and "we removed the call" is only believable if it is counted. This
 * meter sits at the client's four AI call sites (`/ai/turn`, `/ai/translate`,
 * `/ai/hints`, `/ai/lexeme`) and keeps per-kina tallies plus a session total.
 *
 * Deliberately NOT analytics: no text, no words, no ids, no user, nothing sent
 * anywhere. It is a number in memory and an optional console line, so it measures
 * the claim without collecting anything about the learner. `window.__kzAiCalls`
 * exposes the totals read-only for the e2e assertion that the opener costs zero.
 */

export type AiCallKind = 'turn' | 'translate' | 'hints' | 'lexeme';

const counts: Record<AiCallKind, number> = { turn: 0, translate: 0, hints: 0, lexeme: 0 };
let openedAt = Date.now();

function publish(): void {
  if (typeof window === 'undefined') return;
  try {
    (window as unknown as { __kzAiCalls?: unknown }).__kzAiCalls = { ...counts, total: total(), since: openedAt };
  } catch {
    /* a read-only window must never break a request */
  }
}

export function recordAiCall(kind: AiCallKind): void {
  counts[kind] += 1;
  publish();
}

export function total(): number {
  return counts.turn + counts.translate + counts.hints + counts.lexeme;
}

export function aiCallTotals(): { counts: Record<AiCallKind, number>; total: number; sinceMs: number } {
  return { counts: { ...counts }, total: total(), sinceMs: Date.now() - openedAt };
}

export function resetAiCallMeter(): void {
  counts.turn = 0;
  counts.translate = 0;
  counts.hints = 0;
  counts.lexeme = 0;
  openedAt = Date.now();
  publish();
}

/** One structured line per session end — counts only, never learner text. */
export function logAiCallTotals(context: string): void {
  const totals = aiCallTotals();
  try {
    console.info('[ai-calls]', JSON.stringify({ context, ...totals.counts, total: totals.total }));
  } catch {
    /* logging must never fail a session */
  }
}
