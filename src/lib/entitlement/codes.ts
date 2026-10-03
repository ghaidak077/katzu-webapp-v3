/**
 * Which server refusals are a WALL, and which are a GLITCH.
 *
 * The Worker's entitlement check answers with three different codes and they
 * must never be confused:
 *
 *  - `PAYWALL_REQUIRED`        — the level is beyond the free tier. A wall.
 *  - `FREE_QUOTA_EXHAUSTED`    — the three free conversations are used up. A wall.
 *  - `QUOTA_UNAVAILABLE`       — the Worker could not read the ledger (503). A
 *                                glitch: the allowance may well still be there, so
 *                                retrying is the honest action.
 *
 * V31 measured what happened when only the first code was recognised: a free
 * learner on their fourth conversation got `{kind: 'ai_service', retryable:
 * true}` — a generic "try again" card they could retry forever, because no
 * retry can ever succeed once the trial is spent. The paywall was one screen
 * away and never appeared.
 *
 * One set, imported by the conversation hook, the state machine and the writing
 * screen (which already had its own correct copy), so the three surfaces can
 * never disagree about the same server answer again.
 */

/** A refusal the learner cannot retry past — offer the upgrade instead. */
export const ENTITLEMENT_WALL_CODES: ReadonlySet<string> = new Set([
  'PAYWALL_REQUIRED',
  'FREE_QUOTA_EXHAUSTED',
]);

/** A refusal that is the server's problem, not the learner's — retry is honest. */
export const ENTITLEMENT_UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  'QUOTA_UNAVAILABLE',
]);

export function isEntitlementWall(code: string | undefined | null): boolean {
  return !!code && ENTITLEMENT_WALL_CODES.has(code);
}

/** The trial is spent or the level is locked: the app must show the paywall. */
export function isEntitlementUnavailable(code: string | undefined | null): boolean {
  return !!code && ENTITLEMENT_UNAVAILABLE_CODES.has(code);
}