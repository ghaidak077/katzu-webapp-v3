/**
 * Code redemption: exactly-once, and cheap to brute-force only if we make it so.
 *
 * WHY A MODULE
 * Two rules that must not drift into the handler:
 *
 * 1. "Already redeemed" and "the ledger was unreachable" are DIFFERENT answers.
 *    The ledger claim is a PRIMARY KEY insert, so its failure normally means the
 *    code is spent. But a D1 outage fails the same insert, and telling a paying
 *    learner that their code is used up when it is still spendable is the worst
 *    possible lie on the screen where they are handing over money. Only a
 *    constraint violation means spent; everything else is `ledger_unavailable`,
 *    which retries cleanly.
 *
 * 2. Brute force. A code is `DE-<months>M-<nonce>-<sig>`, and the signature is
 *    HMAC-SHA256 over the rest, so guessing is already infeasible — but the
 *    handler is the cheapest thing on the internet to hammer, and an attacker
 *    who finds a cheap oracle can tell "wrong signature" from "wrong shape".
 *    So failures escalate: a few tries cost nothing, then the account is locked
 *    out for a while, and the lockout time grows with the attempt count.
 *
 * Everything here is pure so it can be tested without a Worker; the KV glue
 * lives beside the handler and is best-effort by design. A KV outage must never
 * lock a real learner out of a code they paid for, so the failure mode is open.
 */

/** Failed attempts before an account is locked out. */
export const CODE_ATTEMPT_THRESHOLD = 5;
/** Shortest lockout, doubled per extra attempt above the threshold. */
export const CODE_LOCKOUT_BASE_MS = 5 * 60 * 1000;
/** Never lock for longer than this, however many attempts there were. */
export const CODE_LOCKOUT_MAX_MS = 60 * 60 * 1000;

/**
 * Does this D1 error mean "the primary key already exists", i.e. the code really
 * is spent? Cloudflare reports a UNIQUE constraint as `SQLITE_CONSTRAINT`, and
 * `UNIQUE constraint failed` is the common human-facing rendering. Anything else
 * — a missing table, a timeout, a network failure — is NOT proof of spending.
 */
export function isDuplicateCodeError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (!message) return false;
  return (
    message.includes("unique constraint failed") ||
    message.includes("sqlite_constraint") ||
    message.includes("constraint failed") ||
    message.includes("primary key")
  );
}

/** Lockout length for a given number of failed attempts. 0 means "not yet". */
export function lockoutMsFor(attempts, options = {}) {
  const threshold = options.threshold ?? CODE_ATTEMPT_THRESHOLD;
  const base = options.baseMs ?? CODE_LOCKOUT_BASE_MS;
  const max = options.maxMs ?? CODE_LOCKOUT_MAX_MS;
  const n = Number(attempts) || 0;
  if (n < threshold) return 0;
  const over = n - threshold;
  // Cap the exponent before shifting: a huge attempt count must not produce
  // Infinity or a negative number once it exceeds the cap.
  const factor = Math.pow(2, Math.min(over, 20));
  return Math.min(base * factor, max);
}

/**
 * The abuse decision for one redemption attempt, given the account's record.
 *
 * `attempts` is the count of consecutive failures already on record; a successful
 * redemption clears it (see `resetCodeAttempts`).
 */
export function decideCodeAttempt({ attempts = 0, lockedUntil = 0, now = Date.now(), options = {} } = {}) {
  const lockedFor = lockoutMsFor(attempts, options);
  const until = Number(lockedUntil) || 0;
  if (until > now) {
    return {
      allowed: false,
      reason: "locked_out",
      retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)),
      nextAttempts: attempts,
    };
  }
  return {
    allowed: true,
    reason: "ok",
    // The lockout that WOULD apply on the next failure, so the caller can store
    // it in the same write it already makes.
    lockoutMsOnFailure: lockedFor > 0 ? lockedFor : lockoutMsFor(Number(attempts) + 1, options),
    nextAttempts: Number(attempts) + 1,
  };
}

/** Arabic messages. The client shows these verbatim; keep them first-person. */
export const CODE_LOCKOUT_MESSAGE =
  "\u0645\u0646 \u062a\u0642\u0627\u0628\u0644 \u0623\u062d\u062c\u0627\u0632 \u0643\u062b\u064a\u0631 \u0645\u062a\u0639\u062f\u062f\u0629. \u0627\u0646\u062a\u0638\u0631 \u0642\u0644\u064a\u0644\u0627 \u0648\u0623\u0639\u062f \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629.";
export const CODE_LEDGER_UNAVAILABLE_MESSAGE =
  "\u0644\u0645 \u0646\u0633\u062a\u0637\u0631 \u062a\u0623\u0643\u064a\u062f \u0627\u0644\u062a\u062d\u0642\u064a\u0642 \u0645\u0646 \u0627\u0644\u062e\u0627\u062f\u0645\u0629 \u0645\u0646 \u0627\u0644\u0628\u064a\u0626\u0629\u060c \u0644\u0627 \u0645\u062b\u0627\u0644\u064b \u0643\u062a\u0627\u0641\u062a\u0643. \u0623\u0639\u062f \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0628\u0639\u062f \u062b\u0648\u0627\u0646\u064d \u062f\u0642\u064a\u0642\u0629.";

/**
 * Redis-free attempt bookkeeping in KV. Best-effort: a KV error means "no
 * record", which reads as zero attempts and therefore never locks anyone out.
 */
export async function readCodeAttempts(env, accountId) {
  if (!env?.REDEEMED_CODES) return { attempts: 0, lockedUntil: 0 };
  try {
    const raw = await env.REDEEMED_CODES.get(`codefail:${accountId}`);
    if (!raw) return { attempts: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw);
    return {
      attempts: Number(parsed?.attempts) || 0,
      lockedUntil: Number(parsed?.lockedUntil) || 0,
    };
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}

/** Record one failure and arm the lockout the decision predicted. */
export async function noteCodeFailure(env, accountId, decision) {
  if (!env?.REDEEMED_CODES || !decision) return;
  const until = decision.lockoutMsOnFailure ? Date.now() + decision.lockoutMsOnFailure : 0;
  try {
    await env.REDEEMED_CODES.put(
      `codefail:${accountId}`,
      JSON.stringify({ attempts: decision.nextAttempts, lockedUntil: until })
    );
  } catch {
    // Abuse control, not correctness: a learner who paid keeps their code.
  }
}

/** A successful redemption clears the record, so a typo does not accumulate. */
export async function resetCodeAttempts(env, accountId) {
  if (!env?.REDEEMED_CODES) return;
  try {
    await env.REDEEMED_CODES.delete(`codefail:${accountId}`);
  } catch {
    // Same reasoning as above.
  }
}