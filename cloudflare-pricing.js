/**
 * Katzu pricing — one table, one resolver, no secrets.
 *
 * Everything a learner is charged is read from `PRICES` below and nowhere else,
 * so the owner edits prices in one place without touching code. Region is
 * resolved SERVER-SIDE from the Cloudflare country header: a learner controls
 * the headers they send, so the client never picks a group and never displays a
 * price it decided itself — it renders whatever `/pricing` returns.
 *
 * **PRICES ARE UNPROVEN.** They are a planning guess by the owner, not a
 * validated price list. Nothing here has been tested against a real purchase.
 */

/** Countries priced as `special`. Everything else, including unknown and missing, is `standard`. */
export const SPECIAL_COUNTRIES = ['SY', 'EG', 'IQ', 'PS'];

/**
 * Price per product per region group, in euro cents so no float arithmetic can
 * ever move a price by a cent. `passByCell` overrides `pass90` when an
 * experiment bucket is assigned.
 */
export const PRICES = {
  standard: { pass90: 2900, monthly: 1299, mock: 900 },
  special: { pass90: 1200, monthly: 500, mock: 300 },
};

/**
 * Experiment cells for the Exam Pass price, by index. The owner sets these to
 * compare 19 / 29 / 39 (standard) and 9 / 12 / 19 (special). Kept separate from
 * `PRICES` so turning the experiment off is deleting one row, not editing three.
 */
export const PASS_CELLS = {
  standard: [1900, 2900, 3900],
  special: [900, 1200, 1900],
};

/** Products the app is allowed to sell. No annual, no lifetime — deliberately. */
export const PRODUCTS = ['pass90', 'monthly', 'mock'];

/** A stable, cheap hash. FNV-1a over the user id; not for security, only for bucketing. */
function stableHash(value) {
  let hash = 0x811c9dc5;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // Math.imul keeps the multiply in 32-bit space on every engine.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Which group a country belongs to. UNKNOWN MEANS STANDARD, never special: the
 * safe direction is the one where we might under-charge, and an unrecognised or
 * spoofed header must not be able to reach the cheaper group.
 */
export function regionGroupFromCountry(country) {
  const code = String(country ?? '').trim().toUpperCase();
  return SPECIAL_COUNTRIES.includes(code) ? 'special' : 'standard';
}

/**
 * Reads the region from a request. The Cloudflare header is `CF-IPCountry`; it
 * is absent for local dev and for anything that did not come through Cloudflare,
 * and both cases resolve to `standard`.
 */
export function regionGroupFromRequest(request) {
  const header = request?.headers?.get?.('CF-IPCountry');
  return regionGroupFromCountry(header);
}

/**
 * Which price cell a learner sees. Deterministic on the account id, so the same
 * learner always gets the same price across sessions and devices — a bucket that
 * moved between page loads would make an A/B result meaningless.
 */
export function experimentBucket(accountId, cellCount = 3) {
  if (!Number.isInteger(cellCount) || cellCount < 1) return 0;
  return stableHash(`pass:${accountId ?? ''}`) % cellCount;
}

/**
 * The price one learner pays. `cell` of null (or a disabled experiment) falls
 * back to the plain `pass90` price, so the experiment can be switched off without
 * changing any other number.
 */
export function priceFor({ group = 'standard', product = 'pass90', cell = null } = {}) {
  const table = PRICES[group] || PRICES.standard;
  const cells = PASS_CELLS[group] || PASS_CELLS.standard;
  if (product === 'pass90' && Number.isInteger(cell) && cell >= 0 && cell < cells.length) {
    return { product, amountCents: cells[cell], currency: 'EUR', group, cell, unproven: true };
  }
  const amountCents = table[product];
  if (!Number.isInteger(amountCents)) return null;
  return { product, amountCents, currency: 'EUR', group, cell: null, unproven: true };
}

/** The whole catalogue for one learner, so the paywall renders in one call. */
export function catalogueFor({ group = 'standard', cell = null } = {}) {
  const rows = PRODUCTS.map((product) => priceFor({ group, product, cell })).filter(Boolean);
  return { group, cell, currency: 'EUR', unproven: true, prices: rows };
}

/**
 * Whether a code was minted for one region group and redeemed by a learner in
 * another. Redemption is NEVER blocked on this — a code is code, and a learner
 * who travelled or moved must still get what they paid for. It is recorded as a
 * metric so the owner can see whether the region table is aimed correctly.
 */
export function isRegionMismatch(codeGroup, learnerGroup) {
  if (!codeGroup) return false;
  return codeGroup !== (learnerGroup || 'standard');
}