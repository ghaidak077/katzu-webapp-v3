interface SubscriptionLike {
  isSubscriptionActive?: boolean;
  subscriptionExpiresAt?: string | null;
}

/**
 * Expiry-aware Pro status. The local flag alone can go stale (server says
 * inactive, or the expiry date has passed) — every gate should consult this
 * instead of the raw flag so an expired account never keeps Pro powers.
 */
export function isProEffective(
  user: SubscriptionLike | null | undefined
): boolean {
  if (!user?.isSubscriptionActive) return false;
  if (!user.subscriptionExpiresAt) return true;
  const expiry = new Date(user.subscriptionExpiresAt).getTime();
  // Corrupt/unparsable expiry: don't punish the user locally — keep the flag
  // and let the server (authoritative) decide at the next check.
  if (!Number.isFinite(expiry)) return true;
  return expiry > Date.now();
}
