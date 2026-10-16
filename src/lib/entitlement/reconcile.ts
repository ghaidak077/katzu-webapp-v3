/**
 * B2: what the app should believe about a learner's subscription, after asking
 * the server.
 *
 * The bug this closes is not a wrong answer, it is a question the app never asked
 * twice. `/check-status` was called from exactly two places — sign-in and the
 * redemption screen — so the local Pro flag was whatever the last of those wrote.
 * A learner who paid on their phone and opened the app on a tablet stayed free
 * (the reverse of a refund, and just as wrong), and a subscription that the
 * server had already stopped honouring kept unlocking Pro until the stored date
 * happened to pass. Both are the same defect: entitlement was set once and never
 * reconciled.
 *
 * Two rules make the reconciliation safe to run on every open:
 *
 * 1. **An unanswered question changes nothing.** `checked` is true only when the
 *    server actually answered. Offline, a captive portal or a 500 must leave the
 *    local row exactly as it was — a network failure is not evidence of a refund.
 * 2. **Silence about the expiry date keeps the known one.** When the server says
 *    the subscription is active but sends no date, the old date is preserved
 *    rather than overwritten with null; a known expiry is what lets the app warn
 *    before the month ends (B3) instead of discovering it afterwards.
 *
 * The function returns a patch only when something really differs, so a learner
 * whose state already agrees costs no write and no re-render.
 */

export interface ServerEntitlement {
  /** The server's answer: does this account have a live subscription? */
  active: boolean;
  /**
   * Whether the server was actually asked and answered. `false` means the app is
   * looking at its own stored value, which can never correct anything.
   */
  checked: boolean;
  expiresAt?: string | null;
}

export interface LocalEntitlement {
  isSubscriptionActive?: boolean | null;
  subscriptionExpiresAt?: string | null;
}

/** The fields to write, or `null` when the local row is already right. */
export type EntitlementPatch = {
  isSubscriptionActive?: boolean;
  subscriptionExpiresAt?: string | null;
} | null;

export function reconcileEntitlement(
  status: ServerEntitlement | null | undefined,
  local: LocalEntitlement | null | undefined,
): EntitlementPatch {
  if (!status || !status.checked) return null;

  const patch: NonNullable<EntitlementPatch> = {};
  const wasActive = local?.isSubscriptionActive === true;
  const storedExpiry = local?.subscriptionExpiresAt ?? null;

  if (wasActive !== status.active) patch.isSubscriptionActive = status.active;

  if (status.active) {
    // A date we were just told about is better than the one we kept; no date at
    // all means the old one stands.
    const serverExpiry = status.expiresAt ?? null;
    if (serverExpiry && serverExpiry !== storedExpiry) patch.subscriptionExpiresAt = serverExpiry;
  }
  // On the inactive path `subscriptionExpiresAt` is deliberately left alone: it
  // is the record of when the subscription ended, and B3 reads it to say so.

  return Object.keys(patch).length ? patch : null;
}
