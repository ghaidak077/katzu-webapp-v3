/**
 * The scenario opener selector — and nothing else.
 *
 * WHAT USED TO LIVE HERE (deleted 2026-11-10)
 * This module held an app-authored persona script: per-level «re-ask» lines
 * («Hallo! Bitte sagen Sie etwas mehr.»), per-level acknowledgement prefixes
 * («Verstanden. », «Alles klar. »), a fixed trailing-question table
 * («Und Sie?», «Und was möchten Sie?») and the two guards that swapped a
 * model reply for those lines. It also held the bare-greeting and off-topic
 * detectors that fed them. Every one of those sentences was a persona bubble the
 * model never wrote.
 *
 * THE RULE NOW
 * A persona bubble is either the shipped opener (stored content, allowed) or a
 * real model reply. There is no authored or offline fallback for persona
 * replies: when the model cannot answer, the learner keeps their sentence and
 * gets a clear error — never a template line. `tests/noAuthoredPersona.test.ts`
 * fails if such a line ever comes back.
 *
 * `openerForLevel` survives because it selects stored scenario content (the
 * `initial_message_*` columns). `tests/openerParity.test.ts` keeps it equal to
 * the client's `src/lib/conversation/opener.ts`.
 */

/**
 * Picks the scenario's stored opener for a level, exactly as the live screen
 * does (`src/lib/conversation/opener.ts` — the worker is plain JS and cannot
 * import TS, `tests/openerParity.test.ts` keeps the two ladders equal).
 */
export function openerForLevel(openers, level = 'A1') {
  const o = openers && typeof openers === 'object' ? openers : {};
  const pick = (...keys) => {
    for (const key of keys) {
      const value = o[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    return '';
  };
  switch (level) {
    case 'A0': return pick('a0', 'a1', 'a2', 'b1', 'b2');
    case 'A1': return pick('a1', 'a0', 'a2', 'b1', 'b2');
    case 'A2': return pick('a2', 'a1', 'b1', 'b2');
    case 'B1': return pick('b1', 'a2', 'b2', 'a1');
    case 'B2': return pick('b2', 'b1', 'a2', 'a1');
    default: return pick('a1');
  }
}
